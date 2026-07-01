import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/features/auth/AuthContext";
import { applyDiscount, reprintBill, settleBill } from "./cashierApi";
import { useBill, useOrder } from "./useCashierData";
import type { PaymentMode } from "@/types/models";

const PAYMENTS: { mode: PaymentMode; label: string; icon: string }[] = [
  { mode: "cash", label: "Cash", icon: "💵" },
  { mode: "upi", label: "UPI/QR", icon: "📱" },
  { mode: "card", label: "Card", icon: "💳" },
];

/** Discounts above this need an admin (waiters/cashiers capped in the UI). */
const CASHIER_DISCOUNT_CAP = 20;

export function BillDetail({ billId }: { billId: string }) {
  const { role } = useAuth();
  const { data: bill } = useBill(billId);
  const { data: order } = useOrder(bill?.orderId ?? null);
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [busy, setBusy] = useState(false);

  const paid = bill?.status === "paid";
  const discountCap = role === "admin" ? 100 : CASHIER_DISCOUNT_CAP;

  const rows = useMemo(
    () =>
      bill
        ? [
            { label: "Subtotal", value: formatMoney(bill.subtotal) },
            {
              label: `Discount (${bill.discountPercent}%)`,
              value: `−${formatMoney(bill.discountAmount)}`,
              green: true,
            },
            { label: "GST (5%)", value: formatMoney(bill.gstTotal) },
          ]
        : [],
    [bill]
  );

  if (!bill) return <div className="bill-detail__empty">Select a bill…</div>;

  async function onDiscount(next: number) {
    if (!bill || !order || paid) return;
    await applyDiscount(bill.id, order, Math.min(Math.max(next, 0), discountCap));
  }

  async function onSettle() {
    if (!bill || !order || !mode) return;
    setBusy(true);
    try {
      await settleBill(bill, order, mode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bill-detail">
      <section className="card bill-summary">
        <h2>Summary &amp; Modifiers</h2>
        {rows.map((r) => (
          <div className="bill-summary__row" key={r.label}>
            <span>{r.label}</span>
            <span className={r.green ? "is-green" : ""}>{r.value}</span>
          </div>
        ))}
        {!paid && (
          <div className="bill-summary__discount">
            <label>
              Discount %
              <input
                type="number"
                min={0}
                max={discountCap}
                value={bill.discountPercent}
                onChange={(e) => onDiscount(Number(e.target.value))}
              />
            </label>
            <span className="bill-summary__cap">max {discountCap}%</span>
          </div>
        )}
        <div className="bill-summary__row bill-summary__total">
          <span>Grand Total</span>
          <span className="is-green">{formatMoney(bill.grandTotal)}</span>
        </div>
      </section>

      <section className="card">
        <h2>Payment Method</h2>
        <div className="pay-grid">
          {PAYMENTS.map((p) => (
            <button
              key={p.mode}
              className={`pay-tile ${mode === p.mode ? "is-selected" : ""}`}
              disabled={paid}
              onClick={() => setMode(p.mode)}
            >
              <span className="pay-tile__icon">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Send Receipt</h2>
        <div className="receipt-grid">
          <button
            className="receipt-tile"
            onClick={() => reprintBill(bill.id, bill.printedCount)}
          >
            🖨 Thermal Printer
          </button>
          <button className="receipt-tile" disabled title="Coming in Phase 5">
            💬 WhatsApp
          </button>
        </div>
        {bill.printedCount > 0 && (
          <p className="receipt-count">Printed {bill.printedCount}×</p>
        )}
      </section>

      {paid ? (
        <div className="bill-paid">✓ Paid via {bill.paymentMode?.toUpperCase()}</div>
      ) : (
        <button
          className="settle-btn"
          disabled={!mode || busy}
          onClick={onSettle}
        >
          {busy ? "Settling…" : `Settle ${formatMoney(bill.grandTotal)}`}
        </button>
      )}
    </div>
  );
}
