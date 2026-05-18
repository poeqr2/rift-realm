// /client/src/components/VictoryRecap.jsx
// Detailed result modal: outcome, MVP card, per-unit stats with damage bars, optional share button.
import React, { useEffect, useState } from "react";
import { play, sfx } from "../audio";
import { shareReplay } from "../api";

function copyToClipboard(text) {
  try { navigator.clipboard.writeText(text); return true; } catch (_) { return false; }
}

function StatBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="recap-bar"><div style={{ width: `${pct}%`, background: color }} /></div>
  );
}

export default function VictoryRecap({ result, recap, augmentName, matchId, onClose, onPlayAgain }) {
  const [shareUrl, setShareUrl] = useState(null);
  const [shareErr, setShareErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  useEffect(() => {
    if (!result) return;
    if (result.youWon) sfx.victory(); else sfx.defeat();
  }, [result]);

  if (!result) return null;

  const myTeam = recap?.[result.selfSide || 1];
  const enemyTeam = recap?.[result.selfSide === 2 ? 1 : 2];
  const allUnits = [
    ...(myTeam?.units || []).map((u) => ({ ...u, mine: true, mvp: u.uid === myTeam?.mvpUid })),
    ...(enemyTeam?.units || []).map((u) => ({ ...u, mine: false, mvp: u.uid === enemyTeam?.mvpUid })),
  ];
  const maxDmg = Math.max(1, ...allUnits.map((u) => u.damageDealt || 0));

  const totals = { mine: { dmg: 0, taken: 0, heal: 0, kills: 0, casts: 0 }, enemy: { dmg: 0, taken: 0, heal: 0, kills: 0, casts: 0 } };
  for (const u of allUnits) {
    const t = u.mine ? totals.mine : totals.enemy;
    t.dmg += u.damageDealt || 0;
    t.taken += u.damageTaken || 0;
    t.heal += u.healingDone || 0;
    t.kills += u.kills || 0;
    t.casts += u.casts || 0;
  }
  const mvp = allUnits.find((u) => u.mine && u.mvp);

  async function doShare() {
    if (!matchId) return;
    setBusy(true);
    try {
      const data = await shareReplay(matchId);
      const url = `${window.location.origin}/replay/${data.replayToken}`;
      setShareUrl(url);
      if (copyToClipboard(url)) setCopyMsg("Link copied!");
      play("pickup");
    } catch (e) { setShareErr(e.message || "Failed"); }
    setBusy(false);
    setTimeout(() => setCopyMsg(""), 2200);
  }

  return (
    <div className="recap-overlay" onClick={onClose}>
      <div className={`recap-modal ${result.youWon ? "victory" : "defeat"}`} onClick={(e) => e.stopPropagation()}>
        <div className="recap-banner">
          <h1 className="recap-title">
            {result.youWon ? "🏆 VICTORY" : result.walkover ? "🏳 ABANDONED" : "💀 DEFEAT"}
          </h1>
          {augmentName && <div className="recap-aug">⚡ {augmentName}</div>}
        </div>

        {result.reward && (
          <div className="recap-rewards">
            <div className="recap-reward-stat">
              <div className="reward-label">Gold</div>
              <div className="reward-val gold">+🪙 {result.reward.gold}</div>
              {result.reward.streakBonus > 0 && <div className="reward-extra">+{result.reward.streakBonus} streak</div>}
              {result.reward.comeback && <div className="reward-extra">+30 comeback!</div>}
            </div>
            {typeof result.reward.mmr === "number" && result.reward.mmr !== 0 && (
              <div className="recap-reward-stat">
                <div className="reward-label">MMR</div>
                <div className={`reward-val ${result.reward.mmr >= 0 ? "win" : "lose"}`}>
                  {result.reward.mmr >= 0 ? "+" : ""}{result.reward.mmr}
                </div>
              </div>
            )}
            {result.user && (
              <div className="recap-reward-stat">
                <div className="reward-label">Tier</div>
                <div className="reward-val gold" style={{ color: result.user.tier?.color }}>
                  {result.user.tier?.name || "—"} ({result.user.mmr})
                </div>
              </div>
            )}
          </div>
        )}

        {mvp && (
          <div className="recap-mvp">
            <div className="recap-mvp-label">⭐ MVP</div>
            <div className="recap-mvp-emoji">{mvp.emoji}</div>
            <div className="recap-mvp-name">{mvp.name}</div>
            <div className="recap-mvp-stats">
              {mvp.damageDealt} dmg · {mvp.kills} kills · {mvp.casts} casts
            </div>
          </div>
        )}

        {(myTeam?.units?.length > 0 || enemyTeam?.units?.length > 0) && (
          <div className="recap-tables">
            <div className="recap-summary-row">
              <div className="summary-side mine">
                <span>Your team</span>
                <span>{totals.mine.dmg} dmg</span>
                <span>{totals.mine.kills} kills</span>
                <span>{totals.mine.heal} heal</span>
              </div>
              <div className="summary-side enemy">
                <span>Enemy</span>
                <span>{totals.enemy.dmg} dmg</span>
                <span>{totals.enemy.kills} kills</span>
                <span>{totals.enemy.heal} heal</span>
              </div>
            </div>

            <div className="recap-table-grid">
              <RecapTable title="Your Team" units={myTeam?.units || []} maxDmg={maxDmg} mine />
              <RecapTable title="Enemy" units={enemyTeam?.units || []} maxDmg={maxDmg} />
            </div>
          </div>
        )}

        {shareErr && <div className="alert alert-error">{shareErr}</div>}
        {shareUrl && (
          <div className="recap-share">
            <input className="form-input" readOnly value={shareUrl} onClick={(e) => e.target.select()} />
            <button className="btn btn-outline" onClick={() => { copyToClipboard(shareUrl); setCopyMsg("Link copied!"); setTimeout(() => setCopyMsg(""), 1500); }}>Copy</button>
          </div>
        )}
        {copyMsg && <div className="recap-copymsg">{copyMsg}</div>}

        <div className="recap-actions">
          {matchId && !shareUrl && (
            <button className="btn btn-outline" disabled={busy} onClick={doShare}>
              🔗 Share replay
            </button>
          )}
          {onPlayAgain && <button className="btn btn-gold" onClick={onPlayAgain}>↻ Play again</button>}
          <button className="btn btn-primary" onClick={onClose}>← Lobby</button>
        </div>
      </div>
    </div>
  );
}

function RecapTable({ title, units, maxDmg, mine }) {
  if (!units || units.length === 0) {
    return (
      <div className="recap-table">
        <div className="recap-table-title">{title}</div>
        <div className="recap-empty">No data.</div>
      </div>
    );
  }
  const sorted = units.slice().sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0));
  return (
    <div className="recap-table">
      <div className={`recap-table-title ${mine ? "mine" : "enemy"}`}>{title}</div>
      {sorted.map((u) => (
        <div key={u.uid} className={`recap-row ${u.mvp ? "mvp" : ""} ${u.survived ? "alive" : "dead"}`}>
          <span className="recap-emoji">{u.emoji}</span>
          <span className="recap-name">
            {u.name} {u.mvp ? "⭐" : ""} {!u.survived && <span className="recap-dead">(dead)</span>}
          </span>
          <div className="recap-bars">
            <div className="recap-stat-line">
              <span>DMG {u.damageDealt}</span>
              <StatBar value={u.damageDealt || 0} max={maxDmg} color={mine ? "#a855f7" : "#ef4444"} />
            </div>
            <div className="recap-stat-line subtle">
              <span>TAKEN {u.damageTaken}</span>
              <StatBar value={u.damageTaken || 0} max={maxDmg} color="#475569" />
            </div>
            {u.healingDone > 0 && (
              <div className="recap-stat-line subtle">
                <span>HEAL {u.healingDone}</span>
                <StatBar value={u.healingDone} max={maxDmg} color="#22c55e" />
              </div>
            )}
          </div>
          <div className="recap-meta">{u.kills}K · {u.casts}C</div>
        </div>
      ))}
    </div>
  );
}
