/**
 * TableCard — a single tile on the floor grid.
 *
 * Presentation only: it renders a table's status/total/elapsed and reports
 * taps back through `onPress`. No writes, no navigation decisions — the screen
 * owns all of that. Every card has the same internal layout (free tables show
 * `₹ --` / `-- m` placeholders) and the same minimum height, so the grid stays
 * symmetric; the total/timer row is the one part allowed to grow a second line
 * rather than let long values collide.
 */
import { memo, useCallback, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney } from "@/lib/money";
import { shortElapsedLabel } from "@/lib/date";
import { mediumTapFeedback } from "@/lib/feedback";
import { ElapsedTime } from "@/components/ElapsedTime";
import { colors, fonts, radius, shadow, space } from "@/theme/theme";
import type { Order, Table, TableStatus } from "@/types/models";

function tableName(t: Table): string {
  return t.label ?? `T${t.number}`;
}

const PILL: Record<TableStatus, { bg: string; fg: string; label: string }> = {
  available: { bg: colors.mintSoft, fg: colors.mintText, label: "Free" },
  occupied: { bg: colors.navySoft, fg: colors.navyText, label: "Occupied" },
  billed: { bg: colors.indigoSoft, fg: colors.indigoText, label: "Billed" },
};

function StatusPill({ status }: { status: TableStatus }) {
  const p = PILL[status];
  return (
    <View style={[styles.pill, { backgroundColor: p.bg }]}>
      <Text style={[styles.pillText, { color: p.fg }]}>{p.label}</Text>
    </View>
  );
}

export const TableCard = memo(function TableCard({
  table,
  order,
  primary,
  onPress,
}: {
  table: Table & { id: string };
  order: (Order & { id: string }) | null;
  primary: (Table & { id: string }) | null;
  onPress: (t: Table & { id: string }) => void;
}) {
  // Spring-driven press scale so the tile feels tactile (0.97 on press).
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  }, [scale]);
  const pressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  }, [scale]);
  const handlePress = useCallback(() => {
    mediumTapFeedback();
    onPress(table);
  }, [onPress, table]);

  const showOrder = !!order && !table.mergedInto;

  return (
    <Pressable
      style={styles.pressable}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View>
          <View style={styles.topRow}>
            <Text style={styles.name}>{tableName(table)}</Text>
            <StatusPill status={table.status} />
          </View>

          <Text style={styles.seats}>{table.capacity} seats</Text>

          {primary && (
            <View style={styles.mergeBadge}>
              <Text style={styles.mergeBadgeText}>
                Merged → {tableName(primary)}
              </Text>
            </View>
          )}
        </View>

        {/* Always rendered — placeholders keep every card the same height.
            Total and timer are both unbounded (a four-figure bill, a table
            left open overnight), and at a raised device font scale they used
            to run into each other and out past the tile's padding. The row
            wraps instead: they share a line when they fit, and the timer drops
            below the total when they don't. */}
        <View style={styles.metaRow}>
          <Text
            style={[styles.total, !showOrder && styles.metaPlaceholder]}
            numberOfLines={1}
          >
            {showOrder ? formatMoney(order!.subtotal) : "₹ --"}
          </Text>
          {showOrder && order!.createdAt ? (
            <ElapsedTime
              createdAt={order!.createdAt}
              format={shortElapsedLabel}
              intervalMs={30000}
              style={styles.elapsed}
              numberOfLines={1}
            />
          ) : (
            <Text
              style={[styles.elapsed, styles.metaPlaceholder]}
              numberOfLines={1}
            >
              -- m
            </Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  card: {
    flex: 1,
    minHeight: 128,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.s4,
    justifyContent: "space-between",
    ...shadow.float,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontFamily: fonts.semibold,
    fontSize: 19,
    color: colors.text,
    letterSpacing: 0.2,
  },
  seats: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: space.s1,
  },

  metaRow: {
    flexDirection: "row",
    // Wrap + gap, never a bare space-between: the gap guarantees breathing
    // room on one line, the wrap catches the case where one line is not enough.
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-end",
    columnGap: space.s2,
    rowGap: space.s1,
    marginTop: space.s3,
  },
  total: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  elapsed: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.navyText,
  },
  metaPlaceholder: { color: colors.borderStrong },

  mergeBadge: {
    marginTop: space.s2,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.s2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  mergeBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },

  pill: {
    paddingHorizontal: space.s2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { fontFamily: fonts.bold, fontSize: 11 },
});
