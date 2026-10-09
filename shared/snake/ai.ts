// Snake Arena computer players. They read only the visible arena (walls, food, every snake's body and
// heading) — never other players' queued, not-yet-applied inputs.
import { SnakeGame, type Dir, type Snake } from './engine';

export type SnakeLevel = 'easy' | 'medium' | 'hard';

export interface SnakeBotMemory {
  stamp: Int32Array | null;
  dist: Int32Array | null;
  gen: number;
}
export const newSnakeMemory = (): SnakeBotMemory => ({ stamp: null, dist: null, gen: 0 });

function buffers(g: SnakeGame, m: SnakeBotMemory) {
  const n = g.w * g.h;
  if (!m.stamp || m.stamp.length !== n) {
    m.stamp = new Int32Array(n);
    m.dist = new Int32Array(n);
    m.gen = 0;
  }
  m.gen++;
  return { stamp: m.stamp, dist: m.dist!, gen: m.gen };
}

/** blocked cells for planning: walls and bodies (tails that will move are treated as free) */
function blocked(g: SnakeGame, c: number, me: Snake): boolean {
  if (g.wall[c]) return true;
  const o = g.occ[c];
  if (o < 0) return false;
  const s = g.snakes[o];
  // a tail cell is free next step unless the snake is growing
  if (c === s.body[s.body.length - 1] && s.grow === 0 && s !== undefined && !(s.idx === me.idx && me.grow > 0)) return false;
  return true;
}

/** BFS distances from `from` (excluding blocked cells); returns the first-step direction for targets. */
function bfs(g: SnakeGame, m: SnakeBotMemory, me: Snake, from: number, isTarget: (c: number) => boolean, avoid?: Set<number>, limit = 1e9) {
  const { stamp, dist, gen } = buffers(g, m);
  const firstDir = new Map<number, Dir>();
  const q: number[] = [];
  stamp[from] = gen;
  dist[from] = 0;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if ((d + 2) % 4 === me.dir) continue;
    const n = g.next(from, d);
    if (n < 0 || blocked(g, n, me) || avoid?.has(n) || stamp[n] === gen) continue;
    stamp[n] = gen;
    dist[n] = 1;
    firstDir.set(n, d);
    q.push(n);
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (isTarget(c)) return { cell: c, dist: dist[c], dir: firstDir.get(c)! };
    if (dist[c] >= limit) continue;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = g.next(c, d);
      if (n < 0 || stamp[n] === gen || blocked(g, n, me) || avoid?.has(n)) continue;
      stamp[n] = gen;
      dist[n] = dist[c] + 1;
      firstDir.set(n, firstDir.get(c)!);
      q.push(n);
    }
  }
  return null;
}

/** number of reachable free cells from c (capped) */
function space(g: SnakeGame, m: SnakeBotMemory, me: Snake, c: number, cap: number, avoid?: Set<number>): number {
  const { stamp, gen } = buffers(g, m);
  const q = [c];
  stamp[c] = gen;
  for (let h = 0; h < q.length && q.length < cap; h++) {
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = g.next(q[h], d);
      if (n < 0 || stamp[n] === gen || blocked(g, n, me) || avoid?.has(n)) continue;
      stamp[n] = gen;
      q.push(n);
    }
  }
  return q.length;
}

/**
 * Time-aware reachable area: a body cell becomes free once its owner's tail has passed it,
 * i.e. after (segments behind it) steps. Entering cell c at BFS time t is allowed when it is free by then.
 */
function timedSpace(g: SnakeGame, m: SnakeBotMemory, me: Snake, start: number, cap: number, avoid?: Set<number>): number {
  const { stamp, dist, gen } = buffers(g, m);
  const freeAt = (c: number) => {
    if (g.wall[c]) return Infinity;
    const o = g.occ[c];
    if (o < 0) return 0;
    const s = g.snakes[o];
    const j = s.body.indexOf(c);
    return s.body.length - j + s.grow + (s.idx === me.idx ? 1 : 0);
  };
  const q = [start];
  stamp[start] = gen;
  dist[start] = 1;
  for (let h = 0; h < q.length && q.length < cap; h++) {
    const c = q[h];
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = g.next(c, d);
      if (n < 0 || stamp[n] === gen || avoid?.has(n)) continue;
      if (freeAt(n) > dist[c] + 1) continue;
      stamp[n] = gen;
      dist[n] = dist[c] + 1;
      q.push(n);
    }
  }
  return q.length;
}

function legal(g: SnakeGame, me: Snake): { d: Dir; c: number }[] {
  const out: { d: Dir; c: number }[] = [];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if ((d + 2) % 4 === me.dir) continue;
    const c = g.next(me.body[0], d);
    if (c < 0 || blocked(g, c, me)) continue;
    out.push({ d, c });
  }
  return out;
}

/** cells an enemy head could move into next step (for snakes at least as long as us) */
function headZones(g: SnakeGame, me: Snake): Set<number> {
  const z = new Set<number>();
  for (const s of g.snakes) {
    if (!s.alive || s.idx === me.idx) continue;
    if (s.body.length < me.body.length) continue; // we would win a head-on against shorter snakes
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if ((d + 2) % 4 === s.dir) continue;
      const c = g.next(s.body[0], d);
      if (c >= 0) z.add(c);
    }
  }
  return z;
}

export function snakeThink(g: SnakeGame, i: number, m: SnakeBotMemory, level: SnakeLevel, rand: () => number) {
  const me = g.snakes[i];
  if (!me?.alive) return;
  const head = me.body[0];
  const opts = legal(g, me);
  const steer = (d: Dir) => {
    if (d !== me.dir) g.steer(i, d);
  };
  if (!opts.length) return; // doomed

  const isFood = (c: number) => g.food.has(c);
  if (level === 'easy') {
    // greedy towards the nearest food by straight-line distance; sometimes misjudges
    let best: Dir = me.dir;
    let bestD = Infinity;
    const [hx, hy] = g.xy(head);
    let tx = hx,
      ty = hy;
    let near = Infinity;
    for (const c of g.food.keys()) {
      const [fx, fy] = g.xy(c);
      const d = Math.abs(fx - hx) + Math.abs(fy - hy);
      if (d < near) {
        near = d;
        tx = fx;
        ty = fy;
      }
    }
    const pool = rand() < 0.12 ? [0, 1, 2, 3].filter((d) => (d + 2) % 4 !== me.dir).map((d) => ({ d: d as Dir, c: g.next(head, d as Dir) })) : opts;
    for (const o of pool) {
      if (o.c < 0) continue;
      const [x, y] = g.xy(o.c);
      const d = Math.abs(tx - x) + Math.abs(ty - y) + (rand() < 0.15 ? 3 : 0);
      if (d < bestD) {
        bestD = d;
        best = o.d;
      }
    }
    steer(best);
    return;
  }

  const len = me.body.length;
  const zones = level === 'hard' ? headZones(g, me) : undefined;
  // safe options: enough room afterwards
  const cap = level === 'hard' ? len * 2 + 30 : len + 10;
  const scored = opts.map((o) => ({
    ...o,
    room: level === 'hard' ? lookaheadRoom(g, m, me, o.c, o.d, cap, zones) : space(g, m, me, o.c, cap),
    risky: zones?.has(o.c) ?? false,
  }));
  const need = level === 'hard' ? len + 4 : Math.min(len, 40);
  const roomy = scored.filter((o) => o.room >= need && !o.risky);

  if (level === 'hard') {
    // 1) interception: when longer than a nearby rival, move into the cell in front of its head
    for (const s of g.snakes) {
      if (!s.alive || s.idx === i || s.body.length >= len) continue;
      const front = g.next(s.body[0], s.dir);
      if (front < 0) continue;
      const hit = roomy.find((o) => o.c === front);
      if (hit) return steer(hit.d);
    }
    // 2) food we reach before any rival, and from which our tail is still reachable;
    //    when we are long relative to the free space, only take food that leaves plenty of room
    let free = 0;
    for (let c = 0; c < g.occ.length; c++) if (!g.wall[c] && g.occ[c] < 0) free++;
    const crowded = len * 4 > free;
    const path = bfs(g, m, me, head, (c) => isFood(c) && rivalDist(g, m, me, c) > 0, zones) ?? bfs(g, m, me, head, isFood, zones);
    if (path) {
      const cand = roomy.find((o) => o.d === path.dir && (!crowded || o.room >= Math.min(cap, len * 2)));
      if (cand) return steer(cand.d);
    }
    // 3) no good food: keep the most room, preferring moves from which we can still follow our own tail
    const tail = me.body[me.body.length - 1];
    const pool2 = (roomy.length ? roomy : scored).map((o) => ({ ...o, tail: tailReachable(g, m, me, o.c, tail) }));
    pool2.sort((a, b) => Number(b.tail) - Number(a.tail) || b.room - a.room || (a.risky ? 1 : 0) - (b.risky ? 1 : 0) || (a.d === me.dir ? -1 : 1));
    return steer(pool2[0].d);
  } else {
    // medium: shortest path to any food, if it keeps enough room
    const path = bfs(g, m, me, head, isFood);
    if (path) {
      // medium sometimes rushes for food without checking the room it leaves (an intentional weakness)
      const cand = (rand() < 0.08 ? scored.find((o) => o.d === path.dir) : undefined) ?? roomy.find((o) => o.d === path.dir) ?? (rand() < 0.3 ? scored.find((o) => o.d === path.dir) : undefined);
      if (cand) return steer(cand.d);
    }
  }
  // fallback: the move with the most room (prefer straight on ties)
  const pool = roomy.length ? roomy : scored;
  pool.sort((a, b) => b.room - a.room || (a.risky ? 1 : 0) - (b.risky ? 1 : 0) || (a.d === me.dir ? -1 : 1));
  steer(pool[0].d);
}

/**
 * Hard AI: room after this move *and* the best follow-up move (two-step look-ahead), so the snake does
 * not enter a corridor that looks big now but closes behind it.
 */
function lookaheadRoom(g: SnakeGame, m: SnakeBotMemory, me: Snake, c: number, d: Dir, cap: number, avoid?: Set<number>): number {
  const r1 = timedSpace(g, m, me, c, cap, avoid);
  if (r1 >= cap) return r1;
  const tail = me.body[me.body.length - 1];
  const prevC = g.occ[c],
    prevT = g.occ[tail];
  g.occ[c] = me.idx;
  if (me.grow === 0 && tail !== c) g.occ[tail] = -1;
  let best = 0;
  for (let d2 = 0 as Dir; d2 < 4; d2 = (d2 + 1) as Dir) {
    if ((d2 + 2) % 4 === d) continue;
    const n = g.next(c, d2);
    if (n < 0 || g.wall[n] || (g.occ[n] >= 0 && !(n === tail && me.grow === 0))) continue;
    best = Math.max(best, timedSpace(g, m, me, n, cap, avoid));
    if (best >= r1) break;
  }
  g.occ[c] = prevC;
  g.occ[tail] = prevT;
  return Math.min(r1, best);
}

/** can we reach our own tail cell from `from` (tail moves away, so following it is safe) */
function tailReachable(g: SnakeGame, m: SnakeBotMemory, me: Snake, from: number, tail: number): boolean {
  if (from === tail) return true;
  const { stamp, gen } = buffers(g, m);
  const q = [from];
  stamp[from] = gen;
  for (let h = 0; h < q.length; h++) {
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = g.next(q[h], d);
      if (n < 0 || stamp[n] === gen) continue;
      if (n === tail) return true;
      if (g.wall[n] || g.occ[n] >= 0) continue;
      stamp[n] = gen;
      q.push(n);
    }
  }
  return false;
}

/** our distance minus the nearest rival's distance to `c` would be ideal; we approximate with
 * Manhattan for rivals: returns > 0 when we are strictly closer than every rival head. */
function rivalDist(g: SnakeGame, _m: SnakeBotMemory, me: Snake, c: number): number {
  const [cx, cy] = g.xy(c);
  const [hx, hy] = g.xy(me.body[0]);
  const mine = Math.abs(cx - hx) + Math.abs(cy - hy);
  let best = Infinity;
  for (const s of g.snakes) {
    if (!s.alive || s.idx === me.idx) continue;
    const [x, y] = g.xy(s.body[0]);
    best = Math.min(best, Math.abs(cx - x) + Math.abs(cy - y));
  }
  return best === Infinity ? 1 : best - mine + (me.body.length > 10 ? 0 : 1);
}
