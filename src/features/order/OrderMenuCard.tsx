/**
 * A single menu item in the browse grid. Shows image/placeholder, name and
 * price. When the item is already in the order it gets a green border and an
 * inline `−  qty  +` stepper; otherwise a circular `+` add button.
 */
import { formatMoney } from "@/lib/money";
import type { MenuItem } from "@/types/models";

interface Props {
  item: MenuItem & { id: string };
  /** Total un-sent qty of this item currently in the order (0 = not added). */
  qty: number;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}

export function OrderMenuCard({ item, qty, onAdd, onInc, onDec }: Props) {
  const inOrder = qty > 0;
  return (
    <div className={`ord-card${inOrder ? " ord-card--in" : ""}`}>
      <div className="ord-card__thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="ord-card__img" />
        ) : (
          <span className="ord-card__ph" aria-hidden>
            🖼️
          </span>
        )}
      </div>

      <div className="ord-card__body">
        <div className="ord-card__name" title={item.name}>
          {item.name}
        </div>
        <div className="ord-card__foot">
          <span className="ord-card__price">{formatMoney(item.price)}</span>
          {inOrder ? (
            <div className="ord-stepper" role="group" aria-label={`Quantity of ${item.name}`}>
              <button
                type="button"
                className="ord-stepper__btn"
                aria-label={`Remove one ${item.name}`}
                onClick={onDec}
              >
                −
              </button>
              <span className="ord-stepper__qty" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                className="ord-stepper__btn"
                aria-label={`Add one ${item.name}`}
                onClick={onInc}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ord-add"
              aria-label={`Add ${item.name}`}
              onClick={onAdd}
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
