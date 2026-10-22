// Territory Rush — computer players for continuous steering (T2, docs/product/TERRITORY_POINTER_V1.md).
// Bots steer exactly like people: they only set a target heading; the engine applies the same speed and the
// same turning limit to everyone. A loop is planned as "go out at an angle, sweep round in an arc, head for the
// nearest own land", so bot trails are curves, not right angles. They read only what is on screen.
import { type FlowGame, wrapAngle } from './flow';
import type { BotLevel } from './ai';

export interface FlowBotMemory {
  phase: 'home' | 'out' | 'arc' | 'back';
  outAngle: number;
  turnSign: 1 | -1;
  /** cells of trail before the arc starts */
  outLen: number;
  /** radians already swept in the arc */
  swept: number;
  /** cached angle home, refreshed every few steps */
  homeAngle: number | null;
  homeAge: number;
}
export const newFlowBotMemory = (): FlowBotMemory => ({ phase: 'home', outAngle: 0, turnSign: 1, outLen: 8, swept: 0, homeAngle: null, homeAge: 99 });

const LEN: Record<BotLevel, [number, number]> = { easy: [5, 10], medium: [7, 13], hard: [9, 16] };
const ARC: Record<BotLevel, number> = { easy: 0.09, medium: 0.11, hard: 0.13 }; // radians per step while sweeping

// reusable BFS buffers
let seen = new Int32Array(0);
let queue = new Int32Array(0);
let parent = new Int32Array(0);
let gen = 0;

/**
 * Angle towards home: the nearest own land cell found by a search that walks around own trail; the bot aims at
 * a point a few cells along that path (not straight at the goal), so it never cuts across its own line.
 */
function angleHome(g: FlowGame, idx: number): number | null {
  const p = g.players[idx];
  const f = g.flow[idx];
  const n = g.w * g.h;
  if (seen.length < n) {
    seen = new Int32Array(n);
    queue = new Int32Array(n);
    parent = new Int32Array(n);
    gen = 0;
  }
  gen++;
  const start = g.idx(Math.min(g.w - 1, Math.max(0, p.x)), Math.min(g.h - 1, Math.max(0, p.y)));
  let h = 0,
    t = 0;
  queue[t++] = start;
  seen[start] = gen;
  parent[start] = -1;
  while (h < t && h < 2500) {
    const c = queue[h++];
    if (g.owner[c] === idx && c !== start) {
      // walk back to the cell ~3 steps from the start
      const path: number[] = [];
      for (let k = c; k !== -1 && k !== start; k = parent[k]) path.push(k);
      const w = path[Math.max(0, path.length - 3)];
      const cx = (w % g.w) + 0.5,
        cy = Math.floor(w / g.w) + 0.5;
      return Math.atan2(cy - f.fy, cx - f.fx);
    }
    const x = c % g.w,
      y = (c / g.w) | 0;
    const nb = [x > 0 ? c - 1 : -1, x < g.w - 1 ? c + 1 : -1, y > 0 ? c - g.w : -1, y < g.h - 1 ? c + g.w : -1];
    for (const m of nb) {
      if (m < 0 || seen[m] === gen) continue;
      seen[m] = gen;
      if (g.trail[m] === idx && !p.trail.slice(-3).includes(m)) continue; // never plan through own trail
      parent[m] = c;
      queue[t++] = m;
    }
  }
  return null;
}

/** Is moving along `a` for `dist` cells from the head safe (inside the map, not into own older trail)? */
function clear(g: FlowGame, idx: number, a: number, dist: number): boolean {
  const p = g.players[idx];
  const f = g.flow[idx];
  const recent = p.trail.slice(-4);
  for (let s = 0.5; s <= dist; s += 0.5) {
    const x = f.fx + Math.cos(a) * s,
      y = f.fy + Math.sin(a) * s;
    if (x < 0.6 || y < 0.6 || x > g.w - 0.6 || y > g.h - 0.6) return false;
    const c = g.idx(Math.floor(x), Math.floor(y));
    if (g.trail[c] === idx && !recent.includes(c)) return false;
  }
  return true;
}

/** Closest enemy head (cells) to any of our trail cells or our head — how exposed the trail is. */
function exposure(g: FlowGame, idx: number): number {
  const p = g.players[idx];
  let best = Infinity;
  const pts = [[p.x, p.y], ...p.trail.filter((_, k) => k % 3 === 0).map((c) => [c % g.w, Math.floor(c / g.w)])];
  for (const q of g.players) {
    if (q.idx === idx || !q.alive) continue;
    for (const [x, y] of pts) best = Math.min(best, Math.abs(q.x - x) + Math.abs(q.y - y));
  }
  return best;
}

export function flowBotThink(g: FlowGame, idx: number, mem: FlowBotMemory, level: BotLevel, rand: () => number): void {
  const p = g.players[idx];
  const f = g.flow[idx];
  if (!p?.alive || !f) return;
  const out = p.trail.length > 0;
  if (++mem.homeAge >= 4 || mem.homeAngle === null) {
    mem.homeAngle = out ? angleHome(g, idx) : null;
    mem.homeAge = 0;
  }
  let target = f.target;

  if (!out) {
    if (mem.phase !== 'out') {
      // leaving home: towards open space (roughly the map centre), with some variety
      const toCentre = Math.atan2(g.h / 2 - f.fy, g.w / 2 - f.fx);
      mem.outAngle = wrapAngle(toCentre + (rand() - 0.5) * 2.2);
      mem.turnSign = rand() < 0.5 ? 1 : -1;
      const [a, b] = LEN[level];
      mem.outLen = a + Math.floor(rand() * (b - a + 1));
      mem.swept = 0;
      mem.phase = 'out';
    }
    target = mem.outAngle;
  } else {
    // taking over a runner that is already out (autopilot of a disconnected player): bring it home first
    if (mem.phase === 'home') mem.phase = 'back';
    if (mem.phase === 'out' && p.trail.length >= mem.outLen) mem.phase = 'arc';
    if (mem.phase === 'arc') {
      // sweep round at a steady rate (well below the turning limit), so the loop is a wide curve
      mem.swept += ARC[level];
      target = wrapAngle(f.heading + mem.turnSign * ARC[level]);
      if (mem.swept > 2.3) mem.phase = 'back';
    }
    // a long trail or (medium/hard) an enemy close to it: go home now
    const danger = level !== 'easy' && exposure(g, idx) <= (level === 'hard' ? 7 : 4);
    if (p.trail.length > mem.outLen * 3 || danger) mem.phase = 'back';
    if (mem.phase === 'back' && mem.homeAngle !== null) target = mem.homeAngle;
    if (mem.phase === 'out') target = mem.outAngle;
  }
  // easy bots wobble a little
  if (level === 'easy' && rand() < 0.05) target = wrapAngle(target + (rand() - 0.5) * 1.2);
  // keep away from the edge and from own older trail: try the target, then turns around it
  if (!clear(g, idx, target, 3)) {
    const cand = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6].map((d) => wrapAngle(target + d * mem.turnSign));
    const ok = cand.find((a) => clear(g, idx, a, 3));
    if (ok !== undefined) target = ok;
  }
  g.setTarget(idx, target);
}
