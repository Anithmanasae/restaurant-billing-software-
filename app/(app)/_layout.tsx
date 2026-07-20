import { useEffect, useRef } from "react";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useAuth } from "@/features/auth/AuthContext";
import { selectionFeedback } from "@/lib/feedback";
import { ROLE_ACCESS } from "@/features/auth/roleRoutes";
import { Loading } from "@/components/Loading";
import { colors, fonts, radius } from "@/theme/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** Bar height above the safe-area inset — icon pill + label + breathing room. */
const BAR_HEIGHT = 62;

/**
 * Icon in a soft navy pill that grows in when the tab is selected.
 *
 * A colour swap alone is a weak "you are here" signal at a glance — the pill
 * gives the active tab a shape, the way Material and most POS apps mark it, and
 * doubles as the touch target's visual centre.
 */
function TabIcon({
  name,
  color,
  focused,
}: {
  name: IconName;
  color: string;
  focused: boolean;
}) {
  // Native-driven so the pill keeps up with the tab's own shift animation.
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(t, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [focused, t]);

  return (
    <View style={styles.iconSlot}>
      <Animated.View
        style={[
          styles.pill,
          {
            opacity: t,
            transform: [{ scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
          },
        ]}
      />
      <Ionicons
        name={focused ? name : (`${name}-outline` as IconName)}
        size={22}
        color={color}
      />
    </View>
  );
}

// Outline glyph when inactive, filled (brand-tinted) when active.
const icon =
  (name: IconName) =>
  ({ color, focused }: { color: string; focused: boolean }) => (
    <TabIcon name={name} color={color} focused={focused} />
  );

/**
 * Authenticated area: requires a signed-in, active profile.
 * Bottom tabs show every module the user's role may access (admins see all);
 * modules outside the role are hidden via `href: null`.
 */
export default function AppLayout() {
  const { profile, gate, loading } = useAuth();
  const insets = useSafeAreaInsets();
  if (loading) return <Loading />;
  // Restricted/removed mid-shift → the live profile listener lands here and
  // kicks the device out to the gate screen instantly.
  if (gate) return <Redirect href="/pending" />;
  if (!profile) return <Redirect href="/login" />;

  const can = (module: keyof typeof ROLE_ACCESS) =>
    ROLE_ACCESS[module].includes(profile.role);

  return (
    <Tabs
      // Haptic tick on every page switch from the tab bar.
      screenListeners={{ tabPress: () => selectionFeedback() }}
      screenOptions={{
        headerShown: false,
        // Cross-fade + subtle shift between tabs instead of a hard cut.
        animation: "shift",
        // Don't mount hidden tabs up front, and freeze them once blurred so
        // background screens skip re-renders from live Firestore snapshots.
        lazy: true,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        // Frosted glass: drop the hard top hairline and let a blur panel sit
        // behind the (transparent) bar. Height is set explicitly (pill + label
        // need more room than the 49pt default), so the safe-area inset has to
        // be added by hand — the navigator only does that for its own default.
        tabBarStyle: {
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarItemStyle: { paddingHorizontal: 2 },
        tabBarBackground: () => (
          <BlurView
            tint="light"
            intensity={40}
            style={[StyleSheet.absoluteFill, styles.tabBlur]}
          />
        ),
        // 9.5pt medium: with seven tabs on a small phone, "Insights"/"Account"
        // were being clipped at 10pt semibold. Weight now comes from the icon
        // pill instead, so the labels can stay quiet.
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: 9.5,
          letterSpacing: 0.1,
          marginTop: 3,
        },
      }}
    >
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          href: can("insights") ? "/insights" : null,
          tabBarIcon: icon("stats-chart"),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          href: can("menuAdmin") ? "/menu" : null,
          tabBarIcon: icon("restaurant"),
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: "Tables",
          href: can("tables") ? "/tables" : null,
          tabBarIcon: icon("grid"),
        }}
      />
      <Tabs.Screen
        name="order/index"
        options={{
          title: "Order",
          href: can("order") ? "/order" : null,
          tabBarIcon: icon("cart"),
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          title: "KDS",
          href: can("kds") ? "/kds" : null,
          tabBarIcon: icon("flame"),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: "Bills",
          href: can("bills") ? "/bills" : null,
          tabBarIcon: icon("receipt"),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: icon("person-circle"),
        }}
      />
      {/* Table-order detail: reached from Tables/Order screens, not a tab. */}
      <Tabs.Screen name="order/[tableId]" options={{ href: null }} />
      {/* Settled-bill history: reached from Account, not a tab. */}
      <Tabs.Screen name="bill-history" options={{ href: null }} />
      {/* Staff approvals/restrictions: reached from Account, not a tab. */}
      <Tabs.Screen name="staff" options={{ href: null }} />
      {/* Table-count setup: reached from Account, not a tab. */}
      <Tabs.Screen name="tables-setup" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Translucent wash over the blur so labels/icons stay legible, plus a hairline
  // that separates the bar from scrolling content without reading as a border.
  tabBlur: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.07)",
  },
  // Fixed box so the pill can sit behind the glyph without shifting the label.
  iconSlot: {
    width: 52,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
  },
});
