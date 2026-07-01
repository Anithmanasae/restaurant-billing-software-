/**
 * A single kitchen ticket (KOT) card. Purely presentational aside from firing
 * the action callbacks; all Firestore writes live in `kdsApi.ts`.
 */
import { useState } from "react";
import type { Kot, OrderType } from "@/types/models";
import { startKot, markReady, completeKot, reprintKot } from "./kdsApi";
import { elapsedMs, formatElapsed, URGENT_MS } from "./useElapsed";

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  "dine-in": "Dine In",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

interface TicketCardProps {
  kot: Kot & { id: string };
  now: number;
}

export function TicketCard({ kot, now }: TicketCardProps) {
  const [busy, setBusy] = useState(false);
  const ms = elapsedMs(kot.createdAt, now);
  const urgent = kot.status !== "ready" && ms > URGENT_MS;

  const itemCount = kot.items.reduce(
    (sum, it) => sum + (it.voided ? 0 : it.qty),
    0
  );
  const subLabel = [kot.tableLabel, ORDER_TYPE_LABEL[kot.orderType]]
    .filter(Boolean)
    .join(" · ");

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`kds-ticket kds-ticket--${kot.status}${
        urgent ? " kds-ticket--urgent" : ""
      }`}
    >
      <header className="kds-ticket__head">
        <span className={`kds-dot kds-dot--${kot.status}`} aria-hidden />
        <span className="kds-ticket__num">#{kot.ticketNumber}</span>
        <span
          className={`kds-timer${urgent ? " kds-timer--urgent" : ""}`}
          title="Elapsed since sent to kitchen"
        >
          {formatElapsed(ms)} ELAPSED
        </span>
        <button
          type="button"
          className="kds-iconbtn"
          onClick={() => run(() => reprintKot(kot))}
          disabled={busy}
          aria-label="Reprint ticket"
          title={`Reprint (printed ${kot.printedCount}×)`}
        >
          🖨
        </button>
      </header>

      <div className="kds-ticket__sub">
        <span className="kds-ticket__table">{subLabel}</span>
        <span className="kds-ticket__count">{itemCount} Items</span>
      </div>

      <ul className="kds-ticket__items">
        {kot.items.map((it) => (
          <li
            key={it.lineId}
            className={`kds-line${it.voided ? " kds-line--void" : ""}`}
          >
            <div className="kds-line__main">
              <span className="kds-line__qty">{it.qty}×</span>
              <span className="kds-line__name">{it.name}</span>
            </div>
            {it.notes ? <div className="kds-line__note">– {it.notes}</div> : null}
          </li>
        ))}
      </ul>

      <footer className="kds-ticket__actions">
        {kot.status === "new" && (
          <button
            type="button"
            className="kds-btn kds-btn--start"
            onClick={() => run(() => startKot(kot.id))}
            disabled={busy}
          >
            Start
          </button>
        )}
        {kot.status === "preparing" && (
          <button
            type="button"
            className="kds-btn kds-btn--ready"
            onClick={() => run(() => markReady(kot.id))}
            disabled={busy}
          >
            Ready
          </button>
        )}
        {kot.status === "ready" && (
          <button
            type="button"
            className="kds-btn kds-btn--complete"
            onClick={() => run(() => completeKot(kot.id))}
            disabled={busy}
          >
            Complete
          </button>
        )}
      </footer>
    </article>
  );
}
