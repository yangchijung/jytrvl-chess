-- Territory Rush tables (schema v2, also applied automatically at runtime)
CREATE TABLE IF NOT EXISTS territory_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  best_pct REAL NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_tstats_score ON territory_stats(best_score DESC);

CREATE TABLE IF NOT EXISTS territory_games (
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
  );
