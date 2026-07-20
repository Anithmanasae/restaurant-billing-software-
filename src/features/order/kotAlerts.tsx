/**
 * In-app waiter notification for kitchen progress.
 *
 * The KDS updates each kot's `status` in Firestore, and waiter screens already
 * hold live kot subscriptions — so "notify the waiter" is just detecting a
 * status TRANSITION (new → preparing, → ready, → completed) between
 * consecutive snapshots and flashing a banner ("T1 — Order READY"), plus a
 * haptic buzz so a waiter mid-shift actually feels it. No server involved.
 *
 * Screens that filter their kot query to active statuses never *see* the
 * `completed` write — the doc just leaves the snapshot. Since kots are never
 * deleted and only the KDS changes their status, a removal from such a
 * subscription can only mean `completed`; opt into that reading with
 * `removedMeansCompleted`.
 *
 * TODO: real push notifications that reach a backgrounded phone need
 * expo-notifications + per-device push tokens; out of scope for now.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { successFeedback } from "@/lib/feedback";
import { colors, fonts, radius, shadow, space } from "@/theme/theme";
import type { Kot } from "@/types/models";

type LiveKot = Kot & { id: string };

export interface KotAlert {
  /** Changes per alert so a repeat status still re-triggers the banner. */
  key: number;
  tableLabel: string;
  status: "preparing" | "ready" | "completed";
}

export interface KotAlertOptions {
  /**
   * Treat a kot disappearing from the snapshot as its `completed` transition.
   * Only enable on subscriptions whose query filters kots to active statuses
   * (a doc can then only leave by completing); leave off for unfiltered
   * queries, where the transition itself is visible.
   */
  removedMeansCompleted?: boolean;
  /**
   * While true (e.g. the subscription errored and its data reset to []), skip
   * diffing entirely and reseed the baseline from the next healthy snapshot,
   * so the reset isn't misread as tickets completing.
   */
  paused?: boolean;
}

/**
 * Watch a live kot array for status transitions. `isMine` (optional) filters
 * to the current waiter's tickets; it's read through a ref, so an inline
 * closure is fine. The first snapshot only seeds the baseline — no alert.
 */
export function useKotStatusAlerts(
  kots: LiveKot[],
  isMine?: (kot: LiveKot) => boolean,
  options?: KotAlertOptions
): KotAlert | null {
  const [alert, setAlert] = useState<KotAlert | null>(null);
  const prevRef = useRef<Map<string, LiveKot> | null>(null);
  const isMineRef = useRef(isMine);
  isMineRef.current = isMine;
  const removedMeansCompleted = options?.removedMeansCompleted ?? false;
  const paused = options?.paused ?? false;

  useEffect(() => {
    if (paused) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    const next = new Map<string, LiveKot>();
    for (const k of kots) next.set(k.id, k);
    if (prev) {
      const fire = (k: LiveKot, status: KotAlert["status"]) => {
        if (isMineRef.current && !isMineRef.current(k)) return;
        setAlert({ key: Date.now(), tableLabel: k.tableLabel, status });
      };
      for (const k of kots) {
        const before = prev.get(k.id);
        if (
          before !== undefined &&
          before.status !== k.status &&
          (k.status === "preparing" ||
            k.status === "ready" ||
            k.status === "completed")
        ) {
          fire(k, k.status);
        }
      }
      if (removedMeansCompleted) {
        for (const [id, k] of prev) {
          if (!next.has(id) && k.status !== "completed") fire(k, "completed");
        }
      }
    }
    prevRef.current = next;
  }, [kots, paused, removedMeansCompleted]);

  // Haptic buzz, then auto-dismiss after a few seconds.
  useEffect(() => {
    if (!alert) return;
    successFeedback();
    const id = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(id);
  }, [alert]);

  return alert;
}

const ALERT_LOOK: Record<
  KotAlert["status"],
  { label: string; backgroundColor: string }
> = {
  preparing: { label: "STARTED", backgroundColor: colors.statusIndigo },
  ready: { label: "READY", backgroundColor: colors.statusGreen },
  completed: { label: "COMPLETED", backgroundColor: colors.statusBlue },
};

/** Floating toast-style banner; render last inside the screen root. */
export function KotAlertBanner({
  alert,
  topOffset,
}: {
  alert: KotAlert | null;
  topOffset: number;
}) {
  if (!alert) return null;
  const look = ALERT_LOOK[alert.status];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.banner,
        { top: topOffset, backgroundColor: look.backgroundColor },
      ]}
    >
      <Text style={styles.text}>
        {alert.tableLabel} — Order {look.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: space.s4,
    right: space.s4,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    borderRadius: radius.md,
    alignItems: "center",
    zIndex: 10,
    ...shadow.card,
  },
  text: {
    color: colors.textInverse,
    fontSize: 14,
    fontFamily: fonts.extrabold,
  },
});
