// /client/src/pages/Game.jsx
// Two modes: PvP (real-time via WebSocket) and PvE (REST one-shot).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Board, { ROWS } from "../components/Board";
import BattleArena from "../components/BattleArena";
import BattleLog from "../components/BattleLog";
import TraitsPanel from "../components/TraitsPanel";
import ItemBag from "../components/ItemBag";
import { getProfile, getCatalog, openSocket, getToken, playBot } from "../api";

const PHASES = {
  CONNECTING: "connecting",
  PLACEMENT:  "placement",
  WAITING:    "waiting",
  BATTLE:     "battle",
  RESULT:     "result",
  ERROR:      "error",
};

// Compute live trait counts/active for the placed board.
function computeTraits(boardSlots, unitById, traitsCatalog) {
  const seen = new Set(); const counts = {};
  for (const s of boardSlots) {
    if (seen.has(s.unitId)) continue;
    seen.add(s.unitId);
    const u = unitById[s.unitId]; if (!u) continue;
    for (const tn of u.traits) counts[tn] = (counts[tn] || 0) + 1;
  }
  const active = {};
  for (const [name, c] of Object.entries(counts)) {
    const def = traitsCatalog[name]; if (!def) continue;
    let chosen = null;
    for (const tier of def.tiers) if (c >= tier.count) chosen = tier;
    if (chosen) active[name] = { ...chosen, count: c };
  }
  return { counts, active };
}

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  // Modes:
  // 1) PvE: location.state = { mode: "pve", difficulty }
  // 2) PvP: location.state = { mode: "pvp" }
  const mode = location.state?.mode || "pvp";
  const difficulty = location.state?.difficulty;

  const [phase, setPhase] = useState(PHASES.CONNECTING);
  const [statusMsg, setStatusMsg] = useState("Connecting…");
  const [errorMsg, setErrorMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState({ units: [], traits: {}, items: [] });

  // placement state — board is array of { unitId, x, y, items: [itemId,...], ownedId, _bk }
  const [board, setBoard] = useState([]);
  const [bench, setBench] = useState([]);     // owned units flattened (1 entry per copy)
  const [items, setItems] = useState([]);     // owned items flattened (1 entry per copy)
  const [selectedBenchIdx, setSelectedBenchIdx] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedBoardIdx, setSelectedBoardIdx] = useState(null);

  // PvP state
  const wsRef = useRef(null);
  const [matchId, setMatchId] = useState(null);
  const [side, setSide] = useState(1);
  const [opponent, setOpponent] = useState(null);
  const [opponentReady, setOpponentReady] = useState(false);
  const [placementDeadline, setPlacementDeadline] = useState(null);
  const [now, setNow] = useState(Date.now());

  // battle state
  const [units, setUnits] = useState([]);    // current snapshot from server
  const [fxQueue, setFxQueue] = useState([]);
  const [tickHistory, setTickHistory] = useState([]); // for log
  const [battleTraits, setBattleTraits] = useState(null);

  // result state
  const [result, setResult] = useState(null);

  const traitsCatalog = catalog.traits || {};
  const unitById = useMemo(() => {
    const m = {}; for (const u of catalog.units) m[u.id] = u; return m;
  }, [catalog]);

  // ── Boot: load profile, catalog, then either PvP socket or PvE direct play ─
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [c, p] = await Promise.all([getCatalog(), getProfile()]);
        if (!mounted) return;
        setCatalog(c);
        setProfile(p);
        // flatten owned to bench
        setBench(p.units.map((u) => ({ ...u })));
        setItems(p.items.map((it) => ({ ...it })));

        if (mode === "pvp") {
          openPvP();
        } else {
          // PvE: skip the WS, go straight to placement
          setPhase(PHASES.PLACEMENT);
          setStatusMsg("Build your team and conquer the AI!");
        }
      } catch (e) {
        setErrorMsg(e.message || "Failed to load");
        setPhase(PHASES.ERROR);
      }
    })();
    return () => { mounted = false; if (wsRef.current) wsRef.current.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tick clock for placement countdown
  useEffect(() => {
    if (!placementDeadline) return;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [placementDeadline]);

  function openPvP() {
    const ws = openSocket();
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: getToken() }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      handleWS(m);
    };
    ws.onclose = () => {
      if (phase !== PHASES.RESULT) {
        setStatusMsg("Disconnected from server.");
      }
    };
    ws.onerror = () => setStatusMsg("Connection error.");
  }

  function handleWS(m) {
    switch (m.type) {
      case "hello":
        setStatusMsg("Connecting…");
        break;
      case "auth_ok":
        setStatusMsg("Searching for opponent…");
        wsRef.current.send(JSON.stringify({ type: "queue_join" }));
        break;
      case "queue_status":
        setStatusMsg(m.queued ? `Queued (${m.size} waiting)…` : "Left queue.");
        break;
      case "match_found": {
        setMatchId(m.matchId);
        setSide(m.side);
        setOpponent(m.opponent);
        setPlacementDeadline(m.deadline);
        setPhase(PHASES.PLACEMENT);
        setStatusMsg(`Battle vs ${m.opponent.username}!`);
        break;
      }
      case "opponent_ready":
        setOpponentReady(true);
        break;
      case "board_ack":
        setPhase(PHASES.WAITING);
        break;
      case "battle_start":
        setPhase(PHASES.BATTLE);
        setBattleTraits(m.traits);
        setTickHistory([]);
        break;
      case "tick": {
        setUnits(m.state || []);
        setFxQueue(m.fx || []);
        setTickHistory((cur) => [...cur, { tick: m.tick, fx: m.fx, state: m.state }]);
        break;
      }
      case "battle_end":
        setPhase(PHASES.RESULT);
        setResult({ winner: m.winner, youWon: m.youWon, walkover: m.walkover, reward: m.reward, user: m.user });
        if (m.user) setProfile((p) => ({ ...(p || {}), user: m.user }));
        break;
      case "error":
        setErrorMsg(m.error || "Server error");
        break;
      default: break;
    }
  }

  // ── Placement helpers ──
  function placeOnCell(x, absY) {
    if (selectedBenchIdx === null) return;
    if (absY >= 2) return; // only player half
    if (board.length >= 8) return;
    if (board.find((s) => s.x === x && s.y === absY)) return;
    const benchUnit = bench[selectedBenchIdx];
    if (!benchUnit) return;
    setBoard((cur) => [...cur, { unitId: benchUnit.id, x, y: absY, items: [], ownedId: benchUnit.ownedId }]);
    // remove from bench
    setBench((cur) => cur.filter((_, i) => i !== selectedBenchIdx));
    setSelectedBenchIdx(null);
  }

  function removeFromBoardAt(x, absY) {
    const idx = board.findIndex((s) => s.x === x && s.y === absY);
    if (idx === -1) return;
    const slot = board[idx];
    // return unit & items to inventory
    setBench((cur) => [...cur, { ownedId: slot.ownedId, ...unitById[slot.unitId] }]);
    if (slot.items?.length > 0) {
      const restored = slot.items.map((iid) => ({ ownedId: undefined, ...catalog.items.find((it) => it.id === iid) }))
        .filter(Boolean);
      setItems((cur) => [...cur, ...restored]);
    }
    setBoard((cur) => cur.filter((_, i) => i !== idx));
    setSelectedBoardIdx(null);
  }

  function handleBoardCellClick(x, absY) {
    // priority: equip selected item to a unit on this cell, else place
    const occIdx = board.findIndex((s) => s.x === x && s.y === absY);
    if (selectedItemId !== null && occIdx !== -1) {
      const slot = board[occIdx];
      if ((slot.items || []).length >= 2) return;
      // consume one copy of selectedItemId from items list
      const itemIdx = items.findIndex((it) => it.id === selectedItemId);
      if (itemIdx === -1) return;
      const newItems = items.slice(); newItems.splice(itemIdx, 1); setItems(newItems);
      const newBoard = board.slice();
      newBoard[occIdx] = { ...slot, items: [...(slot.items || []), selectedItemId] };
      setBoard(newBoard);
      setSelectedItemId(null);
      return;
    }
    if (occIdx !== -1) {
      // toggle: clicking placed unit removes it
      removeFromBoardAt(x, absY);
      return;
    }
    if (selectedBenchIdx !== null) {
      placeOnCell(x, absY);
    }
  }

  function resetBoard() {
    // return all to inventory
    const restoredUnits = board.map((s) => ({ ownedId: s.ownedId, ...unitById[s.unitId] }));
    const restoredItems = board.flatMap((s) =>
      (s.items || []).map((iid) => ({ ownedId: undefined, ...catalog.items.find((it) => it.id === iid) })).filter(Boolean)
    );
    setBench((cur) => [...cur, ...restoredUnits]);
    setItems((cur) => [...cur, ...restoredItems]);
    setBoard([]);
    setSelectedBenchIdx(null);
    setSelectedItemId(null);
  }

  async function submitBoard() {
    if (board.length === 0) return;
    const payload = board.map((s) => ({ unitId: s.unitId, x: s.x, y: s.y, items: s.items || [] }));
    if (mode === "pvp") {
      wsRef.current.send(JSON.stringify({ type: "submit_board", matchId, board: payload }));
      return;
    }
    // PvE — call REST then play out replay locally
    try {
      setPhase(PHASES.WAITING);
      setStatusMsg("Battle in progress…");
      const data = await playBot(difficulty, payload);
      // Set initial state
      setBattleTraits(data.replay.traits);
      setPhase(PHASES.BATTLE);
      const ticks = data.replay.ticks || [];
      setTickHistory([]);
      // Stream ticks locally @ 200ms
      let i = 0;
      const step = () => {
        if (i >= ticks.length) {
          setPhase(PHASES.RESULT);
          setResult({
            winner: data.winner,
            youWon: data.youWon,
            reward: data.reward,
            user: data.user,
          });
          return;
        }
        const t = ticks[i++];
        setUnits(t.state || []);
        setFxQueue(t.fx || []);
        setTickHistory((cur) => [...cur, { tick: t.tick, fx: t.fx, state: t.state }]);
        setTimeout(step, 200);
      };
      step();
    } catch (e) {
      setErrorMsg(e.message || "Battle failed");
      setPhase(PHASES.ERROR);
    }
  }

  function concede() {
    if (mode === "pvp" && wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "concede" }));
    } else {
      navigate("/");
    }
  }

  function returnToLobby() {
    if (wsRef.current) wsRef.current.close();
    navigate("/");
  }

  // ── Derived ──
  const liveTraits = useMemo(
    () => computeTraits(board, unitById, traitsCatalog),
    [board, unitById, traitsCatalog]
  );

  // For displaying placement: build "units" array for the Board that mirrors player coords.
  const placementUnits = useMemo(() => {
    return board.map((s, i) => {
      const u = unitById[s.unitId];
      const itemDescs = (s.items || []).map((iid) => catalog.items.find((it) => it.id === iid)).filter(Boolean);
      return {
        uid: -100 - i, // temp negative uid
        team: 1,
        catalogId: u.id,
        name: u.name, emoji: u.emoji, traits: u.traits,
        x: s.x, y: s.y,
        hp: u.hp, maxHp: u.hp, mana: u.manaStart, maxMana: u.maxMana,
        attack: u.attack, alive: true, items: itemDescs.map((it) => ({ id: it.id, name: it.name, emoji: it.emoji })),
        shield: 0,
      };
    });
  }, [board, unitById, catalog.items]);

  const remainingPlacement = placementDeadline ? Math.max(0, Math.ceil((placementDeadline - now) / 1000)) : null;

  // ── Render ──
  if (phase === PHASES.ERROR) {
    return (
      <div className="page">
        <h1 className="page-title">⚠️ Error</h1>
        <p className="alert alert-error">{errorMsg}</p>
        <button className="btn btn-outline" onClick={returnToLobby}>← Back to Lobby</button>
      </div>
    );
  }

  if (phase === PHASES.CONNECTING || (mode === "pvp" && !matchId)) {
    return (
      <div className="page">
        <h1 className="page-title">⚔️ Battle</h1>
        <div className="card matchmaking-card">
          <div className="spinner" />
          <p className="status-msg">{statusMsg}</p>
          <button className="btn btn-danger" onClick={returnToLobby}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page game-page">
      {/* Header */}
      <div className="game-header">
        <h1 className="page-title">
          {mode === "pvp" ? "⚔️ Ranked Battle" : `🤖 PvE — ${difficulty?.toUpperCase()}`}
        </h1>
        <div className="game-header-meta">
          {opponent && <span className="badge badge-red">vs {opponent.username} ({opponent.mmr})</span>}
          {profile?.user && <span className="badge badge-gold">🪙 {profile.user.gold}</span>}
          <span className={`badge ${phase === PHASES.BATTLE ? "badge-red" : "badge-purple"}`}>
            {phase.toUpperCase()}
          </span>
          {phase === PHASES.PLACEMENT && remainingPlacement !== null && (
            <span className="badge badge-gold">⏱ {remainingPlacement}s</span>
          )}
        </div>
      </div>

      {/* PLACEMENT */}
      {phase === PHASES.PLACEMENT && (
        <div className="placement-grid">
          <div className="placement-left">
            <TraitsPanel
              counts={liveTraits.counts}
              active={liveTraits.active}
              traitsCatalog={traitsCatalog}
              side={1}
            />
          </div>

          <div className="placement-center">
            <Board
              units={placementUnits}
              selfTeam={1}
              onCellClick={handleBoardCellClick}
              badge="⚔ Your Side"
              badgeColor="#a78bfa"
            />
            <div className="placement-actions">
              <button
                className="btn btn-gold"
                disabled={board.length === 0}
                onClick={submitBoard}
              >
                ✅ Lock In ({board.length}/8)
              </button>
              <button className="btn btn-outline" onClick={resetBoard}>↻ Reset</button>
              <button className="btn btn-danger" onClick={concede}>🏳 Concede</button>
            </div>
          </div>

          <div className="placement-right">
            <div className="bench-card">
              <div className="bench-title">🎒 Bench ({bench.length})</div>
              <div className="bench-grid">
                {bench.length === 0 && <div className="bench-empty">All units placed.</div>}
                {bench.map((u, i) => (
                  <div
                    key={`${u.ownedId}-${i}`}
                    className={`bench-slot ${selectedBenchIdx === i ? "selected" : ""}`}
                    onClick={() => setSelectedBenchIdx(selectedBenchIdx === i ? null : i)}
                    title={`${u.name} — ${u.skill}`}
                  >
                    <div className="bench-emoji">{u.emoji}</div>
                    <div className="bench-name">{u.name}</div>
                    <div className="bench-traits">
                      {u.traits.map((t) => (
                        <span key={t} className="trait-mini" style={{ color: traitsCatalog[t]?.color }}>
                          {traitsCatalog[t]?.emoji}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bench-card">
              <div className="bench-title">💎 Items — click an item, then a placed unit</div>
              <ItemBag
                items={items}
                onSelect={setSelectedItemId}
                selectedItemId={selectedItemId}
              />
            </div>

            <div className="placement-tip">
              <p>💡 Click a bench unit, then click a cell to place. Click a placed unit to return it. Equip items by selecting an item then clicking a placed unit.</p>
              {opponentReady && <p className="alert alert-info">⚠️ Opponent is ready!</p>}
            </div>
          </div>
        </div>
      )}

      {/* WAITING */}
      {phase === PHASES.WAITING && (
        <div className="card matchmaking-card">
          <div className="spinner" />
          <p className="status-msg">⏳ Waiting for battle to start…</p>
          {opponent && <p>{opponentReady ? `${opponent.username} is ready` : `Waiting for ${opponent.username}…`}</p>}
        </div>
      )}

      {/* BATTLE */}
      {phase === PHASES.BATTLE && (
        <div className="battle-grid">
          <div className="battle-side">
            <TraitsPanel
              counts={battleTraits?.[side]?.counts || {}}
              active={battleTraits?.[side]?.active || {}}
              traitsCatalog={traitsCatalog}
              side={1}
            />
          </div>

          <div className="battle-arena-wrap">
            <BattleArena
              units={units}
              fxQueue={fxQueue}
              selfTeam={side}
            />
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <button className="btn btn-danger" onClick={concede}>🏳 Concede</button>
            </div>
          </div>

          <div className="battle-side">
            <TraitsPanel
              counts={battleTraits?.[side === 1 ? 2 : 1]?.counts || {}}
              active={battleTraits?.[side === 1 ? 2 : 1]?.active || {}}
              traitsCatalog={traitsCatalog}
              side={2}
            />
            <BattleLog ticks={tickHistory.slice(-20)} units={units} />
          </div>
        </div>
      )}

      {/* RESULT */}
      {phase === PHASES.RESULT && result && (
        <div className="result-modal">
          <div className={`result-card ${result.youWon ? "victory" : "defeat"}`}>
            <h1 className="result-title">
              {result.youWon ? "🏆 VICTORY" : result.walkover ? "🏳 ABANDONED" : "💀 DEFEAT"}
            </h1>
            {result.reward && (
              <div className="result-stats">
                <div className="result-stat">
                  <div className="stat-label">Gold Earned</div>
                  <div className="stat-value gold">+🪙 {result.reward.gold}</div>
                </div>
                {result.reward.mmr !== 0 && (
                  <div className="result-stat">
                    <div className="stat-label">MMR Change</div>
                    <div className={`stat-value ${result.reward.mmr >= 0 ? "win" : "lose"}`}>
                      {result.reward.mmr >= 0 ? "+" : ""}{result.reward.mmr}
                    </div>
                  </div>
                )}
                {result.user && (
                  <div className="result-stat">
                    <div className="stat-label">Total MMR</div>
                    <div className="stat-value gold">{result.user.mmr}</div>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", justifyContent: "center" }}>
              <button className="btn btn-gold" onClick={returnToLobby}>← Back to Lobby</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
