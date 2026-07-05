/**
 * Live subscriptions for the cashier screen.
 */
import { useMemo } from "react";
import { query, where } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import { useCollectionData, useDocData } from "@/lib/firestore/useRealtime";
import type { Bill, Kot, Order, Table } from "@/types/models";

/** Bills awaiting the cashier: requested (by a waiter) or finalized (in progress). */
export function useActiveBills() {
  const q = useMemo(
    () =>
      query(paths.bills(), where("status", "in", ["requested", "finalized"])),
    []
  );
  return useCollectionData<Bill>(q);
}

/** KOT statuses that mean the kitchen is still working on a ticket. */
export const ACTIVE_KOT_STATUSES = ["new", "preparing", "ready"] as const;

/**
 * "Food first, pay after": true only when the kitchen is done with an order.
 *   - at least one line was actually sent to the kitchen (has a kotId), AND
 *   - no line is still waiting to be sent (`pending` — billing it would charge
 *     for food the kitchen never saw), AND
 *   - none of the order's tickets are still new/preparing/ready.
 *
 * Derived entirely from the live order lines + live kot docs — the kitchen
 * never writes to orders (rules only let it change kot status/printedCount).
 */
export function isKitchenDone(
  order: Order,
  orderIdsWithActiveKots: ReadonlySet<string>
): boolean {
  const lines = order.items.filter((i) => !i.voided && i.qty > 0);
  const hasSent = lines.some((i) => i.kotId !== null);
  const hasUnsent = lines.some((i) => i.kotStatus === "pending");
  return hasSent && !hasUnsent && !orderIdsWithActiveKots.has(order.id);
}

/**
 * Open, un-billed orders split by kitchen progress.
 *
 * `data` ("ready to bill") contains ONLY kitchen-done orders; `preparing`
 * holds the rest so the UI can show them greyed out. Both come from live
 * subscriptions, so when a waiter sends a new round for an already-completed
 * order, its fresh `new` ticket re-appears in the active-kots set and the
 * order automatically drops back from `data` into `preparing` until the
 * kitchen completes that ticket too.
 */
export function useBillableOrders() {
  const ordersQ = useMemo(
    () => query(paths.orders(), where("status", "==", "open")),
    []
  );
  // Only non-completed tickets — bounded set (the live board), unlike the
  // ever-growing history of completed kots.
  const kotsQ = useMemo(
    () => query(paths.kots(), where("status", "in", [...ACTIVE_KOT_STATUSES])),
    []
  );
  const orders = useCollectionData<Order>(ordersQ);
  const kots = useCollectionData<Kot>(kotsQ);

  return useMemo(() => {
    const open = orders.data.filter(
      (o) => !o.billId && o.items.some((i) => !i.voided)
    );
    const activeKotOrderIds = new Set(kots.data.map((k) => k.orderId));
    return {
      data: open.filter((o) => isKitchenDone(o, activeKotOrderIds)),
      preparing: open.filter((o) => !isKitchenDone(o, activeKotOrderIds)),
      loading: orders.loading || kots.loading,
      error: orders.error ?? kots.error,
    };
  }, [orders, kots]);
}

export function useAllTables() {
  const q = useMemo(() => paths.tables(), []);
  return useCollectionData<Table>(q);
}

export function useBill(billId: string | null) {
  const ref = useMemo(() => (billId ? paths.bill(billId) : null), [billId]);
  return useDocData<Bill>(ref);
}

export function useOrder(orderId: string | null) {
  const ref = useMemo(() => (orderId ? paths.order(orderId) : null), [orderId]);
  return useDocData<Order>(ref);
}
