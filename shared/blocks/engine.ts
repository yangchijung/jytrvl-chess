// JY Games — Block Puzzle Battle engine (JY Blocks Rules v1.0, see docs/rules/blocks.md).
//
// Deterministic, integer-only simulation at 60 ticks per second. The same code runs in the browser
// (local play, client prediction) and on the server (online matches, replay verification of solo
// records). Every outcome depends only on: seed, mode, the ordered list of (tick, action) inputs and,
// in versus play, the garbage the server injects. No floating point is used in game logic, so a replay
// produces identical results in every JavaScript engine.

export const W = 10;
export const H = 22; // 20 visible rows + 2 hidden spawn rows (rows 0–1)
export const HIDDEN = 2;
export const TPS = 60; // ticks per second
export const NEXT_COUNT = 5;
export const LOCK_DELAY = 30; // ticks (0.5 s)
export const MAX_LOCK_RESETS = 15;
export const GARBAGE = 8; // board cell value for garbage
export const SOFT_DROP_FACTOR = 20;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
/** board value (1–7) for each piece */
export const PIECE_ID: Record<PieceType, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
export type Rot = 0 | 1 | 2 | 3;

// SRS shapes: [rotation][cell] = [x, y] inside the bounding box (y grows downward).
const SHAPES: Record<PieceType, [number, number][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};
export function cells(type: PieceType, rot: Rot): [number, number][] {
  return SHAPES[type][rot];
}

// SRS wall kicks, written as in the guideline (y up) and converted to y-down below.
const KICK_JLSTZ: Record<string, [number, number][]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I: Record<string, [number, number][]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
// 180° rotation: simple symmetric kicks (JY rule; not part of SRS proper)
const KICK_180: [number, number][] = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];

export function kicks(type: PieceType, from: Rot, to: Rot): [number, number][] {
  if ((from + 2) % 4 === to) return KICK_180.map(([x, y]) => [x, -y]);
  if (type === 'O') return [[0, 0]];
  const t = (type === 'I' ? KICK_I : KICK_JLSTZ)[`${from}${to}`];
  return t.map(([x, y]) => [x, -y]);
}

/** Gravity in thousandths of a row per tick for levels 1–20 (guideline curve, precomputed integers). */
export const GRAVITY: number[] = [
  0, 17, 21, 27, 35, 47, 64, 88, 124, 178, 260, 388, 591, 918, 1457, 2361, 3909, 6614, 11438, 20229, 36598,
];
export function gravityFor(level: number) {
  return GRAVITY[Math.max(1, Math.min(20, level))];
}

export type BlocksMode = 'classic' | 'marathon' | 'sprint' | 'ultra' | 'versus';
export const MODE_RULES: Record<BlocksMode, { lineGoal: number; timeTicks: number; levelUp: boolean }> = {
  classic: { lineGoal: 150, timeTicks: 0, levelUp: true }, // levels 1–15, win at 150 lines
  marathon: { lineGoal: 0, timeTicks: 0, levelUp: true }, // endless
  sprint: { lineGoal: 40, timeTicks: 0, levelUp: false }, // clear 40 lines as fast as possible
  ultra: { lineGoal: 0, timeTicks: 120 * TPS, levelUp: false }, // best score in 2 minutes
  versus: { lineGoal: 0, timeTicks: 0, levelUp: false },
};

export type Action = 'L' | 'R' | 'CW' | 'CCW' | '180' | 'SD1' | 'SD0' | 'HD' | 'HOLD' | 'D1';
export const ACTIONS: Action[] = ['L', 'R', 'CW', 'CCW', '180', 'SD1', 'SD0', 'HD', 'HOLD', 'D1'];

export interface ClearInfo {
  lines: number;
  tspin: 'none' | 'mini' | 'full';
  b2b: boolean;
  combo: number; // 0 = first clear of a chain
  perfect: boolean;
  points: number;
  attack: number;
}
export type BlocksEvent =
  | { type: 'lock'; tick: number; piece: PieceType; cells: number[] }
  | { type: 'clear'; tick: number; rows: number[]; info: ClearInfo }
  | { type: 'level'; tick: number; level: number }
  | { type: 'hold'; tick: number }
  | { type: 'garbage_in'; tick: number; lines: number }
  | { type: 'end'; tick: number; result: 'topout' | 'goal' | 'time' };

export interface ActivePiece {
  type: PieceType;
  rot: Rot;
  x: number;
  y: number;
}

/** mulberry32 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// attack tables (lines of garbage sent)
const ATTACK_LINES = [0, 0, 1, 2, 4];
const ATTACK_TSPIN = [0, 2, 4, 6];
const ATTACK_MINI = [0, 0, 1, 2];
const COMBO_ATTACK = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const PERFECT_ATTACK = 10;

export interface BlocksConfig {
  seed: number;
  mode: BlocksMode;
  startLevel?: number;
}

export interface BlocksSnapshot {
  cfg: BlocksConfig;
  board: number[];
  tick: number;
  piece: ActivePiece | null;
  queue: PieceType[];
  bag: PieceType[];
  rngState: number;
  hold: PieceType | null;
  holdUsed: boolean;
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: boolean;
  pieces: number;
  status: BlocksGame['status'];
  result: BlocksGame['result'];
  softDrop: boolean;
  fallAcc: number;
  lockTimer: number;
  lockResets: number;
  lowestY: number;
  lastRotate: boolean;
  lastKick: number;
  pendingGarbage: [number, number][];
  stats: BlocksGame['stats'];
  endTick: number;
}

export class BlocksGame {
  readonly cfg: BlocksConfig;
  readonly rules: (typeof MODE_RULES)[BlocksMode];
  board = new Uint8Array(W * H);
  tick = 0;
  piece: ActivePiece | null = null;
  queue: PieceType[] = [];
  hold: PieceType | null = null;
  holdUsed = false;
  score = 0;
  lines = 0;
  level = 1;
  combo = -1;
  b2b = false;
  pieces = 0;
  status: 'playing' | 'over' = 'playing';
  result: 'topout' | 'goal' | 'time' | null = null;
  endTick = 0;
  softDrop = false;
  /** garbage waiting to rise: [lines, hole column] */
  pendingGarbage: [number, number][] = [];
  stats = { singles: 0, doubles: 0, triples: 0, quads: 0, tspins: 0, perfect: 0, maxCombo: 0, attack: 0, garbageReceived: 0, inputs: 0 };
  /** events produced since the last call to drainEvents() */
  events: BlocksEvent[] = [];
  /** attack produced by the last lock (versus) */
  lastAttack = 0;

  private seedState: number;
  private bag: PieceType[] = [];
  private fallAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastRotate = false;
  private lastKick = 0;

  constructor(cfg: BlocksConfig) {
    this.cfg = cfg;
    this.rules = MODE_RULES[cfg.mode];
    this.level = Math.max(1, Math.min(20, cfg.startLevel ?? 1));
    this.seedState = cfg.seed >>> 0;
    while (this.queue.length < NEXT_COUNT) this.queue.push(this.drawPiece());
    this.spawn();
  }

  // ---------- randomizer: 7-bag ----------
  private nextRand(): number {
    // inline mulberry32 with persistent state so snapshots can restore it
    this.seedState = (this.seedState + 0x6d2b79f5) >>> 0;
    let t = this.seedState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  private drawPiece(): PieceType {
    if (!this.bag.length) {
      const b = [...PIECES];
      for (let i = b.length - 1; i > 0; i--) {
        const j = this.nextRand() % (i + 1);
        [b[i], b[j]] = [b[j], b[i]];
      }
      this.bag = b;
    }
    return this.bag.shift()!;
  }

  // ---------- geometry ----------
  get(x: number, y: number) {
    return this.board[y * W + x];
  }
  fits(type: PieceType, rot: Rot, x: number, y: number): boolean {
    for (const [cx, cy] of SHAPES[type][rot]) {
      const px = x + cx,
        py = y + cy;
      if (px < 0 || px >= W || py < 0 || py >= H) return false;
      if (this.board[py * W + px]) return false;
    }
    return true;
  }
  ghostY(): number {
    const p = this.piece;
    if (!p) return 0;
    let y = p.y;
    while (this.fits(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }
  private onGround(): boolean {
    const p = this.piece!;
    return !this.fits(p.type, p.rot, p.x, p.y + 1);
  }

  private spawn(type?: PieceType) {
    const t = type ?? this.queue.shift()!;
    if (!type) this.queue.push(this.drawPiece());
    const p: ActivePiece = { type: t, rot: 0, x: 3, y: 0 };
    this.piece = p;
    this.fallAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastRotate = false;
    this.lastKick = 0;
    if (!this.fits(p.type, p.rot, p.x, p.y)) {
      this.finish('topout');
      return;
    }
    // guideline: drop one row immediately if possible
    if (this.fits(p.type, p.rot, p.x, p.y + 1)) p.y++;
    this.lowestY = p.y;
  }

  private finish(result: 'topout' | 'goal' | 'time') {
    if (this.status === 'over') return;
    this.status = 'over';
    this.result = result;
    this.endTick = this.tick;
    this.events.push({ type: 'end', tick: this.tick, result });
  }

  private afterMove() {
    const p = this.piece!;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
    }
    if (this.onGround()) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }
  }

  private shift(dx: number): boolean {
    const p = this.piece!;
    if (!this.fits(p.type, p.rot, p.x + dx, p.y)) return false;
    p.x += dx;
    this.lastRotate = false;
    this.afterMove();
    return true;
  }

  private rotate(dir: 1 | -1 | 2): boolean {
    const p = this.piece!;
    const to = ((p.rot + dir + 4) % 4) as Rot;
    const ks = kicks(p.type, p.rot, to);
    for (let k = 0; k < ks.length; k++) {
      const [dx, dy] = ks[k];
      if (this.fits(p.type, to, p.x + dx, p.y + dy)) {
        p.x += dx;
        p.y += dy;
        p.rot = to;
        this.lastRotate = true;
        this.lastKick = k;
        this.afterMove();
        return true;
      }
    }
    return false;
  }

  /** Move down one row. Returns false when blocked. */
  private fall(soft: boolean): boolean {
    const p = this.piece!;
    if (!this.fits(p.type, p.rot, p.x, p.y + 1)) return false;
    p.y++;
    this.lastRotate = false;
    if (soft) this.score += 1;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  // ---------- public API ----------
  /** Apply one player action at the current tick. Returns true if it changed the game. */
  input(a: Action): boolean {
    if (this.status !== 'playing' || !this.piece) return false;
    this.stats.inputs++;
    switch (a) {
      case 'L':
        return this.shift(-1);
      case 'R':
        return this.shift(1);
      case 'CW':
        return this.rotate(1);
      case 'CCW':
        return this.rotate(-1);
      case '180':
        return this.rotate(2);
      case 'SD1':
        this.softDrop = true;
        return true;
      case 'SD0':
        this.softDrop = false;
        return true;
      case 'D1':
        return this.fall(true);
      case 'HD': {
        let n = 0;
        while (this.fall(false)) n++;
        this.score += n * 2;
        if (n > 0) this.lastRotate = false;
        this.lock();
        return true;
      }
      case 'HOLD': {
        if (this.holdUsed) return false;
        const cur = this.piece.type;
        const h = this.hold;
        this.hold = cur;
        this.holdUsed = true;
        this.events.push({ type: 'hold', tick: this.tick });
        this.spawn(h ?? undefined);
        return true;
      }
    }
    return false;
  }

  /** Queue incoming garbage (versus). It rises when the player next locks a piece without clearing. */
  addGarbage(lines: number, hole: number) {
    if (lines > 0) this.pendingGarbage.push([lines, Math.max(0, Math.min(W - 1, hole))]);
  }
  pendingGarbageLines() {
    return this.pendingGarbage.reduce((s, [n]) => s + n, 0);
  }

  /** Advance the simulation by one tick (gravity, lock delay, timers). */
  step() {
    if (this.status !== 'playing') return;
    this.tick++;
    if (this.rules.timeTicks && this.tick >= this.rules.timeTicks) {
      this.finish('time');
      return;
    }
    const p = this.piece;
    if (!p) return;
    let g = gravityFor(this.level);
    if (this.softDrop) g = Math.max(g * SOFT_DROP_FACTOR, 1000 / 2); // at least 30 rows/s
    this.fallAcc += g;
    while (this.fallAcc >= 1000) {
      this.fallAcc -= 1000;
      if (!this.fall(this.softDrop)) {
        this.fallAcc = 0;
        break;
      }
    }
    if (this.onGround()) {
      this.lockTimer++;
      if (this.lockTimer >= LOCK_DELAY || this.lockResets >= MAX_LOCK_RESETS) this.lock();
    } else this.lockTimer = 0;
  }

  /** Run until `tick` (inclusive). */
  advanceTo(tick: number) {
    while (this.tick < tick && this.status === 'playing') this.step();
  }

  private tspinKind(): 'none' | 'mini' | 'full' {
    const p = this.piece!;
    if (p.type !== 'T' || !this.lastRotate) return 'none';
    const corner = (cx: number, cy: number) => {
      const x = p.x + cx,
        y = p.y + cy;
      return x < 0 || x >= W || y >= H || (y >= 0 && this.board[y * W + x] !== 0);
    };
    const c = [corner(0, 0), corner(2, 0), corner(2, 2), corner(0, 2)]; // TL, TR, BR, BL
    const filled = c.filter(Boolean).length;
    if (filled < 3) return 'none';
    const front: Record<Rot, [number, number]> = { 0: [0, 1], 1: [1, 2], 2: [2, 3], 3: [3, 0] };
    const [a, b] = front[p.rot];
    if ((c[a] && c[b]) || this.lastKick === 4) return 'full';
    return 'mini';
  }

  private lock() {
    const p = this.piece!;
    const tspin = this.tspinKind();
    const placed: number[] = [];
    let above = true;
    for (const [cx, cy] of SHAPES[p.type][p.rot]) {
      const i = (p.y + cy) * W + p.x + cx;
      this.board[i] = PIECE_ID[p.type];
      placed.push(i);
      if (p.y + cy >= HIDDEN) above = false;
    }
    this.pieces++;
    this.events.push({ type: 'lock', tick: this.tick, piece: p.type, cells: placed });
    this.piece = null;
    this.holdUsed = false;

    // line clears
    const rows: number[] = [];
    for (let y = 0; y < H; y++) {
      let full = true;
      for (let x = 0; x < W; x++)
        if (!this.board[y * W + x]) {
          full = false;
          break;
        }
      if (full) rows.push(y);
    }
    this.lastAttack = 0;
    if (rows.length) {
      for (const y of rows) {
        this.board.copyWithin(W, 0, y * W);
        this.board.fill(0, 0, W);
      }
      this.combo++;
      const n = rows.length;
      const difficult = n === 4 || (tspin !== 'none' && n > 0);
      const b2bBonus = difficult && this.b2b;
      const perfect = this.board.every((v) => v === 0);
      let base: number;
      if (tspin === 'full') base = [400, 800, 1200, 1600][n];
      else if (tspin === 'mini') base = [100, 200, 400, 400][n];
      else base = [0, 100, 300, 500, 800][n];
      let points = base * this.level;
      if (b2bBonus) points = (points * 3) / 2;
      points += 50 * this.combo * this.level;
      if (perfect) points += [0, 800, 1200, 1800, 2000][n] * this.level * (b2bBonus && n === 4 ? 2 : 1);
      points = Math.floor(points);
      this.score += points;
      // attack
      let attack = tspin === 'full' ? ATTACK_TSPIN[Math.min(3, n)] : tspin === 'mini' ? ATTACK_MINI[Math.min(3, n)] : ATTACK_LINES[n];
      if (b2bBonus) attack += 1;
      attack += COMBO_ATTACK[Math.min(this.combo, COMBO_ATTACK.length - 1)];
      if (perfect) attack = PERFECT_ATTACK;
      // garbage cancelling: attack first offsets pending garbage
      while (attack > 0 && this.pendingGarbage.length) {
        const g = this.pendingGarbage[0];
        const used = Math.min(g[0], attack);
        g[0] -= used;
        attack -= used;
        if (g[0] === 0) this.pendingGarbage.shift();
      }
      this.lastAttack = attack;
      this.stats.attack += attack;
      if (difficult) this.b2b = true;
      else if (n > 0) this.b2b = false;
      if (tspin !== 'none') this.stats.tspins++;
      if (n === 1) this.stats.singles++;
      if (n === 2) this.stats.doubles++;
      if (n === 3) this.stats.triples++;
      if (n === 4) this.stats.quads++;
      if (perfect) this.stats.perfect++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.lines += n;
      this.events.push({ type: 'clear', tick: this.tick, rows, info: { lines: n, tspin, b2b: b2bBonus, combo: this.combo, perfect, points, attack } });
      if (this.rules.levelUp) {
        const lvl = Math.min(20, (this.cfg.startLevel ?? 1) + Math.floor(this.lines / 10));
        if (lvl > this.level) {
          this.level = lvl;
          this.events.push({ type: 'level', tick: this.tick, level: lvl });
        }
      }
      if (this.rules.lineGoal && this.lines >= this.rules.lineGoal) {
        this.finish('goal');
        return;
      }
    } else {
      this.combo = -1;
      if (tspin !== 'none') {
        // T-spin with no lines still scores
        this.score += (tspin === 'full' ? 400 : 100) * this.level;
        this.stats.tspins++;
      }
      // garbage rises
      if (this.pendingGarbage.length) {
        let total = 0;
        for (const [n, hole] of this.pendingGarbage) {
          const k = Math.min(n, H);
          // top-out if blocks are pushed out of the board
          for (let y = 0; y < k; y++)
            for (let x = 0; x < W; x++)
              if (this.board[y * W + x]) {
                this.pendingGarbage = [];
                this.finish('topout');
                return;
              }
          this.board.copyWithin(0, k * W);
          for (let y = H - k; y < H; y++) for (let x = 0; x < W; x++) this.board[y * W + x] = x === hole ? 0 : GARBAGE;
          total += k;
        }
        this.pendingGarbage = [];
        this.stats.garbageReceived += total;
        this.events.push({ type: 'garbage_in', tick: this.tick, lines: total });
      }
    }
    if (above && !rows.length) {
      // lock out: piece locked entirely in the hidden rows
      this.finish('topout');
      return;
    }
    this.spawn();
  }

  drainEvents(): BlocksEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Seconds elapsed (for sprint times). */
  seconds(): number {
    return (this.status === 'over' ? this.endTick : this.tick) / TPS;
  }

  /** Cheap state hash used to detect client/server divergence. */
  hash(): number {
    let h = 2166136261;
    const mix = (v: number) => {
      h ^= v & 0xff;
      h = Math.imul(h, 16777619);
    };
    for (let i = 0; i < this.board.length; i++) mix(this.board[i]);
    const p = this.piece;
    if (p) [PIECE_ID[p.type], p.rot, p.x, p.y].forEach(mix);
    mix(this.score);
    mix(this.score >>> 8);
    mix(this.lines);
    mix(this.pieces);
    return h >>> 0;
  }

  snapshot(): BlocksSnapshot {
    return {
      cfg: this.cfg,
      board: [...this.board],
      tick: this.tick,
      piece: this.piece ? { ...this.piece } : null,
      queue: [...this.queue],
      bag: [...this.bag],
      rngState: this.seedState,
      hold: this.hold,
      holdUsed: this.holdUsed,
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: this.combo,
      b2b: this.b2b,
      pieces: this.pieces,
      status: this.status,
      result: this.result,
      softDrop: this.softDrop,
      fallAcc: this.fallAcc,
      lockTimer: this.lockTimer,
      lockResets: this.lockResets,
      lowestY: this.lowestY,
      lastRotate: this.lastRotate,
      lastKick: this.lastKick,
      pendingGarbage: this.pendingGarbage.map((g) => [...g] as [number, number]),
      stats: { ...this.stats },
      endTick: this.endTick,
    };
  }

  static fromSnapshot(s: BlocksSnapshot): BlocksGame {
    const g = Object.create(BlocksGame.prototype) as BlocksGame;
    const m = g as unknown as Record<string, unknown>;
    Object.assign(m, {
      cfg: s.cfg,
      rules: MODE_RULES[s.cfg.mode],
      board: Uint8Array.from(s.board),
      tick: s.tick,
      piece: s.piece ? { ...s.piece } : null,
      queue: [...s.queue],
      hold: s.hold,
      holdUsed: s.holdUsed,
      score: s.score,
      lines: s.lines,
      level: s.level,
      combo: s.combo,
      b2b: s.b2b,
      pieces: s.pieces,
      status: s.status,
      result: s.result,
      endTick: s.endTick,
      softDrop: s.softDrop,
      pendingGarbage: s.pendingGarbage.map((x) => [...x]),
      stats: { ...s.stats },
      events: [],
      lastAttack: 0,
      seedState: s.rngState,
      bag: [...s.bag],
      fallAcc: s.fallAcc,
      lockTimer: s.lockTimer,
      lockResets: s.lockResets,
      lowestY: s.lowestY,
      lastRotate: s.lastRotate,
      lastKick: s.lastKick,
    });
    return g;
  }
}

/** One recorded input: action applied at the start of tick `t` (before that tick's gravity). */
export type InputRecord = [t: number, a: number];

/**
 * Replay a solo game from its seed and inputs. Used by the server to verify submitted records.
 * Inputs must be in non-decreasing tick order and use action indices into ACTIONS; `maxTicks` is the
 * tick at which the client reports the game ended.
 */
export function replay(cfg: BlocksConfig, inputs: InputRecord[], maxTicks: number): BlocksGame {
  const g = new BlocksGame(cfg);
  let last = 0;
  for (const [t, ai] of inputs) {
    if (t < last || t > maxTicks) throw new Error('bad input order');
    last = t;
    g.advanceTo(t);
    if (g.status !== 'playing') break;
    const a = ACTIONS[ai];
    if (!a) throw new Error('bad action');
    g.input(a);
  }
  // let the game run on to the submitted end tick (e.g. the ultra timer, or a final gravity lock)
  if (g.status === 'playing') g.advanceTo(maxTicks);
  return g;
}
