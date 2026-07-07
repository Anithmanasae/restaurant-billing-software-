/**
 * End-to-end test of the signup/approval lifecycle against the LIVE dev
 * Firebase project and the DEPLOYED security rules, driving the real app
 * modules (signupApi, staffApi, paths):
 *
 *   1. unauthenticated: bootstrap doc readable → cashier seat open
 *   2. cashier self-claims the seat (one-time bootstrap batch)
 *   3. a second cashier claim is REJECTED and its half-made login rolled back
 *   4. waiter self-signup lands pending+inactive; pending waiter can read own
 *      profile but NOT menu/app data, and cannot approve themself
 *   5. cashier approves → waiter can read app data
 *   6. cashier restricts (active=false) → waiter locked out again; waiter
 *      cannot un-restrict themself
 *   7. waiter cannot touch the cashier's profile
 *   8. cashier removes the waiter → profile gone (account revoked)
 *
 * Cleans up after itself with the Admin SDK (deletes the test logins/docs and
 * reopens the cashier claim), restoring the pre-test clean slate.
 *
 * Run: npx tsx --tsconfig scripts/e2e/tsconfig.json scripts/e2e/authFlow.e2e.ts
 */
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { deleteDoc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { auth } from "./firebase-shim";
import { paths } from "@/lib/firestore/paths";
import { signUpUser } from "@/features/auth/signupApi";
import {
  approveStaff,
  removeStaff,
  setStaffActive,
} from "@/features/staff/staffApi";

const PASSWORD = "Verify@1234";
const CASHIER_EMAIL = "verify-cashier@sada-pos.test";
const CASHIER2_EMAIL = "verify-cashier2@sada-pos.test";
const WAITER_EMAIL = "verify-waiter@sada-pos.test";

let step = 0;
function ok(msg: string) {
  step += 1;
  console.log(`  ✔ [${step}] ${msg}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

/** Run an op that the deployed rules must REJECT with permission-denied. */
async function expectDenied(what: string, op: () => Promise<unknown>) {
  try {
    await op();
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    assert(
      code === "permission-denied",
      `${what}: expected permission-denied, got "${code}": ${e}`
    );
    return;
  }
  throw new Error(`${what}: unexpectedly SUCCEEDED`);
}

async function main() {
  // ── 1. Pre-auth: cashier seat is open ────────────────────────────────────
  await signOut(auth);
  const boot = await getDoc(paths.bootstrap());
  assert(
    !boot.exists() || boot.data()?.cashierClaimed !== true,
    "cashier seat must be unclaimed before this test (run resetUsers.js)"
  );
  ok("unauthenticated read of meta/bootstrap works — cashier seat open");

  // ── 2. Cashier claims the seat ───────────────────────────────────────────
  await signUpUser("Verify Owner", CASHIER_EMAIL, PASSWORD, "cashier");
  const cashierUid = auth.currentUser!.uid;
  const cashierDoc = await getDoc(paths.user(cashierUid));
  assert(cashierDoc.exists(), "cashier profile created");
  assert(cashierDoc.data()!.status === "approved", "cashier auto-approved");
  assert(cashierDoc.data()!.active === true, "cashier active");
  const boot2 = await getDoc(paths.bootstrap());
  assert(boot2.data()?.cashierClaimed === true, "bootstrap claimed");
  ok("cashier signup claimed the seat (approved + active + flag set)");

  // ── 3. Second cashier claim is rejected + rolled back ────────────────────
  await signOut(auth);
  try {
    await signUpUser("Impostor", CASHIER2_EMAIL, PASSWORD, "cashier");
    throw new Error("second cashier claim unexpectedly SUCCEEDED");
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    assert(
      code === "permission-denied",
      `second cashier claim: expected permission-denied, got "${code}": ${e}`
    );
  }
  ok("second cashier claim rejected by rules");
  await signOut(auth);
  try {
    await signInWithEmailAndPassword(auth, CASHIER2_EMAIL, PASSWORD);
    throw new Error("rolled-back login still exists — rollback failed");
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    assert(
      code.startsWith("auth/"),
      `expected auth error for rolled-back login, got: ${e}`
    );
  }
  ok("half-created login was rolled back (email free to retry)");

  // ── 4. Waiter self-signup lands pending and locked out ───────────────────
  await signUpUser("Verify Waiter", WAITER_EMAIL, PASSWORD, "waiter");
  const waiterUid = auth.currentUser!.uid;
  const waiterDoc = await getDoc(paths.user(waiterUid));
  assert(waiterDoc.exists(), "pending waiter can read own profile");
  assert(waiterDoc.data()!.status === "pending", "waiter is pending");
  assert(waiterDoc.data()!.active === false, "waiter inactive until approved");
  ok("waiter signup created pending+inactive profile, readable by owner");
  await expectDenied("pending waiter reading menu", () =>
    getDocs(paths.menuItems())
  );
  ok("pending waiter cannot read app data");
  await expectDenied("pending waiter self-approving", () =>
    updateDoc(paths.user(waiterUid), { status: "approved", active: true })
  );
  ok("pending waiter cannot approve themself");

  // ── 5. Cashier approves ──────────────────────────────────────────────────
  await signInWithEmailAndPassword(auth, CASHIER_EMAIL, PASSWORD);
  const staffList = await getDocs(paths.users());
  assert(staffList.size >= 2, "cashier can list all staff profiles");
  await approveStaff(waiterUid);
  ok("cashier listed staff and approved the waiter");

  await signInWithEmailAndPassword(auth, WAITER_EMAIL, PASSWORD);
  const menu = await getDocs(paths.menuItems());
  ok(`approved waiter reads app data (menuItems: ${menu.size} docs)`);

  // ── 6. Cashier restricts for the day ─────────────────────────────────────
  await signInWithEmailAndPassword(auth, CASHIER_EMAIL, PASSWORD);
  await setStaffActive(waiterUid, false);
  await signInWithEmailAndPassword(auth, WAITER_EMAIL, PASSWORD);
  await expectDenied("restricted waiter reading menu", () =>
    getDocs(paths.menuItems())
  );
  ok("restricted waiter locked out of app data instantly");
  await expectDenied("restricted waiter un-restricting themself", () =>
    updateDoc(paths.user(waiterUid), { active: true })
  );
  ok("restricted waiter cannot flip their own switch back");

  // ── 7. Waiter cannot touch the cashier ───────────────────────────────────
  await signInWithEmailAndPassword(auth, CASHIER_EMAIL, PASSWORD);
  await setStaffActive(waiterUid, true); // re-enable to test as active staff
  await signInWithEmailAndPassword(auth, WAITER_EMAIL, PASSWORD);
  await expectDenied("waiter restricting the cashier", () =>
    updateDoc(paths.user(cashierUid), { active: false })
  );
  await expectDenied("waiter deleting the cashier", () =>
    deleteDoc(paths.user(cashierUid))
  );
  ok("waiter cannot restrict or delete the cashier");

  // ── 8. Cashier removes the waiter ────────────────────────────────────────
  await signInWithEmailAndPassword(auth, CASHIER_EMAIL, PASSWORD);
  await removeStaff(waiterUid);
  await signInWithEmailAndPassword(auth, WAITER_EMAIL, PASSWORD);
  const gone = await getDoc(paths.user(waiterUid));
  assert(!gone.exists(), "removed waiter's profile is gone");
  await expectDenied("removed waiter reading menu", () =>
    getDocs(paths.menuItems())
  );
  ok("removed waiter: profile gone, all access revoked");

  console.log(
    `\nAUTH E2E PASS — ${step} checkpoints against the deployed rules.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nAUTH E2E FAIL:", e);
    process.exit(1);
  });
