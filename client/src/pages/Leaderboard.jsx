// /client/src/pages/Leaderboard.jsx
import React, { useEffect, useState } from "react";
import { getLeaderboard } from "../api";

function rankBadge(i) {
  if (i === 0) return <span className="rank-badge rank-1">1</span>;
  if (i === 1) return <span className="rank-badge rank-2">2</span>;
  if (i === 2) return <span className="rank-badge rank-3">3</span>;
  return <span className="rank-num">{i + 1}</span>;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const data = await getLeaderboard();
      setPlayers(data.players || []);
      setUpdated(new Date());
    } catch (e) {
      setError(e.message || "Failed");
    }
    setLoading(false);
  }

  return (
    <div className="page">
      <div className="lb-header">
        <h1 className="page-title">🏆 Leaderboard</h1>
        <button className="btn btn-outline" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="spinner" /> : (
        players.length === 0 ? (
          <p>No ranked players yet. Be the first.</p>
        ) : (
          <div className="card glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>MMR</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Bot Wins</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const total = p.wins + p.losses;
                  const wr = total === 0 ? 0 : Math.round((p.wins / total) * 100);
                  return (
                    <tr key={p.id}>
                      <td>{rankBadge(i)}</td>
                      <td className="lb-name">{p.username}</td>
                      <td><span className="badge badge-gold">⭐ {p.mmr}</span></td>
                      <td><span className="badge badge-green">{p.wins}</span></td>
                      <td><span className="badge badge-red">{p.losses}</span></td>
                      <td>{p.bot_wins}</td>
                      <td>{wr}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {updated && <p style={{ textAlign: "right", color: "var(--text-muted)", fontSize: ".8rem", marginTop: ".5rem" }}>
        Updated {updated.toLocaleTimeString()}
      </p>}
    </div>
  );
}
