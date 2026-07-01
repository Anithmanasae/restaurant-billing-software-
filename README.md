# SADA POS

Restaurant billing software — React + Vite + Firebase (Firestore real-time).
Built for a standalone restaurant in Karnataka, India (GST 5% = 2.5% CGST +
2.5% SGST).

## Modules

Authentication · Table management · Waiter order + KOT · Kitchen display (KDS) ·
Cashier billing (GST, discount, payment, print) · Menu management · Reports ·
Real-time updates everywhere.

## Architecture

- **No backend server.** Firebase client SDK + **Firestore Security Rules** are
  the server-side security boundary (see `firestore.rules`).
- **Real-time by default** via Firestore `onSnapshot` — no websockets to run.
- **Money as integer paise**; all bill math in `src/lib/money.ts`.
- Canonical data model in `src/types/models.ts`.

See `CONVENTIONS.md` (engineering rules) and `design/` (per-screen specs).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Firebase web config
npm run dev                  # http://localhost:5173
```

Local Firebase emulators (optional):

```bash
# set VITE_USE_EMULATORS=true in .env.local
npm run emulators
```

## Deploy

```bash
npm run build
firebase deploy              # hosting + firestore rules + storage rules
```

## Status

- **Phase 0 (foundation): done** — scaffold, Firebase, data model, security
  rules, auth + role routing, design specs.
- Phases 1–5 (modules) build on this foundation, one per feature folder.
