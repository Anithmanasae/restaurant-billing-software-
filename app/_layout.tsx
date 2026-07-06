import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider } from "@/features/auth/AuthContext";
import { SettingsProvider } from "@/features/settings/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loading } from "@/components/Loading";

// Off-screen routes stop re-rendering on Firestore snapshots (with the tab
// navigator's freezeOnBlur) — must be set before any screen renders.
enableFreeze(true);

export default function RootLayout() {
  // Load the Plus Jakarta Sans family once, app-wide. Hold on a spinner until
  // the glyphs are ready (or bail through on error) so text never flashes in
  // the fallback face.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return <Loading />;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <SettingsProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </SettingsProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
