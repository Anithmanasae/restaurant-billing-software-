import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/features/auth/AuthContext";
import { generateBill } from "./cashierApi";
import {
  useActiveBills,
  useAllTables,
  useBillableOrders,
} from "./useCashierData";
import { BillDetail } from "./BillDetail";
import type { Order, Table } from "@/types/models";
import "./cashier.css";

function tableLabelFor(tables: (Table & { id: string })[], tableId: string | null) {
  if (!tableId) return "Takeaway";
  const t = tables.find((x) => x.id === tableId);
  return t ? t.label ?? `Table ${t.number}` : `Table ${tableId}`;
}

export function BillsScreen() {
  const { profile } = useAuth();
  const { data: bills } = useActiveBills();
  const { data: orders } = useBillableOrders();
  const { data: tables } = useAllTables();
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const sortedBills = useMemo(
    () =>
      [...bills].sort((a, b) => {
        if (a.status === b.status) return 0;
        return a.status === "requested" ? -1 : 1;
      }),
    [bills]
  );

  async function onGenerate(order: Order & { id: string }) {
    if (!profile) return;
    setGenerating(order.id);
    try {
      const billId = await generateBill(
        { ...order },
        profile.uid,
        tableLabelFor(tables, order.tableId)
      );
      setSelectedBillId(billId);
    } finally {
      setGenerating(null);
    }
  }

  if (selectedBillId) {
    return (
      <div className="cashier">
        <header className="cashier__head">
          <button className="link-btn" onClick={() => setSelectedBillId(null)}>
            ← Bills
          </button>
          <div className="cashier__who">
            <strong>{profile?.name}</strong>
            <span>{profile?.role}</span>
          </div>
        </header>
        <BillDetail billId={selectedBillId} />
      </div>
    );
  }

  return (
    <div className="cashier">
      <header className="cashier__head">
        <h1>Bills</h1>
        <div className="cashier__who">
          <strong>{profile?.name}</strong>
          <span>{profile?.role}</span>
        </div>
      </header>

      <section>
        <h2 className="cashier__section">Requested &amp; in progress</h2>
        {sortedBills.length === 0 && (
          <p className="cashier__empty">No bills waiting.</p>
        )}
        {sortedBills.map((b) => (
          <button
            key={b.id}
            className="bill-row"
            onClick={() => setSelectedBillId(b.id)}
          >
            <div>
              <strong>{b.tableLabel}</strong>
              <span className={`chip chip--${b.status}`}>{b.status}</span>
            </div>
            <span className="bill-row__total">{formatMoney(b.grandTotal)}</span>
          </button>
        ))}
      </section>

      <section>
        <h2 className="cashier__section">Ready to bill</h2>
        {orders.length === 0 && (
          <p className="cashier__empty">No open orders to bill.</p>
        )}
        {orders.map((o) => (
          <div key={o.id} className="bill-row bill-row--order">
            <div>
              <strong>{tableLabelFor(tables, o.tableId)}</strong>
              <span className="bill-row__sub">
                {o.items.filter((i) => !i.voided).length} items ·{" "}
                {formatMoney(o.subtotal)}
              </span>
            </div>
            <button
              className="gen-btn"
              disabled={generating === o.id}
              onClick={() => onGenerate(o)}
            >
              {generating === o.id ? "…" : "Generate bill"}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
