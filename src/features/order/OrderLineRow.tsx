/**
 * A single line row inside the Current Order sheet.
 *
 * Un-sent (`pending`) lines are editable: a `−  qty  +` stepper (qty 0 removes
 * the line) and a per-line "Special instructions" field mapped to
 * `OrderItem.notes`. Once a line has been fired to the kitchen it locks and
 * shows its live `kotStatus` so the waiter can watch kitchen progress.
 */
import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { formatMoney } from "@/lib/money";
import { colors, radius, space } from "@/theme/theme";
import type { KotItemStatus, OrderItem } from "@/types/models";

interface OrderLineRowProps {
  line: OrderItem;
  /** Commit a new quantity (0 removes the line). Pending lines only. */
  onQty: (qty: number) => void;
  /** Commit special-instructions text. Pending lines only. */
  onNotes: (notes: string) => void;
}

const STATUS_LABEL: Record<KotItemStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

function OrderLineRowImpl({ line, onQty, onNotes }: OrderLineRowProps) {
  const editable = line.kotStatus === "pending" && !line.voided;
  const [notes, setNotes] = useState(line.notes ?? "");

  // Keep local field in sync when the underlying line changes remotely.
  useEffect(() => {
    setNotes(line.notes ?? "");
  }, [line.notes]);

  return (
    <View style={styles.row}>
      <View style={styles.headerRow}>
        <View style={styles.nameCol}>
          <Text style={styles.name} numberOfLines={2}>
            {line.name}
          </Text>
          <Text style={styles.price}>
            {formatMoney(line.price)} × {line.qty}
          </Text>
        </View>

        {editable ? (
          <View style={styles.stepper}>
            <Pressable
              hitSlop={6}
              style={styles.stepBtn}
              onPress={() => onQty(line.qty - 1)}
            >
              <Text style={styles.stepGlyph}>−</Text>
            </Pressable>
            <Text style={styles.stepQty}>{line.qty}</Text>
            <Pressable
              hitSlop={6}
              style={styles.stepBtn}
              onPress={() => onQty(line.qty + 1)}
            >
              <Text style={styles.stepGlyph}>+</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {STATUS_LABEL[line.kotStatus]}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.lineTotalRow}>
        <Text style={styles.lineTotal}>
          {formatMoney(line.price * line.qty)}
        </Text>
      </View>

      {editable ? (
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          onEndEditing={() => {
            const trimmed = notes.trim();
            if (trimmed !== (line.notes ?? "")) onNotes(trimmed);
          }}
          placeholder="Special instructions (e.g., extra ice, no garnish…)"
          placeholderTextColor={colors.textMuted}
          multiline
        />
      ) : line.notes ? (
        <Text style={styles.notesReadonly}>“{line.notes}”</Text>
      ) : null}
    </View>
  );
}

export const OrderLineRow = memo(OrderLineRowImpl);

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.s2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.s3,
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  price: {
    fontSize: 13,
    color: colors.textMuted,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  stepQty: {
    minWidth: 20,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: space.s3,
    paddingVertical: space.s1,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  lineTotalRow: {
    alignItems: "flex-end",
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    fontSize: 13,
    color: colors.text,
    minHeight: 38,
  },
  notesReadonly: {
    fontSize: 13,
    fontStyle: "italic",
    color: colors.textMuted,
  },
});
