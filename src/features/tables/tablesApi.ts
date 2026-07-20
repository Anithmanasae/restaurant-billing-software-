/**
 * Firestore write helpers for the Table Management module.
 *
 * Every mutation goes through `paths` (never a hand-built path) and uses
 * transactions/batches when several documents change together, so table
 * status + order docs never drift out of sync.
 */
import {
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import type { Order, OrderItem, Table } from "@/types/models";

/**
 * Open a table: create a fresh open dine-in order and flip the table to
 * "occupied". Both writes happen atomically. Returns the new order id.
 *
 * If the table already has a current order, that order id is returned
 * unchanged (idempotent — avoids orphaning an existing order).
 */
export async function openTable(
  tableId: string,
  waiterId: string
): Promise<string> {
  const newOrderRef = doc(paths.orders());

  const orderId = await runTransaction(db, async (tx) => {
    const tableSnap = await tx.get(paths.table(tableId));
    if (!tableSnap.exists()) {
      throw new Error(`Table ${tableId} not found`);
    }
    const table = tableSnap.data();

    // Already occupied with a live order — reuse it.
    if (table.currentOrderId) {
      return table.currentOrderId;
    }

    const order: Omit<Order, "id"> = {
      tableId,
      orderType: "dine-in",
      waiterId,
      status: "open",
      items: [],
      subtotal: 0,
      billId: null,
      // serverTimestamp() resolves server-side; typed as Ts (Timestamp | null).
      createdAt: serverTimestamp() as unknown as Order["createdAt"],
      updatedAt: serverTimestamp() as unknown as Order["updatedAt"],
    };
    tx.set(newOrderRef, order);

    tx.update(paths.table(tableId), {
      status: "occupied",
      currentOrderId: newOrderRef.id,
      updatedAt: serverTimestamp(),
    });

    return newOrderRef.id;
  });

  return orderId;
}

/**
 * Merge 2+ tables into a primary. Secondary tables get `mergedInto = primaryId`
 * and their live orders are CONSOLIDATED onto the primary, so the eventual
 * bill always carries the primary table's name:
 *
 *   - primary has an open order → each secondary's open order folds its lines
 *     into it (subtotal recomputed) and is cancelled;
 *   - primary has none → the first secondary order is re-homed to the primary
 *     (tableId reassigned, like shiftTable), the rest fold into it.
 *
 * KOT tickets belonging to moved orders are re-pointed (orderId/tableId/
 * tableLabel) in the same transaction, so the KDS shows the primary table and
 * the billing guard still sees every ticket. Tables with a bill awaiting
 * payment cannot be merged — settle first.
 */
export async function mergeTables(
  primaryId: string,
  secondaryIds: string[]
): Promise<void> {
  const others = [...new Set(secondaryIds)].filter((id) => id !== primaryId);
  if (others.length === 0) return;

  await runTransaction(db, async (tx) => {
    // ---- reads (all before any write) ----
    const primarySnap = await tx.get(paths.table(primaryId));
    if (!primarySnap.exists()) throw new Error(`Table ${primaryId} not found`);
    const primary = primarySnap.data();
    const primaryLabel = primary.label ?? `T${primary.number}`;
    if (primary.status === "billed") {
      throw new Error(
        `${primaryLabel} has a bill awaiting payment — settle it before merging.`
      );
    }
    if (primary.mergedInto) {
      throw new Error(
        `${primaryLabel} is already merged into another table — merge from that table instead.`
      );
    }

    const secondaries: { id: string; table: Table }[] = [];
    for (const id of others) {
      const snap = await tx.get(paths.table(id));
      if (!snap.exists()) throw new Error(`Table ${id} not found`);
      const table = snap.data();
      const label = table.label ?? `T${table.number}`;
      if (table.status === "billed") {
        throw new Error(
          `${label} has a bill awaiting payment — settle it before merging.`
        );
      }
      if (table.mergedInto && table.mergedInto !== primaryId) {
        throw new Error(`${label} is already merged into another table.`);
      }
      secondaries.push({ id, table });
    }

    // The primary's live order (if any) is the fold target.
    let targetOrderId: string | null = null;
    let targetItems: OrderItem[] | null = null;
    if (primary.currentOrderId) {
      const oSnap = await tx.get(paths.order(primary.currentOrderId));
      if (oSnap.exists() && oSnap.data().status === "open") {
        targetOrderId = primary.currentOrderId;
        targetItems = oSnap.data().items;
      }
    }

    // Secondaries' live orders, to be moved onto the primary.
    const moving: { orderId: string; order: Order }[] = [];
    for (const { id, table } of secondaries) {
      if (!table.currentOrderId) continue;
      const oSnap = await tx.get(paths.order(table.currentOrderId));
      if (!oSnap.exists() || oSnap.data().status !== "open") continue;
      moving.push({ orderId: table.currentOrderId, order: oSnap.data() });
    }

    // ---- writes ----
    // Every fired line references its kot doc, so the tickets to re-point are
    // derivable from the order lines — consistent within this transaction.
    const kotIdsOf = (order: Order) => [
      ...new Set(
        order.items.map((l) => l.kotId).filter((k): k is string => k !== null)
      ),
    ];

    let didFold = false;
    for (const m of moving) {
      if (targetOrderId === null) {
        // No order on the primary yet: re-home this one (like shiftTable).
        targetOrderId = m.orderId;
        targetItems = m.order.items;
        tx.update(paths.order(m.orderId), {
          tableId: primaryId,
          updatedAt: serverTimestamp(),
        });
        for (const kid of kotIdsOf(m.order)) {
          tx.update(paths.kot(kid), {
            tableId: primaryId,
            tableLabel: primaryLabel,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        // Fold: lines move to the target order, the source is cancelled.
        didFold = true;
        targetItems = [...(targetItems ?? []), ...m.order.items];
        tx.update(paths.order(m.orderId), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        for (const kid of kotIdsOf(m.order)) {
          tx.update(paths.kot(kid), {
            orderId: targetOrderId,
            tableId: primaryId,
            tableLabel: primaryLabel,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    if (didFold && targetOrderId && targetItems) {
      tx.update(paths.order(targetOrderId), {
        items: targetItems,
        subtotal: subtotalOf(targetItems),
        updatedAt: serverTimestamp(),
      });
    }
    if (moving.length > 0 && targetOrderId) {
      tx.update(paths.table(primaryId), {
        status: "occupied",
        currentOrderId: targetOrderId,
        updatedAt: serverTimestamp(),
      });
    }

    for (const { id } of secondaries) {
      tx.update(paths.table(id), {
        mergedInto: primaryId,
        status: "occupied",
        currentOrderId: null,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Ids of tables currently merged into `primaryTableId`. One-shot read used
 * just before freeing a table (settleBill / closeTable) so its merged
 * secondaries are released in the same transaction.
 */
export async function fetchMergedSecondaryIds(
  primaryTableId: string
): Promise<string[]> {
  const snap = await getDocs(
    query(paths.tables(), where("mergedInto", "==", primaryTableId))
  );
  return snap.docs.map((d) => d.id);
}

/**
 * Split a table: move selected order lines onto a brand-new order attached to a
 * free target table. Both orders' subtotals are recomputed from their lines.
 *
 * Minimal-but-correct version: the source order keeps the remaining lines; the
 * moved lines start a new open order on the target table (marked occupied).
 */
export async function splitTable(
  sourceOrderId: string,
  targetTableId: string,
  lineIdsToMove: string[],
  waiterId: string
): Promise<string> {
  const moveSet = new Set(lineIdsToMove);
  const newOrderRef = doc(paths.orders());

  await runTransaction(db, async (tx) => {
    const srcSnap = await tx.get(paths.order(sourceOrderId));
    if (!srcSnap.exists()) throw new Error(`Order ${sourceOrderId} not found`);
    const src = srcSnap.data();

    const targetSnap = await tx.get(paths.table(targetTableId));
    if (!targetSnap.exists()) {
      throw new Error(`Table ${targetTableId} not found`);
    }
    if (targetSnap.data().currentOrderId) {
      throw new Error("Target table is not free");
    }

    const moved: OrderItem[] = src.items.filter((l) => moveSet.has(l.lineId));
    const remaining: OrderItem[] = src.items.filter(
      (l) => !moveSet.has(l.lineId)
    );
    if (moved.length === 0) throw new Error("No lines selected to move");

    // Recompute subtotals from the split line-sets (non-voided only).
    const remainingSubtotal = subtotalOf(remaining);
    const movedSubtotal = subtotalOf(moved);

    tx.update(paths.order(sourceOrderId), {
      items: remaining,
      subtotal: remainingSubtotal,
      updatedAt: serverTimestamp(),
    });

    const newOrder: Omit<Order, "id"> = {
      tableId: targetTableId,
      orderType: src.orderType,
      waiterId,
      status: "open",
      items: moved,
      subtotal: movedSubtotal,
      billId: null,
      createdAt: serverTimestamp() as unknown as Order["createdAt"],
      updatedAt: serverTimestamp() as unknown as Order["updatedAt"],
    };
    tx.set(newOrderRef, newOrder);

    tx.update(paths.table(targetTableId), {
      status: "occupied",
      currentOrderId: newOrderRef.id,
      updatedAt: serverTimestamp(),
    });
  });

  return newOrderRef.id;
}

/**
 * Shift an order from one table to another free table. Reassigns the order's
 * `tableId`, frees the source table, and occupies the target — atomically.
 */
export async function shiftTable(
  orderId: string,
  fromTableId: string,
  toTableId: string
): Promise<void> {
  if (fromTableId === toTableId) return;

  await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(paths.order(orderId));
    if (!orderSnap.exists()) throw new Error(`Order ${orderId} not found`);

    const toSnap = await tx.get(paths.table(toTableId));
    if (!toSnap.exists()) throw new Error(`Table ${toTableId} not found`);
    if (toSnap.data().currentOrderId) {
      throw new Error("Target table is not free");
    }

    const status = orderSnap.data().status;

    tx.update(paths.order(orderId), {
      tableId: toTableId,
      updatedAt: serverTimestamp(),
    });

    tx.update(paths.table(fromTableId), {
      status: "available",
      currentOrderId: null,
      updatedAt: serverTimestamp(),
    });

    tx.update(paths.table(toTableId), {
      // Preserve billed state if the order was already billed.
      status: status === "billed" ? "billed" : "occupied",
      currentOrderId: orderId,
      updatedAt: serverTimestamp(),
    });
  });
}

/** True when any live line has been fired to the kitchen. */
export function orderInKitchen(order: Pick<Order, "items">): boolean {
  return order.items.some(
    (i) => !i.voided && i.qty > 0 && i.kotStatus !== "pending"
  );
}

/**
 * Close a table back to "available". Guarded: once the order has been fired
 * to the kitchen (or billed), the table stays locked until the cashier
 * settles the bill — settleBill is what frees it. The guard runs inside the
 * transaction so a KOT fired moments earlier still blocks the close.
 *
 * A draft order (nothing sent to the kitchen yet) is cancelled so the floor
 * slot can be reused cleanly.
 */
export async function closeTable(tableId: string): Promise<void> {
  // Tables folded into this one must be released together with it.
  const mergedIds = await fetchMergedSecondaryIds(tableId);

  await runTransaction(db, async (tx) => {
    const tableSnap = await tx.get(paths.table(tableId));
    if (!tableSnap.exists()) throw new Error(`Table ${tableId} not found`);
    const orderId = tableSnap.data().currentOrderId;

    let cancelDraft = false;
    if (orderId) {
      const orderSnap = await tx.get(paths.order(orderId));
      if (orderSnap.exists()) {
        const order = orderSnap.data();
        if (order.status === "billed") {
          throw new Error(
            "This table's bill is awaiting payment. Settle it at the counter to free the table."
          );
        }
        if (order.status === "open") {
          if (orderInKitchen(order)) {
            throw new Error(
              "The kitchen is preparing this table's order. The table frees up automatically once the bill is settled."
            );
          }
          cancelDraft = true; // nothing fired yet — discard the draft order
        }
      }
    }

    if (cancelDraft && orderId) {
      tx.update(paths.order(orderId), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    }
    for (const id of [tableId, ...mergedIds]) {
      tx.update(paths.table(id), {
        status: "available",
        currentOrderId: null,
        mergedInto: null,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Default seats for a table the cashier adds from the count setter. */
const DEFAULT_CAPACITY = 4;

/** A table is safe to remove only when nobody is seated at it. */
function isFree(t: Table): boolean {
  return t.status === "available" && !t.currentOrderId && !t.mergedInto;
}

/**
 * Grow or shrink the floor to exactly `target` tables (owner/cashier setup).
 *
 * - Growing appends new tables numbered after the highest existing one, so
 *   existing tables (and their live orders) are never touched.
 * - Shrinking removes the highest-numbered FREE tables first. Occupied/billed
 *   or merged tables are left in place; if that means the target can't be
 *   reached, we remove as many as we safely can and throw so the UI can tell
 *   the cashier to clear those tables first.
 *
 * Returns the resulting table count.
 */
export async function setTableCount(
  tables: (Table & { id: string })[],
  target: number,
): Promise<number> {
  const desired = Math.floor(target);
  if (!Number.isFinite(desired) || desired < 0 || desired > 200) {
    throw new Error("Enter a table count between 0 and 200.");
  }

  const current = tables.length;
  if (desired === current) return current;

  const batch = writeBatch(db);

  if (desired > current) {
    // Continue numbering after the current highest table number.
    let next = tables.reduce((max, t) => Math.max(max, t.number), 0) + 1;
    for (let i = current; i < desired; i++, next++) {
      const tableRef = doc(paths.tables());
      batch.set(tableRef, {
        id: tableRef.id,
        number: next,
        label: `T${next}`,
        capacity: DEFAULT_CAPACITY,
        status: "available",
        currentOrderId: null,
        mergedInto: null,
        updatedAt: serverTimestamp() as unknown as Table["updatedAt"],
      });
    }
    await batch.commit();
    return desired;
  }

  // Shrinking: drop the highest-numbered free tables first.
  const removable = tables
    .filter(isFree)
    .sort((a, b) => b.number - a.number);
  const toRemove = current - desired;
  const removing = removable.slice(0, toRemove);
  for (const t of removing) batch.delete(paths.table(t.id));
  await batch.commit();

  const remaining = current - removing.length;
  if (removing.length < toRemove) {
    throw new Error(
      `Removed ${removing.length} free table(s). ${remaining - desired} table(s) ` +
        "are still in use — clear or bill them, then try again.",
    );
  }
  return remaining;
}

/** Σ price*qty over non-voided lines (paise). Mirrors money.ts's subtotal. */
function subtotalOf(items: OrderItem[]): number {
  return items
    .filter((l) => !l.voided)
    .reduce((sum, l) => sum + l.price * l.qty, 0);
}
