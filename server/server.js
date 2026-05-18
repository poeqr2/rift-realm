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

const { UNITS, UNIT_BY_ID, TRAITS, ITEMS, ITEM_BY_ID, BOT_TEAMS, REWARDS, BOARD } = require('./gamedata');
const { simulateBattle, TICKS_PER_SEC } = require('./battle');

// ─── DB ────────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'rift_realm.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    gold INTEGER NOT NULL DEFAULT 200,
    mmr INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    bot_wins INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER,
    bot_difficulty TEXT,
    winner_id INTEGER,
    bot_won INTEGER DEFAULT 0,
    replay_data TEXT,
    played_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    quest_key TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    reward_gold INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    claimed INTEGER DEFAULT 0,
    day INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_quests_user ON quests(user_id, day);
`);

// ─── Prepared statements ───────────────────────────────────────────────────
const Q = {
  insertUser: db.prepare('INSERT INTO users (username, password) VALUES (?, ?)'),
  findUserByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  publicUser: db.prepare('SELECT id, username, gold, mmr, wins, losses, bot_wins FROM users WHERE id = ?'),
  spendGold: db.prepare('UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?'),
  addGold: db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?'),
  applyMmr: db.prepare('UPDATE users SET mmr = MAX(0, mmr + ?) WHERE id = ?'),
  bumpWin: db.prepare('UPDATE users SET wins = wins + 1 WHERE id = ?'),
  bumpLoss: db.prepare('UPDATE users SET losses = losses + 1 WHERE id = ?'),
  bumpBotWin: db.prepare('UPDATE users SET bot_wins = bot_wins + 1 WHERE id = ?'),

  addUnit: db.prepare('INSERT INTO user_units (user_id, unit_id) VALUES (?, ?)'),
  ownedUnits: db.prepare('SELECT id, unit_id FROM user_units WHERE user_id = ?'),
  ownsUnitCount: db.prepare('SELECT COUNT(*) AS c FROM user_units WHERE user_id = ? AND unit_id = ?'),

  addItem: db.prepare('INSERT INTO user_items (user_id, item_id) VALUES (?, ?)'),
  ownedItems: db.prepare('SELECT id, item_id FROM user_items WHERE user_id = ?'),
  consumeItem: db.prepare('DELETE FROM user_items WHERE id = (SELECT id FROM user_items WHERE user_id=? AND item_id=? LIMIT 1)'),

  insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
  findSession: db.prepare('SELECT user_id FROM sessions WHERE token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

  insertMatch: db.prepare(`
    INSERT INTO matches (player1_id, player2_id, bot_difficulty, winner_id, bot_won, replay_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  recentMatches: db.prepare(`
    SELECT m.id, m.player1_id, m.player2_id, m.bot_difficulty, m.winner_id, m.bot_won, m.played_at,
           u1.username AS p1_name, u2.username AS p2_name
    FROM matches m
    LEFT JOIN users u1 ON u1.id = m.player1_id
    LEFT JOIN users u2 ON u2.id = m.player2_id
    WHERE m.player1_id = ? OR m.player2_id = ?
    ORDER BY m.id DESC LIMIT 15
  `),
  matchById: db.prepare('SELECT * FROM matches WHERE id = ?'),
  leaderboard: db.prepare(`
    SELECT id, username, mmr, wins, losses, bot_wins
    FROM users ORDER BY mmr DESC, wins DESC LIMIT 25
  `),

  insertQuest: db.prepare(`
    INSERT INTO quests (user_id, quest_key, progress, target, reward_gold, day)
    VALUES (?, ?, 0, ?, ?, ?)
  `),
  questsForDay: db.prepare('SELECT * FROM quests WHERE user_id = ? AND day = ?'),
  bumpQuest: db.prepare(`
    UPDATE quests SET progress = MIN(target, progress + ?),
           completed = CASE WHEN progress + ? >= target THEN 1 ELSE completed END
    WHERE user_id = ? AND quest_key = ? AND day = ? AND completed = 0
  `),
  claimQuest: db.prepare(`
    UPDATE quests SET claimed = 1
    WHERE id = ? AND user_id = ? AND completed = 1 AND claimed = 0
  `),
  questById: db.prepare('SELECT * FROM quests WHERE id = ?'),
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function dayKey() {
  const d = new Date();
  return Number(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
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
  ];
  // pick 3 distinct
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
  // emulate "add n then check" robustly
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

// ─── App ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// ─── Auth ──────────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  if (username.length < 3 || password.length < 3) return res.status(400).json({ error: 'too short' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'username: letters/numbers/_ only' });

  if (Q.findUserByName.get(username)) return res.status(409).json({ error: 'username taken' });
  const hash = bcrypt.hashSync(password, 8);
  const info = Q.insertUser.run(username, hash);
  // starter pack: 5 cheap units + 1 item
  const starters = [1, 2, 3, 4, 5]; // squire/wolfkin/apprentice/hunter/skeleton
  for (const id of starters) Q.addUnit.run(info.lastInsertRowid, id);
  Q.addItem.run(info.lastInsertRowid, 1); // iron sword

  const token = newSession(info.lastInsertRowid);
  const user = Q.publicUser.get(info.lastInsertRowid);
  res.json({ token, user });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  const row = Q.findUserByName.get(username);
  if (!row || !bcrypt.compareSync(password, row.password)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = newSession(row.id);
  const user = Q.publicUser.get(row.id);
  res.json({ token, user });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) Q.deleteSession.run(m[1]);
  res.json({ ok: true });
});

// ─── Profile / collection ──────────────────────────────────────────────────
app.get('/api/profile', requireAuth, (req, res) => {
  const u = Q.publicUser.get(req.user.id);
  const owned = Q.ownedUnits.all(req.user.id).map((r) => ({ ownedId: r.id, ...UNIT_BY_ID[r.unit_id] }));
  const items = Q.ownedItems.all(req.user.id).map((r) => ({ ownedId: r.id, ...ITEM_BY_ID[r.item_id] }));
  ensureDailyQuests(req.user.id);
  const quests = Q.questsForDay.all(req.user.id, dayKey());
  res.json({ user: u, units: owned, items, quests });
});

// ─── Catalog ───────────────────────────────────────────────────────────────
app.get('/api/catalog', (_req, res) => {
  res.json({ units: UNITS, traits: TRAITS, items: ITEMS, board: BOARD });
});

// ─── Shop ──────────────────────────────────────────────────────────────────
app.post('/api/shop/buy-unit', requireAuth, (req, res) => {
  const { unitId } = req.body || {};
  const unit = UNIT_BY_ID[unitId];
  if (!unit) return res.status(404).json({ error: 'unit not found' });
  const cost = unit.cost * 10; // shop price = cost x 10 gold
  const r = Q.spendGold.run(cost, req.user.id, cost);
  if (r.changes === 0) return res.status(400).json({ error: 'not enough gold' });
  Q.addUnit.run(req.user.id, unit.id);
  res.json({ ok: true, user: Q.publicUser.get(req.user.id), unit });
});

app.post('/api/shop/buy-item', requireAuth, (req, res) => {
  const { itemId } = req.body || {};
  const item = ITEM_BY_ID[itemId];
  if (!item) return res.status(404).json({ error: 'item not found' });
  const cost = item.cost * 15;
  const r = Q.spendGold.run(cost, req.user.id, cost);
  if (r.changes === 0) return res.status(400).json({ error: 'not enough gold' });
  Q.addItem.run(req.user.id, item.id);
  res.json({ ok: true, user: Q.publicUser.get(req.user.id), item });
});

// ─── Leaderboard / matches ─────────────────────────────────────────────────
app.get('/api/leaderboard', (_req, res) => {
  res.json({ players: Q.leaderboard.all() });
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
  res.json({ ok: true, user: Q.publicUser.get(req.user.id), claimed: q });
});

// ─── PvE: bot match ────────────────────────────────────────────────────────
app.post('/api/play/bot', requireAuth, (req, res) => {
  const { difficulty, board } = req.body || {};
  if (!BOT_TEAMS[difficulty]) return res.status(400).json({ error: 'unknown difficulty' });
  const validation = validateUserBoard(req.user.id, board);
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  const myBoard = validation.board;
  const botBoard = BOT_TEAMS[difficulty];

  // Run simulation
  const result = simulateBattle(myBoard, botBoard);

  // Reward
  const reward = result.winner === 1
    ? REWARDS[`bot_${difficulty}`]
    : { gold: 5, mmr: 0 };
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
  // count skill casts in replay
  const skillCasts = result.ticks.flatMap((tk) => tk.fx).filter((fx) => fx.t === 'cast').length;
  if (skillCasts > 0) bumpQuestSafely(req.user.id, 'use_skill', skillCasts);

  // Persist match (player2 null)
  const replay = JSON.stringify({ team1: myBoard, team2: botBoard, ticks: result.ticks, traits: result.traits, winner: result.winner });
  Q.insertMatch.run(req.user.id, null, difficulty, result.winner === 1 ? req.user.id : null, result.winner === 2 ? 1 : 0, replay);

  res.json({
    winner: result.winner,
    youWon: result.winner === 1,
    reward,
    user: Q.publicUser.get(req.user.id),
    replay: { team1: myBoard, team2: botBoard, ticks: result.ticks, traits: result.traits, winner: result.winner },
  });
});

// ─── Validate a board for a given user ─────────────────────────────────────
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
  return { ok: true, board: cleaned };
}

// ─── HTTP + WebSocket ──────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const sockets = new Map(); // ws -> { userId, matchId }
let queue = [];            // [{ ws, userId }]
const matches = new Map(); // matchId -> match state

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(match, obj) {
  for (const p of match.players) send(p.ws, obj);
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

function createMatch(a, b) {
  const matchId = uuidv4();
  const ua = Q.publicUser.get(a.userId);
  const ub = Q.publicUser.get(b.userId);
  const match = {
    id: matchId,
    state: 'placement',
    players: [
      { ws: a.ws, userId: a.userId, username: ua.username, mmr: ua.mmr, board: null, ready: false },
      { ws: b.ws, userId: b.userId, username: ub.username, mmr: ub.mmr, board: null, ready: false },
    ],
    placementDeadline: Date.now() + 45_000,
    createdAt: Date.now(),
  };
  matches.set(matchId, match);
  for (const p of match.players) {
    const meta = sockets.get(p.ws); if (meta) meta.matchId = matchId;
  }
  // tell each player about their match
  send(a.ws, { type: 'match_found', matchId, side: 1, opponent: { username: ub.username, mmr: ub.mmr }, deadline: match.placementDeadline });
  send(b.ws, { type: 'match_found', matchId, side: 2, opponent: { username: ua.username, mmr: ua.mmr }, deadline: match.placementDeadline });

  // placement timeout: kick whoever didn't submit
  setTimeout(() => {
    const m = matches.get(matchId);
    if (!m || m.state !== 'placement') return;
    // any player who isn't ready loses by default
    const notReady = m.players.find((p) => !p.ready);
    if (notReady) {
      const opp = m.players.find((p) => p !== notReady);
      finishMatch(m, { winner: opp === m.players[0] ? 1 : 2, ticks: [], traits: { 1: { counts: {}, active: {} }, 2: { counts: {}, active: {} } } }, true);
    } else {
      runPvpBattle(m);
    }
  }, 46_000);
}

function runPvpBattle(match) {
  match.state = 'battle';
  const p1 = match.players[0]; const p2 = match.players[1];
  const result = simulateBattle(p1.board, p2.board);

  // stream ticks @ 200ms (server-side throttle so players see animation)
  const stepDelay = 1000 / TICKS_PER_SEC; // 200ms
  let i = 0;
  // first emit traits info
  broadcast(match, { type: 'battle_start', traits: result.traits });
  const send_next = () => {
    if (!matches.has(match.id)) return; // match was cleaned up
    if (i >= result.ticks.length) {
      finishMatch(match, result, false);
      return;
    }
    const tick = result.ticks[i++];
    broadcast(match, { type: 'tick', tick: tick.tick, fx: tick.fx, state: tick.state, info: tick.info });
    setTimeout(send_next, stepDelay);
  };
  send_next();
}

function finishMatch(match, result, walkover) {
  const p1 = match.players[0]; const p2 = match.players[1];
  const winnerPlayer = result.winner === 1 ? p1 : p2;
  const loserPlayer  = result.winner === 1 ? p2 : p1;

  Q.bumpWin.run(winnerPlayer.userId);
  Q.bumpLoss.run(loserPlayer.userId);
  Q.applyMmr.run(REWARDS.pvp_win.mmr,  winnerPlayer.userId);
  Q.applyMmr.run(REWARDS.pvp_loss.mmr, loserPlayer.userId);
  Q.addGold.run(REWARDS.pvp_win.gold,  winnerPlayer.userId);
  Q.addGold.run(REWARDS.pvp_loss.gold, loserPlayer.userId);

  const replay = JSON.stringify({
    team1: p1.board || [], team2: p2.board || [],
    ticks: result.ticks, traits: result.traits, winner: result.winner, walkover: !!walkover,
  });
  Q.insertMatch.run(p1.userId, p2.userId, null, winnerPlayer.userId, 0, replay);

  // quests
  for (const p of match.players) {
    bumpQuestSafely(p.userId, 'play_3', 1);
    bumpQuestSafely(p.userId, 'place_5', (p.board || []).length);
  }
  bumpQuestSafely(winnerPlayer.userId, 'win_2', 1);
  const skillCasts = result.ticks.flatMap((tk) => tk.fx || []).filter((fx) => fx.t === 'cast').length;
  if (skillCasts > 0) {
    for (const p of match.players) bumpQuestSafely(p.userId, 'use_skill', Math.ceil(skillCasts / 2));
  }

  for (const p of match.players) {
    const updated = Q.publicUser.get(p.userId);
    send(p.ws, {
      type: 'battle_end',
      matchId: match.id,
      winner: result.winner,
      youWon: (p === winnerPlayer),
      walkover: !!walkover,
      reward: p === winnerPlayer ? REWARDS.pvp_win : REWARDS.pvp_loss,
      user: updated,
    });
    const meta = sockets.get(p.ws); if (meta) meta.matchId = null;
  }
  matches.delete(match.id);
}

// ─── WS handlers ───────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  sockets.set(ws, { userId: null, matchId: null });
  send(ws, { type: 'hello' });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    const meta = sockets.get(ws);

    if (msg.type === 'auth') {
      const row = Q.findSession.get(msg.token || '');
      if (!row) return send(ws, { type: 'error', error: 'invalid token' });
      meta.userId = row.user_id;
      const u = Q.publicUser.get(row.user_id);
      send(ws, { type: 'auth_ok', user: u });
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

    if (msg.type === 'submit_board') {
      const m = matches.get(msg.matchId);
      if (!m) return send(ws, { type: 'error', error: 'no match' });
      if (m.state !== 'placement') return send(ws, { type: 'error', error: 'placement closed' });
      const player = m.players.find((p) => p.userId === meta.userId);
      if (!player) return;
      const v = validateUserBoard(meta.userId, msg.board);
      if (!v.ok) return send(ws, { type: 'error', error: v.error });
      player.board = v.board;
      player.ready = true;
      send(ws, { type: 'board_ack' });
      const opp = m.players.find((p) => p !== player);
      send(opp.ws, { type: 'opponent_ready' });
      if (m.players.every((p) => p.ready)) runPvpBattle(m);
      return;
    }

    if (msg.type === 'concede') {
      if (!meta.matchId) return;
      const m = matches.get(meta.matchId); if (!m) return;
      const me = m.players.find((p) => p.userId === meta.userId);
      const opp = m.players.find((p) => p !== me);
      finishMatch(m, { winner: opp === m.players[0] ? 1 : 2, ticks: [], traits: { 1: { counts: {}, active: {} }, 2: { counts: {}, active: {} } } }, true);
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
    if (meta.matchId && matches.has(meta.matchId)) {
      const m = matches.get(meta.matchId);
      if (m.state === 'placement' || m.state === 'battle') {
        const me = m.players.find((p) => p.ws === ws);
        const opp = m.players.find((p) => p !== me);
        if (opp && opp.ws.readyState === opp.ws.OPEN) {
          finishMatch(m, { winner: opp === m.players[0] ? 1 : 2, ticks: [], traits: { 1: { counts: {}, active: {} }, 2: { counts: {}, active: {} } } }, true);
        } else {
          matches.delete(m.id);
        }
      }
    }
    sockets.delete(ws);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[rift-realm] listening on :${PORT} (HTTP + WS@/ws)`);
});

module.exports = { app, server };
