// /client/src/pages/Profile.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProfile, getRecentMatches, getCatalog, logout } from "../api";

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [catalog, setCatalog] = useState({ units: [], traits: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true); setError("");
    try {
      const [p, m, c] = await Promise.all([getProfile(), getRecentMatches(), getCatalog()]);
      setProfile(p); setMatches(m.matches || []); setCatalog(c);
    } catch (err) {
      if (err.status === 401) navigate("/");
      else setError(err.message || "Failed to load");
    }
    setLoading(false);
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!profile) return null;

  const u = profile.user;
  const total = u.wins + u.losses;
  const winRate = total === 0 ? 0 : Math.round((u.wins / total) * 100);
  const traitsCatalog = catalog.traits || {};

  // Tally traits across owned collection
  const traitTally = {};
  for (const ou of profile.units) {
    for (const t of ou.traits || []) traitTally[t] = (traitTally[t] || 0) + 1;
  }

  return (
    <div className="page">
      <div className="profile-header">
        <h1 className="page-title">👤 {u.username}</h1>
        <button className="btn btn-danger" onClick={handleLogout}>🚪 Logout</button>
      </div>

      <div className="card glass-card">
        <div className="profile-stat-row">
          <div className="stat-block">
            <div className="stat-block-label">MMR</div>
            <div className="stat-block-value gold">{u.mmr}</div>
          </div>
          <div className="stat-block">
            <div className="stat-block-label">Gold</div>
            <div className="stat-block-value gold">🪙 {u.gold}</div>
          </div>
          <div className="stat-block">
            <div className="stat-block-label">Wins</div>
            <div className="stat-block-value win">{u.wins}</div>
          </div>
          <div className="stat-block">
            <div className="stat-block-label">Losses</div>
            <div className="stat-block-value lose">{u.losses}</div>
          </div>
          <div className="stat-block">
            <div className="stat-block-label">Bot Wins</div>
            <div className="stat-block-value">{u.bot_wins}</div>
          </div>
          <div className="stat-block">
            <div className="stat-block-label">Win Rate</div>
            <div className="stat-block-value gold">{winRate}%</div>
          </div>
        </div>
      </div>

      <div className="card glass-card">
        <h2 className="section-title">Trait Diversity</h2>
        <div className="trait-tally">
          {Object.entries(traitTally).map(([n, c]) => {
            const def = traitsCatalog[n];
            return (
              <div key={n} className="trait-tally-row" style={{ ["--c"]: def?.color || "#a78bfa" }}>
                <span>{def?.emoji} {n}</span>
                <span className="trait-tally-count">×{c}</span>
              </div>
            );
          })}
          {Object.keys(traitTally).length === 0 && <p>No traits in your collection yet.</p>}
        </div>
      </div>

      <div className="card glass-card">
        <h2 className="section-title">Recent Matches</h2>
        {matches.length === 0 ? (
          <p>No matches yet — go play!</p>
        ) : (
          <div className="match-list">
            {matches.map((m) => {
              const won = m.winner_id === u.id;
              const isBot = !!m.bot_difficulty;
              const opp = isBot ? `🤖 ${m.bot_difficulty}` : (m.player1_id === u.id ? m.p2_name : m.p1_name) || "—";
              return (
                <div key={m.id} className={`match-row ${won ? "win" : "loss"}`}>
                  <span className={`match-result ${won ? "win" : "loss"}`}>{won ? "WIN" : "LOSS"}</span>
                  <span className="match-vs">vs</span>
                  <span className="match-opp">{opp}</span>
                  <span className="match-time">{new Date((m.played_at || 0) * 1000).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
