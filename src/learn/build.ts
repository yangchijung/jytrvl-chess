import { newRules, wrapBanqi, type Rules } from '../../shared/games/registry';
import { ChessRules } from '../../shared/games/chess/rules';
import { XiangqiRules } from '../../shared/games/xiangqi/rules';
import { BanqiRules, fullSet, bqParse, type BqPiece } from '../../shared/games/banqi/rules';
import { restoreRules } from '../../shared/games/registry';
import type { GameId } from '../../shared/types';
import type { Step, Expect } from './lessons';

/** Builds a rules object for a lesson step. */
export function buildStepRules(game: GameId, step: Step, rand: () => number = Math.random): Rules {
  if (game === 'chess') return restoreRules({ game: 'chess', state: new ChessRules({ startFen: step.fen!, moves: [] }).state() });
  if (game === 'xiangqi') return restoreRules({ game: 'xiangqi', state: new XiangqiRules({ startFen: step.fen!, moves: [] }).state() });
  const b = step.banqi!;
  if (b.fresh) return newRules('banqi', { rand });
  const g = new BanqiRules({ layout: fullSet(), moves: [], options: {} });
  const pool = fullSet();
  const take = (p: BqPiece) => {
    const i = pool.indexOf(p);
    if (i >= 0) pool.splice(i, 1);
  };
  g.board = new Array(32).fill(null);
  g.faceUp = new Array(32).fill(false);
  for (const [sq, p] of Object.entries(b.up)) {
    g.board[bqParse(sq)] = p;
    g.faceUp[bqParse(sq)] = true;
    take(p);
  }
  for (const sq of b.down ?? []) {
    const i = Math.floor(rand() * pool.length);
    g.board[bqParse(sq)] = pool.splice(i, 1)[0];
  }
  g.seatColor = b.seatColor ?? [null, null];
  g.turn = 0;
  return wrapBanqi(g);
}

export function matchesExpect(e: Expect | undefined, move: string): boolean {
  if (!e) return true;
  if ('any' in e) return true;
  if ('anyFlip' in e) return move.startsWith('f:');
  if ('from' in e) return move.startsWith(e.from) && (move.length === e.from.length || /[a-i-]/.test(move[e.from.length]));
  return e.moves.includes(move) || e.moves.some((m) => move.startsWith(m) && move.length === m.length + 1); // promotion suffix
}
