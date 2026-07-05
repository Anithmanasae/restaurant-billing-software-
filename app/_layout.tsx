import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import { AuthProvider } from "@/features/auth/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Off-screen routes stop re-rendering on Firestore snapshots (with the tab
// navigator's freezeOnBlur) — must be set before any screen renders.
enableFreeze(true);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
