// /root/rift-realm/client/src/api.js

const BASE_URL = "/api";

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function register(username, password) {
  const res = await fetch(`${BASE_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await handleResponse(res);
  if (data.token) localStorage.setItem("token", data.token);
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await handleResponse(res);
  if (data.token) localStorage.setItem("token", data.token);
  return data;
}

export function logout() {
  localStorage.removeItem("token");
}

export async function getUnits() {
  const res = await fetch(`${BASE_URL}/units`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function buyUnit(unitId) {
  const res = await fetch(`${BASE_URL}/units/buy`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ unitId }),
  });
  return handleResponse(res);
}

export async function getMyUnits() {
  const res = await fetch(`${BASE_URL}/my-units`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function getLeaderboard() {
  const res = await fetch(`${BASE_URL}/leaderboard`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function getProfile(token) {
  const res = await fetch(`${BASE_URL}/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}
