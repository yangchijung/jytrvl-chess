// AI coach — every statement is backed by the rules engine or an engine evaluation; nothing is invented.
import { Chess } from 'chess.js';
import { analyse, banqiAiMove } from '../engines/ai';
import { restoreRules, truncateState, type AnyState, type Rules } from '../../shared/games/registry';
import { parseFen, parseSq, chineseNotation, attackersOf, sideOf, XQ_VALUE } from '../../shared/games/xiangqi/rules';
import { BQ_RANK, colorOf } from '../../shared/games/banqi/rules';
import type { Seat } from '../../shared/types';

export const BLUNDER_CP = 250;
export const MISTAKE_CP = 100;

/** Human-readable notation for a move in the current position. */
export function notate(rules: Rules, move: string): string {
  const pos = rules.position();
  if (pos.game === 'chess') {
    try {
      const c = new Chess(pos.fen);
      return c.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] as never }).san;
    } catch {
      return move;
    }
  }
  if (pos.game === 'xiangqi') {
    const m = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(move);
    if (!m) return move;
    return chineseNotation(parseFen(pos.fen).board, parseSq(m[1]), parseSq(m[2]));
  }
  if (move.startsWith('f:')) return `翻 ${move.slice(2)}`;
  return move.replace('-', '→');
}

export async function hint(rules: Rules): Promise<string | null> {
  const pos = rules.position();
  if (pos.game === 'banqi') return banqiAiMove(pos.view, rules.sideToMove(), 'hard');
  const r = await analyse(pos.game, pos.fen, 700);
  if (r?.bestmove && rules.legalMoves().includes(r.bestmove)) return r.bestmove;
  return null;
}

export interface MoveFeedback {
  kind: 'best' | 'good' | 'mistake' | 'blunder';
  lossCp: number;
  better: string | null; // notation
  betterMove: string | null;
}

/** Compare the move actually played with the engine's best move in the position before it. */
export async function judgeMove(before: Rules, move: string): Promise<MoveFeedback | null> {
  const pos = before.position();
  if (pos.game === 'banqi') return null;
  const a = await analyse(pos.game, pos.fen, 350);
  if (!a || !a.lines.length) return null;
  const best = a.bestmove;
  if (best === move) return { kind: 'best', lossCp: 0, better: null, betterMove: null };
  const st = before.serialize();
  const after = restoreRules({ ...st, state: { ...st.state, moves: [...st.state.moves, move] } } as AnyState);
  const ap = after.position();
  if (ap.game === 'banqi') return null;
  if (after.result()) {
    const res = after.result()!;
    if (res.kind === 'win' && res.winner === before.sideToMove()) return { kind: 'best', lossCp: 0, better: null, betterMove: null };
  }
  const b = after.result() ? null : await analyse(ap.game, ap.fen, 350);
  const bestScore = clampCp(a.lines[0].score);
  const playedScore = b && b.lines.length ? -clampCp(b.lines[0].score) : bestScore;
  const loss = Math.max(0, bestScore - playedScore);
  const kind = loss >= BLUNDER_CP ? 'blunder' : loss >= MISTAKE_CP ? 'mistake' : 'good';
  return { kind, lossCp: Math.round(loss), better: notate(before, best), betterMove: best };
}

function clampCp(s: number): number {
  return Math.max(-1500, Math.min(1500, s));
}

/** Own pieces that are attacked and undefended (or attacked by a cheaper piece). Rules-based, no engine. */
export function threatenedPieces(rules: Rules, seat: Seat): { square: string; piece: string }[] {
  const pos = rules.position();
  const out: { square: string; piece: string }[] = [];
  if (pos.game === 'chess') {
    const c = new Chess(pos.fen);
    const me = seat === 0 ? 'w' : 'b';
    const opp = me === 'w' ? 'b' : 'w';
    const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    for (const row of c.board())
      for (const p of row) {
        if (!p || p.color !== me || p.type === 'k') continue;
        const attackers = c.attackers(p.square, opp);
        if (!attackers.length) continue;
        const defended = c.attackers(p.square, me).length > 0;
        const cheapest = Math.min(...attackers.map((s) => val[c.get(s)!.type]));
        if (!defended || cheapest < val[p.type]) out.push({ square: p.square, piece: p.type });
      }
  } else if (pos.game === 'xiangqi') {
    const b = [...pos.board];
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (!p || sideOf(p) !== seat || p.toUpperCase() === 'K') continue;
      const att = attackersOf(b, s, seat === 0 ? 1 : 0);
      if (!att.length) continue;
      const def = attackersOf(b, s, seat).length > 0;
      const cheapest = Math.min(...att.map((a) => XQ_VALUE[b[a]!.toUpperCase()]));
      if (!def || cheapest < XQ_VALUE[p.toUpperCase()]) out.push({ square: `${'abcdefghi'[s % 9]}${Math.floor(s / 9) + 1}`, piece: p });
    }
  } else {
    const v = pos.view;
    const myColor = v.seatColor[seat];
    if (!myColor) return out;
    // reuse capture rules via legal moves of the opponent in a mirrored turn is complex; approximate with adjacency rank rule
    for (let s = 0; s < 32; s++) {
      const p = v.cells[s];
      if (!p || p === 'X' || colorOf(p) !== myColor) continue;
      const neighbours = [s - 8, s + 8, s % 8 ? s - 1 : -1, s % 8 !== 7 ? s + 1 : -1].filter((n) => n >= 0 && n < 32);
      const threatened = neighbours.some((n) => {
        const q = v.cells[n];
        if (!q || q === 'X' || colorOf(q) === myColor) return false;
        const a = q.toUpperCase(),
          t = p.toUpperCase();
        if (a === 'C' && v.options.cannonJump) return false;
        if (a === 'K' && t === 'P') return v.options.kingCapturesPawn;
        if (a === 'P' && t === 'K') return v.options.pawnCapturesKing;
        return BQ_RANK[a] >= BQ_RANK[t];
      });
      if (threatened) out.push({ square: `${'abcdefgh'[s % 8]}${Math.floor(s / 8) + 1}`, piece: p });
    }
  }
  return out;
}

export interface ReviewItem {
  ply: number;
  seat: Seat;
  played: string;
  best: string | null;
  loss: number;
  kind: 'blunder' | 'mistake';
}
export interface Review {
  perSeat: [{ blunders: number; mistakes: number; acpl: number }, { blunders: number; mistakes: number; acpl: number }];
  items: ReviewItem[];
  material?: { ply: number; diff: number }[];
}

/** Post-game review: engine evaluation of every position (chess/xiangqi) or material swings (banqi). */
export async function reviewGame(state: AnyState, onProgress?: (n: number, total: number) => void): Promise<Review> {
  const total = state.state.moves.length;
  const perSeat: Review['perSeat'] = [
    { blunders: 0, mistakes: 0, acpl: 0 },
    { blunders: 0, mistakes: 0, acpl: 0 },
  ];
  const items: ReviewItem[] = [];
  if (state.game === 'banqi') {
    const material: { ply: number; diff: number }[] = [];
    const VAL: Record<string, number> = { K: 6, A: 5, B: 4, R: 3, N: 2, C: 3, P: 1 };
    for (let n = 1; n <= total; n++) {
      const r = restoreRules(truncateState(state, n));
      const pos = r.position();
      if (pos.game !== 'banqi') break;
      const red = pos.view.seatColor[0];
      if (!red) continue;
      let diff = 0;
      for (const p of pos.view.captured) diff += (colorOf(p) === red ? -1 : 1) * VAL[p.toUpperCase()];
      if (!material.length || material.at(-1)!.diff !== diff) material.push({ ply: n, diff });
    }
    return { perSeat, items, material };
  }
  const evals: number[] = [];
  const bests: (string | null)[] = [];
  for (let n = 0; n <= total; n++) {
    const r = restoreRules(truncateState(state, n));
    const pos = r.position();
    onProgress?.(n, total);
    if (pos.game === 'banqi') break;
    const res = r.result();
    if (res) {
      evals.push(res.kind === 'draw' ? 0 : res.winner === r.sideToMove() ? 1500 : -1500);
      bests.push(null);
      continue;
    }
    const a = await analyse(pos.game, pos.fen, 180);
    evals.push(a && a.lines.length ? clampCp(a.lines[0].score) : 0);
    bests.push(a?.bestmove ? notate(r, a.bestmove) : null);
  }
  const sums = [0, 0];
  const counts = [0, 0];
  for (let n = 0; n < total; n++) {
    const before = restoreRules(truncateState(state, n));
    const seat = before.sideToMove();
    const loss = Math.max(0, evals[n] + evals[n + 1]); // eval[n+1] is from the opponent's view
    sums[seat] += Math.min(loss, 1000);
    counts[seat]++;
    if (loss >= MISTAKE_CP) {
      const kind = loss >= BLUNDER_CP ? 'blunder' : 'mistake';
      if (kind === 'blunder') perSeat[seat].blunders++;
      else perSeat[seat].mistakes++;
      items.push({ ply: n + 1, seat, played: notate(before, state.state.moves[n]), best: bests[n], loss: Math.round(loss), kind });
    }
  }
  perSeat[0].acpl = counts[0] ? Math.round(sums[0] / counts[0]) : 0;
  perSeat[1].acpl = counts[1] ? Math.round(sums[1] / counts[1]) : 0;
  onProgress?.(total, total);
  return { perSeat, items };
}
