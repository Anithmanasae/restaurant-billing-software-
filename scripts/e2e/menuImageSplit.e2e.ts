/**
 * E2E test of the menu-photo split against the live dev Firebase project.
 *
 * Photos no longer live inside `menuItems/{id}` — they go to
 * `menuItemImages/{id}`, so listing the menu doesn't download the whole photo
 * library. This asserts the invariants that split depends on:
 *
 *   1. creating an item WITH a photo writes both docs, and the item doc
 *      carries `hasImage: true` but NO inline base64
 *   2. creating an item WITHOUT a photo writes no image doc and no `hasImage`
 *   3. replacing the photo overwrites the image doc, item stays clean
 *   4. removing the photo (`null`) deletes the image doc and clears the flag
 *   5. deleting the item cascades to its image doc — no orphaned blobs
 *   6. a waiter can READ an image doc (the grid needs it) but not WRITE one
 *
 * Requires the new `menuItemImages` rules to be deployed:
 *   npx firebase-tools deploy --only firestore:rules --non-interactive
 *
 * Run: npx tsx --tsconfig scripts/e2e/tsconfig.json scripts/e2e/menuImageSplit.e2e.ts
 */
import { signInWithEmailAndPassword } from "firebase/auth";
import { deleteDoc, getDoc, setDoc } from "firebase/firestore";
import { auth, RESTAURANT_ID } from "./firebase-shim";
import { paths, setActiveRestaurantId } from "@/lib/firestore/paths";

setActiveRestaurantId(RESTAURANT_ID);
import {
  createMenuItem,
  deleteMenuItem,
  updateMenuItem,
} from "@/features/menu/menuApi";

const PASSWORD = "Sada@1234";

/** A 1x1 JPEG as a data URI — same shape as a real photo, 1000x smaller. */
const PHOTO_A =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
/** A 1x1 PNG — genuinely different bytes, so "replaced" is a real assertion. */
const PHOTO_B =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let step = 0;
function ok(msg: string) {
  step += 1;
  console.log(`  ✔ [${step}] ${msg}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function signIn(role: "waiter" | "cashier"): Promise<string> {
  const cred = await signInWithEmailAndPassword(
    auth,
    `${role}@sada-pos.test`,
    PASSWORD
  );
  return cred.user.uid;
}

async function main() {
  console.log("\n=== menu photo split ===\n");

  await signIn("cashier");
  ok("signed in as cashier (menu editor)");

  // 1. create WITH a photo
  const withPhoto = await createMenuItem(
    {
      name: "verify-photo-item",
      categoryId: "starters",
      price: 12300,
      enabled: true,
    },
    PHOTO_A
  );
  {
    const item = await getDoc(paths.menuItem(withPhoto));
    const img = await getDoc(paths.menuItemImage(withPhoto));
    assert(item.exists(), "item doc written");
    assert(item.data()!.hasImage === true, "hasImage flag set");
    assert(
      item.data()!.imageUrl === undefined,
      "NO inline base64 left on the item doc"
    );
    assert(img.exists(), "image doc written");
    assert(img.data()!.dataUri === PHOTO_A, "photo bytes landed in image doc");
    ok("create with photo → two docs, item stays light");
  }

  // 2. create WITHOUT a photo costs no image doc
  const noPhoto = await createMenuItem({
    name: "verify-plain-item",
    categoryId: "starters",
    price: 4500,
    enabled: true,
  });
  {
    const item = await getDoc(paths.menuItem(noPhoto));
    const img = await getDoc(paths.menuItemImage(noPhoto));
    assert(!img.exists(), "no image doc for a photo-less item");
    assert(!item.data()!.hasImage, "hasImage not set");
    ok("create without photo → one doc, zero extra reads for readers");
  }

  // 3. replace the photo
  await updateMenuItem(withPhoto, { price: 15000 }, PHOTO_B);
  {
    const item = await getDoc(paths.menuItem(withPhoto));
    const img = await getDoc(paths.menuItemImage(withPhoto));
    assert(item.data()!.price === 15000, "price patch applied");
    assert(item.data()!.hasImage === true, "hasImage still true");
    assert(img.data()!.dataUri === PHOTO_B, "photo replaced");
    ok("replace photo → image doc overwritten, item untouched");
  }

  // 3b. a patch with NO photo argument must leave the photo alone
  await updateMenuItem(withPhoto, { name: "verify-photo-item-renamed" });
  {
    const img = await getDoc(paths.menuItemImage(withPhoto));
    assert(img.exists(), "photo survives an unrelated edit");
    ok("edit without touching the picker → photo not rewritten");
  }

  // 4. remove the photo
  await updateMenuItem(withPhoto, {}, null);
  {
    const item = await getDoc(paths.menuItem(withPhoto));
    const img = await getDoc(paths.menuItemImage(withPhoto));
    assert(item.data()!.hasImage === false, "hasImage cleared");
    assert(!img.exists(), "image doc deleted");
    ok("remove photo → image doc gone, flag cleared");
  }

  // 5. delete cascades
  await updateMenuItem(withPhoto, {}, PHOTO_A); // give it a photo back
  await deleteMenuItem(withPhoto);
  {
    const item = await getDoc(paths.menuItem(withPhoto));
    const img = await getDoc(paths.menuItemImage(withPhoto));
    assert(!item.exists(), "item deleted");
    assert(!img.exists(), "image deleted with it — no orphaned blob");
    ok("delete item → photo cascades");
  }

  // 6. rules: waiters read photos, never write them
  const readable = await createMenuItem(
    {
      name: "verify-rules-item",
      categoryId: "starters",
      price: 9900,
      enabled: true,
    },
    PHOTO_A
  );
  await signIn("waiter");
  {
    const img = await getDoc(paths.menuItemImage(readable));
    assert(img.exists(), "waiter CAN read a menu photo (the grid needs it)");
    ok("waiter read allowed");

    let denied = false;
    try {
      await setDoc(paths.menuItemImage(readable), {
        dataUri: PHOTO_B,
        updatedAt: null,
      });
    } catch (e) {
      denied = (e as { code?: string }).code === "permission-denied";
    }
    assert(denied, "waiter write must be permission-denied");
    ok("waiter write denied");
  }

  // cleanup
  await signIn("cashier");
  await deleteMenuItem(readable);
  await deleteDoc(paths.menuItem(noPhoto));
  ok("cleaned up test items");

  console.log("\n=== all menu photo split checks passed ===\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n", e);
    process.exit(1);
  });
