/**
 * Menu Management (admin only).
 *
 * Lists menu items grouped by category with live Firestore subscriptions,
 * and hosts the add/edit item modal + category manager. All writes go through
 * `menuApi`; nothing here talks to Firestore directly.
 */
import { useMemo, useState } from "react";
import type { MenuItem } from "@/types/models";
import { useMenuCategories, useMenuItems } from "./useMenuData";
import { MenuItemCard } from "./MenuItemCard";
import { MenuItemForm } from "./MenuItemForm";
import { CategoryManager } from "./CategoryManager";
import "./menu.css";

type ItemDoc = MenuItem & { id: string };

const UNCATEGORIZED = "__uncat__";

export function MenuManagementScreen() {
  const cats = useMenuCategories();
  const items = useMenuItems();

  const [search, setSearch] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  // formItem: undefined = closed, null = new item, ItemDoc = editing.
  const [formItem, setFormItem] = useState<ItemDoc | null | undefined>(
    undefined
  );

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items.data) {
      counts[it.categoryId] = (counts[it.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [items.data]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return items.data;
    return items.data.filter(
      (it) =>
        it.name.toLowerCase().includes(term) ||
        (it.sku ?? "").toLowerCase().includes(term)
    );
  }, [items.data, term]);

  // Build grouped sections in category sortOrder, plus a trailing bucket for
  // items whose category no longer exists.
  const sections = useMemo(() => {
    const byCat = new Map<string, ItemDoc[]>();
    const knownIds = new Set(cats.data.map((c) => c.id));
    for (const it of filtered) {
      const key = knownIds.has(it.categoryId) ? it.categoryId : UNCATEGORIZED;
      const arr = byCat.get(key) ?? [];
      arr.push(it);
      byCat.set(key, arr);
    }
    const out = cats.data.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: c.enabled,
      items: byCat.get(c.id) ?? [],
    }));
    if (byCat.has(UNCATEGORIZED)) {
      out.push({
        id: UNCATEGORIZED,
        name: "Uncategorized",
        enabled: true,
        items: byCat.get(UNCATEGORIZED)!,
      });
    }
    return out;
  }, [cats.data, filtered]);

  const loading = cats.loading || items.loading;
  const error = cats.error ?? items.error;

  return (
    <div className="menu-screen">
      <header className="menu-header">
        <div>
          <h1 className="menu-header__title">Menu Management</h1>
          <p className="menu-header__subtitle">
            Manage and organize your offerings.
          </p>
        </div>
      </header>

      <div className="menu-toolbar">
        <div className="menu-search">
          <span className="menu-search__icon" aria-hidden>
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or SKUs…"
            aria-label="Search menu items"
          />
        </div>
        <button
          type="button"
          className="menu-btn-outline"
          onClick={() => setShowCategories(true)}
        >
          Categories
        </button>
      </div>

      <button
        type="button"
        className="menu-btn-primary menu-btn-primary--block"
        onClick={() => setFormItem(null)}
        disabled={cats.data.length === 0}
      >
        ＋ Add Menu Item
      </button>
      {cats.data.length === 0 && !loading && (
        <p className="menu-hint">Add a category first to create items.</p>
      )}

      {loading && <p className="menu-empty">Loading menu…</p>}
      {error && <p className="menu-error">Could not load menu: {error.message}</p>}

      {!loading &&
        !error &&
        sections.map((section) => (
          <section key={section.id} className="menu-section">
            <div className="menu-section__head">
              <h2 className="menu-section__title">
                {section.name}
                {!section.enabled && (
                  <span className="menu-badge">Hidden</span>
                )}
              </h2>
              <span className="menu-section__count">
                {section.items.length}
              </span>
            </div>
            {section.items.length === 0 ? (
              <p className="menu-empty">No items in this category.</p>
            ) : (
              <div className="menu-list">
                {section.items.map((it) => (
                  <MenuItemCard key={it.id} item={it} onEdit={setFormItem} />
                ))}
              </div>
            )}
          </section>
        ))}

      {!loading && !error && sections.length === 0 && (
        <p className="menu-empty">No menu items yet.</p>
      )}

      {formItem !== undefined && (
        <MenuItemForm
          item={formItem}
          categories={cats.data}
          onClose={() => setFormItem(undefined)}
        />
      )}

      {showCategories && (
        <CategoryManager
          categories={cats.data}
          itemCounts={itemCounts}
          onClose={() => setShowCategories(false)}
        />
      )}
    </div>
  );
}
