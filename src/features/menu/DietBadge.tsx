/**
 * FSSAI-style veg / non-veg mark: a small square outline with a filled dot,
 * green for veg and red for non-veg, glowing softly in the same color.
 * Renders nothing when the item has no `dietType` (docs created before the
 * field existed), so legacy items never show a wrong marker.
 */
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/theme";
import type { MenuItem } from "@/types/models";

interface DietBadgeProps {
  type: MenuItem["dietType"];
  size?: number;
}

export function DietBadge({ type, size = 15 }: DietBadgeProps) {
  if (!type) return null;
  const color = type === "veg" ? colors.statusGreen : colors.statusRed;
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderColor: color, shadowColor: color },
      ]}
    >
      <View
        style={{
          width: size * 0.45,
          height: size * 0.45,
          borderRadius: size,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
});
