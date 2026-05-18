// /client/src/components/BattleArena.jsx
// Visual layer for the battle: renders Board + floating damage text + attack lines + spell-specific particles.

import React, { useEffect, useRef, useState } from "react";
import Board, { COLS, ROWS, CELL } from "./Board";
import { playFromFx, play } from "../audio";

const STEP = CELL + 4;

function uidPos(units, uid, selfTeam) {
  const u = units.find((x) => x.uid === uid);
  if (!u) return null;
  const dy = selfTeam === 1 ? u.y : (ROWS - 1 - u.y);
  return { x: u.x * STEP + 4 + CELL / 2, y: dy * STEP + 4 + CELL / 2 };
}

// Map cast names to particle styles
function castParticles(name) {
  switch (name) {
    case "Fireball":         return { kind: "fire", count: 18, color: "#fb923c", radius: 70 };
    case "Inferno Breath":   return { kind: "fire", count: 26, color: "#ef4444", radius: 110, cone: true };
    case "Chain Lightning":  return { kind: "spark", count: 12, color: "#fde047", radius: 60 };
    case "Blizzard":         return { kind: "ice", count: 14, color: "#67e8f9", radius: 80 };
    case "Starfall":         return { kind: "star", count: 16, color: "#fde68a", radius: 90 };
    case "Voidblink":        return { kind: "void", count: 12, color: "#a855f7", radius: 50 };
    case "Death Coil":       return { kind: "void", count: 10, color: "#9333ea", radius: 40 };
    case "Soul Drain":       return { kind: "void", count: 10, color: "#a855f7", radius: 40 };
    case "Mend":
    case "Divine Shield":    return { kind: "holy", count: 12, color: "#fde047", radius: 50 };
    case "Judgement":        return { kind: "holy", count: 16, color: "#fef3c7", radius: 80 };
    case "Spear Storm":      return { kind: "spark", count: 18, color: "#fbbf24", radius: 100 };
    case "Headshot":
    case "Quick Shot":       return { kind: "spark", count: 6, color: "#fbbf24", radius: 30 };
    case "Earthquake":       return { kind: "fire", count: 14, color: "#a16207", radius: 80 };
    case "Maul":             return { kind: "spark", count: 8, color: "#dc2626", radius: 30 };
    case "Pounce":
    case "Backstab":         return { kind: "spark", count: 6, color: "#f87171", radius: 25 };
    case "Roar":             return { kind: "holy", count: 12, color: "#f59e0b", radius: 70 };
    case "Raise Army":       return { kind: "void", count: 16, color: "#9333ea", radius: 60 };
    case "Rebirth":          return { kind: "holy", count: 18, color: "#f59e0b", radius: 70 };
    default:                 return { kind: "spark", count: 10, color: "#a855f7", radius: 40 };
  }
}

export default function BattleArena({
  units = [],
  fxQueue = [],     // events that have arrived; drained internally
  selfTeam = 1,
  badge,
  badgeColor,
  enableSound = true,
}) {
  const arenaRef = useRef(null);
  const [floats, setFloats] = useState([]);
  const [lines, setLines] = useState([]);
  const [shake, setShake] = useState(false);
  const [casts, setCasts] = useState([]);
  const [particles, setParticles] = useState([]); // [{id, x, y, kind, color, count, radius, cone, dir}]
  const idRef = useRef(1);

  useEffect(() => {
    if (!fxQueue || fxQueue.length === 0) return;
    const nf = [], nl = [], nc = [], np = [];
    let triggerShake = false;

    for (const ev of fxQueue) {
      if (enableSound) playFromFx(ev);
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
          const caster = units.find((u) => u.uid === ev.uid);
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) {
            nc.push({ id, x: p.x, y: p.y, name: ev.name });
            const cfg = castParticles(ev.name);
            np.push({
              id, x: p.x, y: p.y,
              kind: cfg.kind, color: cfg.color, count: cfg.count, radius: cfg.radius,
              cone: !!cfg.cone,
              // For cone (Inferno Breath), direction matters: caster on team 1 fires +y in display, team 2 fires -y
              dir: caster && (caster.team === selfTeam ? 1 : -1),
            });
          }
          break;
        }
        case "death": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) {
            nf.push({ id, x: p.x, y: p.y - 16, text: "💀", color: "#ef4444", kind: "death" });
            np.push({ id: id + 0.5, x: p.x, y: p.y, kind: "smoke", color: "#7f1d1d", count: 10, radius: 40 });
          }
          break;
        }
        case "revive": {
          const p = uidPos(units, ev.uid, selfTeam);
          if (p) {
            nf.push({ id, x: p.x, y: p.y - 16, text: "REBORN", color: "#fbbf24", kind: "revive" });
            np.push({ id: id + 0.5, x: p.x, y: p.y, kind: "holy", color: "#fde68a", count: 16, radius: 60 });
          }
          break;
        }
        default: break;
      }
    }

    if (nf.length) setFloats((cur) => [...cur, ...nf]);
    if (nl.length) setLines((cur) => [...cur, ...nl]);
    if (nc.length) setCasts((cur) => [...cur, ...nc]);
    if (np.length) setParticles((cur) => [...cur, ...np]);
    if (triggerShake) {
      setShake(true);
      setTimeout(() => setShake(false), 220);
    }
  }, [fxQueue, enableSound]);

  // GC
  useEffect(() => {
    if (floats.length === 0) return;
    const t = setTimeout(() => setFloats((cur) => cur.slice(Math.max(0, cur.length - 30))), 900);
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
  useEffect(() => {
    if (particles.length === 0) return;
    const t = setTimeout(() => setParticles([]), 800);
    return () => clearTimeout(t);
  }, [particles]);

  return (
    <div className={`arena-wrap ${shake ? "shake" : ""}`} ref={arenaRef}>
      <Board units={units} selfTeam={selfTeam} badge={badge} badgeColor={badgeColor} />
      <div
        className="fx-layer"
        style={{
          width: COLS * (CELL + 4) + 4,
          height: ROWS * (CELL + 4) + 4,
          marginTop: badge ? -((ROWS * (CELL + 4) + 4) + 4) : 0,
        }}
      >
        <svg className="attack-svg" width="100%" height="100%">
          {lines.map((l) => (
            <line
              key={l.id}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              className={`atk-line ${l.kind}`}
            />
          ))}
        </svg>

        {floats.map((f) => (
          <div key={f.id} className={`float-text ${f.kind}`} style={{ left: f.x, top: f.y, color: f.color }}>
            {f.text}
          </div>
        ))}

        {casts.map((c) => (
          <div key={c.id} className="cast-label" style={{ left: c.x, top: c.y - 36 }}>
            ✦ {c.name}
          </div>
        ))}

        {particles.map((p) => (
          <ParticleBurst key={p.id} {...p} />
        ))}
      </div>
    </div>
  );
}

// Renders N particles around (x,y). Direction & shape vary per kind.
function ParticleBurst({ x, y, kind, color, count, radius, cone, dir }) {
  // Pre-compute particle deltas once
  const items = [];
  for (let i = 0; i < count; i++) {
    let angle, dist, life;
    if (cone) {
      // Cone: limit angle to ±35° around dir (display y axis)
      const baseDeg = dir > 0 ? 90 : -90;
      angle = ((baseDeg - 35) + Math.random() * 70) * Math.PI / 180;
      dist = 0.35 * radius + Math.random() * 0.65 * radius;
      life = 0.45 + Math.random() * 0.3;
    } else if (kind === "star") {
      // Fall from above
      angle = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      dist = 0.6 * radius + Math.random() * radius;
      life = 0.55;
    } else {
      angle = Math.random() * Math.PI * 2;
      dist = (kind === "void" ? 0.4 : 0.6) * radius + Math.random() * radius * 0.5;
      life = 0.4 + Math.random() * 0.4;
    }
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const size = kind === "spark" ? 3 : (kind === "ice" ? 5 : (kind === "star" ? 6 : 4));
    items.push({ dx, dy, life, size });
  }
  return (
    <div className={`particle-burst kind-${kind}`} style={{ left: x, top: y }}>
      {items.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{
            background: color,
            width: p.size, height: p.size,
            ["--dx"]: `${p.dx}px`,
            ["--dy"]: `${p.dy}px`,
            ["--life"]: `${p.life}s`,
            boxShadow: `0 0 ${p.size * 2}px ${color}`,
          }}
        />
      ))}
    </div>
  );
}
