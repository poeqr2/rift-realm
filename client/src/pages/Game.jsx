import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Board from "../components/Board";
import BattleLog from "../components/BattleLog";

const UNITS_CATALOG = [
  { id: 1, name: "Dragon", emoji: "🐉", cost: 5, hp: 12, attack: 8, speed: 3, skill_name: "Fire Breath", skill_damage: 24 },
  { id: 2, name: "Knight", emoji: "🗡️", cost: 3, hp: 8, attack: 5, speed: 4, skill_name: "Shield Bash", skill_damage: 0 },
  { id: 3, name: "Mage", emoji: "🔮", cost: 4, hp: 5, attack: 9, speed: 6, skill_name: "Arcane Blast", skill_damage: 18 },
  { id: 4, name: "Assassin", emoji: "🗡️", cost: 3, hp: 4, attack: 10, speed: 9, skill_name: "Backstab", skill_damage: 30 },
  { id: 5, name: "Healer", emoji: "💚", cost: 3, hp: 6, attack: 2, speed: 5, skill_name: "Heal", skill_damage: -5 },
  { id: 6, name: "Archer", emoji: "🏹", cost: 2, hp: 5, attack: 6, speed: 7, skill_name: "Volley", skill_damage: 4 },
  { id: 7, name: "Golem", emoji: "🪨", cost: 4, hp: 15, attack: 3, speed: 1, skill_name: "Taunt", skill_damage: 0 },
  { id: 8, name: "Necromancer", emoji: "💀", cost: 5, hp: 6, attack: 7, speed: 5, skill_name: "Raise Dead", skill_damage: 0 },
  { id: 9, name: "Valkyrie", emoji: "⚔️", cost: 4, hp: 9, attack: 6, speed: 6, skill_name: "War Cry", skill_damage: 0 },
  { id: 10, name: "Phoenix", emoji: "🔥", cost: 5, hp: 7, attack: 7, speed: 8, skill_name: "Rebirth", skill_damage: 0 },
  { id: 11, name: "IceWitch", emoji: "🧊", cost: 4, hp: 6, attack: 7, speed: 6, skill_name: "Freeze", skill_damage: 0 },
  { id: 12, name: "StormLord", emoji: "🌪️", cost: 5, hp: 8, attack: 6, speed: 7, skill_name: "Storm", skill_damage: 3 },
];

export default function Game() {
  const location = useLocation();
  const navigate = useNavigate();
  const wsRef = useRef(null);

  const [phase, setPhase] = useState("connecting");
  const [myUnits, setMyUnits] = useState([]);
  const [opponentUnits, setOpponentUnits] = useState([]);
  const [bench, setBench] = useState([]);
  const [selectedBenchIdx, setSelectedBenchIdx] = useState(null);
  const [battleLog, setBattleLog] = useState([]);
  const [result, setResult] = useState(null);
  const [conStatus, setConStatus] = useState("Connecting...");

  useEffect(() => {
    let ws;
    if (location.state?.ws) {
      ws = location.state.ws;
      wsRef.current = ws;
      setConStatus("Connected!");
      setPhase("placing");
      const units = location.state.matchData?.units || [];
      setBench(units.map((u, i) => ({ ...UNITS_CATALOG.find(c => c.id === u), benchIdx: i })));
    } else {
      ws = new WebSocket("ws://localhost:3001");
      wsRef.current = ws;
      ws.onopen = () => {
        setConStatus("Connected!");
        ws.send(JSON.stringify({ type: "join_game" }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "game_start") {
          setPhase("placing");
          setBench((msg.units || msg.myUnits || []).map((u, i) => ({ ...UNITS_CATALOG.find(c => c.id === u), benchIdx: i })));
        }
        handleMessage(msg);
      };
      ws.onclose = () => setConStatus("Disconnected");
      ws.onerror = () => setConStatus("Connection Error");
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleMessage(msg);
    };

    return () => { if (wsRef.current && ws.readyState === WebSocket.OPEN) wsRef.current.close(); };
  }, []);

  const handleMessage = (msg) => {
    if (msg.type === "matched") {
      setPhase("placing");
      const units = msg.units || msg.myUnits || [];
      setBench(units.map((u, i) => ({ ...UNITS_CATALOG.find(c => c.id === u), benchIdx: i })));
    } else if (msg.type === "game_start") {
      setPhase("placing");
    } else if (msg.type === "your_turn" || msg.type === "placing") {
      setPhase("placing");
    } else if (msg.type === "battle_start") {
      setPhase("battle");
    } else if (msg.type === "tick" || msg.type === "battle_tick") {
      const tickEvents = msg.events || [];
      setBattleLog(prev => [...prev, { tick: msg.tick, events: tickEvents }]);
      if (msg.myUnits) setMyUnits(msg.myUnits);
      if (msg.opponentUnits) setOpponentUnits(msg.opponentUnits);
    } else if (msg.type === "battle_end" || msg.type === "end") {
      setPhase("ended");
      setResult({ winner: msg.winner, goldEarned: msg.goldEarned || 0, mmrChange: msg.mmrChange || 0 });
    } else if (msg.type === "board_placed") {
      setPhase("ready");
    } else if (msg.type === "opponent_ready") {
      // waiting
    }
  };

  const handleBoardPlace = (x, y) => {
    if (selectedBenchIdx === null || phase !== "placing") return;
    if (myUnits.length >= 5) return;
    const already = myUnits.find(u => u.x === x && u.y === y);
    if (already) return;
    const unit = bench[selectedBenchIdx];
    if (!unit) return;
    setMyUnits(prev => [...prev, { ...unit, x, y }]);
    setSelectedBenchIdx(null);
  };

  const removeFromBoard = (x, y) => {
    if (phase !== "placing") return;
    const unit = myUnits.find(u => u.x === x && u.y === y);
    if (!unit) return;
    setMyUnits(prev => prev.filter(u => !(u.x === x && u.y === y)));
  };

  const submitBoard = () => {
    if (myUnits.length < 1) return;
    setPhase("ready");
    const boardData = myUnits.map(u => ({ catalogId: u.id, x: u.x, y: u.y }));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "board", action: "ready", board: boardData }));
    }
  };

  const returnToLobby = () => navigate("/");

  const unitMap = {};
  UNITS_CATALOG.forEach(u => { unitMap[u.id] = u; });

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 className="page-title">⚔️ Battle Arena</h1>
        <span className={`badge ${phase === "battle" ? "badge-red" : phase === "ended" ? "badge-gold" : "badge-purple"}`}>
          {phase.toUpperCase()}
        </span>
      </div>

      {phase === "connecting" && (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div className="spinner" />
          <p>{conStatus}</p>
        </div>
      )}

      {(phase === "placing" || phase === "ready") && (
        <>
          <div style={{ display: "flex", gap: "2rem", justifyContent: "center", marginBottom: "1.5rem" }}>
            <div>
              <h3 style={{ textAlign: "center", color: "var(--accent-green)", marginBottom: "0.5rem" }}>⭐ Your Board</h3>
              <Board units={myUnits} isPlayer={true} onPlace={handleBoardPlace} onRemove={removeFromBoard} />
            </div>
            <div>
              <h3 style={{ textAlign: "center", color: "var(--accent-red)", marginBottom: "0.5rem" }}>⚔️ Opponent</h3>
              <Board units={opponentUnits} isPlayer={false} />
            </div>
          </div>

          {phase === "placing" && (
            <>
              <h3 style={{ color: "var(--gold)", marginBottom: "0.5rem" }}>📦 Bench — Select a unit, then click your board to place</h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "1rem" }}>
                {bench.map((unit, i) => (
                  <div
                    key={i}
                    className={`unit-card ${selectedBenchIdx === i ? "selected" : ""}`}
                    style={{ width: "100px", cursor: "pointer" }}
                    onClick={() => setSelectedBenchIdx(i)}
                  >
                    <div className="unit-icon">{unit.emoji}</div>
                    <div className="unit-name">{unit.name}</div>
                    <div className="unit-stats">
                      <span>❤️{unit.hp}</span>
                      <span>⚔️{unit.attack}</span>
                      <span>💨{unit.speed}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                <button className="btn btn-gold" onClick={submitBoard} disabled={myUnits.length < 1}>
                  ✅ Ready ({myUnits.length}/5)
                </button>
                <button className="btn btn-danger" onClick={() => { setMyUnits([]); setSelectedBenchIdx(null); }}>
                  🔄 Reset
                </button>
              </div>
            </>
          )}

          {phase === "ready" && (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div className="spinner" />
              <p style={{ color: "var(--gold)" }}>⏳ Waiting for opponent...</p>
            </div>
          )}
        </>
      )}

      {phase === "battle" && (
        <div style={{ display: "flex", gap: "2rem" }}>
          <div style={{ flex: 1 }}>
            <Board units={myUnits} isPlayer={true} />
          </div>
          <div style={{ flex: 2 }}>
            <BattleLog log={battleLog} />
          </div>
          <div style={{ flex: 1 }}>
            <Board units={opponentUnits} isPlayer={false} />
          </div>
        </div>
      )}

      {phase === "ended" && result && (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <h2 style={{ fontSize: "2.5rem", color: result.winner === "me" ? "var(--accent-green)" : "var(--accent-red)" }}>
            {result.winner === "me" ? "🏆 VICTORY!" : "💀 DEFEAT"}
          </h2>
          <p style={{ fontSize: "1.2rem", margin: "1rem 0" }}>
            Gold Earned: <span className="gold-counter">{result.goldEarned}</span>
          </p>
          <p style={{ fontSize: "1.2rem", margin: "1rem 0" }}>
            MMR: <span style={{ color: result.mmrChange >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
              {result.mmrChange >= 0 ? "+" : ""}{result.mmrChange}
            </span>
          </p>
          <button className="btn btn-gold" onClick={returnToLobby} style={{ marginTop: "1rem" }}>
            🔙 Return to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
