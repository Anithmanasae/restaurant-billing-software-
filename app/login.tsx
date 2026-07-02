import { useState } from "react";
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
import { Redirect } from "expo-router";
import { useAuth } from "@/features/auth/AuthContext";
import { homePathForRole } from "@/features/auth/roleRoutes";
import type { Role } from "@/types/models";
import { colors, space, radius } from "@/theme/theme";

/** Map Firebase auth error codes to messages a restaurant staffer can act on. */
function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/email-already-in-use":
      return "An account with this email already exists — sign in instead.";
    case "auth/weak-password":
      return "Password is too weak — use at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts — wait a minute and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your internet and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your admin.";
    case "permission-denied":
      return "Account created but profile setup was blocked — deploy the latest Firestore rules.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "waiter", label: "Waiter" },
  { value: "cashier", label: "Cashier" },
  { value: "kitchen", label: "Kitchen" },
];

export default function Login() {
  const { signIn, signUp, profile } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → go to role home.
  if (profile) return <Redirect href={homePathForRole(profile.role)} />;

  const signup = mode === "signup";

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (signup && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (signup) {
        await signUp(name.trim(), email.trim(), password, role);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(signup ? "signin" : "signup");
    setError(null);
  }

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
          <Text style={styles.title}>SADA POS</Text>
          <Text style={styles.sub}>
            {signup ? "Create your account" : "Sign in to continue"}
          </Text>
        </View>

        <View style={styles.form}>
          {signup && (
            <>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}
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
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
          />
          {signup && (
            <>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    style={[
                      styles.roleChip,
                      role === r.value && styles.roleChipActive,
                    ]}
                    onPress={() => setRole(r.value)}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        role === r.value && styles.roleChipTextActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {busy
                ? signup
                  ? "Creating account…"
                  : "Signing in…"
                : signup
                  ? "Create Account"
                  : "Sign In"}
            </Text>
          </Pressable>
          <Pressable onPress={switchMode} disabled={busy}>
            <Text style={styles.switchText}>
              {signup
                ? "Already have an account? Sign In"
                : "New here? Create an account"}
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
  sub: { color: colors.textMuted },
  form: { gap: space.s3 },
  label: { fontSize: 13, color: colors.textMuted, marginTop: space.s2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.s4,
    fontSize: 16,
    color: colors.text,
  },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  roleChip: {
    paddingVertical: space.s2,
    paddingHorizontal: space.s4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleChipText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  roleChipTextActive: { color: colors.textInverse },
  error: { color: colors.danger, fontSize: 14, marginTop: space.s2 },
  button: {
    marginTop: space.s3,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: space.s4,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textInverse, fontSize: 16, fontWeight: "700" },
  switchText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: space.s3,
  },
});
