import React, { useState, useEffect } from "react";
import { getLeaderboard } from "../api";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getLeaderboard();
      if (Array.isArray(data)) {
        setPlayers(data);
      } else if (data.players) {
        setPlayers(data.players);
      } else {
        setPlayers([]);
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError("Failed to load leaderboard.");
    }
    setLoading(false);
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return <span className="rank-badge rank-1">1</span>;
    if (rank === 2) return <span className="rank-badge rank-2">2</span>;
    if (rank === 3) return <span className="rank-badge rank-3">3</span>;
    return <span style={{ width: "28px", display: "inline-flex", justifyContent: "center" }}>{rank}</span>;
  };

  const getWinRate = (wins, losses) => {
    const total = wins + losses;
    if (total === 0) return "0%";
    return Math.round((wins / total) * 100) + "%";
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">🏆 Leaderboard</h1>
        <button className="btn btn-outline" onClick={fetchLeaderboard} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          {players.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
              No players yet. Be the first!
            </p>
          ) : (
            <div className="card" style={{ overflow: "hidden", padding: 0 }}>
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>MMR</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.id || i}>
                      <td>{getRankBadge(i + 1)}</td>
                      <td style={{ fontWeight: 600 }}>{p.username || p.player || "Unknown"}</td>
                      <td>
                        <span className="badge badge-gold">{p.mmr || p.rating || 0}</span>
                      </td>
                      <td><span className="badge badge-green">{p.wins || 0}</span></td>
                      <td><span className="badge badge-red">{p.losses || 0}</span></td>
                      <td>{getWinRate(p.wins || 0, p.losses || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lastUpdated && (
            <p style={{ textAlign: "right", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Last updated: {lastUpdated}
            </p>
          )}
        </>
      )}
    </div>
  );
}
