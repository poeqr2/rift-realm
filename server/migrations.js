// /projects/sandbox/rift-realm/server/migrations.js
// Tiny migration runner. Each migration has an integer version and a SQL block.
// On boot, we apply any migration whose version is > the stored one in `meta`.

function ensureMetaTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function currentVersion(db) {
  ensureMetaTable(db);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  return row ? Number(row.value) : 0;
}

function setVersion(db, v) {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(v));
}

const MIGRATIONS = [
  // v1: base schema (users, sessions, units, items, matches, quests)
  {
    version: 1,
    up: (db) => {
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
    },
  },

  // v2: seasons + per-season MMR tracking + abandon counter + games count for K-factor
  {
    version: 2,
    up: (db) => {
      db.exec(`
        ALTER TABLE users ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN season_id INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE users ADD COLUMN peak_mmr INTEGER NOT NULL DEFAULT 1000;
        ALTER TABLE users ADD COLUMN abandons INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN abandons_today INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN abandon_day INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN winstreak INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN losestreak INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN last_login INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE IF NOT EXISTS seasons (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          starts_at INTEGER NOT NULL,
          ends_at INTEGER NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0
        );
      `);
      // Seed season 1 if missing — runs from now until 30 days later.
      const exists = db.prepare('SELECT id FROM seasons WHERE id = 1').get();
      if (!exists) {
        const start = Math.floor(Date.now() / 1000);
        const end = start + 30 * 24 * 3600;
        db.prepare('INSERT INTO seasons (id, name, starts_at, ends_at) VALUES (1, ?, ?, ?)')
          .run('Season 1: Awakening', start, end);
      }
    },
  },

  // v3: friends + private invites + replay public sharing tokens
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS friends (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          friend_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          UNIQUE(user_id, friend_id)
        );
        CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);

        CREATE TABLE IF NOT EXISTS friend_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_id INTEGER NOT NULL,
          to_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_freq_to ON friend_requests(to_id, status);

        ALTER TABLE matches ADD COLUMN replay_token TEXT;
        ALTER TABLE matches ADD COLUMN public INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE users ADD COLUMN friend_code TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code);
      `);
    },
  },

  // v4: loadouts presets stored server-side per user (3 slots)
  {
    version: 4,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS loadouts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          slot INTEGER NOT NULL,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          UNIQUE(user_id, slot)
        );
      `);
    },
  },
];

function runMigrations(db) {
  ensureMetaTable(db);
  const v = currentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > v).sort((a, b) => a.version - b.version);
  if (pending.length === 0) {
    console.log(`[migrations] DB at v${v} (latest)`);
    return;
  }
  for (const m of pending) {
    console.log(`[migrations] applying v${m.version}`);
    db.transaction(() => {
      m.up(db);
      setVersion(db, m.version);
    })();
  }
  console.log(`[migrations] DB now at v${currentVersion(db)}`);
}

module.exports = { runMigrations, MIGRATIONS };
