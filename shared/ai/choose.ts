import { LEVELS, type Level, type UciClient } from './uci';
import { searchXq } from './xiangqi-lite';
import { parseFen } from '../games/xiangqi/rules';

export type { Level };

/**
 * Picks a move for chess or xiangqi at the given level.
 * `legal` must be the rules-engine legal move list — the engine's answer is always re-validated.
 */
export async function chooseEngineMove(
  game: 'chess' | 'xiangqi',
  fen: string,
  legal: string[],
  level: Level,
  client: UciClient | null,
  rand: () => number = Math.random,
): Promise<string> {
  if (legal.length === 0) throw new Error('no legal moves');
  const cfg = LEVELS[game][level];
  if (cfg.randomRate && rand() < cfg.randomRate) return legal[Math.floor(rand() * legal.length)];

  if (client) {
    try {
      const r = await client.search(fen, { skill: cfg.skill, depth: cfg.depth, movetime: cfg.movetime });
      const mv = r.bestmove?.toLowerCase();
      if (mv && legal.includes(mv)) return mv;
    } catch {
      /* fall through to the built-in searcher */
    }
  }
  if (game === 'xiangqi') {
    const { board, turn } = parseFen(fen);
    const depth = level === 'easy' ? 1 : level === 'medium' ? 2 : 4;
    const noise = level === 'easy' ? 300 : level === 'medium' ? 60 : 0;
    const mv = searchXq(board, turn, depth, noise, rand, level === 'hard' ? 2500 : 800).move;
    if (legal.includes(mv)) return mv;
  }
  return legal[Math.floor(rand() * legal.length)];
}
