/**
 * Bills (Cashier) — SADA POS, React Native port.
 *
 * Landing list for the cashier: bills a waiter has requested / finalized bills
 * in progress (`useActiveBills`), plus open orders split by kitchen progress
 * (`useBillableOrders`): kitchen-done orders under "Ready to bill" (tappable —
 * calls the ported `generateBill`, then opens the resulting bill) and orders
 * the kitchen is still working on under "Preparing…" (not billable — food
 * first, pay after — but cancellable, so an abandoned counter order can't sit
 * there forever). All data is live; every write goes
 * through `cashierApi` — this screen never touches Firestore or does money
 * math.
 */
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarClearance } from "@/lib/useTabBarClearance";
import { formatMoney } from "@/lib/money";
import { FadeSlideIn } from "@/components/FadeSlideIn";
import { ElapsedTime } from "@/components/ElapsedTime";
import { BillListSkeleton } from "@/components/Skeleton";
import {
  mediumTapFeedback,
  successFeedback,
  tapFeedback,
} from "@/lib/feedback";
import { colors, fonts, radius, shadow, space, typography, opacity } from "@/theme/theme";
import type { Bill, Order, Table } from "@/types/models";
import { useAuth } from "@/features/auth/AuthContext";
import { useSettings } from "@/features/settings/SettingsContext";
import { cancelOpenOrder, generateBill } from "./cashierApi";
import {
  useActiveBills,
  useAllTables,
  useBillableOrders,
} from "./useCashierData";
import { BillDetail } from "./BillDetail";

type BillRow = { kind: "bill"; bill: Bill & { id: string } };
type OrderRow = { kind: "order"; order: Order & { id: string } };
type PreparingRow = { kind: "preparing"; order: Order & { id: string } };
type Row = BillRow | OrderRow | PreparingRow;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
};

// The old local `timeAgo(fromMs, nowMs)` was replaced by <ElapsedTime>, which
// produces the identical label (lib/date `agoLabel`) but drives itself from a
// shared ticker instead of a `now` prop. That prop was a fresh number on every
// render, so it re-rendered every card in the list — and, being computed during
// render rather than on a timer, the labels only refreshed when something else
// happened to re-render the screen.

export function BillsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { profile, firebaseUser, role } = useAuth();
  const cashierUid = profile?.uid ?? firebaseUser?.uid ?? "";
  const cashierName = profile?.name ?? "Cashier";
  const roleLabel = role ? ROLE_LABELS[role] ?? role : "";

  const { gstEnabled } = useSettings();

  const { data: bills, loading: billsLoading } = useActiveBills();
  const {
    data: orders,
    preparing,
    loading: ordersLoading,
  } = useBillableOrders();
  const { data: tables } = useAllTables();

  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const tableLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tables as (Table & { id: string })[]) {
      map.set(t.id, t.label ?? `T${t.number}`);
    }
    return map;
  }, [tables]);

  const orderLabel = useCallback(
    (o: Order): string => {
      if (o.tableId) return tableLabelById.get(o.tableId) ?? "Table";
      return o.orderType === "delivery" ? "Delivery" : "Takeaway";
    },
    [tableLabelById]
  );

  const sections = useMemo(() => {
    const billRows: Row[] = [...bills]
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
      .map((bill) => ({ kind: "bill", bill }));
    const orderRows: Row[] = [...orders]
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
      .map((order) => ({ kind: "order", order }));
    const preparingRows: Row[] = [...preparing]
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
      .map((order) => ({ kind: "preparing", order }));

    return [
      { title: "Bills", data: billRows },
      { title: "Ready to bill", data: orderRows },
      { title: "Preparing…", data: preparingRows },
    ].filter((s) => s.data.length > 0);
  }, [bills, orders, preparing]);

  const loading = billsLoading || ordersLoading;

  const handleSelectBill = useCallback((bill: Bill & { id: string }) => {
    tapFeedback(); // opening the bill detail sheet
    setSelectedBillId(bill.id);
  }, []);

  const handleGenerate = useCallback(
    async (order: Order & { id: string }) => {
    if (generatingId) return;
    mediumTapFeedback(); // weighty tap kicking off billing
    setGeneratingId(order.id);
    try {
      const billId = await generateBill(
        order,
        cashierUid,
        orderLabel(order),
        gstEnabled
      );
      successFeedback(); // bill generated
      setSelectedBillId(billId);
    } catch (e) {
      Alert.alert("Could not bill", e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingId(null);
    }
    },
    [generatingId, cashierUid, orderLabel, gstEnabled]
  );

  /**
   * Discard a stuck "Preparing…" order. Confirmed first, and worded to match
   * how far it actually got: a partly-fired order means food may already be on
   * the pass, so the cashier is told that before they discard it.
   */
  const handleCancelPreparing = useCallback(
    (order: Order & { id: string }) => {
    if (cancellingId) return;
    const fired = order.items.some(
      (i) => !i.voided && i.qty > 0 && i.kotStatus !== "pending"
    );
    tapFeedback();
    Alert.alert(
      "Discard this order?",
      fired
        ? `${orderLabel(order)} (${formatMoney(order.subtotal)}) was partly sent to the kitchen. Discarding clears its ticket off the kitchen board and nothing will be charged. This cannot be undone.`
        : `${orderLabel(order)} (${formatMoney(order.subtotal)}) never reached the kitchen. Discarding removes it from this list. This cannot be undone.`,
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setCancellingId(order.id);
              try {
                await cancelOpenOrder(order.id);
                successFeedback();
              } catch (e) {
                Alert.alert(
                  "Could not discard",
                  e instanceof Error ? e.message : String(e)
                );
              } finally {
                setCancellingId(null);
              }
            })();
          },
        },
      ]
    );
    },
    [cancellingId, orderLabel]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    []
  );

  // Stable identity so the memo() on the three cards actually holds — this
  // list re-renders on every bill, order and KOT snapshot.
  const renderRow = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === "bill" ? (
        <BillCard bill={item.bill} onPress={handleSelectBill} />
      ) : item.kind === "order" ? (
        <OrderCard
          order={item.order}
          label={orderLabel(item.order)}
          busy={generatingId === item.order.id}
          disabled={generatingId !== null}
          onPress={handleGenerate}
        />
      ) : (
        <PreparingCard
          order={item.order}
          label={orderLabel(item.order)}
          busy={cancellingId === item.order.id}
          disabled={cancellingId !== null}
          onCancel={handleCancelPreparing}
        />
      ),
    [
      handleSelectBill,
      orderLabel,
      generatingId,
      cancellingId,
      handleGenerate,
      handleCancelPreparing,
    ]
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header — cashier identity */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {cashierName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Bills</Text>
          <Text style={styles.subtitle}>
            {cashierName}
            {roleLabel ? ` · ${roleLabel}` : ""}
          </Text>
        </View>
      </View>

      {loading ? (
        <BillListSkeleton />
      ) : (
      <FadeSlideIn>
      <SectionList
        sections={sections}
        keyExtractor={(item) =>
          item.kind === "bill"
            ? `b:${item.bill.id}`
            : item.kind === "order"
              ? `o:${item.order.id}`
              : `p:${item.order.id}`
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: tabBarClearance + space.s6 },
        ]}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderRow}
        ListEmptyComponent={
          <Text style={styles.empty}>No bills to settle right now.</Text>
        }
      />
      </FadeSlideIn>
      )}

      <Modal
        visible={selectedBillId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedBillId(null)}
      >
        {selectedBillId && (
          <View style={{ flex: 1, paddingTop: insets.top }}>
            <BillDetail
              billId={selectedBillId}
              onClose={() => setSelectedBillId(null)}
            />
          </View>
        )}
      </Modal>
    </View>
  );
}

function statusMeta(status: Bill["status"]): { label: string; bg: string; fg: string } {
  switch (status) {
    case "requested":
      return { label: "Requested", bg: colors.navySoft, fg: colors.navyText };
    case "finalized":
      return { label: "In progress", bg: colors.primarySoft, fg: colors.primary };
    case "paid":
      return { label: "Paid", bg: colors.surfaceMuted, fg: colors.textMuted };
    default:
      return { label: status, bg: colors.surfaceMuted, fg: colors.textMuted };
  }
}

const BillCard = memo(function BillCard({
  bill,
  onPress,
}: {
  bill: Bill & { id: string };
  /** Takes the bill so the screen can pass ONE stable handler to every card. */
  onPress: (bill: Bill & { id: string }) => void;
}) {
  const meta = statusMeta(bill.status);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(bill)}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitleText}>{bill.tableLabel}</Text>
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.cardTotal}>{formatMoney(bill.grandTotal)}</Text>
        {bill.createdAt && (
          <ElapsedTime
            createdAt={bill.createdAt}
            intervalMs={30_000}
            style={styles.cardTime}
          />
        )}
      </View>
    </Pressable>
  );
});

const OrderCard = memo(function OrderCard({
  order,
  label,
  busy,
  disabled,
  onPress,
}: {
  order: Order & { id: string };
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: (order: Order & { id: string }) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        disabled && !busy && styles.cardDim,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(order)}
      disabled={disabled}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitleText}>{label}</Text>
        <View style={styles.readyBtn}>
          {busy ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.readyBtnText}>Bill →</Text>
          )}
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.cardTotal}>{formatMoney(order.subtotal)}</Text>
        {order.createdAt && (
          <ElapsedTime
            createdAt={order.createdAt}
            intervalMs={30_000}
            style={styles.cardTime}
          />
        )}
      </View>
    </Pressable>
  );
});

/** Kitchen still cooking: visible so the cashier knows the order exists, but
 *  greyed out and not billable until every ticket is completed (it then moves
 *  to "Ready to bill" automatically). Discard is the way out for one that will
 *  never get there — an abandoned counter order, or one only partly fired. */
const PreparingCard = memo(function PreparingCard({
  order,
  label,
  busy,
  disabled,
  onCancel,
}: {
  order: Order & { id: string };
  label: string;
  busy: boolean;
  disabled: boolean;
  onCancel: (order: Order & { id: string }) => void;
}) {
  return (
    <View style={[styles.card, styles.cardDim]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitleText}>{label}</Text>
        <View style={[styles.pill, { backgroundColor: colors.navySoft }]}>
          <Text style={[styles.pillText, { color: colors.navyText }]}>
            Preparing…
          </Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.cardTotal}>{formatMoney(order.subtotal)}</Text>
        {order.createdAt && (
          <ElapsedTime
            createdAt={order.createdAt}
            intervalMs={30_000}
            style={styles.cardTime}
          />
        )}
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.discardBtn,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onCancel(order)}
        disabled={disabled}
        hitSlop={8}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.danger} />
        ) : (
          <Text style={styles.discardBtnText}>Discard order</Text>
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingTop: space.s4,
    paddingBottom: space.s3,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontFamily: fonts.bold, color: colors.textInverse },
  headerText: { flex: 1 },
  title: { ...typography.screenTitle, color: colors.text },
  subtitle: { ...typography.screenSubtitle, color: colors.textMuted, marginTop: 2 },

  list: { paddingHorizontal: space.s4 },
  sectionHeader: {
    ...typography.sectionLabel,
    color: colors.textMuted,
    marginTop: space.s4,
    marginBottom: space.s2,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    padding: space.s6,
    fontFamily: fonts.regular,
    fontSize: 14,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.s4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.s3,
    ...shadow.card,
  },
  cardDim: { opacity: 0.6 },
  cardPressed: { opacity: opacity.pressed, transform: [{ scale: 0.98 }] },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitleText: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: space.s3,
  },
  cardTotal: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  cardTime: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },

  discardBtn: {
    alignSelf: "flex-start",
    marginTop: space.s3,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  discardBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.danger },

  pill: {
    paddingHorizontal: space.s2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 11, fontFamily: fonts.bold },

  readyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    borderRadius: radius.pill,
    minWidth: 64,
    alignItems: "center",
  },
  readyBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.textInverse },
});
