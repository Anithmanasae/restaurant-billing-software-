import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { OrderType } from "@/types/models";
import {
  currentRange,
  previousRange,
  computeDelta,
  paymentSummary,
  revenueSeries,
  sourceSummary,
  sumTotals,
  summariesForKeys,
  topItems,
  useDailySummaries,
  type RangeKind,
} from "./reportsData";
import { KpiCard } from "./KpiCard";
import { RevenueChart } from "./RevenueChart";
import "./reports.css";

type Tab = "analytics" | "reports";

const RANGE_OPTIONS: { kind: RangeKind; label: string }[] = [
  { kind: "today", label: "Today" },
  { kind: "week", label: "This Week" },
  { kind: "month", label: "This Month" },
];

const SOURCE_META: { key: OrderType; label: string; icon: string }[] = [
  { key: "dine-in", label: "Dine-In", icon: "🍽️" },
  { key: "takeaway", label: "Takeout", icon: "🥡" },
  { key: "delivery", label: "Delivery", icon: "🛵" },
];

export function InsightsScreen() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [rangeKind, setRangeKind] = useState<RangeKind>("week");
  const [showAllItems, setShowAllItems] = useState(false);

  // Current + previous ranges; subscribe from the earliest key we need.
  const { cur, prev } = useMemo(() => {
    const now = new Date();
    return { cur: currentRange(rangeKind, now), prev: previousRange(rangeKind, now) };
  }, [rangeKind]);

  const { data: allSummaries, loading, error } = useDailySummaries(prev.start);

  const curSummaries = useMemo(
    () => summariesForKeys(allSummaries, cur.keys),
    [allSummaries, cur.keys]
  );
  const prevSummaries = useMemo(
    () => summariesForKeys(allSummaries, prev.keys),
    [allSummaries, prev.keys]
  );

  const totals = useMemo(() => sumTotals(curSummaries), [curSummaries]);
  const prevTotals = useMemo(() => sumTotals(prevSummaries), [prevSummaries]);
  const series = useMemo(
    () => revenueSeries(curSummaries, cur.keys),
    [curSummaries, cur.keys]
  );
  const items = useMemo(() => topItems(curSummaries), [curSummaries]);
  const sources = useMemo(() => sourceSummary(curSummaries), [curSummaries]);
  const payments = useMemo(() => paymentSummary(curSummaries), [curSummaries]);

  const visibleItems = showAllItems ? items : items.slice(0, 5);

  return (
    <div className="reports">
      <header className="reports__head">
        <h1 className="reports__title">Insights</h1>
        <p className="reports__subtitle">Analyze your restaurant's performance.</p>
      </header>

      <div className="segmented" role="tablist" aria-label="View">
        <button
          role="tab"
          aria-selected={tab === "analytics"}
          className={`segmented__btn ${tab === "analytics" ? "is-active" : ""}`}
          onClick={() => setTab("analytics")}
        >
          Analytics
        </button>
        <button
          role="tab"
          aria-selected={tab === "reports"}
          className={`segmented__btn ${tab === "reports" ? "is-active" : ""}`}
          onClick={() => setTab("reports")}
        >
          Reports
        </button>
      </div>

      <div className="reports__range">
        <span className="reports__range-icon" aria-hidden>📅</span>
        <select
          className="reports__range-select"
          aria-label="Date range"
          value={rangeKind}
          onChange={(e) => setRangeKind(e.target.value as RangeKind)}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.kind} value={o.kind}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="reports__notice reports__notice--error">
          Couldn't load reports: {error.message}
        </div>
      )}
      {loading && !error && (
        <div className="reports__notice">Loading…</div>
      )}

      {tab === "analytics" ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              label="Total Revenue"
              value={formatMoney(totals.totalRevenue)}
              delta={computeDelta(totals.totalRevenue, prevTotals.totalRevenue)}
            />
            <KpiCard
              label="Orders"
              value={String(totals.orderCount)}
              delta={computeDelta(totals.orderCount, prevTotals.orderCount)}
            />
            <KpiCard
              label="Avg Order Value"
              value={formatMoney(totals.avgOrderValue)}
              delta={computeDelta(totals.avgOrderValue, prevTotals.avgOrderValue)}
            />
            <KpiCard
              label="Voided Items"
              value={String(totals.voidedItemCount)}
              delta={computeDelta(totals.voidedItemCount, prevTotals.voidedItemCount)}
              invert
            />
          </div>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Revenue Over Time</h2>
            </div>
            <RevenueChart points={series} />
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Top Selling Items</h2>
              {items.length > 5 && (
                <button
                  className="link-btn"
                  onClick={() => setShowAllItems((v) => !v)}
                >
                  {showAllItems ? "View Less" : "View All"}
                </button>
              )}
            </div>
            {visibleItems.length === 0 ? (
              <p className="card__empty">No items sold in this period.</p>
            ) : (
              <ul className="rank-list">
                {visibleItems.map((it) => (
                  <li key={it.menuItemId} className="rank-row">
                    <span className="rank-row__icon" aria-hidden>🍴</span>
                    <span className="rank-row__name">{it.name}</span>
                    <span className="rank-row__qty">{it.qty}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Revenue by Source</h2>
            </div>
            <ul className="rank-list">
              {SOURCE_META.map((s) => (
                <li key={s.key} className="rank-row">
                  <span className="rank-row__icon" aria-hidden>{s.icon}</span>
                  <span className="rank-row__name">{s.label}</span>
                  <span className="rank-row__money">
                    {formatMoney(sources[s.key])}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <div className="card__head">
              <h2 className="card__title">
                {rangeKind === "today"
                  ? "Today's Sales"
                  : rangeKind === "month"
                    ? "Monthly Report"
                    : "Daily Report"}
              </h2>
            </div>
            <dl className="stat-list">
              <div className="stat-row">
                <dt>Total Revenue</dt>
                <dd>{formatMoney(totals.totalRevenue)}</dd>
              </div>
              <div className="stat-row">
                <dt>Orders</dt>
                <dd>{totals.orderCount}</dd>
              </div>
              <div className="stat-row">
                <dt>Avg Order Value</dt>
                <dd>{formatMoney(totals.avgOrderValue)}</dd>
              </div>
              <div className="stat-row">
                <dt>Voided Items</dt>
                <dd>{totals.voidedItemCount}</dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Item-wise Sales</h2>
            </div>
            {items.length === 0 ? (
              <p className="card__empty">No items sold in this period.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.menuItemId}>
                      <td>{it.name}</td>
                      <td className="num">{it.qty}</td>
                      <td className="num">{formatMoney(it.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Best-Selling Items</h2>
            </div>
            {items.length === 0 ? (
              <p className="card__empty">No items sold in this period.</p>
            ) : (
              <ol className="rank-list rank-list--ordered">
                {items.slice(0, 5).map((it) => (
                  <li key={it.menuItemId} className="rank-row">
                    <span className="rank-row__name">{it.name}</span>
                    <span className="rank-row__qty">{it.qty}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Payment Summary</h2>
            </div>
            <dl className="stat-list">
              <div className="stat-row">
                <dt>Cash</dt>
                <dd>{formatMoney(payments.cash)}</dd>
              </div>
              <div className="stat-row">
                <dt>UPI</dt>
                <dd>{formatMoney(payments.upi)}</dd>
              </div>
              <div className="stat-row">
                <dt>Card</dt>
                <dd>{formatMoney(payments.card)}</dd>
              </div>
              <div className="stat-row stat-row--total">
                <dt>Total</dt>
                <dd>
                  {formatMoney(payments.cash + payments.upi + payments.card)}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
