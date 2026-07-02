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
