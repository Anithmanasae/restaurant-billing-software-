/**
 * E2E test of the close-table guard against the live dev Firebase project.
 *
 * Once a table's order has been fired to the kitchen, NOBODY may free the
 * table with "Close table" — not the same waiter, not another one. The table
 * only becomes reusable when the cashier settles the bill (settleBill frees
 * it). A draft order (nothing sent yet) may still be closed, which cancels
 * the draft.
 *
 * Run: npx tsx --tsconfig scripts/e2e/tsconfig.json scripts/e2e/closeTableGuard.e2e.ts
 */
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDoc } from "firebase/firestore";
import { auth, RESTAURANT_ID } from "./firebase-shim";
import { paths, setActiveRestaurantId } from "@/lib/firestore/paths";

setActiveRestaurantId(RESTAURANT_ID);
import { createOrderLocal, sendKot } from "@/features/order/orderApi";
import { completeKot, startKot } from "@/features/kitchen/kdsApi";
import { generateBill, settleBill } from "@/features/cashier/cashierApi";
import { closeTable } from "@/features/tables/tablesApi";
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

async function expectCloseRejected(): Promise<string> {
  try {
    await closeTable(TABLE_ID);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("closeTable unexpectedly SUCCEEDED");
}

async function openOrder(waiterUid: string): Promise<string> {
  const created = createOrderLocal({
    tableId: TABLE_ID,
    orderType: "dine-in",
    waiterId: waiterUid,
    menuItemId: "masala-chai",
    name: "Masala Chai",
    price: 4000,
  });
  await created.commit;
  return created.orderId;
}

async function main() {
  const waiterUid = await signIn("waiter");
  const tableSnap = await getDoc(paths.table(TABLE_ID));
  assert(tableSnap.exists(), `table ${TABLE_ID} exists`);
  assert(
    !tableSnap.data()!.currentOrderId,
    `table ${TABLE_ID} is free (clear it and run again if not)`
  );

  // ── Draft order (nothing fired): close IS allowed, draft cancelled ───────
  const draftId = await openOrder(waiterUid);
  await closeTable(TABLE_ID);
  const [draft, t1] = await Promise.all([
    getDoc(paths.order(draftId)),
    getDoc(paths.table(TABLE_ID)),
  ]);
  assert(draft.data()!.status === "cancelled", "draft order cancelled on close");
  assert(t1.data()!.status === "available", "table freed after draft close");
  assert(t1.data()!.currentOrderId === null, "table pointer cleared");
  ok("draft order (no KOT yet): close allowed, draft cancelled");

  // ── KOT fired: close is BLOCKED for everyone ─────────────────────────────
  const orderId = await openOrder(waiterUid);
  const kotId = await sendKot(orderId, TABLE_LABEL);
  assert(kotId, "sendKot returned a kot id");
  let msg = await expectCloseRejected();
  ok(`waiter can't close while order is in the kitchen: "${msg}"`);

  await signIn("cashier");
  msg = await expectCloseRejected();
  ok(`another staff member can't close it either: "${msg}"`);

  // ── Kitchen done + billed: still blocked until payment ───────────────────
  await signIn("kitchen");
  await startKot(kotId!);
  await completeKot(kotId!);

  const cashierUid = await signIn("cashier");
  let orderSnap = await getDoc(paths.order(orderId));
  let order = { ...orderSnap.data(), id: orderSnap.id } as Order;
  const billId = await generateBill(order, cashierUid, TABLE_LABEL);
  msg = await expectCloseRejected();
  ok(`billed but unpaid: close still blocked: "${msg}"`);

  // ── Settle: table frees automatically and can be reused ──────────────────
  const billSnap = await getDoc(paths.bill(billId));
  const bill = { ...billSnap.data(), id: billSnap.id } as Bill;
  orderSnap = await getDoc(paths.order(orderId));
  order = { ...orderSnap.data(), id: orderSnap.id } as Order;
  await settleBill(bill, order, "cash");

  const t2 = await getDoc(paths.table(TABLE_ID));
  assert(t2.data()!.status === "available", "table freed by settleBill");
  assert(t2.data()!.currentOrderId === null, "table pointer cleared");
  ok("bill settled: table freed automatically, ready for the next order");

  console.log(`\nE2E PASS — ${step} checkpoints, close-table guard verified.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nE2E FAIL:", e);
    process.exit(1);
  });
