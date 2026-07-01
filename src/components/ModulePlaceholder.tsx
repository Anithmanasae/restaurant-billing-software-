/**
 * Temporary placeholder for a module screen not yet built.
 * Subagents: DELETE this and replace the route with your real screen.
 */
import { useAuth } from "@/features/auth/AuthContext";

export function ModulePlaceholder({ title }: { title: string }) {
  const { profile, signOut } = useAuth();
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ color: "var(--color-primary)" }}>{title}</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
        Signed in as {profile?.name} ({profile?.role}). This module is scaffolded
        and pending implementation.
      </p>
      <button
        onClick={signOut}
        style={{
          marginTop: 24,
          padding: "12px 16px",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          background: "var(--color-surface)",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
