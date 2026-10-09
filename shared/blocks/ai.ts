// Block Puzzle Battle computer players (Easy / Medium / Hard).
// The AI only uses what a human sees: its own board, the falling piece, hold, the visible next queue
// and its own pending-garbage meter. It plays through the same input actions as a human, at a
// limited speed per level.
import { BlocksGame, W, H, cells, kicks, PIECE_ID, type Action, type PieceType, type Rot } from './engine';

export type BlocksLevel = 'easy' | 'medium' | 'hard';

interface Placement {
  actions: Action[];
  rot: Rot;
  x: number;
  y: number;
  board: Uint8Array;
  lines: number;
  landing: number; // landing height (rows from bottom, centre of piece)
  eroded: number;
}

function fits(board: Uint8Array, type: PieceType, rot: Rot, x: number, y: number) {
  for (const [cx, cy] of cells(type, rot)) {
    const px = x + cx,
      py = y + cy;
    if (px < 0 || px >= W || py < 0 || py >= H || board[py * W + px]) return false;
  }
  return true;
}

/** All hard-drop placements reachable by rotating first, then shifting, from (x, y, rot). */
export function placements(board: Uint8Array, type: PieceType, sx: number, sy: number, srot: Rot): Placement[] {
  const out: Placement[] = [];
  const seen = new Set<number>();
  const rotSeqs: [Action[], (1 | -1 | 2)[]][] = [
    [[], []],
    [['CW'], [1]],
    [['180'], [2]],
    [['CCW'], [-1]],
  ];
  for (const [rotActs, dirs] of rotSeqs) {
    let x = sx,
      y = sy,
      rot = srot,
      ok = true;
    for (const d of dirs) {
      const to = ((rot + d + 4) % 4) as Rot;
      let moved = false;
      for (const [dx, dy] of kicks(type, rot, to)) {
        if (fits(board, type, to, x + dx, y + dy)) {
          x += dx;
          y += dy;
          rot = to;
          moved = true;
          break;
        }
      }
      if (!moved) ok = false;
    }
    if (!ok) continue;
    for (const dirX of [0, -1, 1]) {
      let px = x;
      const acts: Action[] = [...rotActs];
      for (let step = 0; step < W; step++) {
        if (step > 0 || dirX !== 0) {
          if (dirX === 0) break;
          if (!fits(board, type, rot, px + dirX, y)) break;
          px += dirX;
          acts.push(dirX < 0 ? 'L' : 'R');
        }
        let py = y;
        while (fits(board, type, rot, px, py + 1)) py++;
        const key = (rot * 64 + px + 8) * 64 + py;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(place(board, type, rot, px, py, [...acts, 'HD']));
        }
        if (dirX === 0) break;
      }
    }
  }
  return out;
}

function place(board: Uint8Array, type: PieceType, rot: Rot, x: number, y: number, actions: Action[]): Placement {
  const b = board.slice();
  const id = PIECE_ID[type];
  let minY = H,
    maxY = 0;
  const pieceRows = new Map<number, number>();
  for (const [cx, cy] of cells(type, rot)) {
    b[(y + cy) * W + x + cx] = id;
    minY = Math.min(minY, y + cy);
    maxY = Math.max(maxY, y + cy);
    pieceRows.set(y + cy, (pieceRows.get(y + cy) ?? 0) + 1);
  }
  let lines = 0,
    pieceCellsCleared = 0;
  for (let r = 0; r < H; r++) {
    let full = true;
    for (let c = 0; c < W; c++)
      if (!b[r * W + c]) {
        full = false;
        break;
      }
    if (full) {
      lines++;
      pieceCellsCleared += pieceRows.get(r) ?? 0;
      b.copyWithin(W, 0, r * W);
      b.fill(0, 0, W);
    }
  }
  const landing = H - (minY + maxY) / 2;
  return { actions, rot, x, y, board: b, lines, landing, eroded: lines * pieceCellsCleared };
}

interface Features {
  holes: number;
  rowTrans: number;
  colTrans: number;
  wells: number;
  aggHeight: number;
  maxHeight: number;
  bump: number;
}
export function features(b: Uint8Array): Features {
  const heights = new Array<number>(W).fill(0);
  let holes = 0,
    colTrans = 0,
    rowTrans = 0,
    wells = 0;
  for (let x = 0; x < W; x++) {
    let seen = false;
    for (let y = 0; y < H; y++) {
      const filled = b[y * W + x] !== 0;
      if (filled && !seen) {
        heights[x] = H - y;
        seen = true;
      }
      if (!filled && seen) holes++;
      const below = y + 1 < H ? b[(y + 1) * W + x] !== 0 : true;
      if (filled !== below) colTrans++;
    }
  }
  for (let y = 0; y < H; y++) {
    let prev = true;
    for (let x = 0; x < W; x++) {
      const f = b[y * W + x] !== 0;
      if (f !== prev) rowTrans++;
      prev = f;
    }
    if (!prev) rowTrans++;
  }
  for (let x = 0; x < W; x++) {
    const l = x === 0 ? H : heights[x - 1],
      r = x === W - 1 ? H : heights[x + 1];
    const d = Math.min(l, r) - heights[x];
    if (d > 0) wells += (d * (d + 1)) / 2;
  }
  let bump = 0;
  for (let x = 0; x < W - 1; x++) bump += Math.abs(heights[x] - heights[x + 1]);
  return { holes, rowTrans, colTrans, wells, aggHeight: heights.reduce((a, c) => a + c, 0), maxHeight: Math.max(...heights), bump };
}

function evaluate(p: Placement, level: BlocksLevel, danger: number): number {
  const f = features(p.board);
  if (level === 'easy') return -0.5 * f.aggHeight - 4 * f.holes - 0.3 * f.bump + 3 * p.lines;
  // Dellacherie-style weights
  let v = -4.5 * p.landing + 3.4 * p.eroded - 3.2 * f.rowTrans - 9.3 * f.colTrans - 7.9 * f.holes - 3.4 * f.wells;
  if (level === 'hard') {
    // attack-minded: prefer multi-line clears while the stack is safe, survive when it is not
    const safe = f.maxHeight + danger < 11;
    if (safe) v += [0, -6, -3, 4, 22][p.lines];
    else v += p.lines * 6 - f.maxHeight * 2;
  }
  return v;
}

export class BlocksBot {
  readonly level: BlocksLevel;
  private rand: () => number;
  private plan: Action[] = [];
  private planFor = -1;
  private wait = 0;
  private retries = 0;
  /** ticks between actions / thinking delay */
  private readonly speed: number;
  private readonly think: number;

  constructor(level: BlocksLevel, rand: () => number) {
    this.level = level;
    this.rand = rand;
    this.speed = level === 'hard' ? 3 : level === 'medium' ? 6 : 12;
    this.think = level === 'hard' ? 6 : level === 'medium' ? 14 : 30;
  }

  private choose(g: BlocksGame): Action[] {
    const p = g.piece!;
    const danger = g.pendingGarbageLines();
    const candidates: { score: number; acts: Action[] }[] = [];
    const consider = (type: PieceType, prefix: Action[], nextType: PieceType | null) => {
      const sx = prefix.length ? 3 : p.x,
        sy = prefix.length ? 1 : p.y,
        srot: Rot = prefix.length ? 0 : p.rot;
      for (const pl of placements(g.board, type, sx, sy, srot)) {
        let score = evaluate(pl, this.level, danger);
        if (this.level === 'hard' && nextType) {
          let best = -Infinity;
          for (const p2 of placements(pl.board, nextType, 3, 1, 0)) best = Math.max(best, evaluate(p2, 'hard', danger));
          score = score * 0.4 + (best === -Infinity ? -1e6 : best);
        }
        candidates.push({ score, acts: [...prefix, ...pl.actions] });
      }
    };
    const next = g.queue[0] ?? null;
    consider(p.type, [], this.level === 'hard' ? next : null);
    if (this.level === 'hard' && !g.holdUsed) {
      const holdType = g.hold ?? g.queue[0];
      const after = g.hold ? g.queue[0] : g.queue[1];
      if (holdType && holdType !== p.type) consider(holdType, ['HOLD'], after ?? null);
    }
    if (!candidates.length) return ['HD'];
    candidates.sort((a, b) => b.score - a.score);
    if (this.level === 'easy') {
      // easy: noisy choice and occasional poor placement
      if (this.rand() < 0.2) return candidates[Math.floor(this.rand() * Math.min(8, candidates.length))].acts;
      return candidates[Math.floor(this.rand() * Math.min(2, candidates.length))].acts;
    }
    if (this.level === 'medium' && this.rand() < 0.06) return candidates[Math.min(1, candidates.length - 1)].acts;
    return candidates[0].acts;
  }

  /** Called once per tick; returns the actions to apply this tick (0 or 1). */
  update(g: BlocksGame): Action[] {
    if (g.status !== 'playing' || !g.piece) return [];
    const id = g.pieces * 2 + (g.holdUsed ? 1 : 0);
    if (id !== this.planFor) {
      this.planFor = id;
      this.plan = [];
      this.wait = this.think;
      this.retries = 0;
    }
    if (this.wait > 0) {
      this.wait--;
      return [];
    }
    if (!this.plan.length) {
      if (this.retries++ > 3) return ['HD'];
      this.plan = this.choose(g);
    }
    const a = this.plan.shift()!;
    this.wait = this.speed;
    if (a === 'HOLD') this.planFor = g.pieces * 2 + 1; // plan continues with the held piece
    return [a];
  }
}
