/**
 * Waiter New Order + KOT screen (React Native).
 *
 * A port of the web "New Order" flow: the data/API layer is reused verbatim —
 * this file only builds the UI. All reads come from the ported live hooks
 * (`useOrderData`) and every write goes through the ported `orderApi` helpers
 * (never Firestore directly).
 *
 * Flow:
 *   - Dine-in (`tableId` set): resolves the table's open order live and appends
 *     to it; the first add creates the order + occupies the table (in orderApi).
 *   - Takeaway (`tableId` absent): the first add creates a fresh order whose id
 *     we remember for subsequent reads/writes.
 *   - Adding fires `pending` lines; "Send KOT" batches them into a new ticket
 *     and flips them to `sent`. Adding more later + Send KOT again = a 2nd
 *     ticket with only the new lines. KDS progress mirrors back onto each line's
 *     `kotStatus` via `syncLineStatuses`.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney } from "@/lib/money";
import { colors, radius, shadow, space } from "@/theme/theme";
import { useAuth } from "@/features/auth/AuthContext";
import type { KotStatus, KotItemStatus, MenuItem, OrderItem } from "@/types/models";
import {
  addOrCreateOrder,
  sendKot,
  setLineNotes,
  syncLineStatuses,
  updateLineQty,
} from "./orderApi";
import {
  useKotsForOrder,
  useMenuCategories,
  useMenuItems,
  useOpenOrderForTable,
  useOrder,
  useTable,
} from "./useOrderData";
import { OrderMenuCard } from "./OrderMenuCard";
import { OrderLineRow } from "./OrderLineRow";

const ALL = "__all__";
const SPACER = "__spacer__";

type MenuItemDoc = MenuItem & { id: string };
type GridEntry = MenuItemDoc | { id: typeof SPACER };

/** Map a kitchen ticket status onto the matching per-line lifecycle status. */
function kotToLineStatus(status: KotStatus): KotItemStatus {
  switch (status) {
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "completed":
      return "served";
    default:
      return "sent";
  }
}

export function OrderScreen({ tableId }: { tableId?: string }) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const waiterId = profile?.uid ?? "";

  const isDineIn = !!tableId;
  const orderType = isDineIn ? "dine-in" : "takeaway";

  // ── Live data ───────────────────────────────────────────────────────────
  const categoriesState = useMenuCategories();
  const itemsState = useMenuItems();
  const tableState = useTable(tableId ?? null);
  const openOrderState = useOpenOrderForTable(tableId ?? null);

  // Takeaway orders have no table pointer, so we remember the id the first add
  // mints and subscribe to it directly.
  const [takeawayOrderId, setTakeawayOrderId] = useState<string | null>(null);
  const takeawayOrderState = useOrder(isDineIn ? null : takeawayOrderId);

  const order = isDineIn ? openOrderState.order : takeawayOrderState.data;
  const orderId = order?.id ?? null;

  const tableLabel = isDineIn
    ? tableState.data?.label ??
      (tableState.data ? `T${tableState.data.number}` : tableId ?? "Table")
    : "Takeaway";

  // Mirror KDS progress back onto the order lines. syncLineStatuses no-ops when
  // nothing changed, so this settles instead of looping.
  const kotsState = useKotsForOrder(orderId);
  useEffect(() => {
    if (!orderId || kotsState.data.length === 0) return;
    const map = new Map<string, KotItemStatus>();
    for (const k of kotsState.data) map.set(k.id, kotToLineStatus(k.status));
    syncLineStatuses(orderId, map).catch(() => {});
  }, [orderId, kotsState.data]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const enabledCategories = useMemo(
    () => categoriesState.data.filter((c) => c.enabled),
    [categoriesState.data]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return itemsState.data.filter((it) => {
      if (!it.enabled) return false;
      if (activeCategory !== ALL && it.categoryId !== activeCategory) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.sku ? it.sku.toLowerCase().includes(q) : false)
      );
    });
  }, [itemsState.data, activeCategory, search]);

  // Pad to an even count so a lone trailing card doesn't stretch full-width.
  const gridData: GridEntry[] = useMemo(
    () =>
      filteredItems.length % 2 === 1
        ? [...filteredItems, { id: SPACER }]
        : filteredItems,
    [filteredItems]
  );

  const lines: OrderItem[] = order?.items?.filter((l) => !l.voided) ?? [];

  // menuItemId -> the editable (pending, note-less) line, for the card stepper.
  const pendingByItem = useMemo(() => {
    const map = new Map<string, OrderItem>();
    for (const l of lines) {
      if (l.kotStatus === "pending" && !l.voided && !l.notes) {
        map.set(l.menuItemId, l);
      }
    }
    return map;
  }, [lines]);

  const pendingCount = useMemo(
    () => lines.filter((l) => l.kotStatus === "pending").length,
    [lines]
  );
  const itemCount = useMemo(
    () => lines.reduce((n, l) => n + l.qty, 0),
    [lines]
  );
  const subtotal = order?.subtotal ?? 0;

  // ── Writes (all via orderApi) ─────────────────────────────────────────────
  const handleAdd = async (item: MenuItemDoc) => {
    if (!waiterId || busy) return;
    setBusy(true);
    try {
      const id = await addOrCreateOrder({
        orderId,
        tableId: tableId ?? null,
        tableLabel,
        orderType,
        waiterId,
        menuItemId: item.id,
        name: item.name,
        price: item.price,
      });
      if (!isDineIn) setTakeawayOrderId(id);
    } catch {
      // Swallow — the live subscription is the source of truth; a failed write
      // simply leaves the order unchanged.
    } finally {
      setBusy(false);
    }
  };

  const handleQty = (lineId: string, qty: number) => {
    if (!orderId) return;
    updateLineQty(orderId, lineId, qty).catch(() => {});
  };

  const handleNotes = (lineId: string, notes: string) => {
    if (!orderId) return;
    setLineNotes(orderId, lineId, notes).catch(() => {});
  };

  const handleSendKot = async () => {
    if (!orderId || pendingCount === 0 || busy) return;
    setBusy(true);
    try {
      await sendKot(orderId, tableLabel);
    } catch {
      // no-op; lines stay pending on failure.
    } finally {
      setBusy(false);
    }
  };

  const loading = categoriesState.loading || itemsState.loading;
  const errorState =
    categoriesState.error || itemsState.error || openOrderState.error;

  const renderCard = ({ item }: { item: GridEntry }) => {
    if (item.id === SPACER) return <View style={styles.gridCell} />;
    const menuItem = item as MenuItemDoc;
    const pending = pendingByItem.get(menuItem.id);
    return (
      <View style={styles.gridCell}>
        <OrderMenuCard
          item={menuItem}
          qty={pending?.qty ?? 0}
          disabled={busy || !waiterId}
          onAdd={() => handleAdd(menuItem)}
          onDecrement={() =>
            pending && handleQty(pending.lineId, pending.qty - 1)
          }
        />
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* App header */}
      <View style={styles.appBar}>
        <Text style={styles.brand}>SADA POS</Text>
        <Text style={styles.bell}>🔔</Text>
      </View>

      {/* Title */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>New Order</Text>
        <Text style={styles.subtitle}>
          {isDineIn ? `Dine-in · ${tableLabel}` : "Takeaway"} · Manage and
          organize your offerings.
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search menu items, SKUs, or ingredients…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
      </View>

      {/* Category chips */}
      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Chip
            label="All Items"
            active={activeCategory === ALL}
            onPress={() => setActiveCategory(ALL)}
          />
          {enabledCategories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={activeCategory === c.id}
              onPress={() => setActiveCategory(c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Menu grid */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : errorState ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn’t load the menu.</Text>
          <Text style={styles.emptySub}>{errorState.message}</Text>
        </View>
      ) : (
        <FlatList
          data={gridData}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.gridContent,
            { paddingBottom: insets.bottom + (lines.length > 0 ? 96 : space.s6) },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No items found.</Text>
            </View>
          }
        />
      )}

      {/* Collapsed cart bar */}
      {lines.length > 0 && !sheetOpen ? (
        <Pressable
          style={[styles.cartBar, { bottom: insets.bottom + space.s4 }]}
          onPress={() => setSheetOpen(true)}
        >
          <Text style={styles.cartBarText}>
            🛍 View Order · {itemCount} Item{itemCount === 1 ? "" : "s"}
          </Text>
          <Text style={styles.cartBarText}>{formatMoney(subtotal)}</Text>
        </Pressable>
      ) : null}

      {/* Current Order sheet */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.backdropFill}
            onPress={() => setSheetOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.s3 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>🛒 Current Order</Text>
              <Pressable hitSlop={8} onPress={() => setSheetOpen(false)}>
                <Text style={styles.addItemsLink}>＋ Add Items</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {lines.length === 0 ? (
                <Text style={styles.emptySub}>No items yet.</Text>
              ) : (
                lines.map((line) => (
                  <OrderLineRow
                    key={line.lineId}
                    line={line}
                    onQty={(qty) => handleQty(line.lineId, qty)}
                    onNotes={(notes) => handleNotes(line.lineId, notes)}
                  />
                ))
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable
                style={[
                  styles.sendBtn,
                  (pendingCount === 0 || busy) && styles.sendBtnDisabled,
                ]}
                onPress={handleSendKot}
                disabled={pendingCount === 0 || busy}
              >
                <Text style={styles.sendBtnText}>
                  ➤ Send KOT{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </Text>
              </Pressable>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatMoney(subtotal)}</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
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
  bell: {
    fontSize: 18,
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    marginHorizontal: space.s4,
    marginBottom: space.s2,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 14,
    color: colors.textMuted,
  },
  searchInput: {
    flex: 1,
    paddingVertical: space.s3,
    fontSize: 15,
    color: colors.text,
  },
  chipsWrap: {
    paddingBottom: space.s2,
  },
  chipsRow: {
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  chip: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipText: {
    fontSize: 13,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: "600",
  },
  gridContent: {
    paddingHorizontal: space.s4,
    paddingTop: space.s2,
  },
  gridRow: {
    gap: space.s3,
    marginBottom: space.s3,
  },
  gridCell: {
    flex: 1,
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
  cartBar: {
    position: "absolute",
    left: space.s4,
    right: space.s4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    paddingHorizontal: space.s5,
    paddingVertical: space.s4,
    borderRadius: radius.md,
    ...shadow.card,
  },
  cartBarText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: "700",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.s4,
    paddingTop: space.s4,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space.s2,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  addItemsLink: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    paddingTop: space.s3,
  },
  sendBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: space.s4,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "800",
  },
  totalBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.s4,
    paddingVertical: space.s2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  totalLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
});
