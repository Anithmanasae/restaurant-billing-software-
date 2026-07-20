/**
 * Move inline menu photos out of the menu item documents (idempotent).
 *
 * Photos were stored as base64 data URIs in `menuItems/{id}.imageUrl`, so every
 * live menu subscription downloaded the entire photo library — megabytes — for
 * a screen that only needs names and prices. This copies each photo to
 * `menuItemImages/{id}.dataUri`, sets `hasImage: true` on the item, and clears
 * the inline field.
 *
 * Order matters: the image doc is written BEFORE the item is updated, in one
 * batch per item, so a card can never see `hasImage: true` with no photo behind
 * it. Re-running skips items that are already migrated.
 *
 * The app reads un-migrated docs too (it prefers a legacy inline `imageUrl`),
 * so old and new clients both work while this runs.
 *
 * Requires scripts/serviceAccount.json (same as seed.js).
 *
 * Usage:
 *   node scripts/migrateMenuImages.js --dry-run [restaurantId]   # report only
 *   node scripts/migrateMenuImages.js [restaurantId]             # migrate
 *        (restaurantId defaults to EXPO_PUBLIC_RESTAURANT_ID or "sada-main")
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "serviceAccount.json");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESTAURANT_ID =
  args.find((a) => !a.startsWith("--")) ||
  process.env.EXPO_PUBLIC_RESTAURANT_ID ||
  "sada-main";

/** Firestore's hard per-document ceiling. */
const MAX_DOC_BYTES = 1048576;

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error("Missing scripts/serviceAccount.json — see seed.js header.");
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
  });
  const db = admin.firestore();

  const root = await db.doc(`restaurants/${RESTAURANT_ID}`).get();
  if (!root.exists) {
    console.error(
      `restaurants/${RESTAURANT_ID} does not exist — pass the right id.`,
    );
    process.exit(1);
  }

  const itemsSnap = await db
    .collection(`restaurants/${RESTAURANT_ID}/menuItems`)
    .get();

  console.log(
    `${DRY_RUN ? "[dry run] " : ""}restaurant "${RESTAURANT_ID}": ` +
      `${itemsSnap.size} menu items\n`,
  );

  let migrated = 0;
  let skipped = 0;
  let bytesMoved = 0;
  const problems = [];

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const imageUrl = data.imageUrl;

    if (!imageUrl) {
      skipped += 1;
      continue;
    }

    // An https URL is not a blob — it costs nothing inline. Leave it be.
    if (!imageUrl.startsWith("data:")) {
      console.log(`  – ${doc.id}: hosted URL, left inline`);
      skipped += 1;
      continue;
    }

    const bytes = Buffer.byteLength(imageUrl, "utf8");
    if (bytes > MAX_DOC_BYTES) {
      // Cannot happen via the app (it compresses first), but a hand-written
      // doc could trip this — report rather than fail the whole run.
      problems.push(`${doc.id} (${data.name ?? "?"}): ${kb(bytes)} exceeds 1 MiB`);
      continue;
    }

    bytesMoved += bytes;
    console.log(`  → ${doc.id}: ${data.name ?? "?"} (${kb(bytes)})`);

    if (!DRY_RUN) {
      const batch = db.batch();
      batch.set(
        db.doc(`restaurants/${RESTAURANT_ID}/menuItemImages/${doc.id}`),
        {
          dataUri: imageUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      );
      batch.update(doc.ref, {
        hasImage: true,
        imageUrl: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
    }
    migrated += 1;
  }

  console.log(
    `\n${DRY_RUN ? "[dry run] would migrate" : "migrated"} ${migrated} photo(s)` +
      ` — ${kb(bytesMoved)} out of the menu list payload.` +
      `\n${skipped} item(s) had no inline photo.`,
  );

  if (problems.length > 0) {
    console.log(`\n${problems.length} item(s) NOT migrated:`);
    for (const p of problems) console.log(`  ! ${p}`);
  }

  if (DRY_RUN) {
    console.log("\nNothing was written. Re-run without --dry-run to apply.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
