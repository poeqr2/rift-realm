// /client/src/pages/PublicReplay.jsx
// Watch a public replay via /replay/:token. No auth required.
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPublicReplay, getCatalog } from "../api";
import ReplayViewer from "../components/ReplayViewer";

export default function PublicReplay() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [replay, setReplay] = useState(null);
  const [catalog, setCatalog] = useState({ traits: {} });
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [r, c] = await Promise.all([getPublicReplay(token), getCatalog()]);
        setCatalog(c);
        setReplay(r.replay);
      } catch (e) { setError(e.message || "Replay not found"); }
    })();
  }, [token]);

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">📼 Replay</h1>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-outline" onClick={() => navigate("/")}>← Lobby</button>
      </div>
    );
  }
  if (!replay) {
    return <div className="page"><div className="spinner" /></div>;
  }

  return (
    <ReplayViewer
      replay={replay}
      traitsCatalog={catalog.traits}
      selfTeam={1}
      onClose={() => navigate("/")}
    />
  );
}
