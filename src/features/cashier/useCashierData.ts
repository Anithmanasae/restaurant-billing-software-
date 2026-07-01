/**
 * Live subscriptions for the cashier screen.
 */
import { useMemo } from "react";
import { query, where } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import { useCollectionData, useDocData } from "@/lib/firestore/useRealtime";
import type { Bill, Order, Table } from "@/types/models";

/** Bills awaiting the cashier: requested (by a waiter) or finalized (in progress). */
export function useActiveBills() {
  const q = useMemo(
    () =>
      query(paths.bills(), where("status", "in", ["requested", "finalized"])),
    []
  );
  return useCollectionData<Bill>(q);
}

/** Open orders that don't yet have a bill — cashier can bill them directly. */
export function useBillableOrders() {
  const q = useMemo(
    () => query(paths.orders(), where("status", "==", "open")),
    []
  );
  const state = useCollectionData<Order>(q);
  return {
    ...state,
    data: state.data.filter((o) => !o.billId && o.items.some((i) => !i.voided)),
  };
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
