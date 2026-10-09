// Territory Rush (領地爭奪戰) — real-time territory game engine. Original JY Games design.
//
// Deterministic, fixed-tick grid simulation shared by the browser (local games, tutorial, rendering of
// online games) and the TerritoryRoom Durable Object (authoritative online games).
// It is intentionally independent of the turn-based board-game rules engines.
//
// Rules (docs/rules/territory.md):
//  * Every tick each living player moves one cell in its current direction (no 180° reversal).
//  * Outside its own land a player leaves a trail. Returning to its land converts the trail and every
//    cell the trail + land enclose into its land (stealing enemy land).
//  * Touching any trail kills the trail's owner (touching your own trail kills you). Leaving the map kills.
//  * Head-on collision: a player standing in its own land survives; players outside their land both die.
//  * A player whose land drops to zero is eliminated. Dead players' land becomes neutral.
//  * The game ends when one player (or none) is left, a player owns ≥ DOMINATION share, or time runs out.

export const DIRS: readonly [number, number][] = [
  [0, -1], // 0 up
  [1, 0], // 1 right
  [0, 1], // 2 down
  [-1, 0], // 3 left
];
export type Dir = 0 | 1 | 2 | 3;
export const NONE = -1;

export const TICK_MS = 100; // 10 moves per second
export const DOMINATION = 0.6;
export const START_RADIUS = 2; // 5x5 start land
export const MAX_PLAYERS = 8;

export type DeathReason = 'wall' | 'self' | 'cut' | 'collision' | 'land' | 'left';

export interface TPlayer {
  idx: number;
  id: string;
  name: string;
  color: number; // palette index
  bot: boolean;
  alive: boolean;
  x: number;
  y: number;
  dir: Dir;
  /** queued turns (max 2), one applied per tick */
  queue: Dir[];
  trail: number[]; // cell indices in order
  land: number; // number of owned cells
  kills: number;
  bestLand: number;
  diedAt: number | null;
  killedBy: number | null;
  reason: DeathReason | null;
}

export interface TerritoryEvent {
  type: 'capture' | 'death' | 'end';
  tick: number;
  player: number;
  by?: number | null;
  reason?: DeathReason;
  cells?: number;
}

export interface EndResult {
  winner: number | null;
  reason: 'last_standing' | 'domination' | 'time' | 'all_dead';
  ranking: number[]; // player indices, best first
}

export interface TerritoryConfig {
  width: number;
  height: number;
  durationTicks: number; // 0 = unlimited
  seed: number;
}

export function mapSizeFor(players: number): number {
  if (players <= 2) return 48;
  if (players <= 4) return 64;
  if (players <= 6) return 80;
  return 96;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CellChange {
  i: number;
  v: number;
}

export class TerritoryGame {
  readonly w: number;
  readonly h: number;
  readonly owner: Int8Array;
  readonly trail: Int8Array;
  readonly players: TPlayer[] = [];
  readonly cfg: TerritoryConfig;
  tick = 0;
  started = false;
  result: EndResult | null = null;
  events: TerritoryEvent[] = [];
  /** cell changes produced by the last step (for network deltas and capture animation) */
  ownerChanges: CellChange[] = [];
  trailChanges: CellChange[] = [];

  constructor(cfg: TerritoryConfig) {
    this.cfg = cfg;
    this.w = cfg.width;
    this.h = cfg.height;
    this.owner = new Int8Array(this.w * this.h).fill(NONE);
    this.trail = new Int8Array(this.w * this.h).fill(NONE);
  }

  idx(x: number, y: number) {
    return y * this.w + x;
  }

  /** Spawn positions spread on a ring, deterministic from the seed. */
  spawnPoints(n: number): [number, number][] {
    const r = rng(this.cfg.seed ^ 0x9e3779b9);
    const cx = this.w / 2,
      cy = this.h / 2;
    const rad = Math.min(this.w, this.h) * 0.33;
    const offset = r() * Math.PI * 2;
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = offset + (k / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rad + (r() - 0.5) * 2);
      const y = Math.round(cy + Math.sin(a) * rad + (r() - 0.5) * 2);
      pts.push([Math.max(START_RADIUS + 1, Math.min(this.w - START_RADIUS - 2, x)), Math.max(START_RADIUS + 1, Math.min(this.h - START_RADIUS - 2, y))]);
    }
    return pts;
  }

  addPlayer(id: string, name: string, bot: boolean, color?: number): TPlayer {
    if (this.players.length >= MAX_PLAYERS) throw new Error('room full');
    const idx = this.players.length;
    const p: TPlayer = {
      idx,
      id,
      name,
      color: color ?? idx,
      bot,
      alive: true,
      x: 0,
      y: 0,
      dir: 1,
      queue: [],
      trail: [],
      land: 0,
      kills: 0,
      bestLand: 0,
      diedAt: null,
      killedBy: null,
      reason: null,
    };
    this.players.push(p);
    return p;
  }

  /** Places players and their start land. Call once after all players are added. */
  start() {
    const pts = this.spawnPoints(this.players.length);
    this.players.forEach((p, k) => {
      const [x, y] = pts[k];
      p.x = x;
      p.y = y;
      // face towards the map centre
      const dx = this.w / 2 - x,
        dy = this.h / 2 - y;
      p.dir = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0) as Dir;
      for (let yy = y - START_RADIUS; yy <= y + START_RADIUS; yy++)
        for (let xx = x - START_RADIUS; xx <= x + START_RADIUS; xx++) {
          const i = this.idx(xx, yy);
          if (this.owner[i] === NONE) {
            this.owner[i] = p.idx;
            p.land++;
          }
        }
      p.bestLand = p.land;
    });
    this.started = true;
  }

  /** Queue a direction change. Reversal and duplicates are ignored. Returns true if accepted. */
  steer(playerIdx: number, d: Dir): boolean {
    const p = this.players[playerIdx];
    if (!p || !p.alive || d < 0 || d > 3) return false;
    const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (d === last || (d + 2) % 4 === last) return false;
    if (p.queue.length >= 2) p.queue.shift();
    p.queue.push(d);
    return true;
  }

  alivePlayers(): TPlayer[] {
    return this.players.filter((p) => p.alive);
  }

  share(p: TPlayer): number {
    return p.land / (this.w * this.h);
  }

  score(p: TPlayer): number {
    return p.bestLand + p.kills * 50;
  }

  private setOwner(i: number, v: number) {
    const prev = this.owner[i];
    if (prev === v) return;
    if (prev >= 0) this.players[prev].land--;
    if (v >= 0) this.players[v].land++;
    this.owner[i] = v;
    this.ownerChanges.push({ i, v });
  }

  private setTrail(i: number, v: number) {
    if (this.trail[i] === v) return;
    this.trail[i] = v;
    this.trailChanges.push({ i, v });
  }

  private kill(p: TPlayer, reason: DeathReason, by: number | null) {
    if (!p.alive) return;
    p.alive = false;
    p.diedAt = this.tick;
    p.reason = reason;
    p.killedBy = by;
    if (by !== null && by !== p.idx && this.players[by]) this.players[by].kills++;
    this.events.push({ type: 'death', tick: this.tick, player: p.idx, by, reason });
  }

  /** Remove a dead player's trail and land from the board. */
  private clearPlayer(p: TPlayer) {
    for (const c of p.trail) if (this.trail[c] === p.idx) this.setTrail(c, NONE);
    p.trail = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === p.idx) this.setOwner(i, NONE);
  }

  /** Remove a player that left (counts as death without killer). */
  forfeit(playerIdx: number) {
    const p = this.players[playerIdx];
    if (!p?.alive) return;
    this.kill(p, 'left', null);
    this.clearPlayer(p);
    this.checkEnd();
  }

  /** Converts p's trail to land and fills every region enclosed by p's land. */
  private capture(p: TPlayer): number {
    const before = p.land;
    for (const c of p.trail) {
      this.setTrail(c, NONE);
      this.setOwner(c, p.idx);
    }
    p.trail = [];
    // bounding box of p's land, expanded by one cell
    let x0 = this.w,
      y0 = this.h,
      x1 = -1,
      y1 = -1;
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] !== p.idx) continue;
      const x = i % this.w,
        y = (i / this.w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(this.w - 1, x1 + 1);
    y1 = Math.min(this.h - 1, y1 + 1);
    const bw = x1 - x0 + 1,
      bh = y1 - y0 + 1;
    const seen = new Uint8Array(bw * bh);
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      const li = (y - y0) * bw + (x - x0);
      if (seen[li]) return;
      if (this.owner[this.idx(x, y)] === p.idx) return;
      seen[li] = 1;
      stack.push(x, y);
    };
    // everything reachable from the box border (or the map edge) without crossing p's land is outside
    for (let x = x0; x <= x1; x++) {
      push(x, y0);
      push(x, y1);
    }
    for (let y = y0; y <= y1; y++) {
      push(x0, y);
      push(x1, y);
    }
    while (stack.length) {
      const y = stack.pop()!,
        x = stack.pop()!;
      if (x > x0) push(x - 1, y);
      if (x < x1) push(x + 1, y);
      if (y > y0) push(x, y - 1);
      if (y < y1) push(x, y + 1);
    }
    const victims = new Set<number>();
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const li = (y - y0) * bw + (x - x0);
        const i = this.idx(x, y);
        if (seen[li] || this.owner[i] === p.idx) continue;
        const prev = this.owner[i];
        if (prev >= 0) victims.add(prev);
        this.setOwner(i, p.idx);
      }
    for (const v of victims) {
      const vp = this.players[v];
      if (vp.alive && vp.land <= 0) {
        this.kill(vp, 'land', p.idx);
      }
    }
    const gained = p.land - before;
    this.events.push({ type: 'capture', tick: this.tick, player: p.idx, cells: gained });
    return gained;
  }

  /** Advance the simulation by one tick. */
  step(): void {
    this.ownerChanges = [];
    this.trailChanges = [];
    this.events = [];
    if (!this.started || this.result) return;
    this.tick++;
    const movers = this.alivePlayers();
    // 1) turning and target cells
    const next = new Map<number, number>();
    const from = new Map<number, number>();
    for (const p of movers) {
      if (p.queue.length) {
        const d = p.queue.shift()!;
        if ((d + 2) % 4 !== p.dir) p.dir = d;
      }
      const [dx, dy] = DIRS[p.dir];
      const nx = p.x + dx,
        ny = p.y + dy;
      from.set(p.idx, this.idx(p.x, p.y));
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) {
        this.kill(p, 'wall', null);
        continue;
      }
      next.set(p.idx, this.idx(nx, ny));
    }
    // 2) head-on and swap collisions
    const ids = [...next.keys()];
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const pa = this.players[ids[a]],
          pb = this.players[ids[b]];
        const same = next.get(pa.idx) === next.get(pb.idx);
        const swap = next.get(pa.idx) === from.get(pb.idx) && next.get(pb.idx) === from.get(pa.idx);
        if (!same && !swap) continue;
        const aSafe = pa.trail.length === 0;
        const bSafe = pb.trail.length === 0;
        if (aSafe && !bSafe) this.kill(pb, 'collision', pa.idx);
        else if (bSafe && !aSafe) this.kill(pa, 'collision', pb.idx);
        else if (!aSafe && !bSafe) {
          this.kill(pa, 'collision', pb.idx);
          this.kill(pb, 'collision', pa.idx);
        }
      }
    // 3) trail hits (against trails as they were before this tick's new cells)
    for (const [pi, c] of next) {
      const p = this.players[pi];
      if (!p.alive) continue;
      const t = this.trail[c];
      if (t >= 0) {
        const victim = this.players[t];
        if (t === pi) this.kill(p, 'self', null);
        else if (victim.alive) this.kill(victim, 'cut', pi);
      }
    }
    // 4) move survivors, lay trails, capture
    for (const [pi, c] of next) {
      const p = this.players[pi];
      if (!p.alive) continue;
      p.x = c % this.w;
      p.y = (c / this.w) | 0;
      if (this.owner[c] === pi) {
        if (p.trail.length) this.capture(p);
      } else {
        p.trail.push(c);
        this.setTrail(c, pi);
      }
    }
    // 5) cleanup dead players (including those who lost all land through captures)
    for (const p of this.players) if (!p.alive && p.diedAt === this.tick) this.clearPlayer(p);
    for (const p of this.players) if (p.land > p.bestLand) p.bestLand = p.land;
    this.checkEnd();
  }

  private checkEnd() {
    if (this.result) return;
    const alive = this.alivePlayers();
    const total = this.w * this.h;
    let res: EndResult['reason'] | null = null;
    let winner: number | null = null;
    if (this.players.length >= 2 && alive.length <= 1) {
      res = alive.length === 1 ? 'last_standing' : 'all_dead';
      winner = alive[0]?.idx ?? null;
    } else if (this.players.length === 1 && alive.length === 0) {
      res = 'all_dead';
    }
    const dom = alive.find((p) => p.land / total >= DOMINATION);
    if (!res && dom) {
      res = 'domination';
      winner = dom.idx;
    }
    if (!res && this.cfg.durationTicks > 0 && this.tick >= this.cfg.durationTicks) {
      res = 'time';
      const best = [...alive].sort((a, b) => b.land - a.land);
      winner = best[0] && (!best[1] || best[0].land > best[1].land) ? best[0].idx : null;
    }
    if (!res) return;
    if (res === 'all_dead') {
      // last to die wins nothing; ranking by survival time then land
    }
    const ranking = [...this.players]
      .sort((a, b) => {
        if (a.idx === winner) return -1;
        if (b.idx === winner) return 1;
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (a.alive && b.alive) return b.land - a.land;
        if ((b.diedAt ?? 0) !== (a.diedAt ?? 0)) return (b.diedAt ?? 0) - (a.diedAt ?? 0);
        return b.bestLand - a.bestLand;
      })
      .map((p) => p.idx);
    this.result = { winner, reason: res, ranking };
    this.events.push({ type: 'end', tick: this.tick, player: winner ?? -1 });
  }

  /** Compact snapshot for network sync (owner/trail grids run-length encoded). */
  snapshot(): TerritorySnapshot {
    return {
      w: this.w,
      h: this.h,
      tick: this.tick,
      owner: rle(this.owner),
      trail: rle(this.trail),
      players: this.players.map(publicPlayer),
      result: this.result,
      durationTicks: this.cfg.durationTicks,
    };
  }

  static fromSnapshot(s: TerritorySnapshot): TerritoryGame {
    const g = new TerritoryGame({ width: s.w, height: s.h, durationTicks: s.durationTicks, seed: 0 });
    unrle(s.owner, g.owner);
    unrle(s.trail, g.trail);
    g.tick = s.tick;
    g.started = true;
    g.result = s.result;
    for (const pp of s.players) {
      const p = g.addPlayer(pp.id, pp.name, pp.bot, pp.color);
      applyPublic(p, pp);
    }
    for (let i = 0; i < g.trail.length; i++) {
      const t = g.trail[i];
      if (t >= 0 && !g.players[t].trail.includes(i)) g.players[t].trail.push(i);
    }
    return g;
  }
}

export interface PublicPlayer {
  idx: number;
  id: string;
  name: string;
  color: number;
  bot: boolean;
  alive: boolean;
  x: number;
  y: number;
  dir: Dir;
  land: number;
  kills: number;
  bestLand: number;
  trailLen: number;
  reason: DeathReason | null;
  killedBy: number | null;
}

export function publicPlayer(p: TPlayer): PublicPlayer {
  return {
    idx: p.idx,
    id: p.id,
    name: p.name,
    color: p.color,
    bot: p.bot,
    alive: p.alive,
    x: p.x,
    y: p.y,
    dir: p.dir,
    land: p.land,
    kills: p.kills,
    bestLand: p.bestLand,
    trailLen: p.trail.length,
    reason: p.reason,
    killedBy: p.killedBy,
  };
}

export function applyPublic(p: TPlayer, pp: PublicPlayer) {
  p.alive = pp.alive;
  p.x = pp.x;
  p.y = pp.y;
  p.dir = pp.dir;
  p.land = pp.land;
  p.kills = pp.kills;
  p.bestLand = pp.bestLand;
  p.reason = pp.reason;
  p.killedBy = pp.killedBy;
}

export interface TerritorySnapshot {
  w: number;
  h: number;
  tick: number;
  owner: number[];
  trail: number[];
  players: PublicPlayer[];
  result: EndResult | null;
  durationTicks: number;
}

/** Run-length encoding: [value, count, value, count, …] */
export function rle(a: Int8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

export function unrle(r: number[], into: Int8Array) {
  let k = 0;
  for (let j = 0; j < r.length; j += 2) {
    into.fill(r[j], k, k + r[j + 1]);
    k += r[j + 1];
  }
}
