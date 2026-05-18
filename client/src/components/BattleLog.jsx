// /client/src/components/BattleLog.jsx
import React, { useEffect, useRef } from "react";

function lineFor(ev, units) {
  const lookup = (uid) => {
    const u = units.find((x) => x.uid === uid);
    return u ? `${u.emoji} ${u.name}` : `unit#${uid}`;
  };
  switch (ev.t) {
    case "atk":  return { color: "#fbbf24", text: `${lookup(ev.uid)} attacks ${lookup(ev.target)}${ev.crit ? " (CRIT!)" : ""}` };
    case "dmg":  return null; // already implied by atk/cast
    case "cast": return { color: "#a78bfa", text: `${lookup(ev.uid)} casts ${ev.name}` };
    case "heal": return { color: "#22c55e", text: `${lookup(ev.uid)} healed +${ev.amount}` };
    case "death":return { color: "#9ca3af", text: `${lookup(ev.uid)} is defeated` };
    case "revive":return { color: "#fbbf24", text: `${lookup(ev.uid)} returns to battle!` };
    case "summon":return { color: "#22d3ee", text: `Side ${ev.team} summons ${ev.name}` };
    case "stunned":return { color: "#94a3b8", text: `${lookup(ev.uid)} stunned` };
    case "frozen": return { color: "#60a5fa", text: `${lookup(ev.uid)} frozen` };
    default: return null;
  }
}

export default function BattleLog({ ticks = [], units = [] }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [ticks]);

  return (
    <div className="battle-log">
      <div className="battle-log-title">📜 Battle Log</div>
      <div className="battle-log-body">
        {ticks.length === 0 && (
          <div className="battle-log-empty">Awaiting combat…</div>
        )}
        {ticks.map((t, i) => {
          const lines = (t.fx || []).map((ev) => lineFor(ev, units)).filter(Boolean);
          if (lines.length === 0) return null;
          return (
            <div key={i} className="tick-block">
              <div className="tick-label">tick {t.tick}</div>
              {lines.map((l, j) => (
                <div key={j} className="tick-line" style={{ color: l.color }}>{l.text}</div>
              ))}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
