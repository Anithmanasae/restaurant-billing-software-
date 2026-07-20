/**
 * E2E test of cancelBill (void a stuck bill) against the live dev Firebase.
 *
 * The cashier's escape hatch for a stuck/mistaken bill: voiding keeps the
 * bill doc (and its sequential number) as an audit record, cancels the order,
 * and frees the table — all in one transaction. Guards under test:
 *   - only cashier/admin may void (waiter is rejected by rules)
 *   - a PAID bill can never be voided (client guard + rules freeze)
 *   - voiding twice is a harmless no-op
 *
 * Run: npx tsx --tsconfig scripts/e2e/tsconfig.json scripts/e2e/cancelBill.e2e.ts
 */
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDoc, updateDoc } from "firebase/firestore";
import { auth, RESTAURANT_ID } from "./firebase-shim";
import { paths, setActiveRestaurantId } from "@/lib/firestore/paths";

setActiveRestaurantId(RESTAURANT_ID);
import { createOrderLocal, sendKot } from "@/features/order/orderApi";
import { completeKot, startKot } from "@/features/kitchen/kdsApi";
import {
  cancelBill,
  generateBill,
  settleBill,
} from "@/features/cashier/cashierApi";
import type { Bill, Order } from "@/types/models";

const PASSWORD = "Sada@1234";
const TABLE_ID = "t10";
const TABLE_LABEL = "Patio 2";

let step = 0;
function ok(msg: string) {
  step += 1;
  console.log(`  ✔ [${step}] ${msg}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function signIn(role: "waiter" | "kitchen" | "cashier"): Promise<string> {
  const cred = await signInWithEmailAndPassword(
    auth,
    `${role}@sada-pos.test`,
    PASSWORD
  );
  return cred.user.uid;
}

/** waiter opens a dine-in order on t10; kitchen cooks it to completion. */
async function billableOrder(waiterUid: string): Promise<string> {
  await signIn("waiter");
  const created = createOrderLocal({
    tableId: TABLE_ID,
    orderType: "dine-in",
    waiterId: waiterUid,
    menuItemId: "masala-chai",
    name: "Masala Chai",
    price: 4000,
  });
  await created.commit;
  const kotId = await sendKot(created.orderId, TABLE_LABEL);
  assert(kotId, "sendKot returned a kot id");
  await signIn("kitchen");
  await startKot(kotId!);
  await completeKot(kotId!);
  return created.orderId;
}

async function expectRejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("call unexpectedly SUCCEEDED");
}

function isPermissionDenied(msg: string): boolean {
  return /permission|insufficient/i.test(msg);
}

async function main() {
  const waiterUid = await signIn("waiter");
  const tableSnap = await getDoc(paths.table(TABLE_ID));
  assert(tableSnap.exists(), `table ${TABLE_ID} exists`);
  assert(
    !tableSnap.data()!.currentOrderId,
    `table ${TABLE_ID} is free (clear it and run again if not)`
  );

  // ── Scenario A: cancel an unpaid bill ────────────────────────────────────
  const orderId = await billableOrder(waiterUid);
  const cashierUid = await signIn("cashier");
  let orderSnap = await getDoc(paths.order(orderId));
  let order = { ...orderSnap.data(), id: orderSnap.id } as Order;
  const billId = await generateBill(order, cashierUid, TABLE_LABEL);
  ok("bill generated for a kitchen-done order");

  // Waiter must NOT be able to void it (rules: bill updates are cashier/admin).
  await signIn("waiter");
  const waiterMsg = await expectRejected(() => cancelBill(billId, waiterUid));
  assert(
    isPermissionDenied(waiterMsg),
    `waiter void rejected by rules, got: "${waiterMsg}"`
  );
  ok("waiter cannot cancel a bill (rules reject)");

  await signIn("cashier");
  await cancelBill(billId, cashierUid);
  const [billSnap, oSnap, tSnap] = await Promise.all([
    getDoc(paths.bill(billId)),
    getDoc(paths.order(orderId)),
    getDoc(paths.table(TABLE_ID)),
  ]);
  const voided = billSnap.data()!;
  assert(voided.status === "void", "bill status is void");
  assert(voided.voidedBy === cashierUid, "voidedBy records the cashier");
  assert(voided.voidedAt, "voidedAt timestamp set");
  assert(voided.billNumber !== undefined, "bill number kept (audit trail)");
  assert(oSnap.data()!.status === "cancelled", "order cancelled");
  assert(tSnap.data()!.status === "available", "table freed");
  assert(tSnap.data()!.currentOrderId === null, "table pointer cleared");
  ok("cancelBill voided the bill, cancelled the order, freed the table");

  await cancelBill(billId, cashierUid); // already void — must be a no-op
  ok("cancelling an already-void bill is a harmless no-op");

  // ── Scenario B: a PAID bill can never be voided ──────────────────────────
  const orderId2 = await billableOrder(waiterUid);
  await signIn("cashier");
  orderSnap = await getDoc(paths.order(orderId2));
  order = { ...orderSnap.data(), id: orderSnap.id } as Order;
  const billId2 = await generateBill(order, cashierUid, TABLE_LABEL);
  const bill2Snap = await getDoc(paths.bill(billId2));
  const bill2 = { ...bill2Snap.data(), id: bill2Snap.id } as Bill;
  orderSnap = await getDoc(paths.order(orderId2));
  order = { ...orderSnap.data(), id: orderSnap.id } as Order;
  await settleBill(bill2, order, "cash");

  const clientMsg = await expectRejected(() => cancelBill(billId2, cashierUid));
  assert(/already settled/i.test(clientMsg), `client guard fired: "${clientMsg}"`);
  ok(`paid bill: cancelBill refuses ("${clientMsg}")`);

  // Even a raw write flipping a paid bill to void must die in the rules.
  const rawMsg = await expectRejected(() =>
    updateDoc(paths.bill(billId2), { status: "void" })
  );
  assert(
    isPermissionDenied(rawMsg),
    `raw void of a paid bill rejected by rules, got: "${rawMsg}"`
  );
  ok("paid bill is frozen by rules — direct status flip rejected");

  const t2 = await getDoc(paths.table(TABLE_ID));
  assert(t2.data()!.status === "available", "table free at the end");

  console.log(`\nE2E PASS — ${step} checkpoints, cancel-bill flow verified.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nE2E FAIL:", e);
    process.exit(1);
  });
