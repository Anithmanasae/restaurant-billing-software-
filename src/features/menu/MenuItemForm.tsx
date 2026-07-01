/**
 * Add / edit modal for a single menu item. Price is entered in rupees and
 * stored as paise via `rupeesToPaise`. On create we first write the item to
 * get an id, then (if a file was picked) upload the image under that id.
 */
import { useRef, useState, type FormEvent } from "react";
import { rupeesToPaise } from "@/lib/money";
import type { MenuCategory, MenuItem } from "@/types/models";
import {
  createMenuItem,
  updateMenuItem,
  uploadMenuItemImage,
  type MenuItemInput,
} from "./menuApi";

interface Props {
  /** The item to edit, or null to create a new one. */
  item: (MenuItem & { id: string }) | null;
  categories: (MenuCategory & { id: string })[];
  /** Pre-selected category when adding from within a category section. */
  defaultCategoryId?: string;
  onClose: () => void;
}

/** paise -> rupees string for the price input (empty when 0/new). */
function paiseToInput(paise: number | undefined): string {
  if (paise === undefined || paise === 0) return "";
  return (paise / 100).toString();
}

export function MenuItemForm({
  item,
  categories,
  defaultCategoryId,
  onClose,
}: Props) {
  const isEdit = item !== null;
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? ""
  );
  const [priceRupees, setPriceRupees] = useState(paiseToInput(item?.price));
  const [description, setDescription] = useState(item?.description ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [enabled, setEnabled] = useState(item?.enabled ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function onPickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : item?.imageUrl ?? null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) return setError("Name is required.");
    if (!categoryId) return setError("Please pick a category.");
    const rupees = Number(priceRupees);
    if (!Number.isFinite(rupees) || rupees < 0) {
      return setError("Enter a valid price.");
    }

    const payload: MenuItemInput = {
      name: trimmedName,
      categoryId,
      price: rupeesToPaise(rupees),
      enabled,
      description: description.trim() || undefined,
      sku: sku.trim() || undefined,
      imageUrl: item?.imageUrl,
    };

    setBusy(true);
    try {
      if (isEdit) {
        await updateMenuItem(item.id, payload);
        if (file) await uploadMenuItemImage(item.id, file);
      } else {
        const newId = await createMenuItem(payload);
        if (file) await uploadMenuItemImage(newId, file);
      }
      onClose();
    } catch {
      setError("Could not save. Please try again.");
      setBusy(false);
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
          <h2>{isEdit ? "Edit Item" : "Add Item"}</h2>
          <button
            type="button"
            className="menu-iconbtn"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form className="menu-form" onSubmit={onSubmit}>
          <button
            type="button"
            className="menu-form__image"
            onClick={() => fileInput.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="" className="menu-form__image-img" />
            ) : (
              <span className="menu-placeholder__icon" aria-hidden>
                🖼️
              </span>
            )}
            <span className="menu-form__image-hint">
              {preview ? "Change image" : "Add image"}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />

          <label className="menu-field">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paneer Butter Masala"
              required
            />
          </label>

          <label className="menu-field">
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.length === 0 && <option value="">No categories</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="menu-field">
            Price (₹)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              placeholder="0.00"
              required
            />
          </label>

          <label className="menu-field">
            SKU
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Optional stock code"
            />
          </label>

          <label className="menu-field">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </label>

          <label className="menu-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enabled (visible on the order screen)</span>
          </label>

          {error && <p className="menu-error">{error}</p>}

          <button type="submit" className="menu-btn-primary" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save Changes" : "Add Item"}
          </button>
        </form>
      </div>
    </div>
  );
}
