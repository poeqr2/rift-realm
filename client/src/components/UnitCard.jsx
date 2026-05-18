// /client/src/components/UnitCard.jsx
// Card used in shop, inventory, and bench.
import React from "react";

const RARITY_COLORS = {
  1: "#9ca3af", 2: "#22c55e", 3: "#3b82f6", 4: "#a855f7", 5: "#f59e0b",
};
const RARITY_LABELS = { 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };

export default function UnitCard({ unit, onBuy, onSelect, selected, ownedCount, compact = false, traitsCatalog = {} }) {
  if (!unit) return null;
  const color = RARITY_COLORS[unit.rarity] || "#a78bfa";
  const cost = unit.cost * 10;

  return (
    <div
      className={`unit-card ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
      style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}33, 0 6px 20px rgba(0,0,0,.4)` }}
      onClick={() => onSelect && onSelect(unit)}
    >
      <div className="unit-card-header">
        <span className="unit-card-emoji">{unit.emoji}</span>
        <div className="unit-card-title">
          <div className="unit-card-name" style={{ color }}>{unit.name}</div>
          <div className="unit-card-rarity" style={{ color }}>{RARITY_LABELS[unit.rarity]}</div>
        </div>
        {ownedCount > 0 && <span className="owned-badge">×{ownedCount}</span>}
      </div>

      <div className="unit-card-traits">
        {unit.traits.map((tn) => {
          const t = traitsCatalog[tn];
          return (
            <span key={tn} className="trait-chip" style={{ color: t?.color || "#a78bfa" }}>
              {t?.emoji || "✦"} {tn}
            </span>
          );
        })}
      </div>

      <div className="unit-card-stats">
        <span title="HP">❤️ {unit.hp}</span>
        <span title="Attack">⚔️ {unit.attack}</span>
        <span title="Attack speed">⚡ {unit.attackSpeed.toFixed(2)}</span>
        <span title="Range">🎯 {unit.range}</span>
        <span title="Mana">🔵 {unit.maxMana}</span>
      </div>

      {!compact && (
        <div className="unit-card-skill">
          <div className="skill-name">✦ {unit.skill}</div>
          <div className="skill-desc">{unit.skillDesc}</div>
        </div>
      )}

      {onBuy && (
        <button
          className="buy-btn"
          onClick={(e) => { e.stopPropagation(); onBuy(unit); }}
        >
          🪙 {cost} — Buy
        </button>
      )}
    </div>
  );
}
