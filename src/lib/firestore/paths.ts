/**
 * Typed Firestore collection/document reference helpers.
 *
 * Every read/write in the app goes through these — no component builds a
 * collection path by hand. This keeps the multi-tenant prefix
 * (`restaurants/{id}/…`) in exactly one place.
 */
import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { db, RESTAURANT_ID } from "@/lib/firebase";
import type {
  AppUser,
  Bill,
  BootstrapMeta,
  DailySummary,
  Kot,
  MenuCategory,
  MenuItem,
  Order,
  Table,
} from "@/types/models";

const root = `restaurants/${RESTAURANT_ID}`;

function col<T>(name: string): CollectionReference<T> {
  return collection(db, `${root}/${name}`) as CollectionReference<T>;
}

function ref<T>(name: string, id: string): DocumentReference<T> {
  return doc(db, `${root}/${name}/${id}`) as DocumentReference<T>;
}

export const paths = {
  users: () => col<AppUser>("users"),
  user: (id: string) => ref<AppUser>("users", id),

  /** One-time cashier signup claim flag (see BootstrapMeta). */
  bootstrap: () => ref<BootstrapMeta>("meta", "bootstrap"),

  tables: () => col<Table>("tables"),
  table: (id: string) => ref<Table>("tables", id),

  menuCategories: () => col<MenuCategory>("menuCategories"),
  menuCategory: (id: string) => ref<MenuCategory>("menuCategories", id),

  menuItems: () => col<MenuItem>("menuItems"),
  menuItem: (id: string) => ref<MenuItem>("menuItems", id),

  orders: () => col<Order>("orders"),
  order: (id: string) => ref<Order>("orders", id),

  kots: () => col<Kot>("kots"),
  kot: (id: string) => ref<Kot>("kots", id),

  bills: () => col<Bill>("bills"),
  bill: (id: string) => ref<Bill>("bills", id),

  dailySummaries: () => col<DailySummary>("dailySummaries"),
  dailySummary: (date: string) => ref<DailySummary>("dailySummaries", date),

  /** Monotonic counters (e.g. "kotTicket", "billNumber") for human-facing
   *  sequence numbers. Increment inside a runTransaction. */
  counter: (name: string) => ref<{ value: number }>("counters", name),
};
