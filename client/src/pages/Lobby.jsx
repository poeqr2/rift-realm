// /client/src/pages/Lobby.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  register, login, getProfile, getCatalog, buyUnit, buyItem,
  getRecentMatches, getQuests, claimQuest, getReplay,
} from "../api";
import UnitCard from "../components/UnitCard";
import Quests from "../components/Quests";
import ReplayViewer from "../components/ReplayViewer";

const DIFFICULTIES = [
  { id: "easy",      label: "Easy",       desc: "5 basic units. Good for warm-ups.", reward: 30,  color: "#22c55e" },
  { id: "medium",    label: "Medium",     desc: "Balanced team with synergies.",     reward: 60,  color: "#3b82f6" },
  { id: "hard",      label: "Hard",       desc: "Strong items + 7 units.",           reward: 120, color: "#a855f7" },
  { id: "nightmare", label: "Nightmare",  desc: "Endgame composition. Brutal.",      reward: 250, color: "#f59e0b" },
];

export default function Lobby() {
  const navigate = useNavigate();

  const [token, setTokenState] = useState(() => localStorage.getItem("token"));
  const [view, setView] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState({ units: [], traits: {}, items: [] });
  const [matches, setMatches] = useState([]);
  const [quests, setQuests] = useState([]);
  const [shopMsg, setShopMsg] = useState("");
  const [tab, setTab] = useState("collection"); // collection | shop | history | quests
  const [filter, setFilter] = useState(0); // rarity filter for shop, 0 = all
  const [replay, setReplay] = useState(null);

  useEffect(() => {
    if (!token) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function refreshAll() {
    try {
      const [c, p, m, q] = await Promise.all([
        getCatalog(), getProfile(), getRecentMatches(), getQuests(),
      ]);
      setCatalog(c);
      setProfile(p);
      setMatches(m.matches || []);
      setQuests(q.quests || []);
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem("token");
        setTokenState(null);
      }
    }
  }

  // ── Auth ──
  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    try {
      const data = await login(username.trim(), password);
      setTokenState(data.token);
    } catch (err) { setAuthError(err.message); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setAuthError("");
    try {
      const data = await register(username.trim(), password);
      setTokenState(data.token);
    } catch (err) { setAuthError(err.message); }
  }

  // ── Shop ──
  async function handleBuyUnit(unit) {
    setShopMsg("");
    try {
      const r = await buyUnit(unit.id);
      setShopMsg(`✓ Bought ${unit.name}!`);
      setProfile((p) => ({ ...p, user: r.user, units: [...p.units, { ownedId: Date.now(), ...unit }] }));
      setTimeout(() => setShopMsg(""), 2500);
    } catch (e) { setShopMsg(`✗ ${e.message}`); }
  }

  async function handleBuyItem(item) {
    setShopMsg("");
    try {
      const r = await buyItem(item.id);
      setShopMsg(`✓ Bought ${item.name}!`);
      setProfile((p) => ({ ...p, user: r.user, items: [...p.items, { ownedId: Date.now(), ...item }] }));
      setTimeout(() => setShopMsg(""), 2500);
    } catch (e) { setShopMsg(`✗ ${e.message}`); }
  }

  async function handleClaim(id) {
    try {
      const r = await claimQuest(id);
      setProfile((p) => ({ ...p, user: r.user }));
      const q = await getQuests();
      setQuests(q.quests || []);
    } catch (e) { /* ignore */ }
  }

  async function viewReplay(matchId) {
    try {
      const r = await getReplay(matchId);
      setReplay(r.replay);
    } catch (_) {}
  }

  // ── Auth view ──
  if (!token) {
    return (
      <div className="page auth-page">
        <div className="auth-hero">
          <h1 className="auth-title glow-text">⚔️ Rift Realm</h1>
          <p className="auth-subtitle">An auto-battler of traits, items, and tactics.</p>
        </div>
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={`auth-tab ${view === "login" ? "active" : ""}`} onClick={() => { setView("login"); setAuthError(""); }}>Login</button>
            <button className={`auth-tab ${view === "register" ? "active" : ""}`} onClick={() => { setView("register"); setAuthError(""); }}>Register</button>
          </div>
          <form onSubmit={view === "login" ? handleLogin : handleRegister}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" autoComplete="username"
                     value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" autoComplete={view === "login" ? "current-password" : "new-password"}
                     value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {authError && <div className="alert alert-error">{authError}</div>}
            <button className="btn btn-gold" type="submit" style={{ width: "100%" }}>
              {view === "login" ? "Enter the Rift" : "Forge Account"}
            </button>
          </form>
          <p className="auth-footer">
            {view === "login" ? "New here? " : "Have an account? "}
            <button className="link-btn" onClick={() => setView(view === "login" ? "register" : "login")}>
              {view === "login" ? "Create one" : "Login"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="page"><div className="spinner" /></div>;
  }

  const user = profile.user;
  const ownedUnits = profile.units;
  const ownedItems = profile.items;
  const ownedCount = (id) => ownedUnits.filter((u) => u.id === id).length;

  // ── Authenticated view ──
  return (
    <div className="page lobby-page">
      {/* Header banner */}
      <div className="lobby-header">
        <div>
          <h1 className="lobby-title">Welcome, <span className="lobby-username">{user.username}</span></h1>
          <div className="lobby-stats">
            <span className="stat-pill"><span className="stat-pill-label">MMR</span><span>⭐ {user.mmr}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Gold</span><span>🪙 {user.gold}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Wins</span><span>🏆 {user.wins}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Losses</span><span>💀 {user.losses}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Bot Wins</span><span>🤖 {user.bot_wins}</span></span>
          </div>
        </div>
      </div>

      {/* Quick play row */}
      <div className="card glass-card play-card">
        <h2 className="section-title">⚔️ Battle</h2>
        <div className="play-options">
          <div className="play-option pvp">
            <div className="play-option-title">⚔ Ranked PvP</div>
            <div className="play-option-desc">Match against another player. +25/-15 MMR.</div>
            <button className="btn btn-queue" onClick={() => navigate("/game", { state: { mode: "pvp" } })}>
              🔍 Find Match
            </button>
          </div>
          <div className="pve-grid">
            {DIFFICULTIES.map((d) => (
              <div key={d.id} className="play-option pve" style={{ ["--diff-color"]: d.color }}>
                <div className="play-option-title" style={{ color: d.color }}>🤖 {d.label}</div>
                <div className="play-option-desc">{d.desc}</div>
                <div className="play-option-reward">Win: +🪙 {d.reward}</div>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate("/game", { state: { mode: "pve", difficulty: d.id } })}
                >
                  Fight
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lobby-grid">
        <div className="lobby-main">
          <div className="card glass-card">
            <div className="tabs">
              <button className={`tab ${tab === "collection" ? "active" : ""}`} onClick={() => setTab("collection")}>🎒 Collection</button>
              <button className={`tab ${tab === "shop" ? "active" : ""}`} onClick={() => setTab("shop")}>🛒 Shop</button>
              <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>📜 History</button>
            </div>

            {shopMsg && <div className="alert alert-info">{shopMsg}</div>}

            {tab === "collection" && (
              <div className="tab-body">
                <h3 className="card-title">Units ({ownedUnits.length})</h3>
                {ownedUnits.length === 0 ? (
                  <p>No units yet — visit the shop.</p>
                ) : (
                  <div className="unit-grid">
                    {ownedUnits.map((u, i) => (
                      <UnitCard key={`${u.ownedId}-${i}`} unit={u} compact ownedCount={ownedCount(u.id)} traitsCatalog={catalog.traits} />
                    ))}
                  </div>
                )}

                <h3 className="card-title" style={{ marginTop: "1.5rem" }}>Items ({ownedItems.length})</h3>
                {ownedItems.length === 0 ? (
                  <p>No items yet — buy from the shop.</p>
                ) : (
                  <div className="items-grid">
                    {ownedItems.map((it, i) => (
                      <div key={`${it.ownedId}-${i}`} className="item-card" title={it.desc}>
                        <span className="item-emoji-big">{it.emoji}</span>
                        <div className="item-name">{it.name}</div>
                        <div className="item-desc">{it.desc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "shop" && (
              <div className="tab-body">
                <div className="rarity-filter">
                  {[0, 1, 2, 3, 4, 5].map((r) => (
                    <button key={r}
                      className={`rarity-btn ${filter === r ? "active" : ""}`}
                      onClick={() => setFilter(r)}>
                      {r === 0 ? "All" : `T${r}`}
                    </button>
                  ))}
                </div>
                <div className="unit-grid">
                  {catalog.units
                    .filter((u) => filter === 0 || u.rarity === filter)
                    .map((u) => (
                      <UnitCard
                        key={u.id}
                        unit={u}
                        ownedCount={ownedCount(u.id)}
                        traitsCatalog={catalog.traits}
                        onBuy={handleBuyUnit}
                      />
                    ))}
                </div>

                <h3 className="card-title" style={{ marginTop: "1.5rem" }}>Items</h3>
                <div className="items-grid">
                  {catalog.items.map((it) => (
                    <div key={it.id} className="item-card buyable" onClick={() => handleBuyItem(it)}>
                      <span className="item-emoji-big">{it.emoji}</span>
                      <div className="item-name">{it.name}</div>
                      <div className="item-desc">{it.desc}</div>
                      <div className="item-cost">🪙 {it.cost * 15}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "history" && (
              <div className="tab-body">
                {matches.length === 0 ? (
                  <p>No matches played yet.</p>
                ) : (
                  <div className="match-list">
                    {matches.map((m) => {
                      const won = m.winner_id === user.id;
                      const isBot = !!m.bot_difficulty;
                      const opponent = isBot
                        ? `🤖 ${m.bot_difficulty}`
                        : (m.player1_id === user.id ? m.p2_name : m.p1_name) || "—";
                      return (
                        <div key={m.id} className={`match-row ${won ? "win" : "loss"}`}>
                          <span className={`match-result ${won ? "win" : "loss"}`}>
                            {won ? "WIN" : (m.bot_won ? "LOSS" : "LOSS")}
                          </span>
                          <span className="match-vs">vs</span>
                          <span className="match-opp">{opponent}</span>
                          <span className="match-time">{new Date((m.played_at || 0) * 1000).toLocaleString()}</span>
                          <button className="btn btn-outline match-replay" onClick={() => viewReplay(m.id)}>
                            ▶ Replay
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lobby-sidebar">
          <div className="card glass-card">
            <h2 className="section-title">📋 Daily Quests</h2>
            <Quests quests={quests} onClaim={handleClaim} />
          </div>

          <div className="card glass-card">
            <h2 className="section-title">📈 Synergy Guide</h2>
            <div className="synergy-list">
              {Object.entries(catalog.traits).map(([name, def]) => (
                <div key={name} className="synergy-row" style={{ ["--c"]: def.color }}>
                  <span className="synergy-emoji">{def.emoji}</span>
                  <div>
                    <div className="synergy-name">{name}</div>
                    <div className="synergy-desc">{def.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {replay && (
        <ReplayViewer
          replay={replay}
          traitsCatalog={catalog.traits}
          selfTeam={1}
          onClose={() => setReplay(null)}
        />
      )}
    </div>
  );
}
