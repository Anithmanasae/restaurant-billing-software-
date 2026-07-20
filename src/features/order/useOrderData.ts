/**
 * Live data hooks for the Waiter Order screen — thin wrappers over the generic
 * realtime hooks so the screen always renders current data (never polled).
 */
import { useMemo } from "react";
import { orderBy, query, where } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import { useCollectionData, useDocData } from "@/lib/firestore/useRealtime";
import type { Kot, MenuCategory, MenuItem, Order, Table } from "@/types/models";

/** Enabled categories, ordered by sortOrder (ascending). */
export function useMenuCategories() {
  const q = useMemo(
    () => query(paths.menuCategories(), orderBy("sortOrder", "asc")),
    []
  );
  return useCollectionData<MenuCategory>(q);
}

/** All menu items, ordered by name. */
export function useMenuItems() {
  const q = useMemo(() => query(paths.menuItems(), orderBy("name", "asc")), []);
  return useCollectionData<MenuItem>(q);
}

/** Subscribe to a single table (for its label + currentOrderId). */
export function useTable(tableId: string | null) {
  const ref = useMemo(
    () => (tableId ? paths.table(tableId) : null),
    [tableId]
  );
  return useDocData<Table>(ref);
}

/**
 * Resolve the active OPEN order for a table.
 *
 * Query the orders collection for `tableId == && status == "open"` and
 * subscribe live. Returns the first match (there should only be one open order
 * per table at a time). Requires a composite index on (tableId, status).
 */
export function useOpenOrderForTable(tableId: string | null) {
  const q = useMemo(
    () =>
      tableId
        ? query(
            paths.orders(),
            where("tableId", "==", tableId),
            where("status", "==", "open")
          )
        : null,
    [tableId]
  );
  const state = useCollectionData<Order>(q);
  return {
    ...state,
    order: state.data[0] ?? null,
  };
}

/**
 * Every OPEN counter order (takeaway/delivery — no table).
 *
 * The order screen keeps a takeaway order's id in local component state, so
 * when a waiter's session ends the id is gone and the order becomes
 * unreachable: unlike dine-in there is no table `currentOrderId` to resolve it
 * from. It then strands in the Bills "Preparing…" list forever, taking any
 * food already fired with it. This query is the missing anchor — it lets
 * whoever is at the counter pick an abandoned order back up.
 *
 * Bill-less and non-empty only: a billed order belongs to the cashier's flow,
 * and an order with no live lines is nothing to resume. Requires a composite
 * index on (tableId, status).
 */
export function useOpenCounterOrders() {
  const q = useMemo(
    () =>
      query(
        paths.orders(),
        where("tableId", "==", null),
        where("status", "==", "open")
      ),
    []
  );
  const state = useCollectionData<Order>(q);
  const orders = useMemo(
    () => state.data.filter((o) => !o.billId && o.items.some((i) => !i.voided)),
    [state.data]
  );
  return { ...state, orders };
}

/** Subscribe to a single order doc by id. */
export function useOrder(orderId: string | null) {
  const ref = useMemo(
    () => (orderId ? paths.order(orderId) : null),
    [orderId]
  );
  return useDocData<Order>(ref);
}

/**
 * Subscribe to every KOT belonging to an order, so the screen can mirror
 * kitchen status back onto the order lines. Requires an index on `orderId`.
 */
export function useKotsForOrder(orderId: string | null) {
  const q = useMemo(
    () => (orderId ? query(paths.kots(), where("orderId", "==", orderId)) : null),
    [orderId]
  );
  return useCollectionData<Kot>(q);
}
