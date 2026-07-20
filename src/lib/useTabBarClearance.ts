import { useContext } from "react";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * How much space the bottom of a screen must leave clear.
 *
 * The tab bar is transparent with a blur panel behind it (see `(app)/_layout`),
 * so anything a screen draws at the bottom stays *visible* through the frost
 * but ends up unreadable and un-tappable underneath it. Padding by
 * `insets.bottom` is not enough: that's only the safe-area inset, while the bar
 * is roughly 49pt *plus* that inset. Screens that did the former left their
 * last row — Sign Out, the save button, the floating cart CTA — sitting under
 * the blur.
 *
 * Returns the real bar height inside the tab navigator, and falls back to the
 * plain safe-area inset elsewhere (modals, which cover the bar, and the
 * unauthenticated stack, which has none). Reading the context directly rather
 * than calling `useBottomTabBarHeight()` is what makes that fallback possible —
 * the hook throws when no tab bar is present.
 */
export function useTabBarClearance(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  return tabBarHeight ?? insets.bottom;
}
