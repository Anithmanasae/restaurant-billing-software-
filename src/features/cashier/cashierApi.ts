/**
 * Cashier billing writes — the money path. All amounts are integer paise.
 *
 * Every total is derived from the ORDER's line items via `computeBill`; the
 * client never trusts a total it was handed. Firestore rules independently
 * re-validate ranges, GST consistency, immutability of paid bills, and that
 * only cashier/admin can settle.
 */
import {
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import { fetchMergedSecondaryIds } from "@/features/tables/tablesApi";
import { computeBill, type BillLine } from "@/lib/money";
import { dayKey } from "@/lib/date";
import type {
  Bill,
  DailySummary,
  Order,
  PaymentMode,
} from "@/types/models";

/** Non-voided order lines as bill inputs. */
function linesOf(order: Order): BillLine[] {
  return order.items
    .filter((i) => !i.voided)
    .map((i) => ({ price: i.price, qty: i.qty, voided: false }));
}

/**
 * Billing guard. Dine-in is "food first, pay after": refuse to bill unless
 * every line was sent to the kitchen and every KOT ticket for the order is
 * `completed`. Takeaway/delivery is pay-first at the counter, so the ticket
 * only has to EXIST (kitchen has the order) — it may still be preparing.
 * The cashier UI already hides unbillable orders; this guard catches anything
 * that slips past it (stale snapshot, other call sites).
 */
async function assertKitchenDone(order: Order): Promise<void> {
  const unsent = order.items.some(
    (i) => !i.voided && i.qty > 0 && i.kotStatus === "pending"
  );
  if (unsent) {
    throw new Error(
      "Some items haven't been sent to the kitchen yet. Send the KOT first."
    );
  }
  const kotsSnap = await getDocs(
    query(paths.kots(), where("orderId", "==", order.id))
  );
  if (kotsSnap.empty) {
    throw new Error(
      "Nothing has been sent to the kitchen for this order yet."
    );
  }
  if (order.orderType !== "dine-in") return; // pay-first: bill while preparing
  const unfinished = kotsSnap.docs.some((d) => d.data().status !== "completed");
  if (unfinished) {
    throw new Error(
      "The kitchen is still preparing this order. Bill it once all tickets are completed."
    );
  }
}

/** counters/billNumber starts here, so the first printed bill is 000101. */
const BILL_NUMBER_SEED = 100;

/**
 * Create a finalized bill for an open order (cashier-initiated), or return the
 * existing bill id if the order already has one. Marks the order `billed` and
 * the table `billed` so the floor view reflects it live.
 *
 * Runs as a single transaction that also mints the sequential human-facing
 * bill number from `counters/billNumber` (same pattern as sendKot's ticket
 * counter). The order is re-read inside the transaction so a concurrent
 * generate can't create two bills — or burn two numbers — for one order.
 *
 * Only runs for kitchen-done orders — see `assertKitchenDone`.
 */
export async function generateBill(
  order: Order,
  cashierUid: string,
  tableLabel: string,
  gstEnabled = true
): Promise<string> {
  if (order.billId) return order.billId;

  await assertKitchenDone(order);

  const billRef = doc(paths.bills());
  const counterRef = paths.counter("billNumber");

  return runTransaction(db, async (tx) => {
    // ---- reads first (transaction requirement) ----
    const orderSnap = await tx.get(paths.order(order.id));
    if (!orderSnap.exists()) throw new Error(`Order ${order.id} not found`);
    const fresh = orderSnap.data();
    if (fresh.billId) return fresh.billId;

    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists()
      ? counterSnap.data().value
      : BILL_NUMBER_SEED;
    const billNumber = current + 1;

    const totals = computeBill(linesOf(fresh), 0, gstEnabled);

    // ---- writes ----
    tx.set(counterRef, { value: billNumber });
    tx.set(billRef, {
      billNumber,
      orderId: order.id,
      tableId: fresh.tableId,
      tableLabel,
      ...totals,
      status: "finalized",
      paymentMode: null,
      requestedBy: fresh.waiterId,
      cashierId: cashierUid,
      printedCount: 0,
      createdAt: serverTimestamp(),
      paidAt: null,
    } as unknown as Bill);
    tx.update(paths.order(order.id), {
      billId: billRef.id,
      status: "billed",
      updatedAt: serverTimestamp(),
    });
    if (fresh.tableId) {
      tx.update(paths.table(fresh.tableId), {
        status: "billed",
        updatedAt: serverTimestamp(),
      });
    }
    return billRef.id;
  });
}

/**
 * Settle a bill: mark paid, close the order, free the table, and roll the sale
 * into today's summary — atomically. After this the bill is immutable (rules).
 */
export async function settleBill(
  bill: Bill,
  order: Order,
  paymentMode: PaymentMode
): Promise<void> {
  const summaryRef = paths.dailySummary(dayKey());

  // Tables merged into the billed table must be freed together with it,
  // or they'd stay "occupied" on the floor forever after payment.
  const mergedIds = order.tableId
    ? await fetchMergedSecondaryIds(order.tableId)
    : [];

  await runTransaction(db, async (tx) => {
    // ---- reads first (transaction requirement) ----
    const summarySnap = await tx.get(summaryRef);
    const prev = summarySnap.exists()
      ? (summarySnap.data() as DailySummary)
      : null;

    // ---- derive updated summary from the order lines ----
    const emptyModes = { cash: 0, upi: 0, card: 0 };
    const emptySources = { "dine-in": 0, takeaway: 0, delivery: 0 };
    const byPaymentMode = { ...emptyModes, ...(prev?.byPaymentMode ?? {}) };
    const bySource = { ...emptySources, ...(prev?.bySource ?? {}) };
    const itemSales: DailySummary["itemSales"] = { ...(prev?.itemSales ?? {}) };

    byPaymentMode[paymentMode] += bill.grandTotal;
    bySource[order.orderType] += bill.grandTotal;

    let voidedItemCount = prev?.voidedItemCount ?? 0;
    for (const line of order.items) {
      if (line.voided) {
        voidedItemCount += 1;
        continue;
      }
      const entry = itemSales[line.menuItemId] ?? {
        name: line.name,
        qty: 0,
        revenue: 0,
      };
      entry.qty += line.qty;
      entry.revenue += line.price * line.qty;
      itemSales[line.menuItemId] = entry;
    }

    const nextSummary: DailySummary = {
      id: dayKey(),
      date: dayKey(),
      totalRevenue: (prev?.totalRevenue ?? 0) + bill.grandTotal,
      orderCount: (prev?.orderCount ?? 0) + 1,
      voidedItemCount,
      byPaymentMode,
      bySource,
      itemSales,
      updatedAt: serverTimestamp() as unknown as DailySummary["updatedAt"],
    };

    // ---- writes ----
    tx.set(summaryRef, nextSummary);
    tx.update(paths.bill(bill.id), {
      status: "paid",
      paymentMode,
      paidAt: serverTimestamp(),
    });
    tx.update(paths.order(order.id), {
      status: "closed",
      updatedAt: serverTimestamp(),
    });
    if (order.tableId) {
      for (const id of [order.tableId, ...mergedIds]) {
        tx.update(paths.table(id), {
          status: "available",
          currentOrderId: null,
          mergedInto: null,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });
}

/**
 * Cancel (void) an unpaid bill — the cashier's escape hatch for a stuck bill
 * (customer walked out, bill raised by mistake). Nothing is deleted: the bill
 * keeps its sequential number and stays in Firestore as `void` with who/when,
 * so the audit trail has no gaps. In the same transaction the order is
 * cancelled and the table freed — the teardown mirror of `settleBill`'s happy
 * path. Paid bills can never be voided (rules also freeze them).
 */
export async function cancelBill(
  billId: string,
  cashierUid: string
): Promise<void> {
  // Free any tables merged into the billed table along with it (pre-read:
  // transactions can't run queries). Best-effort — the tx re-reads the bill.
  const preBill = await getDoc(paths.bill(billId));
  const preTableId = preBill.exists() ? preBill.data().tableId : null;
  const mergedIds = preTableId ? await fetchMergedSecondaryIds(preTableId) : [];

  await runTransaction(db, async (tx) => {
    // ---- reads first (transaction requirement) ----
    const billSnap = await tx.get(paths.bill(billId));
    if (!billSnap.exists()) throw new Error("Bill not found.");
    const bill = billSnap.data();
    if (bill.status === "paid") {
      throw new Error(
        "This bill is already settled — paid bills can't be cancelled."
      );
    }
    if (bill.status === "void") return; // another device cancelled it already

    const orderSnap = await tx.get(paths.order(bill.orderId));

    // ---- writes ----
    tx.update(paths.bill(billId), {
      status: "void",
      voidedBy: cashierUid,
      voidedAt: serverTimestamp(),
    });
    if (orderSnap.exists()) {
      tx.update(paths.order(bill.orderId), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    }
    const tableId = orderSnap.exists()
      ? orderSnap.data().tableId
      : bill.tableId;
    if (tableId) {
      for (const id of [tableId, ...mergedIds]) {
        tx.update(paths.table(id), {
          status: "available",
          currentOrderId: null,
          mergedInto: null,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });
}

/**
 * Cancel an abandoned open order — the escape hatch for anything stuck in the
 * Bills "Preparing…" list. An order lands there whenever it isn't billable
 * yet, which covers two dead ends with no other way out:
 *
 *   - nothing was ever fired: there is no ticket for the kitchen to finish, so
 *     it can never become "ready to bill";
 *   - only PART of it was fired: the unsent lines keep it unbillable no matter
 *     what the kitchen does, so completing the ticket in the KDS doesn't help.
 *
 * Counter orders (takeaway/delivery) have no table either, so "close the
 * table" can't clear them the way it can for dine-in. Hence this cancels
 * regardless of how far the order got, and clears any still-live ticket off
 * the kitchen board in the same transaction (KotStatus has no "cancelled" —
 * "completed" is how a ticket leaves the active board).
 *
 * A billed order is refused: use `cancelBill`, which voids the bill and keeps
 * the audit trail intact.
 */
export async function cancelOpenOrder(orderId: string): Promise<void> {
  // Merged secondaries must be freed with the table (pre-read: transactions
  // can't run queries). Only relevant for dine-in; harmless otherwise.
  const preOrder = await getDoc(paths.order(orderId));
  const preTableId = preOrder.exists() ? preOrder.data().tableId : null;
  const mergedIds = preTableId ? await fetchMergedSecondaryIds(preTableId) : [];

  await runTransaction(db, async (tx) => {
    // ---- reads first (transaction requirement) ----
    const snap = await tx.get(paths.order(orderId));
    if (!snap.exists()) throw new Error("Order not found.");
    const order = snap.data();
    if (order.status !== "open") return; // already billed/closed/cancelled
    if (order.billId) {
      throw new Error(
        "This order already has a bill — open the bill and cancel it instead."
      );
    }

    // Every fired line carries its ticket id, so the tickets to retire are
    // derivable from the order lines.
    const kotIds = [
      ...new Set(
        order.items.map((i) => i.kotId).filter((k): k is string => k !== null)
      ),
    ];
    const kotSnaps = await Promise.all(kotIds.map((id) => tx.get(paths.kot(id))));

    // ---- writes ----
    tx.update(paths.order(orderId), {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
    for (const ks of kotSnaps) {
      if (ks.exists() && ks.data().status !== "completed") {
        tx.update(paths.kot(ks.id), {
          status: "completed",
          updatedAt: serverTimestamp(),
        });
      }
    }
    if (order.tableId) {
      for (const id of [order.tableId, ...mergedIds]) {
        tx.update(paths.table(id), {
          status: "available",
          currentOrderId: null,
          mergedInto: null,
          updatedAt: serverTimestamp(),
        });
      }
    }
  });
}

/** Reprint: the only mutation allowed on a paid bill (rules permit it). */
export async function reprintBill(billId: string, current: number): Promise<void> {
  await updateDoc(paths.bill(billId), { printedCount: current + 1 });
}
