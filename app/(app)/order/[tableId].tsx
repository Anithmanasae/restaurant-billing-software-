import { useLocalSearchParams } from "expo-router";
import { ScreenPlaceholder } from "@/components/ScreenPlaceholder";

/** Dine-in order for a specific table. */
export default function OrderRoute() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  return <ScreenPlaceholder title={`New Order — Table ${tableId}`} />;
}
