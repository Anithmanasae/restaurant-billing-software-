import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { homePathForRole } from "./roleRoutes";
import "./login.css";

export function LoginPage() {
  const { signIn, profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      // On success, AuthContext loads the profile and the redirect below fires.
    } catch {
      setError("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  // Once signed in, send the user to their role's home.
  if (profile) return <Navigate to={homePathForRole(profile.role)} replace />;

  return (
    <div className="login">
      <div className="login__brand">
        <span className="login__logo">🍽️</span>
        <h1>SADA POS</h1>
        <p>Sign in to continue</p>
      </div>
      <form className="login__form" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="login__error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

/** Redirects a signed-in user to their role's home; else to /login. Used for "/". */
export function RoleHomeRedirect() {
  const { role, loading } = useAuth();
  if (loading) return <div className="auth-loading">Loading…</div>;
  return <Navigate to={role ? homePathForRole(role) : "/login"} replace />;
}
