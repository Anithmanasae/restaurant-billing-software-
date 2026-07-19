/**
 * Serverless push notifications — the SEND side.
 *
 * The free Firebase plan has no Cloud Functions, so pushes are sent
 * peer-to-peer: the waiter's device registers an Expo push token at login
 * (see pushRegistration.ts) and `sendKot` stamps it onto every fired ticket
 * (`kot.waiterPushToken`). When the kitchen presses Start / Food Ready /
 * Completed, the KDS device POSTs straight to Expo's public push API, which
 * delivers via FCM — the attending waiter's phone buzzes even with the app
 * backgrounded or the screen off.
 *
 * This module is deliberately free of react-native / expo imports so the
 * Node e2e scripts can keep importing orderApi & friends.
 */
import type { Kot } from "@/types/models";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Android notification channel id — must match pushRegistration.ts. */
export const KOT_PUSH_CHANNEL = "kot-status";

/**
 * The sender device's own Expo push token, cached here by pushRegistration
 * so orderApi can stamp it onto tickets without touching native modules.
 */
let cachedPushToken: string | null = null;

export function setCachedPushToken(token: string | null): void {
  cachedPushToken = token;
}

export function getCachedPushToken(): string | null {
  return cachedPushToken;
}

export type KotPushStatus = "preparing" | "ready" | "completed";

type PushTarget = Pick<Kot, "tableLabel" | "ticketNumber"> &
  Partial<Pick<Kot, "waiterPushToken">>;

function copyFor(
  status: KotPushStatus,
  tableLabel: string,
  tickets: string
): { title: string; body: string } {
  switch (status) {
    case "preparing":
      return {
        title: `${tableLabel} — Kitchen started`,
        body: `${tickets} is being prepared.`,
      };
    case "ready":
      return {
        title: `${tableLabel} — Food is READY`,
        body: `${tickets} is plated — please pick it up.`,
      };
    case "completed":
      return {
        title: `${tableLabel} — Order completed`,
        body: `${tickets} was marked completed by the kitchen.`,
      };
  }
}

/**
 * Notify the device(s) that fired these tickets about a kitchen status
 * change. Group actions move several tickets at once — messages are folded
 * to ONE push per device per press. Fire-and-forget: callers `.catch` and
 * never block the status write on network trouble.
 */
export async function sendKotStatusPush(
  kots: PushTarget[],
  status: KotPushStatus
): Promise<void> {
  // token -> ticket numbers (usually one waiter, one or two rounds)
  const byToken = new Map<string, PushTarget[]>();
  for (const k of kots) {
    const token = k.waiterPushToken;
    if (!token || !token.startsWith("ExponentPushToken")) continue;
    const list = byToken.get(token);
    if (list) list.push(k);
    else byToken.set(token, [k]);
  }
  if (byToken.size === 0) return;

  const messages = [...byToken.entries()].map(([to, targets]) => {
    const numbers = targets.map((t) => `#${t.ticketNumber}`).join(", ");
    const tickets =
      targets.length === 1 ? `Ticket ${numbers}` : `Tickets ${numbers}`;
    return {
      to,
      ...copyFor(status, targets[0].tableLabel, tickets),
      sound: "default",
      priority: "high",
      channelId: KOT_PUSH_CHANNEL,
    };
  });

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo push API responded ${res.status}`);
  }
}
