/**
 * One line in the Current Order sheet: name, unit price ×qty, a qty stepper,
 * an "Edit Item" toggle, a per-line special-instructions field (OrderItem.notes),
 * and a live kitchen-status badge once the line has been sent on a KOT.
 */
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { KotItemStatus, OrderItem } from "@/types/models";

const STATUS_LABEL: Record<KotItemStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

interface Props {
  line: OrderItem;
  onQty: (qty: number) => void;
  onNotes: (notes: string) => void;
  onRemove: () => void;
}

export function OrderLineRow({ line, onQty, onNotes, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.notes ?? "");
  // Keep the local draft in sync when the underlying note changes remotely.
  const lastCommitted = useRef(line.notes ?? "");
  useEffect(() => {
    if ((line.notes ?? "") !== lastCommitted.current) {
      lastCommitted.current = line.notes ?? "";
      setDraft(line.notes ?? "");
    }
  }, [line.notes]);

  // Only un-sent lines can be edited (qty/removal); sent lines are locked.
  const locked = line.kotStatus !== "pending";

  function commitNotes() {
    const next = draft.trim();
    if (next !== (line.notes ?? "")) {
      lastCommitted.current = next;
      onNotes(next);
    }
  }

  return (
    <div className="ord-line">
      <div className="ord-line__top">
        <div className="ord-line__info">
          <div className="ord-line__name">{line.name}</div>
          <div className="ord-line__meta">
            {formatMoney(line.price)} <span aria-hidden>×</span> {line.qty}
            {" = "}
            <strong>{formatMoney(line.price * line.qty)}</strong>
          </div>
        </div>

        {locked ? (
          <span className={`ord-status ord-status--${line.kotStatus}`}>
            {STATUS_LABEL[line.kotStatus]}
          </span>
        ) : (
          <div className="ord-stepper" role="group" aria-label={`Quantity of ${line.name}`}>
            <button
              type="button"
              className="ord-stepper__btn"
              aria-label={`Remove one ${line.name}`}
              onClick={() => onQty(line.qty - 1)}
            >
              −
            </button>
            <span className="ord-stepper__qty">{line.qty}</span>
            <button
              type="button"
              className="ord-stepper__btn"
              aria-label={`Add one ${line.name}`}
              onClick={() => onQty(line.qty + 1)}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="ord-line__actions">
        {!locked && (
          <button
            type="button"
            className="ord-link"
            onClick={() => setEditing((v) => !v)}
          >
            ✎ Edit Item
          </button>
        )}
        {!locked && (
          <button type="button" className="ord-link ord-link--danger" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      {(editing || (line.notes ?? "") !== "") && (
        <input
          className="ord-line__notes"
          value={draft}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitNotes}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Special instructions (e.g., extra ice, no garnish…)"
          aria-label={`Special instructions for ${line.name}`}
        />
      )}
    </div>
  );
}
