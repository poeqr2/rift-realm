// /client/src/components/Board.jsx
// 5x4 board. Player half = bottom 2 rows (y=0..1 in player coords).
// Renders units by uid so React can animate position transitions when the
// server-side simulation moves a unit.

import React from "react";

export const COLS = 5;
export const ROWS = 4;
export const CELL = 78; // px

function HpBar({ hp, max, shield = 0 }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const color = pct > 60 ? "#22c55e" : pct > 30 ? "#facc15" : "#ef4444";
  const sPct = max > 0 ? Math.min(100, (shield / max) * 100) : 0;
  return (
    <div className="hp-track">
      <div className="hp-fill" style={{ width: `${pct}%`, background: color }} />
      {shield > 0 && (
        <div className="hp-shield" style={{ width: `${sPct}%` }} />
      )}
    </div>
  );
}

function ManaBar({ mana, max }) {
  if (!max || max >= 999) return null;
  const pct = Math.max(0, Math.min(100, (mana / max) * 100));
  return (
    <div className="mana-track">
      <div className="mana-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusIcons({ unit }) {
  const items = [];
  if (unit.stun) items.push({ k: "💫", title: "Stunned" });
  if (unit.freeze) items.push({ k: "❄️", title: "Frozen" });
  if (unit.bleed) items.push({ k: "🩸", title: "Bleeding" });
  if (items.length === 0) return null;
  return (
    <div className="status-icons">
      {items.map((it, i) => (
        <span key={i} title={it.title}>{it.k}</span>
      ))}
    </div>
  );
}

function ItemDots({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="unit-items">
      {items.map((it, i) => (
        <span key={i} title={it.name} className="unit-item-dot">{it.emoji}</span>
      ))}
    </div>
  );
}

export default function Board({
  units = [],            // [{ uid, x, y, hp, maxHp, mana, maxMana, name, emoji, team, alive, ... }]
  selfTeam = 1,          // which team's perspective (controls Y mirror for display)
  onCellClick,           // (x, y) => void
  onUnitClick,           // (unit) => void
  highlightedUid,        // uid of unit currently selected for item-equip
  badge,                 // text in top-left corner (e.g., "Your Side")
  badgeColor = "#a78bfa",
}) {
  // Server uses absolute y. For display: team1 sits on bottom, team2 on top.
  // If selfTeam === 1, just render directly. Otherwise vertically flip.
  function dispY(absY) {
    return selfTeam === 1 ? absY : (ROWS - 1 - absY);
  }

  // pre-place units by display position
  const placedDisp = {};
  for (const u of units) {
    if (!u.alive && u.hp <= 0) continue; // dead units get removed
    const dy = dispY(u.y);
    placedDisp[`${u.x},${dy}`] = u;
  }

  return (
    <div className="board-wrap">
      {badge && (
        <div className="board-badge" style={{ color: badgeColor, borderColor: badgeColor }}>
          {badge}
        </div>
      )}
      <div
        className="board-grid"
        style={{
          width: COLS * CELL + (COLS + 1) * 4,
          height: ROWS * CELL + (ROWS + 1) * 4,
          ["--cols"]: COLS,
          ["--rows"]: ROWS,
          ["--cell"]: `${CELL}px`,
        }}
      >
        {/* cells (background) */}
        {Array.from({ length: ROWS }, (_, ry) =>
          Array.from({ length: COLS }, (_, rx) => {
            const isMyHalf = selfTeam === 1 ? (ry < 2) : (ry < 2);
            const cellY = ry; // display y
            const absY = selfTeam === 1 ? cellY : (ROWS - 1 - cellY);
            const playerHalf = absY < 2;
            return (
              <div
                key={`c-${rx}-${ry}`}
                className={`cell ${playerHalf ? "my-half" : "enemy-half"}`}
                style={{
                  left: rx * (CELL + 4) + 4,
                  top: ry * (CELL + 4) + 4,
                  width: CELL,
                  height: CELL,
                }}
                onClick={() => onCellClick && onCellClick(rx, absY)}
              />
            );
          })
        )}

        {/* units (positioned via uid) */}
        {Object.entries(placedDisp).map(([key, u]) => {
          const [x, dy] = key.split(",").map(Number);
          const myUnit = u.team === selfTeam;
          const dim = !u.alive ? "dead" : "";
          return (
            <div
              key={u.uid}
              className={`unit-token ${myUnit ? "my" : "enemy"} ${dim} ${u.uid === highlightedUid ? "highlight" : ""}`}
              style={{
                left: x * (CELL + 4) + 4,
                top: dy * (CELL + 4) + 4,
                width: CELL,
                height: CELL,
              }}
              data-uid={u.uid}
              onClick={() => onUnitClick && onUnitClick(u)}
            >
              <div className="unit-emoji">{u.emoji}</div>
              <div className="unit-name-mini">{u.name}</div>
              <HpBar hp={u.hp} max={u.maxHp} shield={u.shield || 0} />
              <ManaBar mana={u.mana} max={u.maxMana} />
              <StatusIcons unit={u} />
              <ItemDots items={u.items} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
