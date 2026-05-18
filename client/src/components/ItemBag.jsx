// /client/src/components/ItemBag.jsx
// List of owned items the user can drag/click to equip on a placed unit.
import React from "react";

export default function ItemBag({ items = [], onSelect, selectedItemId }) {
  if (items.length === 0) {
    return (
      <div className="item-bag empty">
        No items yet. Buy from the shop.
      </div>
    );
  }
  // Group identical items by item_id
  const grouped = {};
  for (const it of items) {
    if (!grouped[it.id]) grouped[it.id] = { ...it, count: 0, ownedIds: [] };
    grouped[it.id].count += 1;
    grouped[it.id].ownedIds.push(it.ownedId);
  }

  return (
    <div className="item-bag">
      {Object.values(grouped).map((it) => (
        <button
          key={it.id}
          className={`item-chip ${selectedItemId === it.id ? "selected" : ""}`}
          onClick={() => onSelect && onSelect(it.id === selectedItemId ? null : it.id)}
          title={`${it.name} — ${it.desc}`}
        >
          <span className="item-emoji">{it.emoji}</span>
          <span className="item-name">{it.name}</span>
          <span className="item-count">×{it.count}</span>
        </button>
      ))}
    </div>
  );
}
