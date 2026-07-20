/**
 * A single menu-item card for the Waiter New Order grid.
 *
 * Premium SADA look: a borderless pure-white card with a soft, blurred drop
 * shadow, a rounded image (Feather placeholder when none), and a green price.
 * When the item is an un-sent line in the current order the circular `+` add
 * button becomes a soft-gray `−  qty  +` stepper. Steppers spring on press.
 */
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { formatMoney } from "@/lib/money";
import { PressableScale } from "@/components/PressableScale";
import { DietBadge } from "@/features/menu/DietBadge";
import { useMenuImage } from "@/features/menu/menuImageStore";
import { colors, fonts, radius, shadow, space } from "@/theme/theme";
import type { MenuItem } from "@/types/models";

interface OrderMenuCardProps {
  item: MenuItem & { id: string };
  /** Qty of this item on the current (editable/pending) order line; 0 = none. */
  qty: number;
  /** lineId of that pending line, or null when the item isn't on the order. */
  pendingLineId: string | null;
  /**
   * Both take their arguments rather than closing over them, so the screen can
   * hand down ONE stable function for the whole grid. Per-card arrow props
   * (`onAdd={() => add(item)}`) are rebuilt on every parent render and silently
   * defeat the memo() below — which is what made search-as-you-type crawl.
   */
  onAdd: (item: MenuItem & { id: string }) => void;
  onDecrement: (lineId: string, nextQty: number) => void;
  disabled?: boolean;
}

function OrderMenuCardImpl({
  item,
  qty,
  pendingLineId,
  onAdd,
  onDecrement,
  disabled,
}: OrderMenuCardProps) {
  const inOrder = qty > 0;
  // Pulled lazily from menuItemImages/{id}; undefined until it lands, which
  // renders the placeholder for a beat instead of blocking the whole grid.
  const imageSource = useMenuImage(item);
  // Cheap to rebuild here: this only runs when the card itself re-renders.
  const handleAdd = () => onAdd(item);
  const handleDecrement = () => {
    if (pendingLineId) onDecrement(pendingLineId, qty - 1);
  };
  return (
    <View style={styles.card}>
      {imageSource ? (
        <Image
          style={styles.image}
          source={imageSource}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Feather name="image" size={26} color={colors.borderStrong} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <DietBadge type={item.dietType} size={15} />
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(item.price)}</Text>

          {inOrder ? (
            <View style={styles.stepper}>
              <PressableScale
                hitSlop={8}
                style={styles.stepBtn}
                onPress={handleDecrement}
                disabled={disabled}
              >
                <Text style={styles.stepGlyph}>−</Text>
              </PressableScale>
              <Text style={styles.stepQty}>{qty}</Text>
              <PressableScale
                hitSlop={8}
                style={styles.stepBtn}
                onPress={handleAdd}
                disabled={disabled}
              >
                <Text style={styles.stepGlyph}>+</Text>
              </PressableScale>
            </View>
          ) : (
            <PressableScale
              hitSlop={8}
              style={[styles.addBtn, disabled && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={disabled}
            >
              <Text style={styles.addGlyph}>＋</Text>
            </PressableScale>
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
    borderRadius: radius.xl,
    ...shadow.float,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.floor,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: space.s3,
    gap: space.s2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s1,
  },
  name: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
  },
  price: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
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
  addGlyph: {
    color: colors.textInverse,
    fontSize: 18,
    fontFamily: fonts.bold,
    lineHeight: 20,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s1,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.bold,
    lineHeight: 19,
  },
  stepQty: {
    minWidth: 14,
    textAlign: "center",
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
  },
});
