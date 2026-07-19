/**
 * Group-level KDS actions, shared by the board card and the detail sheet.
 *
 * Each action targets only the tickets it can sensibly move: Start → `new`
 * tickets, Ready → `new`/`preparing`, Completed → everything still active.
 * On an already-completed group, Start/Ready re-open the ticket back onto the
 * live board. All writes go through the ported `kdsApi` helpers.
 *
 * After the status writes land, the attending waiter's phone is pinged
 * directly (kot.waiterPushToken → Expo push API — see lib/push.ts).
 * Fire-and-forget: a push failure never fails the button press.
 */
import { sendKotStatusPush, type KotPushStatus } from "@/lib/push";
import { completeKot, markReady, startKot } from "./kdsApi";
import type { LiveKot, TableGroup } from "./groupKots";

function notifyWaiter(targets: LiveKot[], status: KotPushStatus): void {
  sendKotStatusPush(targets, status).catch((e) =>
    console.warn("[push] waiter notify failed:", e)
  );
}

export async function startGroup(group: TableGroup): Promise<unknown> {
  const targets = group.completed
    ? group.tickets
    : group.tickets.filter((t) => t.status === "new");
  const done = await Promise.all(targets.map((t) => startKot(t.id)));
  notifyWaiter(targets, "preparing");
  return done;
}

export async function readyGroup(group: TableGroup): Promise<unknown> {
  const targets = group.completed
    ? group.tickets
    : group.tickets.filter(
        (t) => t.status === "new" || t.status === "preparing"
      );
  const done = await Promise.all(targets.map((t) => markReady(t.id)));
  notifyWaiter(targets, "ready");
  return done;
}

export async function completeGroup(group: TableGroup): Promise<unknown> {
  const targets = group.tickets.filter((t) => t.status !== "completed");
  const done = await Promise.all(targets.map((t) => completeKot(t.id)));
  notifyWaiter(targets, "completed");
  return done;
}
