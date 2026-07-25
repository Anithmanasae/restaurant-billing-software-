# SADA POS — Engineering Conventions (React Native + Expo)

**Read this before touching any code.** The app is **React Native via Expo**
(managed workflow, runs in **Expo Go**), routed with **expo-router**. It was
ported from an earlier web build: the entire logic/backend layer is reused; the
screens are being rebuilt in React Native.

## Stack

- Expo SDK 52, React Native 0.76, React 18.3, TypeScript (strict).
- Routing: **expo-router** (file-based, in `app/`).
- Firebase **JS SDK** (`firebase`) — NOT `@react-native-firebase` — so it runs
  in Expo Go. Auth uses AsyncStorage persistence (already set up).
- No UI kit. Styling with `StyleSheet.create` + tokens in `src/theme/theme.ts`.

## Golden rules

1. **Never talk to Firestore directly from a screen.** Use `paths` from
   `src/lib/firestore/paths.ts` and the realtime hooks in
   `src/lib/firestore/useRealtime.ts` (or a feature's `use*Data.ts`).
2. **Never redefine data shapes.** Import from `src/types/models.ts`.
3. **Never do money math inline.** Use `computeBill` / `formatMoney` /
   `rupeesToPaise` from `src/lib/money.ts`. Money is integer **paise**.
4. **Never hardcode colors, spacing, or radii.** Import `colors`, `space`,
   `radius`, `shadow`, `currency` from `src/theme/theme.ts`.
5. **Real-time by default.** Live screens subscribe via the realtime hooks —
   never poll, never a one-shot `getDocs` for a live view.
6. **Role checks** for UX come from `useAuth()`; the real enforcement is in
   `firestore.rules`. If you add a write, verify a matching rule exists.

## React Native specifics (do NOT use web APIs)

- Use RN primitives: `View`, `Text`, `ScrollView`, `FlatList`, `Pressable`,
  `TextInput`, `Image`. NO `div`/`button`/`input`/`img`, NO CSS/className, NO
  `window`/`document`.
- Lists: prefer `FlatList`/`SectionList` for anything scrollable+dynamic.
- Images: use `expo-image`'s `Image` (`import { Image } from "expo-image"`).
- Menu image upload: pick with `expo-image-picker`, convert the local uri to a
  Blob (`const blob = await (await fetch(uri)).blob()`), pass to
  `uploadMenuItemImage(itemId, blob)`.
- IDs: use `randomUUID` from `expo-crypto` (already used in orderApi).
- Navigation: `import { router } from "expo-router"` then `router.push("/order/" + tableId)`;
  read params with `useLocalSearchParams`.
- Safe areas: wrap screen content with `useSafeAreaInsets` or
  `SafeAreaView` from `react-native-safe-area-context`.

## Text never fits — assume it doesn't

Every layout has to survive text that is wider than you drew it. Two things
make this bite on a client's phone and not on your dev device:

1. **The OS font scale.** Android's Font size / Display size settings enlarge
   every `Text`. `src/theme/textScaling.ts` clamps the multiplier to
   `MAX_FONT_SCALE` (1.25) app-wide, so budget for content **25% wider** than
   what you see at 1.0×. Don't undo the cap per-node.
2. **Unbounded values.** Money and durations grow: `₹9,486.00`, `3d 21h`,
   a 30-character dish name.

So, for any row that pairs two pieces of text (value + label, name + price,
title + timer):

- **Never a bare `flexDirection: "row"` + `justifyContent: "space-between"`.**
  Space-between only looks like spacing while the content fits; on overflow the
  two texts butt together and spill past the padding.
- Add `columnGap`/`gap` (real breathing room), `flexShrink: 1` on the side
  that may give way, and `numberOfLines` so nothing silently reflows into the
  neighbouring row.
- In a narrow tile (2-column grids), also `flexWrap: "wrap"` + `rowGap` so the
  smaller value drops to its own line instead of colliding. See
  `TableCard.metaRow` and `OrderMenuCard.priceRow`.
- Before shipping an APK, sanity-check the dense screens (Tables, KDS, Order)
  with **Settings → Display → Font size turned up** — that is the state the
  restaurant's phones are actually in.

## Folder structure

```
app/                      # expo-router routes (thin — render feature screens)
  _layout.tsx             # root: AuthProvider + Stack  (DONE)
  index.tsx               # role redirect               (DONE)
  login.tsx               # RN login                    (DONE)
  (app)/_layout.tsx       # auth guard + Stack          (DONE)
  (app)/{menu,tables,kds,bills,insights}.tsx
  (app)/order/{index,[tableId]}.tsx
src/
  theme/theme.ts          # design tokens (colors/space/radius)
  config/tax.ts           # GST config
  types/models.ts         # canonical data model
  lib/firebase.ts         # SDK init (RN persistence) — do not re-init
  lib/firestore/          # paths + realtime hooks
  lib/money.ts, lib/date.ts
  features/
    auth/                 # AuthContext, roleRoutes      (DONE)
    menu/  tables/  order/  kitchen/  cashier/  reports/
      *Api.ts, use*Data.ts   # PORTED — reuse, do not rewrite
      <Screen>.tsx           # REBUILD in RN
      index.ts               # export the screen
```

Route files in `app/(app)/` should stay thin and render the feature screen,
e.g. `export default function MenuRoute(){ return <MenuManagementScreen/> }`.
The wiring is done by the integrator (the parent), not the screen agents —
build and export your screen from `src/features/<x>/index.ts`.

## Design specs

`design/*.md` describe each screen's **layout, behavior, and data** (written for
the web build). Honor the layout/behavior/data; **translate the DOM/CSS details
into RN primitives + theme tokens**. Keep the SADA look: white cards on the gray
canvas, green primary, rounded corners, mobile-first.

## Definition of done for a screen

- `npm run typecheck` (tsc) passes, zero errors.
- All data is live (Firestore subscriptions via the ported hooks), not mocked.
- Reuses the ported `*Api.ts` for every write (don't reimplement writes).
- Uses theme tokens; no hardcoded colors/spacing; money via `formatMoney`.
- No web APIs. Matches the relevant `design/*.md`.
