/**
 * Kitchen Display (KDS) — live board of active kitchen tickets.
 *
 * Real-time by default: subscribes (via the ported `useCollectionData` hook) to
 * every KOT whose status is still on the board (`new` / `preparing` / `ready`),
 * ordered oldest-first, so new tickets appear the instant a waiter fires them.
 * Filter tabs (Live / Urgent / Ready) recompute against a shared once-per-second
 * `useNow()` tick. All writes go through the ported `kdsApi` helpers.
 */
import { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { query, where, orderBy } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import { useCollectionData } from "@/lib/firestore/useRealtime";
import { colors, space, radius } from "@/theme/theme";
import type { Kot } from "@/types/models";
import { useNow, elapsedMs, URGENT_MS } from "./useElapsed";
import { TicketCard } from "./TicketCard";

type LiveKot = Kot & { id: string };
type Tab = "live" | "urgent" | "ready";

function BellIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function KitchenDisplayScreen() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("live");

  // Memoized live query — identity stable across renders (empty deps).
  const kotsQuery = useMemo(
    () =>
      query(
        paths.kots(),
        where("status", "in", ["new", "preparing", "ready"]),
        orderBy("createdAt", "asc")
      ),
    []
  );

  const { data: kots, loading, error } = useCollectionData<Kot>(kotsQuery);

  // Derived buckets + live counts.
  const { liveKots, urgentKots, readyKots } = useMemo(() => {
    const live: LiveKot[] = [];
    const urgent: LiveKot[] = [];
    const ready: LiveKot[] = [];
    for (const k of kots) {
      if (k.status === "ready") {
        ready.push(k);
      } else if (k.status === "new" || k.status === "preparing") {
        live.push(k);
        if (elapsedMs(k.createdAt, now) > URGENT_MS) urgent.push(k);
      }
    }
    return { liveKots: live, urgentKots: urgent, readyKots: ready };
  }, [kots, now]);

  const visible =
    tab === "live" ? liveKots : tab === "urgent" ? urgentKots : readyKots;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* App header */}
      <View style={styles.appBar}>
        <Text style={styles.brand}>SADA POS</Text>
        <BellIcon />
      </View>

      {/* Title */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Kitchen Display</Text>
        <Text style={styles.subtitle}>
          Manage active orders across all stations.
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        <TabButton
          label="Live"
          count={liveKots.length}
          active={tab === "live"}
          showDot
          onPress={() => setTab("live")}
        />
        <TabButton
          label="Urgent"
          count={urgentKots.length}
          active={tab === "urgent"}
          onPress={() => setTab("urgent")}
        />
        <TabButton
          label="Ready"
          count={readyKots.length}
          active={tab === "ready"}
          onPress={() => setTab("ready")}
        />
      </View>

      {/* Board */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn’t load tickets.</Text>
          <Text style={styles.emptySub}>{error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(k) => k.id}
          renderItem={({ item }) => <TicketCard kot={item} now={now} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + space.s6 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: space.s3 }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No tickets here.</Text>
              <Text style={styles.emptySub}>
                {tab === "urgent"
                  ? "Nothing has crossed the urgent threshold."
                  : tab === "ready"
                    ? "No tickets are ready to serve."
                    : "New orders will appear here instantly."}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function TabButton({
  label,
  count,
  active,
  showDot,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  showDot?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      {showDot && active && <View style={styles.tabDot} />}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label} ({count})
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
  },
  brand: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  titleBlock: {
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
    gap: space.s1,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  tabs: {
    flexDirection: "row",
    gap: space.s2,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s1,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primaryDark,
  },
  listContent: {
    paddingHorizontal: space.s4,
    paddingTop: space.s1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.s6,
    gap: space.s2,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.danger,
  },
});
