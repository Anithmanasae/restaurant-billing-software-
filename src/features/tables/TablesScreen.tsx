/**
 * Tables (Floor View) — /tables · roles: admin, waiter, cashier.
 *
 * Fully real-time: subscribes to the `tables` collection and all open orders,
 * colour-coding each table by status. Supports open / merge / split / shift.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { query, where } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import { useCollectionData } from "@/lib/firestore/useRealtime";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/features/auth/AuthContext";
import type { Order, Table, TableStatus, Ts } from "@/types/models";
import {
  mergeTables,
  openTable,
  shiftTable,
  splitTable,
} from "./tablesApi";
import "./tables.css";

type Filter = "all" | TableStatus;
type Mode = "none" | "merge" | "split" | "shift";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "occupied", label: "Occupied" },
  { key: "billed", label: "Billed" },
];

type WithId<T> = T & { id: string };

export function TablesScreen() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const uid = profile?.uid ?? "";

  const tablesQuery = useMemo(() => paths.tables(), []);
  // Open orders only — one subscription feeds every occupied card's total.
  const ordersQuery = useMemo(
    () => query(paths.orders(), where("status", "in", ["open", "billed"])),
    []
  );

  const tablesState = useCollectionData<Table>(tablesQuery);
  const ordersState = useCollectionData<Order>(ordersQuery);

  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<Mode>("none");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // For shift/split: the table whose order is being moved.
  const [sourceTableId, setSourceTableId] = useState<string | null>(null);

  // orderId -> order, and tableId -> order for quick lookups.
  const orderByTable = useMemo(() => {
    const map = new Map<string, WithId<Order>>();
    for (const o of ordersState.data) {
      if (o.tableId) map.set(o.tableId, o);
    }
    return map;
  }, [ordersState.data]);

  const tables = useMemo(
    () =>
      [...tablesState.data].sort((a, b) => a.number - b.number),
    [tablesState.data]
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: tables.length,
      available: 0,
      occupied: 0,
      billed: 0,
    };
    for (const t of tables) c[t.status] += 1;
    return c;
  }, [tables]);

  const visible = useMemo(
    () => (filter === "all" ? tables : tables.filter((t) => t.status === filter)),
    [tables, filter]
  );

  function resetMode() {
    setMode("none");
    setSelectedIds([]);
    setSourceTableId(null);
    setActionError(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleCardTap(table: WithId<Table>) {
    setActionError(null);

    // Selection modes intercept the tap.
    if (mode === "merge") {
      toggleSelect(table.id);
      return;
    }
    if (mode === "shift" || mode === "split") {
      if (!sourceTableId) {
        // First pick: the occupied source table.
        if (!orderByTable.has(table.id)) {
          setActionError("Pick an occupied table to move from.");
          return;
        }
        setSourceTableId(table.id);
      } else {
        // Second pick: the free destination.
        if (table.id === sourceTableId) return;
        if (table.status !== "available" || orderByTable.has(table.id)) {
          setActionError("Pick a free table as the destination.");
          return;
        }
        await runMove(sourceTableId, table.id);
      }
      return;
    }

    // Default mode: available -> open & navigate; occupied/billed -> open order.
    if (table.status === "available" && !table.mergedInto) {
      setBusy(true);
      try {
        await openTable(table.id, uid);
        navigate(`/order/${table.id}`);
      } catch (e) {
        setActionError(errText(e));
      } finally {
        setBusy(false);
      }
    } else {
      navigate(`/order/${table.id}`);
    }
  }

  async function runMove(fromTableId: string, toTableId: string) {
    const order = orderByTable.get(fromTableId);
    if (!order) {
      setActionError("Source table has no active order.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "shift") {
        await shiftTable(order.id, fromTableId, toTableId);
      } else if (mode === "split") {
        // Minimal split: move all currently-pending (unsent) lines. If none,
        // fall back to moving every line so the action is never a no-op.
        const pending = order.items
          .filter((l) => !l.voided && l.kotStatus === "pending")
          .map((l) => l.lineId);
        const toMove =
          pending.length > 0
            ? pending
            : order.items.filter((l) => !l.voided).map((l) => l.lineId);
        if (toMove.length === 0) {
          throw new Error("Nothing to split — order has no items.");
        }
        await splitTable(order.id, toTableId, toMove, uid);
      }
      resetMode();
    } catch (e) {
      setActionError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge() {
    if (selectedIds.length < 2) {
      setActionError("Select at least two tables to merge.");
      return;
    }
    setBusy(true);
    try {
      const [primary, ...rest] = selectedIds;
      await mergeTables(primary, rest);
      resetMode();
    } catch (e) {
      setActionError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (tablesState.loading) {
    return <div className="tables__state">Loading floor…</div>;
  }
  if (tablesState.error) {
    return (
      <div className="tables__state tables__error">
        Could not load tables: {tablesState.error.message}
      </div>
    );
  }

  const moveTarget =
    mode === "shift" ? "shift" : mode === "split" ? "split" : null;

  return (
    <div className="tables">
      <header className="tables__header">
        <h1>Tables</h1>
        <p>Manage your floor</p>
      </header>

      <div className="tables__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={
              "tables__filter" + (filter === f.key ? " is-active" : "")
            }
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="tables__filter-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="tables__toolbar">
        {mode === "none" ? (
          <>
            <button
              className="tables__action-btn"
              onClick={() => setMode("merge")}
            >
              Merge
            </button>
            <button
              className="tables__action-btn"
              onClick={() => setMode("split")}
            >
              Split
            </button>
            <button
              className="tables__action-btn"
              onClick={() => setMode("shift")}
            >
              Shift
            </button>
          </>
        ) : (
          <>
            <span className="tables__toolbar-hint">
              {mode === "merge"
                ? "Tap 2+ tables (first is primary), then Merge."
                : !sourceTableId
                  ? `Tap the occupied table to ${moveTarget}.`
                  : "Tap a free table as the destination."}
            </span>
            {mode === "merge" && (
              <button
                className="tables__action-btn is-primary"
                disabled={busy || selectedIds.length < 2}
                onClick={confirmMerge}
              >
                Merge ({selectedIds.length})
              </button>
            )}
            <button
              className="tables__action-btn"
              disabled={busy}
              onClick={resetMode}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {actionError && <p className="tables__modal-error">{actionError}</p>}

      {visible.length === 0 ? (
        <div className="tables__state">No tables in this view.</div>
      ) : (
        <div className="tables__grid">
          {visible.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              order={orderByTable.get(t.id) ?? null}
              selected={
                selectedIds.includes(t.id) || sourceTableId === t.id
              }
              disabled={busy}
              onTap={() => handleCardTap(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({
  table,
  order,
  selected,
  disabled,
  onTap,
}: {
  table: WithId<Table>;
  order: WithId<Order> | null;
  selected: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  const statusClass =
    table.status === "available"
      ? "is-available"
      : table.status === "occupied"
        ? "is-occupied"
        : "is-billed";

  const label = table.label ?? `T${table.number}`;

  return (
    <button
      className={
        "table-card " +
        statusClass +
        (selected ? " is-selected" : "") +
        (table.mergedInto ? " is-merged" : "")
      }
      disabled={disabled}
      onClick={onTap}
    >
      {selected && <span className="table-card__check">✓</span>}
      <div className="table-card__top">
        <span className="table-card__label">{label}</span>
        <span className="table-card__seats">🪑 {table.capacity}</span>
      </div>
      <span className="table-card__status">
        {table.status === "billed" ? "Bill requested" : table.status}
      </span>

      {table.mergedInto ? (
        <span className="table-card__badge">↳ merged</span>
      ) : order && table.status !== "available" ? (
        <>
          <span className="table-card__total">
            {formatMoney(order.subtotal)}
          </span>
          <span className="table-card__elapsed">
            {elapsed(order.createdAt)}
          </span>
        </>
      ) : null}
    </button>
  );
}

/** "12m" / "1h 05m" since the order was created. */
function elapsed(createdAt: Ts): string {
  const ms = createdAt?.toMillis?.();
  if (!ms) return "just now";
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}
