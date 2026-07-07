/**
 * Authentication + role context.
 *
 * The user's ROLE is the authorization boundary for the whole app. It is read
 * from the user's Firestore profile (restaurants/{id}/users/{uid}). Firestore
 * Security Rules independently re-check this role server-side on every write —
 * the client context is for UX/routing only and is NOT the security boundary.
 *
 * The profile doc is watched LIVE (onSnapshot): the moment the cashier
 * approves, restricts, or removes a staff member, that phone reacts instantly
 * — no app restart needed. `profile` is only non-null for a usable account
 * (approved + active); every other signed-in state is described by `gate`.
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
import { onSnapshot } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import { signUpUser, type SignupRole } from "@/features/auth/signupApi";
import type { AppUser, Role } from "@/types/models";

export type { SignupRole };

/**
 * Why a signed-in user is NOT allowed into the app:
 *  - pending    signup awaiting the cashier's approval
 *  - denied     cashier rejected the signup
 *  - restricted approved account switched off for now (day off / suspended)
 *  - removed    profile deleted — account permanently revoked
 * null when signed out or fully usable.
 */
export type GateStatus = "pending" | "denied" | "restricted" | "removed" | null;

interface AuthState {
  firebaseUser: User | null;
  profile: AppUser | null;
  role: Role | null;
  gate: GateStatus;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    name: string,
    email: string,
    password: string,
    role: SignupRole,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [rawProfile, setRawProfile] = useState<AppUser | null>(null);
  // True only when the snapshot positively said "no such doc" (vs. an error,
  // which we treat as signed-out rather than "account removed").
  const [docMissing, setDocMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.();
      unsubProfile = null;
      setFirebaseUser(user);
      if (!user) {
        setRawProfile(null);
        setDocMissing(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      unsubProfile = onSnapshot(
        paths.user(user.uid),
        (snap) => {
          setRawProfile(
            snap.exists() ? { ...snap.data(), uid: user.uid } : null,
          );
          setDocMissing(!snap.exists());
          setLoading(false);
        },
        (e) => {
          // Profile unreadable (offline, rules) — treat as signed-out rather
          // than crashing the app or claiming the account was removed.
          console.warn("[auth] failed to load profile:", e);
          setRawProfile(null);
          setDocMissing(false);
          setLoading(false);
        },
      );
    });
    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const usable =
    rawProfile !== null && rawProfile.status === "approved" && rawProfile.active;
  const profile = usable ? rawProfile : null;

  let gate: GateStatus = null;
  if (firebaseUser && !loading && !profile) {
    if (rawProfile === null) {
      gate = docMissing ? "removed" : null;
    } else if (rawProfile.status === "pending") {
      gate = "pending";
    } else if (rawProfile.status === "denied") {
      gate = "denied";
    } else {
      gate = "restricted";
    }
  }

  const value: AuthState = {
    firebaseUser,
    profile,
    role: profile?.role ?? null,
    gate,
    loading,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: signUpUser,
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
