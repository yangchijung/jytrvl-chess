// JY Games — Snake Arena engine (JY Snake Rules v1.0, see docs/rules/snake.md).
//
// Deterministic fixed-step grid simulation shared by the browser (solo modes, local versus, rendering
// of online games) and the server (online versus / multiplayer arena, replay verification of solo
// records). One step = every snake moves one cell. All randomness comes from a seeded generator.

export const DIRS: readonly [number, number][] = [
  [0, -1], // 0 up
  [1, 0], // 1 right
  [0, 1], // 2 down
  [-1, 0], // 3 left
];
export type Dir = 0 | 1 | 2 | 3;
export const MAX_SNAKES = 8;
export const START_LEN = 4;

export type SnakeMode = 'classic' | 'survival' | 'timeattack' | 'versus';
export type SnakeMap = 'open' | 'pillars' | 'cross' | 'rooms';
export const MAPS: SnakeMap[] = ['open', 'pillars', 'cross', 'rooms'];
/** steps per second for the speed settings */
export const SPEEDS = { slow: 7, normal: 10, fast: 14 } as const;
export type SpeedName = keyof typeof SPEEDS;

export const FOOD_POINTS = 10;
export const GOLD_POINTS = 50;
export const GOLD_GROW = 3;
export const GOLD_LIFETIME = 60; // steps
export const KILL_POINTS = 50;
export const TIMEATTACK_PENALTY = 50;

export interface SnakeConfig {
  width: number;
  height: number;
  seed: number;
  mode: SnakeMode;
  map: SnakeMap;
  /** walls on the border (true) or wrap-around (false); versus always uses walls */
  walls: boolean;
  /** steps until the match ends (0 = no limit) */
  durationSteps: number;
}

export interface Snake {
  idx: number;
  id: string;
  name: string;
  color: number;
  bot: boolean;
  alive: boolean;
  body: number[]; // cell indices, head first
  dir: Dir;
  queue: Dir[];
  grow: number;
  score: number;
  foods: number;
  kills: number;
  maxLen: number;
  diedAt: number | null;
  killedBy: number | null;
  reason: 'wall' | 'self' | 'body' | 'head' | 'left' | null;
  deaths: number; // time attack: number of crashes
}

export type SnakeEvent =
  | { type: 'eat'; snake: number; cell: number; gold: boolean }
  | { type: 'death'; snake: number; by: number | null; reason: Snake['reason']; cell: number }
  | { type: 'respawn'; snake: number }
  | { type: 'obstacle'; cell: number };

export interface SnakeResult {
  winner: number | null;
  reason: 'last_standing' | 'all_dead' | 'time' | 'crash';
  ranking: number[];
}

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

export function arenaSizeFor(n: number): number {
  if (n <= 2) return 30;
  if (n <= 4) return 38;
  if (n <= 6) return 46;
  return 52;
}

export class SnakeGame {
  readonly cfg: SnakeConfig;
  readonly w: number;
  readonly h: number;
  /** 1 = wall/obstacle */
  readonly wall: Uint8Array;
  /** snake index occupying the cell, or -1 */
  readonly occ: Int8Array;
  snakes: Snake[] = [];
  /** food cells → 1 normal, 2 gold */
  food = new Map<number, number>();
  goldUntil = 0;
  step_ = 0;
  started = false;
  result: SnakeResult | null = null;
  events: SnakeEvent[] = [];
  /** cells changed this step (for network deltas): food/obstacles */
  private rand: () => number;
  private seedState: number;

  constructor(cfg: SnakeConfig) {
    this.cfg = cfg;
    this.w = cfg.width;
    this.h = cfg.height;
    this.wall = new Uint8Array(this.w * this.h);
    this.occ = new Int8Array(this.w * this.h).fill(-1);
    this.seedState = cfg.seed >>> 0;
    this.rand = () => {
      this.seedState = (this.seedState + 0x6d2b79f5) >>> 0;
      let t = this.seedState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.buildMap();
  }

  get tick() {
    return this.step_;
  }
  idx(x: number, y: number) {
    return y * this.w + x;
  }
  xy(i: number): [number, number] {
    return [i % this.w, Math.floor(i / this.w)];
  }

  private buildMap() {
    const { w, h } = this;
    const set = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < w && y < h) this.wall[this.idx(x, y)] = 1;
    };
    const m = this.cfg.map;
    if (m === 'pillars') {
      for (let y = 5; y < h - 4; y += 7) for (let x = 5; x < w - 4; x += 7) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(x + dx, y + dy);
    } else if (m === 'cross') {
      const cx = Math.floor(w / 2),
        cy = Math.floor(h / 2);
      const arm = Math.floor(Math.min(w, h) / 5);
      for (let k = -arm; k <= arm; k++) {
        if (Math.abs(k) < 2) continue; // gap in the middle
        set(cx + k, cy);
        set(cx, cy + k);
      }
    } else if (m === 'rooms') {
      const cx = Math.floor(w / 2),
        cy = Math.floor(h / 2);
      for (let x = 0; x < w; x++) if (Math.abs(x - Math.floor(w / 4)) > 1 && Math.abs(x - Math.floor((3 * w) / 4)) > 1) set(x, cy);
      for (let y = 0; y < h; y++) if (Math.abs(y - Math.floor(h / 4)) > 1 && Math.abs(y - Math.floor((3 * h) / 4)) > 1) set(cx, y);
    }
  }

  addSnake(id: string, name: string, bot: boolean, color?: number): Snake {
    if (this.snakes.length >= MAX_SNAKES) throw new Error('arena full');
    const s: Snake = {
      idx: this.snakes.length,
      id,
      name,
      color: color ?? this.snakes.length,
      bot,
      alive: true,
      body: [],
      dir: 1,
      queue: [],
      grow: 0,
      score: 0,
      foods: 0,
      kills: 0,
      maxLen: START_LEN,
      diedAt: null,
      killedBy: null,
      reason: null,
      deaths: 0,
    };
    this.snakes.push(s);
    return s;
  }

  /** Spawn lanes: snakes start on alternating sides facing inward, spread vertically. */
  private spawnSpot(k: number, n: number): { cells: number[]; dir: Dir } | null {
    const { w, h } = this;
    const rows = Math.ceil(n / 2);
    const side = k % 2; // 0 left, 1 right
    const row = Math.floor(k / 2);
    let y = Math.round(((row + 1) * h) / (rows + 1));
    if (n === 1) y = Math.floor(h / 2);
    for (let tries = 0; tries < h; tries++) {
      const yy = (y + tries) % h;
      const dir: Dir = side === 0 ? 1 : 3;
      const hx = side === 0 ? 3 + START_LEN : w - 4 - START_LEN;
      const cells: number[] = [];
      let ok = true;
      for (let j = 0; j < START_LEN; j++) {
        const x = side === 0 ? hx - j : hx + j;
        const i = this.idx(x, yy);
        if (this.wall[i] || this.occ[i] >= 0) ok = false;
        cells.push(i);
      }
      // head needs a few free cells ahead
      for (let j = 1; j <= 3 && ok; j++) {
        const x = side === 0 ? hx + j : hx - j;
        if (x < 0 || x >= w || this.wall[this.idx(x, yy)]) ok = false;
      }
      if (ok) return { cells, dir };
    }
    return null;
  }

  private place(s: Snake, k: number, n: number) {
    const spot = this.spawnSpot(k, n)!;
    s.body = spot.cells;
    s.dir = spot.dir;
    s.queue = [];
    s.grow = 0;
    for (const c of s.body) this.occ[c] = s.idx;
  }

  start() {
    this.snakes.forEach((s, k) => this.place(s, k, this.snakes.length));
    const foods = this.cfg.mode === 'versus' ? Math.max(3, this.snakes.length + 2) : 1;
    for (let i = 0; i < foods; i++) this.spawnFood(1);
    this.started = true;
  }

  steer(i: number, d: Dir): boolean {
    const s = this.snakes[i];
    if (!s || !s.alive || d < 0 || d > 3) return false;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d === last || (d + 2) % 4 === last) return false;
    if (s.queue.length >= 2) s.queue.shift();
    s.queue.push(d);
    return true;
  }

  private randomFree(): number {
    const n = this.w * this.h;
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(this.rand() * n);
      if (!this.wall[i] && this.occ[i] < 0 && !this.food.has(i)) return i;
    }
    for (let i = 0; i < n; i++) if (!this.wall[i] && this.occ[i] < 0 && !this.food.has(i)) return i;
    return -1;
  }
  private spawnFood(kind: 1 | 2) {
    const i = this.randomFree();
    if (i >= 0) this.food.set(i, kind);
    if (kind === 2) this.goldUntil = this.step_ + GOLD_LIFETIME;
  }

  /** next cell from i in direction d, or -1 if leaving a walled board */
  next(i: number, d: Dir): number {
    const [x, y] = this.xy(i);
    let nx = x + DIRS[d][0],
      ny = y + DIRS[d][1];
    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) {
      if (this.cfg.walls) return -1;
      nx = (nx + this.w) % this.w;
      ny = (ny + this.h) % this.h;
    }
    return this.idx(nx, ny);
  }

  private kill(s: Snake, reason: Snake['reason'], by: number | null, cell: number) {
    s.alive = false;
    s.diedAt = this.step_;
    s.reason = reason;
    s.killedBy = by;
    this.events.push({ type: 'death', snake: s.idx, by, reason, cell });
    if (by !== null && by !== s.idx) {
      this.snakes[by].kills++;
      this.snakes[by].score += KILL_POINTS;
    }
  }

  private removeBody(s: Snake, toFood: boolean) {
    let k = 0;
    for (const c of s.body) {
      if (this.occ[c] === s.idx) this.occ[c] = -1;
      // a fallen snake leaves food behind (every other cell) in versus
      if (toFood && k++ % 2 === 0 && !this.wall[c] && !this.food.has(c)) this.food.set(c, 1);
    }
    s.body = [];
  }

  step() {
    if (!this.started || this.result) return;
    this.events = [];
    this.step_++;
    const alive = this.snakes.filter((s) => s.alive);
    // 1. turn
    for (const s of alive) {
      const q = s.queue.shift();
      if (q !== undefined && (q + 2) % 4 !== s.dir) s.dir = q;
    }
    // 2. compute heads; who eats
    const head = new Map<number, number>();
    const eats = new Map<number, number>();
    for (const s of alive) {
      const n = this.next(s.body[0], s.dir);
      head.set(s.idx, n);
      if (n >= 0 && this.food.has(n)) eats.set(s.idx, this.food.get(n)!);
    }
    // 3. tails move (unless growing) — vacated cells are free this step
    for (const s of alive) {
      const growing = s.grow > 0 || eats.has(s.idx);
      if (!growing) {
        const tail = s.body.pop()!;
        if (this.occ[tail] === s.idx) this.occ[tail] = -1;
      } else if (s.grow > 0) s.grow--;
    }
    // 4. collisions
    const dead = new Map<number, { reason: Snake['reason']; by: number | null }>();
    const len = (s: Snake) => s.body.length + 1;
    for (const s of alive) {
      const n = head.get(s.idx)!;
      if (n < 0 || this.wall[n]) {
        dead.set(s.idx, { reason: 'wall', by: null });
        continue;
      }
      const o = this.occ[n];
      if (o >= 0) dead.set(s.idx, { reason: o === s.idx ? 'self' : 'body', by: o === s.idx ? null : o });
    }
    // head-to-head on the same cell: the longer snake survives, equal lengths both die
    for (const a of alive)
      for (const b of alive) {
        if (a.idx >= b.idx) continue;
        if (head.get(a.idx) !== head.get(b.idx) || head.get(a.idx)! < 0) continue;
        if (len(a) > len(b)) dead.set(b.idx, { reason: 'head', by: a.idx });
        else if (len(b) > len(a)) dead.set(a.idx, { reason: 'head', by: b.idx });
        else {
          dead.set(a.idx, { reason: 'head', by: b.idx });
          dead.set(b.idx, { reason: 'head', by: a.idx });
        }
      }
    // 5. apply moves for survivors
    for (const s of alive) {
      if (dead.has(s.idx)) continue;
      const n = head.get(s.idx)!;
      s.body.unshift(n);
      this.occ[n] = s.idx;
      const kind = eats.get(s.idx);
      if (kind) {
        this.food.delete(n);
        s.foods++;
        s.score += kind === 2 ? GOLD_POINTS : FOOD_POINTS;
        if (kind === 2) s.grow += GOLD_GROW - 1;
        this.events.push({ type: 'eat', snake: s.idx, cell: n, gold: kind === 2 });
      }
      s.maxLen = Math.max(s.maxLen, s.body.length);
    }
    // 6. deaths
    for (const [i, d] of dead) {
      const s = this.snakes[i];
      const cell = head.get(i)!;
      if (this.cfg.mode === 'timeattack') {
        // crash: penalty and respawn at length START_LEN
        s.deaths++;
        s.score = Math.max(0, s.score - TIMEATTACK_PENALTY);
        this.events.push({ type: 'death', snake: i, by: null, reason: d.reason, cell });
        this.removeBody(s, false);
        this.place(s, 0, 1);
        this.events.push({ type: 'respawn', snake: i });
        continue;
      }
      this.kill(s, d.reason, d.by, cell);
      this.removeBody(s, this.cfg.mode === 'versus');
    }
    // 7. food upkeep
    const want = this.cfg.mode === 'versus' ? Math.max(3, this.snakes.filter((s) => s.alive).length + 2) : 1;
    let normal = 0;
    for (const v of this.food.values()) if (v === 1) normal++;
    // eaten gold or expired gold
    for (const [c, v] of this.food) if (v === 2 && this.step_ >= this.goldUntil) this.food.delete(c);
    while (normal < want) {
      this.spawnFood(1);
      normal++;
      if (normal > this.w * this.h) break;
    }
    const hasGold = [...this.food.values()].includes(2);
    if (!hasGold && this.step_ % 97 === 0) this.spawnFood(2);
    // survival: an obstacle appears every 50 steps
    if (this.cfg.mode === 'survival' && this.step_ % 50 === 0) {
      const c = this.randomFree();
      if (c >= 0) {
        // never directly in front of a head
        const danger = alive.some((s) => s.alive && (this.next(s.body[0], s.dir) === c || this.next(this.next(s.body[0], s.dir), s.dir) === c));
        if (!danger) {
          this.wall[c] = 1;
          this.events.push({ type: 'obstacle', cell: c });
        }
      }
    }
    if (this.cfg.mode === 'survival') for (const s of this.snakes) if (s.alive && this.step_ % 10 === 0) s.score += 1;
    this.checkEnd();
  }

  private checkEnd() {
    const alive = this.snakes.filter((s) => s.alive);
    const total = this.snakes.length;
    const byLen = (a: Snake, b: Snake) => b.body.length - a.body.length || b.score - a.score;
    const rank = () => {
      const al = alive.slice().sort(byLen);
      const dead = this.snakes.filter((s) => !s.alive).sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0) || b.maxLen - a.maxLen);
      return [...al, ...dead].map((s) => s.idx);
    };
    if (this.cfg.mode !== 'versus') {
      if (this.cfg.mode === 'timeattack') {
        if (this.cfg.durationSteps && this.step_ >= this.cfg.durationSteps) this.result = { winner: 0, reason: 'time', ranking: [0] };
      } else if (!alive.length) this.result = { winner: null, reason: 'crash', ranking: [0] };
      return;
    }
    if (total >= 2 && alive.length === 1) this.result = { winner: alive[0].idx, reason: 'last_standing', ranking: rank() };
    else if (alive.length === 0) this.result = { winner: null, reason: 'all_dead', ranking: rank() };
    else if (this.cfg.durationSteps && this.step_ >= this.cfg.durationSteps) {
      const r = rank();
      const top = this.snakes[r[0]],
        second = this.snakes[r[1]];
      const tie = second && second.alive && second.body.length === top.body.length && second.score === top.score;
      this.result = { winner: tie ? null : r[0], reason: 'time', ranking: r };
    }
  }

  /** a player left an online match */
  forfeit(i: number) {
    const s = this.snakes[i];
    if (!s?.alive) return;
    this.kill(s, 'left', null, s.body[0] ?? 0);
    this.removeBody(s, false);
    this.checkEnd();
  }

  snapshot() {
    return {
      cfg: this.cfg,
      step: this.step_,
      wall: Array.from(this.wall),
      snakes: this.snakes.map((s) => ({ ...s, body: [...s.body], queue: [...s.queue] })),
      food: [...this.food.entries()],
      goldUntil: this.goldUntil,
      seedState: this.seedState,
      result: this.result,
      started: this.started,
    };
  }
  static fromSnapshot(s: ReturnType<SnakeGame['snapshot']>): SnakeGame {
    const g = new SnakeGame(s.cfg);
    g.step_ = s.step;
    g.wall.set(s.wall);
    g.snakes = s.snakes.map((x) => ({ ...x, body: [...x.body], queue: [...x.queue] }));
    g.occ.fill(-1);
    for (const x of g.snakes) for (const c of x.body) g.occ[c] = x.idx;
    g.food = new Map(s.food);
    g.goldUntil = s.goldUntil;
    g.seedState = s.seedState;
    g.result = s.result;
    g.started = s.started;
    return g;
  }
}

/** Solo record replay: inputs are [step, dir] pairs; returns the finished game. */
export function replaySolo(cfg: SnakeConfig, inputs: [number, number][], maxSteps: number): SnakeGame {
  const g = new SnakeGame(cfg);
  g.addSnake('p', 'P', false);
  g.start();
  let k = 0;
  while (!g.result && g.tick < maxSteps) {
    while (k < inputs.length && inputs[k][0] <= g.tick) {
      const [t, d] = inputs[k++];
      if (t < 0 || d < 0 || d > 3) throw new Error('bad input');
      g.steer(0, d as Dir);
    }
    g.step();
  }
  return g;
}

/** Steps per second: fixed by the speed setting; survival speeds up every 4 foods (max 18/s). */
export function stepsPerSecond(mode: SnakeMode, speed: SpeedName, foods: number): number {
  const base = SPEEDS[speed];
  return mode === 'survival' ? Math.min(18, base + Math.floor(foods / 4)) : base;
}
