/**
 * A single menu item row: image/placeholder, name, inline-editable price,
 * enable/disable switch, edit + delete actions. Price edits go straight to
 * Firestore via the API (stored as paise).
 */
import { useState } from "react";
import { formatMoney, rupeesToPaise } from "@/lib/money";
import type { MenuItem } from "@/types/models";
import {
  deleteMenuItem,
  setMenuItemEnabled,
  setMenuItemPrice,
} from "./menuApi";

interface Props {
  item: MenuItem & { id: string };
  onEdit: (item: MenuItem & { id: string }) => void;
}

export function MenuItemCard({ item, onEdit }: Props) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [draftRupees, setDraftRupees] = useState("");

  function startPriceEdit() {
    setDraftRupees((item.price / 100).toString());
    setEditingPrice(true);
  }

  async function commitPrice() {
    const rupees = Number(draftRupees);
    if (Number.isFinite(rupees) && rupees >= 0) {
      const paise = rupeesToPaise(rupees);
      if (paise !== item.price) await setMenuItemPrice(item.id, paise);
    }
    setEditingPrice(false);
  }

  async function onDelete() {
    if (window.confirm(`Delete "${item.name}"?`)) {
      await deleteMenuItem(item.id);
    }
  }

  return (
    <div className={`menu-item ${item.enabled ? "" : "menu-item--off"}`}>
      <div className="menu-item__thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="menu-item__img" />
        ) : (
          <span className="menu-placeholder__icon" aria-hidden>
            🖼️
          </span>
        )}
      </div>

      <div className="menu-item__body">
        <div className="menu-item__name">{item.name}</div>
        {item.sku && <div className="menu-item__sku">SKU: {item.sku}</div>}
        {editingPrice ? (
          <input
            className="menu-item__price-edit"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            autoFocus
            value={draftRupees}
            onChange={(e) => setDraftRupees(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPrice();
              if (e.key === "Escape") setEditingPrice(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="menu-item__price"
            onClick={startPriceEdit}
            title="Tap to edit price"
          >
            {formatMoney(item.price)}
          </button>
        )}
      </div>

      <div className="menu-item__actions">
        <label className="menu-switch" title="Enabled">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => setMenuItemEnabled(item.id, e.target.checked)}
          />
          <span className="menu-switch__track" aria-hidden />
        </label>
        <button
          type="button"
          className="menu-iconbtn"
          aria-label={`Edit ${item.name}`}
          onClick={() => onEdit(item)}
        >
          ✎
        </button>
        <button
          type="button"
          className="menu-iconbtn menu-iconbtn--danger"
          aria-label={`Delete ${item.name}`}
          onClick={onDelete}
        >
          🗑
        </button>
      </div>
    </div>
  );
}
