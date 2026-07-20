/**
 * Bundled fallback photos for the seeded menu items, keyed by menu-item id.
 *
 * The seeded Firestore docs carry no photo, so the order/menu cards would
 * otherwise show the empty placeholder. These locally-bundled JPEGs (sourced
 * from Wikimedia Commons, one matching photo per dish) give every seeded item a
 * real image without a network round-trip. A card should always prefer the
 * item's own uploaded photo and only fall back to this map — that ordering
 * lives in `useMenuImage` (menuImageStore.ts).
 *
 * `require` returns a static asset module id (a number), which is exactly what
 * expo-image accepts as a bundled `source`.
 */
import type { ImageSourcePropType } from "react-native";

const MENU_IMAGES: Record<string, ImageSourcePropType> = {
  "veg-manchurian": require("../../../assets/menu/veg-manchurian.jpg"),
  "chicken-65": require("../../../assets/menu/chicken-65.jpg"),
  "paneer-tikka": require("../../../assets/menu/paneer-tikka.jpg"),
  "paneer-butter-masala": require("../../../assets/menu/paneer-butter-masala.jpg"),
  "butter-chicken": require("../../../assets/menu/butter-chicken.jpg"),
  "dal-tadka": require("../../../assets/menu/dal-tadka.jpg"),
  "veg-biryani": require("../../../assets/menu/veg-biryani.jpg"),
  "chicken-biryani": require("../../../assets/menu/chicken-biryani.jpg"),
  "butter-naan": require("../../../assets/menu/butter-naan.jpg"),
  "jeera-rice": require("../../../assets/menu/jeera-rice.jpg"),
  "masala-chai": require("../../../assets/menu/masala-chai.jpg"),
  "fresh-lime-soda": require("../../../assets/menu/fresh-lime-soda.jpg"),
  "mango-lassi": require("../../../assets/menu/mango-lassi.jpg"),
  "gulab-jamun": require("../../../assets/menu/gulab-jamun.jpg"),
  "gajar-halwa": require("../../../assets/menu/gajar-halwa.jpg"),
};

/**
 * The bundled seed photo for an item id, if one exists.
 *
 * `require` hands back a stable module id, so this is safe to call during
 * render — unlike a fresh `{ uri }` object, which expo-image would treat as a
 * new image and re-decode every time.
 *
 * Uploaded photos do NOT come from here: they live in `menuItemImages/{id}`
 * and are resolved by `useMenuImage` in menuImageStore.ts.
 */
export function bundledMenuImage(id: string): ImageSourcePropType | undefined {
  return MENU_IMAGES[id];
}
