/**
 * E2E for the cashier-only "remove item from a fired KOT" power (voidKotItem):
 *
 *   waiter: open order (2 items) → sendKot
 *   kitchen: voidKotItem → MUST be rejected by rules (permission-denied)
 *   waiter:  voidKotItem → MUST be rejected by rules (permission-denied)
 *   cashier: voidKotItem → succeeds; kot line VOID, order line VOID,
 *            subtotal drops to the surviving line
 *   then the normal complete → bill → settle path with the reduced total,
 *   leaving the table clean for the next run.
 *
 * Run: npx tsx --tsconfig scripts/e2e/tsconfig.json scripts/e2e/voidItem.e2e.ts
 */
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDoc } from "firebase/firestore";
import { auth, RESTAURANT_ID } from "./firebase-shim";
import { paths, setActiveRestaurantId } from "@/lib/firestore/paths";

setActiveRestaurantId(RESTAURANT_ID);
import {
  createOrderLocal,
  mergeItemIntoLines,
  sendKot,
  writeOrderItems,
} from "@/features/order/orderApi";
import { completeKot, startKot, voidKotItem } from "@/features/kitchen/kdsApi";
import { generateBill, settleBill } from "@/features/cashier/cashierApi";
import type { Bill, Kot, Order } from "@/types/models";

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

async function fetchOrder(orderId: string): Promise<Order> {
  const snap = await getDoc(paths.order(orderId));
  assert(snap.exists(), `order ${orderId} exists`);
  return { ...snap.data(), id: snap.id } as Order;
}

async function fetchKot(kotId: string): Promise<Kot> {
  const snap = await getDoc(paths.kot(kotId));
  assert(snap.exists(), `kot ${kotId} exists`);
  return { ...snap.data(), id: snap.id } as Kot;
}

async function expectDenied(what: string, p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const code = (e as { code?: string }).code;
    assert(
      code === "permission-denied",
      `${what}: expected permission-denied, got ${code ?? e}`
    );
    return;
  }
  throw new Error(`${what} unexpectedly SUCCEEDED`);
}

async function main() {
  // ── Waiter opens an order with two lines and fires the KOT ───────────────
  const waiterUid = await signIn("waiter");
  const tableSnap = await getDoc(paths.table(TABLE_ID));
  assert(tableSnap.exists(), `table ${TABLE_ID} exists`);
  assert(
    !tableSnap.data()!.currentOrderId,
    `table ${TABLE_ID} is free (run again after clearing it if not)`
  );

  const created = createOrderLocal({
    tableId: TABLE_ID,
    orderType: "dine-in",
    waiterId: waiterUid,
    menuItemId: "masala-chai",
    name: "Masala Chai",
    price: 4000,
  });
  await created.commit;
  const orderId = created.orderId;
  const items = mergeItemIntoLines(
    created.items,
    "gulab-jamun",
    "Gulab Jamun (2 pc)",
    8000
  );
  await writeOrderItems(orderId, items);
  const kotId = await sendKot(orderId, TABLE_LABEL);
  assert(kotId, "sendKot returned a kot id");
  ok(`waiter fired KOT ${kotId} with 2 lines (subtotal 12000)`);

  const kot = await fetchKot(kotId!);
  const chaiLine = kot.items.find((l) => l.name === "Masala Chai");
  assert(chaiLine, "chai line on the ticket");

  // ── Kitchen and waiter must NOT be able to void a line ───────────────────
  await signIn("kitchen");
  await expectDenied("kitchen voidKotItem", voidKotItem(kot, chaiLine.lineId));
  ok("kitchen was denied removing an item (rules)");

  await signIn("waiter");
  await expectDenied("waiter voidKotItem", voidKotItem(kot, chaiLine.lineId));
  ok("waiter was denied removing an item (rules)");

  // ── Cashier removes the chai ─────────────────────────────────────────────
  const cashierUid = await signIn("cashier");
  await voidKotItem(kot, chaiLine.lineId);
  const kotAfter = await fetchKot(kotId!);
  assert(
    kotAfter.items.find((l) => l.lineId === chaiLine.lineId)!.voided === true,
    "kot line marked VOID"
  );
  assert(
    kotAfter.items.filter((l) => !l.voided).length === 1,
    "other kot line untouched"
  );
  let order = await fetchOrder(orderId);
  const orderLine = order.items.find((l) => l.lineId === chaiLine.lineId);
  assert(orderLine?.voided === true, "order line marked VOID");
  assert(order.subtotal === 8000, `subtotal dropped to 8000, got ${order.subtotal}`);
  ok("cashier voided the line: kot VOID + order VOID + subtotal 12000 → 8000");

  // ── Finish normally so the table ends clean ──────────────────────────────
  await signIn("kitchen");
  await startKot(kotId!);
  await completeKot(kotId!);
  await signIn("cashier");
  order = await fetchOrder(orderId);
  const billId = await generateBill(order, cashierUid, TABLE_LABEL);
  const billSnap = await getDoc(paths.bill(billId));
  const bill = { ...billSnap.data(), id: billSnap.id } as Bill;
  assert(bill.subtotal === 8000, `bill excludes voided line, got ${bill.subtotal}`);
  order = await fetchOrder(orderId);
  await settleBill(bill, order, "cash");
  const freedTable = await getDoc(paths.table(TABLE_ID));
  assert(freedTable.data()!.status === "available", "table freed");
  ok(`billed ₹${(bill.grandTotal / 100).toFixed(2)} without the voided item; table freed`);

  console.log(`\nE2E PASS — ${step} checkpoints, cashier-only item removal verified.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nE2E FAIL:", e);
    process.exit(1);
  });
