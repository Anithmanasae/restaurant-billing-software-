/**
 * Skeleton loading placeholders — gray blocks that pulse in sync while live
 * Firestore data arrives, shaped like the content they stand in for. Wrap
 * blocks in a `SkeletonGroup` so the whole screen breathes as one; the
 * per-screen layouts below already do.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, shadow, space } from "@/theme/theme";

const PulseContext = createContext<Animated.Value | null>(null);

/** One opacity value looping 1 → 0.45 → 1 so every block pulses together. */
function usePulse(): Animated.Value {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

/** Shares one pulse with every `Skeleton` block inside it. */
export function SkeletonGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = usePulse();
  return (
    <PulseContext.Provider value={pulse}>
      <View style={style}>{children}</View>
    </PulseContext.Provider>
  );
}

/** A single pulsing bar/box. Width defaults to 100% of its container. */
export function Skeleton({
  w,
  h,
  r = radius.sm,
  style,
}: {
  w?: DimensionValue;
  h: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useContext(PulseContext);
  return (
    <Animated.View
      style={[
        {
          width: w ?? "100%",
          height: h,
          borderRadius: r,
          backgroundColor: colors.border,
          opacity: pulse ?? 0.7,
        },
        style,
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-screen layouts
// ─────────────────────────────────────────────────────────────────────────────

/** Tables floor: 2-column grid of white table cards. */
export function TableGridSkeleton() {
  return (
    <SkeletonGroup style={styles.grid2}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.card, styles.cell2]}>
          <View style={styles.rowBetween}>
            <Skeleton w={56} h={18} />
            <Skeleton w={64} h={18} r={radius.pill} />
          </View>
          <Skeleton w="70%" h={12} style={{ marginTop: space.s4 }} />
          <Skeleton w="45%" h={12} style={{ marginTop: space.s2 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Menu / order: 2-column cards with an image block + title/price bars. */
export function MenuGridSkeleton() {
  return (
    <SkeletonGroup style={styles.grid2}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.card, styles.cell2]}>
          <Skeleton h={96} r={radius.md} />
          <Skeleton w="80%" h={13} style={{ marginTop: space.s3 }} />
          <Skeleton w="40%" h={13} style={{ marginTop: space.s2 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** KDS board: 3-column ticket cards. */
export function KdsGridSkeleton() {
  return (
    <SkeletonGroup style={styles.grid3}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.card, styles.cell3]}>
          <View style={styles.rowBetween}>
            <Skeleton w={44} h={16} />
            <Skeleton w={22} h={22} r={radius.pill} />
          </View>
          <Skeleton w="90%" h={10} style={{ marginTop: space.s3 }} />
          <Skeleton w="70%" h={10} style={{ marginTop: space.s2 }} />
          <Skeleton w="80%" h={10} style={{ marginTop: space.s2 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Bills queue: section header bars + stacked full-width cards. */
export function BillListSkeleton() {
  return (
    <SkeletonGroup style={styles.list}>
      <Skeleton w={90} h={14} style={{ marginBottom: space.s3 }} />
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={[styles.card, { marginBottom: space.s3 }]}>
          <View style={styles.rowBetween}>
            <Skeleton w={80} h={18} />
            <Skeleton w={72} h={20} r={radius.pill} />
          </View>
          <View style={[styles.rowBetween, { marginTop: space.s4 }]}>
            <Skeleton w={96} h={16} />
            <Skeleton w={56} h={12} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Insights: 2×2 KPI tiles + a tall chart card + a list card. */
export function InsightsSkeleton() {
  const kpi = (key: number) => (
    <View key={key} style={[styles.card, styles.cell2]}>
      <Skeleton w="60%" h={11} />
      <Skeleton w="50%" h={20} style={{ marginTop: space.s3 }} />
    </View>
  );
  return (
    <SkeletonGroup style={styles.list}>
      <View style={styles.grid2Inner}>{[0, 1, 2, 3].map(kpi)}</View>
      <View style={[styles.card, { marginTop: space.s3 }]}>
        <Skeleton w="45%" h={14} />
        <Skeleton w="30%" h={10} style={{ marginTop: space.s2 }} />
        <Skeleton h={160} r={radius.md} style={{ marginTop: space.s4 }} />
      </View>
      <View style={[styles.card, { marginTop: space.s3 }]}>
        <Skeleton w="50%" h={14} />
        <Skeleton h={12} style={{ marginTop: space.s4 }} />
        <Skeleton w="85%" h={12} style={{ marginTop: space.s3 }} />
        <Skeleton w="70%" h={12} style={{ marginTop: space.s3 }} />
      </View>
    </SkeletonGroup>
  );
}

/** Bill detail: receipt header + line rows + totals. */
export function ReceiptSkeleton() {
  return (
    <SkeletonGroup style={[styles.list, { paddingTop: space.s5 }]}>
      <View style={styles.rowBetween}>
        <Skeleton w={120} h={22} />
        <Skeleton w={32} h={32} r={radius.pill} />
      </View>
      <Skeleton w="55%" h={12} style={{ marginTop: space.s2 }} />
      <View style={[styles.card, { marginTop: space.s5 }]}>
        {Array.from({ length: 4 }, (_, i) => (
          <View
            key={i}
            style={[styles.rowBetween, i > 0 && { marginTop: space.s4 }]}
          >
            <Skeleton w="55%" h={13} />
            <Skeleton w={64} h={13} />
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.rowBetween}>
          <Skeleton w={96} h={16} />
          <Skeleton w={80} h={16} />
        </View>
      </View>
      <Skeleton h={48} r={radius.md} style={{ marginTop: space.s5 }} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.s4, paddingTop: space.s2 },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingTop: space.s2,
  },
  grid2Inner: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  grid3: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingTop: space.s2,
  },
  // gap-aware two/three-up cells (parent horizontal padding is s4 = 16).
  cell2: { flexBasis: "47%", flexGrow: 1 },
  cell3: { flexBasis: "30%", flexGrow: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.s4,
    ...shadow.card,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space.s4,
  },
});
