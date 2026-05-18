// /root/rift-realm/client/src/pages/Lobby.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { register, login, getUnits, buyUnit } from "../api";
import UnitCard from "../components/UnitCard";

export default function Lobby() {
  const navigate = useNavigate();

  // Auth state
  const [view, setView] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Profile state (post-auth)
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [gold, setGold] = useState(0);
  const [mmr, setMmr] = useState(0);
  const [usernameDisplay, setUsernameDisplay] = useState("");
  const [ownedUnits, setOwnedUnits] = useState([]);
  const [shopUnits, setShopUnits] = useState([]);
  const [shopError, setShopError] = useState("");
  const [buyMessage, setBuyMessage] = useState("");

  // Matchmaking state
  const [ws, setWs] = useState(null);
  const [searching, setSearching] = useState(false);
  const [matchError, setMatchError] = useState("");

  // ── Fetch profile + shop data after auth ──────────────────────────────────
  const fetchProfile = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) return;
    try {
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (data.error) return;
      setGold(data.gold ?? 0);
      setMmr(data.mmr ?? 0);
      setUsernameDisplay(data.username ?? "");
      setOwnedUnits(data.units ?? []);
    } catch (_) {}
  }, []);

  const fetchShop = useCallback(async () => {
    try {
      const units = await getUnits();
      if (Array.isArray(units)) setShopUnits(units);
    } catch (_) {
      setShopError("Failed to load shop.");
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchProfile();
      fetchShop();
    }
  }, [token, fetchProfile, fetchShop]);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    const data = await login(username, password);
    if (data.token) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
    } else {
      setAuthError(data.error ?? "Login failed.");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");
    const regData = await register(username, password);
    if (regData.error) {
      setAuthError(regData.error);
      return;
    }
    // Auto-login after register
    const loginData = await login(username, password);
    if (loginData.token) {
      localStorage.setItem("token", loginData.token);
      setToken(loginData.token);
    } else {
      setAuthError(loginData.error ?? "Auto-login failed. Please log in manually.");
    }
  };

  // ── Shop handler ──────────────────────────────────────────────────────────
  const handleBuy = async (unit) => {
    setBuyMessage("");
    setShopError("");
    const data = await buyUnit(unit.id);
    if (data.error) {
      setShopError(data.error);
    } else {
      setBuyMessage(`Bought ${unit.name}!`);
      // Refresh gold + owned units
      await fetchProfile();
      setTimeout(() => setBuyMessage(""), 2500);
    }
  };

  // ── Matchmaking ───────────────────────────────────────────────────────────
  const handleFindMatch = () => {
    setMatchError("");
    const socket = new WebSocket("ws://localhost:3001");

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "find" }));
      setSearching(true);
    });

    socket.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (msg.type === "matched") {
        setSearching(false);
        navigate("/game", { state: { matchData: msg, ws: socket } });
      } else if (msg.type === "error") {
        setMatchError(msg.message ?? "Matchmaking error.");
        setSearching(false);
        socket.close();
        setWs(null);
      }
    });

    socket.addEventListener("close", () => {
      setSearching(false);
      setWs(null);
    });

    socket.addEventListener("error", () => {
      setMatchError("WebSocket connection failed.");
      setSearching(false);
      setWs(null);
    });

    setWs(socket);
  };

  const handleCancelSearch = () => {
    if (ws) {
      ws.close();
    }
    setSearching(false);
    setWs(null);
    setMatchError("");
  };

  // ── Render: unauthenticated ───────────────────────────────────────────────
  if (!token) {
    return (
      <div className="page" style={{ maxWidth: 420, paddingTop: "4rem" }}>
        <h1 className="page-title">⚔️ Rift Realm</h1>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.5rem" }}>
          <button
            className={view === "login" ? "btn-primary" : "btn-danger"}
            style={{ flex: 1, opacity: view === "login" ? 1 : 0.5 }}
            onClick={() => { setView("login"); setAuthError(""); }}
          >
            Login
          </button>
          <button
            className={view === "register" ? "btn-primary" : "btn-danger"}
            style={{ flex: 1, opacity: view === "register" ? 1 : 0.5 }}
            onClick={() => { setView("register"); setAuthError(""); }}
          >
            Register
          </button>
        </div>

        <div className="card">
          <form onSubmit={view === "login" ? handleLogin : handleRegister}>
            <div className="form-group">
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
                className="form-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="form-input"
                type="password"
                autoComplete={view === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {authError && <p className="error-msg">{authError}</p>}

            <button
              className="btn-primary"
              type="submit"
              style={{ width: "100%", marginTop: ".5rem" }}
            >
              {view === "login" ? "Login" : "Register"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: authenticated ─────────────────────────────────────────────────
  return (
    <div className="page">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>⚔️ Rift Realm</h1>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ color: "#c4b5fd", fontWeight: 600 }}>
            👤 {usernameDisplay}
          </span>
          <span className="gold-counter">🪙 {gold}</span>
          <span
            style={{
              background: "#1a1a2e",
              border: "1px solid #7c3aed44",
              borderRadius: 20,
              padding: ".3rem .85rem",
              color: "#a78bfa",
              fontWeight: 700,
            }}
          >
            ⭐ {mmr} MMR
          </span>
          <button
            className="btn-primary"
            style={{ fontSize: ".85rem", padding: ".4rem 1rem" }}
            onClick={() => navigate("/leaderboard")}
          >
            🏆 Leaderboard
          </button>
          <button
            className="btn-primary"
            style={{ fontSize: ".85rem", padding: ".4rem 1rem" }}
            onClick={() => navigate("/profile")}
          >
            👤 Profile
          </button>
        </div>
      </div>

      {/* Matchmaking */}
      <div className="card" style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h2 className="section-title">Matchmaking</h2>
        {matchError && <p className="error-msg" style={{ marginBottom: ".75rem" }}>{matchError}</p>}
        {!searching ? (
          <button className="btn-queue" onClick={handleFindMatch}>
            ⚔️ Find Match
          </button>
        ) : (
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center" }}>
            <button className="btn-queue searching-pulse" disabled>
              🔍 Searching…
            </button>
            <button className="btn-danger" onClick={handleCancelSearch}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Shop */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <h2 className="section-title">🛒 Shop</h2>
        {shopError && <p className="error-msg">{shopError}</p>}
        {buyMessage && <p className="success-msg">{buyMessage}</p>}
        {shopUnits.length === 0 ? (
          <p style={{ color: "#555" }}>Loading units…</p>
        ) : (
          <div className="unit-grid">
            {shopUnits.map((unit) => (
              <UnitCard key={unit.id} unit={unit} onBuy={handleBuy} />
            ))}
          </div>
        )}
      </div>

      {/* Owned units */}
      <div className="card">
        <h2 className="section-title">
          🗡️ My Units{" "}
          <span
            style={{
              fontSize: ".85rem",
              color: "#a0a0c0",
              fontWeight: 400,
            }}
          >
            ({ownedUnits.length} owned)
          </span>
        </h2>
        {ownedUnits.length === 0 ? (
          <p style={{ color: "#555" }}>No units yet. Buy some from the shop!</p>
        ) : (
          <div className="unit-grid">
            {ownedUnits.map((unit, i) => (
              <UnitCard key={`${unit.id}-${i}`} unit={unit} readonly />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
