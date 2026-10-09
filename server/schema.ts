// D1 schema. Applied automatically (idempotent) on first use by both the Pages Functions and the
// realtime worker; the same SQL is in migrations/0001_init.sql for `wrangler d1 migrations apply`.
export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT UNIQUE NOT NULL,
    email TEXT,
    nickname TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER,
    banned INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS ratings (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1200,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ratings_board ON ratings(game, rating DESC)`,
  `CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    game TEXT NOT NULL,
    rated INTEGER NOT NULL,
    counted INTEGER NOT NULL DEFAULT 0,
    seat0_player TEXT, seat0_user TEXT, seat0_name TEXT,
    seat1_player TEXT, seat1_user TEXT, seat1_name TEXT,
    result TEXT, winner INTEGER, reason TEXT,
    state TEXT NOT NULL,
    notation TEXT,
    rating_change TEXT,
    created_at INTEGER NOT NULL,
    ended_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_games_u0 ON games(seat0_user, ended_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_games_u1 ON games(seat1_user, ended_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_games_pair ON games(seat0_user, seat1_user, ended_at)`,
  `CREATE TABLE IF NOT EXISTS territory_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    best_pct REAL NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tstats_score ON territory_stats(best_score DESC)`,
  `CREATE TABLE IF NOT EXISTS territory_games (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    humans INTEGER NOT NULL,
    players TEXT NOT NULL,
    winner_name TEXT,
    reason TEXT,
    ticks INTEGER,
    counted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    extra TEXT,
    url TEXT
  )`,
];

let migrated: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  migrated ??= (async () => {
    const v = await db
      .prepare(`SELECT value FROM config WHERE key = 'schema_version'`)
      .first<{ value: string }>()
      .catch(() => null);
    if (v && Number(v.value) >= SCHEMA_VERSION) return;
    await db.batch(SCHEMA_SQL.map((s) => db.prepare(s)));
    await db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('schema_version', ?)`).bind(String(SCHEMA_VERSION)).run();
  })().catch((e) => {
    migrated = null;
    throw e;
  });
  return migrated;
}

export async function logError(db: D1Database | undefined, source: string, message: string, extra?: string, url?: string) {
  console.error(`[${source}] ${message}`, extra ?? '');
  if (!db) return;
  try {
    await ensureSchema(db);
    await db
      .prepare(`INSERT INTO errors (ts, source, message, extra, url) VALUES (?, ?, ?, ?, ?)`)
      .bind(Date.now(), source, message.slice(0, 1000), extra?.slice(0, 4000) ?? null, url?.slice(0, 500) ?? null)
      .run();
    // keep the table small
    await db.prepare(`DELETE FROM errors WHERE id < (SELECT MAX(id) - 5000 FROM errors)`).run();
  } catch {
    /* never throw from the logger */
  }
}
