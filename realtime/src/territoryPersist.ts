import { ensureSchema, logError } from '../../server/schema';
import type { TerritoryGame } from '../../shared/territory/engine';
import type { TRoomMeta, TSeat } from './TerritoryRoom';
import type { Env } from './env';

export const T_MIN_TICKS = 300; // 30 s

/**
 * Stores a finished match and updates Territory Rush stats (separate from the board-game Elo).
 * Eligibility: at least 2 human players, at least 30 s of play (or a knockout ending).
 * Wins and knockouts are not credited when every human shares one network (self-farming guard).
 */
export async function recordTerritoryMatch(env: Env, meta: TRoomMeta, seats: TSeat[], g: TerritoryGame): Promise<boolean> {
  const db = env.DB;
  await ensureSchema(db);
  const humans = seats.map((s, k) => ({ s, p: g.players[k] })).filter((x) => !x.s.bot);
  const res = g.result!;
  const now = Date.now();
  const total = g.w * g.h;
  const eligible = humans.length >= 2 && (g.tick >= T_MIN_TICKS || res.reason === 'last_standing');
  const ips = new Set(humans.map((h) => h.s.ipHash).filter(Boolean));
  const sameNetwork = humans.length >= 2 && ips.size <= 1;
  const stmts: D1PreparedStatement[] = [];
  stmts.push(
    db
      .prepare(`INSERT INTO territory_games (id, room_id, kind, humans, players, winner_name, reason, ticks, counted, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        `${meta.id}-${now.toString(36)}`,
        meta.id,
        meta.kind,
        humans.length,
        JSON.stringify(
          seats.map((s, k) => ({
            name: s.name,
            bot: s.bot,
            user: s.userId,
            land: g.players[k].bestLand,
            kills: g.players[k].kills,
            rank: res.ranking.indexOf(k) + 1,
          })),
        ),
        res.winner !== null ? g.players[res.winner].name : null,
        res.reason,
        g.tick,
        eligible ? 1 : 0,
        meta.createdAt,
        now,
      ),
  );
  if (eligible) {
    for (const { s, p } of humans) {
      if (!s.userId) continue;
      const win = res.winner === p.idx && !sameNetwork ? 1 : 0;
      const kills = sameNetwork ? 0 : p.kills;
      const pct = Math.round((p.bestLand / total) * 1000) / 10;
      const score = p.bestLand + p.kills * 50;
      stmts.push(
        db
          .prepare(
            `INSERT INTO territory_stats (user_id, games, wins, kills, best_pct, best_score, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET games = games + 1, wins = wins + excluded.wins, kills = kills + excluded.kills,
             best_pct = MAX(best_pct, excluded.best_pct), best_score = MAX(best_score, excluded.best_score), updated_at = excluded.updated_at`,
          )
          .bind(s.userId, win, kills, pct, score, now),
      );
    }
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    await logError(db, 'territory', 'record failed', String(e));
    return false;
  }
  return eligible && humans.some((h) => h.s.userId);
}
