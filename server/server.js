// /projects/sandbox/rift-realm/server/server.js
// Rift Realm — REST API + WebSocket auto-battler.
// Auth via Bearer header. Persistent sessions stored in DB.

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const {
  UNITS, UNIT_BY_ID, TRAITS, ITEMS, ITEM_BY_ID,
  BOT_TEAMS, pickBotTeam, AUGMENTS, AUGMENT_BY_ID, rollAugments,
  REWARDS, BOARD,
} = require('./gamedata');
const { simulateBattle, TICKS_PER_SEC } = require('./battle');
const { runMigrations } = require('./migrations');
const { TIERS, tierOf, eloDelta } = require('./ranking');
const { rateLimitHttp, wsAllow } = require('./rateLimit');

// ─── DB + Migrations ───────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'rift_realm.db'));
db.pragma('journal_mode = WAL');
runMigrations(db);

// ─── Prepared statements ───────────────────────────────────────────────────
const Q = {
  insertUser: db.prepare('INSERT INTO users (username, password, friend_code) VALUES (?, ?, ?)'),
  findUserByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  findUserById:   db.prepare('SELECT * FROM users WHERE id = ?'),
  findUserByCode: db.prepare('SELECT * FROM users WHERE friend_code = ?'),
  publicUser: db.prepare(`
    SELECT id, username, gold, mmr, wins, losses, bot_wins, games_played,
           peak_mmr, season_id, abandons, abandons_today, abandon_day,
           winstreak, losestreak, friend_code
    FROM users WHERE id = ?
  `),
  spendGold: db.prepare('UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?'),
  addGold:   db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?'),
  applyMmr:  db.prepare('UPDATE users SET mmr = MAX(0, mmr + ?), peak_mmr = MAX(peak_mmr, mmr + ?) WHERE id = ?'),
  bumpGames: db.prepare('UPDATE users SET games_played = games_played + 1 WHERE id = ?'),
  bumpWin:   db.prepare('UPDATE users SET wins = wins + 1, winstreak = winstreak + 1, losestreak = 0 WHERE id = ?'),
  bumpLoss:  db.prepare('UPDATE users SET losses = losses + 1, losestreak = losestreak + 1, winstreak = 0 WHERE id = ?'),
  bumpBotWin:db.prepare('UPDATE users SET bot_wins = bot_wins + 1 WHERE id = ?'),
  setLastLogin: db.prepare('UPDATE users SET last_login = strftime(\'%s\',\'now\') WHERE id = ?'),

  bumpAbandon: db.prepare(`
    UPDATE users SET abandons = abandons + 1,
                     abandons_today = CASE WHEN abandon_day = ? THEN abandons_today + 1 ELSE 1 END,
                     abandon_day = ?
    WHERE id = ?
  `),

  addUnit:        db.prepare('INSERT INTO user_units (user_id, unit_id) VALUES (?, ?)'),
  ownedUnits:     db.prepare('SELECT id, unit_id FROM user_units WHERE user_id = ?'),
  removeUnitsByOwnedIds: db.prepare(
    'DELETE FROM user_units WHERE user_id = ? AND id IN (SELECT id FROM user_units WHERE user_id = ? AND unit_id = ? LIMIT ?)'
  ),

  addItem:    db.prepare('INSERT INTO user_items (user_id, item_id) VALUES (?, ?)'),
  ownedItems: db.prepare('SELECT id, item_id FROM user_items WHERE user_id = ?'),

  insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
  findSession:   db.prepare('SELECT user_id FROM sessions WHERE token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

  insertMatch: db.prepare(`
    INSERT INTO matches (player1_id, player2_id, bot_difficulty, winner_id, bot_won, replay_data, replay_token, public)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `),
  recentMatches: db.prepare(`
    SELECT m.id, m.player1_id, m.player2_id, m.bot_difficulty, m.winner_id, m.bot_won, m.played_at, m.replay_token,
           u1.username AS p1_name, u2.username AS p2_name
    FROM matches m
    LEFT JOIN users u1 ON u1.id = m.player1_id
    LEFT JOIN users u2 ON u2.id = m.player2_id
    WHERE m.player1_id = ? OR m.player2_id = ?
    ORDER BY m.id DESC LIMIT 15
  `),
  matchById:        db.prepare('SELECT * FROM matches WHERE id = ?'),
  matchByToken:     db.prepare('SELECT * FROM matches WHERE replay_token = ?'),
  setMatchPublic:   db.prepare('UPDATE matches SET public = 1 WHERE id = ? AND (player1_id = ? OR player2_id = ?)'),

  leaderboard: db.prepare(`
    SELECT id, username, mmr, wins, losses, bot_wins, games_played, peak_mmr
    FROM users ORDER BY mmr DESC, wins DESC LIMIT 25
  `),

  insertQuest: db.prepare(`
    INSERT INTO quests (user_id, quest_key, progress, target, reward_gold, day)
    VALUES (?, ?, 0, ?, ?, ?)
  `),
  questsForDay: db.prepare('SELECT * FROM quests WHERE user_id = ? AND day = ?'),
  claimQuest:   db.prepare('UPDATE quests SET claimed = 1 WHERE id = ? AND user_id = ? AND completed = 1 AND claimed = 0'),
  questById:    db.prepare('SELECT * FROM quests WHERE id = ?'),

  // Friends
  addFriend:        db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)'),
  removeFriend:     db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?'),
  myFriends:        db.prepare(`
    SELECT u.id, u.username, u.mmr, u.last_login, u.friend_code
    FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?
    ORDER BY u.username
  `),

  insertFriendReq:  db.prepare('INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)'),
  pendingFriendReqs: db.prepare(`
    SELECT fr.id, fr.from_id, u.username AS from_name, u.mmr AS from_mmr, fr.created_at
    FROM friend_requests fr JOIN users u ON u.id = fr.from_id
    WHERE fr.to_id = ? AND fr.status = 'pending' ORDER BY fr.id DESC
  `),
  friendReqById:    db.prepare('SELECT * FROM friend_requests WHERE id = ?'),
  setFriendReqStatus: db.prepare("UPDATE friend_requests SET status = ? WHERE id = ? AND to_id = ? AND status = 'pending'"),
  existingFriendReq: db.prepare("SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'"),
  isFriend:         db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?'),

  // Loadouts
  upsertLoadout: db.prepare(`
    INSERT INTO loadouts (user_id, slot, name, data, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(user_id, slot) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at
  `),
  loadouts:    db.prepare('SELECT slot, name, data, updated_at FROM loadouts WHERE user_id = ? ORDER BY slot'),
  delLoadout:  db.prepare('DELETE FROM loadouts WHERE user_id = ? AND slot = ?'),

  // Season
  currentSeason: db.prepare('SELECT * FROM seasons WHERE archived = 0 ORDER BY id DESC LIMIT 1'),
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function dayKey() {
  const d = new Date();
  return Number(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
}

function genFriendCode(username) {
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${username.slice(0, 4).toUpperCase()}-${r}`;
}

function ensureDailyQuests(userId) {
  const day = dayKey();
  const existing = Q.questsForDay.all(userId, day);
  if (existing.length >= 3) return existing;
  const pool = [
    { key: 'play_3',     target: 3, reward: 50,  desc: 'Play 3 battles' },
    { key: 'win_2',      target: 2, reward: 100, desc: 'Win 2 battles' },
    { key: 'bot_hard',   target: 1, reward: 150, desc: 'Beat a Hard or Nightmare bot' },
    { key: 'place_5',    target: 5, reward: 60,  desc: 'Place 5 different units' },
    { key: 'use_skill',  target: 5, reward: 70,  desc: 'Cast 5 unit skills' },
    { key: 'star_up_1',  target: 1, reward: 100, desc: 'Combine to a 2★ unit' },
  ];
  const taken = new Set(existing.map((x) => x.quest_key));
  const candidates = pool.filter((p) => !taken.has(p.key));
  while (existing.length < 3 && candidates.length > 0) {
    const idx = Math.floor(Math.random() * candidates.length);
    const q = candidates.splice(idx, 1)[0];
    const info = Q.insertQuest.run(userId, q.key, q.target, q.reward, day);
    existing.push(Q.questById.get(info.lastInsertRowid));
  }
  return existing;
}

function bumpQuestSafely(userId, key, n = 1) {
  const day = dayKey();
  const row = db.prepare('SELECT * FROM quests WHERE user_id = ? AND quest_key = ? AND day = ?')
    .get(userId, key, day);
  if (!row || row.completed) return;
  const newProgress = Math.min(row.target, row.progress + n);
  const completed = newProgress >= row.target ? 1 : 0;
  db.prepare('UPDATE quests SET progress = ?, completed = ? WHERE id = ?')
    .run(newProgress, completed, row.id);
}

function newSession(userId) {
  const t = uuidv4();
  Q.insertSession.run(t, userId);
  return t;
}

function authFromHeader(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const row = Q.findSession.get(m[1]);
  if (!row) return null;
  return Q.findUserById.get(row.user_id);
}

function requireAuth(req, res, next) {
  const user = authFromHeader(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

function decoratePublicUser(u) {
  if (!u) return u;
  const tier = tierOf(u.mmr);
  return { ...u, tier: { name: tier.name, color: tier.color } };
}

// Compute streak gold bonus: +10 per consecutive win, capped at +50.
// Comeback bonus on first win after losestreak >= 3: +30.
function streakBonus(user, didWin) {
  if (didWin) {
    if (user.losestreak >= 3) return 30;          // comeback
    return Math.min(50, user.winstreak * 10);     // streak (will be applied AFTER bumpWin so winstreak already incremented)
  }
  return 0;
}

// ─── 2-star upgrade resolution ─────────────────────────────────────────────
// For a player's intended board, look at their full inventory: any time they
// place 3+ copies of the same unit on the field, automatically mark one slot
// as star=2 and consume the other two copies for the duration of the battle.
// Server validation handles ownership; this just rewrites the board.
function applyStarUpgrades(board, userId) {
  // Server's authoritative ownership counts.
  const ownedCounts = {};
  for (const r of Q.ownedUnits.all(userId)) ownedCounts[r.unit_id] = (ownedCounts[r.unit_id] || 0) + 1;

  // Count placed copies per unitId
  const placedByUnit = {};
  for (let i = 0; i < board.length; i++) {
    const s = board[i];
    if (!placedByUnit[s.unitId]) placedByUnit[s.unitId] = [];
    placedByUnit[s.unitId].push(i);
  }

  let upgrades = 0;
  const result = board.map((s) => ({ ...s, star: 1 }));
  for (const [unitId, idxs] of Object.entries(placedByUnit)) {
    const uid = Number(unitId);
    if (idxs.length < 3) continue;
    if ((ownedCounts[uid] || 0) < 3) continue;
    // Pick the best-positioned copy (closest to enemy front row) as the star
    idxs.sort((a, b) => result[b].y - result[a].y);
    const keepIdx = idxs[0];
    const dropIdxs = idxs.slice(1, 3); // remove 2
    result[keepIdx].star = 2;
    // Drop the other two (filter later)
    for (const di of dropIdxs) result[di]._drop = true;
    upgrades += 1;
  }
  return { board: result.filter((s) => !s._drop), upgrades };
}

// Validate user board (strict) + apply auto-star upgrades.
function validateUserBoard(userId, board) {
  if (!Array.isArray(board) || board.length === 0 || board.length > 8) {
    return { ok: false, error: 'board must have 1..8 units' };
  }
  const ownedCounts = {};
  for (const r of Q.ownedUnits.all(userId)) ownedCounts[r.unit_id] = (ownedCounts[r.unit_id] || 0) + 1;
  const ownedItemCounts = {};
  for (const r of Q.ownedItems.all(userId)) ownedItemCounts[r.item_id] = (ownedItemCounts[r.item_id] || 0) + 1;

  const useUnit = {};
  const useItem = {};
  const seen = new Set();
  const cleaned = [];

  for (const slot of board) {
    if (!slot || typeof slot !== 'object') return { ok: false, error: 'bad slot' };
    const unitId = Number(slot.unitId);
    const x = Number(slot.x), y = Number(slot.y);
    if (!UNIT_BY_ID[unitId]) return { ok: false, error: 'unknown unit' };
    if (x < 0 || x >= BOARD.cols) return { ok: false, error: 'x oob' };
    if (y < 0 || y >= 2) return { ok: false, error: 'y must be in your half' };
    const key = `${x},${y}`;
    if (seen.has(key)) return { ok: false, error: 'duplicate cell' };
    seen.add(key);

    useUnit[unitId] = (useUnit[unitId] || 0) + 1;
    if (useUnit[unitId] > (ownedCounts[unitId] || 0)) return { ok: false, error: `you don't own enough ${UNIT_BY_ID[unitId].name}` };

    const items = Array.isArray(slot.items) ? slot.items.slice(0, 2).map(Number) : [];
    for (const iid of items) {
      if (!ITEM_BY_ID[iid]) return { ok: false, error: 'unknown item' };
      useItem[iid] = (useItem[iid] || 0) + 1;
      if (useItem[iid] > (ownedItemCounts[iid] || 0)) return { ok: false, error: 'item overuse' };
    }

    cleaned.push({ unitId, x, y, items });
  }

  // Apply auto 2-star upgrades
  const upgraded = applyStarUpgrades(cleaned, userId);
  return { ok: true, board: upgraded.board, upgrades: upgraded.upgrades };
}

// ─── App ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Generic per-IP rate limit: 600/min, burst 60.
app.use(rateLimitHttp({ capacity: 60, refillPerSec: 10, prefix: 'global' }));
const authLimiter = rateLimitHttp({ capacity: 8, refillPerSec: 0.2, prefix: 'auth' }); // 8 burst, ~12/min
const shopLimiter = rateLimitHttp({ capacity: 12, refillPerSec: 0.5, prefix: 'shop' }); // ~30/min
const playLimiter = rateLimitHttp({ capacity: 6,  refillPerSec: 0.2, prefix: 'play' }); // ~12/min

app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// ─── Auth ──────────────────────────────────────────────────────────────────
app.post('/api/register', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  if (username.length < 3 || password.length < 3) return res.status(400).json({ error: 'too short' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'username: letters/numbers/_ only' });
  if (Q.findUserByName.get(username)) return res.status(409).json({ error: 'username taken' });

  const hash = bcrypt.hashSync(password, 8);
  // generate friend code with retry on collision
  let fc; for (let i = 0; i < 5; i++) { fc = genFriendCode(username); if (!Q.findUserByCode.get(fc)) break; }
  const info = Q.insertUser.run(username, hash, fc);

  const starters = [1, 2, 3, 4, 5];
  for (const id of starters) Q.addUnit.run(info.lastInsertRowid, id);
  Q.addItem.run(info.lastInsertRowid, 1);

  Q.setLastLogin.run(info.lastInsertRowid);
  const token = newSession(info.lastInsertRowid);
  const user = decoratePublicUser(Q.publicUser.get(info.lastInsertRowid));
  res.json({ token, user });
});

app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  const row = Q.findUserByName.get(username);
  if (!row || !bcrypt.compareSync(password, row.password)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  Q.setLastLogin.run(row.id);
  const token = newSession(row.id);
  const user = decoratePublicUser(Q.publicUser.get(row.id));
  res.json({ token, user });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) Q.deleteSession.run(m[1]);
  res.json({ ok: true });
});

// ─── Profile / Catalog / Season ────────────────────────────────────────────
app.get('/api/profile', requireAuth, (req, res) => {
  const u = decoratePublicUser(Q.publicUser.get(req.user.id));
  const owned = Q.ownedUnits.all(req.user.id).map((r) => ({ ownedId: r.id, ...UNIT_BY_ID[r.unit_id] }));
  const items = Q.ownedItems.all(req.user.id).map((r) => ({ ownedId: r.id, ...ITEM_BY_ID[r.item_id] }));
  ensureDailyQuests(req.user.id);
  const quests = Q.questsForDay.all(req.user.id, dayKey());
  const loadouts = Q.loadouts.all(req.user.id).map((l) => ({ ...l, data: JSON.parse(l.data) }));
  res.json({ user: u, units: owned, items, quests, loadouts });
});

app.get('/api/catalog', (_req, res) => {
  res.json({
    units: UNITS, traits: TRAITS, items: ITEMS, augments: AUGMENTS,
    board: BOARD, tiers: TIERS,
  });
});

app.get('/api/season', (_req, res) => {
  const s = Q.currentSeason.get();
  if (!s) return res.json({ season: null });
  const remainingMs = (s.ends_at * 1000) - Date.now();
  res.json({ season: { ...s, remainingMs: Math.max(0, remainingMs) } });
});

// ─── Shop ──────────────────────────────────────────────────────────────────
app.post('/api/shop/buy-unit', shopLimiter, requireAuth, (req, res) => {
  const { unitId } = req.body || {};
  const unit = UNIT_BY_ID[unitId];
  if (!unit) return res.status(404).json({ error: 'unit not found' });
  const cost = unit.cost * 10;
  const r = Q.spendGold.run(cost, req.user.id, cost);
  if (r.changes === 0) return res.status(400).json({ error: 'not enough gold' });
  Q.addUnit.run(req.user.id, unit.id);
  res.json({ ok: true, user: decoratePublicUser(Q.publicUser.get(req.user.id)), unit });
});

app.post('/api/shop/buy-item', shopLimiter, requireAuth, (req, res) => {
  const { itemId } = req.body || {};
  const item = ITEM_BY_ID[itemId];
  if (!item) return res.status(404).json({ error: 'item not found' });
  const cost = item.cost * 15;
  const r = Q.spendGold.run(cost, req.user.id, cost);
  if (r.changes === 0) return res.status(400).json({ error: 'not enough gold' });
  Q.addItem.run(req.user.id, item.id);
  res.json({ ok: true, user: decoratePublicUser(Q.publicUser.get(req.user.id)), item });
});

// ─── Leaderboard / matches ─────────────────────────────────────────────────
app.get('/api/leaderboard', (_req, res) => {
  const players = Q.leaderboard.all().map((p) => {
    const tier = tierOf(p.mmr);
    return { ...p, tier: { name: tier.name, color: tier.color } };
  });
  res.json({ players });
});

app.get('/api/matches', requireAuth, (req, res) => {
  res.json({ matches: Q.recentMatches.all(req.user.id, req.user.id) });
});

app.get('/api/matches/:id/replay', requireAuth, (req, res) => {
  const row = Q.matchById.get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.player1_id !== req.user.id && row.player2_id !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({ match: row, replay: row.replay_data ? JSON.parse(row.replay_data) : null });
});

// Make a match's replay public — owner can call this to share a link.
app.post('/api/matches/:id/share', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const r = Q.setMatchPublic.run(id, req.user.id, req.user.id);
  if (r.changes === 0) return res.status(403).json({ error: 'not your match' });
  const m = Q.matchById.get(id);
  res.json({ ok: true, replayToken: m.replay_token });
});

// Public replay endpoint — no auth, only works for matches with public=1.
app.get('/api/replays/:token', (req, res) => {
  const m = Q.matchByToken.get(req.params.token);
  if (!m || !m.public) return res.status(404).json({ error: 'not found' });
  res.json({ match: m, replay: m.replay_data ? JSON.parse(m.replay_data) : null });
});

// ─── Quests ────────────────────────────────────────────────────────────────
app.get('/api/quests', requireAuth, (req, res) => {
  ensureDailyQuests(req.user.id);
  res.json({ quests: Q.questsForDay.all(req.user.id, dayKey()) });
});

app.post('/api/quests/:id/claim', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const r = Q.claimQuest.run(id, req.user.id);
  if (r.changes === 0) return res.status(400).json({ error: 'cannot claim' });
  const q = Q.questById.get(id);
  Q.addGold.run(q.reward_gold, req.user.id);
  res.json({ ok: true, user: decoratePublicUser(Q.publicUser.get(req.user.id)), claimed: q });
});

// ─── Loadouts (server-side persistence as backup) ──────────────────────────
app.post('/api/loadouts/:slot', requireAuth, (req, res) => {
  const slot = Number(req.params.slot);
  if (![1, 2, 3].includes(slot)) return res.status(400).json({ error: 'slot must be 1..3' });
  const { name, board } = req.body || {};
  if (!name || !Array.isArray(board)) return res.status(400).json({ error: 'name/board required' });
  Q.upsertLoadout.run(req.user.id, slot, String(name).slice(0, 32), JSON.stringify(board));
  res.json({ ok: true, loadouts: Q.loadouts.all(req.user.id).map((l) => ({ ...l, data: JSON.parse(l.data) })) });
});

app.delete('/api/loadouts/:slot', requireAuth, (req, res) => {
  Q.delLoadout.run(req.user.id, Number(req.params.slot));
  res.json({ ok: true });
});

// ─── Friends ───────────────────────────────────────────────────────────────
app.get('/api/friends', requireAuth, (req, res) => {
  const list = Q.myFriends.all(req.user.id);
  const decorated = list.map((f) => {
    const t = tierOf(f.mmr);
    const onlineSocket = onlineUsers.get(f.id);
    return { ...f, tier: { name: t.name, color: t.color }, online: !!onlineSocket };
  });
  const requests = Q.pendingFriendReqs.all(req.user.id);
  res.json({ friends: decorated, requests });
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { friendCode } = req.body || {};
  if (!friendCode) return res.status(400).json({ error: 'friendCode required' });
  const target = Q.findUserByCode.get(String(friendCode).toUpperCase());
  if (!target) return res.status(404).json({ error: 'no such code' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot friend yourself' });
  if (Q.isFriend.get(req.user.id, target.id)) return res.status(400).json({ error: 'already friends' });
  if (Q.existingFriendReq.get(req.user.id, target.id)) return res.status(400).json({ error: 'request pending' });
  Q.insertFriendReq.run(req.user.id, target.id);
  // notify if online
  pushToUser(target.id, { type: 'friend_request', from: { id: req.user.id, username: req.user.username } });
  res.json({ ok: true });
});

app.post('/api/friends/respond/:reqId', requireAuth, (req, res) => {
  const reqId = Number(req.params.reqId);
  const accept = !!(req.body && req.body.accept);
  const fr = Q.friendReqById.get(reqId);
  if (!fr || fr.to_id !== req.user.id || fr.status !== 'pending') return res.status(404).json({ error: 'not found' });
  Q.setFriendReqStatus.run(accept ? 'accepted' : 'declined', reqId, req.user.id);
  if (accept) {
    Q.addFriend.run(req.user.id, fr.from_id);
    Q.addFriend.run(fr.from_id, req.user.id);
    pushToUser(fr.from_id, { type: 'friend_added', user: { id: req.user.id, username: req.user.username } });
  }
  res.json({ ok: true });
});

app.post('/api/friends/remove/:friendId', requireAuth, (req, res) => {
  const fid = Number(req.params.friendId);
  Q.removeFriend.run(req.user.id, fid);
  Q.removeFriend.run(fid, req.user.id);
  res.json({ ok: true });
});

// ─── PvE: bot match ────────────────────────────────────────────────────────
app.post('/api/play/bot', playLimiter, requireAuth, (req, res) => {
  const { difficulty, board, augmentId } = req.body || {};
  if (!BOT_TEAMS[difficulty]) return res.status(400).json({ error: 'unknown difficulty' });
  const validation = validateUserBoard(req.user.id, board);
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  const myBoard = validation.board;
  const botBoard = pickBotTeam(difficulty, myBoard);

  // Resolve augment selection (optional, single)
  const myAugs = augmentId && AUGMENT_BY_ID[augmentId] ? [AUGMENT_BY_ID[augmentId]] : [];

  // Run simulation
  const result = simulateBattle(myBoard, botBoard, { augments: { 1: myAugs, 2: [] } });

  // Reward
  const baseReward = result.winner === 1
    ? REWARDS[`bot_${difficulty}`]
    : { gold: 5, mmr: 0 };
  const goldBonusFromAug = myAugs.reduce((acc, a) => acc + ((a.apply && a.apply.goldBonus) || 0), 0);
  const reward = { ...baseReward, gold: baseReward.gold + goldBonusFromAug };

  Q.addGold.run(reward.gold, req.user.id);
  if (result.winner === 1) Q.bumpBotWin.run(req.user.id);

  // Quests
  bumpQuestSafely(req.user.id, 'play_3', 1);
  if (result.winner === 1) {
    bumpQuestSafely(req.user.id, 'win_2', 1);
    if (difficulty === 'hard' || difficulty === 'nightmare') {
      bumpQuestSafely(req.user.id, 'bot_hard', 1);
    }
  }
  bumpQuestSafely(req.user.id, 'place_5', myBoard.length);
  if (validation.upgrades > 0) bumpQuestSafely(req.user.id, 'star_up_1', validation.upgrades);
  const skillCasts = result.ticks.flatMap((tk) => tk.fx).filter((fx) => fx.t === 'cast').length;
  if (skillCasts > 0) bumpQuestSafely(req.user.id, 'use_skill', skillCasts);

  // Persist match
  const replayToken = uuidv4();
  const replay = JSON.stringify({
    team1: myBoard, team2: botBoard, ticks: result.ticks, traits: result.traits,
    recap: result.recap, augments: { 1: myAugs.map((a) => a.id), 2: [] },
    winner: result.winner, mode: 'pve', difficulty,
  });
  Q.insertMatch.run(req.user.id, null, difficulty, result.winner === 1 ? req.user.id : null, result.winner === 2 ? 1 : 0, replay, replayToken);

  res.json({
    winner: result.winner,
    youWon: result.winner === 1,
    reward,
    user: decoratePublicUser(Q.publicUser.get(req.user.id)),
    replay: {
      team1: myBoard, team2: botBoard, ticks: result.ticks, traits: result.traits,
      recap: result.recap, augments: { 1: myAugs.map((a) => a.id), 2: [] },
      winner: result.winner,
    },
  });
});

// ─── HTTP + WebSocket ──────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const sockets = new Map();  // ws -> { userId, matchId, alive: bool }
const onlineUsers = new Map(); // userId -> ws (last connection)
let queue = [];             // [{ ws, userId }]
const matches = new Map();  // matchId -> match state
const pendingInvites = new Map(); // inviteId -> { from, to, createdAt }

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(match, obj) {
  for (const p of match.players) send(p.ws, obj);
}

function pushToUser(userId, obj) {
  const ws = onlineUsers.get(userId);
  if (ws) send(ws, obj);
}

function tryMatch() {
  while (queue.length >= 2) {
    const a = queue.shift(); const b = queue.shift();
    if (a.ws.readyState !== a.ws.OPEN) { queue.unshift(b); continue; }
    if (b.ws.readyState !== b.ws.OPEN) { queue.unshift(a); continue; }
    if (a.userId === b.userId) { queue.unshift(b); queue.push(a); break; }
    createMatch(a, b);
  }
}

function createMatch(a, b, isPrivate = false) {
  const matchId = uuidv4();
  const ua = Q.publicUser.get(a.userId);
  const ub = Q.publicUser.get(b.userId);
  const match = {
    id: matchId,
    state: 'augment_select',
    isPrivate,
    augmentChoices: { 1: rollAugments(), 2: rollAugments() },
    chosenAugment:  { 1: null, 2: null },
    players: [
      { ws: a.ws, userId: a.userId, username: ua.username, mmr: ua.mmr, board: null, ready: false, gamesPlayed: ua.games_played || 0 },
      { ws: b.ws, userId: b.userId, username: ub.username, mmr: ub.mmr, board: null, ready: false, gamesPlayed: ub.games_played || 0 },
    ],
    placementDeadline: Date.now() + 60_000,
    createdAt: Date.now(),
  };
  matches.set(matchId, match);
  for (const p of match.players) {
    const meta = sockets.get(p.ws); if (meta) meta.matchId = matchId;
  }
  // tell each player about their match + their unique augment options
  send(a.ws, {
    type: 'match_found', matchId, side: 1,
    opponent: { username: ub.username, mmr: ub.mmr, tier: tierOf(ub.mmr) },
    deadline: match.placementDeadline,
    augmentChoices: match.augmentChoices[1],
    isPrivate,
  });
  send(b.ws, {
    type: 'match_found', matchId, side: 2,
    opponent: { username: ua.username, mmr: ua.mmr, tier: tierOf(ua.mmr) },
    deadline: match.placementDeadline,
    augmentChoices: match.augmentChoices[2],
    isPrivate,
  });

  // placement timeout
  setTimeout(() => {
    const m = matches.get(matchId);
    if (!m || (m.state !== 'placement' && m.state !== 'augment_select' && m.state !== 'scout')) return;
    const notReady = m.players.find((p) => !p.ready);
    if (notReady) {
      const opp = m.players.find((p) => p !== notReady);
      // mark abandon
      const today = dayKey();
      Q.bumpAbandon.run(today, today, notReady.userId);
      finishMatch(m, { winner: opp === m.players[0] ? 1 : 2, ticks: [], traits: { 1: { counts: {}, active: {} }, 2: { counts: {}, active: {} } }, recap: { 1: { units: [], mvpUid: null }, 2: { units: [], mvpUid: null } } }, true, notReady.userId);
    } else {
      runPvpBattle(m);
    }
  }, 65_000);
}

function maybeStartScout(match) {
  // Once both players locked board, briefly send a "scout" snapshot of opponent comp
  // before kicking off the battle. Scout phase = 4 seconds.
  match.state = 'scout';
  for (const p of match.players) {
    const opp = match.players.find((x) => x !== p);
    send(p.ws, {
      type: 'scout',
      opponent: {
        username: opp.username,
        board: opp.board.map((s) => ({ unitId: s.unitId, x: s.x, y: s.y, items: s.items, star: s.star || 1 })),
      },
      duration: 4000,
    });
  }
  setTimeout(() => {
    if (matches.has(match.id) && match.state === 'scout') runPvpBattle(match);
  }, 4000);
}

function runPvpBattle(match) {
  match.state = 'battle';
  const p1 = match.players[0]; const p2 = match.players[1];
  const aug1 = match.chosenAugment[1] ? [AUGMENT_BY_ID[match.chosenAugment[1]]].filter(Boolean) : [];
  const aug2 = match.chosenAugment[2] ? [AUGMENT_BY_ID[match.chosenAugment[2]]].filter(Boolean) : [];
  const result = simulateBattle(p1.board, p2.board, { augments: { 1: aug1, 2: aug2 } });
  match._result = result;

  const stepDelay = 1000 / TICKS_PER_SEC;
  let i = 0;
  broadcast(match, { type: 'battle_start', traits: result.traits });
  const send_next = () => {
    if (!matches.has(match.id)) return;
    if (i >= result.ticks.length) { finishMatch(match, result, false, null); return; }
    const tick = result.ticks[i++];
    broadcast(match, { type: 'tick', tick: tick.tick, fx: tick.fx, state: tick.state, info: tick.info });
    setTimeout(send_next, stepDelay);
  };
  send_next();
}

function finishMatch(match, result, walkover, abandonedBy) {
  const p1 = match.players[0]; const p2 = match.players[1];
  const winnerPlayer = result.winner === 1 ? p1 : p2;
  const loserPlayer  = result.winner === 1 ? p2 : p1;

  // Pull fresh user records for K-factor calc
  const winFresh = Q.findUserById.get(winnerPlayer.userId);
  const loseFresh = Q.findUserById.get(loserPlayer.userId);
  const delta = eloDelta(winFresh.mmr, winFresh.games_played || 0, loseFresh.mmr, loseFresh.games_played || 0);

  // Apply MMR + gold
  Q.bumpGames.run(winnerPlayer.userId);
  Q.bumpGames.run(loserPlayer.userId);
  Q.applyMmr.run(delta.winnerDelta, delta.winnerDelta, winnerPlayer.userId);
  Q.applyMmr.run(delta.loserDelta,  delta.loserDelta,  loserPlayer.userId);
  Q.bumpWin.run(winnerPlayer.userId);
  Q.bumpLoss.run(loserPlayer.userId);

  // streak bonuses (read after bumpWin/bumpLoss so winstreak/losestreak reflect this game)
  const winFresh2 = Q.findUserById.get(winnerPlayer.userId);
  const loseFresh2 = Q.findUserById.get(loserPlayer.userId);
  const winnerStreakBonus = streakBonus(winFresh2, true); // uses new winstreak
  // Determine prev losestreak by checking pre-update record
  const comebackWasTriggered = winFresh.losestreak >= 3;

  // Augment goldBonus carries across (e.g. Coinpurse)
  function augGoldFor(side) {
    const augId = match.chosenAugment[side];
    const a = augId ? AUGMENT_BY_ID[augId] : null;
    return a && a.apply && a.apply.goldBonus ? a.apply.goldBonus : 0;
  }
  const winnerSide = result.winner;
  const loserSide  = winnerSide === 1 ? 2 : 1;
  const winnerGold = REWARDS.pvp_win.gold + winnerStreakBonus + augGoldFor(winnerSide);
  const loserGold  = REWARDS.pvp_loss.gold + augGoldFor(loserSide);
  Q.addGold.run(winnerGold, winnerPlayer.userId);
  Q.addGold.run(loserGold,  loserPlayer.userId);

  // Persist
  const replayToken = uuidv4();
  const replay = JSON.stringify({
    team1: p1.board || [], team2: p2.board || [],
    ticks: result.ticks, traits: result.traits,
    recap: result.recap || null,
    augments: { 1: match.chosenAugment[1], 2: match.chosenAugment[2] },
    winner: result.winner, walkover: !!walkover, mode: 'pvp',
  });
  Q.insertMatch.run(p1.userId, p2.userId, null, winnerPlayer.userId, 0, replay, replayToken);

  // Quests
  for (const p of match.players) {
    bumpQuestSafely(p.userId, 'play_3', 1);
    bumpQuestSafely(p.userId, 'place_5', (p.board || []).length);
  }
  bumpQuestSafely(winnerPlayer.userId, 'win_2', 1);
  const skillCasts = result.ticks.flatMap((tk) => tk.fx || []).filter((fx) => fx.t === 'cast').length;
  if (skillCasts > 0) {
    for (const p of match.players) bumpQuestSafely(p.userId, 'use_skill', Math.ceil(skillCasts / 2));
  }

  // Send result
  for (const p of match.players) {
    const updated = decoratePublicUser(Q.publicUser.get(p.userId));
    const isWinner = p === winnerPlayer;
    send(p.ws, {
      type: 'battle_end',
      matchId: match.id,
      winner: result.winner,
      youWon: isWinner,
      walkover: !!walkover,
      abandonedBy: abandonedBy || null,
      reward: {
        gold: isWinner ? winnerGold : loserGold,
        mmr: isWinner ? delta.winnerDelta : delta.loserDelta,
        streakBonus: isWinner ? winnerStreakBonus : 0,
        comeback: isWinner ? comebackWasTriggered : false,
      },
      user: updated,
      recap: result.recap || null,
    });
    const meta = sockets.get(p.ws); if (meta) meta.matchId = null;
  }
  matches.delete(match.id);
}

// ─── WS handlers ───────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS  = 60_000;

wss.on('connection', (ws) => {
  sockets.set(ws, { userId: null, matchId: null, alive: true, lastPong: Date.now() });
  send(ws, { type: 'hello' });

  ws.on('pong', () => {
    const meta = sockets.get(ws);
    if (meta) { meta.alive = true; meta.lastPong = Date.now(); }
  });

  ws.on('message', (raw) => {
    if (!wsAllow(ws)) return send(ws, { type: 'error', error: 'rate limited' });
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    const meta = sockets.get(ws);
    if (!meta) return;

    if (msg.type === 'auth') {
      const row = Q.findSession.get(msg.token || '');
      if (!row) return send(ws, { type: 'error', error: 'invalid token' });
      meta.userId = row.user_id;
      onlineUsers.set(row.user_id, ws);
      Q.setLastLogin.run(row.user_id);
      const u = decoratePublicUser(Q.publicUser.get(row.user_id));
      send(ws, { type: 'auth_ok', user: u });
      // try rejoin if user was in a match
      for (const m of matches.values()) {
        const meIdx = m.players.findIndex((p) => p.userId === row.user_id);
        if (meIdx >= 0) {
          m.players[meIdx].ws = ws; meta.matchId = m.id;
          send(ws, {
            type: 'rejoin_match',
            matchId: m.id, state: m.state,
            side: meIdx + 1,
          });
          break;
        }
      }
      return;
    }

    if (!meta.userId) return send(ws, { type: 'error', error: 'auth first' });

    if (msg.type === 'queue_join') {
      if (meta.matchId) return send(ws, { type: 'error', error: 'in match' });
      if (queue.find((q) => q.userId === meta.userId)) return;
      queue.push({ ws, userId: meta.userId });
      send(ws, { type: 'queue_status', queued: true, size: queue.length });
      tryMatch();
      return;
    }
    if (msg.type === 'queue_leave') {
      queue = queue.filter((q) => q.ws !== ws);
      send(ws, { type: 'queue_status', queued: false, size: queue.length });
      return;
    }

    if (msg.type === 'pick_augment') {
      const m = matches.get(msg.matchId); if (!m) return;
      if (m.state !== 'augment_select' && m.state !== 'placement') return;
      const player = m.players.find((p) => p.userId === meta.userId);
      if (!player) return;
      const side = m.players.indexOf(player) === 0 ? 1 : 2;
      const choices = m.augmentChoices[side] || [];
      if (!choices.find((c) => c.id === msg.augmentId)) return send(ws, { type: 'error', error: 'invalid augment' });
      m.chosenAugment[side] = msg.augmentId;
      // Move to placement once augment is picked (each side independently)
      if (m.state === 'augment_select') m.state = 'placement';
      send(ws, { type: 'augment_ack', augmentId: msg.augmentId });
      return;
    }

    if (msg.type === 'submit_board') {
      const m = matches.get(msg.matchId);
      if (!m) return send(ws, { type: 'error', error: 'no match' });
      if (m.state !== 'placement' && m.state !== 'augment_select') return send(ws, { type: 'error', error: 'placement closed' });
      const player = m.players.find((p) => p.userId === meta.userId);
      if (!player) return;
      const v = validateUserBoard(meta.userId, msg.board);
      if (!v.ok) return send(ws, { type: 'error', error: v.error });
      player.board = v.board;
      player.ready = true;
      send(ws, { type: 'board_ack', upgrades: v.upgrades });
      const opp = m.players.find((p) => p !== player);
      send(opp.ws, { type: 'opponent_ready' });
      if (m.players.every((p) => p.ready)) maybeStartScout(m);
      return;
    }

    if (msg.type === 'concede') {
      if (!meta.matchId) return;
      const m = matches.get(meta.matchId); if (!m) return;
      const me = m.players.find((p) => p.userId === meta.userId);
      const opp = m.players.find((p) => p !== me);
      const today = dayKey();
      Q.bumpAbandon.run(today, today, meta.userId);
      finishMatch(m, {
        winner: opp === m.players[0] ? 1 : 2, ticks: [],
        traits: { 1: { counts: {}, active: {} }, 2: { counts: {}, active: {} } },
        recap: { 1: { units: [], mvpUid: null }, 2: { units: [], mvpUid: null } },
      }, true, meta.userId);
      return;
    }

    // ─── Friend invite to private match ───
    if (msg.type === 'invite_friend') {
      const fid = Number(msg.friendId);
      if (!Q.isFriend.get(meta.userId, fid)) return send(ws, { type: 'error', error: 'not friends' });
      const friendWs = onlineUsers.get(fid);
      if (!friendWs) return send(ws, { type: 'error', error: 'friend offline' });
      const inviteId = uuidv4();
      pendingInvites.set(inviteId, { from: meta.userId, to: fid, createdAt: Date.now() });
      const me = Q.publicUser.get(meta.userId);
      send(friendWs, { type: 'invite', inviteId, from: { id: me.id, username: me.username } });
      send(ws, { type: 'invite_sent', inviteId });
      // expire after 30s
      setTimeout(() => pendingInvites.delete(inviteId), 30_000);
      return;
    }
    if (msg.type === 'invite_respond') {
      const inv = pendingInvites.get(msg.inviteId);
      if (!inv) return send(ws, { type: 'error', error: 'invite expired' });
      if (inv.to !== meta.userId) return;
      pendingInvites.delete(msg.inviteId);
      if (!msg.accept) {
        const fromWs = onlineUsers.get(inv.from);
        if (fromWs) send(fromWs, { type: 'invite_declined', inviteId: msg.inviteId });
        return;
      }
      const fromWs = onlineUsers.get(inv.from);
      if (!fromWs) return send(ws, { type: 'error', error: 'friend offline' });
      // Both online — create private match
      createMatch({ ws: fromWs, userId: inv.from }, { ws, userId: meta.userId }, true);
      return;
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong', t: Date.now() });
      return;
    }

    send(ws, { type: 'error', error: `unknown type: ${msg.type}` });
  });

  ws.on('close', () => {
    const meta = sockets.get(ws);
    if (!meta) return;
    queue = queue.filter((q) => q.ws !== ws);
    if (meta.userId && onlineUsers.get(meta.userId) === ws) {
      onlineUsers.delete(meta.userId);
    }
    if (meta.matchId && matches.has(meta.matchId)) {
      const m = matches.get(meta.matchId);
      // Don't immediately abandon — give 8s grace for reconnect.
      const me = m.players.find((p) => p.ws === ws);
      if (me) me.ws = null;
      const allDisconnected = m.players.every((p) => !p.ws || p.ws.readyState !== p.ws.OPEN);
      if (allDisconnected) {
        // both gone, drop the match
        matches.delete(m.id);
      } else if (m.state === 'placement' || m.state === 'augment_select' || m.state === 'scout') {
        // give a small grace window
        setTimeout(() => {
          const m2 = matches.get(meta.matchId); if (!m2) return;
          const meStill = m2.players.find((p) => p.userId === meta.userId);
          if (meStill && (!meStill.ws || meStill.ws.readyState !== meStill.ws.OPEN)) {
            const opp = m2.players.find((p) => p !== meStill);
            const today = dayKey();
            if (meStill.userId) Q.bumpAbandon.run(today, today, meStill.userId);
            finishMatch(m2, {
              winner: opp === m2.players[0] ? 1 : 2, ticks: [],
              traits: { 1: { counts: {}, active: {} }, 2: { counts: {}, active: {} } },
              recap: { 1: { units: [], mvpUid: null }, 2: { units: [], mvpUid: null } },
            }, true, meta.userId);
          }
        }, 8000);
      }
      // If in battle we still let the simulation finish — both sides receive the stream regardless.
    }
    sockets.delete(ws);
  });
});

// Heartbeat: ping every interval; drop dead sockets.
setInterval(() => {
  for (const ws of wss.clients) {
    const meta = sockets.get(ws); if (!meta) continue;
    if (Date.now() - meta.lastPong > HEARTBEAT_TIMEOUT_MS) {
      try { ws.terminate(); } catch (_) {}
      continue;
    }
    meta.alive = false;
    try { ws.ping(); } catch (_) {}
  }
}, HEARTBEAT_INTERVAL_MS).unref?.();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[rift-realm] listening on :${PORT} (HTTP + WS@/ws)`);
});

module.exports = { app, server };
