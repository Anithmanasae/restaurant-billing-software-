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
    case "auth/too-many-requests":
      return "Too many attempts — wait a minute and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your internet and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your admin.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export default function Login() {
  const { signIn, profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → go to role home.
  if (profile) return <Redirect href={homePathForRole(profile.role)} />;

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
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
          <Text style={styles.sub}>Sign in to continue</Text>
        </View>

        <View style={styles.form}>
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
              {busy ? "Signing in…" : "Sign In"}
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
});
