import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/features/auth/AuthContext";
import { ROLE_ACCESS } from "@/features/auth/roleRoutes";
import { Loading } from "@/components/Loading";
import { colors } from "@/theme/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );

/**
 * Authenticated area: requires a signed-in, active profile.
 * Bottom tabs show every module the user's role may access (admins see all);
 * modules outside the role are hidden via `href: null`.
 */
export default function AppLayout() {
  const { profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!profile) return <Redirect href="/login" />;

  const can = (module: keyof typeof ROLE_ACCESS) =>
    ROLE_ACCESS[module].includes(profile.role);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Don't mount hidden tabs up front, and freeze them once blurred so
        // background screens skip re-renders from live Firestore snapshots.
        lazy: true,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
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
    </Tabs>
  );
}
