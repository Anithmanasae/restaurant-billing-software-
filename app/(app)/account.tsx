import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthContext";
import { colors, space, radius, shadow } from "@/theme/theme";

/** Signed-in user's profile + sign out. */
export default function AccountRoute() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.avatar}>👤</Text>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.email}>{profile?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{profile?.role.toUpperCase()}</Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
        onPress={() => signOut()}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: space.s6,
    gap: space.s5,
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.s6,
    alignItems: "center",
    gap: space.s2,
    ...shadow.card,
  },
  avatar: { fontSize: 48 },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  email: { color: colors.textMuted },
  roleBadge: {
    marginTop: space.s2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: space.s1,
    paddingHorizontal: space.s3,
  },
  roleText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  signOutBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: space.s4,
    alignItems: "center",
  },
  signOutText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
