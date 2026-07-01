/**
 * Money & bill math — the single implementation used everywhere.
 *
 * All amounts are integers in PAISE (₹1 = 100 paise) to eliminate floating
 * point rounding errors on money. Only convert to rupees for display.
 *
 * Subagents: never do bill arithmetic inline. Call `computeBill` / `formatMoney`.
 */
import { TAX_CONFIG } from "@/config/tax";
import type { Bill } from "@/types/models";

/** Round half-up to the nearest integer paise. */
function roundPaise(value: number): number {
  return Math.round(value);
}

/** ₹85.00 -> 8500 paise */
export function rupeesToPaise(rupees: number): number {
  return roundPaise(rupees * 100);
}

/** 8500 paise -> "₹85.00" */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  return `${TAX_CONFIG.currencySymbol}${rupees.toLocaleString(TAX_CONFIG.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface BillLine {
  price: number; // paise, per unit
  qty: number;
  voided?: boolean;
}

export type BillTotals = Pick<
  Bill,
  | "subtotal"
  | "discountPercent"
  | "discountAmount"
  | "cgst"
  | "sgst"
  | "gstTotal"
  | "grandTotal"
>;

/**
 * Compute a bill from order lines + an optional discount percent.
 *
 * Order of operations (matches the Bills mockup):
 *   subtotal        = Σ price*qty for non-voided lines
 *   discountAmount  = subtotal * discount%
 *   taxable         = subtotal - discountAmount
 *   cgst            = taxable * 2.5%
 *   sgst            = taxable * 2.5%
 *   grandTotal      = taxable + cgst + sgst
 *
 * This function is also the reference the Firestore rules validate against,
 * so it must stay deterministic and integer-only.
 */
export function computeBill(lines: BillLine[], discountPercent = 0): BillTotals {
  const pct = Math.min(Math.max(discountPercent, 0), 100);

  const subtotal = lines
    .filter((l) => !l.voided)
    .reduce((sum, l) => sum + l.price * l.qty, 0);

  const discountAmount = roundPaise((subtotal * pct) / 100);
  const taxable = subtotal - discountAmount;

  const cgst = roundPaise(taxable * TAX_CONFIG.cgstRate);
  const sgst = roundPaise(taxable * TAX_CONFIG.sgstRate);
  const gstTotal = cgst + sgst;
  const grandTotal = taxable + gstTotal;

  return {
    subtotal,
    discountPercent: pct,
    discountAmount,
    cgst,
    sgst,
    gstTotal,
    grandTotal,
  };
}
