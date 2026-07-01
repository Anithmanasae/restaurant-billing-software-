# SADA POS — Engineering Conventions

**Read this before touching any code.** Every module must follow these so the
app stays consistent even though modules are built by separate agents.

## Stack

- React 18 + TypeScript + Vite. Routing via `react-router-dom` v6.
- Firebase: Auth + Firestore (real-time) + Storage. **No Cloud Functions** —
  all logic runs client-side, guarded by `firestore.rules`.
- No component library. Plain CSS with the tokens in `src/styles/theme.css`.

## Golden rules

1. **Never talk to Firestore directly from a component.** Use `paths` from
   `src/lib/firestore/paths.ts` and the hooks in `src/lib/firestore/useRealtime.ts`.
2. **Never redefine data shapes.** Import from `src/types/models.ts`.
3. **Never do money math inline.** Use `computeBill` / `formatMoney` from
   `src/lib/money.ts`. All money is stored as integer **paise**.
4. **Never hardcode colors, spacing, or radii.** Use CSS variables from
   `theme.css`. Currency symbol is `₹` (INR), locale `en-IN`.
5. **Real-time by default.** Screens that show live data subscribe via the
   realtime hooks — never poll, never one-shot `getDocs` for live views.
6. **Role checks** for UX come from `useAuth()`; the real enforcement is in
   `firestore.rules`. If you add a write, add/verify the matching rule.

## Folder structure

```
src/
  App.tsx                 # route table (roles -> modules)
  main.tsx                # providers + router
  components/             # shared UI (buttons, nav, cards)
  config/tax.ts           # GST config
  features/
    auth/                 # DONE — login, roles, guards
    tables/               # BG agent
    menu/                 # BG agent
    order/                # BG agent (waiter + KOT)
    kitchen/              # BG agent (KDS)
    cashier/              # BG agent (bills)
    reports/              # BG agent (insights)
  lib/
    firebase.ts           # SDK init (do not re-init)
    firestore/            # paths + realtime hooks
    money.ts              # bill math
  styles/                 # theme + global css
  types/models.ts         # canonical data model
```

Each feature folder owns: its screens, a `*.css`, and its own Firestore
read/write helpers built on top of `paths`/realtime hooks (e.g.
`features/tables/tablesApi.ts`).

## UI conventions (from the mockups — see `/design`)

- Mobile-first, ~480px max width, white cards on `--color-bg` canvas.
- Bottom tab nav. Two variants: staff (Home/Menu/KDS/Insights) and cashier
  (Tables/Bills/Sales/Items/More). Active tab uses `--color-primary` + soft bg.
- Cards: `--radius-lg`, `--shadow-card`, `--space-4` padding.
- Primary actions: solid green (`--color-primary`) full-width buttons.
- Money always via `formatMoney`; show 2 decimals.

## Definition of done for a module

- TypeScript compiles (`npm run build`) with no errors.
- All data is live (Firestore subscriptions), not mocked.
- Every write has a corresponding allow-rule in `firestore.rules`.
- Matches the relevant `/design/*.md` spec.
- No hardcoded colors/money/paths.
