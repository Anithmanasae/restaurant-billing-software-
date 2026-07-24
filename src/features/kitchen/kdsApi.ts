/**
 * Kitchen Display (KDS) — Firestore write helpers.
 *
 * The kitchen and cashier roles may ONLY change `status`, `printedCount`, or
 * `preparedLineIds` (plus the `updatedAt` bookkeeping field). This is enforced
 * server-side by `firestore.rules`:
 *
 *   hasAnyRole(['kitchen', 'cashier']) && incomingDiffers(['status', 'printedCount', 'updatedAt'])
 *   hasAnyRole(['kitchen', 'cashier']) && incomingDiffers(['preparedLineIds', 'updatedAt'])
 *
 * so every update below touches *only* those keys — never items, prices, etc.
 * One exception: the CASHIER may void a line (see voidKotItem) — the rules
 * carry a matching cashier-only branch for `items`.
 * All writes go through `paths.kot(id)`; no component builds a path by hand.
 */
import {
  arrayRemove,
  arrayUnion,
  runTransaction,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import { computeBill } from "@/lib/money";
import type { Kot } from "@/types/models";

/** Move a ticket from `new` → `preparing` (kitchen has started cooking). */
export async function startKot(kotId: string): Promise<void> {
  await updateDoc(paths.kot(kotId), {
    status: "preparing",
    updatedAt: serverTimestamp(),
  });
}

/** Move a ticket → `ready` (food is plated / ready to serve). */
export async function markReady(kotId: string): Promise<void> {
  await updateDoc(paths.kot(kotId), {
    status: "ready",
    updatedAt: serverTimestamp(),
  });
}

/** Move a ticket → `completed`; it then leaves the live board. */
export async function completeKot(kotId: string): Promise<void> {
  await updateDoc(paths.kot(kotId), {
    status: "completed",
    updatedAt: serverTimestamp(),
  });
}

/** Reprint a ticket: bump `printedCount` (never resets the timer/status). */
export async function reprintKot(kot: Pick<Kot, "id" | "printedCount">): Promise<void> {
  await updateDoc(paths.kot(kot.id), {
    printedCount: (kot.printedCount ?? 0) + 1,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Tick a single line on a fired ticket on/off "plated" (kitchen collecting a
 * big order onto the tray dish-by-dish). Toggles the lineId in the kot's
 * `preparedLineIds` array — an atomic arrayUnion/arrayRemove, so two lines
 * ticked at once never clobber each other. Touches only preparedLineIds +
 * updatedAt, matching the kitchen/cashier write path in firestore.rules.
 */
export async function setLinePrepared(
  kotId: string,
  lineId: string,
  prepared: boolean
): Promise<void> {
  await updateDoc(paths.kot(kotId), {
    preparedLineIds: prepared ? arrayUnion(lineId) : arrayRemove(lineId),
    updatedAt: serverTimestamp(),
  });
}

/**
 * CASHIER-ONLY: void one line on a fired ticket (the kitchen/waiter asked for
 * an item to be removed after Send KOT). The line is never deleted — it stays
 * on the ticket struck through as VOID so the kitchen sees the removal — and
 * the matching order line is voided in the same transaction so the item drops
 * off the bill (subtotal recomputed over non-voided lines, as everywhere).
 *
 * Server-side the rules only let a cashier take this write path; the UI must
 * still gate the button to the cashier role.
 */
export async function voidKotItem(
  kot: Pick<Kot, "id" | "orderId">,
  lineId: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const kotSnap = await tx.get(paths.kot(kot.id));
    if (!kotSnap.exists()) throw new Error("Ticket no longer exists");
    const orderSnap = await tx.get(paths.order(kot.orderId));

    tx.update(paths.kot(kot.id), {
      items: kotSnap
        .data()
        .items.map((l) => (l.lineId === lineId ? { ...l, voided: true } : l)),
      updatedAt: serverTimestamp(),
    });

    if (orderSnap.exists()) {
      const items = orderSnap
        .data()
        .items.map((l) => (l.lineId === lineId ? { ...l, voided: true } : l));
      tx.update(paths.order(kot.orderId), {
        items,
        subtotal: computeBill(
          items.map((l) => ({ price: l.price, qty: l.qty, voided: l.voided }))
        ).subtotal,
        updatedAt: serverTimestamp(),
      });
    }
  });
}
