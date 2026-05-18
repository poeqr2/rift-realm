// /client/src/components/BattleArena.jsx
// Visual layer for the battle: renders Board + floating damage text + attack lines.

import React, { useEffect, useRef, useState } from "react";
import Board, { COLS, ROWS, CELL } from "./Board";

const STEP = CELL + 4;

function uidPos(units, uid, selfTeam) {
  const u = units.find((x) => x.uid === uid);
  if (!u) return null;
  const dy = selfTeam === 1 ? u.y : (ROWS - 1 - u.y);
  return { x: u.x * STEP + 4 + CELL / 2, y: dy * STEP + 4 + CELL / 2 };
}

export default function BattleArena({
  units = [],
  fxQueue = [],     // events that have arrived; drained internally
  selfTeam = 1,
  badge,
  badgeColor,
}) {
  const arenaRef = useRef(null);
  const [floats, setFloats] = useState([]); // [{ id, x, y, text, color }]
  const [lines, setLines] = useState([]);   // [{ id, x1, y1, x2, y2, kind }]
  const [shake, setShake] = useState(false);
  const [casts, setCasts] = useState([]);   // [{ id, x, y, name }]
  const idRef = useRef(1);

  // Drain fx queue when it changes
  useEffect(() => {
    if (!fxQueue || fxQueue.length === 0) return;
    const nf = []; const nl = []; const nc = [];
    let triggerShake = false;

    for (const ev of fxQueue) {
      const id = idRef.current++;
      switch (ev.t) {
        case "atk": {
          const a = uidPos(units, ev.uid, selfTeam);
          const b = uidPos(units, ev.target, selfTeam);
          if (a && b) nl.push({ id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: ev.crit ? "crit" : "atk" });
          break;
        }
        case "dmg": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) {
            const color = ev.kind === "magic" ? "#a78bfa" : ev.kind === "true" ? "#fb7185" : "#fbbf24";
            nf.push({ id, x: p.x, y: p.y - 16, text: `-${ev.amount}`, color, kind: "dmg" });
          }
          if (ev.amount > 200) triggerShake = true;
          break;
        }
        case "heal": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nf.push({ id, x: p.x, y: p.y - 16, text: `+${ev.amount}`, color: "#22c55e", kind: "heal" });
          break;
        }
        case "shield": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nf.push({ id, x: p.x, y: p.y - 16, text: `🛡 ${ev.amount}`, color: "#60a5fa", kind: "shield" });
          break;
        }
        case "shieldGain": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nf.push({ id, x: p.x, y: p.y - 16, text: `+🛡 ${ev.amount}`, color: "#60a5fa", kind: "shield" });
          break;
        }
        case "dodge": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nf.push({ id, x: p.x, y: p.y - 16, text: "miss!", color: "#cbd5e1", kind: "miss" });
          break;
        }
        case "cast": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nc.push({ id, x: p.x, y: p.y, name: ev.name });
          break;
        }
        case "death": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nf.push({ id, x: p.x, y: p.y - 16, text: "💀", color: "#ef4444", kind: "death" });
          break;
        }
        case "revive": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) nf.push({ id, x: p.x, y: p.y - 16, text: "REBORN", color: "#fbbf24", kind: "revive" });
          break;
        }
        default: break;
      }
    }

    if (nf.length) setFloats((cur) => [...cur, ...nf]);
    if (nl.length) setLines((cur) => [...cur, ...nl]);
    if (nc.length) setCasts((cur) => [...cur, ...nc]);
    if (triggerShake) {
      setShake(true);
      setTimeout(() => setShake(false), 220);
    }
  }, [fxQueue]);

  // Cleanup expired float text and lines
  useEffect(() => {
    if (floats.length === 0) return;
    const t = setTimeout(() => {
      setFloats((cur) => cur.slice(Math.max(0, cur.length - 30)));
    }, 900);
    return () => clearTimeout(t);
  }, [floats]);

  useEffect(() => {
    if (lines.length === 0) return;
    const t = setTimeout(() => setLines([]), 280);
    return () => clearTimeout(t);
  }, [lines]);

  useEffect(() => {
    if (casts.length === 0) return;
    const t = setTimeout(() => setCasts([]), 700);
    return () => clearTimeout(t);
  }, [casts]);

  return (
    <div className={`arena-wrap ${shake ? "shake" : ""}`} ref={arenaRef}>
      <Board units={units} selfTeam={selfTeam} badge={badge} badgeColor={badgeColor} />
      <div className="fx-layer" style={{
        width: COLS * (CELL + 4) + 4,
        height: ROWS * (CELL + 4) + 4,
        marginTop: badge ? -((ROWS * (CELL + 4) + 4) + 4) : 0,
      }}>
        {/* attack lines */}
        <svg className="attack-svg" width="100%" height="100%">
          {lines.map((l) => (
            <line
              key={l.id}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              className={`atk-line ${l.kind}`}
            />
          ))}
        </svg>

        {/* floating damage / heal text */}
        {floats.map((f) => (
          <div
            key={f.id}
            className={`float-text ${f.kind}`}
            style={{ left: f.x, top: f.y, color: f.color }}
          >
            {f.text}
          </div>
        ))}

        {/* cast labels */}
        {casts.map((c) => (
          <div
            key={c.id}
            className="cast-label"
            style={{ left: c.x, top: c.y - 36 }}
          >
            ✦ {c.name}
          </div>
        ))}
      </div>
    </div>
  );
}
