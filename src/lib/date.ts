/**
 * Date helpers. `dayKey` is the id used for `dailySummaries/{yyyy-mm-dd}`,
 * computed for the restaurant's local business day (IST, UTC+5:30).
 *
 * We compute the IST offset manually rather than via Intl/toLocaleString so it
 * works reliably under Hermes (React Native), which has limited timezone data.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function dayKey(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of the current IST business day, as a real Date (for range queries). */
export function startOfDayIST(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** Clock time like "10:04 AM" in IST (manual offset — see note above). */
export function formatTimeIST(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const h24 = ist.getUTCHours();
  const m = String(ist.getUTCMinutes()).padStart(2, "0");
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m} ${ampm}`;
}
