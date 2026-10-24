// Rush Taxi — the real-map city's landmarks: low-poly, flat-coloured models of the famous places, at their real
// positions, sizes and orientation, built from the level primitives (world/level.ts `Prim`, merged into a few meshes
// by world/build.ts) plus hidden collider shapes.
//
// How a model is placed:
// - the mapped footprint (`landmark.poly`, or the mapped building) gives the centre, size and angle; without one a
//   fitted size is used, turned to the nearest road;
// - the rectangle is shrunk until it keeps clear of every road (carriageway + pavement + name board) and the water;
// - the model's front faces the nearest road;
// - the mapped building boxes the model covers are dropped (`drop`), and park trees inside it are removed.
//
// Heights are real metres, apart from the 85 Sky Tower, which is drawn at 0.6 of its real 347 m so the whole tower
// stays inside the camera's view range (fog ends at 860 m).
// Every model is checked at the end: no part within a road's half width (+0.5 m) of its centre line unless it is
// high above the road (gate arches, the station canopy), and nothing on the water except the harbour bridge.
//
// Plain data only (no Three.js, no Rapier), so unit tests can check it.
import type { Prim, Shape, Sign } from '../level';
import type { Spot } from '../../gameplay/rules';
import { KAOHSIUNG, type OsmCityData, type OsmLandmark, type OsmRoad, type Ring, type XZ } from './data';

/** parts whose underside is at least this high (m) may span a road (gate lintels, the station canopy) */
export const HIGH = 5.5;
/** the least gap (m) between any low part and a road's carriageway edge */
export const ROAD_GAP = 0.5;
/** what a building model keeps clear of a carriageway edge: the pavement and the name board on the kerb */
const CLEAR = 4.2;
/** the 85 Sky Tower is drawn at this share of its real height (347 m) */
export const TOWER85_SCALE = 0.6;

const C = {
  white: '#F2F3F0',
  offwhite: '#E6E2D8',
  stone: '#BDB6A8',
  concrete: '#A9ADB0',
  glass: '#5E7D93',
  glassLight: '#7FA3B8',
  glassDark: '#4A6274',
  band: '#B9C3CA',
  steel: '#9AA6B1',
  steelDark: '#56616C',
  red: '#B3302A',
  redDark: '#8E2420',
  tile: '#C0502E',
  gold: '#D8A62B',
  blueTile: '#2F5E9E',
  blueTileDark: '#244A7C',
  greenRoof: '#566A5E',
  brick: '#A5573C',
  roofSheet: '#6D6A65',
  wood: '#9C7653',
  door: '#474C52',
  paint: '#F5F1E6',
  water: '#3D8FB8',
  leaf: '#4E8F3A',
  trunk: '#6D4C41',
  black: '#2B2E33',
};
const WAREHOUSE_WALLS = ['#C9A27A', '#B5653E', '#D9C9A3', '#9AA393', '#C58B5A'];
const AWNINGS = ['#D9534F', '#E8B04A', '#3F7FBF', '#E07B39', '#5E9E4E'];

/** small deterministic hash → [0, 1) */
function hash(...k: number[]) {
  let x = 2166136261;
  for (const v of k) {
    x ^= Math.round(v * 10) + 0x9e3779b9 + (x << 6) + (x >>> 2);
    x = Math.imul(x, 16777619);
  }
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

export function pointInRing(x: number, z: number, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------------------------------------------
// the site: road and water queries
// ---------------------------------------------------------------------------------------------------------------
interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hw: number;
  ri: number;
}
export interface Near {
  road: OsmRoad;
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** distance to the centre line */
  d: number;
}
const CELL = 16;
/** water mask cell (m) */
const MASK = 2;
/** road queries are exact up to this far from a carriageway edge */
const REACH = 12;

export class Site {
  private grid = new Map<number, Seg[]>();
  private segs: Seg[] = [];
  private water: { poly: Ring[]; x0: number; z0: number; x1: number; z1: number }[];
  constructor(readonly data: OsmCityData) {
    data.roads.forEach((r, ri) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const s: Seg = { ax, az, bx, bz, hw: r.w / 2, ri };
        this.segs.push(s);
        const m = s.hw + REACH;
        for (let gx = Math.floor((Math.min(ax, bx) - m) / CELL); gx <= Math.floor((Math.max(ax, bx) + m) / CELL); gx++)
          for (let gz = Math.floor((Math.min(az, bz) - m) / CELL); gz <= Math.floor((Math.max(az, bz) + m) / CELL); gz++) {
            const k = gx * 10007 + gz;
            const list = this.grid.get(k);
            if (list) list.push(s);
            else this.grid.set(k, [s]);
          }
      }
    });
    this.water = data.water.map((poly) => {
      let x0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        z1 = -Infinity;
      for (const [x, z] of poly[0]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      return { poly, x0, z0, x1, z1 };
    });
  }
  /** distance (m) from (x, z) to the nearest carriageway edge; negative on the carriageway; capped at REACH */
  roadGap(x: number, z: number) {
    let best = REACH;
    for (const s of this.grid.get(Math.floor(x / CELL) * 10007 + Math.floor(z / CELL)) ?? []) {
      const vx = s.bx - s.ax,
        vz = s.bz - s.az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / L2));
      const d = Math.hypot(x - s.ax - vx * t, z - s.az - vz * t) - s.hw;
      if (d < best) best = d;
    }
    return best;
  }
  /** water mask on a 2 m grid: 0 land, 1 water, 2 a bank runs through the cell (tested exactly) */
  private mask: Uint8Array | null = null;
  private mcols = 0;
  private buildMask() {
    const [x0, z0, x1, z1] = this.data.bounds;
    const g = MASK;
    const cols = (this.mcols = Math.ceil((x1 - x0) / g) + 1),
      rows = Math.ceil((z1 - z0) / g) + 1;
    const m = new Uint8Array(cols * rows);
    const cross: number[][] = Array.from({ length: rows }, () => []);
    const rings = this.data.water.flatMap((p) => p);
    for (const ring of rings)
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        // scanline crossings at the row centres
        const j0 = Math.max(0, Math.ceil((Math.min(az, bz) - z0) / g - 0.5)),
          j1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) - z0) / g - 0.5));
        for (let j = j0; j <= j1; j++) {
          const zc = z0 + (j + 0.5) * g;
          if (az > zc === bz > zc) continue;
          cross[j].push(ax + ((zc - az) / (bz - az)) * (bx - ax));
        }
        // the cells the bank passes through
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.ceil(L / (g / 2)) + 1;
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n,
            z = az + ((bz - az) * k) / n;
          const ci = Math.floor((x - x0) / g),
            cj = Math.floor((z - z0) / g);
          if (ci >= 0 && cj >= 0 && ci < cols && cj < rows) m[cj * cols + ci] = 2;
        }
      }
    for (let j = 0; j < rows; j++) {
      const xs = cross[j].sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.floor((xs[k] - x0) / g)),
          i1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / g));
        for (let i = i0; i <= i1; i++) if (m[j * cols + i] !== 2) m[j * cols + i] = 1;
      }
    }
    // cells cut by a bank, and their neighbours across the half-cell rounding, are tested exactly
    this.mask = m;
  }
  inWater(x: number, z: number) {
    if (!this.mask) this.buildMask();
    const [x0, z0] = this.data.bounds;
    const ci = Math.floor((x - x0) / MASK),
      cj = Math.floor((z - z0) / MASK);
    const v = this.mask![cj * this.mcols + ci];
    if (v === 0 || v === 1) return v === 1;
    return this.inWaterExact(x, z);
  }
  inWaterExact(x: number, z: number) {
    for (const w of this.water) {
      if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1) continue;
      if (pointInRing(x, z, w.poly[0]) && !w.poly.slice(1).some((h) => pointInRing(x, z, h))) return true;
    }
    return false;
  }
  onLand(x: number, z: number) {
    const [x0, z0, x1, z1] = this.data.bounds;
    return x > x0 + 2 && x < x1 - 2 && z > z0 + 2 && z < z1 - 2 && !this.inWater(x, z);
  }
  /** the nearest point on any road centre line that passes `ok` */
  nearest(x: number, z: number, ok: (r: OsmRoad) => boolean = () => true): Near | null {
    // segments within REACH of the point are all in its grid cell: try those first
    const near = this.scan(this.grid.get(Math.floor(x / CELL) * 10007 + Math.floor(z / CELL)) ?? [], x, z, ok);
    return near && near.d <= REACH ? near : this.scan(this.segs, x, z, ok);
  }
  private scan(segs: Seg[], x: number, z: number, ok: (r: OsmRoad) => boolean) {
    let best: Near | null = null;
    for (const s of segs) {
      const road = this.data.roads[s.ri];
      if (!ok(road)) continue;
      const vx = s.bx - s.ax,
        vz = s.bz - s.az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / L2));
      const px = s.ax + vx * t,
        pz = s.az + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) {
        const L = Math.sqrt(L2);
        best = { road, x: px, z: pz, dx: vx / L, dz: vz / L, d };
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// footprints: what a primitive covers on the ground, for the checks
// ---------------------------------------------------------------------------------------------------------------
/** an oriented rectangle on the ground (half sizes along `ang` and across it) and the height range */
export interface Foot {
  x: number;
  z: number;
  hx: number;
  hz: number;
  ang: number;
  y0: number;
  y1: number;
  /** an ellipse inside the rectangle (round parts) */
  round?: boolean;
}
export function primFoot(p: Prim): Foot {
  switch (p.t) {
    case 'box':
      return { x: p.x, z: p.z, hx: p.sx / 2, hz: p.sz / 2, ang: -(p.yaw ?? 0), y0: p.y - p.sy / 2, y1: p.y + p.sy / 2 };
    case 'cyl': {
      const r = Math.max(p.r, p.rt ?? p.r);
      return { x: p.x, z: p.z, hx: r * (p.sx ?? 1), hz: r, ang: -(p.yaw ?? 0), y0: p.y - p.h / 2, y1: p.y + p.h / 2, round: p.seg !== 4 };
    }
    case 'cone':
      return { x: p.x, z: p.z, hx: p.r * (p.sx ?? 1), hz: p.r, ang: -(p.yaw ?? 0), y0: p.y - Math.abs(p.h) / 2, y1: p.y + Math.abs(p.h) / 2, round: p.seg !== 4 };
    case 'sph':
      return { x: p.x, z: p.z, hx: p.r, hz: p.r, ang: 0, y0: p.y - p.r, y1: p.y + p.r, round: true };
    case 'gab':
      return { x: p.x, z: p.z, hx: p.L / 2, hz: p.W / 2, ang: -(p.yaw ?? 0), y0: p.y - p.H / 2, y1: p.y + p.H / 2 };
    case 'tor':
      return { x: p.x, z: p.z, hx: p.R + p.tube, hz: p.tube, ang: -p.yaw, y0: p.y - p.R - p.tube, y1: p.y + p.R + p.tube };
  }
}
export function shapeFoot(s: Shape): Foot | null {
  if (s.kind === 'box') return { x: s.p[0], z: s.p[2], hx: s.size[0] / 2, hz: s.size[2] / 2, ang: -(s.yaw ?? 0), y0: s.p[1] - s.size[1] / 2, y1: s.p[1] + s.size[1] / 2 };
  if (s.kind === 'cyl') return { x: s.p[0], z: s.p[2], hx: s.r, hz: s.r, ang: 0, y0: s.p[1] - s.h / 2, y1: s.p[1] + s.h / 2, round: true };
  return null;
}
/** points on and inside the footprint, at most `step` metres apart */
export function footSamples(f: Foot, step = 2): XZ[] {
  const out: XZ[] = [];
  const c = Math.cos(f.ang),
    s = Math.sin(f.ang);
  const nu = Math.max(1, Math.ceil((2 * f.hx) / step)),
    nv = Math.max(1, Math.ceil((2 * f.hz) / step));
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      let u = -f.hx + (2 * f.hx * i) / nu,
        v = -f.hz + (2 * f.hz * j) / nv;
      if (f.round) {
        const e = Math.hypot(u / (f.hx || 1), v / (f.hz || 1));
        if (e > 1) {
          u /= e;
          v /= e;
        }
      }
      out.push([f.x + u * c - v * s, f.z + u * s + v * c]);
    }
  return out;
}
export function inFoot(f: Foot, x: number, z: number, m = 0) {
  const c = Math.cos(f.ang),
    s = Math.sin(f.ang);
  const dx = x - f.x,
    dz = z - f.z;
  const u = Math.abs(dx * c + dz * s),
    v = Math.abs(-dx * s + dz * c);
  if (f.round) return Math.hypot(u / (f.hx + m), v / (f.hz + m)) <= 1;
  return u <= f.hx + m && v <= f.hz + m;
}
/** what is wrong with a part, if anything: it blocks a road, or stands on the water */
export function footProblem(f: Foot, site: Site, overWater = false): 'road' | 'water' | null {
  const pts = footSamples(f, 1.5);
  if (f.y0 < HIGH && pts.some(([x, z]) => site.roadGap(x, z) < ROAD_GAP)) return 'road';
  if (!overWater && pts.some(([x, z]) => !site.onLand(x, z))) return 'water';
  return null;
}

/** the triangles a primitive costs when drawn (build.ts geometry) */
export function primTriangles(p: Prim) {
  if (p.t === 'box') return 12;
  if (p.t === 'gab') return 6;
  if (p.t === 'cyl') return 4 * (p.seg ?? 18);
  if (p.t === 'cone') return 2 * (p.seg ?? 18);
  if (p.t === 'sph') {
    const w = p.seg ?? 16,
      h = p.seg ? Math.max(4, Math.round(p.seg * 0.75)) : 12;
    return 2 * w * (h - 1);
  }
  return 8 * 40 * 2;
}

// ---------------------------------------------------------------------------------------------------------------
// rectangles: fitting a model to the ground
// ---------------------------------------------------------------------------------------------------------------
export interface Rect {
  cx: number;
  cz: number;
  /** length along `ang` (the local u axis) and width across it (local v) */
  L: number;
  W: number;
  ang: number;
  /** only fits with a narrow margin to the road: no porch or canopy sticking out at the front */
  tight?: boolean;
}
/** the smallest rectangle round a ring, its long side first */
export function rectOfRing(ring: Ring): Rect {
  let best: Rect | null = null;
  let bestA = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    if (Math.hypot(bx - ax, bz - az) < 0.5) continue;
    const ang = Math.atan2(bz - az, bx - ax);
    const c = Math.cos(ang),
      s = Math.sin(ang);
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    for (const [x, z] of ring) {
      const u = x * c + z * s,
        v = -x * s + z * c;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const A = (u1 - u0) * (v1 - v0);
    if (A < bestA) {
      bestA = A;
      const um = (u0 + u1) / 2,
        vm = (v0 + v1) / 2;
      best = { cx: um * c - vm * s, cz: um * s + vm * c, L: u1 - u0, W: v1 - v0, ang };
    }
  }
  if (!best) {
    const [x, z] = ring[0];
    return { cx: x, cz: z, L: 4, W: 4, ang: 0 };
  }
  return best.L >= best.W ? best : { ...best, L: best.W, W: best.L, ang: best.ang + Math.PI / 2 };
}
export function rectRing(r: Rect, m = 0): Ring {
  const c = Math.cos(r.ang),
    s = Math.sin(r.ang);
  return ([
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const).map(([a, b]) => {
    const u = a * (r.L / 2 + m),
      v = b * (r.W / 2 + m);
    return [r.cx + u * c - v * s, r.cz + u * s + v * c] as XZ;
  });
}
/** shrinks a rectangle (from the side that is in the way) until it keeps `clear` metres off every road and is all land */
export function fitRect(site: Site, r: Rect, clear: number, minL = 4, minW = 4, avoid: Ring[] = []): Rect | null {
  let { cx, cz, L, W } = r;
  const c = Math.cos(r.ang),
    s = Math.sin(r.ang);
  for (let it = 0; it < 400; it++) {
    let worst = 0,
      wu = 0,
      wv = 0;
    const step = Math.max(2, Math.min(L, W) / 12);
    const nu = Math.ceil(L / step),
      nv = Math.ceil(W / step);
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const u = -L / 2 + (L * i) / nu,
          v = -W / 2 + (W * j) / nv;
        const x = cx + u * c - v * s,
          z = cz + u * s + v * c;
        const bad = site.onLand(x, z) && !avoid.some((t) => pointInRing(x, z, t)) ? clear - site.roadGap(x, z) : clear + 5;
        if (bad > worst) {
          worst = bad;
          wu = u;
          wv = v;
        }
      }
    if (worst <= 0) return { cx, cz, L, W, ang: r.ang };
    const d = Math.min(3, Math.max(0.5, worst / 2));
    // cut the side that helps most: try moving the worst point in along u and along v
    const badAt = (u: number, v: number) => {
      const x = cx + u * c - v * s,
        z = cz + u * s + v * c;
      return site.onLand(x, z) && !avoid.some((t) => pointInRing(x, z, t)) ? clear - site.roadGap(x, z) : clear + 5;
    };
    const gu = (worst - badAt(wu - Math.sign(wu) * d, wv)) / (d / L),
      gv = (worst - badAt(wu, wv - Math.sign(wv) * d)) / (d / W);
    const cutU = gu === gv ? Math.abs(wu) / L >= Math.abs(wv) / W : gu > gv;
    if (cutU) {
      L -= d;
      const sh = (wu > 0 ? -d : d) / 2;
      cx += sh * c;
      cz += sh * s;
    } else {
      W -= d;
      const sh = (wv > 0 ? -d : d) / 2;
      cx -= sh * s;
      cz += sh * c;
    }
    if (L < minL || W < minW) return null;
  }
  return null;
}
/** the nearest clear spot to (x, z) for a disc of radius `r`: all land, `clear` off the roads, outside `avoid` */
export function findSpot(site: Site, x: number, z: number, r: number, clear: number, avoid: Ring[] = [], maxD = 90): XZ | null {
  const ok = (px: number, pz: number) => {
    for (let a = 0; a < 12; a++) {
      for (const k of [0, 0.5, 1]) {
        const qx = px + Math.cos((a * Math.PI) / 6) * r * k,
          qz = pz + Math.sin((a * Math.PI) / 6) * r * k;
        if (!site.onLand(qx, qz) || site.roadGap(qx, qz) < clear || avoid.some((ring) => pointInRing(qx, qz, ring))) return false;
      }
    }
    return true;
  };
  for (let d = 0; d <= maxD; d += 3) {
    const n = Math.max(1, Math.round((2 * Math.PI * d) / 4));
    for (let i = 0; i < n; i++) {
      const px = x + Math.cos((i / n) * 2 * Math.PI) * d,
        pz = z + Math.sin((i / n) * 2 * Math.PI) * d;
      if (ok(px, pz)) return [px, pz];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// the kit: primitives in a model's own frame (u along the length, v across it; +v is the front)
// ---------------------------------------------------------------------------------------------------------------
type Opt = { solid?: boolean; a?: number };
export class Kit {
  prims: Prim[] = [];
  shapes: Shape[] = [];
  private n = 0;
  private c: number;
  private s: number;
  constructor(
    readonly id: string,
    readonly cx: number,
    readonly cz: number,
    readonly ang: number,
  ) {
    this.c = Math.cos(ang);
    this.s = Math.sin(ang);
  }
  at(u: number, v: number): XZ {
    return [this.cx + u * this.c - v * this.s, this.cz + u * this.s + v * this.c];
  }
  /** Prim/Shape yaw for a local angle a (0 = along u) */
  yaw(a = 0) {
    return -(this.ang + a);
  }
  private sid() {
    return `${this.id}-${this.n++}`;
  }
  box(u: number, v: number, y0: number, L: number, W: number, H: number, color: string, o: Opt = {}) {
    const [x, z] = this.at(u, v);
    const yaw = this.yaw(o.a);
    this.prims.push({ t: 'box', x, y: y0 + H / 2, z, sx: L, sy: H, sz: W, color, yaw });
    if (o.solid) this.shapes.push({ kind: 'box', id: this.sid(), p: [x, y0 + H / 2, z], size: [L, H, W], yaw, color, hidden: true });
  }
  cyl(u: number, v: number, y0: number, r: number, H: number, color: string, o: Opt & { seg?: number; rt?: number; sx?: number } = {}) {
    const [x, z] = this.at(u, v);
    this.prims.push({ t: 'cyl', x, y: y0 + H / 2, z, r, h: H, color, yaw: this.yaw(o.a), seg: o.seg, rt: o.rt, sx: o.sx });
    if (o.solid) this.shapes.push({ kind: 'cyl', id: this.sid(), p: [x, y0 + H / 2, z], r: Math.max(r, o.rt ?? r) * (o.seg === 4 ? 1.2 : 1), h: H, color, hidden: true });
  }
  /** a cone standing on y0 (or hanging from y0 + H with the tip down) */
  cone(u: number, v: number, y0: number, r: number, H: number, color: string, o: { seg?: number; sx?: number; a?: number; down?: boolean } = {}) {
    const [x, z] = this.at(u, v);
    this.prims.push({ t: 'cone', x, y: y0 + H / 2, z, r, h: o.down ? -H : H, color, yaw: this.yaw(o.a), seg: o.seg, sx: o.sx });
  }
  sph(u: number, v: number, y: number, r: number, color: string, seg?: number) {
    const [x, z] = this.at(u, v);
    this.prims.push({ t: 'sph', x, y, z, r, color, seg });
  }
  /** a pitched roof with its eaves at y0 and the ridge along u */
  roof(u: number, v: number, y0: number, L: number, W: number, H: number, color: string, hip = 0, a = 0) {
    const [x, z] = this.at(u, v);
    this.prims.push({ t: 'gab', x, y: y0 + H / 2, z, L, W, H, color, yaw: this.yaw(a), hip });
  }
  /** an upright ring whose plane holds the local direction a */
  ring(u: number, v: number, y: number, R: number, tube: number, color: string, a = 0) {
    const [x, z] = this.at(u, v);
    this.prims.push({ t: 'tor', x, y, z, R, tube, color, yaw: this.yaw(a) });
  }
  /** a hidden collider box only */
  wall(u: number, v: number, y0: number, L: number, W: number, H: number) {
    const [x, z] = this.at(u, v);
    this.shapes.push({ kind: 'box', id: this.sid(), p: [x, y0 + H / 2, z], size: [L, H, W], yaw: this.yaw(), color: '#000000', hidden: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// painted characters (Pier-2's warehouse numbers): seven-segment glyphs of thin boxes on a wall
// ---------------------------------------------------------------------------------------------------------------
const GLYPH: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  C: 'adef', P: 'abefg', E: 'adefg', A: 'abcefg',
};
/** paints `text` on the wall at v = side·wv (facing ±v), centred at u0, the glyph bottoms at y0, glyphs h tall */
function paint(k: Kit, text: string, u0: number, wv: number, side: 1 | -1, y0: number, h: number, color = C.paint) {
  const w = h * 0.55,
    t = h * 0.13,
    pitch = w + h * 0.3;
  const v = side * (wv + 0.05);
  [...text].forEach((ch, i) => {
    const cu = (i - (text.length - 1) / 2) * pitch;
    // a reader facing the wall reads along +u when the wall faces +v, along −u when it faces −v
    const U = (du: number) => u0 + side * (cu + du);
    for (const seg of GLYPH[ch] ?? '') {
      if (seg === 'a') k.box(U(0), v, y0 + h - t, w, 0.08, t, color);
      if (seg === 'g') k.box(U(0), v, y0 + h / 2 - t / 2, w, 0.08, t, color);
      if (seg === 'd') k.box(U(0), v, y0, w, 0.08, t, color);
      if (seg === 'b') k.box(U(w / 2 - t / 2), v, y0 + h / 2, t, 0.08, h / 2, color);
      if (seg === 'c') k.box(U(w / 2 - t / 2), v, y0, t, 0.08, h / 2, color);
      if (seg === 'f') k.box(U(-w / 2 + t / 2), v, y0 + h / 2, t, 0.08, h / 2, color);
      if (seg === 'e') k.box(U(-w / 2 + t / 2), v, y0, t, 0.08, h / 2, color);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// the models
// ---------------------------------------------------------------------------------------------------------------
export interface Model {
  id: string;
  prims: Prim[];
  shapes: Shape[];
  /** ground the model takes: mapped buildings and park trees inside are removed */
  covers: Ring[];
  /** mapped buildings replaced by this model (by index) */
  replaces: number[];
  /** may stand over the water (the harbour bridge) */
  overWater?: boolean;
  signs: Sign[];
}
interface Ctx {
  data: OsmCityData;
  site: Site;
  /** ground already taken by the models built so far */
  taken: Ring[];
  /** kerb spots where people wait: kept free */
  spots: { x: number; z: number }[];
}
type Builder = (ctx: Ctx, lm: OsmLandmark, m: Model) => Kit[] | null;

/** turns a rectangle so that its local +v (the front) points at the nearest road; keeps L along u */
function faceRoad(site: Site, r: Rect, keepLong = false): Rect {
  const hit = site.nearest(r.cx, r.cz);
  if (!hit) return r;
  const fx = hit.x - r.cx,
    fz = hit.z - r.cz;
  let best = r,
    bestDot = -Infinity;
  for (let q = 0; q < 4; q++) {
    if (keepLong && q % 2) continue;
    const ang = r.ang + (q * Math.PI) / 2;
    const dot = -Math.sin(ang) * fx + Math.cos(ang) * fz;
    if (dot > bestDot) {
      bestDot = dot;
      best = q % 2 ? { ...r, ang, L: r.W, W: r.L } : { ...r, ang };
    }
  }
  return best;
}
/** the model's rectangle: the mapped footprint, or `def` (L × W) turned to the nearest road and set back from it */
function place(ctx: Ctx, lm: OsmLandmark, def: { L: number; W: number }, o: { cap?: { L: number; W: number }; keepLong?: boolean; clear?: number; ring?: Ring | null } = {}): Rect | null {
  const { site } = ctx;
  const clear = o.clear ?? CLEAR;
  const ring = o.ring !== undefined ? o.ring : lm.poly;
  let r: Rect;
  if (ring && ring.length >= 3) {
    r = rectOfRing(ring);
    if (o.cap) r = { ...r, L: Math.min(r.L, o.cap.L), W: Math.min(r.W, o.cap.W) };
  } else {
    let x = lm.x,
      z = lm.z;
    if (!site.onLand(x, z) || site.roadGap(x, z) < clear + 2 || ctx.taken.some((t) => pointInRing(x, z, t))) {
      const sp = findSpot(site, x, z, Math.min(def.L, def.W) / 2, clear, ctx.taken);
      if (!sp) return null;
      [x, z] = sp;
    }
    const hit = site.nearest(x, z);
    const ang = hit ? Math.atan2(hit.dz, hit.dx) : 0;
    r = { cx: x, cz: z, L: def.L, W: def.W, ang };
    // set back from the road so the whole width fits
    if (hit) {
      const want = hit.road.w / 2 + clear + def.W / 2;
      if (hit.d < want && hit.d > 0.1) {
        const k = want - hit.d;
        r.cx += ((x - hit.x) / hit.d) * k;
        r.cz += ((z - hit.z) / hit.d) * k;
      }
    }
  }
  // small buildings squeezed between streets get a narrower margin before giving up
  const wide = fitRect(site, r, clear, Math.min(r.L, 6), Math.min(r.W, 5), ctx.taken);
  const fit = wide ?? fitRect(site, r, Math.min(clear, 2), Math.min(r.L, 5), Math.min(r.W, 4), ctx.taken);
  return fit ? { ...faceRoad(site, fit, o.keepLong), tight: !wide } : null;
}

// ---------- 85 Sky Tower: a wide podium, two legs that rise as separate towers and join, one tower and the spire ----------
const tower85: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 80, W: 55 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const s = TOWER85_SCALE;
  const L = r.L,
    W = r.W;
  // podium (the department store floors)
  k.box(0, 0, 0, L, W, 15, C.steel, { solid: true });
  k.box(0, 0, 15, L - 2, W - 2, 1, C.band);
  // the two legs, with the hollow between them
  const legL = L * 0.33,
    legW = W * 0.62,
    legU = L / 2 - legL / 2 - L * 0.04;
  const top = 150 * s; // the legs meet at about the 35th floor
  for (const sg of [-1, 1]) {
    k.box(sg * legU, 0, 16, legL, legW, top - 16, C.glass, { solid: true });
    for (let y = 16 + 12; y < top - 4; y += 12) k.box(sg * legU, 0, y, legL + 0.6, legW + 0.6, 0.9, C.band);
  }
  // the join: the floors that bridge the legs
  const joinL = 2 * legU + legL;
  k.box(0, 0, top, joinL, legW, 12, C.glass, { solid: true });
  k.box(0, 0, top - 1, joinL + 0.8, legW + 0.8, 1.2, C.band);
  k.box(0, 0, top + 12, joinL + 0.8, legW + 0.8, 1.2, C.band);
  // the single tower with its set-backs
  const t1 = top + 13,
    t2 = 265 * s,
    t3 = 300 * s,
    t4 = 322 * s;
  k.box(0, 0, t1, L * 0.42, legW * 0.86, t2 - t1, C.glass, { solid: true });
  for (let y = t1 + 12; y < t2 - 4; y += 12) k.box(0, 0, y, L * 0.42 + 0.6, legW * 0.86 + 0.6, 0.9, C.band);
  k.box(0, 0, t2, L * 0.31, legW * 0.7, t3 - t2, C.glass);
  k.box(0, 0, t2 - 0.6, L * 0.31 + 1, legW * 0.7 + 1, 1.2, C.band);
  k.box(0, 0, t3, L * 0.2, legW * 0.48, t4 - t3, C.glassLight);
  k.box(0, 0, t3 - 0.6, L * 0.2 + 1, legW * 0.48 + 1, 1.2, C.band);
  // crown and spire up to 347 m × s
  k.cyl(0, 0, t4, Math.min(L * 0.07, 4), 6, C.band, { seg: 8 });
  k.cyl(0, 0, t4 + 6, 0.9, 347 * s - t4 - 9, C.white, { seg: 6, rt: 0.35 });
  k.cone(0, 0, 347 * s - 3, 0.4, 3, C.white, { seg: 6 });
  m.covers.push(rectRing(r));
  return [k];
};

// ---------- Kaohsiung Music Center: the high-low towers on the main hall, and the white hexagon "coral" clusters ----------
const musiccenter: Builder = (ctx, lm, m) => {
  const kits: Kit[] = [];
  const r = place(ctx, lm, { L: 100, W: 54 });
  if (r) {
    const k = new Kit(m.id, r.cx, r.cz, r.ang);
    const L = r.L,
      W = r.W;
    k.box(0, 0, 0, L * 0.92, W * 0.8, 9, C.white, { solid: true });
    k.box(0, W * 0.4 + 0.05, 3, L * 0.86, 0.1, 3.2, C.glassLight);
    k.box(0, -W * 0.4 - 0.05, 3, L * 0.86, 0.1, 3.2, C.glassLight);
    // the high tower and the low tower, each with a wider top floor cantilevered out
    const towers = [
      { u: -L * 0.22, l: L * 0.24, w: W * 0.52, h: 56 },
      { u: L * 0.24, l: L * 0.22, w: W * 0.48, h: 32 },
    ];
    for (const t of towers) {
      k.box(t.u, 0, 9, t.l, t.w, t.h - 9 - 7, C.white, { solid: true });
      for (let y = 15; y < t.h - 9; y += 6.5) k.box(t.u, 0, y, t.l + 0.3, t.w + 0.3, 1.6, C.glassLight);
      k.box(t.u + t.l * 0.08, 0, t.h - 7, t.l * 1.3, t.w * 1.15, 7, C.white, { solid: true });
      k.box(t.u + t.l * 0.08, 0, t.h - 5, t.l * 1.3 + 0.2, t.w * 1.15 + 0.2, 2, C.glass);
    }
    // hexagon skylights on the hall roof
    for (let i = 0; i < 4; i++) k.cyl(-L * 0.02 + (i - 1.5) * 6.5, (i % 2 ? 1 : -1) * W * 0.18, 9, 2.8, 2.2, C.glassLight, { seg: 6 });
    m.covers.push(rectRing(r));
    kits.push(k);
  }
  // the coral clusters, on the mapped building across the river mouth (Glory Pier)
  const bi = ctx.data.buildings.findIndex((b) => (b.name ?? '').includes('礁群'));
  if (bi >= 0) {
    const b = ctx.data.buildings[bi];
    const k = new Kit(m.id + '-coral', b.obb[0], b.obb[1], b.obb[4]);
    const R = 6.2;
    const dx = R * Math.sqrt(3),
      dz = R * 1.5;
    const [cx, cz, L, W] = b.obb;
    for (let j = -Math.ceil(W / dz); j <= Math.ceil(W / dz); j++)
      for (let i = -Math.ceil(L / dx); i <= Math.ceil(L / dx); i++) {
        const u = i * dx + (j % 2 ? dx / 2 : 0),
          v = j * dz;
        const [x, z] = k.at(u, v);
        if (!pointInRing(x, z, b.poly) || ctx.site.roadGap(x, z) < R + 1 || !ctx.site.onLand(x, z)) continue;
        const h = 6 + Math.floor(hash(x, z) * 4) * 2.5;
        k.cyl(u, v, 0, R - 0.5, h, C.white, { seg: 6, solid: true, a: Math.PI / 6 });
        k.cyl(u, v, h, R - 1.8, 0.5, C.glassLight, { seg: 6, a: Math.PI / 6 });
      }
    void cx;
    void cz;
    m.replaces.push(bi);
    m.covers.push(b.poly);
    kits.push(k);
  }
  return kits.length ? kits : null;
};

// ---------- Pier-2: the old harbour warehouses with their numbers painted on ----------
const pier2: Builder = (ctx, lm, m) => {
  const list = ctx.data.buildings
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => (b.kind === 'warehouse' || /倉|庫/.test(b.name ?? '')) && Math.hypot(b.obb[0] - lm.x, b.obb[1] - lm.z) < 200 && b.obb[2] >= 10 && b.obb[3] >= 6)
    .sort((p, q) => p.b.obb[0] - q.b.obb[0]);
  if (!list.length) return null;
  const kits: Kit[] = [];
  let n = 1;
  for (const { b, i } of list) {
    const [cx0, cz0, L0, W0, ang0] = b.obb;
    let r: Rect = { cx: cx0, cz: cz0, L: L0 >= W0 ? L0 : W0, W: L0 >= W0 ? W0 : L0, ang: L0 >= W0 ? ang0 : ang0 + Math.PI / 2 };
    // a kerb where people wait sometimes falls inside a mapped footprint: trim that side back
    for (const sp of ctx.spots) {
      const c = Math.cos(r.ang),
        sn = Math.sin(r.ang);
      const du = (sp.x - r.cx) * c + (sp.z - r.cz) * sn,
        dv = -(sp.x - r.cx) * sn + (sp.z - r.cz) * c;
      if (Math.abs(du) > r.L / 2 + 1 || Math.abs(dv) > r.W / 2 + 1) continue;
      const cutU = r.L / 2 + 1 - Math.abs(du),
        cutV = r.W / 2 + 1 - Math.abs(dv);
      if (cutV <= cutU) {
        const sh = (Math.sign(dv) || 1) * -cutV / 2;
        r = { ...r, W: r.W - cutV, cx: r.cx - sh * sn, cz: r.cz + sh * c };
      } else {
        const sh = (Math.sign(du) || 1) * -cutU / 2;
        r = { ...r, L: r.L - cutU, cx: r.cx + sh * c, cz: r.cz + sh * sn };
      }
    }
    if (r.L < 6 || r.W < 4) continue;
    const { cx, cz, L, W } = r;
    const k = new Kit(`${m.id}-${i}`, cx, cz, r.ang);
    const wall = WAREHOUSE_WALLS[Math.floor(hash(cx, cz) * WAREHOUSE_WALLS.length)];
    const H = 7 + Math.round(hash(cz, cx) * 2);
    k.box(0, 0, 0, L, W, H, wall, { solid: true });
    k.roof(0, 0, H, L + 0.8, W + 1.0, Math.min(3.2, W * 0.28), C.roofSheet);
    // the street side: roll-up doors and the painted number
    const hit = ctx.site.nearest(cx, cz);
    const fv = hit ? -Math.sin(k.ang) * (hit.x - cx) + Math.cos(k.ang) * (hit.z - cz) : 1;
    const side: 1 | -1 = fv >= 0 ? 1 : -1;
    const du = L > 22 ? L / 3 : L / 4;
    for (const s of [-1, 1]) k.box(s * du, side * (W / 2 + 0.06), 0, Math.min(4, L / 5), 0.12, 4.2, C.door);
    const named = /C(\d+)/.exec(b.name ?? '');
    const label = named ? `C${named[1]}` : `C${n++}`;
    const gh = Math.min(3.4, H - 3);
    paint(k, label, 0, W / 2, side, H - gh - 0.8, gh);
    m.replaces.push(i);
    m.covers.push(b.poly);
    kits.push(k);
  }
  return kits;
};

// ---------- the Imperial Crown style (帝冠式): a western body under a tall Japanese tiled roof ----------
function imperial(k: Kit, L: number, W: number, o: { tower?: boolean; wall?: string; roof?: string } = {}) {
  const wall = o.wall ?? C.offwhite,
    roof = o.roof ?? C.greenRoof;
  const cL = Math.min(16, L * 0.42),
    wL = (L - cL) / 2;
  k.box(0, 0, 0, L + 1, W + 1, 0.8, C.stone);
  // the central hall and its big hipped-gable roof
  k.box(0, 0, 0.8, cL, W, 8.5, wall, { solid: true });
  k.roof(0, 0, 9.3, cL + 2, W + 2, 6.5, roof, (W + 2) * 0.3);
  k.box(0, 0, 15.6, cL * 0.5, 0.6, 0.5, C.black);
  // the wings with lower roofs
  for (const s of [-1, 1]) {
    k.box(s * (cL / 2 + wL / 2), 0, 0.8, wL, W * 0.8, 6, wall, { solid: true });
    k.roof(s * (cL / 2 + wL / 2), 0, 6.8, wL + 1.2, W * 0.8 + 1.6, 3, roof, 1.5);
    for (let i = 0; i < Math.floor(wL / 3.2); i++) k.box(s * (cL / 2 + 1.8 + i * 3.2), W * 0.4 + 0.05, 2.4, 1.4, 0.1, 2.4, C.glassDark);
  }
  // the porch at the front
  k.box(0, W / 2 + 1.6, 0.8, cL * 0.5, 3.2, 4.6, wall);
  k.roof(0, W / 2 + 1.6, 5.4, cL * 0.5 + 1.2, 4, 2, roof, 0);
  if (o.tower) {
    k.box(0, 0, 15.6, 7, 7, 8, wall, { solid: true });
    k.roof(0, 0, 23.6, 8.6, 8.6, 5, roof, 4.3);
  }
}
const oldstation: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 34, W: 13 }, { ring: null });
  const p = lm.poly ? rectOfRing(lm.poly) : null;
  // keep the mapped centre and angle, use the full building width
  const base: Rect | null = p ? fitRect(ctx.site, { ...p, L: 34, W: 13 }, CLEAR, 14, 10) : r;
  if (!base) return null;
  const f = faceRoad(ctx.site, base, true);
  const k = new Kit(m.id, f.cx, f.cz, f.ang);
  imperial(k, f.L, f.W);
  m.covers.push(rectRing(f));
  return [k];
};
const historymuseum: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 44, W: 16 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  imperial(k, Math.min(r.L, 46), Math.min(r.W, 16), { tower: true, wall: '#D9CCB0', roof: '#5A5248' });
  m.covers.push(rectRing(r));
  return [k];
};

// ---------- Kaohsiung Station: the new station's big canopy roof with its funnel columns ----------
const mainstation: Builder = (ctx, lm, m) => {
  const bi = ctx.data.buildings.findIndex((b) => b.kind === 'train_station' && Math.hypot(b.obb[0] - lm.x, b.obb[1] - lm.z) < 60);
  const b = bi >= 0 ? ctx.data.buildings[bi] : null;
  const R0: Rect = b ? { cx: b.obb[0], cz: b.obb[1], L: b.obb[2], W: b.obb[3], ang: b.obb[4] } : { cx: lm.x, cz: lm.z, L: 120, W: 80, ang: 0 };
  // the old station stands in the canopy's opening: keep the canopy to the north of it
  const old = ctx.data.landmarks.find((l) => l.id === 'oldstation');
  const k0 = new Kit(m.id, R0.cx, R0.cz, R0.ang);
  const loc = (x: number, z: number) => {
    const dx = x - R0.cx,
      dz = z - R0.cz;
    return [dx * Math.cos(R0.ang) + dz * Math.sin(R0.ang), -dx * Math.sin(R0.ang) + dz * Math.cos(R0.ang)];
  };
  let u0 = -R0.L / 2 + 8,
    u1 = R0.L / 2 - 8;
  if (old) {
    const [ou] = loc(old.x, old.z);
    if (ou > 0) u1 = Math.min(u1, ou - 26);
    else u0 = Math.max(u0, ou + 26);
  }
  const cu = (u0 + u1) / 2,
    CL = u1 - u0,
    CW = R0.W - 8;
  const [ccx, ccz] = k0.at(cu, 0);
  const k = new Kit(m.id, ccx, ccz, R0.ang);
  const y = 15;
  k.box(0, 0, y, CL, CW, 1.6, C.white);
  k.box(0, 0, y - 0.6, CL + 0.4, CW + 0.4, 0.8, C.band);
  // roof gardens in strips between the skylights
  for (const gu of [-0.3, 0.05, 0.38]) k.box(gu * CL, 0, y + 1.6, CL * 0.16, CW * 0.7, 0.4, '#8DB46A');
  // funnel columns where the canopy dips down, only where they stand clear of the streets
  for (const fu of [-0.42, -0.14, 0.14, 0.42])
    for (const fv of [-0.3, 0, 0.3]) {
      const u = fu * CL,
        v = fv * CW;
      const [x, z] = k.at(u, v);
      if (ctx.site.roadGap(x, z) < 3 || !ctx.site.onLand(x, z)) continue;
      k.cone(u, v, 8, 6.5, y - 8, C.white, { down: true, seg: 12 });
      k.cyl(u, v, 0, 0.9, 8.5, C.white, { seg: 8, solid: true });
      k.sph(u, v, y + 1.6, 3.4, C.glassLight, 8);
    }
  // the station hall under the canopy
  const hall: Rect | null = fitRect(ctx.site, { cx: ccx, cz: ccz, L: Math.min(46, CL * 0.4), W: Math.min(24, CW * 0.4), ang: R0.ang }, 2, 12, 8);
  if (hall) {
    const [hu, hv] = loc(hall.cx, hall.cz);
    const hk = new Kit(m.id + '-hall', hall.cx, hall.cz, hall.ang);
    hk.box(0, 0, 0, hall.L, hall.W, 7, C.glassLight, { solid: true });
    hk.box(0, 0, 7, hall.L + 0.6, hall.W + 0.6, 0.8, C.white);
    void hu;
    void hv;
    m.covers.push(rectRing(hall));
    m.covers.push(rectRing({ cx: ccx, cz: ccz, L: CL, W: CW, ang: R0.ang }));
    if (bi >= 0) m.replaces.push(bi);
    return [k, hk];
  }
  m.covers.push(rectRing({ cx: ccx, cz: ccz, L: CL, W: CW, ang: R0.ang }));
  if (bi >= 0) m.replaces.push(bi);
  return [k];
};

// ---------- the Dome of Light at Formosa Boulevard: a round glass pavilion by the Zhongshan / Zhongzheng roundabout ----------
/** the Zhongshan Rd × Zhongzheng Rd junction (美麗島), or null */
export function formosaJunction(data: OsmCityData): XZ | null {
  const at = new Map<number, Set<string>>();
  for (const r of data.roads)
    for (const n of [r.a, r.b]) {
      const s = at.get(n) ?? new Set<string>();
      if (r.name) s.add(r.name);
      at.set(n, s);
    }
  const pts: XZ[] = [];
  for (const [n, s] of at) if ([...s].some((x) => x.startsWith('中山')) && [...s].some((x) => x.startsWith('中正'))) pts.push(data.nodes[n]);
  if (!pts.length) return null;
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
function formosaDome(ctx: Ctx, m: Model): Kit[] | null {
  const j = formosaJunction(ctx.data);
  if (!j) return null;
  const R = 7.5;
  const sp = findSpot(ctx.site, j[0], j[1], R + 1, 2.5, ctx.taken, 60);
  if (!sp) return null;
  const k = new Kit(m.id, sp[0], sp[1], Math.atan2(j[1] - sp[1], j[0] - sp[0]) - Math.PI / 2);
  k.cyl(0, 0, 0, R + 0.8, 0.6, C.stone, { seg: 16 });
  k.cyl(0, 0, 0.6, R, 3.4, C.glassLight, { seg: 16, solid: true });
  k.sph(0, 0, 4, R, '#6FA6C8', 16);
  // the stained-glass ribs
  k.ring(0, 0, 4, R + 0.05, 0.28, '#D9A23A', 0);
  k.ring(0, 0, 4, R + 0.05, 0.28, '#C2453B', Math.PI / 2);
  k.cyl(0, 0, 4 + R - 0.4, 1.1, 0.9, '#D9A23A', { seg: 8 });
  m.covers.push(rectRing({ cx: sp[0], cz: sp[1], L: 2 * R + 2, W: 2 * R + 2, ang: 0 }));
  const d = Math.hypot(j[0] - sp[0], j[1] - sp[1]) || 1;
  const ux = (j[0] - sp[0]) / d,
    uz = (j[1] - sp[1]) / d;
  m.signs.push({ id: 'formosa', name: { zh: '美麗島 光之穹頂', en: 'Dome of Light' }, x: sp[0] + ux * (R + 2), y: 3.2, z: sp[1] + uz * (R + 2), yaw: Math.atan2(ux, uz), decor: true });
  return [k];
}

// ---------- True Love Pier: the white sail canopies on the quay ----------
const lovepier: Builder = (ctx, lm, m) => {
  // towards the river mouth from the mapped point, clear of the Music Center
  const sp = findSpot(ctx.site, lm.x + 14, lm.z + 24, 9, 3, ctx.taken, 70);
  if (!sp) return null;
  const hit = ctx.site.nearest(sp[0], sp[1]);
  const ang = hit ? Math.atan2(hit.dz, hit.dx) : 0;
  const k = new Kit(m.id, sp[0], sp[1], ang);
  k.box(0, 0, 0, 16, 9, 0.5, C.wood);
  const sails = [
    { u: -5, h: 15, r: 5.5 },
    { u: 0.5, h: 12, r: 5 },
    { u: 5.5, h: 9.5, r: 4.2 },
  ];
  for (const s of sails) {
    k.cyl(s.u - s.r * 0.55, 0, 0.5, 0.18, s.h, C.steel, { seg: 6, solid: true });
    k.cone(s.u, 0, 0.5 + 2.4, s.r, s.h - 2.4, C.white, { seg: 4, sx: 0.06 });
  }
  for (let i = 0; i < 3; i++) k.box(-5 + i * 5, -2.5, 0.5, 2.6, 0.6, 0.45, C.wood);
  m.covers.push(rectRing({ cx: sp[0], cz: sp[1], L: 17, W: 10, ang }));
  return [k];
};

// ---------- Cultural Center: the long hall under the blue glazed-tile roof, behind its colonnade ----------
const culturalcenter: Builder = (ctx, lm, m) => {
  const r0 = place(ctx, lm, { L: 86, W: 36 });
  if (!r0) return null;
  const L = Math.min(r0.L, 86),
    W = Math.min(r0.W, 36);
  const k = new Kit(m.id, r0.cx, r0.cz, r0.ang);
  k.box(0, 0, 0, L, W, 1.4, C.stone);
  k.box(0, 0, 1.4, L - 6, W - 8, 11, C.offwhite, { solid: true });
  // colonnades front and back
  const n = Math.max(4, Math.floor((L - 4) / 6.5));
  for (const s of [-1, 1])
    for (let i = 0; i < n; i++) k.cyl(-((n - 1) * 6.5) / 2 + i * 6.5, s * (W / 2 - 1.6), 1.4, 0.6, 11, C.white, { seg: 8 });
  k.box(0, 0, 12.4, L - 1, W - 1, 1, C.white);
  // the hipped roof in blue tiles, a raised middle and the ridge
  k.roof(0, 0, 13.4, L + 2, W + 4, 7, C.blueTile, (W + 4) * 0.35);
  k.box(0, 0, 18.6, L * 0.34, W * 0.5, 2.2, C.offwhite);
  k.roof(0, 0, 20.8, L * 0.34 + 2, W * 0.5 + 3, 4, C.blueTile, 3);
  k.box(0, 0, 20.4 - 0.1, (L + 2) * 0.62, 0.8, 0.6, C.blueTileDark);
  m.covers.push(rectRing({ ...r0, L, W }));
  return [k];
};

// ---------- Sanfeng Temple: red walls and columns, gold trim, swallowtail ridges on the roofs ----------
function swallowRoof(k: Kit, v: number, y0: number, L: number, W: number, H: number) {
  k.roof(0, v, y0, L, W, H, C.tile, 0);
  k.box(0, v, y0 + H - 0.1, L * 0.86, 0.5, 0.7, C.gold);
  for (const s of [-1, 1]) {
    // the up-turned swallowtail ends of the ridge
    k.box(s * (L * 0.43 + 0.5), v, y0 + H + 0.2, 1.4, 0.45, 0.5, C.gold);
    k.cone(s * (L * 0.43 + 1.3), v, y0 + H + 0.2, 0.5, 2.2, C.gold, { seg: 4 });
  }
  k.sph(0, v, y0 + H + 1.1, 0.6, C.gold, 8);
}
const sanfeng: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 30, W: 34 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  k.box(0, 0, 0, L, W, 1.2, C.stone);
  // the front hall (三川殿)
  const fv = W / 2 - W * 0.17;
  k.box(0, fv, 1.2, L * 0.86, W * 0.26, 6.2, C.red, { solid: true });
  for (let i = 0; i < 6; i++) k.cyl(-L * 0.36 + (i * L * 0.72) / 5, fv + W * 0.13 + 0.7, 1.2, 0.35, 5.6, C.redDark, { seg: 8 });
  k.box(0, fv + W * 0.13 + 0.05, 4.2, L * 0.3, 0.12, 1.6, C.gold);
  k.box(0, fv, 7.4, L * 0.86 + 1.4, W * 0.26 + 2.6, 0.4, C.gold);
  swallowRoof(k, fv, 7.8, L * 0.86 + 1.6, W * 0.26 + 3, 3);
  // the main hall behind it, taller, with two roof tiers
  const mv = -W * 0.14;
  k.box(0, mv, 1.2, L * 0.8, W * 0.44, 10, C.red, { solid: true });
  k.box(0, mv, 11.2, L * 0.8 + 1.2, W * 0.44 + 1.2, 0.4, C.gold);
  k.roof(0, mv, 11.6, L * 0.8 + 3, W * 0.44 + 4, 2.4, C.tile, 1.2);
  k.box(0, mv, 14, L * 0.5, W * 0.3, 2.4, C.red);
  swallowRoof(k, mv, 16.4, L * 0.6, W * 0.36, 3.2);
  // the incense burner in the forecourt
  k.cyl(0, W / 2 + 0.8, 1.2, 1, 1.6, '#7A5C2E', { seg: 8 });
  k.cone(0, W / 2 + 0.8, 2.8, 1.1, 1.2, '#7A5C2E', { seg: 8 });
  m.covers.push(rectRing(r));
  return [k];
};

// ---------- night markets: gate arches over the street, stall rows on both kerbs; the road stays open ----------
const nightmarket: Builder = (ctx, lm, m) => {
  const { site } = ctx;
  const ring = lm.poly;
  const c: XZ = ring ? (() => { const r = rectOfRing(ring); return [r.cx, r.cz] as XZ; })() : [lm.x, lm.z];
  const hit = site.nearest(c[0], c[1], (r) => !r.bridge && !!r.name);
  if (!hit) return null;
  const name = hit.road.name;
  let half = 40;
  if (ring) {
    const ps = ring.map(([x, z]) => (x - hit.x) * hit.dx + (z - hit.z) * hit.dz);
    half = Math.min(85, Math.max(25, (Math.max(...ps) - Math.min(...ps)) / 2 - 4));
  }
  const kits: Kit[] = [];
  const onStreet = (t: number) => {
    const q = site.nearest(hit.x + hit.dx * t, hit.z + hit.dz * t, (r) => r.name === name);
    return q && q.d < 12 ? q : null;
  };
  const freeOfSpots = (x: number, z: number, r: number) => ctx.spots.every((s) => Math.hypot(s.x - x, s.z - z) > r);
  // stalls
  const sk = new Kit(m.id + '-stalls', hit.x, hit.z, 0);
  let n = 0;
  for (let t = -half + 6; t <= half - 6; t += 4.2) {
    const q = onStreet(t);
    if (!q) continue;
    for (const side of [1, -1]) {
      const nx = -q.dz * side,
        nz = q.dx * side;
      const off = q.road.w / 2 + 2.2;
      const x = q.x + nx * off,
        z = q.z + nz * off;
      const ang = Math.atan2(q.dz, q.dx);
      const c2 = Math.cos(ang),
        s2 = Math.sin(ang);
      const corners: XZ[] = [-1.4, 1.4].flatMap((a) => [-1.2, 1.2].map((b) => [x + a * c2 - b * s2, z + a * s2 + b * c2] as XZ));
      if (corners.some(([px, pz]) => site.roadGap(px, pz) < ROAD_GAP + 0.3 || !site.onLand(px, pz)) || !freeOfSpots(x, z, 5)) continue;
      const u = (x - hit.x) * 1,
        v = (z - hit.z) * 1;
      // the stall kit has angle 0, so u, v are plain world offsets; the stall itself turns with the street
      sk.box(u, v, 0, 2.6, 2.0, 2.2, C.offwhite, { solid: true, a: ang });
      sk.box(u, v, 2.2, 3.0, 2.6, 0.3, AWNINGS[n++ % AWNINGS.length], { a: ang });
    }
  }
  kits.push(sk);
  // a gate at each end, moved inwards until both posts stand clear of the cross streets
  for (const end of [-1, 1]) {
    for (let t = half; t > 6; t -= 4) {
      const q = onStreet(end * t);
      if (!q) continue;
      const w = q.road.w;
      const k = new Kit(`${m.id}-gate${end}`, q.x, q.z, Math.atan2(q.dz, q.dx));
      const postV = w / 2 + 1.2;
      const ok = [-1, 1].every((s) => {
        const [x, z] = k.at(0, s * postV);
        return [0, 0.6, -0.6].every((du) => {
          const [px, pz] = k.at(du, s * postV);
          return site.roadGap(px, pz) >= ROAD_GAP + 0.55 && site.onLand(px, pz) && freeOfSpots(x, z, 2);
        });
      });
      if (!ok) continue;
      for (const s of [-1, 1]) {
        k.cyl(0, s * postV, 0, 0.45, 7.6, C.red, { seg: 8, solid: true });
        k.cyl(0, s * postV, 0, 0.7, 0.8, C.stone, { seg: 8 });
      }
      k.box(0, 0, 6.0, 1.2, 2 * postV + 1.6, 1.7, C.red);
      k.box(0, 0, 7.7, 1.5, 2 * postV + 2.4, 0.35, C.gold);
      k.roof(0, 0, 8.05, 1.9, 2 * postV + 2.6, 0.9, C.tile, 0, Math.PI / 2);
      // the market's name on both faces of the lintel
      const name2 = { zh: lm.zh.replace('觀光', ''), en: lm.en || lm.zh };
      for (const f of [1, -1]) {
        const [x, z] = k.at(f * 0.66, 0);
        m.signs.push({ id: `${m.id}-gate${end}${f}`, name: name2, x, y: 6.85, z, yaw: Math.atan2(q.dx * f, q.dz * f), decor: true });
      }
      kits.push(k);
      break;
    }
  }
  return kits;
};

// ---------- City Government Center (四維): two office wings and the taller middle block with its roof frame ----------
const cityhall: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 70, W: 50 }, { keepLong: true });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  k.box(0, 0, 0, L, W * 0.86, 6, C.stone, { solid: true });
  for (const s of [-1, 1]) {
    k.box(s * L * 0.31, -W * 0.04, 6, L * 0.34, W * 0.7, 26, '#D8D3C6', { solid: true });
    for (let y = 9; y < 32; y += 3.6) k.box(s * L * 0.31, -W * 0.04, y, L * 0.34 + 0.3, W * 0.7 + 0.3, 1.2, C.glass);
  }
  k.box(0, 0, 6, L * 0.3, W * 0.62, 40, '#E4DFD2', { solid: true });
  k.box(0, W * 0.31 + 0.05, 8, L * 0.12, 0.12, 34, C.glass);
  // the roof frame
  for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(a * L * 0.14, b * W * 0.29, 46, 0.8, 0.8, 5, C.white);
  k.box(0, 0, 51, L * 0.3, W * 0.62, 1, C.white);
  // flagpoles in the forecourt
  for (const i of [-1, 0, 1]) k.cyl(i * 4, W * 0.43 + 2, 0, 0.12, 12, C.white, { seg: 6 });
  m.covers.push(rectRing(r));
  return [k];
};

// ---------- CSC building: four square towers of stacked cubes round a core ----------
const csc: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 33, W: 33 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const q = Math.min(r.L, r.W) / 2;
  const side = q - 1.2;
  const mod = 13.5;
  k.box(0, 0, 0, q * 0.9, q * 0.9, 128, C.glassDark, { solid: true });
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const top = 108 + (a + b === 0 ? 14 : 0);
    k.wall((a * q) / 2, (b * q) / 2, 0, side, side, top);
    for (let y = 0, i = 0; y < top; y += mod, i++) {
      const h = Math.min(mod - 1.2, top - y);
      const sh = i % 2 ? 0.6 : -0.6;
      k.box((a * q) / 2 + sh * a, (b * q) / 2 - sh * b, y, side, side, h, C.steel);
      k.box((a * q) / 2, (b * q) / 2, y + h, side - 1.2, side - 1.2, 1.2, C.steelDark);
    }
  }
  k.cyl(0, 0, 128, 2.5, 6, C.steelDark, { seg: 8 });
  m.covers.push(rectRing(r));
  return [k];
};

// ---------- Great Harbor Bridge: the white pedestrian swing bridge with its side arch (drawn only) ----------
const greatharbor: Builder = (ctx, lm, m) => {
  const { site } = ctx;
  if (!site.inWater(lm.x, lm.z)) return null;
  const reach = (a: number, sgn: number) => {
    for (let d = 1; d < 150; d++) if (!site.inWater(lm.x + Math.cos(a) * d * sgn, lm.z + Math.sin(a) * d * sgn)) return d;
    return 150;
  };
  let best = { a: 0, n: 0, p: 0, span: Infinity };
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI;
    const n = reach(a, -1),
      p = reach(a, 1);
    if (n + p < best.span) best = { a, n, p, span: n + p };
  }
  if (best.span > 140) return null;
  const k = new Kit(m.id, lm.x, lm.z, best.a);
  const u0 = -best.n + 0.5,
    u1 = best.p - 0.5;
  const cu = (u0 + u1) / 2,
    L = u1 - u0;
  k.box(cu, 0, 0.6, L, 5, 0.7, C.white);
  for (const s of [-1, 1]) k.box(cu, s * 2.4, 1.3, L, 0.15, 1.1, C.white);
  // the arch beside the deck, and the pivot pier on the near bank
  k.ring(cu, 3.1, 1.3 - L * 0.12, L * 0.47, 0.45, C.white, 0);
  k.cyl(u0 + 3, 0, -1.6, 2.2, 2.2, C.concrete, { seg: 10 });
  m.overWater = true;
  return [k];
};

// ---------- Central Park: a pond among the park trees ----------
const centralpark: Builder = (ctx, lm, m) => {
  const park = ctx.data.parks.find((p) => p.name === '中央公園');
  const ring = park?.poly[0];
  let x = lm.x,
    z = lm.z;
  if (ring) {
    const r = rectOfRing(ring);
    x = r.cx;
    z = r.cz;
  }
  const avoid = [...ctx.taken];
  // the park's own pond is mapped as water: then a pavilion and trees on its bank instead of a second pond
  const pond = ring && ctx.data.water.find((w) => { const r = rectOfRing(w[0]); return pointInRing(r.cx, r.cz, ring); });
  if (pond && ring) {
    const pr = rectOfRing(pond[0]);
    const sp2 = findSpot(ctx.site, pr.cx, pr.cz, 6, 8, avoid, 80);
    if (sp2 && pointInRing(sp2[0], sp2[1], ring)) {
      const k = new Kit(m.id, sp2[0], sp2[1], pr.ang);
      k.box(0, 0, 0, 9, 9, 0.6, C.stone);
      for (const a of [-1, 1]) for (const b of [-1, 1]) k.cyl(a * 3.4, b * 3.4, 0.6, 0.3, 3.4, C.red, { seg: 6, solid: true });
      k.cyl(0, 0, 4, 5.6, 0.5, C.redDark, { seg: 6 });
      k.cone(0, 0, 4.5, 5.6, 3, C.tile, { seg: 6 });
      k.sph(0, 0, 7.7, 0.4, C.gold, 6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        const u = Math.cos(a) * 10,
          v = Math.sin(a) * 10;
        const [tx, tz] = k.at(u, v);
        if (!ctx.site.onLand(tx, tz)) continue;
        k.cyl(u, v, 0, 0.35, 4, C.trunk, { seg: 6 });
        k.sph(u, v, 5.6, 2.6, C.leaf, 6);
      }
      m.covers.push(rectRing({ cx: sp2[0], cz: sp2[1], L: 10, W: 10, ang: pr.ang }));
      return [k];
    }
  }
  const sp = findSpot(ctx.site, x, z, 17, 8, avoid, 80);
  if (!sp || (ring && !pointInRing(sp[0], sp[1], ring))) return null;
  const k = new Kit(m.id, sp[0], sp[1], 0.4);
  const lobes = [
    { u: 0, v: 0, r: 12 },
    { u: 9, v: 4, r: 8 },
    { u: -8, v: -3, r: 7 },
  ];
  for (const l of lobes) k.cyl(l.u, l.v, 0.02, l.r + 1.2, 0.12, C.stone, { seg: 14 });
  for (const l of lobes) k.cyl(l.u, l.v, 0.06, l.r, 0.12, C.water, { seg: 14 });
  // a little arched footbridge and a few trees on the banks
  k.box(-2, 6, 0.1, 2, 9, 0.5, C.wood, { a: 0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const u = Math.cos(a) * 17,
      v = Math.sin(a) * 13;
    k.cyl(u, v, 0, 0.35, 4, C.trunk, { seg: 6 });
    k.sph(u, v, 5.6, 2.6, C.leaf, 6);
  }
  m.covers.push(rectRing({ cx: sp[0], cz: sp[1], L: 36, W: 28, ang: 0.4 }));
  return [k];
};

// ---------- the rest: simple generic models by kind ----------
function hallWithPortico(k: Kit, L: number, W: number, H: number, wall: string, roof: string) {
  k.box(0, 0, 0, L, W, 0.8, C.stone);
  k.box(0, 0, 0.8, L - 1, W - 1, H, wall, { solid: true });
  k.roof(0, 0, H + 0.8, L + 0.6, W + 0.6, Math.min(4, W * 0.25), roof, 0);
  const n = Math.max(2, Math.min(6, Math.floor(L / 5)));
  for (let i = 0; i < n; i++) k.cyl(-((n - 1) * 3) / 2 + i * 3, W / 2 + 1.4, 0.8, 0.4, H - 0.6, C.white, { seg: 8 });
  k.roof(0, W / 2 + 1.4, H + 0.2, (n - 1) * 3 + 2.4, 3.4, 2, C.white, 0, Math.PI);
  k.box(0, W / 2 + 1.4, H - 0.4, (n - 1) * 3 + 2, 3, 0.6, C.white);
}
const generic: Builder = (ctx, lm, m) => {
  const kind = lm.kind;
  const dims: Record<string, { L: number; W: number }> = {
    museum: { L: 30, W: 18 }, market: { L: 40, W: 26 }, library: { L: 46, W: 44 }, oldstation: { L: 18, W: 10 }, station: { L: 20, W: 12 },
    exhibition: { L: 90, W: 46 }, pier: { L: 14, W: 9 }, plaza: { L: 30, W: 8 }, tower: { L: 10, W: 9 }, park: { L: 26, W: 8 },
  };
  const def = dims[kind] ?? { L: 20, W: 14 };
  const cap = kind === 'market' ? { L: 60, W: 40 } : kind === 'park' ? { L: 26, W: 8 } : kind === 'library' ? { L: 50, W: 50 } : undefined;
  const r = place(ctx, lm, def, { cap, ring: kind === 'park' ? null : lm.poly });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  if (kind === 'museum' && r.tight) {
    k.box(0, 0, 0, L, W, 9, C.offwhite, { solid: true });
    k.roof(0, 0, 9, L + 0.6, W + 0.6, Math.min(3.5, W * 0.25), '#7A6E62', 1);
  } else if (kind === 'museum') hallWithPortico(k, L, W, Math.min(12, 6 + W * 0.25), lm.id === 'oldcouncil' ? '#C9B79A' : C.offwhite, lm.id === 'labormuseum' ? C.brick : '#7A6E62');
  else if (kind === 'market') {
    k.box(0, 0, 0, L, W, 5.5, '#C8C1B4', { solid: true });
    k.roof(0, 0, 5.5, L + 1.6, W + 2, Math.min(4, W * 0.18), C.roofSheet, 0);
    for (let i = -2; i <= 2; i++) k.box((i * L) / 6, W / 2 + 0.06, 0, Math.min(4, L / 8), 0.12, 3.2, C.door);
  } else if (kind === 'library') {
    k.box(0, 0, 0, L, W, 4, C.glassLight, { solid: true });
    for (let i = 0; i < 6; i++) {
      k.box(0, 0, 4 + i * 5, L, W, 0.8, C.white, { solid: i === 0 });
      k.box(0, 0, 4.8 + i * 5, L - 3, W - 3, 4.2, C.glass, { solid: true });
      k.box(L / 2 - 1.2, 0, 4.8 + i * 5, 1.4, W - 2, 1, C.leaf);
      k.box(-L / 2 + 1.2, 0, 4.8 + i * 5, 1.4, W - 2, 1, C.leaf);
    }
    k.box(0, 0, 34, L, W, 0.8, C.white);
    for (let i = 0; i < 4; i++) k.sph((i - 1.5) * (L / 5), 0, 37, 2.4, C.leaf, 6);
  } else if (kind === 'oldstation' || kind === 'station') {
    k.box(0, 0, 0, L, W, 5, lm.id === 'sankuaicuo' ? C.brick : C.offwhite, { solid: true });
    k.roof(0, 0, 5, L + 1.4, W + 1.6, 3.4, '#4E4A46', 1.6);
    if (!r.tight) {
      k.box(0, W / 2 + 1.4, 3.2, L * 0.7, 2.8, 0.3, '#4E4A46');
      for (const s of [-1, 1]) k.cyl(s * L * 0.3, W / 2 + 2.4, 0, 0.18, 3.2, C.white, { seg: 6 });
    } else k.box(0, W / 2 + 0.05, 0, Math.min(2.4, L / 3), 0.1, 2.6, C.door);
  } else if (kind === 'exhibition') {
    k.box(0, 0, 0, L, W, 12, C.glassLight, { solid: true });
    // the wave-shaped roof
    const n = 9;
    for (let i = 0; i < n; i++) {
      const y = 12 + 2.4 * (1 + Math.sin((i / (n - 1)) * Math.PI * 2));
      k.box(-L / 2 + (L / n) * (i + 0.5), 0, y, L / n + 0.4, W + 4, 0.9, C.white);
      k.box(-L / 2 + (L / n) * (i + 0.5), 0, 12, L / n - 0.4, W - 1, y - 12, C.glass);
    }
  } else if (kind === 'pier') {
    k.box(0, 0, 0, L * 0.6, W * 0.5, 3.2, C.offwhite, { solid: true });
    k.box(0, 0, 3.2, L * 0.7, W * 0.65, 0.4, C.glassDark);
    for (let i = -2; i <= 2; i++) k.cyl(i * (L / 5), -W / 2 + 0.6, 0, 0.35, 0.9, C.black, { seg: 8 });
    k.cyl(L / 2 - 1, 0, 0, 0.2, 9, C.steel, { seg: 6, solid: true });
    k.box(L / 2 - 1, 0, 9, 1.4, 0.6, 0.5, C.paint);
  } else if (kind === 'plaza') {
    // City Light Corridor: a row of coloured light columns and a small stage
    const cols = ['#E8B04A', '#D9534F', '#3F7FBF', '#5E9E4E'];
    const n = Math.max(3, Math.floor(L / 4));
    for (let i = 0; i < n; i++) {
      k.cyl(-L / 2 + 2 + i * ((L - 4) / (n - 1)), 0, 0, 0.35, 6, C.steel, { seg: 6, solid: true });
      k.box(-L / 2 + 2 + i * ((L - 4) / (n - 1)), 0, 6, 0.9, 0.9, 1.6, cols[i % cols.length]);
    }
    k.box(0, -W / 2 + 1.5, 0, Math.min(10, L / 2), 3, 0.8, C.stone);
  } else if (kind === 'tower') {
    for (const a of [-1, 1]) for (const b of [-1, 1]) k.box((a * L) / 2.6, (b * W) / 2.6, 0, 0.7, 0.7, 26, C.steel, { solid: true });
    for (let y = 6; y < 26; y += 6.5) k.box(0, 0, y, L * 0.85, W * 0.85, 0.5, C.steelDark);
    k.box(0, 0, 26, L * 0.9, W * 0.9, 3, C.red);
    k.cyl(0, 0, 29, 0.25, 4, C.white, { seg: 6 });
  } else if (kind === 'park') {
    // Takao Railway Park: a steam locomotive on a short length of track
    k.box(0, 0, 0, L, 3.2, 0.25, '#6E655B');
    for (const s of [-1, 1]) k.box(0, s * 0.72, 0.25, L, 0.12, 0.15, C.steel);
    k.box(-1, 0, 1.6, 9, 2.4, 2.4, C.black);
    k.wall(1, 0, 0, 13, 3, 3.2);
    k.box(5, 0, 1.1, 3.4, 2.8, 3.8, C.black);
    k.box(5, 0, 4.9, 3.8, 3.1, 0.3, C.black);
    k.cyl(-4.2, 0, 4, 0.45, 1.6, C.black, { seg: 8 });
    k.box(0, 0, 0.4, 12, 2.4, 1.2, C.redDark);
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) k.box(i * 2.2, s * 1.25, 0.2, 1.5, 0.25, 1.5, C.redDark);
  } else {
    k.box(0, 0, 0, L, W, 8, C.offwhite, { solid: true });
    k.roof(0, 0, 8, L + 1, W + 1, 2.5, '#7A6E62', 1);
  }
  m.covers.push(rectRing(r));
  return [k];
};

const BUILDERS: Record<string, Builder> = {
  tower85, musiccenter, pier2, mainstation, oldstation, lovepier, culturalcenter, sanfeng, cityhall, csc, greatharbor, centralpark, historymuseum,
  liuhe: nightmarket, nanhua: nightmarket, guanghua: nightmarket,
};
/** big models first, so the small ones fit round them */
const ORDER = ['tower85', 'musiccenter', 'mainstation', 'oldstation', 'csc', 'culturalcenter', 'cityhall', 'sanfeng', 'pier2', 'liuhe', 'nanhua', 'guanghua', 'historymuseum'];

export interface Landmarks {
  prims: Prim[];
  shapes: Shape[];
  signs: Sign[];
  /** mapped buildings (index into data.buildings) the models replace */
  drop: Set<number>;
  /** every model, by landmark id (plus 'formosa', the Dome of Light) */
  models: Map<string, Model>;
  /** keep a park tree here? (not inside a model) */
  keepTree(x: number, z: number): boolean;
  /** parts removed by the final checks (should stay near zero) */
  rejected: { id: string; why: string }[];
}

/** builds every landmark model; `spots` are the kerb points where people wait (kept free) */
export function landmarkModels(data: OsmCityData = KAOHSIUNG, spots: Spot[] = []): Landmarks {
  const site = new Site(data);
  const ctx: Ctx = { data, site, taken: [], spots: spots.map((s) => ({ x: s.cx ?? s.x, z: s.cz ?? s.z })) };
  const models = new Map<string, Model>();
  const rejected: Landmarks['rejected'] = [];
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  const list = [...data.landmarks].sort((a, b) => rank(a.id) - rank(b.id));
  const finish = (m: Model, kits: Kit[] | null) => {
    if (!kits) return;
    for (const k of kits) {
      for (const p of k.prims) {
        const why = footProblem(primFoot(p), site, m.overWater);
        if (why) rejected.push({ id: m.id, why });
        else m.prims.push(p);
      }
      for (const s of k.shapes) {
        const f = shapeFoot(s);
        const why = f && footProblem(f, site, m.overWater);
        if (why) rejected.push({ id: m.id, why: 'collider ' + why });
        else m.shapes.push(s);
      }
    }
    ctx.taken.push(...m.covers);
    models.set(m.id, m);
  };
  for (const lm of list) {
    const m: Model = { id: lm.id, prims: [], shapes: [], covers: [], replaces: [], signs: [] };
    finish(m, (BUILDERS[lm.id] ?? generic)(ctx, lm, m));
  }
  const dome: Model = { id: 'formosa', prims: [], shapes: [], covers: [], replaces: [], signs: [] };
  finish(dome, formosaDome(ctx, dome));

  // ---------- the mapped buildings the models stand on ----------
  const covers = [...models.values()].flatMap((m) => m.covers);
  const drop = new Set<number>([...models.values()].flatMap((m) => m.replaces));
  const boxes = covers.map((r) => {
    const xs = r.map((p) => p[0]),
      zs = r.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  });
  const near = (x: number, z: number, m: number) => boxes.some(([a, b, c, d]) => x > a - m && x < c + m && z > b - m && z < d + m);
  data.buildings.forEach((b, i) => {
    if (drop.has(i)) return;
    const [cx, cz, L, W, ang] = b.obb;
    if (!near(cx, cz, Math.max(L, W))) return;
    const m = Math.max(L, W);
    const mine = covers.filter((_, k) => { const [a, b2, c, d] = boxes[k]; return cx > a - m && cx < c + m && cz > b2 - m && cz < d + m; });
    if (!mine.length) return;
    const pts = footSamples({ x: cx, z: cz, hx: L / 2, hz: W / 2, ang, y0: 0, y1: 1 }, 3);
    const inside = pts.filter(([x, z]) => mine.some((r) => pointInRing(x, z, r))).length;
    if (mine.some((r) => pointInRing(cx, cz, r)) || inside / pts.length > 0.15) drop.add(i);
  });
  const all = [...models.values()];
  return {
    prims: all.flatMap((m) => m.prims),
    shapes: all.flatMap((m) => m.shapes),
    signs: all.flatMap((m) => m.signs),
    drop,
    models,
    keepTree: (x, z) => !near(x, z, 3) || !covers.some((r) => pointInRing(x, z, r)) && !all.some((m) => m.shapes.some((s) => { const f = shapeFoot(s); return !!f && inFoot(f, x, z, 1.2); })),
    rejected,
  };
}

/** moves name boards that would stand inside a model out towards their road (they face it) */
export function clearSigns(signs: Sign[], lms: Landmarks) {
  const feet = lms.prims.map(primFoot);
  const blocked = (s: Sign) => feet.some((f) => f.y1 > s.y - 1.2 && f.y0 < s.y + 1.2 && inFoot(f, s.x, s.z, 0.3));
  for (const s of signs) {
    for (let i = 0; i < 8 && blocked(s); i++) {
      s.x += Math.sin(s.yaw) * 0.5;
      s.z += Math.cos(s.yaw) * 0.5;
    }
    // still inside (a canopy or a stall row): lift it clear above the parts round it
    if (blocked(s)) {
      const top = Math.max(...feet.filter((f) => inFoot(f, s.x, s.z, 0.3)).map((f) => f.y1));
      if (top < 12) s.y = top + 1.6;
    }
  }
}
