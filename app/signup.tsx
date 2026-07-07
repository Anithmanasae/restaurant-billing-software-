import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { Redirect, router } from "expo-router";
import { getDoc } from "firebase/firestore";
import { useAuth, type SignupRole } from "@/features/auth/AuthContext";
import { friendlyAuthError } from "@/features/auth/authErrors";
import { homePathForRole } from "@/features/auth/roleRoutes";
import { paths } from "@/lib/firestore/paths";
import { colors, space, radius } from "@/theme/theme";

/**
 * First-time account creation.
 *
 * Waiters and kitchen staff sign themselves up and land in a "waiting for
 * approval" state until the cashier accepts them. The cashier ("2nd owner")
 * seat is claimable exactly once — the option only appears while
 * meta/bootstrap says it is unclaimed, and the security rules enforce the
 * one-time claim server-side regardless of what this screen shows.
 */
export default function Signup() {
  const { signUp, profile } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<SignupRole>("waiter");
  const [cashierOpen, setCashierOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If unreadable (offline), keep the cashier option hidden — the rules
    // would reject a stale claim anyway.
    getDoc(paths.bootstrap())
      .then((snap) => setCashierOpen(!snap.exists() || !snap.data()?.cashierClaimed))
      .catch(() => setCashierOpen(false));
  }, []);

  // Already signed in with a usable account → nothing to sign up for.
  if (profile) return <Redirect href={homePathForRole(profile.role)} />;

  async function onSubmit() {
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and a password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signUp(name.trim(), email.trim(), password, role);
      // Cashier claim is self-approving → straight into the app via index.
      // Staff land on the live "waiting for approval" screen.
      router.replace(role === "cashier" ? "/" : "/pending");
    } catch (e) {
      setError(friendlyAuthError(e));
      setBusy(false);
    }
  }

  const roles: { value: SignupRole; label: string; hint: string }[] = [
    { value: "waiter", label: "Waiter", hint: "Takes orders at tables" },
    { value: "kitchen", label: "Kitchen", hint: "Works the kitchen display" },
    ...(cashierOpen
      ? [
          {
            value: "cashier" as SignupRole,
            label: "Cashier (owner)",
            hint: "One-time setup — manages staff and billing",
          },
        ]
      : []),
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={styles.logo}>🍽️</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.sub}>
            {role === "cashier"
              ? "Set up the cashier account for this restaurant"
              : "Your account needs the cashier's approval before you can sign in"}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>I work as</Text>
          <View style={styles.roleRow}>
            {roles.map((r) => (
              <Pressable
                key={r.value}
                style={[styles.roleChip, role === r.value && styles.roleChipOn]}
                onPress={() => setRole(r.value)}
                disabled={busy}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    role === r.value && styles.roleChipTextOn,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.roleHint}>
            {roles.find((r) => r.value === role)?.hint}
          </Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@restaurant.com"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              busy && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={onSubmit}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {busy ? "Creating account…" : "Create Account"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
            disabled={busy}
          >
            <Text style={styles.backText}>
              Already have an account?{" "}
              <Text style={styles.backTextBold}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.s6,
    gap: space.s6,
  },
  brand: { alignItems: "center", gap: space.s2 },
  logo: { fontSize: 44 },
  title: { fontSize: 28, fontWeight: "800", color: colors.primary },
  sub: { color: colors.textMuted, textAlign: "center" },
  form: { gap: space.s3 },
  label: { fontSize: 13, color: colors.textMuted, marginTop: space.s2 },
  roleRow: { flexDirection: "row", gap: space.s2, flexWrap: "wrap" },
  roleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: space.s2,
    paddingHorizontal: space.s4,
  },
  roleChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleChipText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  roleChipTextOn: { color: colors.textInverse },
  roleHint: { fontSize: 12, color: colors.textMuted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.s4,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 14, marginTop: space.s2 },
  button: {
    marginTop: space.s3,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: space.s4,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  buttonText: { color: colors.textInverse, fontSize: 16, fontWeight: "700" },
  backLink: { alignItems: "center", padding: space.s3 },
  backText: { color: colors.textMuted, fontSize: 14 },
  backTextBold: { color: colors.primary, fontWeight: "700" },
});
