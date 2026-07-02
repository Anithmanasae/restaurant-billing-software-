/**
 * A single kitchen ticket (KOT) card for the KDS board.
 *
 * Pure UI: it reads a live `Kot` + the shared `now` epoch-ms (from the parent's
 * `useNow()`), derives the elapsed timer, and delegates every write to the
 * ported `kdsApi` helpers (`startKot` / `markReady` / `completeKot` /
 * `reprintKot`). The kitchen role may only change `status` / `printedCount`.
 */
import { memo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, space, radius, shadow } from "@/theme/theme";
import type { Kot, KotItem, KotStatus } from "@/types/models";
import { startKot, markReady, completeKot, reprintKot } from "./kdsApi";
import { elapsedMs, formatElapsed, URGENT_MS } from "./useElapsed";

type LiveKot = Kot & { id: string };

/** Dot color per lifecycle stage. */
function statusColor(status: KotStatus): string {
  switch (status) {
    case "new":
      return colors.accentAmber;
    case "preparing":
      return colors.primary;
    case "ready":
      return colors.primary;
    default:
      return colors.textMuted;
  }
}

/** Human label for the order type (model uses hyphenated keys). */
function orderTypeLabel(t: Kot["orderType"]): string {
  switch (t) {
    case "dine-in":
      return "Dine In";
    case "takeaway":
      return "Takeaway";
    case "delivery":
      return "Delivery";
    default:
      return t;
  }
}

function PrinterIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9V3h12v6"
        stroke={colors.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
        stroke={colors.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect
        x={6}
        y={14}
        width={12}
        height={7}
        rx={1}
        stroke={colors.textMuted}
        strokeWidth={2}
      />
    </Svg>
  );
}

function ItemLine({ item }: { item: KotItem }) {
  const notes = (item.notes ?? "")
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  return (
    <View style={styles.itemBlock}>
      <View style={styles.itemRow}>
        <Text style={[styles.qty, item.voided && styles.voided]}>
          {item.qty}×
        </Text>
        <Text style={[styles.itemName, item.voided && styles.voided]}>
          {item.name}
        </Text>
      </View>
      {notes.map((n, i) => (
        <Text
          key={i}
          style={[styles.noteLine, item.voided && styles.voided]}
        >
          – {n}
        </Text>
      ))}
    </View>
  );
}

export const TicketCard = memo(function TicketCard({
  kot,
  now,
}: {
  kot: LiveKot;
  now: number;
}) {
  const ms = elapsedMs(kot.createdAt, now);
  const urgent = kot.status !== "ready" && ms > URGENT_MS;
  const itemCount = kot.items.length;

  const onReprint = useCallback(() => {
    void reprintKot(kot);
  }, [kot]);
  const onStart = useCallback(() => {
    void startKot(kot.id);
  }, [kot.id]);
  const onReady = useCallback(() => {
    void markReady(kot.id);
  }, [kot.id]);
  const onComplete = useCallback(() => {
    void completeKot(kot.id);
  }, [kot.id]);

  return (
    <View style={styles.card}>
      {/* Header: status dot + #ticket, elapsed pill, reprint */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[styles.dot, { backgroundColor: statusColor(kot.status) }]}
          />
          <Text style={styles.ticket}>#{kot.ticketNumber}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.timerPill, urgent && styles.timerPillUrgent]}>
            <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
              {formatElapsed(ms)} ELAPSED
            </Text>
          </View>
          <Pressable
            onPress={onReprint}
            hitSlop={8}
            style={styles.printBtn}
            accessibilityLabel="Reprint ticket"
          >
            <PrinterIcon />
          </Pressable>
        </View>
      </View>

      {/* Sub-header: table · order type · N items */}
      <View style={styles.subHeader}>
        <Text style={styles.tableLabel} numberOfLines={1}>
          {kot.tableLabel} · {orderTypeLabel(kot.orderType)}
        </Text>
        <Text style={styles.itemCount}>
          {itemCount} {itemCount === 1 ? "Item" : "Items"}
        </Text>
      </View>

      {/* Items */}
      <View style={styles.items}>
        {kot.items.map((item) => (
          <ItemLine key={item.lineId} item={item} />
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {kot.status === "ready" ? (
          <Pressable
            onPress={onComplete}
            style={[styles.btn, styles.btnPrimary]}
          >
            <Text style={styles.btnPrimaryText}>Complete</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={onStart}
              disabled={kot.status === "preparing"}
              style={[
                styles.btn,
                kot.status === "new" ? styles.btnAmber : styles.btnMuted,
              ]}
            >
              <Text
                style={
                  kot.status === "new"
                    ? styles.btnAmberText
                    : styles.btnMutedText
                }
              >
                {kot.status === "preparing" ? "Started" : "Start"}
              </Text>
            </Pressable>
            <Pressable
              onPress={onReady}
              style={[
                styles.btn,
                kot.status === "preparing" ? styles.btnPrimary : styles.btnGray,
              ]}
            >
              <Text
                style={
                  kot.status === "preparing"
                    ? styles.btnPrimaryText
                    : styles.btnGrayText
                }
              >
                Ready
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.s4,
    gap: space.s3,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  ticket: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
  },
  timerPill: {
    paddingHorizontal: space.s2,
    paddingVertical: space.s1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  timerPillUrgent: {
    backgroundColor: colors.amberSoft,
  },
  timerText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  timerTextUrgent: {
    color: colors.amberText,
  },
  printBtn: {
    padding: space.s1,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
  },
  tableLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  itemCount: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },
  items: {
    gap: space.s2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.s3,
  },
  itemBlock: {
    gap: 2,
  },
  itemRow: {
    flexDirection: "row",
    gap: space.s2,
  },
  qty: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    minWidth: 28,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  noteLine: {
    marginLeft: 28 + space.s2,
    fontSize: 13,
    color: colors.textMuted,
  },
  voided: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: space.s3,
    marginTop: space.s1,
  },
  btn: {
    flex: 1,
    paddingVertical: space.s3,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAmber: {
    backgroundColor: colors.accentAmber,
  },
  btnAmberText: {
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 15,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 15,
  },
  btnGray: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGrayText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  btnMuted: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnMutedText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 15,
  },
});
