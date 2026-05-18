// /projects/sandbox/rift-realm/client/src/api.js
// Thin REST client. Uses Bearer auth via localStorage token.

const BASE = "/api";

export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(t) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

function headers(extra = {}) {
  const t = getToken();
  const h = { "Content-Type": "application/json", ...extra };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function handle(res) {
  let body = {};
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const e = new Error(body.error || `HTTP ${res.status}`);
    e.status = res.status;
    e.body = body;
    throw e;
  }
  return body;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export async function register(username, password) {
  const data = await handle(await fetch(`${BASE}/register`, {
    method: "POST", headers: headers(), body: JSON.stringify({ username, password }),
  }));
  if (data.token) setToken(data.token);
  return data;
}

export async function login(username, password) {
  const data = await handle(await fetch(`${BASE}/login`, {
    method: "POST", headers: headers(), body: JSON.stringify({ username, password }),
  }));
  if (data.token) setToken(data.token);
  return data;
}

export async function logout() {
  try {
    await fetch(`${BASE}/logout`, { method: "POST", headers: headers() });
  } catch (_) {}
  setToken(null);
}

// ── Profile / Catalog ──────────────────────────────────────────────────────
export async function getProfile() {
  return handle(await fetch(`${BASE}/profile`, { headers: headers() }));
}

export async function getCatalog() {
  return handle(await fetch(`${BASE}/catalog`, { headers: headers() }));
}

// ── Shop ───────────────────────────────────────────────────────────────────
export async function buyUnit(unitId) {
  return handle(await fetch(`${BASE}/shop/buy-unit`, {
    method: "POST", headers: headers(), body: JSON.stringify({ unitId }),
  }));
}

export async function buyItem(itemId) {
  return handle(await fetch(`${BASE}/shop/buy-item`, {
    method: "POST", headers: headers(), body: JSON.stringify({ itemId }),
  }));
}

// ── Matches / Leaderboard / Quests ─────────────────────────────────────────
export async function getLeaderboard() {
  return handle(await fetch(`${BASE}/leaderboard`));
}

export async function getRecentMatches() {
  return handle(await fetch(`${BASE}/matches`, { headers: headers() }));
}

export async function getReplay(matchId) {
  return handle(await fetch(`${BASE}/matches/${matchId}/replay`, { headers: headers() }));
}

export async function getQuests() {
  return handle(await fetch(`${BASE}/quests`, { headers: headers() }));
}

export async function claimQuest(id) {
  return handle(await fetch(`${BASE}/quests/${id}/claim`, {
    method: "POST", headers: headers(),
  }));
}

// ── PvE ────────────────────────────────────────────────────────────────────
export async function playBot(difficulty, board) {
  return handle(await fetch(`${BASE}/play/bot`, {
    method: "POST", headers: headers(), body: JSON.stringify({ difficulty, board }),
  }));
}

// ── WebSocket helper ───────────────────────────────────────────────────────
export function openSocket() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host; // vite dev proxies /ws -> server
  return new WebSocket(`${proto}//${host}/ws`);
}
