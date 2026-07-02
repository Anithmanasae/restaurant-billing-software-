import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/features/auth/AuthContext";
import { Loading } from "@/components/Loading";

/** Authenticated area: requires a signed-in, active profile. */
export default function AppLayout() {
  const { profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!profile) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
