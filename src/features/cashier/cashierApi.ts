/**
 * Cashier billing writes — the money path. All amounts are integer paise.
 *
 * Every total is derived from the ORDER's line items via `computeBill`; the
 * client never trusts a total it was handed. Firestore rules independently
 * re-validate ranges, GST consistency, immutability of paid bills, and that
 * only cashier/admin can settle.
 */
import {
  addDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
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
 * Create a finalized bill for an open order (cashier-initiated), or return the
 * existing bill id if the order already has one. Marks the order `billed` and
 * the table `billed` so the floor view reflects it live.
 */
export async function generateBill(
  order: Order,
  cashierUid: string,
  tableLabel: string
): Promise<string> {
  if (order.billId) return order.billId;

  const totals = computeBill(linesOf(order), 0);
  const billsCol = paths.bills();

  const billRef = await addDoc(billsCol, {
    orderId: order.id,
    tableId: order.tableId,
    tableLabel,
    ...totals,
    status: "finalized",
    paymentMode: null,
    requestedBy: order.waiterId,
    cashierId: cashierUid,
    printedCount: 0,
    createdAt: serverTimestamp(),
    paidAt: null,
  } as unknown as Bill);

  const batch = writeBatch(db);
  batch.update(paths.order(order.id), {
    billId: billRef.id,
    status: "billed",
    updatedAt: serverTimestamp(),
  });
  if (order.tableId) {
    batch.update(paths.table(order.tableId), {
      status: "billed",
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return billRef.id;
}

/**
 * Re-price a bill when the discount changes. Recomputed from the order lines,
 * never from the stored total, so a tampered client can't inflate a discount
 * past what the items justify.
 */
export async function applyDiscount(
  billId: string,
  order: Order,
  discountPercent: number
): Promise<void> {
  const totals = computeBill(linesOf(order), discountPercent);
  await updateDoc(paths.bill(billId), {
    ...totals,
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
      tx.update(paths.table(order.tableId), {
        status: "available",
        currentOrderId: null,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Reprint: the only mutation allowed on a paid bill (rules permit it). */
export async function reprintBill(billId: string, current: number): Promise<void> {
  await updateDoc(paths.bill(billId), { printedCount: current + 1 });
}
