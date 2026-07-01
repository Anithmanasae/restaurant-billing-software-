/**
 * Route guard: requires a signed-in user, optionally with one of `allow` roles.
 * Redirects to /login when unauthenticated, or to the user's home when their
 * role isn't permitted for the route.
 */
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { homePathForRole } from "./roleRoutes";
import type { Role } from "@/types/models";

export function ProtectedRoute({
  allow,
  children,
}: {
  allow?: Role[];
  children: ReactNode;
}) {
  const { profile, role, loading } = useAuth();

  if (loading) return <div className="auth-loading">Loading…</div>;
  if (!profile || !role) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }
  return <>{children}</>;
}
