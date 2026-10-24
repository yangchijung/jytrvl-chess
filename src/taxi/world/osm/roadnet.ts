// Rush Taxi — the real-map road network for traffic, built from the OpenStreetMap roads (./data.ts).
//
// `level.graph` only knows nodes and edges. Traffic on real streets needs more, so this builds:
// - lanes: directed, one per lane of each road piece. One-way roads only run a → b and use the full width;
//   two-way roads get lanes on the right half (Taiwan drives on the right). The lane count comes from the width.
//   Each lane is the road's centre line, offset to the right and trimmed back from the junctions.
// - turns: at the end of each lane, a smooth curve onto every road the car may take next, with a weight that
//   prefers going straight on and onto bigger roads.
// - signals: traffic lights where at least two streets of rank ≥ 3 meet. Junction nodes close together (a dual
//   carriageway crossing is four nodes) form one signal group with one clock; each approach has a phase
//   (0 = the group's main street, 1 = the cross street), and one head stands on the far-right corner of it.
//
// Plain data and maths only (no Three.js), so unit tests can check it.
import { RANK, type OsmCityData, type XZ } from './data';
import { surfaceTests } from './walks';

export interface Turn {
  /** the lane taken next */
  lane: number;
  /** signed turn angle (rad): + = right, − = left (x east, z south) */
  angle: number;
  /** choice weight: straight on and bigger roads weigh more */
  w: number;
  /** the curve through the junction, from this lane's end to the next lane's start */
  pts: XZ[];
  len: number;
}
export interface Lane {
  id: number;
  /** index into data.roads */
  road: number;
  /** runs along the road's points (a → b) */
  fwd: boolean;
  /** junction nodes (data.nodes indices) it leaves and reaches */
  from: number;
  to: number;
  /** lane index: 0 = next to the centre line (two-way) or the left edge (one-way); n − 1 = by the kerb */
  k: number;
  n: number;
  rank: number;
  /** offset of the lane from the road centre line, to the right of travel (m) */
  off: number;
  pts: XZ[];
  len: number;
  out: Turn[];
  /** the traffic light at its end, when it enters a signal group from outside */
  signal?: { group: number; phase: 0 | 1; t0: number };
  /** unsignalled junction with three or more roads at its end: give way when it is busy */
  yieldAt?: boolean;
}
export interface SignalHead {
  x: number;
  z: number;
  /** the head faces this way (radians, 0 = +z): back towards the traffic it controls */
  yaw: number;
  phase: 0 | 1;
  /** clock offset of its group (s) */
  t0: number;
  group: number;
}
export interface RoadNet {
  lanes: Lane[];
  /** lanes leaving each node */
  byNode: number[][];
  heads: SignalHead[];
  /** signal group of each node (−1 = none) */
  group: number[];
}

/** one light cycle (20 s): phase 0 goes first, then phase 1; the same timing as the grid city's lights */
export function phaseLight(phase: 0 | 1, t: number): 'green' | 'yellow' | 'red' {
  const p = ((t % 20) + 20) % 20;
  if (phase === 0) return p < 8 ? 'green' : p < 10 ? 'yellow' : 'red';
  return p < 10 ? 'red' : p < 18 ? 'green' : 'yellow';
}

/** lanes per direction for a carriageway width (m); two-way roads split the width in half */
export function laneCount(w: number, oneway: boolean) {
  const half = oneway ? w : w / 2;
  return Math.max(1, Math.min(oneway ? 4 : 3, Math.round(half / 3.3)));
}
/** lane centre offsets to the right of travel, from lane 0 to n − 1 */
export function laneOffsets(w: number, oneway: boolean) {
  const n = laneCount(w, oneway);
  const lw = (oneway ? w : w / 2) / n;
  return Array.from({ length: n }, (_, k) => (oneway ? -w / 2 : 0) + (k + 0.5) * lw);
}

function hash(k: number) {
  let x = Math.imul(k ^ 0x9e3779b9, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

export function lineLength(pts: XZ[]) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}
/** the polyline offset to the right of travel by d (mitred, the mitre capped) */
export function offsetLine(pts: XZ[], d: number): XZ[] {
  const n = pts.length;
  const seg = (i: number) => {
    const dx = pts[i + 1][0] - pts[i][0],
      dz = pts[i + 1][1] - pts[i][1];
    const L = Math.hypot(dx, dz) || 1;
    return [dx / L, dz / L];
  };
  return pts.map((p, i) => {
    const u0 = seg(Math.max(0, i - 1)),
      u1 = seg(Math.min(n - 2, i));
    // right of (dx, dz) is (−dz, dx)
    let rx = -(u0[1] + u1[1]),
      rz = u0[0] + u1[0];
    const rl = Math.hypot(rx, rz);
    if (rl < 1e-6) (rx = -u1[1]), (rz = u1[0]);
    else (rx /= rl), (rz /= rl);
    const cos = Math.max(0.5, rx * -u1[1] + rz * u1[0]);
    return [p[0] + (rx * d) / cos, p[1] + (rz * d) / cos];
  });
}
/** the part of a polyline from distance s0 to s1 */
export function subLine(pts: XZ[], s0: number, s1: number): XZ[] {
  const out: XZ[] = [];
  let acc = 0;
  const lerp = (a: XZ, b: XZ, t: number): XZ => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < pts.length - 1; i++) {
    const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const a = acc,
      b = acc + L;
    if (b >= s0 && a <= s1 && L > 0) {
      if (!out.length) out.push(lerp(pts[i], pts[i + 1], Math.max(0, (s0 - a) / L)));
      if (b <= s1) out.push(pts[i + 1]);
      else {
        out.push(lerp(pts[i], pts[i + 1], (s1 - a) / L));
        break;
      }
    }
    acc = b;
  }
  if (out.length < 2) return [pts[0], pts[pts.length - 1]];
  return out;
}
function bezier(p0: XZ, p1: XZ, p2: XZ, p3: XZ, n = 8): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}
const dirAt = (pts: XZ[], end: boolean): XZ => {
  const [a, b] = end ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[0], pts[1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
};

/** a road end at a junction node: the unit direction pointing away from the node along the road */
interface End {
  road: number;
  atA: boolean;
  ux: number;
  uz: number;
  w: number;
  rank: number;
  len: number;
}

export function buildRoadNet(data: OsmCityData): RoadNet {
  const roads = data.roads;
  const nodeCount = data.nodes.length;
  const ends: End[][] = Array.from({ length: nodeCount }, () => []);
  const lens = roads.map((r) => lineLength(r.pts));
  roads.forEach((r, ri) => {
    if (r.a === r.b || r.pts.length < 2 || lens[ri] < 0.5) return;
    const s = dirAt(r.pts, false),
      e = dirAt(r.pts, true);
    ends[r.a].push({ road: ri, atA: true, ux: s[0], uz: s[1], w: r.w, rank: RANK[r.cls], len: lens[ri] });
    ends[r.b].push({ road: ri, atA: false, ux: -e[0], uz: -e[1], w: r.w, rank: RANK[r.cls], len: lens[ri] });
  });

  // ---------- setbacks: how far each road's lanes stop short of the node (the junction box) ----------
  const setback = (node: number, e: End) => {
    const others = ends[node].filter((o) => o !== e);
    if (others.length === 0) return 0; // dead end
    if (others.length === 1) return 0.8; // the road simply goes on
    let s = 0;
    for (const o of others) {
      // a crossing road needs its half width; a road leaving almost straight on needs less
      const sin = Math.abs(e.ux * o.uz - e.uz * o.ux);
      s = Math.max(s, (o.w / 2) * Math.max(0.35, sin) + 1.0);
    }
    return s;
  };
  const back = roads.map((_, ri) => {
    const r = roads[ri];
    const ea = ends[r.a].find((e) => e.road === ri && e.atA);
    const eb = ends[r.b].find((e) => e.road === ri && !e.atA);
    if (!ea || !eb) return [0, 0];
    let s0 = setback(r.a, ea),
      s1 = setback(r.b, eb);
    const room = lens[ri] - 0.6;
    if (s0 + s1 > room) {
      const k = Math.max(0, room) / (s0 + s1 || 1);
      s0 *= k;
      s1 *= k;
    }
    return [s0, s1];
  });

  // ---------- signals: nodes where two or more streets of rank ≥ 3 meet ----------
  const isSignal = new Array<boolean>(nodeCount).fill(false);
  for (let n = 0; n < nodeCount; n++) {
    const E = ends[n];
    if (E.length < 3) continue;
    // ends almost opposite each other are the same street going through
    const street = E.map((_, i) => i);
    for (let i = 0; i < E.length; i++)
      for (let j = i + 1; j < E.length; j++)
        if (E[i].ux * E[j].ux + E[i].uz * E[j].uz < -0.85 && street[j] === j && street[i] === i) street[j] = i;
    const big = new Set<number>();
    E.forEach((e, i) => e.rank >= 3 && big.add(street[i]));
    isSignal[n] = big.size >= 2;
  }
  // signal nodes joined by a short road piece are one junction (dual carriageways cross at four nodes)
  const parent = Array.from({ length: nodeCount }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  roads.forEach((r, ri) => {
    if (isSignal[r.a] && isSignal[r.b] && lens[ri] < 30) parent[find(r.a)] = find(r.b);
  });
  const group = new Array<number>(nodeCount).fill(-1);
  for (let n = 0; n < nodeCount; n++) if (isSignal[n]) group[n] = find(n);
  // the main street of each group: the direction of its biggest, longest road end
  const mainDir = new Map<number, [number, number, number]>();
  for (let n = 0; n < nodeCount; n++) {
    if (group[n] < 0) continue;
    for (const e of ends[n]) {
      const cur = mainDir.get(group[n]);
      const score = e.rank * 1000 + Math.min(999, e.len);
      if (!cur || score > cur[2]) mainDir.set(group[n], [e.ux, e.uz, score]);
    }
  }
  const phaseOf = (g: number, ux: number, uz: number): 0 | 1 => {
    const m = mainDir.get(g)!;
    return Math.abs(ux * m[0] + uz * m[1]) >= Math.SQRT1_2 ? 0 : 1;
  };
  const t0Of = (g: number) => Math.round(hash(g) * 200) / 10;

  // ---------- lanes ----------
  const lanes: Lane[] = [];
  const byNode: number[][] = Array.from({ length: nodeCount }, () => []);
  const arriving: number[][] = Array.from({ length: nodeCount }, () => []);
  roads.forEach((r, ri) => {
    if (r.a === r.b || r.pts.length < 2 || lens[ri] < 0.5) return;
    const oneway = !!r.oneway;
    const offs = laneOffsets(r.w, oneway);
    const [s0, s1] = back[ri];
    for (const fwd of oneway ? [true] : [true, false]) {
      const line = fwd ? r.pts : [...r.pts].reverse();
      const from = fwd ? r.a : r.b,
        to = fwd ? r.b : r.a;
      const sa = fwd ? s0 : s1,
        sb = fwd ? s1 : s0;
      offs.forEach((off, k) => {
        const pts = subLine(offsetLine(line, off), sa, lineLength(line) - sb);
        const lane: Lane = { id: lanes.length, road: ri, fwd, from, to, k, n: offs.length, rank: RANK[r.cls], off, pts, len: lineLength(pts), out: [] };
        const g = group[to];
        if (g >= 0 && group[from] !== g) {
          const u = dirAt(line, true);
          lane.signal = { group: g, phase: phaseOf(g, u[0], u[1]), t0: t0Of(g) };
        } else if (g < 0 && ends[to].length >= 3) lane.yieldAt = true;
        lanes.push(lane);
        byNode[from].push(lane.id);
        arriving[to].push(lane.id);
      });
    }
  });

  // ---------- turns at each lane's end ----------
  for (const lane of lanes) {
    const J = lane.to;
    const u = dirAt(lane.pts, true);
    const p0 = lane.pts[lane.pts.length - 1];
    // the other roads leaving the junction, one choice per road and direction
    const outs = new Map<string, Lane[]>();
    for (const id of byNode[J]) {
      const o = lanes[id];
      const key = `${o.road}:${o.fwd}`;
      if (!outs.has(key)) outs.set(key, []);
      outs.get(key)!.push(o);
    }
    const opts: Turn[] = [];
    const uturns: Turn[] = [];
    for (const group of outs.values()) {
      const first = group[0];
      const v = dirAt(first.pts, false);
      const angle = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
      const same = first.road === lane.road;
      // the lane taken: right turns to the kerb lane, left turns to the inside, straight on keeps its lane
      const n = group.length;
      const k = angle > 0.6 ? n - 1 : angle < -0.6 ? 0 : Math.min(lane.k, n - 1);
      const o = group.find((g) => g.k === k) ?? group[0];
      const p3 = o.pts[0];
      const vv = dirAt(o.pts, false);
      const dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
      const uturn = same || Math.abs(angle) > 2.7;
      const d = uturn ? Math.max(3, dist * 0.9) : Math.max(0.3, dist * 0.4);
      const pts = bezier(p0, [p0[0] + u[0] * d, p0[1] + u[1] * d], [p3[0] - vv[0] * d, p3[1] - vv[1] * d], p3, dist < 2 ? 2 : 8);
      const straight = Math.max(0, Math.cos(angle));
      const w = (0.25 + 3 * straight ** 3) * (0.4 + 0.3 * o.rank) * (o.rank < lane.rank ? 0.7 : 1);
      const t: Turn = { lane: o.id, angle, w, pts, len: lineLength(pts) };
      (uturn ? uturns : opts).push(t);
    }
    // U-turns only at a dead end
    lane.out = opts.length ? opts : uturns;
  }

  // ---------- signal heads: on the far-right corner of each approach ----------
  const heads: SignalHead[] = [];
  const surf = data.surfaces ? surfaceTests(data) : null;
  const members = new Map<number, number[]>();
  for (let n = 0; n < nodeCount; n++) if (group[n] >= 0) (members.get(group[n]) ?? members.set(group[n], []).get(group[n])!).push(n);
  for (let n = 0; n < nodeCount; n++) {
    const g = group[n];
    if (g < 0) continue;
    const nodes = members.get(g)!;
    for (const e of ends[n]) {
      const r = roads[e.road];
      const other = e.atA ? r.b : r.a;
      if (group[other] === g) continue; // inside the junction
      if (r.oneway && e.atA) continue; // a one-way road leaving the junction: nobody approaches on it
      // travel direction into the junction, and its right
      const ux = -e.ux,
        uz = -e.uz;
      const rx = -uz,
        rz = ux;
      const [jx, jz] = data.nodes[n];
      // beyond the far side of the whole junction: its extent along the approach plus the crossing roads' half width
      let ext = 0;
      for (const m of nodes) ext = Math.max(ext, (data.nodes[m][0] - jx) * ux + (data.nodes[m][1] - jz) * uz);
      let cross = 0;
      for (const m of nodes) for (const o of ends[m]) if (o !== e && Math.abs(o.ux * uz - o.uz * ux) > 0.5) cross = Math.max(cross, o.w / 2);
      const side = r.oneway ? r.w / 2 : r.w / 2;
      let x = jx + ux * (ext + Math.min(cross, 9) + 1.6) + rx * (side + 1.4);
      let z = jz + uz * (ext + Math.min(cross, 9) + 1.6) + rz * (side + 1.4);
      // on the corner's sidewalk: step further right and on until off the asphalt (wider roads beyond)
      if (surf && (surf.onRoad(x, z) || !surf.onWalk(x, z)))
        search: for (const fa of [0, 1.5, 3, 4.5, -1.5]) {
          for (const fr of [0, 1, 2, 3, 4, 5, 6]) {
            const cx = x + ux * fa + rx * fr,
              cz = z + uz * fa + rz * fr;
            if (!surf.onRoad(cx, cz) && surf.onWalk(cx, cz)) {
              x = cx;
              z = cz;
              break search;
            }
          }
        }
      heads.push({ x, z, yaw: Math.atan2(-ux, -uz), phase: phaseOf(g, -ux, -uz), t0: t0Of(g), group: g });
    }
  }

  return { lanes, byNode, heads, group };
}

/** pick the next lane at the end of `lane` (weighted by the turn weights); r is a random number in [0, 1) */
export function chooseTurn(net: RoadNet, lane: number, r: number): Turn | null {
  const out = net.lanes[lane].out;
  if (!out.length) return null;
  let sum = 0;
  for (const t of out) sum += t.w;
  let x = r * sum;
  for (const t of out) {
    x -= t.w;
    if (x <= 0) return t;
  }
  return out[out.length - 1];
}

/** how many cars a lane should carry, relative to others: busier on the big roads */
export function laneDensity(rank: number) {
  return [0, 0.45, 0.8, 1.5, 2.6, 3.6][rank] ?? 1;
}
