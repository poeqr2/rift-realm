// /client/src/pages/Game.jsx
// Two modes: PvP (real-time via WebSocket) and PvE (REST one-shot).
// Now with: drag-and-drop placement, augment selection, scout phase,
// reconnection (sessionStorage), loadout manager, item unequip, X-button.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Board, { ROWS } from "../components/Board";
import BattleArena from "../components/BattleArena";
import BattleLog from "../components/BattleLog";
import TraitsPanel from "../components/TraitsPanel";
import ItemBag from "../components/ItemBag";
import AugmentPicker from "../components/AugmentPicker";
import LoadoutManager from "../components/LoadoutManager";
import VictoryRecap from "../components/VictoryRecap";
import { getProfile, getCatalog, openSocket, getToken, playBot } from "../api";
import { play, sfx, unlock as audioUnlock } from "../audio";

const PHASES = {
  CONNECTING: "connecting",
  AUGMENT:    "augment",
  PLACEMENT:  "placement",
  WAITING:    "waiting",
  SCOUT:      "scout",
  BATTLE:     "battle",
  RESULT:     "result",
  ERROR:      "error",
};

const SS_MATCH_KEY = "rr_active_match";

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
  const mode = location.state?.mode || "pvp";
  const difficulty = location.state?.difficulty;

  const [phase, setPhase] = useState(PHASES.CONNECTING);
  const [statusMsg, setStatusMsg] = useState("Connecting…");
  const [errorMsg, setErrorMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState({ units: [], traits: {}, items: [], augments: [] });

  // placement state
  const [board, setBoard] = useState([]);
  const [bench, setBench] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedBenchIdx, setSelectedBenchIdx] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [draggingBenchIdx, setDraggingBenchIdx] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);

  // augment
  const [augmentChoices, setAugmentChoices] = useState([]);
  const [chosenAugmentId, setChosenAugmentId] = useState(null);

  // PvP state
  const wsRef = useRef(null);
  const [matchId, setMatchId] = useState(null);
  const [side, setSide] = useState(1);
  const [opponent, setOpponent] = useState(null);
  const [opponentReady, setOpponentReady] = useState(false);
  const [placementDeadline, setPlacementDeadline] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Scout phase data
  const [scoutData, setScoutData] = useState(null); // {opponent, board}
  const [scoutCountdown, setScoutCountdown] = useState(0);

  // battle state
  const [units, setUnits] = useState([]);
  const [fxQueue, setFxQueue] = useState([]);
  const [tickHistory, setTickHistory] = useState([]);
  const [battleTraits, setBattleTraits] = useState(null);

  // result state
  const [result, setResult] = useState(null);
  const [recap, setRecap] = useState(null);
  const [recapMatchId, setRecapMatchId] = useState(null);

  // toast
  const [toast, setToast] = useState("");

  const traitsCatalog = catalog.traits || {};
  const unitById = useMemo(() => {
    const m = {}; for (const u of catalog.units) m[u.id] = u; return m;
  }, [catalog]);
  const itemById = useMemo(() => {
    const m = {}; for (const it of catalog.items) m[it.id] = it; return m;
  }, [catalog]);

  // Boot
  useEffect(() => {
    let mounted = true;
    audioUnlock();
    (async () => {
      try {
        const [c, p] = await Promise.all([getCatalog(), getProfile()]);
        if (!mounted) return;
        setCatalog(c);
        setProfile(p);
        setBench(p.units.map((u) => ({ ...u })));
        setItems(p.items.map((it) => ({ ...it })));

        if (mode === "pvp") {
          openPvP();
        } else {
          // For PvE we still want an augment picker — roll 3 client-side from catalog
          const pool = (c.augments || []).slice();
          const picks = [];
          while (picks.length < 3 && pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            picks.push(pool.splice(idx, 1)[0]);
          }
          setAugmentChoices(picks);
          setPhase(PHASES.AUGMENT);
          setStatusMsg("Pick an augment, then build your team!");
        }
      } catch (e) {
        setErrorMsg(e.message || "Failed to load");
        setPhase(PHASES.ERROR);
      }
    })();
    return () => { mounted = false; if (wsRef.current) wsRef.current.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tick for placement countdown
  useEffect(() => {
    if (!placementDeadline) return;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [placementDeadline]);

  // scout countdown
  useEffect(() => {
    if (phase !== PHASES.SCOUT) return;
    if (scoutCountdown <= 0) return;
    const t = setTimeout(() => setScoutCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, scoutCountdown]);

  function openPvP() {
    const ws = openSocket();
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: getToken() }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      handleWS(m);
    };
    ws.onclose = () => {
      if (phase !== PHASES.RESULT) setStatusMsg("Disconnected.");
    };
    ws.onerror = () => setStatusMsg("Connection error.");
  }

  function handleWS(m) {
    switch (m.type) {
      case "hello": setStatusMsg("Connecting…"); break;
      case "auth_ok":
        setStatusMsg("Searching for opponent…");
        // Do not auto-queue if rejoining — server will send rejoin_match.
        wsRef.current.send(JSON.stringify({ type: "queue_join" }));
        break;
      case "queue_status":
        setStatusMsg(m.queued ? `Queued (${m.size} waiting)…` : "Left queue.");
        break;
      case "match_found": {
        play("matchFound");
        setMatchId(m.matchId);
        setSide(m.side);
        setOpponent(m.opponent);
        setPlacementDeadline(m.deadline);
        setAugmentChoices(m.augmentChoices || []);
        setPhase(PHASES.AUGMENT);
        setStatusMsg(`Battle vs ${m.opponent.username}!`);
        try { sessionStorage.setItem(SS_MATCH_KEY, JSON.stringify({ matchId: m.matchId, side: m.side })); } catch (_) {}
        break;
      }
      case "rejoin_match": {
        setMatchId(m.matchId);
        setSide(m.side);
        // Sync to current state
        if (m.state === "battle" || m.state === "scout") setPhase(PHASES.WAITING);
        else if (m.state === "augment_select") setPhase(PHASES.AUGMENT);
        else if (m.state === "placement") setPhase(PHASES.PLACEMENT);
        setStatusMsg("Rejoined match.");
        break;
      }
      case "augment_ack":
        setChosenAugmentId(m.augmentId);
        setPhase(PHASES.PLACEMENT);
        setStatusMsg("Build your team!");
        break;
      case "opponent_ready": setOpponentReady(true); break;
      case "board_ack":
        if (m.upgrades > 0) { sfx.starUp(); showToast(`✨ ${m.upgrades} unit${m.upgrades > 1 ? "s" : ""} upgraded to 2★!`); }
        setPhase(PHASES.WAITING);
        break;
      case "scout":
        play("scout");
        setScoutData(m.opponent);
        setScoutCountdown(Math.ceil((m.duration || 4000) / 1000));
        setPhase(PHASES.SCOUT);
        break;
      case "battle_start":
        setPhase(PHASES.BATTLE);
        setBattleTraits(m.traits);
        setTickHistory([]);
        break;
      case "tick":
        setUnits(m.state || []);
        setFxQueue(m.fx || []);
        setTickHistory((cur) => [...cur, { tick: m.tick, fx: m.fx, state: m.state }]);
        break;
      case "battle_end":
        setPhase(PHASES.RESULT);
        setResult({
          winner: m.winner, youWon: m.youWon, walkover: m.walkover,
          reward: m.reward, user: m.user, selfSide: side,
        });
        setRecap(m.recap || null);
        if (m.user) setProfile((p) => ({ ...(p || {}), user: m.user }));
        try { sessionStorage.removeItem(SS_MATCH_KEY); } catch (_) {}
        break;
      case "error":
        setErrorMsg(m.error || "Server error");
        break;
      default: break;
    }
  }

  function showToast(t) {
    setToast(t);
    setTimeout(() => setToast(""), 2400);
  }

  // ── Placement helpers ──
  function placeOnCell(x, absY, benchIdxOverride = null) {
    const benchIdx = benchIdxOverride !== null ? benchIdxOverride : selectedBenchIdx;
    if (benchIdx === null) return;
    if (absY >= 2) return;
    if (board.length >= 8) return;
    if (board.find((s) => s.x === x && s.y === absY)) return;
    const benchUnit = bench[benchIdx];
    if (!benchUnit) return;
    play("click");
    setBoard((cur) => [...cur, { unitId: benchUnit.id, x, y: absY, items: [], ownedId: benchUnit.ownedId }]);
    setBench((cur) => cur.filter((_, i) => i !== benchIdx));
    setSelectedBenchIdx(null);
  }

  function removeFromBoardAt(x, absY) {
    const idx = board.findIndex((s) => s.x === x && s.y === absY);
    if (idx === -1) return;
    const slot = board[idx];
    play("click");
    setBench((cur) => [...cur, { ownedId: slot.ownedId, ...unitById[slot.unitId] }]);
    if (slot.items?.length > 0) {
      const restored = slot.items.map((iid) => ({ ownedId: undefined, ...itemById[iid] })).filter(Boolean);
      setItems((cur) => [...cur, ...restored]);
    }
    setBoard((cur) => cur.filter((_, i) => i !== idx));
  }

  function unequipItemFromUnit(boardIdx, itemPos) {
    const slot = board[boardIdx];
    if (!slot || !slot.items || itemPos >= slot.items.length) return;
    const itemId = slot.items[itemPos];
    play("click");
    const newItems = slot.items.slice(); newItems.splice(itemPos, 1);
    setBoard(board.map((s, i) => i === boardIdx ? { ...s, items: newItems } : s));
    const itDef = itemById[itemId];
    if (itDef) setItems((cur) => [...cur, { ownedId: undefined, ...itDef }]);
  }

  function handleBoardCellClick(x, absY) {
    const occIdx = board.findIndex((s) => s.x === x && s.y === absY);
    if (selectedItemId !== null && occIdx !== -1) {
      const slot = board[occIdx];
      if ((slot.items || []).length >= 2) { showToast("Max 2 items per unit"); return; }
      const itemIdx = items.findIndex((it) => it.id === selectedItemId);
      if (itemIdx === -1) return;
      play("pickup");
      const newItems = items.slice(); newItems.splice(itemIdx, 1); setItems(newItems);
      const newBoard = board.slice();
      newBoard[occIdx] = { ...slot, items: [...(slot.items || []), selectedItemId] };
      setBoard(newBoard);
      setSelectedItemId(null);
      return;
    }
    if (occIdx !== -1) {
      removeFromBoardAt(x, absY);
      return;
    }
    if (selectedBenchIdx !== null) placeOnCell(x, absY);
  }

  // Drag and drop
  function onBenchDragStart(e, idx) {
    setDraggingBenchIdx(idx);
    try { e.dataTransfer.setData("text/plain", String(idx)); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
  }
  function onBenchDragEnd() { setDraggingBenchIdx(null); setHoverCell(null); }

  function onCellDragOver(e, x, absY) {
    if (absY >= 2) return; // not your half
    if (board.find((s) => s.x === x && s.y === absY)) return;
    e.preventDefault();
    setHoverCell({ x, y: absY });
  }
  function onCellDrop(e, x, absY) {
    e.preventDefault();
    let idx = draggingBenchIdx;
    if (idx === null) {
      try { idx = Number(e.dataTransfer.getData("text/plain")); } catch (_) {}
    }
    if (idx !== null && !Number.isNaN(idx)) placeOnCell(x, absY, idx);
    setDraggingBenchIdx(null); setHoverCell(null);
  }

  function resetBoard() {
    play("click");
    const restoredUnits = board.map((s) => ({ ownedId: s.ownedId, ...unitById[s.unitId] }));
    const restoredItems = board.flatMap((s) =>
      (s.items || []).map((iid) => ({ ownedId: undefined, ...itemById[iid] })).filter(Boolean)
    );
    setBench((cur) => [...cur, ...restoredUnits]);
    setItems((cur) => [...cur, ...restoredItems]);
    setBoard([]);
    setSelectedBenchIdx(null);
    setSelectedItemId(null);
  }

  // ── Loadouts ──
  function loadFromPreset(preset) {
    if (!preset || !Array.isArray(preset)) return;
    resetBoard();
    // place each saved slot, consuming bench/items as available.
    setTimeout(() => {
      // Use functional updates to chain
      let benchCopy = profile.units.slice();
      let itemsCopy = profile.items.slice();
      const newBoard = [];
      for (const s of preset) {
        const benchIdx = benchCopy.findIndex((u) => u.id === s.unitId);
        if (benchIdx === -1) continue;
        const owned = benchCopy[benchIdx];
        benchCopy = benchCopy.filter((_, i) => i !== benchIdx);
        const slotItems = [];
        for (const iid of (s.items || [])) {
          const itIdx = itemsCopy.findIndex((it) => it.id === iid);
          if (itIdx === -1) continue;
          itemsCopy = itemsCopy.filter((_, i) => i !== itIdx);
          slotItems.push(iid);
        }
        newBoard.push({ unitId: s.unitId, x: s.x, y: s.y, items: slotItems, ownedId: owned.ownedId });
      }
      setBench(benchCopy);
      setItems(itemsCopy);
      setBoard(newBoard);
      sfx.starUp();
      showToast(`Loaded ${newBoard.length} units`);
    }, 50);
  }

  // ── Augment selection ──
  function onPickAugment(augmentId) {
    setChosenAugmentId(augmentId);
    if (mode === "pvp") {
      wsRef.current.send(JSON.stringify({ type: "pick_augment", matchId, augmentId }));
      // Move on to placement immediately; server will ack
      setPhase(PHASES.PLACEMENT);
    } else {
      setPhase(PHASES.PLACEMENT);
    }
  }

  function skipAugment() {
    setChosenAugmentId(null);
    setPhase(PHASES.PLACEMENT);
  }

  async function submitBoard() {
    if (board.length === 0) return;
    const payload = board.map((s) => ({ unitId: s.unitId, x: s.x, y: s.y, items: s.items || [] }));
    if (mode === "pvp") {
      wsRef.current.send(JSON.stringify({ type: "submit_board", matchId, board: payload }));
      return;
    }
    // PvE
    try {
      setPhase(PHASES.WAITING);
      setStatusMsg("Battle in progress…");
      const data = await playBot(difficulty, payload, chosenAugmentId);
      if (data.replay.recap) setRecap(data.replay.recap);
      setBattleTraits(data.replay.traits);
      setRecapMatchId(null);
      // Discover the matchId for share link via getRecentMatches if needed
      try {
        const rec = await fetch("/api/matches", { headers: { Authorization: `Bearer ${getToken()}` } }).then((r) => r.json());
        if (rec && rec.matches && rec.matches[0]) setRecapMatchId(rec.matches[0].id);
      } catch (_) {}

      setPhase(PHASES.BATTLE);
      const ticks = data.replay.ticks || [];
      setTickHistory([]);
      let i = 0;
      const step = () => {
        if (i >= ticks.length) {
          setPhase(PHASES.RESULT);
          setResult({
            winner: data.winner, youWon: data.youWon, reward: data.reward, user: data.user, selfSide: 1,
          });
          if (data.user) setProfile((p) => ({ ...(p || {}), user: data.user }));
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
    try { sessionStorage.removeItem(SS_MATCH_KEY); } catch (_) {}
    navigate("/");
  }

  function playAgain() {
    if (mode === "pvp") {
      // requeue
      setResult(null); setRecap(null);
      navigate("/game", { state: { mode: "pvp" }, replace: true });
      window.location.reload();
    } else {
      setResult(null); setRecap(null);
      // Re-init by reloading
      window.location.reload();
    }
  }

  // ── Derived ──
  const liveTraits = useMemo(
    () => computeTraits(board, unitById, traitsCatalog),
    [board, unitById, traitsCatalog]
  );

  const placementUnits = useMemo(() => {
    return board.map((s, i) => {
      const u = unitById[s.unitId];
      const itemDescs = (s.items || []).map((iid) => itemById[iid]).filter(Boolean);
      // Detect if this would auto-promote to 2-star locally (visual only — server is authoritative)
      const sameCount = board.filter((b) => b.unitId === s.unitId).length;
      const willStar = sameCount >= 3;
      return {
        uid: -100 - i,
        team: 1,
        catalogId: u.id,
        name: willStar ? `${u.name} ★` : u.name,
        emoji: u.emoji, traits: u.traits,
        x: s.x, y: s.y,
        hp: u.hp, maxHp: u.hp, mana: u.manaStart, maxMana: u.maxMana,
        attack: u.attack, alive: true,
        items: itemDescs.map((it) => ({ id: it.id, name: it.name, emoji: it.emoji })),
        shield: 0, star: willStar ? 2 : 1,
      };
    });
  }, [board, unitById, itemById]);

  const remainingPlacement = placementDeadline ? Math.max(0, Math.ceil((placementDeadline - now) / 1000)) : null;

  const augmentName = useMemo(() => {
    const a = (catalog.augments || []).find((x) => x.id === chosenAugmentId);
    return a ? a.name : null;
  }, [chosenAugmentId, catalog]);

  // ── Render branches ──
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

  if (phase === PHASES.AUGMENT) {
    return (
      <div className="page game-page">
        <div className="game-header">
          <h1 className="page-title">⚡ Augment Phase</h1>
          {opponent && (
            <div className="game-header-meta">
              <span className="badge badge-red">vs {opponent.username} ({opponent.mmr})</span>
            </div>
          )}
        </div>
        <AugmentPicker
          choices={augmentChoices}
          selectedId={chosenAugmentId}
          onPick={onPickAugment}
        />
        <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem", gap: "1rem" }}>
          <button className="btn btn-outline" onClick={skipAugment}>Skip</button>
          <button className="btn btn-danger" onClick={concede}>🏳 Forfeit</button>
        </div>
      </div>
    );
  }

  if (phase === PHASES.SCOUT && scoutData) {
    // Render opponent's board for the scout duration
    const scoutBoardUnits = (scoutData.board || []).map((s, i) => {
      const u = unitById[s.unitId]; if (!u) return null;
      return {
        uid: 9000 + i, team: 2, catalogId: u.id,
        name: s.star === 2 ? `${u.name} ★` : u.name, emoji: u.emoji, traits: u.traits,
        x: s.x, y: s.y, hp: u.hp, maxHp: u.hp, mana: u.manaStart, maxMana: u.maxMana,
        attack: u.attack, alive: true, items: (s.items || []).map((iid) => itemById[iid]).filter(Boolean),
        shield: 0, star: s.star || 1,
      };
    }).filter(Boolean);
    return (
      <div className="page game-page">
        <div className="game-header">
          <h1 className="page-title">🔭 Scouting {scoutData.username}</h1>
          <div className="game-header-meta">
            <span className="badge badge-gold">⏱ {scoutCountdown}s</span>
          </div>
        </div>
        <div className="scout-wrap">
          <Board units={scoutBoardUnits} selfTeam={1} badge={`Enemy comp · ${scoutData.username}`} badgeColor="#ef4444" />
        </div>
      </div>
    );
  }

  return (
    <div className="page game-page">
      {toast && <div className="toast toast-info">{toast}</div>}
      <div className="game-header">
        <h1 className="page-title">
          {mode === "pvp" ? "⚔️ Ranked Battle" : `🤖 PvE — ${difficulty?.toUpperCase()}`}
        </h1>
        <div className="game-header-meta">
          {opponent && <span className="badge badge-red">vs {opponent.username} ({opponent.mmr})</span>}
          {augmentName && <span className="badge badge-purple">⚡ {augmentName}</span>}
          {profile?.user && <span className="badge badge-gold">🪙 {profile.user.gold}</span>}
          <span className={`badge ${phase === PHASES.BATTLE ? "badge-red" : "badge-purple"}`}>
            {phase.toUpperCase()}
          </span>
          {phase === PHASES.PLACEMENT && remainingPlacement !== null && (
            <span className="badge badge-gold">⏱ {remainingPlacement}s</span>
          )}
        </div>
      </div>

      {phase === PHASES.PLACEMENT && (
        <div className="placement-grid">
          <div className="placement-left">
            <TraitsPanel
              counts={liveTraits.counts} active={liveTraits.active}
              traitsCatalog={traitsCatalog} side={1}
            />
            {profile && (
              <div className="card glass-card" style={{ marginTop: "1rem" }}>
                <h3 className="card-title">💾 Loadouts</h3>
                <LoadoutManager
                  loadouts={profile.loadouts || []}
                  currentBoard={board}
                  onLoad={loadFromPreset}
                  onUpdated={(loadouts) => setProfile((p) => ({ ...p, loadouts }))}
                />
              </div>
            )}
          </div>

          <div className="placement-center">
            <PlacementBoard
              units={placementUnits}
              onCellClick={handleBoardCellClick}
              onItemClick={(boardIdx, itemPos) => unequipItemFromUnit(boardIdx, itemPos)}
              onCellDragOver={onCellDragOver}
              onCellDrop={onCellDrop}
              onRemoveAt={removeFromBoardAt}
              hoverCell={hoverCell}
              selfTeam={1}
              selectedItemId={selectedItemId}
              boardSlots={board}
            />
            <div className="placement-actions">
              <button className="btn btn-gold" disabled={board.length === 0} onClick={submitBoard}>
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
                    className={`bench-slot ${selectedBenchIdx === i ? "selected" : ""} ${draggingBenchIdx === i ? "dragging" : ""}`}
                    draggable
                    onDragStart={(e) => onBenchDragStart(e, i)}
                    onDragEnd={onBenchDragEnd}
                    onClick={() => { play("click"); setSelectedBenchIdx(selectedBenchIdx === i ? null : i); }}
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
              <ItemBag items={items} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
            </div>

            <div className="placement-tip">
              <p>💡 Drag a bench unit onto a cell, or click both. Click a placed unit to remove. Click an item dot on a placed unit to unequip.</p>
              {opponentReady && <p className="alert alert-info">⚠️ Opponent is ready!</p>}
            </div>
          </div>
        </div>
      )}

      {phase === PHASES.WAITING && (
        <div className="card matchmaking-card">
          <div className="spinner" />
          <p className="status-msg">⏳ Waiting for battle to start…</p>
          {opponent && <p>{opponentReady ? `${opponent.username} is ready` : `Waiting for ${opponent.username}…`}</p>}
        </div>
      )}

      {phase === PHASES.BATTLE && (
        <div className="battle-grid">
          <div className="battle-side">
            <TraitsPanel
              counts={battleTraits?.[side]?.counts || {}}
              active={battleTraits?.[side]?.active || {}}
              traitsCatalog={traitsCatalog} side={1}
            />
          </div>

          <div className="battle-arena-wrap">
            <BattleArena units={units} fxQueue={fxQueue} selfTeam={side} />
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <button className="btn btn-danger" onClick={concede}>🏳 Concede</button>
            </div>
          </div>

          <div className="battle-side">
            <TraitsPanel
              counts={battleTraits?.[side === 1 ? 2 : 1]?.counts || {}}
              active={battleTraits?.[side === 1 ? 2 : 1]?.active || {}}
              traitsCatalog={traitsCatalog} side={2}
            />
            <BattleLog ticks={tickHistory.slice(-20)} units={units} />
          </div>
        </div>
      )}

      {phase === PHASES.RESULT && result && (
        <VictoryRecap
          result={result}
          recap={recap}
          augmentName={augmentName}
          matchId={recapMatchId}
          onClose={returnToLobby}
          onPlayAgain={playAgain}
        />
      )}
    </div>
  );
}

// Wraps Board with drag-drop overlay and per-cell dropzones / item dot clickability.
function PlacementBoard({
  units, onCellClick, onItemClick, onCellDragOver, onCellDrop, onRemoveAt, hoverCell, selfTeam, selectedItemId, boardSlots,
}) {
  // We render Board to keep grid math consistent, then layer dropzone divs on top.
  return (
    <div className="placement-board-wrap">
      <Board units={units} selfTeam={selfTeam} onCellClick={onCellClick} badge="⚔ Your Side" badgeColor="#a78bfa" />
      <div className="dropzones">
        {Array.from({ length: 4 }, (_, ry) =>
          Array.from({ length: 5 }, (_, rx) => {
            const dispY = ry;
            const absY = selfTeam === 1 ? dispY : (3 - dispY);
            const playerHalf = absY < 2;
            const isHover = hoverCell && hoverCell.x === rx && hoverCell.y === absY;
            const occBoardIdx = boardSlots.findIndex((s) => s.x === rx && s.y === absY);
            const isOccupied = occBoardIdx !== -1;
            return (
              <div
                key={`dz-${rx}-${ry}`}
                className={`dropzone ${playerHalf ? "my-half" : "enemy-half"} ${isHover ? "hover" : ""} ${isOccupied ? "occupied" : ""}`}
                style={{
                  left: rx * 82 + 4, top: ry * 82 + 4,
                  width: 78, height: 78,
                }}
                onDragOver={(e) => onCellDragOver(e, rx, absY)}
                onDrop={(e) => onCellDrop(e, rx, absY)}
                onClick={() => onCellClick(rx, absY)}
              >
                {isOccupied && (
                  <>
                    <button
                      className="cell-x-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveAt(rx, absY); }}
                      title="Remove"
                    >×</button>
                    <CellItems
                      slot={boardSlots[occBoardIdx]}
                      onItemClick={(pos) => onItemClick(occBoardIdx, pos)}
                    />
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CellItems({ slot, onItemClick }) {
  if (!slot.items || slot.items.length === 0) return null;
  return (
    <div className="cell-item-row">
      {slot.items.map((iid, i) => (
        <button
          key={i}
          className="cell-item-pill"
          onClick={(e) => { e.stopPropagation(); onItemClick(i); }}
          title="Click to unequip"
        >×</button>
      ))}
    </div>
  );
}
