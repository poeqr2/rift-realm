// /client/src/components/ReplayViewer.jsx
// Plays back a saved replay locally with playback speed controls.
import React, { useEffect, useRef, useState } from "react";
import BattleArena from "./BattleArena";
import TraitsPanel from "./TraitsPanel";
import BattleLog from "./BattleLog";

export default function ReplayViewer({ replay, traitsCatalog = {}, selfTeam = 1, onClose }) {
  const [tickIdx, setTickIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [fxQueue, setFxQueue] = useState([]);
  const timerRef = useRef(null);

  const ticks = replay?.ticks || [];
  const tick = ticks[tickIdx];
  const units = tick?.state || [];

  useEffect(() => {
    if (!playing) return;
    if (tickIdx >= ticks.length - 1) { setPlaying(false); return; }
    const delay = 200 / speed;
    timerRef.current = setTimeout(() => {
      setTickIdx((i) => i + 1);
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [tickIdx, playing, speed, ticks.length]);

  useEffect(() => {
    if (tick && tick.fx) setFxQueue(tick.fx);
  }, [tick]);

  if (!replay) return null;

  const t1 = replay.traits?.[1] || { counts: {}, active: {} };
  const t2 = replay.traits?.[2] || { counts: {}, active: {} };
  const totalTicks = ticks.length;

  return (
    <div className="replay-overlay" onClick={onClose}>
      <div className="replay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="replay-header">
          <div className="replay-title">📼 Replay</div>
          <button className="btn btn-outline" onClick={onClose}>✕ Close</button>
        </div>

        <div className="replay-body">
          <div className="replay-side">
            <TraitsPanel counts={t1.counts} active={t1.active} traitsCatalog={traitsCatalog} side={1} />
          </div>
          <div className="replay-arena">
            <BattleArena
              units={units}
              fxQueue={fxQueue}
              selfTeam={selfTeam}
              badge={`Tick ${tick?.tick ?? 0}/${totalTicks}`}
              badgeColor="#a78bfa"
            />
            <div className="replay-controls">
              <button className="btn btn-primary" onClick={() => { setTickIdx(0); setPlaying(true); }}>⏮ Restart</button>
              <button className="btn btn-primary" onClick={() => setPlaying((p) => !p)}>
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>
              <button className="btn btn-outline" onClick={() => setTickIdx((i) => Math.max(0, i - 1))}>◀</button>
              <button className="btn btn-outline" onClick={() => setTickIdx((i) => Math.min(ticks.length - 1, i + 1))}>▶</button>
              <input
                type="range" min={0} max={ticks.length - 1} value={tickIdx}
                onChange={(e) => { setPlaying(false); setTickIdx(Number(e.target.value)); }}
                className="replay-slider"
              />
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="replay-speed">
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </div>
          </div>
          <div className="replay-side">
            <TraitsPanel counts={t2.counts} active={t2.active} traitsCatalog={traitsCatalog} side={2} />
          </div>
        </div>

        <div className="replay-log">
          <BattleLog ticks={ticks.slice(0, tickIdx + 1)} units={units} />
        </div>
      </div>
    </div>
  );
}
