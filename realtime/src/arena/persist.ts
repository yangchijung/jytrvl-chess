// Stores finished arena matches and updates per-game stats (separate from the board-game Elo).
// Ranked Block Puzzle Battle additionally updates the 'blocks' rating in the shared ratings table.
import { ensureSchema, logError } from '../../../server/schema';
import { updateElo, START_RATING, MAX_PAIR_GAMES_PER_DAY } from '../../../server/elo';
import type { ArenaMeta, ArenaSeat } from './ArenaRoom';
import type { Env } from '../env';

export interface ArenaOutcome {
  winner: number | null;
  reason: string;
  ranking: number[];
  steps: number;
  /** matches shorter than this (in steps/ticks) only count when they ended by knockout */
  minSteps: number;
  knockout: boolean;
  players: { score: number; kills: number; len: number; lines: number; attack: number }[];
}

export interface RecordResult {
  recorded: boolean;
  ratingChange: { old: number; new: number }[] | null;
}

/**
 * Eligibility: at least 2 human players and a real match (min length or knockout).
 * Wins and kills are not credited when every human shares one network (self-farming guard).
 */
export async function recordArenaMatch(env: Env, meta: ArenaMeta, seats: ArenaSeat[], o: ArenaOutcome): Promise<boolean> {
  return (await recordArenaMatchFull(env, meta, seats, o)).recorded;
}

export async function recordArenaMatchFull(env: Env, meta: ArenaMeta, seats: ArenaSeat[], o: ArenaOutcome): Promise<RecordResult> {
  const db = env.DB;
  await ensureSchema(db);
  const now = Date.now();
  const humans = seats.map((s, k) => ({ s, k })).filter((x) => !x.s.bot);
  const eligible = humans.length >= 2 && (o.steps >= o.minSteps || o.knockout);
  const ips = new Set(humans.map((h) => h.s.ipHash).filter(Boolean));
  const sameNetwork = humans.length >= 2 && ips.size <= 1;
  const stmts: D1PreparedStatement[] = [];
  stmts.push(
    db
      .prepare(`INSERT INTO arena_games (id, room_id, game, kind, humans, players, winner_name, reason, steps, counted, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        `${meta.id}-${now.toString(36)}`,
        meta.id,
        meta.game,
        meta.kind,
        humans.length,
        JSON.stringify(seats.map((s, k) => ({ name: s.name, bot: s.bot, user: s.userId, rank: o.ranking.indexOf(k) + 1, ...o.players[k] }))),
        o.winner !== null ? seats[o.winner]?.name ?? null : null,
        o.reason,
        o.steps,
        eligible ? 1 : 0,
        meta.createdAt,
        now,
      ),
  );
  if (eligible) {
    for (const { s, k } of humans) {
      if (!s.userId) continue;
      const p = o.players[k];
      const win = o.winner === k && !sameNetwork ? 1 : 0;
      const kills = sameNetwork ? 0 : p.kills;
      stmts.push(
        db
          .prepare(
            `INSERT INTO arena_stats (user_id, game, games, wins, kills, best_score, best_len, lines, attack, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, game) DO UPDATE SET games = games + 1, wins = wins + excluded.wins, kills = kills + excluded.kills,
             best_score = MAX(best_score, excluded.best_score), best_len = MAX(best_len, excluded.best_len),
             lines = lines + excluded.lines, attack = attack + excluded.attack, updated_at = excluded.updated_at`,
          )
          .bind(s.userId, meta.game, win, kills, p.score, p.len, p.lines, p.attack, now),
      );
    }
  }

  // ranked Block Puzzle Battle: Elo (same anti-abuse rules as the board games)
  let ratingChange: RecordResult['ratingChange'] = null;
  if (meta.kind === 'ranked' && eligible && humans.length === 2 && !sameNetwork && o.winner !== null) {
    const [a, b] = humans;
    if (a.s.userId && b.s.userId && a.s.userId !== b.s.userId) {
      const pair = await db
        .prepare(`SELECT COUNT(*) AS n FROM arena_games WHERE game = 'blocks' AND kind = 'ranked' AND counted = 1 AND ended_at > ? AND players LIKE ? AND players LIKE ?`)
        .bind(now - 86400000, `%"user":"${a.s.userId}"%`, `%"user":"${b.s.userId}"%`)
        .first<{ n: number }>();
      if ((pair?.n ?? 0) < MAX_PAIR_GAMES_PER_DAY) {
        const get = (u: string) => db.prepare(`SELECT rating, games FROM ratings WHERE user_id = ? AND game = 'blocks'`).bind(u).first<{ rating: number; games: number }>();
        const ra = (await get(a.s.userId)) ?? { rating: START_RATING, games: 0 };
        const rb = (await get(b.s.userId)) ?? { rating: START_RATING, games: 0 };
        const score = o.winner === a.k ? 1 : 0;
        const [na, nb] = updateElo(ra, rb, score);
        const byIdx: { old: number; new: number }[] = [];
        byIdx[a.k] = { old: Math.round(ra.rating), new: Math.round(na) };
        byIdx[b.k] = { old: Math.round(rb.rating), new: Math.round(nb) };
        ratingChange = byIdx;
        const up = (u: string, r: number, w: number) =>
          db
            .prepare(
              `INSERT INTO ratings (user_id, game, rating, games, wins, losses, draws, updated_at) VALUES (?, 'blocks', ?, 1, ?, ?, 0, ?)
               ON CONFLICT(user_id, game) DO UPDATE SET rating = excluded.rating, games = games + 1, wins = wins + excluded.wins, losses = losses + excluded.losses, updated_at = excluded.updated_at`,
            )
            .bind(u, r, w, 1 - w, now);
        stmts.push(up(a.s.userId, na, score), up(b.s.userId, nb, 1 - score));
      }
    }
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    await logError(db, meta.game, 'record failed', String(e));
    return { recorded: false, ratingChange: null };
  }
  return { recorded: eligible && humans.some((h) => h.s.userId), ratingChange };
}
