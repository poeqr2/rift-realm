// /client/src/components/FriendsPanel.jsx
// Friend code display, request form, friend list with online indicator + invite-to-match.
import React, { useEffect, useState } from "react";
import { getFriends, sendFriendRequest, respondFriendRequest, removeFriend } from "../api";
import { play } from "../audio";

export default function FriendsPanel({ friendCode, onInvite, ws, lastInvite }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, []);

  // Re-fetch friends when a notification arrives
  useEffect(() => {
    if (!ws) return;
    const handler = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "friend_request" || m.type === "friend_added") {
          play("notify");
          refresh();
        }
      } catch (_) {}
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws]);

  async function refresh() {
    try {
      const data = await getFriends();
      setFriends(data.friends || []);
      setRequests(data.requests || []);
    } catch (_) {}
  }

  async function send() {
    setMsg("");
    if (!code.trim()) return;
    setBusy(true);
    try {
      await sendFriendRequest(code.trim().toUpperCase());
      play("pickup");
      setMsg("✓ Friend request sent!");
      setCode("");
    } catch (e) { setMsg("✗ " + (e.message || "failed")); }
    setBusy(false);
    setTimeout(() => setMsg(""), 2500);
  }

  async function respond(req, accept) {
    setBusy(true);
    try {
      await respondFriendRequest(req.id, accept);
      play(accept ? "pickup" : "click");
      await refresh();
    } catch (_) {}
    setBusy(false);
  }

  async function remove(f) {
    if (!confirm(`Remove ${f.username}?`)) return;
    setBusy(true);
    try {
      await removeFriend(f.id);
      play("click");
      await refresh();
    } catch (_) {}
    setBusy(false);
  }

  function copyCode() {
    if (!friendCode) return;
    try { navigator.clipboard.writeText(friendCode); play("pickup"); setMsg("Code copied!"); setTimeout(() => setMsg(""), 1500); } catch (_) {}
  }

  function invite(f) {
    if (!ws || ws.readyState !== ws.OPEN) { setMsg("✗ Connect to multiplayer first"); return; }
    if (!f.online) { setMsg("✗ Friend offline"); return; }
    onInvite && onInvite(f);
  }

  return (
    <div className="friends-panel">
      <div className="friends-mycode">
        <span className="mycode-label">Your code:</span>
        <code className="mycode-value">{friendCode || "—"}</code>
        <button className="btn btn-mini btn-outline" onClick={copyCode}>Copy</button>
      </div>

      <div className="friends-add">
        <input
          className="form-input"
          placeholder="Enter friend code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button className="btn btn-gold" onClick={send} disabled={busy || !code.trim()}>Add</button>
      </div>
      {msg && <div className="friends-msg">{msg}</div>}

      {requests.length > 0 && (
        <div className="friends-requests">
          <div className="friends-section-title">Pending requests</div>
          {requests.map((r) => (
            <div key={r.id} className="friend-row request">
              <span className="friend-name">{r.from_name}</span>
              <span className="friend-mmr">⭐ {r.from_mmr}</span>
              <div className="friend-actions">
                <button className="btn btn-mini btn-gold" onClick={() => respond(r, true)} disabled={busy}>Accept</button>
                <button className="btn btn-mini btn-outline" onClick={() => respond(r, false)} disabled={busy}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="friends-list">
        <div className="friends-section-title">Friends ({friends.length})</div>
        {friends.length === 0 ? (
          <div className="friends-empty">No friends yet. Share your code above!</div>
        ) : (
          friends.map((f) => (
            <div key={f.id} className="friend-row">
              <span className={`friend-status ${f.online ? "online" : "offline"}`} title={f.online ? "online" : "offline"} />
              <span className="friend-name">{f.username}</span>
              <span className="friend-tier" style={{ color: f.tier?.color }}>{f.tier?.name || "—"}</span>
              <span className="friend-mmr">⭐ {f.mmr}</span>
              <div className="friend-actions">
                <button className="btn btn-mini btn-gold" onClick={() => invite(f)} disabled={!f.online}>Invite</button>
                <button className="btn btn-mini btn-danger" onClick={() => remove(f)} disabled={busy}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      {lastInvite && (
        <div className="friends-incoming">
          <span>📨 Invite from <b>{lastInvite.from?.username}</b></span>
          <button className="btn btn-mini btn-gold" onClick={() => lastInvite.accept && lastInvite.accept()}>Accept</button>
          <button className="btn btn-mini btn-outline" onClick={() => lastInvite.decline && lastInvite.decline()}>Decline</button>
        </div>
      )}
    </div>
  );
}
