// /client/src/components/AugmentPicker.jsx
// Shows 3 augment cards; user picks one. Used in PvP (in Game) and pre-PvE.
import React from "react";
import { play } from "../audio";

export default function AugmentPicker({ choices = [], selectedId = null, onPick }) {
  if (!choices.length) return null;
  return (
    <div className="augment-picker">
      <div className="augment-header">
        <h3 className="augment-title">⚡ Choose an Augment</h3>
        <p className="augment-sub">Lasts for this battle. Pick wisely.</p>
      </div>
      <div className="augment-grid">
        {choices.map((a) => (
          <button
            key={a.id}
            className={`augment-card ${selectedId === a.id ? "selected" : ""}`}
            onClick={() => { play("pickup"); onPick && onPick(a.id); }}
          >
            <div className="augment-emoji">{a.emoji}</div>
            <div className="augment-name">{a.name}</div>
            <div className="augment-desc">{a.desc}</div>
            {selectedId === a.id && <div className="augment-check">✓</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
