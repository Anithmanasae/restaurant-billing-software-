/**
 * Date helpers. `dayKey` is the id used for `dailySummaries/{yyyy-mm-dd}`,
 * computed in the restaurant's local timezone (en-IN).
 */
export function dayKey(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; force IST so the "business day" is local.
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
