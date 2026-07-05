/**
 * A single menu-item card for the Waiter New Order grid.
 *
 * Mirrors the SADA look (square image, name, green price). When the item is an
 * un-sent line in the current order the card gets a green border and swaps the
 * circular `+` add button for an inline `−  qty  +` stepper.
 */
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { formatMoney } from "@/lib/money";
import { colors, radius, shadow, space } from "@/theme/theme";
import type { MenuItem } from "@/types/models";

interface OrderMenuCardProps {
  item: MenuItem & { id: string };
  /** Qty of this item on the current (editable/pending) order line; 0 = none. */
  qty: number;
  onAdd: () => void;
  onDecrement: () => void;
  disabled?: boolean;
}

function OrderMenuCardImpl({
  item,
  qty,
  onAdd,
  onDecrement,
  disabled,
}: OrderMenuCardProps) {
  const inOrder = qty > 0;
  return (
    <View style={[styles.card, inOrder && styles.cardInOrder]}>
      {item.imageUrl ? (
        <Image
          style={styles.image}
          source={{ uri: item.imageUrl }}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderIcon}>🍽</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(item.price)}</Text>

          {inOrder ? (
            <View style={styles.stepper}>
              <Pressable
                hitSlop={8}
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={onDecrement}
                disabled={disabled}
              >
                <Text style={styles.stepGlyph}>−</Text>
              </Pressable>
              <Text style={styles.stepQty}>{qty}</Text>
              <Pressable
                hitSlop={8}
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={onAdd}
                disabled={disabled}
              >
                <Text style={styles.stepGlyph}>+</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              hitSlop={8}
              style={({ pressed }) => [
                styles.addBtn,
                disabled && styles.addBtnDisabled,
                pressed && styles.btnPressed,
              ]}
              onPress={onAdd}
              disabled={disabled}
            >
              <Text style={styles.addGlyph}>＋</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export const OrderMenuCard = memo(OrderMenuCardImpl);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardInOrder: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 32,
    color: colors.textMuted,
  },
  body: {
    padding: space.s3,
    gap: space.s2,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.9 }],
  },
  addGlyph: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
  },
  stepBtn: {
    width: 28,
    height: 28,
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
    minWidth: 18,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
});
