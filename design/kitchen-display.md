# Screen: Kitchen Display (KDS) — `features/kitchen`

Route: `/kds` · Roles: admin, kitchen · Tab: **KDS**

## Layout

1. **Header:** "SADA POS" + bell.
2. **Title:** `Kitchen Display` + subtitle "Manage active orders across all
   stations."
3. **Filter tabs:** `Live (n) ●` (active, green dot) · `Urgent (n)` ·
   `Ready (n)`. Counts are live.
   - **Live** = KOTs with status `new`/`preparing`.
   - **Urgent** = live KOTs whose elapsed time exceeds a threshold (e.g. >15m).
   - **Ready** = status `ready`.
4. **Ticket cards** (vertical list), each:
   - Header: colored status dot + **`#ticketNumber`** (e.g. #4092), an
     **elapsed timer** ("18:42 ELAPSED"; amber pill when urgent), printer icon
     (reprint → increments `printedCount`).
   - Sub-header: table label + order type ("Table 12 · Dine In" /
     "Takeaway") on the left, **"N Items"** on the right.
   - Item lines: `qty×  Name`, with modifiers/notes as indented gray sub-lines
     ("– No Onions", "– Med Rare"). **Voided** items show struck-through gray.
   - Actions: two buttons — **Start** (amber when actionable → sets
     `preparing`) and **Ready** (gray → sets `ready`). A ready ticket in the
     Ready tab shows a **Complete** action → `completed` (leaves the board).

## Behavior

- Fully real-time: subscribe to `kots` where `status != "completed"`, ordered
  by `createdAt` ascending. New tickets appear instantly (this is the "new
  order notification"); optionally play a sound/toast on additions.
- Timer derived from `createdAt`; recompute every second in the UI.
- Kitchen may ONLY change `status`/`printedCount` (enforced by rules).

## Data

- Reads: `paths.kots()` (live query).
- Writes: `paths.kot(id)` — `status`, `printedCount` only.
