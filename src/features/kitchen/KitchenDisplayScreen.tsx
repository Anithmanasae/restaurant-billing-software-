/**
 * Kitchen Display (KDS) — live ticket board.
 *
 * Subscribes to all non-completed KOTs (`status in [new, preparing, ready]`)
 * ordered by `createdAt` ascending, so the oldest tickets sit at the top and
 * new orders appear instantly. Filter tabs (Live / Urgent / Ready) carry live
 * counts. See `design/kitchen-display.md`.
 */
import { useMemo, useState } from "react";
import { query, where, orderBy } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import { useCollectionData } from "@/lib/firestore/useRealtime";
import type { Kot, KotStatus } from "@/types/models";
import { TicketCard } from "./TicketCard";
import { elapsedMs, URGENT_MS, useNow } from "./useElapsed";
import "./kds.css";

type Tab = "live" | "urgent" | "ready";

/** Statuses that keep a ticket on the board (everything but `completed`). */
const ACTIVE_STATUSES: KotStatus[] = ["new", "preparing", "ready"];

export function KitchenDisplayScreen() {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("live");

  // Live query: non-completed tickets, oldest first. Wrapped in useMemo so the
  // subscription is stable across renders (per useRealtime's contract).
  const kotsQuery = useMemo(
    () =>
      query(
        paths.kots(),
        where("status", "in", ACTIVE_STATUSES),
        orderBy("createdAt", "asc")
      ),
    []
  );

  const { data: kots, loading, error } = useCollectionData<Kot>(kotsQuery);

  const isLive = (k: Kot) => k.status === "new" || k.status === "preparing";
  const isUrgent = (k: Kot) =>
    isLive(k) && elapsedMs(k.createdAt, now) > URGENT_MS;
  const isReady = (k: Kot) => k.status === "ready";

  const counts = {
    live: kots.filter(isLive).length,
    urgent: kots.filter(isUrgent).length,
    ready: kots.filter(isReady).length,
  };

  const visible = kots.filter(
    tab === "live" ? isLive : tab === "urgent" ? isUrgent : isReady
  );

  return (
    <div className="kds">
      <header className="kds__topbar">
        <span className="kds__brand">SADA POS</span>
        <span className="kds__bell" aria-hidden>
          🔔
        </span>
      </header>

      <div className="kds__title">
        <h1>Kitchen Display</h1>
        <p>Manage active orders across all stations.</p>
      </div>

      <nav className="kds__tabs" role="tablist" aria-label="Ticket filters">
        <TabButton
          active={tab === "live"}
          onClick={() => setTab("live")}
          label="Live"
          count={counts.live}
          showDot
        />
        <TabButton
          active={tab === "urgent"}
          onClick={() => setTab("urgent")}
          label="Urgent"
          count={counts.urgent}
        />
        <TabButton
          active={tab === "ready"}
          onClick={() => setTab("ready")}
          label="Ready"
          count={counts.ready}
        />
      </nav>

      <main className="kds__board">
        {error ? (
          <p className="kds__msg kds__msg--error">
            Couldn’t load tickets. {error.message}
          </p>
        ) : loading ? (
          <p className="kds__msg">Loading tickets…</p>
        ) : visible.length === 0 ? (
          <p className="kds__msg">No {tab} tickets right now.</p>
        ) : (
          visible.map((kot) => (
            <TicketCard key={kot.id} kot={kot} now={now} />
          ))
        )}
      </main>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  showDot?: boolean;
}

function TabButton({ active, onClick, label, count, showDot }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`kds-tab${active ? " kds-tab--active" : ""}`}
      onClick={onClick}
    >
      {showDot && active ? <span className="kds-tab__dot" aria-hidden /> : null}
      {label} ({count})
    </button>
  );
}
