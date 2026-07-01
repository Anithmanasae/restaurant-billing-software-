/**
 * New Order (Waiter) — `/order/:tableId?` · roles admin, waiter.
 *
 * Browse the menu (search + category chips + 2-col grid), build the open order
 * for a table (or a takeaway order when there's no tableId), then Send KOT to
 * batch the pending lines into a kitchen ticket. Kitchen progress flows back
 * onto the lines live via the order's KOTs. See design/menu-order.md.
 *
 * All Firestore reads are live subscriptions; all writes go through orderApi.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/features/auth/AuthContext";
import type { KotItemStatus, MenuItem, OrderType } from "@/types/models";
import {
  useKotsForOrder,
  useMenuCategories,
  useMenuItems,
  useOpenOrderForTable,
  useOrder,
  useTable,
} from "./useOrderData";
import {
  addOrCreateOrder,
  removeLine,
  sendKot,
  setLineNotes,
  syncLineStatuses,
  updateLineQty,
} from "./orderApi";
import { OrderMenuCard } from "./OrderMenuCard";
import { OrderLineRow } from "./OrderLineRow";
import "./order.css";

const ALL = "__all__";

/** Map a KOT's board status onto the per-line status stamped on order items. */
function lineStatusForKot(kotStatus: string): KotItemStatus {
  switch (kotStatus) {
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "completed":
      return "served";
    default:
      return "sent";
  }
}

export function OrderScreen() {
  const { tableId: rawTableId } = useParams<{ tableId?: string }>();
  const tableId = rawTableId ?? null;
  const { profile } = useAuth();
  const waiterId = profile?.uid ?? "";

  const cats = useMenuCategories();
  const items = useMenuItems();
  const table = useTable(tableId);

  // For takeaway we mint an order id on first add and remember it locally.
  const [takeawayOrderId, setTakeawayOrderId] = useState<string | null>(null);

  // Resolve the active order: dine-in subscribes by table; takeaway by id.
  const dineInOrder = useOpenOrderForTable(tableId);
  const takeawayOrder = useOrder(tableId ? null : takeawayOrderId);
  const order = tableId ? dineInOrder.order : takeawayOrder.data;
  const orderId = order?.id ?? null;

  const orderType: OrderType = tableId ? "dine-in" : "takeaway";
  const tableLabel = table.data?.label ?? (table.data ? `T${table.data.number}` : "Takeaway");

  const kots = useKotsForOrder(orderId);

  // UI state.
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ── Mirror kitchen (KDS) status back onto order lines. ────────────────────
  useEffect(() => {
    if (!orderId || kots.data.length === 0) return;
    const map = new Map<string, KotItemStatus>();
    for (const k of kots.data) map.set(k.id, lineStatusForKot(k.status));
    // Fire-and-forget; the order subscription re-renders when it lands.
    syncLineStatuses(orderId, map).catch(() => {
      /* transient; will retry on next KOT change */
    });
  }, [orderId, kots.data]);

  // ── Derived: qty of each menuItem currently un-sent in the order. ─────────
  const pendingQtyByItem = useMemo(() => {
    const m = new Map<string, number>();
    if (!order) return m;
    for (const l of order.items) {
      if (l.kotStatus === "pending" && !l.voided) {
        m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.qty);
      }
    }
    return m;
  }, [order]);

  /** First un-sent, note-less line for a menu item (the stepper target). */
  function primaryLineId(menuItemId: string): string | null {
    if (!order) return null;
    const line = order.items.find(
      (l) => l.menuItemId === menuItemId && l.kotStatus === "pending" && !l.voided && !l.notes
    );
    return line?.lineId ?? null;
  }

  // ── Menu filtering (search + category). ──────────────────────────────────
  const enabledCats = useMemo(
    () => cats.data.filter((c) => c.enabled),
    [cats.data]
  );

  const term = search.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    return items.data.filter((it) => {
      if (!it.enabled) return false;
      if (activeCat !== ALL && it.categoryId !== activeCat) return false;
      if (!term) return true;
      return (
        it.name.toLowerCase().includes(term) ||
        (it.sku ?? "").toLowerCase().includes(term)
      );
    });
  }, [items.data, activeCat, term]);

  // ── Handlers. ─────────────────────────────────────────────────────────────
  async function handleAdd(item: MenuItem & { id: string }) {
    setErrMsg(null);
    setSheetOpen(true);
    try {
      const id = await addOrCreateOrder({
        orderId,
        tableId,
        tableLabel,
        orderType,
        waiterId,
        menuItemId: item.id,
        name: item.name,
        price: item.price,
      });
      if (!tableId) setTakeawayOrderId(id);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Could not add item.");
    }
  }

  async function handleStep(menuItemId: string, delta: number) {
    if (!orderId) return;
    const lineId = primaryLineId(menuItemId);
    if (!lineId) return;
    const cur = pendingQtyByItem.get(menuItemId) ?? 0;
    try {
      await updateLineQty(orderId, lineId, cur + delta);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Could not update quantity.");
    }
  }

  async function handleSendKot() {
    if (!orderId) return;
    setSending(true);
    setErrMsg(null);
    try {
      const kotId = await sendKot(orderId, tableLabel);
      if (!kotId) setErrMsg("No new items to send.");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Could not send KOT.");
    } finally {
      setSending(false);
    }
  }

  // ── Order summary numbers. ────────────────────────────────────────────────
  const lines = order?.items.filter((l) => !l.voided) ?? [];
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = order?.subtotal ?? 0;
  const hasPending = lines.some((l) => l.kotStatus === "pending");
  const hasLines = lines.length > 0;

  const loading = cats.loading || items.loading;
  const error = cats.error ?? items.error;

  return (
    <div className="ord-screen">
      <header className="ord-topbar">
        <span className="ord-brand">SADA POS</span>
        <span className="ord-bell" aria-hidden>
          🔔
        </span>
      </header>

      <div className="ord-title">
        <h1>New Order</h1>
        <p>
          {tableId
            ? `Table ${tableLabel} · Manage and organize your offerings.`
            : "Takeaway · Manage and organize your offerings."}
        </p>
      </div>

      <div className="ord-search">
        <span className="ord-search__icon" aria-hidden>
          🔍
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items, SKUs, or ingredients…"
          aria-label="Search menu items"
        />
      </div>

      <nav className="ord-chips" aria-label="Categories">
        <button
          type="button"
          className={`ord-chip${activeCat === ALL ? " ord-chip--active" : ""}`}
          onClick={() => setActiveCat(ALL)}
        >
          All Items
        </button>
        {enabledCats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`ord-chip${activeCat === c.id ? " ord-chip--active" : ""}`}
            onClick={() => setActiveCat(c.id)}
          >
            {c.name}
          </button>
        ))}
      </nav>

      {errMsg && <p className="ord-error" role="alert">{errMsg}</p>}

      <main className="ord-grid-wrap">
        {error ? (
          <p className="ord-msg ord-msg--error">Couldn’t load menu. {error.message}</p>
        ) : loading ? (
          <p className="ord-msg">Loading menu…</p>
        ) : visibleItems.length === 0 ? (
          <p className="ord-msg">No items match.</p>
        ) : (
          <div className="ord-grid">
            {visibleItems.map((it) => (
              <OrderMenuCard
                key={it.id}
                item={it}
                qty={pendingQtyByItem.get(it.id) ?? 0}
                onAdd={() => handleAdd(it)}
                onInc={() => handleStep(it.id, +1)}
                onDec={() => handleStep(it.id, -1)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Collapsed cart bar — shown when there are lines but the sheet is closed. */}
      {hasLines && !sheetOpen && (
        <button
          type="button"
          className="ord-cartbar"
          onClick={() => setSheetOpen(true)}
        >
          <span>🛍 View Order · {itemCount} Item{itemCount === 1 ? "" : "s"}</span>
          <span>{formatMoney(subtotal)}</span>
        </button>
      )}

      {/* Current Order sheet. */}
      {hasLines && sheetOpen && (
        <section className="ord-sheet" aria-label="Current order">
          <header className="ord-sheet__head">
            <span className="ord-sheet__title">🛒 Current Order</span>
            <button
              type="button"
              className="ord-sheet__add"
              onClick={() => setSheetOpen(false)}
            >
              ＋ Add Items
            </button>
          </header>

          <div className="ord-sheet__lines">
            {lines.map((line) => (
              <OrderLineRow
                key={line.lineId}
                line={line}
                onQty={(qty) => orderId && updateLineQty(orderId, line.lineId, qty)}
                onNotes={(notes) => orderId && setLineNotes(orderId, line.lineId, notes)}
                onRemove={() => orderId && removeLine(orderId, line.lineId)}
              />
            ))}
          </div>

          <footer className="ord-sheet__foot">
            <button
              type="button"
              className="ord-sendkot"
              disabled={!hasPending || sending}
              onClick={handleSendKot}
            >
              ➤ {sending ? "Sending…" : "Send KOT"}
            </button>
            <div className="ord-total">
              <span className="ord-total__label">Total</span>
              <span className="ord-total__value">{formatMoney(subtotal)}</span>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
