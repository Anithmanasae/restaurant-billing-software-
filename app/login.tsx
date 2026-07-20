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
  Image,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "@/features/auth/AuthContext";
import { friendlyAuthError } from "@/features/auth/authErrors";
import { homePathForRole } from "@/features/auth/roleRoutes";
import { colors, space, radius, shadow, fonts, typography, opacity } from "@/theme/theme";

/**
 * The brand PNG is a dark rectangle with the rounded app-icon badge sitting
 * inside it. Rendering it whole drops a black box onto the light canvas, so we
 * crop to the badge (source px 182,146 → 758,724) inside an overflow-hidden
 * tile that carries its own radius and shadow.
 */
const LOGO_TILE = 104;
const BADGE = 576; // badge side length in source pixels
const LOGO_SCALE = LOGO_TILE / BADGE;

export default function Login() {
  const { signIn, profile, gate, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → go to role home.
  if (profile) return <Redirect href={homePathForRole(profile.role)} />;
  // Signed in but pending/denied/restricted → status screen.
  if (gate) return <Redirect href="/pending" />;

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
          <View style={styles.logoTile}>
            <Image
              source={require("../assets/brand/logo.png")}
              style={styles.logo}
              accessibilityRole="image"
              accessibilityLabel="SADA POS"
            />
          </View>
          <View style={styles.brandText}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.sub}>Sign in to continue</Text>
          </View>
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
          {/* e.g. bounced because the account isn't linked to a restaurant */}
          {!error && notice && <Text style={styles.error}>{notice}</Text>}
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

          <Pressable
            style={({ pressed }) => [styles.signupLink, pressed && { opacity: 0.6 }]}
            onPress={() => router.push("/signup")}
            disabled={busy}
          >
            <Text style={styles.signupText}>
              New staff member?{" "}
              <Text style={styles.signupTextBold}>Create an account</Text>
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
  brand: { alignItems: "center", gap: space.s5 },
  logoTile: {
    width: LOGO_TILE,
    height: LOGO_TILE,
    borderRadius: radius.xxl,
    backgroundColor: "#141414",
    overflow: "hidden",
    ...shadow.float,
  },
  logo: {
    position: "absolute",
    width: 890 * LOGO_SCALE,
    height: 762 * LOGO_SCALE,
    left: -182 * LOGO_SCALE,
    top: -146 * LOGO_SCALE,
  },
  brandText: { alignItems: "center", gap: space.s1 },
  title: { ...typography.screenTitle, color: colors.text },
  sub: { ...typography.screenSubtitle, color: colors.textMuted },
  form: { gap: space.s3 },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: space.s2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.lg,
    padding: space.s4,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 14,
    marginTop: space.s2,
  },
  button: {
    marginTop: space.s4,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: space.s4,
    alignItems: "center",
    ...shadow.glow,
  },
  buttonDisabled: { opacity: opacity.disabled },
  buttonPressed: { opacity: opacity.pressed, transform: [{ scale: 0.98 }] },
  buttonText: {
    fontFamily: fonts.bold,
    color: colors.textInverse,
    fontSize: 16,
  },
  signupLink: { alignItems: "center", padding: space.s3 },
  signupText: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: 14 },
  signupTextBold: { fontFamily: fonts.bold, color: colors.primary },
});
