-- JY Games schema v3: Snake Arena & Block Puzzle Battle (also applied automatically by server/schema.ts)
CREATE TABLE IF NOT EXISTS arena_stats (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    best_len INTEGER NOT NULL DEFAULT 0,
    lines INTEGER NOT NULL DEFAULT 0,
    attack INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
  );

CREATE INDEX IF NOT EXISTS idx_astats ON arena_stats(game, best_score DESC);

CREATE TABLE IF NOT EXISTS arena_games (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    game TEXT NOT NULL,
    kind TEXT NOT NULL,
    humans INTEGER NOT NULL,
    players TEXT NOT NULL,
    winner_name TEXT,
    reason TEXT,
    steps INTEGER,
    counted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL
  );

CREATE TABLE IF NOT EXISTS solo_best (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    mode TEXT NOT NULL,
    best_score INTEGER NOT NULL DEFAULT 0,
    best_ms INTEGER,
    lines INTEGER NOT NULL DEFAULT 0,
    plays INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game, mode)
  );

CREATE INDEX IF NOT EXISTS idx_solo_score ON solo_best(game, mode, best_score DESC);

CREATE INDEX IF NOT EXISTS idx_solo_time ON solo_best(game, mode, best_ms);

CREATE TABLE IF NOT EXISTS solo_runs (
    token_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    mode TEXT NOT NULL,
    score INTEGER NOT NULL,
    ms INTEGER,
    created_at INTEGER NOT NULL
  );
