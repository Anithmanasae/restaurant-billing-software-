/**
 * SADA POS — one-time seed script.
 *
 * Creates the first users (one per role), sample menu categories + items, and
 * a set of tables so you can log in and click through the app immediately.
 *
 * It uses the Firebase ADMIN SDK, which bypasses Firestore Security Rules —
 * that's required because the rules only let an existing admin create the first
 * admin (chicken-and-egg). Run it once, locally, with a service-account key.
 *
 * ── How to run ────────────────────────────────────────────────────────────
 *   1. Firebase Console → Project settings → Service accounts →
 *      "Generate new private key" → save as  scripts/serviceAccount.json
 *      (this file is gitignored — NEVER commit it).
 *   2. npm i -D firebase-admin            # if not already installed
 *   3. node scripts/seed.mjs
 *
 * Re-running is safe: users are reused, docs are merged (idempotent).
 * Default password for every seeded user: "sadapos123" — change these after.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESTAURANT_ID = process.env.EXPO_PUBLIC_RESTAURANT_ID || "sada-main";
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || "sadapos123";

// ── init admin sdk ──────────────────────────────────────────────────────────
const keyPath = join(__dirname, "serviceAccount.json");
let credential;
try {
  credential = admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8")));
} catch {
  console.error(
    `\n✗ Could not read scripts/serviceAccount.json.\n` +
      `  Download it from Firebase Console → Project settings → Service accounts\n` +
      `  → "Generate new private key", and save it there.\n`
  );
  process.exit(1);
}
admin.initializeApp({ credential });
const auth = admin.auth();
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();
const root = db.collection("restaurants").doc(RESTAURANT_ID);

// ── data ─────────────────────────────────────────────────────────────────────
const USERS = [
  { name: "Alex Mercer", email: "admin@sada.test", role: "admin" },
  { name: "Waiter One", email: "waiter@sada.test", role: "waiter" },
  { name: "Cashier One", email: "cashier@sada.test", role: "cashier" },
  { name: "Chef One", email: "kitchen@sada.test", role: "kitchen" },
];

const CATEGORIES = [
  { id: "starters", name: "Starters", sortOrder: 1 },
  { id: "main", name: "Main Course", sortOrder: 2 },
  { id: "beverages", name: "Beverages", sortOrder: 3 },
  { id: "desserts", name: "Desserts", sortOrder: 4 },
];

// price is in PAISE (₹1 = 100). e.g. ₹85.00 => 8500
const ITEMS = [
  { name: "Paneer Tikka", categoryId: "starters", price: 24000 },
  { name: "Chicken 65", categoryId: "starters", price: 26000 },
  { name: "Veg Spring Roll", categoryId: "starters", price: 18000 },
  { name: "Butter Chicken", categoryId: "main", price: 34000 },
  { name: "Paneer Butter Masala", categoryId: "main", price: 29000 },
  { name: "Veg Biryani", categoryId: "main", price: 22000 },
  { name: "Masala Dosa", categoryId: "main", price: 12000 },
  { name: "Masala Chai", categoryId: "beverages", price: 4000 },
  { name: "Fresh Lime Soda", categoryId: "beverages", price: 8000 },
  { name: "Cold Coffee", categoryId: "beverages", price: 12000 },
  { name: "Gulab Jamun", categoryId: "desserts", price: 9000 },
];

const TABLE_COUNT = 8;

// ── helpers ──────────────────────────────────────────────────────────────────
async function ensureUser({ name, email, role }) {
  let user;
  try {
    user = await auth.createUser({ email, password: DEFAULT_PASSWORD, displayName: name });
    console.log(`  + auth user ${email}`);
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      user = await auth.getUserByEmail(email);
      console.log(`  = auth user ${email} (exists)`);
    } else {
      throw e;
    }
  }
  await root.collection("users").doc(user.uid).set(
    { uid: user.uid, name, email, role, active: true, createdAt: now },
    { merge: true }
  );
}

// ── run ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding restaurant "${RESTAURANT_ID}"…\n`);

  console.log("Users:");
  for (const u of USERS) await ensureUser(u);

  console.log("Menu categories:");
  const batch1 = db.batch();
  for (const c of CATEGORIES) {
    batch1.set(
      root.collection("menuCategories").doc(c.id),
      { ...c, enabled: true },
      { merge: true }
    );
  }
  await batch1.commit();
  console.log(`  + ${CATEGORIES.length} categories`);

  console.log("Menu items:");
  const batch2 = db.batch();
  for (const it of ITEMS) {
    const ref = root.collection("menuItems").doc();
    batch2.set(ref, { ...it, enabled: true, createdAt: now, updatedAt: now });
  }
  await batch2.commit();
  console.log(`  + ${ITEMS.length} items`);

  console.log("Tables:");
  const batch3 = db.batch();
  for (let n = 1; n <= TABLE_COUNT; n++) {
    batch3.set(
      root.collection("tables").doc(`t${n}`),
      {
        number: n,
        label: `T${n}`,
        capacity: n % 3 === 0 ? 6 : 4,
        status: "available",
        currentOrderId: null,
        mergedInto: null,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  await batch3.commit();
  console.log(`  + ${TABLE_COUNT} tables`);

  console.log(`\n✓ Seed complete. Sign in with:`);
  for (const u of USERS) console.log(`    ${u.role.padEnd(8)} ${u.email}  /  ${DEFAULT_PASSWORD}`);
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ Seed failed:", e);
  process.exit(1);
});
