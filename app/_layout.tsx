import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/features/auth/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
