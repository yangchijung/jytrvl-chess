import { ensureSchema, logError } from '../../server/schema';
import { updateElo, ratingIneligible, START_RATING } from '../../server/elo';
import type { Rules } from '../../shared/games/registry';
import type { GameResult } from '../../shared/types';
import type { RoomMeta, SeatInfo, RoomStateMsg } from './protocol';
import type { Env } from './env';

type RatingChange = RoomStateMsg['room']['ratingChange'];

/** Stores a finished online game and, when eligible, updates both players' ratings atomically. */
export async function recordFinishedGame(
  env: Env,
  meta: RoomMeta,
  seats: [SeatInfo | null, SeatInfo | null],
  rules: Rules,
  result: GameResult,
): Promise<RatingChange> {
  const db = env.DB;
  await ensureSchema(db);
  const now = Date.now();
  const u0 = seats[0]?.userId ?? null;
  const u1 = seats[1]?.userId ?? null;
  const gameId = `${meta.id}-${now.toString(36)}`;
  const plies = rules.moveList().length;

  let pairGamesToday = 0;
  if (u0 && u1) {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM games WHERE counted = 1 AND game = ? AND ended_at > ? AND ((seat0_user = ? AND seat1_user = ?) OR (seat0_user = ? AND seat1_user = ?))`,
      )
      .bind(meta.game, now - 86400000, u0, u1, u1, u0)
      .first<{ n: number }>();
    pairGamesToday = row?.n ?? 0;
  }
  const why = ratingIneligible({
    rated: meta.rated,
    user0: u0,
    user1: u1,
    ipHash0: seats[0]?.ipHash ?? null,
    ipHash1: seats[1]?.ipHash ?? null,
    plies,
    reason: result.reason,
    pairGamesToday,
  });

  let change: RatingChange = null;
  const stmts: D1PreparedStatement[] = [];
  if (!why && u0 && u1) {
    const get = (u: string) =>
      db
        .prepare(`SELECT rating, games FROM ratings WHERE user_id = ? AND game = ?`)
        .bind(u, meta.game)
        .first<{ rating: number; games: number }>();
    const r0 = (await get(u0)) ?? { rating: START_RATING, games: 0 };
    const r1 = (await get(u1)) ?? { rating: START_RATING, games: 0 };
    const score = result.kind === 'draw' ? 0.5 : result.winner === 0 ? 1 : 0;
    const [n0, n1] = updateElo(r0, r1, score);
    change = [
      { old: Math.round(r0.rating), new: Math.round(n0) },
      { old: Math.round(r1.rating), new: Math.round(n1) },
    ];
    const upsert = (u: string, rating: number, w: number, l: number, d: number) =>
      db
        .prepare(
          `INSERT INTO ratings (user_id, game, rating, games, wins, losses, draws, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
           ON CONFLICT(user_id, game) DO UPDATE SET rating = excluded.rating, games = games + 1, wins = wins + excluded.wins,
           losses = losses + excluded.losses, draws = draws + excluded.draws, updated_at = excluded.updated_at`,
        )
        .bind(u, meta.game, rating, w, l, d, now);
    const w0 = score === 1 ? 1 : 0,
      l0 = score === 0 ? 1 : 0,
      d0 = score === 0.5 ? 1 : 0;
    stmts.push(upsert(u0, n0, w0, l0, d0), upsert(u1, n1, l0, w0, d0));
  }
  // store the game for both players' history (guests' games are kept too, but only users can list them)
  stmts.push(
    db
      .prepare(
        `INSERT INTO games (id, room_id, game, rated, counted, seat0_player, seat0_user, seat0_name, seat1_player, seat1_user, seat1_name,
          result, winner, reason, state, notation, rating_change, created_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        gameId,
        meta.id,
        meta.game,
        meta.rated ? 1 : 0,
        why ? 0 : 1,
        seats[0]?.playerId ?? null,
        u0,
        seats[0]?.name ?? null,
        seats[1]?.playerId ?? null,
        u1,
        seats[1]?.name ?? null,
        result.kind,
        result.winner ?? null,
        result.reason,
        JSON.stringify(rules.serialize()),
        JSON.stringify(rules.records().map((r) => r.notation)),
        change ? JSON.stringify(change) : why ? JSON.stringify({ unrated: why }) : null,
        meta.createdAt,
        now,
      ),
  );
  try {
    await db.batch(stmts);
  } catch (e) {
    await logError(db, 'realtime', 'recordFinishedGame failed', String(e));
    return null;
  }
  return change;
}
