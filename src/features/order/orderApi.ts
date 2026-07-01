/**
 * Firestore write helpers for the Waiter Order + KOT module.
 *
 * Every mutation goes through `paths` (never a hand-built path). Writes that
 * touch several documents at once (order + table, or counter + kot + order)
 * run inside a transaction/batch so the docs never drift out of sync.
 *
 * Money is integer paise everywhere; the order subtotal is recomputed from the
 * line-items on every write via money.ts's rule (Σ price*qty for non-voided).
 */
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import { computeBill } from "@/lib/money";
import type {
  Kot,
  KotItem,
  Order,
  OrderItem,
  OrderType,
} from "@/types/models";

/** First minted KOT ticket is this + 1 (i.e. #4001). */
const KOT_TICKET_SEED = 4000;

/** Σ price*qty over non-voided lines (paise) — reuses computeBill's subtotal. */
function subtotalOf(items: OrderItem[]): number {
  return computeBill(items.map((l) => ({ price: l.price, qty: l.qty, voided: l.voided })))
    .subtotal;
}

/** Build a fresh `pending` order line for a menu item (price snapshotted). */
export function newOrderLine(menuItemId: string, name: string, price: number): OrderItem {
  return {
    lineId: crypto.randomUUID(),
    menuItemId,
    name,
    price,
    qty: 1,
    notes: "",
    kotStatus: "pending",
    kotId: null,
    voided: false,
    addedAt: serverTimestamp() as unknown as OrderItem["addedAt"],
  };
}

/**
 * Add a menu item to the active order, creating the order on first add.
 *
 * - Dine-in (`tableId` set): finds the table's `currentOrderId`; if none, opens
 *   a fresh order and flips the table to `occupied` — atomically.
 * - Takeaway (`tableId` null): always creates a new order when `orderId` is
 *   null, otherwise appends to the given order.
 *
 * If the item is already an un-sent (`pending`, un-voided) line with no notes,
 * its qty is incremented instead of adding a duplicate line.
 *
 * Returns the order id (new or existing).
 */
export async function addOrCreateOrder(params: {
  orderId: string | null;
  tableId: string | null;
  tableLabel: string;
  orderType: OrderType;
  waiterId: string;
  menuItemId: string;
  name: string;
  price: number;
}): Promise<string> {
  const {
    orderId,
    tableId,
    orderType,
    waiterId,
    menuItemId,
    name,
    price,
  } = params;

  const line = newOrderLine(menuItemId, name, price);

  return runTransaction(db, async (tx) => {
    // ── Resolve the target order ref. ──────────────────────────────────────
    let orderRef = orderId ? paths.order(orderId) : null;

    // Dine-in with no known order: check the table for an existing open order.
    if (!orderRef && tableId) {
      const tableSnap = await tx.get(paths.table(tableId));
      if (!tableSnap.exists()) throw new Error(`Table ${tableId} not found`);
      const existing = tableSnap.data().currentOrderId;
      if (existing) orderRef = paths.order(existing);
    }

    // ── Append to an existing order. ───────────────────────────────────────
    if (orderRef) {
      const orderSnap = await tx.get(orderRef);
      if (orderSnap.exists()) {
        const order = orderSnap.data();
        const items = [...order.items];

        // Merge into an existing un-sent, note-less line for the same item.
        const idx = items.findIndex(
          (l) =>
            l.menuItemId === menuItemId &&
            l.kotStatus === "pending" &&
            !l.voided &&
            !l.notes
        );
        if (idx >= 0) {
          items[idx] = { ...items[idx], qty: items[idx].qty + 1 };
        } else {
          items.push(line);
        }

        tx.update(orderRef, {
          items,
          subtotal: subtotalOf(items),
          updatedAt: serverTimestamp(),
        });
        return orderRef.id;
      }
      // Order pointer was stale (doc missing) — fall through to create anew.
    }

    // ── Create a brand-new order. ──────────────────────────────────────────
    const newOrderRef = doc(paths.orders());
    const order: Omit<Order, "id"> = {
      tableId: tableId ?? null,
      orderType,
      waiterId,
      status: "open",
      items: [line],
      subtotal: subtotalOf([line]),
      billId: null,
      createdAt: serverTimestamp() as unknown as Order["createdAt"],
      updatedAt: serverTimestamp() as unknown as Order["updatedAt"],
    };
    tx.set(newOrderRef, order);

    // Dine-in: occupy the table and point it at the new order.
    if (tableId) {
      tx.update(paths.table(tableId), {
        status: "occupied",
        currentOrderId: newOrderRef.id,
        updatedAt: serverTimestamp(),
      });
    }

    return newOrderRef.id;
  });
}

/**
 * Set a line's quantity. `qty <= 0` removes the line entirely. Only un-sent
 * (`pending`) lines are safe to mutate here — sent lines are locked. Subtotal
 * is recomputed from the resulting line-set.
 */
export async function updateLineQty(
  orderId: string,
  lineId: string,
  qty: number
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(paths.order(orderId));
    if (!snap.exists()) throw new Error(`Order ${orderId} not found`);

    let items = snap.data().items;
    if (qty <= 0) {
      items = items.filter((l) => l.lineId !== lineId);
    } else {
      items = items.map((l) => (l.lineId === lineId ? { ...l, qty } : l));
    }

    tx.update(paths.order(orderId), {
      items,
      subtotal: subtotalOf(items),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Set a line's special-instructions note (`OrderItem.notes`). */
export async function setLineNotes(
  orderId: string,
  lineId: string,
  notes: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(paths.order(orderId));
    if (!snap.exists()) throw new Error(`Order ${orderId} not found`);

    const items = snap.data().items.map((l) =>
      l.lineId === lineId ? { ...l, notes } : l
    );

    tx.update(paths.order(orderId), {
      items,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Remove a line from the order (subtotal recomputed). */
export async function removeLine(orderId: string, lineId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(paths.order(orderId));
    if (!snap.exists()) throw new Error(`Order ${orderId} not found`);

    const items = snap.data().items.filter((l) => l.lineId !== lineId);

    tx.update(paths.order(orderId), {
      items,
      subtotal: subtotalOf(items),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Send all `pending` lines of an order to the kitchen as a new KOT ticket.
 *
 * Atomically (single runTransaction):
 *   1. Increment `counters/kotTicket` to mint a human ticket number
 *      (created at KOT_TICKET_SEED if missing, so the first ticket is #4001).
 *   2. Create a new `Kot` (status "new", denormalized tableLabel/orderType,
 *      pending lines mapped to KotItem, printedCount 0).
 *   3. Flip those order lines to `kotStatus: "sent"` with their new `kotId`.
 *
 * Returns the new kot id, or null when there was nothing pending to send.
 */
export async function sendKot(
  orderId: string,
  tableLabel: string
): Promise<string | null> {
  const kotRef = doc(paths.kots());
  const counterRef = paths.counter("kotTicket");

  return runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(paths.order(orderId));
    if (!orderSnap.exists()) throw new Error(`Order ${orderId} not found`);
    const order = orderSnap.data();

    const pending = order.items.filter(
      (l) => l.kotStatus === "pending" && !l.voided && l.qty > 0
    );
    if (pending.length === 0) return null;

    // Mint the ticket number (all reads must precede writes in a transaction).
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists() ? counterSnap.data().value : KOT_TICKET_SEED;
    const ticketNumber = current + 1;

    const kotItems: KotItem[] = pending.map((l) => ({
      lineId: l.lineId,
      menuItemId: l.menuItemId,
      name: l.name,
      qty: l.qty,
      notes: l.notes ?? "",
      voided: l.voided,
    }));

    const kot: Omit<Kot, "id"> = {
      orderId,
      tableId: order.tableId,
      tableLabel,
      orderType: order.orderType,
      ticketNumber,
      items: kotItems,
      status: "new",
      printedCount: 0,
      createdAt: serverTimestamp() as unknown as Kot["createdAt"],
      updatedAt: serverTimestamp() as unknown as Kot["updatedAt"],
    };

    // Writes.
    tx.set(counterRef, { value: ticketNumber });
    tx.set(kotRef, kot);

    const sentIds = new Set(pending.map((l) => l.lineId));
    const items = order.items.map((l) =>
      sentIds.has(l.lineId)
        ? { ...l, kotStatus: "sent" as const, kotId: kotRef.id }
        : l
    );
    tx.update(paths.order(orderId), {
      items,
      subtotal: subtotalOf(items),
      updatedAt: serverTimestamp(),
    });

    return kotRef.id;
  });
}

/**
 * Reflect KDS progress back onto order lines. When a KOT's status changes in
 * the kitchen we mirror it onto every line that was sent on that ticket. Kept
 * as a batch so all line updates land together.
 *
 * `kotStatuses` maps kotId -> the per-line status to stamp (pending/sent/
 * preparing/ready/served). Returns true if the order doc was changed.
 */
export async function syncLineStatuses(
  orderId: string,
  kotStatuses: Map<string, OrderItem["kotStatus"]>
): Promise<boolean> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(paths.order(orderId));
    if (!snap.exists()) return false;

    let changed = false;
    const items = snap.data().items.map((l) => {
      if (!l.kotId) return l;
      const next = kotStatuses.get(l.kotId);
      if (next && next !== l.kotStatus) {
        changed = true;
        return { ...l, kotStatus: next };
      }
      return l;
    });

    if (!changed) return false;
    tx.update(paths.order(orderId), { items, updatedAt: serverTimestamp() });
    return true;
  });
}
