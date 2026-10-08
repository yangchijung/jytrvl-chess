-- JY Chess D1 schema v1 (also applied automatically at runtime)
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  banned INTEGER NOT NULL DEFAULT 0
  );

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
  );

CREATE INDEX IF NOT EXISTS idx_ratings_board ON ratings(game, rating DESC);

CREATE TABLE IF NOT EXISTS games (
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
  );

CREATE INDEX IF NOT EXISTS idx_games_u0 ON games(seat0_user, ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_u1 ON games(seat1_user, ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_pair ON games(seat0_user, seat1_user, ended_at);

CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  extra TEXT,
  url TEXT
  );
