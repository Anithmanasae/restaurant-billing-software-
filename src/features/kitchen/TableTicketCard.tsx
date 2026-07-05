/**
 * KDS card — ONE per table, folding every active ticket for that table.
 *
 * Status color system (left border + dot): RED = active first-round order,
 * ORANGE = the table has an additional round (with a "+N" items badge),
 * GREEN = completed. Sized by the parent so a 3×3 grid fits the screen.
 *
 * All three actions are always visible; each applies to every ticket in the
 * group it can sensibly move (Start → `new` tickets, Ready → `new`/`preparing`,
 * Completed → everything active). Writes go only through the ported `kdsApi`
 * (kitchen may change nothing but status/printedCount — firestore.rules).
 */
import { memo, useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, space } from "@/theme/theme";
import { formatTimeIST } from "@/lib/date";
import { animateNextLayout, tapFeedback } from "@/lib/feedback";
import { ElapsedTime } from "@/components/ElapsedTime";
import { completeGroup, readyGroup, startGroup } from "./groupActions";
import {
  additionalItemCount,
  hasAdditionalRound,
  type TableGroup,
} from "./groupKots";

const MAX_ITEM_LINES = 3;

export const TableTicketCard = memo(function TableTicketCard({
  group,
  onPress,
}: {
  group: TableGroup;
  /** Tapping the card (outside the buttons) opens the detail sheet. */
  onPress: () => void;
}) {
  const additional = hasAdditionalRound(group);
  const accent = group.completed
    ? colors.statusGreen
    : additional
      ? colors.statusOrange
      : colors.statusRed;

  const first = group.tickets[0];
  const extraCount = additionalItemCount(group);

  // Flatten items across rounds; later rounds keep an orange marker.
  const lines = group.tickets.flatMap((t, round) =>
    t.items
      .filter((it) => !it.voided)
      .map((it) => ({
        key: `${t.id}:${it.lineId}`,
        qty: it.qty,
        name: it.name,
        additional: round > 0 && !group.completed,
      }))
  );
  const shown = lines.slice(0, MAX_ITEM_LINES);
  const hidden = lines.length - shown.length;

  const anyNew = group.tickets.some((t) => t.status === "new");
  const anyPreparing = group.tickets.some((t) => t.status === "preparing");

  const run = useCallback((write: Promise<unknown>) => {
    tapFeedback();
    animateNextLayout(); // the card may leave/enter a tab on status change
    write.catch((e) =>
      Alert.alert(
        "Couldn’t update ticket",
        e instanceof Error ? e.message : String(e)
      )
    );
  }, []);

  const onStart = useCallback(() => run(startGroup(group)), [group, run]);
  const onReady = useCallback(() => run(readyGroup(group)), [group, run]);
  const onComplete = useCallback(() => run(completeGroup(group)), [group, run]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        pressed && styles.cardPressed,
      ]}
    >
      {/* Table label + status dot · time received */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={styles.tableLabel} numberOfLines={1}>
            {group.tableLabel}
          </Text>
        </View>
        <Text style={styles.time}>
          {first.createdAt ? formatTimeIST(first.createdAt.toDate()) : "—"}
        </Text>
      </View>

      {/* +N additional badge · elapsed */}
      <View style={styles.metaRow}>
        {additional ? (
          <View style={styles.plusBadge}>
            <Text style={styles.plusBadgeText}>+{extraCount}</Text>
          </View>
        ) : (
          <View />
        )}
        <ElapsedTime
          createdAt={first.createdAt}
          style={[styles.ago, { color: accent }]}
        />
      </View>

      {/* Items */}
      <View style={styles.items}>
        {shown.map((l) => (
          <View key={l.key} style={styles.itemRow}>
            <View
              style={[
                styles.itemDot,
                {
                  backgroundColor: l.additional
                    ? colors.statusOrange
                    : group.completed
                      ? colors.statusGreen
                      : colors.statusRed,
                },
              ]}
            />
            <Text style={styles.itemText} numberOfLines={1}>
              {l.qty} × {l.name}
            </Text>
          </View>
        ))}
        {hidden > 0 && <Text style={styles.moreText}>+{hidden} more…</Text>}
      </View>

      {/* Actions — always visible; the next sensible step is highlighted */}
      <View style={styles.actions}>
        <View style={styles.smallRow}>
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [
              styles.smallBtn,
              anyNew && styles.startActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.smallBtnText, anyNew && styles.smallBtnTextActive]}
            >
              Start
            </Text>
          </Pressable>
          <Pressable
            onPress={onReady}
            style={({ pressed }) => [
              styles.smallBtn,
              anyPreparing && styles.readyActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.smallBtnText,
                anyPreparing && styles.smallBtnTextActive,
              ]}
            >
              Ready
            </Text>
          </Pressable>
        </View>
        {group.completed ? (
          // Already completed — nothing left to write, so show a done state
          // instead of a button that silently no-ops. Start/Ready above
          // reopen the ticket back onto the live board.
          <View style={[styles.completeBtn, styles.doneState]}>
            <Text style={styles.doneText}>✓ Completed</Text>
          </View>
        ) : (
          <Pressable
            onPress={onComplete}
            style={({ pressed }) => [
              styles.completeBtn,
              { backgroundColor: accent },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.completeText}>Completed</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: space.s2,
    justifyContent: "space-between",
    overflow: "hidden",
    ...shadow.card,
  },
  pressed: {
    opacity: 0.7,
  },
  cardPressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s1,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  tableLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    flexShrink: 1,
  },
  time: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 16,
  },
  plusBadge: {
    backgroundColor: colors.statusOrangeSoft,
    paddingHorizontal: space.s2,
    borderRadius: radius.pill,
  },
  plusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.statusOrange,
  },
  ago: {
    fontSize: 10,
    fontWeight: "700",
  },
  items: {
    flex: 1,
    marginVertical: space.s1,
    gap: 2,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s1,
  },
  itemDot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
  itemText: {
    flex: 1,
    fontSize: 11,
    color: colors.text,
    fontWeight: "600",
  },
  moreText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  actions: {
    gap: space.s1,
  },
  smallRow: {
    flexDirection: "row",
    gap: space.s1,
  },
  smallBtn: {
    flex: 1,
    paddingVertical: space.s1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
  },
  startActive: {
    backgroundColor: colors.accentAmber,
    borderColor: colors.accentAmber,
  },
  readyActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  smallBtnTextActive: {
    color: colors.textInverse,
  },
  completeBtn: {
    paddingVertical: space.s1 + 2,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  completeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
  doneState: {
    backgroundColor: colors.statusGreenSoft,
    borderWidth: 1,
    borderColor: colors.statusGreen,
  },
  doneText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.statusGreen,
    letterSpacing: 0.3,
  },
});
