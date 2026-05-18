import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getProfile, logout } from "../api";

const UNIT_EMOJIS = { 1: "🐉", 2: "🗡️", 3: "🔮", 4: "🗡️", 5: "💚", 6: "🏹", 7: "🪨", 8: "💀", 9: "⚔️", 10: "🔥", 11: "🧊", 12: "🌪️" };
const UNIT_NAMES = { 1: "Dragon", 2: "Knight", 3: "Mage", 4: "Assassin", 5: "Healer", 6: "Archer", 7: "Golem", 8: "Necromancer", 9: "Valkyrie", 10: "Phoenix", 11: "IceWitch", 12: "StormLord" };

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (err) {
      setError("Failed to load profile. Are you logged in?");
    }
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const getWinRate = () => {
    if (!profile) return "0%";
    const total = (profile.wins || 0) + (profile.losses || 0);
    if (total === 0) return "0%";
    return Math.round((profile.wins / total) * 100) + "%";
  };

  const getOwnedUnits = () => {
    if (!profile || !profile.units) return [];
    if (Array.isArray(profile.units)) return profile.units;
    if (typeof profile.units === "object") return Object.values(profile.units);
    return [];
  };

  return (
    <div className="page">
      <h1 className="page-title">👤 Profile</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : profile ? (
        <>
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 className="card-title" style={{ fontSize: "1.5rem" }}>
              {profile.username || "Player"}
            </h2>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
              <div style={{ textAlign: "center", flex: 1, minWidth: "100px" }}>
                <div className="gold-counter" style={{ fontSize: "1.5rem", justifyContent: "center" }}>{profile.gold || 0}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Gold</div>
              </div>
              <div style={{ textAlign: "center", flex: 1, minWidth: "100px" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-purple)" }}>{profile.mmr || 1000}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>MMR</div>
              </div>
              <div style={{ textAlign: "center", flex: 1, minWidth: "100px" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-green)" }}>{profile.wins || 0}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Wins</div>
              </div>
              <div style={{ textAlign: "center", flex: 1, minWidth: "100px" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-red)" }}>{profile.losses || 0}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Losses</div>
              </div>
              <div style={{ textAlign: "center", flex: 1, minWidth: "100px" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--gold)" }}>{getWinRate()}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Win Rate</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3 className="card-title">🎮 Owned Units</h3>
            {getOwnedUnits().length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>No units owned yet. Buy from the shop!</p>
            ) : (
              <div className="grid-4">
                {getOwnedUnits().map((unit, i) => {
                  const id = unit.unit_id || unit.id || unit.catalogId;
                  return (
                    <div key={i} className="unit-card" style={{ cursor: "default" }}>
                      <div className="unit-icon">{UNIT_EMOJIS[id] || "❓"}</div>
                      <div className="unit-name">{UNIT_NAMES[id] || unit.name || "Unknown"}</div>
                      <div className="unit-stats">
                        <span>HP: {unit.hp || "?"}</span>
                        <span>ATK: {unit.attack || "?"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button className="btn btn-gold" onClick={fetchProfile}>🔄 Refresh Stats</button>
            <button className="btn btn-danger" onClick={handleLogout}>🚪 Logout</button>
          </div>
        </>
      ) : (
        <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
          Login to view your profile.
        </p>
      )}
    </div>
  );
}
