// Territory Rush bots. They read only what every player sees on screen (the board, heads, directions,
// trails). They never read other players' queued inputs or anything else hidden.
//
// Performance: all searches are early-exit BFS on reusable typed-array buffers, so 7 Hard bots on the
// largest map cost a few milliseconds per tick (browser main thread and Durable Object alike).
import { DIRS, NONE, type Dir, type TerritoryGame, type TPlayer } from './engine';

export type BotLevel = 'easy' | 'medium' | 'hard';

interface Leg {
  dir: Dir;
  /** steps to take outside own land; -1 = until home */
  len: number;
}

export interface BotMemory {
  legs: Leg[];
  legStep: number;
  mode: 'idle' | 'loop' | 'home' | 'attack';
  wanderTurnIn: number;
  homeAt: number;
}

export function newBotMemory(): BotMemory {
  return { legs: [], legStep: 0, mode: 'idle', wanderTurnIn: 0, homeAt: 0 };
}

const INF = 1 << 29;

// ---- reusable BFS buffers ----
let stamp = new Int32Array(0);
let dist = new Int32Array(0);
let queue = new Int32Array(0);
let gen = 0;
function ensure(n: number) {
  if (stamp.length < n) {
    stamp = new Int32Array(n);
    dist = new Int32Array(n);
    queue = new Int32Array(n);
    gen = 0;
  }
  gen++;
  if (gen > 1 << 30) {
    stamp.fill(0);
    gen = 1;
  }
}

/**
 * BFS from `start` over cells not blocked by `owner`'s trail. Stops at the first cell satisfying
 * `goal` (returns its distance) or after `limit` steps (returns INF).
 */
function searchTo(g: TerritoryGame, start: number, avoidTrailOf: number, goal: (i: number) => boolean, limit: number): number {
  if (goal(start)) return 0;
  ensure(g.w * g.h);
  let h = 0,
    t = 0;
  stamp[start] = gen;
  dist[start] = 0;
  queue[t++] = start;
  const W = g.w,
    H = g.h,
    tr = g.trail;
  while (h < t) {
    const c = queue[h++];
    const dc = dist[c] + 1;
    if (dc > limit) return INF;
    const x = c % W,
      y = (c / W) | 0;
    for (let k = 0; k < 4; k++) {
      let n: number;
      if (k === 0) {
        if (x === 0) continue;
        n = c - 1;
      } else if (k === 1) {
        if (x === W - 1) continue;
        n = c + 1;
      } else if (k === 2) {
        if (y === 0) continue;
        n = c - W;
      } else {
        if (y === H - 1) continue;
        n = c + W;
      }
      if (stamp[n] === gen || tr[n] === avoidTrailOf) continue;
      if (goal(n)) return dc;
      stamp[n] = gen;
      dist[n] = dc;
      queue[t++] = n;
    }
  }
  return INF;
}

function nextCell(g: TerritoryGame, p: { x: number; y: number }, dir: Dir): number {
  const [dx, dy] = DIRS[dir];
  const x = p.x + dx,
    y = p.y + dy;
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return -1;
  return g.idx(x, y);
}

function legalDirs(p: TPlayer): Dir[] {
  return ([0, 1, 2, 3] as Dir[]).filter((d) => (d + 2) % 4 !== p.dir);
}

function homeDistFrom(g: TerritoryGame, p: TPlayer, cell: number, limit = 80): number {
  const me = p.idx;
  return searchTo(g, cell, me, (i) => g.owner[i] === me, limit);
}

/** Manhattan distance from the nearest enemy head (enemies can cross anything but their own trail). */
function enemyDist(g: TerritoryGame, p: TPlayer, cell: number): number {
  const x = cell % g.w,
    y = (cell / g.w) | 0;
  let best = INF;
  for (const q of g.players) {
    if (!q.alive || q.idx === p.idx) continue;
    const d = Math.abs(q.x - x) + Math.abs(q.y - y);
    if (d < best) best = d;
  }
  return best;
}

interface Option {
  dir: Dir;
  cell: number;
  home: number; // distance home from that cell
}

function options(g: TerritoryGame, p: TPlayer, strict: boolean): Option[] {
  const out: Option[] = [];
  for (const d of legalDirs(p)) {
    const n = nextCell(g, p, d);
    if (n < 0 || g.trail[n] === p.idx) continue;
    const home = g.owner[n] === p.idx ? 0 : homeDistFrom(g, p, n);
    if (strict && home >= INF) continue;
    if (strict && g.owner[n] !== p.idx) {
      // never step next to an enemy head while exposed (head-on loses)
      const nx = n % g.w,
        ny = (n / g.w) | 0;
      let bad = false;
      for (const q of g.players) if (q.alive && q.idx !== p.idx && Math.abs(q.x - nx) + Math.abs(q.y - ny) <= 1) bad = true;
      if (bad) continue;
    }
    out.push({ dir: d, cell: n, home });
  }
  return out;
}

function bestHome(opts: Option[]): Dir | null {
  let b: Option | null = null;
  for (const o of opts) if (!b || o.home < b.home) b = o;
  return b?.dir ?? null;
}

/** Value of expanding into a rectangle: neutral cells 1, enemy land 1.4. */
function regionValue(g: TerritoryGame, p: TPlayer, x0: number, y0: number, x1: number, y1: number, enemyW = 1.4): number {
  let v = 0;
  for (let y = Math.max(0, y0); y <= Math.min(g.h - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(g.w - 1, x1); x++) {
      const o = g.owner[y * g.w + x];
      if (o === NONE) v += 1;
      else if (o !== p.idx) v += enemyW;
    }
  return v;
}

/** Plan a rectangular excursion: out `len` along a, across `wid` along b, back `len`, then home. */
function planLoop(g: TerritoryGame, p: TPlayer, level: BotLevel, rand: () => number): Leg[] | null {
  const dirs = legalDirs(p);
  const head = g.idx(p.x, p.y);
  const threat = enemyDist(g, p, head);
  let maxLen = level === 'hard' ? 18 : level === 'medium' ? 8 : 7;
  if (level !== 'easy' && threat < INF) maxLen = Math.max(3, Math.min(maxLen, Math.floor(threat / (level === 'hard' ? 1.6 : 3))));
  let best: { legs: Leg[]; score: number } | null = null;
  const tries = level === 'hard' ? 30 : 6;
  for (let t = 0; t < tries; t++) {
    const a = dirs[Math.floor(rand() * dirs.length)];
    const b = ((a + (rand() < 0.5 ? 1 : 3)) % 4) as Dir;
    const len = 3 + Math.floor(rand() * Math.max(1, maxLen - 2));
    const wid = 3 + Math.floor(rand() * Math.max(1, maxLen - 2));
    const [ax, ay] = DIRS[a];
    const [bx, by] = DIRS[b];
    const ex = p.x + ax * len + bx * wid,
      ey = p.y + ay * len + by * wid;
    if (ex < 1 || ey < 1 || ex > g.w - 2 || ey > g.h - 2) continue;
    const x0 = Math.min(p.x, ex),
      x1 = Math.max(p.x, ex),
      y0 = Math.min(p.y, ey),
      y1 = Math.max(p.y, ey);
    const value = regionValue(g, p, x0, y0, x1, y1, level === 'hard' ? 2.5 : 1.4);
    const perimeter = 2 * (len + wid);
    let score = level === 'hard' ? (value / perimeter) * (1 + perimeter / 80) : value / perimeter + rand();
    if (level === 'hard') {
      // an enemy closer to the far corner than our loop length can cut us: penalise
      const far = enemyDist(g, p, g.idx(ex, ey));
      if (far < perimeter * 0.7) score *= far / (perimeter * 0.7);
    }
    if (!best || score > best.score)
      best = {
        score,
        legs: [
          { dir: a, len },
          { dir: b, len: wid },
          { dir: ((a + 2) % 4) as Dir, len },
          { dir: ((b + 2) % 4) as Dir, len: -1 },
        ],
      };
  }
  return best?.legs ?? null;
}

/** Enemy trail cell we can reach before its owner gets home. Returns the direction to take. */
function attackDir(g: TerritoryGame, p: TPlayer, level: BotLevel, opts: Option[]): Dir | null {
  const range = level === 'hard' ? 22 : 6;
  let best: { d: number; dir: Dir } | null = null;
  for (const q of g.players) {
    if (!q.alive || q.idx === p.idx || q.trail.length < 3) continue;
    const qHead = g.idx(q.x, q.y);
    const qHome = level === 'hard' ? searchTo(g, qHead, q.idx, (i) => g.owner[i] === q.idx, 60) : Math.min(q.trail.length, 5);
    const qTrail = new Set(q.trail);
    for (const o of opts) {
      const d = 1 + searchTo(g, o.cell, p.idx, (i) => qTrail.has(i), range);
      if (d >= INF) continue;
      if ((d < qHome || d <= 2) && (!best || d < best.d)) best = { d, dir: o.dir };
    }
  }
  return best?.dir ?? null;
}

/** Decide and apply this tick's steering for bot `idx`. */
export function botThink(g: TerritoryGame, idx: number, mem: BotMemory, level: BotLevel, rand: () => number): void {
  const p = g.players[idx];
  if (!p?.alive) return;
  const head = g.idx(p.x, p.y);
  const atHome = g.owner[head] === p.idx;
  let opts = options(g, p, level !== 'easy');
  if (!opts.length) opts = options(g, p, false);
  if (!opts.length) return;
  const has = (d: Dir | null) => d !== null && opts.some((o) => o.dir === d);
  let want: Dir | null = null;

  if (level === 'easy') {
    // Easy: wander, turn at random, head home after a random trail length; ignores threats.
    if (!p.trail.length) mem.homeAt = 8 + Math.floor(rand() * 14);
    if (p.trail.length >= mem.homeAt) want = bestHome(opts);
    else if (--mem.wanderTurnIn <= 0) {
      mem.wanderTurnIn = 2 + Math.floor(rand() * 6);
      want = opts[Math.floor(rand() * opts.length)].dir;
    } else want = has(p.dir) ? p.dir : opts[0].dir;
    if (rand() < 0.03) want = legalDirs(p)[Math.floor(rand() * 3)]; // occasional blunder
    if (want !== null && want !== p.dir) g.steer(idx, want);
    return;
  }

  // exposure: how soon an enemy could touch our trail, vs how soon we are home
  let exposure = INF;
  if (p.trail.length) {
    exposure = enemyDist(g, p, head);
    for (const c of p.trail) exposure = Math.min(exposure, enemyDist(g, p, c));
  }
  const homeNow = p.trail.length ? Math.min(...opts.map((o) => o.home)) + 1 : 0;
  // medium reacts late (small margin, checks ~55% of ticks); hard always reacts with a wider margin
  const inDanger = p.trail.length > 0 && exposure <= homeNow + (level === 'hard' ? 3 : 1) && (level === 'hard' || rand() < 0.55);

  const atk = inDanger && level !== 'hard' ? null : attackDir(g, p, level, opts);
  if (atk !== null && (p.trail.length < (level === 'hard' ? 10 : 8) || !inDanger)) {
    mem.mode = 'attack';
    want = atk;
  } else if (inDanger) {
    mem.mode = 'home';
    mem.legs = [];
    want = bestHome(opts);
  } else {
    if (atHome && !p.trail.length && (mem.mode !== 'loop' || !mem.legs.length)) {
      mem.legs = planLoop(g, p, level, rand) ?? [];
      mem.legStep = 0;
      mem.mode = mem.legs.length ? 'loop' : 'idle';
    }
    if (mem.mode === 'loop' && mem.legs.length) {
      const leg = mem.legs[0];
      if (!atHome || leg.len === -1) mem.legStep++;
      if (leg.len !== -1 && mem.legStep >= leg.len) {
        mem.legs.shift();
        mem.legStep = 0;
      }
      if (mem.legs[0]) want = mem.legs[0].dir;
      if (atHome && p.trail.length === 0 && mem.legs.length < 4) {
        mem.legs = [];
        mem.mode = 'idle';
      }
    }
    if (want === null) want = p.trail.length ? bestHome(opts) : has(p.dir) ? p.dir : opts[0].dir;
    if (p.trail.length > (level === 'hard' ? 40 : 26)) want = bestHome(opts);
  }
  if (!has(want)) want = bestHome(opts) ?? opts[0].dir;
  if (want !== null && want !== p.dir) g.steer(idx, want);
}
