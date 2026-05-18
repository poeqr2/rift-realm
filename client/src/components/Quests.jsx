// /client/src/components/Quests.jsx
import React from "react";

const QUEST_DESC = {
  play_3:    "Play 3 battles",
  win_2:     "Win 2 battles",
  bot_hard:  "Beat a Hard or Nightmare bot",
  place_5:   "Place 5 different units (any battles)",
  use_skill: "Cast 5 unit skills (any battles)",
};

export default function Quests({ quests = [], onClaim }) {
  if (quests.length === 0) {
    return <div className="quests-empty">Loading daily quests…</div>;
  }
  return (
    <div className="quests-panel">
      {quests.map((q) => {
        const pct = Math.min(100, (q.progress / q.target) * 100);
        const claimable = q.completed && !q.claimed;
        return (
          <div key={q.id} className={`quest-row ${q.claimed ? "claimed" : ""} ${claimable ? "claimable" : ""}`}>
            <div className="quest-text">
              <div className="quest-title">{QUEST_DESC[q.quest_key] || q.quest_key}</div>
              <div className="quest-progress">
                <div className="quest-bar"><div style={{ width: `${pct}%` }} /></div>
                <span>{q.progress}/{q.target}</span>
              </div>
            </div>
            <div className="quest-reward">
              {q.claimed ? (
                <span className="quest-claimed">✓ Claimed</span>
              ) : claimable ? (
                <button className="btn btn-gold" onClick={() => onClaim && onClaim(q.id)}>
                  Claim 🪙{q.reward_gold}
                </button>
              ) : (
                <span className="quest-pending">🪙 {q.reward_gold}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
