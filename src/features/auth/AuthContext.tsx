/**
 * Authentication + role context.
 *
 * The user's ROLE is the authorization boundary for the whole app. It is read
 * from the user's Firestore profile (restaurants/{id}/users/{uid}). Firestore
 * Security Rules independently re-check this role server-side on every write —
 * the client context is for UX/routing only and is NOT the security boundary.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import type { AppUser, Role } from "@/types/models";

interface AuthState {
  firebaseUser: User | null;
  profile: AppUser | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const snap = await getDoc(paths.user(user.uid));
          const data = snap.exists()
            ? ({ ...snap.data(), uid: user.uid } as AppUser)
            : null;
          // Deactivated staff are treated as signed out.
          setProfile(data && data.active ? data : null);
        } catch (e) {
          // Profile unreadable (offline, rules, missing doc) — treat as
          // signed-out rather than crashing the app at startup.
          console.warn("[auth] failed to load profile:", e);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const value: AuthState = {
    firebaseUser,
    profile,
    role: profile?.role ?? null,
    loading,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      await fbSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
