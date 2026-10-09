// Banqi AI — information-set Monte Carlo (determinization) search.
//
// FAIRNESS: the AI receives only a BanqiView (what any player can see). Face-down pieces are unknown;
// the AI samples possible identities from the public hidden pool, searches each sample, and averages
// move values across samples. It never reads the real layout.
import {
  BanqiRules,
  BQ_RANK,
  colorOf,
  fullSet,
  type BanqiView,
  type BqColor,
  type BqPiece,
} from '../games/banqi/rules';
import type { Seat } from '../types';

export type Level = 'easy' | 'medium' | 'hard';

const VALUE: Record<string, number> = { K: 60, A: 30, B: 16, R: 10, N: 8, C: 12, P: 5 };

export interface BanqiAiOptions {
  level: Level;
  rand?: () => number;
  /** time budget in ms for hard level */
  budgetMs?: number;
  /** visible positions already seen in this game (see visibleKey); hard AI avoids repeating them when ahead */
  seen?: Set<string>;
}

/** Key of the visible position — identical to what both players can see, so using it is fair. */
export function visibleKey(view: Pick<BanqiView, 'cells' | 'turn'>): string {
  return `${view.cells.map((c) => c ?? '.').join('')}|${view.turn}`;
}

/** Build a concrete game from a public view by assigning random identities to face-down cells. */
export function determinize(view: BanqiView, rand: () => number): BanqiRules {
  const pool: BqPiece[] = [];
  for (const [p, n] of Object.entries(view.hiddenPool)) for (let i = 0; i < n; i++) pool.push(p as BqPiece);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const g = new BanqiRules({ layout: fullSet(), moves: [], options: view.options });
  let k = 0;
  g.board = view.cells.map((c) => (c === 'X' ? pool[k++] : c));
  g.faceUp = view.cells.map((c) => c !== null && c !== 'X');
  g.turn = view.turn;
  g.seatColor = [...view.seatColor] as [BqColor | null, BqColor | null];
  g.captured = [...view.captured];
  g.chainFrom = view.chainFrom;
  g.noProgress = view.noProgress;
  return g;
}

function material(g: BanqiRules, color: BqColor): number {
  let v = 0;
  const enemyKingAlive = g.board.some((p) => p && colorOf(p) !== color && p.toUpperCase() === 'K');
  for (let s = 0; s < 32; s++) {
    const p = g.board[s];
    if (!p || colorOf(p) !== color) continue;
    let val = VALUE[p.toUpperCase()];
    if (p.toUpperCase() === 'P' && enemyKingAlive) val += 3; // soldiers matter while they can kill the general
    v += g.faceUp[s] ? val : val * 0.9;
  }
  return v;
}

/** Static evaluation from the perspective of `seat`. */
export function evaluate(g: BanqiRules, seat: Seat): number {
  const r = g.result();
  if (r) {
    if (r.kind === 'draw') return 0;
    return r.winner === seat ? 10000 : -10000;
  }
  const mine = g.seatColor[seat];
  if (!mine) return 0;
  const theirs: BqColor = mine === 'red' ? 'black' : 'red';
  let score = material(g, mine) - material(g, theirs);
  // When ahead, hunt: bring pieces closer to enemy pieces they are allowed to capture (converts won endgames
  // instead of drifting into repetition / no-progress draws).
  const lead = score;
  if (Math.abs(lead) > 4) {
    const hunter: BqColor = lead > 0 ? mine : theirs;
    let pull = 0;
    for (let a = 0; a < 32; a++) {
      const p = g.board[a];
      if (!p || !g.faceUp[a] || colorOf(p) !== hunter) continue;
      for (let t = 0; t < 32; t++) {
        const q = g.board[t];
        if (!q || !g.faceUp[t] || colorOf(q) === hunter) continue;
        if (!g.canCapture(p, q) && p.toUpperCase() !== 'C') continue;
        const d = Math.abs((a % 8) - (t % 8)) + Math.abs(Math.floor(a / 8) - Math.floor(t / 8));
        pull += (10 - d) * 0.15;
      }
    }
    score += hunter === mine ? pull : -pull;
  }
  // hanging pieces: a face-up piece the opponent can capture right now
  const toMove = g.turn;
  for (let s = 0; s < 32; s++) {
    const p = g.board[s];
    if (!p || !g.faceUp[s]) continue;
    const attacked = attackersCount(g, s);
    if (attacked === 0) continue;
    const v = VALUE[p.toUpperCase()];
    const isMine = colorOf(p) === mine;
    // the side to move gets to capture first
    const sideToMoveOwnsAttack = (isMine ? theirs : mine) === g.seatColor[toMove];
    const factor = sideToMoveOwnsAttack ? 0.8 : 0.25;
    score += isMine ? -v * factor : v * factor;
  }
  return score;
}

function attackersCount(g: BanqiRules, target: number): number {
  const p = g.board[target]!;
  let n = 0;
  for (let s = 0; s < 32; s++) {
    const a = g.board[s];
    if (!a || !g.faceUp[s] || colorOf(a) === colorOf(p)) continue;
    if (g.targetsFrom(s, true).includes(target)) n++;
  }
  return n;
}

function clone(g: BanqiRules): BanqiRules {
  const h = new BanqiRules({ layout: fullSet(), moves: [], options: g.opts });
  h.board = [...g.board];
  h.faceUp = [...g.faceUp];
  h.turn = g.turn;
  h.seatColor = [...g.seatColor] as [BqColor | null, BqColor | null];
  h.captured = [...g.captured];
  h.chainFrom = g.chainFrom;
  h.noProgress = g.noProgress;
  return h;
}

/** Alpha-beta inside one determinization. Flips are resolved by the sample (that is the chance outcome). */
/** Resolve pending captures at the horizon so the search does not stop in the middle of an exchange. */
function quiesce(g: BanqiRules, alpha: number, beta: number, seat: Seat, depth: number): number {
  const stand = evaluate(g, seat);
  if (depth === 0 || g.result()) return stand;
  const maximizing = g.turn === seat;
  if (maximizing) {
    if (stand >= beta) return stand;
    alpha = Math.max(alpha, stand);
  } else {
    if (stand <= alpha) return stand;
    beta = Math.min(beta, stand);
  }
  let best = stand;
  const caps = g.legalMoves().filter((m) => m.includes('-') && g.board[sqIndex(m.split('-')[1])] !== null);
  for (const m of orderMoves(g, caps)) {
    const h = clone(g);
    h.play(m);
    const v = quiesce(h, alpha, beta, seat, depth - 1);
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

const sqIndex = (n: string) => 'abcdefgh'.indexOf(n[0]) + (Number(n[1]) - 1) * 8;

function search(g: BanqiRules, depth: number, alpha: number, beta: number, seat: Seat, limitFlips: boolean, qdepth = 0): number {
  if (g.result()) return evaluate(g, seat);
  if (depth === 0) return qdepth > 0 ? quiesce(g, alpha, beta, seat, qdepth) : evaluate(g, seat);
  let moves = g.legalMoves();
  if (limitFlips) moves = pruneFlips(g, moves);
  const maximizing = g.turn === seat;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of orderMoves(g, moves)) {
    const h = clone(g);
    h.play(m);
    const v = search(h, depth - 1, alpha, beta, seat, true, qdepth);
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Inside the tree only keep a few flips (flips are evaluated mostly at the root) to bound branching. */
function pruneFlips(g: BanqiRules, moves: string[]): string[] {
  const flips = moves.filter((m) => m.startsWith('f:'));
  const rest = moves.filter((m) => !m.startsWith('f:'));
  return [...rest, ...flips.slice(0, 2)];
}

function orderMoves(g: BanqiRules, moves: string[]): string[] {
  const score = (m: string) => {
    if (m.includes('-')) {
      const to = m.split('-')[1];
      const t = g.board[parseInt(String('abcdefgh'.indexOf(to[0]) + (Number(to[1]) - 1) * 8))];
      return t ? 100 + BQ_RANK[t.toUpperCase()] : 10;
    }
    return 0;
  };
  return [...moves].sort((a, b) => score(b) - score(a));
}

export function chooseBanqiMove(view: BanqiView, seat: Seat, opts: BanqiAiOptions): string {
  const rand = opts.rand ?? Math.random;
  const base = determinize(view, rand);
  const moves = base.legalMoves();
  if (moves.length === 0) throw new Error('no legal moves');
  if (moves.length === 1) return moves[0];

  if (opts.level === 'easy') {
    // Beginner: grabs a capture half of the time, otherwise plays something random. Ignores danger.
    const caps = moves.filter((m) => {
      if (!m.includes('-')) return false;
      const to = m.split('-')[1];
      return base.board['abcdefgh'.indexOf(to[0]) + (Number(to[1]) - 1) * 8] != null;
    });
    if (caps.length && rand() < 0.6) return caps[Math.floor(rand() * caps.length)];
    return moves[Math.floor(rand() * moves.length)];
  }

  const samples = opts.level === 'medium' ? 10 : 32;
  const depth = opts.level === 'medium' ? 2 : 3;
  const deadline = Date.now() + (opts.budgetMs ?? (opts.level === 'hard' ? 1500 : 400));
  const totals = new Map<string, number>(moves.map((m) => [m, 0]));
  let done = 0;
  for (let i = 0; i < samples; i++) {
    const g = i === 0 ? base : determinize(view, rand);
    for (const m of moves) {
      const h = clone(g);
      h.play(m);
      const v = search(h, depth - 1, -Infinity, Infinity, seat, true, opts.level === 'hard' ? 4 : 0);
      totals.set(m, totals.get(m)! + v);
    }
    done++;
    if (Date.now() > deadline && done >= 4) break;
  }
  let best = moves[0];
  let bestV = -Infinity;
  const repeats = new Set<string>();
  if (opts.level === 'hard' && opts.seen?.size) {
    for (const m of moves) {
      if (m.startsWith('f:')) continue;
      const h = clone(base);
      h.play(m);
      if (opts.seen.has(visibleKey({ cells: Array.from({ length: 32 }, (_, i) => h.cell(i)), turn: h.turn }))) repeats.add(m);
    }
  }
  for (const [m, v] of totals) {
    let avg = v / done + (opts.level === 'medium' ? (rand() - 0.5) * 6 : rand() * 0.6);
    // When winning, a repeated position is a step toward a repetition draw: steer away from it.
    if (repeats.has(m) && v / done > 2) avg -= 8;
    if (avg > bestV) {
      bestV = avg;
      best = m;
    }
  }
  return best;
}
