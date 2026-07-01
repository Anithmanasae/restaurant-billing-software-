/**
 * Category management modal: add / rename / delete / reorder (sortOrder) /
 * enable-disable. Reorder swaps sortOrder with the adjacent category so the
 * order-screen chips stay stable.
 */
import { useState, type FormEvent } from "react";
import { doc } from "firebase/firestore";
import { paths } from "@/lib/firestore/paths";
import type { MenuCategory } from "@/types/models";
import {
  createMenuCategory,
  deleteMenuCategory,
  setMenuCategoryEnabled,
  setMenuCategorySortOrder,
  updateMenuCategory,
} from "./menuApi";

type CategoryDoc = MenuCategory & { id: string };

interface Props {
  categories: CategoryDoc[];
  /** Count of items per categoryId, so we can warn before deleting. */
  itemCounts: Record<string, number>;
  onClose: () => void;
}

export function CategoryManager({ categories, itemCounts, onClose }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Sorted view; reorder edits sortOrder on the docs and the subscription
  // re-sorts automatically.
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const nextOrder =
      categories.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
    const id = doc(paths.menuCategories()).id;
    try {
      await createMenuCategory(id, { name, sortOrder: nextOrder, enabled: true });
      setNewName("");
    } catch {
      setError("Could not add category.");
    }
  }

  async function onRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateMenuCategory(id, { name });
      setEditingId(null);
    } catch {
      setError("Could not rename category.");
    }
  }

  async function onDelete(cat: CategoryDoc) {
    const count = itemCounts[cat.id] ?? 0;
    const msg =
      count > 0
        ? `Delete "${cat.name}"? ${count} item(s) will remain but be uncategorized.`
        : `Delete "${cat.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteMenuCategory(cat.id);
    } catch {
      setError("Could not delete category.");
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    try {
      await Promise.all([
        setMenuCategorySortOrder(a.id, b.sortOrder),
        setMenuCategorySortOrder(b.id, a.sortOrder),
      ]);
    } catch {
      setError("Could not reorder.");
    }
  }

  return (
    <div className="menu-modal__backdrop" onClick={onClose}>
      <div
        className="menu-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-modal__head">
          <h2>Categories</h2>
          <button
            type="button"
            className="menu-iconbtn"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form className="menu-cat__add" onSubmit={onAdd}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
          />
          <button type="submit" className="menu-btn-primary menu-btn-primary--sm">
            Add
          </button>
        </form>

        {error && <p className="menu-error">{error}</p>}

        <ul className="menu-cat__list">
          {sorted.map((cat, i) => (
            <li key={cat.id} className="menu-cat__row">
              <div className="menu-cat__order">
                <button
                  type="button"
                  className="menu-iconbtn"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="menu-iconbtn"
                  aria-label="Move down"
                  disabled={i === sorted.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </div>

              {editingId === cat.id ? (
                <input
                  className="menu-cat__name-edit"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onRename(cat.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => onRename(cat.id)}
                />
              ) : (
                <button
                  type="button"
                  className="menu-cat__name"
                  onClick={() => {
                    setEditingId(cat.id);
                    setEditName(cat.name);
                  }}
                >
                  {cat.name}
                  <span className="menu-cat__count">
                    {itemCounts[cat.id] ?? 0}
                  </span>
                </button>
              )}

              <label className="menu-switch" title="Enabled">
                <input
                  type="checkbox"
                  checked={cat.enabled}
                  onChange={(e) => setMenuCategoryEnabled(cat.id, e.target.checked)}
                />
                <span className="menu-switch__track" aria-hidden />
              </label>

              <button
                type="button"
                className="menu-iconbtn menu-iconbtn--danger"
                aria-label={`Delete ${cat.name}`}
                onClick={() => onDelete(cat)}
              >
                🗑
              </button>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="menu-empty">No categories yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
