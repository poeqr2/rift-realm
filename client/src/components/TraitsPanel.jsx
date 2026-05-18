// Traits/Synergies panel — shows which traits are active and how many of each.
import React from "react";

export default function TraitsPanel({ counts = {}, active = {}, traitsCatalog = {}, side = 1 }) {
  // turn counts into sorted entries; show active ones first.
  const entries = Object.entries(counts).sort((a, b) => {
    const ai = active[a[0]] ? 0 : 1;
    const bi = active[b[0]] ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return b[1] - a[1];
  });

  if (entries.length === 0) {
    return (
      <div className="traits-panel">
        <div className="traits-panel-title">{side === 1 ? "Your Synergies" : "Enemy Synergies"}</div>
        <div className="traits-empty">No synergies yet.</div>
      </div>
    );
  }

  return (
    <div className="traits-panel">
      <div className="traits-panel-title">{side === 1 ? "Your Synergies" : "Enemy Synergies"}</div>
      <div className="traits-list">
        {entries.map(([name, count]) => {
          const def = traitsCatalog[name];
          const a = active[name];
          const nextTier = def?.tiers?.find((t) => count < t.count);
          return (
            <div key={name} className={`trait-row ${a ? "trait-active" : ""}`}
                 style={{ ["--trait-color"]: def?.color || "#a78bfa" }}>
              <div className="trait-icon">{def?.emoji || "✦"}</div>
              <div className="trait-meta">
                <div className="trait-name">
                  {name} <span className="trait-tier">{a ? a.name : ""}</span>
                </div>
                <div className="trait-progress">
                  {def?.tiers?.map((t) => (
                    <span
                      key={t.count}
                      className={`trait-pip ${count >= t.count ? "filled" : ""}`}
                    >{t.count}</span>
                  ))}
                  <span className="trait-count">{count}{nextTier ? ` / ${nextTier.count}` : ""}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
