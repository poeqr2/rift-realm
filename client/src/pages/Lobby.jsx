// /client/src/pages/Lobby.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  register, login, getProfile, getCatalog, buyUnit, buyItem,
  getRecentMatches, getQuests, claimQuest, getReplay, getSeason, openSocket, getToken,
} from "../api";
import UnitCard from "../components/UnitCard";
import Quests from "../components/Quests";
import ReplayViewer from "../components/ReplayViewer";
import FriendsPanel from "../components/FriendsPanel";
import Tutorial, { shouldShowTutorial } from "../components/Tutorial";
import { play, sfx, unlock as audioUnlock, startBGM, getPrefs } from "../audio";

const DIFFICULTIES = [
  { id: "easy",      label: "Easy",       desc: "Light comp. Warm up here.",          reward: 30,  color: "#22c55e" },
  { id: "medium",    label: "Medium",     desc: "Balanced team with synergies.",      reward: 60,  color: "#3b82f6" },
  { id: "hard",      label: "Hard",       desc: "Items + bigger board, varied comp.", reward: 120, color: "#a855f7" },
  { id: "nightmare", label: "Nightmare",  desc: "Endgame composition. Brutal.",       reward: 250, color: "#f59e0b" },
];

export default function Lobby() {
  const navigate = useNavigate();
  const [token, setTokenState] = useState(() => localStorage.getItem("token"));
  const [view, setView] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState({ units: [], traits: {}, items: [], augments: [], tiers: [] });
  const [season, setSeason] = useState(null);
  const [matches, setMatches] = useState([]);
  const [quests, setQuests] = useState([]);
  const [shopMsg, setShopMsg] = useState("");
  const [tab, setTab] = useState("collection");
  const [filter, setFilter] = useState(0);
  const [replay, setReplay] = useState(null);

  const [showTutorial, setShowTutorial] = useState(false);
  const [lobbyWs, setLobbyWs] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    refreshAll();
    if (shouldShowTutorial()) setShowTutorial(true);
    // Open a lobby WS for friend notifications + invites
    audioUnlock();
    const ws = openSocket();
    wsRef.current = ws;
    setLobbyWs(ws);
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "invite") {
          play("notify");
          setIncomingInvite({
            inviteId: m.inviteId,
            from: m.from,
            accept: () => {
              ws.send(JSON.stringify({ type: "invite_respond", inviteId: m.inviteId, accept: true }));
              setIncomingInvite(null);
              navigate("/game", { state: { mode: "pvp", private: true } });
            },
            decline: () => {
              ws.send(JSON.stringify({ type: "invite_respond", inviteId: m.inviteId, accept: false }));
              setIncomingInvite(null);
            },
          });
        } else if (m.type === "match_found") {
          // Private invite created a match — jump into game
          ws.close(); wsRef.current = null;
          navigate("/game", { state: { mode: "pvp", private: true } });
          window.location.reload(); // simpler than transferring socket
        } else if (m.type === "invite_declined") {
          play("click");
        }
      } catch (_) {}
    };
    return () => { try { ws.close(); } catch (_) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-start BGM after first user interaction (login button click counts)
  useEffect(() => {
    if (!token) return;
    const prefs = getPrefs();
    if (prefs.music > 0 && !prefs.muted) {
      const t = setTimeout(() => startBGM(), 600);
      return () => clearTimeout(t);
    }
  }, [token]);

  async function refreshAll() {
    try {
      const [c, p, m, q, s] = await Promise.all([
        getCatalog(), getProfile(), getRecentMatches(), getQuests(), getSeason(),
      ]);
      setCatalog(c);
      setProfile(p);
      setMatches(m.matches || []);
      setQuests(q.quests || []);
      setSeason(s.season || null);
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem("token");
        setTokenState(null);
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    try {
      audioUnlock();
      const data = await login(username.trim(), password);
      play("matchFound");
      setTokenState(data.token);
    } catch (err) { setAuthError(err.message); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setAuthError("");
    try {
      audioUnlock();
      const data = await register(username.trim(), password);
      play("matchFound");
      setTokenState(data.token);
    } catch (err) { setAuthError(err.message); }
  }

  async function handleBuyUnit(unit) {
    setShopMsg("");
    try {
      await buyUnit(unit.id);
      sfx.pickup();
      setShopMsg(`✓ Bought ${unit.name}!`);
      // re-fetch profile authoritatively (no fake ownedId)
      const fresh = await getProfile();
      setProfile(fresh);
      setTimeout(() => setShopMsg(""), 2200);
    } catch (e) { setShopMsg(`✗ ${e.message}`); }
  }

  async function handleBuyItem(item) {
    setShopMsg("");
    try {
      await buyItem(item.id);
      sfx.pickup();
      setShopMsg(`✓ Bought ${item.name}!`);
      const fresh = await getProfile();
      setProfile(fresh);
      setTimeout(() => setShopMsg(""), 2200);
    } catch (e) { setShopMsg(`✗ ${e.message}`); }
  }

  async function handleClaim(id) {
    try {
      await claimQuest(id);
      sfx.pickup();
      const fresh = await getProfile();
      setProfile(fresh);
      const q = await getQuests();
      setQuests(q.quests || []);
    } catch (_) {}
  }

  async function viewReplay(matchId) {
    try {
      const r = await getReplay(matchId);
      setReplay(r.replay);
    } catch (_) {}
  }

  function inviteToMatch(friend) {
    if (!wsRef.current || wsRef.current.readyState !== wsRef.current.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "invite_friend", friendId: friend.id }));
    play("pickup");
  }

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

  const u = profile.user;
  const ownedUnits = profile.units;
  const ownedItems = profile.items;
  const ownedCount = (id) => ownedUnits.filter((un) => un.id === id).length;

  return (
    <div className="page lobby-page">
      {/* Header */}
      <div className="lobby-header">
        <div>
          <h1 className="lobby-title">Welcome, <span className="lobby-username">{u.username}</span></h1>
          <div className="lobby-stats">
            <span className="stat-pill" style={{ borderColor: u.tier?.color, color: u.tier?.color }}>
              <span className="stat-pill-label">Tier</span><span>{u.tier?.name || "Bronze"}</span>
            </span>
            <span className="stat-pill"><span className="stat-pill-label">MMR</span><span>⭐ {u.mmr}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Gold</span><span>🪙 {u.gold}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Wins</span><span>🏆 {u.wins}</span></span>
            <span className="stat-pill"><span className="stat-pill-label">Losses</span><span>💀 {u.losses}</span></span>
            {u.winstreak >= 2 && <span className="stat-pill" style={{ color: "var(--gold)" }}><span className="stat-pill-label">Streak</span><span>🔥 {u.winstreak}</span></span>}
            <span className="stat-pill"><span className="stat-pill-label">Bot Wins</span><span>🤖 {u.bot_wins}</span></span>
          </div>
        </div>
        {season && (
          <div className="season-pill">
            <div className="season-name">{season.name}</div>
            <div className="season-time">{Math.ceil(season.remainingMs / (1000 * 60 * 60 * 24))}d remaining</div>
          </div>
        )}
      </div>

      {/* Quick play row */}
      <div className="card glass-card play-card">
        <h2 className="section-title">⚔️ Battle</h2>
        <div className="play-options">
          <div className="play-option pvp">
            <div className="play-option-title">⚔ Ranked PvP</div>
            <div className="play-option-desc">Match against another player. Adaptive ±MMR with tier-locked K-factor.</div>
            <button className="btn btn-queue" onClick={() => { sfx.matchFound(); navigate("/game", { state: { mode: "pvp" } }); }}>
              🔍 Find Match
            </button>
          </div>
          <div className="pve-grid">
            {DIFFICULTIES.map((d) => (
              <div key={d.id} className="play-option pve" style={{ ["--diff-color"]: d.color }}>
                <div className="play-option-title" style={{ color: d.color }}>🤖 {d.label}</div>
                <div className="play-option-desc">{d.desc}</div>
                <div className="play-option-reward">Win: +🪙 {d.reward}</div>
                <button className="btn btn-primary" onClick={() => navigate("/game", { state: { mode: "pve", difficulty: d.id } })}>
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
              <button className={`tab ${tab === "friends" ? "active" : ""}`} onClick={() => setTab("friends")}>👥 Friends</button>
            </div>

            {shopMsg && <div className="alert alert-info">{shopMsg}</div>}

            {tab === "collection" && (
              <div className="tab-body">
                <h3 className="card-title">Units ({ownedUnits.length})</h3>
                {ownedUnits.length === 0 ? <p>No units yet — visit the shop.</p> : (
                  <div className="unit-grid">
                    {ownedUnits.map((un, i) => (
                      <UnitCard key={`${un.ownedId}-${i}`} unit={un} compact ownedCount={ownedCount(un.id)} traitsCatalog={catalog.traits} />
                    ))}
                  </div>
                )}
                <h3 className="card-title" style={{ marginTop: "1.5rem" }}>Items ({ownedItems.length})</h3>
                {ownedItems.length === 0 ? <p>No items yet — buy from the shop.</p> : (
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
                  {catalog.units.filter((un) => filter === 0 || un.rarity === filter).map((un) => (
                    <UnitCard key={un.id} unit={un} ownedCount={ownedCount(un.id)} traitsCatalog={catalog.traits} onBuy={handleBuyUnit} />
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
                {matches.length === 0 ? <p>No matches played yet.</p> : (
                  <div className="match-list">
                    {matches.map((m) => {
                      const won = m.winner_id === u.id;
                      const isBot = !!m.bot_difficulty;
                      const opponent = isBot ? `🤖 ${m.bot_difficulty}` : (m.player1_id === u.id ? m.p2_name : m.p1_name) || "—";
                      return (
                        <div key={m.id} className={`match-row ${won ? "win" : "loss"}`}>
                          <span className={`match-result ${won ? "win" : "loss"}`}>{won ? "WIN" : "LOSS"}</span>
                          <span className="match-vs">vs</span>
                          <span className="match-opp">{opponent}</span>
                          <span className="match-time">{new Date((m.played_at || 0) * 1000).toLocaleString()}</span>
                          <button className="btn btn-outline match-replay" onClick={() => viewReplay(m.id)}>▶ Replay</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "friends" && (
              <div className="tab-body">
                <FriendsPanel
                  friendCode={u.friend_code}
                  onInvite={inviteToMatch}
                  ws={lobbyWs}
                  lastInvite={incomingInvite}
                />
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

          {(catalog.tiers || []).length > 0 && (
            <div className="card glass-card">
              <h2 className="section-title">🏅 Rank Tiers</h2>
              <div className="tier-grid">
                {catalog.tiers.map((t) => (
                  <div key={t.name} className="tier-row" style={{ borderColor: t.color, color: t.color }}>
                    <span className="tier-name">{t.name}</span>
                    <span className="tier-range">{t.min}{t.max < 10000 ? `–${t.max}` : "+"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
