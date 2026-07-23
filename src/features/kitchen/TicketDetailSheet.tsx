/**
 * KDS detail popup — opened by tapping a table card on the board.
 *
 * Shows everything the kitchen needs for one table that the compact card
 * truncates: every round (first + additional) with its ticket number, status
 * pill, fire time, elapsed and reprint, the FULL item list with notes and
 * voided lines, and the same Start / Ready / Completed group actions.
 *
 * CASHIER ONLY: each un-voided line on an active ticket also gets a Remove
 * button — when the kitchen or a waiter asks for an item to come off a fired
 * order, only the cashier can void it (struck through on the ticket, dropped
 * from the bill). No other role ever sees the button. The cashier also gets a
 * ⋮ menu in the header whose Reprint re-fires EVERY round in one go, for when
 * the whole ticket has to be put back on the pass.
 */
import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, shadow, space } from "@/theme/theme";
import { formatTimeIST } from "@/lib/date";
import { animateNextLayout, tapFeedback } from "@/lib/feedback";
import { ElapsedTime } from "@/components/ElapsedTime";
import { useRestaurantProfile } from "@/features/settings/useRestaurantProfile";
import { encodeKot } from "@/lib/printer/escpos";
import {
  PRINTING_UNAVAILABLE_MESSAGE,
  getPaperWidth,
  isPrintingAvailable,
  printToSavedPrinter,
} from "@/lib/printer/printerService";
import { useAuth } from "@/features/auth/AuthContext";
import type { Kot, KotItem, KotStatus } from "@/types/models";
import { reprintKot, voidKotItem } from "./kdsApi";
import { completeGroup, readyGroup, startGroup } from "./groupActions";
import {
  additionalItemCount,
  hasAdditionalRound,
  type LiveKot,
  type TableGroup,
} from "./groupKots";

const STATUS_META: Record<
  KotStatus,
  { label: string; color: string; soft: string }
> = {
  new: { label: "NEW", color: colors.statusRed, soft: colors.statusRedSoft },
  preparing: {
    label: "PREPARING",
    color: colors.statusIndigo,
    soft: colors.statusIndigoSoft,
  },
  ready: { label: "READY", color: colors.primary, soft: colors.primarySoft },
  completed: {
    label: "COMPLETED",
    color: colors.statusGreen,
    soft: colors.statusGreenSoft,
  },
};

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

/** Sentinel for `printingId` while the whole ticket is being re-fired. */
const ALL_ROUNDS = "__all__";

function itemCount(kot: LiveKot): number {
  return kot.items.reduce((n, it) => (it.voided ? n : n + it.qty), 0);
}

export function TicketDetailSheet({
  group,
  onClose,
}: {
  group: TableGroup;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const additional = hasAdditionalRound(group);
  const accent = group.completed
    ? colors.statusGreen
    : additional
      ? colors.statusIndigo
      : colors.statusRed;

  const first = group.tickets[0];
  const totalItems = group.tickets.reduce((n, t) => n + itemCount(t), 0);
  const anyNew = group.tickets.some((t) => t.status === "new");
  const anyPreparing = group.tickets.some((t) => t.status === "preparing");

  const run = useCallback((write: Promise<unknown>) => {
    tapFeedback();
    animateNextLayout(); // the group may leave the board behind the sheet
    write.catch((e) =>
      Alert.alert(
        "Couldn’t update ticket",
        e instanceof Error ? e.message : String(e)
      )
    );
  }, []);

  // Remove-item power is the cashier's alone: kitchen/waiter must ask the
  // cashier to take a line off a fired ticket. (Rules enforce this server-side
  // too — only a cashier may write `items` on a kot.)
  const { role } = useAuth();
  const isCashier = role === "cashier";
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);

  const onRemoveItem = useCallback((kot: LiveKot, item: KotItem) => {
    Alert.alert(
      "Remove item?",
      `${item.qty}× ${item.name} will be marked VOID on ticket #${kot.ticketNumber} and taken off the bill.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            tapFeedback();
            setRemovingLineId(item.lineId);
            voidKotItem(kot, item.lineId)
              .catch((e) =>
                Alert.alert(
                  "Couldn’t remove item",
                  e instanceof Error ? e.message : String(e)
                )
              )
              .finally(() => setRemovingLineId(null));
          },
        },
      ]
    );
  }, []);

  // Reprint = real thermal print of that round's KOT, then bump printedCount
  // (print first, count after — same order as BillDetail). In Expo Go the
  // Bluetooth module doesn't exist, so explain instead of crashing.
  const { data: restaurant } = useRestaurantProfile();
  const [printingId, setPrintingId] = useState<string | null>(null);

  const printOneKot = useCallback(
    async (kot: LiveKot) => {
      const paperWidth = await getPaperWidth();
      const ticket = encodeKot({
        profile: restaurant ?? { name: "SADA POS" },
        kot,
        paperWidth,
      });
      await printToSavedPrinter(ticket.bytes);
      await reprintKot(kot); // bytes accepted → count the print
    },
    [restaurant]
  );

  const printFailed = useCallback((e: unknown) => {
    Alert.alert(
      "Couldn’t print",
      (e instanceof Error ? e.message : String(e)) +
        "\n\nCheck Account > Printer Settings."
    );
  }, []);

  const onReprint = useCallback(
    (kot: LiveKot) => {
      if (printingId) return;
      if (!isPrintingAvailable()) {
        Alert.alert("Printing unavailable", PRINTING_UNAVAILABLE_MESSAGE);
        return;
      }
      tapFeedback();
      setPrintingId(kot.id);
      void printOneKot(kot)
        .catch(printFailed)
        .finally(() => setPrintingId(null));
    },
    [printingId, printFailed, printOneKot]
  );

  // Cashier's ⋮ → Reprint: every round of this table, oldest first, one ticket
  // per round (each KOT keeps its own number, so they can't be merged into one
  // slip). Stops at the first failure — a half-printed run is reported rather
  // than silently continued.
  const [menuOpen, setMenuOpen] = useState(false);

  const onReprintAll = useCallback(() => {
    setMenuOpen(false);
    if (printingId) return;
    if (!isPrintingAvailable()) {
      Alert.alert("Printing unavailable", PRINTING_UNAVAILABLE_MESSAGE);
      return;
    }
    tapFeedback();
    setPrintingId(ALL_ROUNDS);
    void (async () => {
      try {
        for (const kot of group.tickets) await printOneKot(kot);
      } catch (e) {
        printFailed(e);
      } finally {
        setPrintingId(null);
      }
    })();
  }, [group.tickets, printingId, printFailed, printOneKot]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.s4 }]}>
          {/* ── Header: table + status + close ─────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.dot, { backgroundColor: accent }]} />
              <Text style={styles.tableLabel}>{group.tableLabel}</Text>
              {additional && (
                <View style={styles.plusBadge}>
                  <Text style={styles.plusBadgeText}>
                    +{additionalItemCount(group)} additional
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.headerRight}>
              {isCashier && (
                <Pressable
                  onPress={() => {
                    tapFeedback();
                    setMenuOpen((v) => !v);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Ticket options"
                  style={({ pressed }) => [
                    styles.closeBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.kebabGlyph}>⋮</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.closeGlyph}>✕</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.subLine}>
            {orderTypeLabel(first.orderType)} · first order{" "}
            {first.createdAt ? formatTimeIST(first.createdAt.toDate()) : "—"} ·{" "}
            <ElapsedTime createdAt={first.createdAt} /> · {totalItems}{" "}
            {totalItems === 1 ? "item" : "items"}
          </Text>

          {/* ── Rounds ─────────────────────────────────────────────────── */}
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {group.tickets.map((t, round) => (
              <RoundSection
                key={t.id}
                kot={t}
                round={round}
                printing={printingId === t.id || printingId === ALL_ROUNDS}
                onReprint={onReprint}
                onRemoveItem={isCashier ? onRemoveItem : undefined}
                removingLineId={removingLineId}
              />
            ))}
          </ScrollView>

          {/* ── Actions (same semantics as the card) ───────────────────── */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Pressable
                onPress={() => run(startGroup(group))}
                style={({ pressed }) => [
                  styles.actionBtn,
                  anyNew && styles.startActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.actionText, anyNew && styles.actionTextActive]}
                >
                  Start
                </Text>
              </Pressable>
              <Pressable
                onPress={() => run(readyGroup(group))}
                style={({ pressed }) => [
                  styles.actionBtn,
                  anyPreparing && styles.readyActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.actionText,
                    anyPreparing && styles.actionTextActive,
                  ]}
                >
                  Ready
                </Text>
              </Pressable>
            </View>
            {group.completed ? (
              <View style={[styles.completeBtn, styles.doneState]}>
                <Text style={styles.doneText}>✓ Completed</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => run(completeGroup(group))}
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

          {/* ── Cashier ⋮ menu (overlays the sheet; tap outside to close) ── */}
          {menuOpen && (
            <>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setMenuOpen(false)}
              />
              <View style={styles.menu}>
                <Pressable
                  onPress={onReprintAll}
                  disabled={printingId !== null}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.menuItemText}>
                    {printingId === ALL_ROUNDS ? "Printing…" : "Reprint"}
                  </Text>
                  <Text style={styles.menuItemHint}>
                    {group.tickets.length === 1
                      ? "The whole ticket"
                      : `All ${group.tickets.length} rounds`}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** One KOT round: header (name · #ticket · status), meta line, full items. */
function RoundSection({
  kot,
  round,
  printing,
  onReprint,
  onRemoveItem,
  removingLineId,
}: {
  kot: LiveKot;
  round: number;
  printing: boolean;
  onReprint: (kot: LiveKot) => void;
  /** Present only for the cashier — everyone else never sees Remove. */
  onRemoveItem?: (kot: LiveKot, item: KotItem) => void;
  removingLineId: string | null;
}) {
  const meta = STATUS_META[kot.status];
  const count = itemCount(kot);
  return (
    <View style={[styles.round, round > 0 && styles.roundAdditional]}>
      <View style={styles.roundHeader}>
        <Text style={styles.roundTitle} numberOfLines={1}>
          {round === 0 ? "First round" : `Additional round ${round}`} · #
          {kot.ticketNumber}
        </Text>
        <View style={[styles.pill, { backgroundColor: meta.soft }]}>
          <Text style={[styles.pillText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
      </View>
      <View style={styles.roundMeta}>
        <Text style={styles.roundMetaText}>
          {kot.createdAt ? formatTimeIST(kot.createdAt.toDate()) : "—"} ·{" "}
          <ElapsedTime createdAt={kot.createdAt} /> · {count}{" "}
          {count === 1 ? "item" : "items"}
        </Text>
        <Pressable
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => onReprint(kot)}
          disabled={printing}
        >
          <Text style={styles.reprint}>
            {printing
              ? "Printing…"
              : `Reprint${kot.printedCount ? ` (${kot.printedCount})` : ""}`}
          </Text>
        </Pressable>
      </View>
      {kot.items.map((item) => (
        <ItemLine
          key={item.lineId}
          item={item}
          removing={removingLineId === item.lineId}
          onRemove={
            onRemoveItem && !item.voided && kot.status !== "completed"
              ? () => onRemoveItem(kot, item)
              : undefined
          }
        />
      ))}
    </View>
  );
}

function ItemLine({
  item,
  removing,
  onRemove,
}: {
  item: KotItem;
  removing: boolean;
  onRemove?: () => void;
}) {
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
        {item.voided && <Text style={styles.voidTag}>VOID</Text>}
        {onRemove && (
          <Pressable
            hitSlop={8}
            onPress={onRemove}
            disabled={removing}
            style={({ pressed }) => [
              styles.removeBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.removeText}>
              {removing ? "Removing…" : "Remove"}
            </Text>
          </Pressable>
        )}
      </View>
      {notes.map((n, i) => (
        <Text key={i} style={[styles.noteLine, item.voided && styles.voided]}>
          – {n}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.scrim,
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
    maxHeight: "85%",
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  tableLabel: {
    fontSize: 22,
    fontFamily: fonts.extrabold,
    color: colors.text,
  },
  plusBadge: {
    backgroundColor: colors.statusIndigoSoft,
    paddingHorizontal: space.s2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  plusBadgeText: {
    fontSize: 11,
    fontFamily: fonts.extrabold,
    color: colors.statusIndigo,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s1,
  },
  closeBtn: {
    padding: space.s1,
  },
  // "✕" / "⋮" glyphs — leave them on the system font.
  closeGlyph: {
    fontSize: 18,
    color: colors.textMuted,
  },
  kebabGlyph: {
    fontSize: 22,
    lineHeight: 22,
    color: colors.textMuted,
  },
  // Anchored under the ⋮ in the header; sits above the sheet's own content.
  menu: {
    position: "absolute",
    top: space.s4 + 32,
    right: space.s4,
    minWidth: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.s1,
    ...shadow.float,
  },
  menuItem: {
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    gap: 2,
  },
  menuItemText: {
    fontSize: 15,
    fontFamily: fonts.extrabold,
    color: colors.primary,
  },
  menuItemHint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  subLine: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: space.s1,
    marginBottom: space.s2,
  },
  scroll: {
    // Without flexShrink, a long ticket grows past the sheet's maxHeight and
    // pushes the footer actions out of view (RN defaults flexShrink to 0).
    flexGrow: 0,
    flexShrink: 1,
  },
  round: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: space.s3,
    gap: space.s2,
  },
  roundAdditional: {
    backgroundColor: colors.statusIndigoSoft,
    marginHorizontal: -space.s4,
    paddingHorizontal: space.s4,
  },
  roundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
  },
  roundTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontFamily: fonts.extrabold,
    color: colors.text,
  },
  pill: {
    paddingHorizontal: space.s2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: 10,
    fontFamily: fonts.extrabold,
    letterSpacing: 0.4,
  },
  roundMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
  },
  roundMetaText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  reprint: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  itemBlock: {
    gap: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
  },
  qty: {
    fontSize: 15,
    fontFamily: fonts.extrabold,
    color: colors.text,
    minWidth: 28,
  },
  itemName: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  voidTag: {
    fontSize: 10,
    fontFamily: fonts.extrabold,
    color: colors.danger,
  },
  removeBtn: {
    backgroundColor: colors.statusRedSoft,
    paddingHorizontal: space.s2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  removeText: {
    fontSize: 11,
    fontFamily: fonts.extrabold,
    color: colors.danger,
  },
  noteLine: {
    marginLeft: 28 + space.s2,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  voided: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  footer: {
    gap: space.s2,
    paddingTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: {
    flexDirection: "row",
    gap: space.s2,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: space.s3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
  },
  startActive: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  readyActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionText: {
    fontSize: 14,
    fontFamily: fonts.extrabold,
    color: colors.textMuted,
  },
  actionTextActive: {
    color: colors.textInverse,
  },
  completeBtn: {
    paddingVertical: space.s3,
    borderRadius: radius.md,
    alignItems: "center",
  },
  completeText: {
    fontSize: 14,
    fontFamily: fonts.extrabold,
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
  doneState: {
    backgroundColor: colors.statusGreenSoft,
    borderWidth: 1,
    borderColor: colors.statusGreen,
  },
  doneText: {
    fontSize: 14,
    fontFamily: fonts.extrabold,
    color: colors.statusGreen,
    letterSpacing: 0.3,
  },
});
