/**
 * Menu Management write helpers — the only place this module talks to Firestore
 * for writes. Built on top of `paths` so the multi-tenant prefix lives in one
 * place, mirroring the `tablesApi` pattern.
 *
 * All reads for live views go through the realtime hooks in `useMenuData.ts`;
 * this file is create/update/delete only.
 */
import {
  addDoc,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type UpdateData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/firestore/paths";
import { invalidateMenuImage } from "./menuImageStore";
import type { MenuCategory, MenuItem } from "@/types/models";

// ── Menu items ───────────────────────────────────────────────────────────────

/**
 * Editable fields of a menu item, MINUS the photo.
 *
 * The photo is passed separately (see `photo` below) because it no longer
 * lives in this document — it goes to `menuItemImages/{id}`. `hasImage` is
 * derived from that write, never set by callers.
 */
export type MenuItemInput = Omit<MenuItem, "id" | "imageUrl" | "hasImage">;

/**
 * What to do with an item's photo on save:
 *   - `undefined` — leave whatever is already stored alone
 *   - a data URI  — replace it
 *   - `null`      — remove it
 */
export type PhotoInput = string | null | undefined;

/**
 * Create a new menu item. Returns the generated document id.
 *
 * With a photo this is a two-document batch (item + image) so a card can never
 * observe `hasImage: true` with no image doc behind it.
 */
export async function createMenuItem(
  input: MenuItemInput,
  photo?: PhotoInput
): Promise<string> {
  const fields = {
    ...stripUndefined(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as unknown as MenuItem;

  if (!photo) {
    const docRef = await addDoc(paths.menuItems(), fields);
    return docRef.id;
  }

  // Mint the id client-side so both docs can share it in one batch.
  const itemRef = doc(paths.menuItems());
  const batch = writeBatch(db);
  batch.set(itemRef, { ...fields, hasImage: true });
  batch.set(paths.menuItemImage(itemRef.id), {
    dataUri: photo,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  invalidateMenuImage(itemRef.id);
  return itemRef.id;
}

/**
 * Patch an existing menu item, and its photo when `photo` is not `undefined`.
 *
 * Also clears any LEGACY inline `imageUrl` whenever a photo is written, so
 * editing an un-migrated item quietly finishes its migration.
 */
export async function updateMenuItem(
  id: string,
  patch: Partial<MenuItemInput>,
  photo?: PhotoInput
): Promise<void> {
  // `UpdateData` is what updateDoc/batch.update expect; the sentinel values
  // (serverTimestamp, deleteField) don't fit the plain MenuItem shape.
  const fields = {
    ...stripUndefined(patch),
    updatedAt: serverTimestamp(),
  } as UpdateData<MenuItem>;

  if (photo === undefined) {
    await updateDoc(paths.menuItem(id), fields);
    return;
  }

  const batch = writeBatch(db);
  const imageRef = paths.menuItemImage(id);
  if (photo === null) {
    batch.update(paths.menuItem(id), {
      ...fields,
      hasImage: false,
      imageUrl: deleteField(),
    });
    batch.delete(imageRef);
  } else {
    batch.update(paths.menuItem(id), {
      ...fields,
      hasImage: true,
      imageUrl: deleteField(),
    });
    batch.set(imageRef, { dataUri: photo, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  invalidateMenuImage(id);
}

/** Toggle the enabled flag of a menu item. */
export function setMenuItemEnabled(id: string, enabled: boolean): Promise<void> {
  return updateMenuItem(id, { enabled });
}

/** Update just the price (paise) of a menu item — used for inline edits. */
export function setMenuItemPrice(id: string, price: number): Promise<void> {
  return updateMenuItem(id, { price });
}

/** Permanently delete a menu item AND its photo — never orphan the blob. */
export async function deleteMenuItem(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(paths.menuItem(id));
  batch.delete(paths.menuItemImage(id)); // no-op when there was no photo
  await batch.commit();
  invalidateMenuImage(id);
}

// Menu photos are still not uploaded anywhere (Firebase Storage needs the paid
// plan): they remain compressed base64 data URIs. What changed is WHERE they
// live — `menuItemImages/{itemId}` instead of inline on the item — so that
// listing the menu no longer downloads the whole photo library. See
// menuImageStore.ts for the read side.

// ── Menu categories ──────────────────────────────────────────────────────────

export type MenuCategoryInput = Omit<MenuCategory, "id">;

/** Create a category. Pass a fresh id from the caller (uses setDoc). */
export async function createMenuCategory(
  id: string,
  input: MenuCategoryInput
): Promise<void> {
  await setDoc(paths.menuCategory(id), input);
}

export async function updateMenuCategory(
  id: string,
  patch: Partial<MenuCategoryInput>
): Promise<void> {
  await updateDoc(paths.menuCategory(id), stripUndefined(patch));
}

export function setMenuCategoryEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  return updateMenuCategory(id, { enabled });
}

export function setMenuCategorySortOrder(
  id: string,
  sortOrder: number
): Promise<void> {
  return updateMenuCategory(id, { sortOrder });
}

/** Delete a category. Items are not cascaded — the caller decides. */
export async function deleteMenuCategory(id: string): Promise<void> {
  await deleteDoc(paths.menuCategory(id));
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Firestore rejects `undefined` values; drop optional fields that are unset. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
