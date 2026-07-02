import { Redirect } from "expo-router";
import { useAuth } from "@/features/auth/AuthContext";
import { homePathForRole } from "@/features/auth/roleRoutes";
import { Loading } from "@/components/Loading";

/** Entry: send the user to their role's home, or to login. */
export default function Index() {
  const { role, loading } = useAuth();
  if (loading) return <Loading />;
  return <Redirect href={role ? homePathForRole(role) : "/login"} />;
}
