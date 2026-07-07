/**
 * First-time account creation (see AuthContext for the surrounding state).
 *
 * Creates the Firebase Auth login, then writes the Firestore profile in the
 * shape the security rules demand:
 *  - waiter/kitchen → pending + inactive, awaiting the cashier's approval
 *  - cashier        → approved + active, but ONLY together with atomically
 *    flipping meta/bootstrap cashierClaimed false→true (the rules verify the
 *    pair, so the cashier seat can be claimed exactly once, ever)
 */
import { createUserWithEmailAndPassword } from "firebase/auth";
import { serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import type { AppUser } from "@/types/models";

/** Roles a person may pick for themselves on the signup screen. */
export type SignupRole = "waiter" | "kitchen" | "cashier";

export async function signUpUser(
  name: string,
  email: string,
  password: string,
  role: SignupRole,
): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const isCashier = role === "cashier";
  const batch = writeBatch(db);
  batch.set(paths.user(cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    role,
    status: isCashier ? "approved" : "pending",
    active: isCashier,
    createdAt: serverTimestamp() as unknown as AppUser["createdAt"],
  });
  if (isCashier) {
    batch.set(paths.bootstrap(), { cashierClaimed: true });
  }
  try {
    await batch.commit();
  } catch (e) {
    // Profile write refused (e.g. cashier seat already claimed, offline):
    // remove the half-created login so the email can retry cleanly.
    try {
      await cred.user.delete();
    } catch {
      /* best effort */
    }
    throw e;
  }
}
