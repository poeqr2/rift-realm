const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ------------------------------------------------------------------
// DATABASE SETUP
// ------------------------------------------------------------------
const db = new Database(path.join(__dirname, 'rift_realm.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    gold INTEGER DEFAULT 100,
    mmr INTEGER DEFAULT 1000,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS units_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    cost INTEGER NOT NULL,
    hp INTEGER NOT NULL,
    attack INTEGER NOT NULL,
    speed INTEGER NOT NULL,
    skill_name TEXT NOT NULL,
    skill_damage INTEGER DEFAULT 0,
    skill_desc TEXT
  );

  CREATE TABLE IF NOT EXISTS user_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (unit_id) REFERENCES units_catalog(id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    winner_id INTEGER,
    replay_data TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id)
  );
`);

// ------------------------------------------------------------------
// SEED THE 12 UNIT CATALOG (only on first run)
// ------------------------------------------------------------------
const catalogCount = db.prepare('SELECT COUNT(*) AS c FROM units_catalog').get().c;
if (catalogCount === 0) {
  const insertUnit = db.prepare(`
    INSERT INTO units_catalog (name, emoji, cost, hp, attack, speed, skill_name, skill_damage, skill_desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const units = [
    ['Dragon',      '🐉', 5, 12, 8, 3, 'Fire Breath',   24, '3x damage to a row'],
    ['Knight',      '🗡️', 3,  8, 5, 4, 'Shield Bash',    5, 'Stuns target for 1 turn'],
    ['Mage',        '🔮', 4,  5, 9, 6, 'Arcane Blast',  18, '2x damage to lowest HP enemy'],
    ['Assassin',    '🗡️', 3,  4, 10,9, 'Backstab',      30, '3x damage on a single enemy'],
    ['Healer',      '💚', 3,  6, 2, 5, 'Heal',           5, 'Heal lowest HP ally for 5'],
    ['Archer',      '🏹', 2,  5, 6, 7, 'Volley',         4, 'Hits 2 random enemies for 70% atk'],
    ['Golem',       '🪨', 4, 15, 3, 1, 'Taunt',          0, 'Forces enemies to target self for 1 round'],
    ['Necromancer', '💀', 5,  6, 7, 5, 'Raise Dead',     0, 'Revives a dead ally with 50% HP'],
    ['Valkyrie',    '⚔️', 4,  9, 6, 6, 'War Cry',        0, 'Buffs all allies +2 attack for the round'],
    ['Phoenix',     '🔥', 5,  7, 7, 8, 'Rebirth',        0, 'On death, revives once at 40% HP'],
    ['IceWitch',    '🧊', 4,  6, 7, 6, 'Freeze',         0, 'Freezes one enemy for 2 turns'],
    ['StormLord',   '🌪️', 5,  8, 6, 7, 'Storm',          3, 'Damages ALL enemies for 3'],
  ];

  const seed = db.transaction((rows) => {
    for (const r of rows) insertUnit.run(...r);
  });
  seed(units);
  console.log('[db] seeded units_catalog with 12 units');
}

// ------------------------------------------------------------------
// PREPARED STATEMENTS
// ------------------------------------------------------------------
const stmts = {
  insertUser: db.prepare('INSERT INTO users (username, password) VALUES (?, ?)'),
  findUserByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  publicUser: db.prepare('SELECT id, username, gold, mmr, wins, losses FROM users WHERE id = ?'),
  updateGold: db.prepare('UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?'),
  addUserUnit: db.prepare('INSERT INTO user_units (user_id, unit_id) VALUES (?, ?)'),
  myUnits: db.prepare(`
    SELECT uu.id AS owned_id, c.*
    FROM user_units uu
    JOIN units_catalog c ON c.id = uu.unit_id
    WHERE uu.user_id = ?
  `),
  catalog: db.prepare('SELECT * FROM units_catalog ORDER BY cost, id'),
  catalogById: db.prepare('SELECT * FROM units_catalog WHERE id = ?'),
  leaderboard: db.prepare(`
    SELECT id, username, mmr, wins, losses
    FROM users
    ORDER BY mmr DESC, wins DESC
    LIMIT 20
  `),
  recordMatch: db.prepare(`
    INSERT INTO matches (player1_id, player2_id, winner_id, replay_data)
    VALUES (?, ?, ?, ?)
  `),
  applyWin: db.prepare('UPDATE users SET wins = wins + 1, mmr = mmr + 25, gold = gold + 50 WHERE id = ?'),
  applyLoss: db.prepare('UPDATE users SET losses = losses + 1, mmr = MAX(0, mmr - 15), gold = gold + 15 WHERE id = ?'),
};

// ------------------------------------------------------------------
// TOKEN STORE (simple in-memory)
// ------------------------------------------------------------------
const tokens = new Map(); // token -> userId

function newToken(userId) {
  const t = uuidv4();
  tokens.set(t, userId);
  return t;
}
function authUser(token) {
  if (!token) return null;
  const id = tokens.get(token);
  if (!id) return null;
  return stmts.findUserById.get(id);
}

// ------------------------------------------------------------------
// EXPRESS APP
// ------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- AUTH ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
  if (username.length < 3 || password.length < 3) return res.status(400).json({ success: false, error: 'username/password too short' });

  if (stmts.findUserByName.get(username)) {
    return res.status(409).json({ success: false, error: 'username taken' });
  }
  const hash = bcrypt.hashSync(password, 8);
  const info = stmts.insertUser.run(username, hash);
  const user = stmts.publicUser.get(info.lastInsertRowid);

  // Starter pack: give a couple of cheap units
  stmts.addUserUnit.run(user.id, 6); // Archer
  stmts.addUserUnit.run(user.id, 2); // Knight

  const token = newToken(user.id);
  res.json({ success: true, token, user });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });

  const row = stmts.findUserByName.get(username);
  if (!row || !bcrypt.compareSync(password, row.password)) {
    return res.status(401).json({ success: false, error: 'invalid credentials' });
  }
  const user = stmts.publicUser.get(row.id);
  const token = newToken(user.id);
  res.json({ success: true, token, user });
});

// --- UNITS ---
app.get('/api/units', (_req, res) => {
  res.json({ success: true, units: stmts.catalog.all() });
});

app.post('/api/units/buy', (req, res) => {
  const { token, unitId } = req.body || {};
  const user = authUser(token);
  if (!user) return res.status(401).json({ success: false, error: 'not authenticated' });

  const unit = stmts.catalogById.get(unitId);
  if (!unit) return res.status(404).json({ success: false, error: 'unit not found' });

  const ok = stmts.updateGold.run(unit.cost, user.id, unit.cost);
  if (ok.changes === 0) return res.status(400).json({ success: false, error: 'not enough gold' });

  stmts.addUserUnit.run(user.id, unit.id);
  const updated = stmts.publicUser.get(user.id);
  res.json({ success: true, user: updated, unit });
});

app.get('/api/my-units', (req, res) => {
  const token = req.query.token || req.headers['x-token'];
  const user = authUser(token);
  if (!user) return res.status(401).json({ success: false, error: 'not authenticated' });
  res.json({ success: true, units: stmts.myUnits.all(user.id) });
});

// --- LEADERBOARD ---
function leaderboardHandler(_req, res) {
  res.json({ success: true, players: stmts.leaderboard.all() });
}
app.get('/api/leaderboard', leaderboardHandler);
app.post('/api/leaderboard', leaderboardHandler);

// --- PROFILE ---
app.post('/api/profile', (req, res) => {
  const { token } = req.body || {};
  const user = authUser(token);
  if (!user) return res.status(401).json({ success: false, error: 'not authenticated' });
  const pub = stmts.publicUser.get(user.id);
  const owned = stmts.myUnits.all(user.id);
  res.json({ success: true, user: pub, units: owned });
});

// ------------------------------------------------------------------
// HTTP + WEBSOCKET SERVER
// ------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// connection state
const sockets = new Map(); // ws -> { userId, matchId }
let queue = [];            // [{ ws, userId }]
const matches = new Map(); // matchId -> match state

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function getOpponent(match, userId) {
  return match.players.find((p) => p.userId !== userId);
}

// ------------------------------------------------------------------
// BATTLE SIMULATION
// ------------------------------------------------------------------
// A board is an array of placed units: { catalogId, x, y } (x in 0..4, y in 0..1)
// Internally, each combat unit gets:
//   { uid, team, name, emoji, hp, maxHp, atk, baseAtk, speed, skill, x, y,
//     alive, frozen, stunned, taunting, atkBuff, skillCd, hasRebirthed }

function buildCombatants(board, team, takenUids) {
  const out = [];
  for (const slot of board) {
    const c = stmts.catalogById.get(slot.catalogId);
    if (!c) continue;
    out.push({
      uid: takenUids.next(),
      team,
      catalogId: c.id,
      name: c.name,
      emoji: c.emoji,
      hp: c.hp,
      maxHp: c.hp,
      atk: c.attack,
      baseAtk: c.attack,
      speed: c.speed,
      skillName: c.skill_name,
      skillDamage: c.skill_damage,
      x: slot.x | 0,
      y: slot.y | 0,
      alive: true,
      frozen: 0,
      stunned: 0,
      atkBuff: 0,
      skillCd: 0,        // 0 means ready
      hasRebirthed: false,
      tauntedBy: null,   // unit id forcing targeting
    });
  }
  return out;
}

function uidGen() {
  let n = 0;
  return { next: () => ++n };
}

function aliveEnemies(units, team) {
  return units.filter((u) => u.alive && u.team !== team);
}
function aliveAllies(units, team) {
  return units.filter((u) => u.alive && u.team === team);
}

// nearest = smallest manhattan distance, attackers from team A treat enemies as if mirrored
function chooseTarget(self, units) {
  const enemies = aliveEnemies(units, self.team);
  if (enemies.length === 0) return null;
  // Honor taunt: if any enemy is taunting, force-target it
  const taunters = enemies.filter((e) => e.tauntActive);
  if (taunters.length > 0) {
    return taunters.sort((a, b) => dist(self, a) - dist(self, b))[0];
  }
  return enemies.sort((a, b) => dist(self, a) - dist(self, b))[0];
}
function dist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function dealDamage(attacker, target, amount, events, kind = 'attack') {
  if (!target.alive) return;
  const dmg = Math.max(0, Math.floor(amount));
  target.hp -= dmg;
  events.push({
    kind,
    from: attacker ? attacker.uid : null,
    to: target.uid,
    amount: dmg,
    targetHp: Math.max(0, target.hp),
  });
  if (target.hp <= 0) {
    // Phoenix Rebirth
    if (target.name === 'Phoenix' && !target.hasRebirthed) {
      target.hasRebirthed = true;
      target.hp = Math.max(1, Math.floor(target.maxHp * 0.4));
      events.push({ kind: 'rebirth', to: target.uid, hp: target.hp });
      return;
    }
    target.alive = false;
    target.hp = 0;
    events.push({ kind: 'death', to: target.uid });
  }
}

function useSkill(self, units, events) {
  const team = self.team;
  switch (self.name) {
    case 'Dragon': {
      // 3x damage to a row (target a row of enemies)
      const enemies = aliveEnemies(units, team);
      if (enemies.length === 0) break;
      // Pick the row with most enemies
      const rows = {};
      for (const e of enemies) rows[e.y] = (rows[e.y] || 0) + 1;
      const targetRow = Number(Object.keys(rows).sort((a, b) => rows[b] - rows[a])[0]);
      const dmg = self.atk * 3;
      events.push({ kind: 'skill', from: self.uid, name: 'Fire Breath' });
      for (const e of enemies.filter((u) => u.y === targetRow)) {
        dealDamage(self, e, dmg, events, 'skill_hit');
      }
      break;
    }
    case 'Knight': {
      const t = chooseTarget(self, units);
      if (!t) break;
      events.push({ kind: 'skill', from: self.uid, name: 'Shield Bash', to: t.uid });
      dealDamage(self, t, self.atk, events, 'skill_hit');
      if (t.alive) t.stunned = Math.max(t.stunned, 1);
      break;
    }
    case 'Mage': {
      const enemies = aliveEnemies(units, team);
      if (enemies.length === 0) break;
      const t = enemies.sort((a, b) => a.hp - b.hp)[0];
      events.push({ kind: 'skill', from: self.uid, name: 'Arcane Blast', to: t.uid });
      dealDamage(self, t, self.atk * 2, events, 'skill_hit');
      break;
    }
    case 'Assassin': {
      const t = chooseTarget(self, units);
      if (!t) break;
      events.push({ kind: 'skill', from: self.uid, name: 'Backstab', to: t.uid });
      dealDamage(self, t, self.atk * 3, events, 'skill_hit');
      break;
    }
    case 'Healer': {
      const allies = aliveAllies(units, team).filter((a) => a.hp < a.maxHp);
      if (allies.length === 0) break;
      const t = allies.sort((a, b) => a.hp - b.hp)[0];
      const heal = 5;
      t.hp = Math.min(t.maxHp, t.hp + heal);
      events.push({ kind: 'heal', from: self.uid, to: t.uid, amount: heal, targetHp: t.hp });
      break;
    }
    case 'Archer': {
      const enemies = aliveEnemies(units, team);
      if (enemies.length === 0) break;
      events.push({ kind: 'skill', from: self.uid, name: 'Volley' });
      const picks = [];
      const pool = [...enemies];
      for (let i = 0; i < 2 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
      }
      const dmg = Math.floor(self.atk * 0.7);
      for (const p of picks) dealDamage(self, p, dmg, events, 'skill_hit');
      break;
    }
    case 'Golem': {
      events.push({ kind: 'skill', from: self.uid, name: 'Taunt' });
      self.tauntActive = true;
      self.tauntTtl = 1; // for 1 round
      break;
    }
    case 'Necromancer': {
      const dead = units.filter((u) => u.team === team && !u.alive);
      if (dead.length === 0) break;
      const t = dead[0];
      t.alive = true;
      t.hp = Math.max(1, Math.floor(t.maxHp * 0.5));
      t.hasRebirthed = false;
      events.push({ kind: 'revive', from: self.uid, to: t.uid, hp: t.hp });
      break;
    }
    case 'Valkyrie': {
      events.push({ kind: 'skill', from: self.uid, name: 'War Cry' });
      for (const a of aliveAllies(units, team)) {
        a.atk = a.baseAtk + 2 + a.atkBuff;
        a.warCryTtl = 1;
      }
      break;
    }
    case 'Phoenix': {
      // passive ability handled in dealDamage; active skill = strong attack
      const t = chooseTarget(self, units);
      if (!t) break;
      events.push({ kind: 'skill', from: self.uid, name: 'Flame Strike', to: t.uid });
      dealDamage(self, t, Math.floor(self.atk * 1.5), events, 'skill_hit');
      break;
    }
    case 'IceWitch': {
      const enemies = aliveEnemies(units, team);
      if (enemies.length === 0) break;
      const t = enemies[Math.floor(Math.random() * enemies.length)];
      events.push({ kind: 'skill', from: self.uid, name: 'Freeze', to: t.uid });
      t.frozen = 2;
      break;
    }
    case 'StormLord': {
      events.push({ kind: 'skill', from: self.uid, name: 'Storm' });
      for (const e of aliveEnemies(units, team)) {
        dealDamage(self, e, 3, events, 'skill_hit');
      }
      break;
    }
    default:
      break;
  }
  self.skillCd = 2; // cooldown after use
}

function basicAttack(self, units, events) {
  const t = chooseTarget(self, units);
  if (!t) return;
  events.push({ kind: 'attack', from: self.uid, to: t.uid });
  dealDamage(self, t, self.atk, events, 'attack');
}

function endOfRoundCleanup(units) {
  for (const u of units) {
    if (u.tauntTtl > 0) {
      u.tauntTtl -= 1;
      if (u.tauntTtl === 0) u.tauntActive = false;
    }
    if (u.warCryTtl > 0) {
      u.warCryTtl -= 1;
      if (u.warCryTtl === 0) u.atk = u.baseAtk + u.atkBuff;
    }
    if (u.frozen > 0) u.frozen -= 1;
    if (u.stunned > 0) u.stunned -= 1;
    if (u.skillCd > 0) u.skillCd -= 1;
  }
}

function teamAlive(units, team) {
  return units.some((u) => u.team === team && u.alive);
}

function simulateBattle(board1, board2) {
  const ids = uidGen();
  const team1 = buildCombatants(board1, 1, ids);
  const team2 = buildCombatants(board2, 2, ids);
  const units = [...team1, ...team2];

  const ticks = [];
  // Initial snapshot
  ticks.push({
    tick: 0,
    events: [{ kind: 'start' }],
    state: snapshotUnits(units),
  });

  const MAX_ROUNDS = 30;
  let round = 0;
  while (round < MAX_ROUNDS && teamAlive(units, 1) && teamAlive(units, 2)) {
    round += 1;
    const events = [];
    // act in speed order (descending), tiebreak by team alternation
    const order = units
      .filter((u) => u.alive)
      .sort((a, b) => (b.speed - a.speed) || (a.team - b.team) || (a.uid - b.uid));

    for (const u of order) {
      if (!u.alive) continue;
      if (u.frozen > 0) {
        events.push({ kind: 'frozen', to: u.uid });
        continue;
      }
      if (u.stunned > 0) {
        events.push({ kind: 'stunned', to: u.uid });
        continue;
      }
      if (!teamAlive(units, u.team === 1 ? 2 : 1)) break;

      if (u.skillCd === 0) {
        useSkill(u, units, events);
      } else {
        basicAttack(u, units, events);
      }
    }

    endOfRoundCleanup(units);

    ticks.push({
      tick: round,
      events,
      state: snapshotUnits(units),
    });
  }

  let winner = 0;
  if (teamAlive(units, 1) && !teamAlive(units, 2)) winner = 1;
  else if (teamAlive(units, 2) && !teamAlive(units, 1)) winner = 2;
  else {
    // tiebreak by total remaining HP
    const hp1 = units.filter((u) => u.team === 1).reduce((s, u) => s + Math.max(0, u.hp), 0);
    const hp2 = units.filter((u) => u.team === 2).reduce((s, u) => s + Math.max(0, u.hp), 0);
    winner = hp1 >= hp2 ? 1 : 2;
  }

  return { ticks, winner, totalRounds: round };
}

function snapshotUnits(units) {
  return units.map((u) => ({
    uid: u.uid,
    team: u.team,
    name: u.name,
    emoji: u.emoji,
    hp: Math.max(0, u.hp),
    maxHp: u.maxHp,
    atk: u.atk,
    x: u.x,
    y: u.y,
    alive: u.alive,
    frozen: u.frozen,
    stunned: u.stunned,
  }));
}

// ------------------------------------------------------------------
// MATCHMAKING
// ------------------------------------------------------------------
function tryMatch() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    if (a.ws.readyState !== a.ws.OPEN) { queue.unshift(b); continue; }
    if (b.ws.readyState !== b.ws.OPEN) { queue.unshift(a); continue; }
    createMatch(a, b);
  }
}

function createMatch(a, b) {
  const matchId = uuidv4();
  const userA = stmts.publicUser.get(a.userId);
  const userB = stmts.publicUser.get(b.userId);

  const match = {
    id: matchId,
    players: [
      { ws: a.ws, userId: a.userId, username: userA.username, board: null, ready: false },
      { ws: b.ws, userId: b.userId, username: userB.username, board: null, ready: false },
    ],
    state: 'placement',
    createdAt: Date.now(),
  };
  matches.set(matchId, match);

  for (const p of match.players) {
    const meta = sockets.get(p.ws);
    if (meta) meta.matchId = matchId;
  }

  send(a.ws, {
    type: 'match',
    matchId,
    opponent: { id: userB.id, username: userB.username, mmr: userB.mmr },
    yourTurn: true,
  });
  send(b.ws, {
    type: 'match',
    matchId,
    opponent: { id: userA.id, username: userA.username, mmr: userA.mmr },
    yourTurn: true,
  });
}

function validateBoard(units, userId) {
  if (!Array.isArray(units) || units.length === 0 || units.length > 10) return false;
  const seen = new Set();
  for (const u of units) {
    if (typeof u.catalogId !== 'number') return false;
    if (typeof u.x !== 'number' || typeof u.y !== 'number') return false;
    if (u.x < 0 || u.x > 4 || u.y < 0 || u.y > 1) return false;
    const key = `${u.x},${u.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (!stmts.catalogById.get(u.catalogId)) return false;
  }
  return true;
}

function startBattle(match) {
  match.state = 'battle';
  const [p1, p2] = match.players;
  const result = simulateBattle(p1.board, p2.board);

  // Stream ticks with small delays
  let i = 0;
  const stepDelay = 700;
  const sendTick = () => {
    if (i >= result.ticks.length) {
      finishMatch(match, result);
      return;
    }
    const tick = result.ticks[i++];
    for (const p of match.players) {
      send(p.ws, { type: 'battle_tick', matchId: match.id, tick: tick.tick, events: tick.events, state: tick.state });
    }
    setTimeout(sendTick, stepDelay);
  };
  sendTick();
}

function finishMatch(match, result) {
  const [p1, p2] = match.players;
  const winnerPlayer = result.winner === 1 ? p1 : p2;
  const loserPlayer  = result.winner === 1 ? p2 : p1;

  const replay = JSON.stringify({
    boards: { p1: p1.board, p2: p2.board },
    ticks: result.ticks,
    winner: result.winner,
    rounds: result.totalRounds,
  });

  stmts.recordMatch.run(p1.userId, p2.userId, winnerPlayer.userId, replay);
  stmts.applyWin.run(winnerPlayer.userId);
  stmts.applyLoss.run(loserPlayer.userId);

  for (const p of match.players) {
    const updated = stmts.publicUser.get(p.userId);
    send(p.ws, {
      type: 'battle_end',
      matchId: match.id,
      winner: winnerPlayer.userId,
      youWon: p.userId === winnerPlayer.userId,
      replayData: replay,
      user: updated,
    });
    const meta = sockets.get(p.ws);
    if (meta) meta.matchId = null;
  }

  matches.delete(match.id);
}

// ------------------------------------------------------------------
// WS HANDLERS
// ------------------------------------------------------------------
wss.on('connection', (ws) => {
  sockets.set(ws, { userId: null, matchId: null });
  send(ws, { type: 'hello', msg: 'connected to Rift Realm' });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    const meta = sockets.get(ws);
    if (meta) {
      // remove from queue
      queue = queue.filter((q) => q.ws !== ws);
      // if in a match, the other player wins by walkover
      if (meta.matchId && matches.has(meta.matchId)) {
        const match = matches.get(meta.matchId);
        if (match.state === 'placement' || match.state === 'battle') {
          const opp = match.players.find((p) => p.ws !== ws);
          if (opp) {
            stmts.recordMatch.run(match.players[0].userId, match.players[1].userId, opp.userId, JSON.stringify({ walkover: true }));
            stmts.applyWin.run(opp.userId);
            stmts.applyLoss.run(meta.userId);
            const updated = stmts.publicUser.get(opp.userId);
            send(opp.ws, {
              type: 'battle_end',
              matchId: match.id,
              winner: opp.userId,
              youWon: true,
              walkover: true,
              user: updated,
            });
          }
          matches.delete(match.id);
        }
      }
    }
    sockets.delete(ws);
  });
});

function handleMessage(ws, msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'auth') {
    const user = authUser(msg.token);
    if (!user) return send(ws, { type: 'error', error: 'invalid token' });
    sockets.get(ws).userId = user.id;
    send(ws, { type: 'auth_ok', user: stmts.publicUser.get(user.id) });
    return;
  }

  const meta = sockets.get(ws);
  if (!meta || !meta.userId) {
    // allow auth via embedded token for convenience
    if (msg.token) {
      const user = authUser(msg.token);
      if (user) {
        meta.userId = user.id;
      } else {
        return send(ws, { type: 'error', error: 'not authenticated' });
      }
    } else {
      return send(ws, { type: 'error', error: 'not authenticated' });
    }
  }

  if (msg.type === 'queue') {
    if (msg.action === 'join') {
      // ignore if already queued or in match
      if (meta.matchId) return send(ws, { type: 'error', error: 'already in a match' });
      if (queue.find((q) => q.ws === ws)) return;
      queue.push({ ws, userId: meta.userId });
      send(ws, { type: 'queue_status', queued: true, size: queue.length });
      tryMatch();
    } else if (msg.action === 'leave') {
      queue = queue.filter((q) => q.ws !== ws);
      send(ws, { type: 'queue_status', queued: false, size: queue.length });
    }
    return;
  }

  if (msg.type === 'board') {
    const match = matches.get(msg.matchId);
    if (!match) return send(ws, { type: 'error', error: 'match not found' });
    if (match.state !== 'placement') return send(ws, { type: 'error', error: 'placement closed' });
    const player = match.players.find((p) => p.userId === meta.userId);
    if (!player) return send(ws, { type: 'error', error: 'not in this match' });
    if (!validateBoard(msg.units, meta.userId)) return send(ws, { type: 'error', error: 'invalid board' });

    player.board = msg.units;
    player.ready = true;
    send(ws, { type: 'board_ack', matchId: match.id });

    const opponent = getOpponent(match, meta.userId);
    if (opponent) send(opponent.ws, { type: 'opponent_ready', matchId: match.id });

    if (match.players.every((p) => p.ready)) {
      startBattle(match);
    }
    return;
  }

  if (msg.type === 'ping') {
    send(ws, { type: 'pong', t: Date.now() });
    return;
  }

  send(ws, { type: 'error', error: 'unknown message type' });
}

// ------------------------------------------------------------------
// START
// ------------------------------------------------------------------
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`[rift-realm] HTTP + WS listening on :${PORT}`);
});