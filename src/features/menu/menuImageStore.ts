/**
 * Lazy loader for menu photos, which live in `menuItemImages/{itemId}` rather
 * than inside the menu item documents.
 *
 * Why the split: photos are compressed base64 data URIs of ~55-135 KB. Held
 * inline, every `menuItems` listener shipped the whole photo library down the
 * wire before the grid could paint — megabytes for a screen that needs names
 * and prices. Now the list stays small and each card pulls its own photo, once,
 * only when it actually mounts.
 *
 * Three rules make that cheap:
 *   1. ONE-SHOT reads (`getDoc`), never `onSnapshot`. A photo only changes when
 *      someone edits the item; streaming blobs live is the cost we removed.
 *   2. Items with no photo (`hasImage` falsy, no legacy `imageUrl`) cost zero
 *      reads — the flag on the light doc answers the question.
 *   3. A process-wide cache, so scrolling a card off and back on is free.
 */
import { useEffect, useState } from "react";
import { getDoc } from "firebase/firestore";
import type { ImageSourcePropType } from "react-native";
import { paths } from "@/lib/firestore/paths";
import type { MenuItem } from "@/types/models";
import { bundledMenuImage } from "./menuImages";

/**
 * Cap on cached photos. Each entry is a base64 string of ~100 KB, so this is
 * roughly a 12 MB ceiling — generous for scrolling, bounded for a long shift
 * on a cheap tablet. Eviction is insertion-order (oldest first), which for a
 * scrolling grid approximates least-recently-used closely enough.
 */
const MAX_CACHED_IMAGES = 120;

/** itemId -> the `{ uri }` wrapper. Stable identity matters: expo-image treats
 *  a new source object as a new image and re-decodes it. */
const cache = new Map<string, ImageSourcePropType>();

/** itemId -> in-flight fetch, so N cards mounting at once share ONE read. */
const inflight = new Map<string, Promise<ImageSourcePropType | undefined>>();

function remember(id: string, source: ImageSourcePropType): ImageSourcePropType {
  cache.set(id, source);
  while (cache.size > MAX_CACHED_IMAGES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  return source;
}

/** Drop an item's cached photo — call after its image is edited or deleted. */
export function invalidateMenuImage(id: string): void {
  cache.delete(id);
  inflight.delete(id);
}

/**
 * Fetch an item's photo from `menuItemImages/{id}`, deduped and cached.
 * Resolves to `undefined` when the doc is missing or unreadable — a card
 * without a photo is a normal state, never an error to surface.
 */
function loadRemoteImage(id: string): Promise<ImageSourcePropType | undefined> {
  const pending = inflight.get(id);
  if (pending) return pending;

  const task = getDoc(paths.menuItemImage(id))
    .then((snap) => {
      const dataUri = snap.exists() ? snap.data().dataUri : null;
      return dataUri ? remember(id, { uri: dataUri }) : undefined;
    })
    .catch(() => undefined)
    .finally(() => inflight.delete(id));

  inflight.set(id, task);
  return task;
}

/**
 * The image source for a menu item, or `undefined` while loading / when the
 * item has no photo (the caller shows its placeholder).
 *
 * Resolution order, cheapest first:
 *   1. a legacy inline `imageUrl` — un-migrated docs still carry theirs
 *   2. the bundled seed photo for this id, if any
 *   3. the cache
 *   4. a one-shot read of `menuItemImages/{id}`, only when `hasImage` is set
 */
export function useMenuImage(
  item: Pick<MenuItem, "id" | "imageUrl" | "hasImage"> & { id: string }
): ImageSourcePropType | undefined {
  const { id, imageUrl, hasImage } = item;

  // Synchronous sources — resolved during render so already-cached cards paint
  // with their photo on the FIRST frame instead of flashing a placeholder.
  const immediate = imageUrl
    ? remember(id, cache.get(id) ?? { uri: imageUrl })
    : bundledMenuImage(id) ?? cache.get(id);

  const [source, setSource] = useState<ImageSourcePropType | undefined>(
    immediate
  );

  useEffect(() => {
    if (immediate) {
      setSource(immediate);
      return;
    }
    if (!hasImage) {
      setSource(undefined);
      return;
    }
    let cancelled = false;
    loadRemoteImage(id).then((s) => {
      if (!cancelled) setSource(s);
    });
    return () => {
      cancelled = true;
    };
  }, [id, immediate, hasImage]);

  return source;
}
