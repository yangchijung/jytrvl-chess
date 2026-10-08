// Lightweight xiangqi searcher (pure TypeScript).
// Used for the Easy level and as a fallback when the browser cannot run the multi-threaded
// Fairy-Stockfish WASM build (no cross-origin isolation). Medium/Hard normally use Fairy-Stockfish.
import {
  legalMovesOf,
  inCheck,
  sideOf,
  fileOf,
  rankOf,
  sqName,
  XQ_VALUE,
  type XqBoard,
  type XqMove,
} from '../games/xiangqi/rules';
import type { Seat } from '../types';

function pieceSquareBonus(p: string, s: number): number {
  const t = p.toUpperCase();
  const red = p === t;
  const r = red ? rankOf(s) : 9 - rankOf(s); // rank from own side
  const f = fileOf(s);
  const centre = 4 - Math.abs(4 - f);
  switch (t) {
    case 'P':
      return r >= 5 ? 60 + centre * 10 + (r - 5) * 10 - (r === 9 ? 40 : 0) : 0;
    case 'N':
      return centre * 6 + Math.min(r, 6) * 6;
    case 'C':
      return f === 4 ? 25 : centre * 3;
    case 'R':
      return r >= 5 ? 20 : centre * 2;
    default:
      return 0;
  }
}

export function evalXq(board: XqBoard, side: Seat): number {
  let v = 0;
  for (let s = 0; s < 90; s++) {
    const p = board[s];
    if (!p) continue;
    const val = XQ_VALUE[p.toUpperCase()] + pieceSquareBonus(p, s);
    v += sideOf(p) === side ? val : -val;
  }
  return v;
}

function make(board: XqBoard, m: XqMove) {
  const cap = board[m.to];
  board[m.to] = board[m.from];
  board[m.from] = null;
  return cap;
}
function unmake(board: XqBoard, m: XqMove, cap: XqBoard[number]) {
  board[m.from] = board[m.to];
  board[m.to] = cap;
}

function order(board: XqBoard, moves: XqMove[]): XqMove[] {
  return moves
    .map((m) => ({ m, s: board[m.to] ? XQ_VALUE[board[m.to]!.toUpperCase()] * 10 - XQ_VALUE[board[m.from]!.toUpperCase()] : 0 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

function quiesce(board: XqBoard, side: Seat, alpha: number, beta: number, depth: number): number {
  const stand = evalXq(board, side);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  const caps = order(
    board,
    legalMovesOf(board, side).filter((m) => board[m.to]),
  );
  for (const m of caps) {
    const cap = make(board, m);
    const v = -quiesce(board, side === 0 ? 1 : 0, -beta, -alpha, depth - 1);
    unmake(board, m, cap);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(board: XqBoard, side: Seat, depth: number, alpha: number, beta: number, ply: number): number {
  const moves = legalMovesOf(board, side);
  if (moves.length === 0) return -30000 + ply; // mate or 困斃 both lose
  if (depth === 0) return quiesce(board, side, alpha, beta, 4);
  let best = -Infinity;
  for (const m of order(board, moves)) {
    const cap = make(board, m);
    const v = -negamax(board, side === 0 ? 1 : 0, depth - 1, -beta, -alpha, ply + 1);
    unmake(board, m, cap);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export interface LiteResult {
  move: string;
  score: number;
}

/** Search to `depth` plies; `noise` adds random centipawns to root scores (for weaker play). */
export function searchXq(board: XqBoard, side: Seat, depth: number, noise = 0, rand = Math.random, deadlineMs = 2500): LiteResult {
  const b = [...board];
  const moves = order(b, legalMovesOf(b, side));
  if (moves.length === 0) throw new Error('no legal moves');
  const start = Date.now();
  let bestMove = moves[0];
  let bestScore = -Infinity;
  // iterative deepening so we always have an answer within the deadline
  for (let d = 1; d <= depth; d++) {
    let localBest = moves[0];
    let localScore = -Infinity;
    for (const m of moves) {
      const cap = make(b, m);
      let v = -negamax(b, side === 0 ? 1 : 0, d - 1, -Infinity, Infinity, 1);
      unmake(b, m, cap);
      if (noise) v += (rand() - 0.5) * noise;
      if (v > localScore) {
        localScore = v;
        localBest = m;
      }
      if (Date.now() - start > deadlineMs && d > 1) break;
    }
    bestMove = localBest;
    bestScore = localScore;
    if (Date.now() - start > deadlineMs) break;
  }
  void inCheck;
  return { move: sqName(bestMove.from) + sqName(bestMove.to), score: bestScore };
}
