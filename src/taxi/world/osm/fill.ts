// Rush Taxi: fills the real-map city's blocks with buildings, so every block reads as a Kaohsiung street.
//
// The OpenStreetMap extract maps only about 2,300 footprints, so most blocks are empty. For each block that is not
// a park this lays out:
// - frontage rows along every street edge of the block polygon: lots set 0.4 m back from the sidewalk, 10–16 m
//   deep, oriented along the edge, with a 1.5 m alley between rows now and then;
// - the block interior: low back buildings on a grid, or left open as a courtyard.
// The style follows the district and the mapped land use:
// - 鹽埕 / 鼓山 / 三民 (old town): narrow 透天厝, 4–7 m frontage, 3–5 storeys, set-back top floors, balconies;
// - 前金 / 新興 / 苓雅 (downtown): mid-rise blocks and some towers on podiums on the big roads (rank ≥ 4), walk-ups
//   on the side streets;
// - commercial / retail: shophouses with an arcade canopy over the pavement and more vertical signboards;
// - 前鎮 and industrial / port use: warehouses and sheds (gable or sawtooth roofs where the row is axis-aligned).
// Nothing is placed over a mapped footprint, a sidewalk, a road or water: every lot is tested against the block
// polygon (which stops at the sidewalks) and against the boxes already placed.
//
// Output is plain data (no Three.js): box Shapes with a facade `look` (build.ts gives them the facade shader, and
// colliders unless `nocollide`), plain box Shapes for balconies and canopies, pitched roofs, and the rooftop and wall
// decor (tanks, sheds, air conditioners, shop signs).
import type { Shape } from '../greybox';
import type { Decor } from '../level';
import type { Pitch } from '../massing';
import { storeys } from '../massing';
import { encodeLook, LOOK_HALL, LOOK_HOUSE, LOOK_TOWER, LOOK_WAREHOUSE } from '../facade';
import { SHOP_WORDS, SIGN_COLORS } from '../city';
import { RANK, type OsmBlock, type OsmCityData, type Ring, type XZ } from './data';

type BoxShape = Extract<Shape, { kind: 'box' }>;

/** an oriented box on the ground: centre, half length along (c, s), half width across */
export interface Obb {
  x: number;
  z: number;
  hl: number;
  hw: number;
  c: number;
  s: number;
}

export type Zone = 'old' | 'down' | 'shop' | 'res' | 'port';

export interface FillResult {
  shapes: Shape[];
  pitched: Pitch[];
  decor: Pick<Decor, 'tanks' | 'sheds' | 'acs' | 'shopSigns'>;
  /** the ground footprint of every fill building (for tests), with the block it belongs to */
  footprints: { b: Obb; block: number; front: boolean }[];
}

// ---------------------------------------------------------------- helpers

/** small deterministic hash → [0, 1) */
export function hashN(...k: number[]) {
  let x = 2166136261;
  for (const v of k) {
    x ^= Math.round(v * 16) + 0x9e3779b9 + (x << 6) + (x >>> 2);
    x = Math.imul(x, 16777619);
  }
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489909);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function ringArea(ring: Ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

export function pointInRing(x: number, z: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function obbCorners(b: Obb): XZ[] {
  const ax = b.c * b.hl,
    az = b.s * b.hl,
    vx = -b.s * b.hw,
    vz = b.c * b.hw;
  return [
    [b.x - ax - vx, b.z - az - vz],
    [b.x + ax - vx, b.z + az - vz],
    [b.x + ax + vx, b.z + az + vz],
    [b.x - ax + vx, b.z - az + vz],
  ];
}

/** do two oriented boxes overlap (separating axis test); `pad` grows both a little */
export function obbOverlap(a: Obb, b: Obb, pad = 0) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const al = a.hl + pad,
    aw = a.hw + pad,
    bl = b.hl + pad,
    bw = b.hw + pad;
  if (Math.abs(dx) + Math.abs(dz) > (al + aw + bl + bw) * 1.42) return false;
  const axis = (ux: number, uz: number) => {
    const ra = al * Math.abs(a.c * ux + a.s * uz) + aw * Math.abs(-a.s * ux + a.c * uz);
    const rb = bl * Math.abs(b.c * ux + b.s * uz) + bw * Math.abs(-b.s * ux + b.c * uz);
    return Math.abs(dx * ux + dz * uz) < ra + rb;
  };
  return axis(a.c, a.s) && axis(-a.s, a.c) && axis(b.c, b.s) && axis(-b.s, b.c);
}

/** a ring as a flat [x0, z0, x1, z1, …] array (fast loops over mixed int/float JSON data) */
export const flatRing = (ring: Ring) => Float64Array.from(ring.flat());

export function pointInFlat(x: number, z: number, f: Float64Array) {
  let inside = false;
  const n = f.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = f[i],
      zi = f[i + 1],
      xj = f[j],
      zj = f[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** does segment (ax, az)–(bx, bz) touch the oriented box (Liang–Barsky in the box's frame) */
export function segHitsObb(ax: number, az: number, bx: number, bz: number, b: Obb) {
  const p0 = (ax - b.x) * b.c + (az - b.z) * b.s,
    p1 = -(ax - b.x) * b.s + (az - b.z) * b.c;
  const d0 = (bx - b.x) * b.c + (bz - b.z) * b.s - p0,
    d1 = -(bx - b.x) * b.s + (bz - b.z) * b.c - p1;
  let t0 = 0,
    t1 = 1;
  const clip = (p: number, d: number, lim: number) => {
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const num = lim - sgn * p,
        den = sgn * d;
      if (Math.abs(den) < 1e-12) {
        if (num < 0) return false;
      } else {
        const t = num / den;
        if (den > 0) t1 = Math.min(t1, t);
        else t0 = Math.max(t0, t);
        if (t0 > t1) return false;
      }
    }
    return true;
  };
  return clip(p0, d0, b.hl) && clip(p1, d1, b.hw);
}

/** is the box wholly inside the polygon (outer ring, outside the holes); rings as flatRing arrays */
export function obbInFlat(b: Obb, poly: Float64Array[]) {
  const ax = b.c * b.hl,
    az = b.s * b.hl,
    vx = -b.s * b.hw,
    vz = b.c * b.hw;
  const outer = poly[0];
  if (!pointInFlat(b.x - ax - vx, b.z - az - vz, outer) || !pointInFlat(b.x + ax - vx, b.z + az - vz, outer) || !pointInFlat(b.x + ax + vx, b.z + az + vz, outer) || !pointInFlat(b.x - ax + vx, b.z - az + vz, outer)) return false;
  const R = b.hl + b.hw;
  for (const f of poly) {
    const n = f.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      // quick reject: the segment's bounds are clear of the box's circle bounds
      if (Math.max(f[i], f[j]) < b.x - R || Math.min(f[i], f[j]) > b.x + R || Math.max(f[i + 1], f[j + 1]) < b.z - R || Math.min(f[i + 1], f[j + 1]) > b.z + R) continue;
      if (segHitsObb(f[j], f[j + 1], f[i], f[i + 1], b)) return false;
    }
  }
  for (let h = 1; h < poly.length; h++) if (pointInFlat(b.x, b.z, poly[h])) return false;
  return true;
}

/** is the box wholly inside the polygon (outer ring, outside the holes) */
export function obbInPoly(b: Obb, poly: Ring[]) {
  return obbInFlat(b, poly.map(flatRing));
}

/** distance from a point to the nearest edge of a ring */
export function distToRing(x: number, z: number, ring: Ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const vx = ring[i][0] - ax,
      vz = ring[i][1] - az;
    const L2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** a coarse grid of boxes for overlap queries */
class BoxGrid {
  private cells = new Map<number, Obb[]>();
  constructor(private cell = 24) {}
  private keys(b: Obb) {
    const r = b.hl + b.hw;
    const out: number[] = [];
    const i0 = Math.floor((b.x - r) / this.cell),
      i1 = Math.floor((b.x + r) / this.cell),
      j0 = Math.floor((b.z - r) / this.cell),
      j1 = Math.floor((b.z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push((i + 1000) * 4096 + (j + 1000));
    return out;
  }
  add(b: Obb) {
    for (const k of this.keys(b)) (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(b);
  }
  hits(b: Obb, pad = 0) {
    for (const k of this.keys(b)) for (const o of this.cells.get(k) ?? []) if (obbOverlap(b, o, pad)) return true;
    return false;
  }
}

/** nearest road rank from a point, via a segment grid */
class RoadIndex {
  private cells = new Map<number, { a: XZ; b: XZ; rank: number; w: number }[]>();
  private cell = 40;
  constructor(data: OsmCityData) {
    for (const r of data.roads) {
      const rank = RANK[r.cls] ?? 1;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i],
          b = r.pts[i + 1];
        const seg = { a, b, rank, w: r.w };
        const i0 = Math.floor(Math.min(a[0], b[0]) / this.cell),
          i1 = Math.floor(Math.max(a[0], b[0]) / this.cell),
          j0 = Math.floor(Math.min(a[1], b[1]) / this.cell),
          j1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
        for (let x = i0; x <= i1; x++) for (let z = j0; z <= j1; z++) {
          const k = (x + 1000) * 4096 + (z + 1000);
          (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(seg);
        }
      }
    }
  }
  /** the rank of the closest road whose kerb is within `reach` of the point (0 = none) */
  rankAt(x: number, z: number, reach = 14) {
    let best = 0,
      bd = Infinity;
    const i = Math.floor(x / this.cell),
      j = Math.floor(z / this.cell);
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++)
        for (const s of this.cells.get((a + 1000) * 4096 + (b + 1000)) ?? []) {
          const vx = s.b[0] - s.a[0],
            vz = s.b[1] - s.a[1];
          const L2 = vx * vx + vz * vz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.a[0]) * vx + (z - s.a[1]) * vz) / L2));
          const d = Math.hypot(x - s.a[0] - vx * t, z - s.a[1] - vz * t) - s.w / 2;
          if (d < reach && d < bd) {
            bd = d;
            best = s.rank;
          }
        }
    return best;
  }
}

// ---------------------------------------------------------------- styles

const PAINT: Record<Zone, string[]> = {
  old: ['#E8DCC4', '#D9C7A8', '#E6D3B3', '#CFC6B8', '#E3B9A0', '#C9D3C6', '#F0E6D2', '#BFB3A1'],
  shop: ['#E8DCC4', '#DCCDB4', '#D7C9C0', '#E6D3B3', '#CCC8BE', '#F0E6D2'],
  res: ['#E6DDCB', '#D6CDBD', '#CFC6B8', '#E3D5BD', '#C9CFC9', '#DDD3C3'],
  down: ['#B9C1C8', '#A7B2BC', '#C8CCD0', '#9FAAB4', '#BFC4BE', '#D2CEC6'],
  port: ['#A9B4B8', '#B7B09F', '#9AA9A6', '#C3BBA8', '#8E9DA6'],
};
const BALCONY = '#E4E0D8';
const CANOPY = '#CFD4D9';
const SHEET = ['#8E9AA3', '#7E8C80', '#A35D4A', '#6F8FA6'];
const SHED = ['#5B8DB8', '#D9DCE1', '#8FA3B5', '#4F7D5C', '#B0BEC5'];

/** the zone of a block: district and land use */
export function zoneOf(block: Pick<OsmBlock, 'district' | 'use'>): Zone {
  const { district: d, use: u } = block;
  if (u === 'industrial' || u === 'port' || u === 'construction' || u === 'railway') return 'port';
  if (u === 'commercial' || u === 'retail') return 'shop';
  if (d === '前鎮區' || d === '旗津區') return u === 'residential' ? 'res' : 'port';
  if (d === '鹽埕區' || d === '鼓山區' || d === '三民區') return 'old';
  if (d === '前金區' || d === '新興區' || d === '苓雅區') return 'down';
  return 'res';
}

/** row parameters for an edge: lot width range, depth range, gap chance */
interface Row {
  lot: [number, number];
  depth: [number, number];
  alley: number;
  kind: 'house' | 'mid' | 'shed';
}
function rowFor(zone: Zone, rank: number, downtown: boolean): Row {
  if (zone === 'port') return { lot: [18, 36], depth: [13, 16], alley: 0.35, kind: 'shed' };
  if ((zone === 'down' || (zone === 'shop' && downtown)) && rank >= 4) return { lot: [14, 24], depth: [14, 16], alley: 0.25, kind: 'mid' };
  if (zone === 'shop') return { lot: [5, 8.5], depth: [12, 15], alley: 0.1, kind: 'house' };
  if (zone === 'down') return { lot: [5, 9], depth: [11, 15], alley: 0.14, kind: 'house' };
  if (zone === 'old') return { lot: [4, 7], depth: [10, 14], alley: 0.16, kind: 'house' };
  return { lot: [4.5, 7.5], depth: [11, 14], alley: 0.14, kind: 'house' };
}

// ---------------------------------------------------------------- the fill

export interface FillOptions {
  /** caps for the decor lists, to keep the triangle count (tanks are the most expensive) */
  maxTanks?: number;
  maxSigns?: number;
  maxAcs?: number;
}

/** footprints already on the map (the mapped buildings), as oriented boxes */
export function mappedBoxes(data: OsmCityData): Obb[] {
  const out: Obb[] = [];
  for (const b of data.buildings) {
    const [x, z, L, W, ang] = b.obb;
    if (L < 2 || W < 2) continue;
    out.push({ x, z, hl: L / 2, hw: W / 2, c: Math.cos(ang), s: Math.sin(ang) });
  }
  return out;
}

export function fillBlocks(data: OsmCityData, opt: FillOptions = {}): FillResult {
  const maxTanks = opt.maxTanks ?? 1100;
  const maxSigns = opt.maxSigns ?? 1400;
  const maxAcs = opt.maxAcs ?? 5000;
  const shapes: Shape[] = [];
  const pitched: Pitch[] = [];
  const decor: FillResult['decor'] = { tanks: [], sheds: [], acs: [], shopSigns: [] };
  const footprints: FillResult['footprints'] = [];
  const grid = new BoxGrid();
  for (const m of mappedBoxes(data)) grid.add(m);
  const roads = new RoadIndex(data);
  // candidate decor, thinned to the caps at the end (so the caps do not favour the first blocks)
  const tankC: { p: Decor['tanks'][number]; r: number }[] = [];
  const signC: { p: Decor['shopSigns'][number]; r: number }[] = [];
  const acC: { p: Decor['acs'][number]; r: number }[] = [];
  let n = 0;

  const box = (id: string, b: Obb, y0: number, h: number, color: string, look: number | undefined, variant: number, nocollide = false): BoxShape => {
    const s: BoxShape = { kind: 'box', id, p: [b.x, y0 + h / 2, b.z], size: [b.hl * 2, h, b.hw * 2], yaw: -Math.atan2(b.s, b.c), color };
    if (look !== undefined) s.look = encodeLook(look, variant);
    if (nocollide) s.nocollide = true;
    shapes.push(s);
    return s;
  };

  data.blocks.forEach((blk, bi) => {
    if (blk.park) return;
    const poly = blk.poly;
    const ring = poly[0];
    if (ring.length < 3) return;
    const area = ringArea(ring);
    if (Math.abs(area) < 60) return;
    const zone = zoneOf(blk);
    const downtown = blk.district === '前金區' || blk.district === '新興區' || blk.district === '苓雅區';
    const paint = PAINT[zone];
    const r = (...k: number[]) => hashN(bi, ...k);
    let placed = 0;

    /** try to place a box: inside the block, clear of everything placed */
    const polyF = poly.map(flatRing);
    const ringF = polyF[0];
    const fits = (b: Obb) => pointInFlat(b.x, b.z, ringF) && !grid.hits(b, 0.05) && obbInFlat(b, polyF);
    const commit = (b: Obb, front: boolean) => {
      grid.add(b);
      footprints.push({ b, block: bi, front });
      placed++;
    };

    // ---------- frontage rows, longest edges first (they claim the corners) ----------
    const edges: { a: XZ; b: XZ; L: number }[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L >= 4) edges.push({ a, b, L });
    }
    edges.sort((p, q) => q.L - p.L);
    const ccw = area > 0;
    let frontDepth = 0;
    edges.forEach((e, ei) => {
      const tx = (e.b[0] - e.a[0]) / e.L,
        tz = (e.b[1] - e.a[1]) / e.L;
      // inward normal: left of the edge on a counter-clockwise ring
      const nx = ccw ? -tz : tz,
        nz = ccw ? tx : -tx;
      const mx = (e.a[0] + e.b[0]) / 2,
        mz = (e.a[1] + e.b[1]) / 2;
      const rank = roads.rankAt(mx - nx * 2, mz - nz * 2, 16);
      // no street on this side (the coast, a rail line, the map's edge): no shop fronts
      if (!rank) return;
      const row = rowFor(zone, rank, downtown);
      const depth0 = row.depth[0] + r(ei, 1) * (row.depth[1] - row.depth[0]);
      frontDepth = Math.max(frontDepth, depth0);
      const SET = 0.4; // back from the sidewalk
      let u = 0.3;
      let li = 0;
      while (u < e.L - 3) {
        const k = ei * 100 + li;
        let w = row.lot[0] + r(k, 2) * (row.lot[1] - row.lot[0]);
        const rest = e.L - 0.3 - u;
        if (rest - w < row.lot[0] * 0.7) w = rest;
        if (w < 3.2) break;
        // try the full depth, then shallower lots (corners, narrow blocks)
        let done: Obb | null = null;
        for (const [f, wf] of [[1, 1], [0.7, 1], [0.5, 1], [1, 0.6]]) {
          const d = depth0 * f,
            ww = w * wf;
          if (d < 5 || ww < 3.2) continue;
          {
            const cu = u + ww / 2;
            const b: Obb = { x: e.a[0] + tx * cu + nx * (SET + d / 2), z: e.a[1] + tz * cu + nz * (SET + d / 2), hl: ww / 2, hw: d / 2, c: tx, s: tz };
            if (fits(b)) {
              done = b;
              break;
            }
          }
          if (done) break;
        }
        if (done) {
          commit(done, true);
          building(done, { nx: -nx, nz: -nz }, row, rank, k, true);
          u += done.hl * 2;
          // an alley between rows now and then
          if (r(k, 3) < row.alley) u += row.kind === 'shed' ? 3 : 1.5;
        } else u += Math.max(1.5, w * 0.5);
        li++;
      }
    });

    // ---------- the interior: back buildings on a grid, or an open courtyard ----------
    const longest = edges[0];
    // big open parcels (hill slopes, rail and dock land) keep their open middle; ports get sparse sheds
    const big = Math.abs(area) > 60000;
    if (longest && r(7) > (zone === 'old' ? 0.25 : 0.4) && (!big || zone === 'port')) {
      const tx = (longest.b[0] - longest.a[0]) / longest.L,
        tz = (longest.b[1] - longest.a[1]) / longest.L;
      let u0 = Infinity,
        u1 = -Infinity,
        v0 = Infinity,
        v1 = -Infinity;
      for (const [x, z] of ring) {
        const u = x * tx + z * tz,
          v = -x * tz + z * tx;
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
      const cw = zone === 'port' ? 30 : zone === 'down' ? 14 : 10,
        cd = zone === 'port' ? 16 : zone === 'down' ? 14 : 10;
      const gap = zone === 'port' ? (big ? 26 : 8) : 2;
      // only a band behind the frontage: the middle of a large block stays a yard
      const band = zone === 'port' ? 120 : 40;
      for (let u = u0 + 4; u + cw < u1 - 2; u += cw + gap)
        for (let v = v0 + 4; v + cd < v1 - 2; v += cd + gap) {
          const cu = u + cw / 2,
            cv = v + cd / 2;
          const b: Obb = { x: cu * tx - cv * tz, z: cu * tz + cv * tx, hl: cw / 2, hw: cd / 2, c: tx, s: tz };
          if (!pointInFlat(b.x, b.z, ringF) || distToRing(b.x, b.z, ring) > band || !fits(b)) continue;
          commit(b, false);
          building(b, null, rowFor(zone, 1, downtown), 1, 5000 + Math.round(u * 7 + v * 3), false);
        }
    }

    // ---------- every block of any size gets at least one building ----------
    if (!placed && longest) {
      const tx = (longest.b[0] - longest.a[0]) / longest.L,
        tz = (longest.b[1] - longest.a[1]) / longest.L;
      let cx = 0,
        cz = 0;
      for (const [x, z] of ring) {
        cx += x / ring.length;
        cz += z / ring.length;
      }
      search: for (const sz of [12, 9, 7, 5, 4]) {
        for (let dr = 0; dr <= 24; dr += 2)
          for (let a = 0; a < (dr ? 8 : 1); a++) {
            const x = cx + Math.cos((a * Math.PI) / 4) * dr,
              z = cz + Math.sin((a * Math.PI) / 4) * dr;
            const b: Obb = { x, z, hl: sz / 2, hw: Math.min(sz, 10) / 2, c: tx, s: tz };
            if (!fits(b)) continue;
            commit(b, true);
            building(b, null, rowFor(zone, 1, downtown), 1, 9000, true);
            break search;
          }
      }
    }

    /** the building on a lot: base box (collider), upper volumes, balconies, roofs and decor */
    function building(b: Obb, face: { nx: number; nz: number } | null, row: Row, rank: number, k: number, front: boolean) {
      const color = paint[Math.floor(r(k, 10) * paint.length)];
      const id = `f${n++}`;
      const tx = b.c,
        tz = b.s;
      const fx = face ? b.x + face.nx * b.hw : 0,
        fz = face ? b.z + face.nz * b.hw : 0;
      if (row.kind === 'shed') {
        const H = 7 + r(k, 11) * 4;
        box(id, b, 0, H, color, LOOK_WAREHOUSE, r(k, 12));
        // pitched roof only where the row is near an axis (the roof mesh is axis-aligned)
        const ang = Math.atan2(tz, tx);
        const ax = Math.abs(Math.sin(ang)) < 0.06 ? 'x' : Math.abs(Math.cos(ang)) < 0.06 ? 'z' : null;
        const t = r(k, 13);
        if (ax && t < 0.75) {
          const w = ax === 'x' ? b.hl * 2 : b.hw * 2,
            d = ax === 'x' ? b.hw * 2 : b.hl * 2;
          pitched.push({ x: b.x, z: b.z, w, d, y: H, rise: t < 0.4 ? 1.5 + r(k, 14) : 2.2 + r(k, 14) * 0.6, axis: ax, teeth: t < 0.4 ? 0 : Math.max(3, Math.round(b.hl / 3)), wall: color, roof: SHEET[Math.floor(r(k, 15) * SHEET.length)] });
        } else if (r(k, 16) < 0.3) decor.sheds.push(shedOn(b, H, k));
        return;
      }
      if (row.kind === 'mid') {
        // downtown on a big road: a mid-rise block, or a podium with a tower set back from the street
        const tower = r(k, 20) < 0.3 && b.hl * 2 >= 16 && b.hw * 2 >= 13;
        if (tower && face) {
          const podN = 2 + (r(k, 21) < 0.5 ? 1 : 0);
          const podH = storeys(LOOK_TOWER, podN);
          box(id, b, 0, podH, color, LOOK_TOWER, r(k, 22));
          const tw = Math.max(10, b.hl * 2 * (0.55 + r(k, 23) * 0.2)),
            td = Math.max(9, b.hw * 2 - 4);
          const back = (b.hw * 2 - td) / 2; // set back from the street face
          const t: Obb = { x: b.x - face.nx * back * 0.8 + tx * (r(k, 24) - 0.5) * (b.hl * 2 - tw), z: b.z - face.nz * back * 0.8 + tz * (r(k, 24) - 0.5) * (b.hl * 2 - tw), hl: tw / 2, hw: td / 2, c: tx, s: tz };
          const T = storeys(LOOK_TOWER, 10 + Math.floor(r(k, 25) * 16));
          box(`${id}t`, t, podH - 0.3, T - podH + 0.3, color, LOOK_TOWER, r(k, 26), true);
          // a mechanical penthouse on top
          box(`${id}p`, { ...t, hl: t.hl * 0.4, hw: t.hw * 0.4 }, T - 0.1, 3.4, '#8C959D', LOOK_WAREHOUSE, r(k, 27), true);
        } else {
          const N = 6 + Math.floor(r(k, 21) * 7);
          const look = r(k, 28) < 0.75 ? LOOK_TOWER : LOOK_HALL;
          const H = storeys(look, N);
          box(id, b, 0, H, color, look, r(k, 22));
          if (face) acsOn(face, fx, fz, tx, tz, b.hl * 2, H, k, look === LOOK_TOWER ? 0 : 3);
          roofDecor(b, H, k, false);
        }
        return;
      }
      // houses (透天厝 / walk-ups / shophouses)
      const nMin = zone === 'down' ? 4 : 3,
        nMax = zone === 'down' ? 7 : zone === 'shop' ? 6 : 5;
      const N = front ? nMin + Math.floor(r(k, 30) * (nMax - nMin + 1)) : 2 + Math.floor(r(k, 30) * 3);
      const setback = front && face && N >= 4 && r(k, 31) < 0.4;
      const bn = setback ? N - 1 : N;
      const H = storeys(LOOK_HOUSE, bn);
      box(id, b, 0, H, color, LOOK_HOUSE, r(k, 32));
      let top = H;
      let roofBox = b;
      if (setback && face) {
        // the top floor steps back from the street, leaving a terrace in front
        const sf = 1.6 + r(k, 33) * 1.6;
        const up: Obb = { ...b, x: b.x - face.nx * sf / 2, z: b.z - face.nz * sf / 2, hw: b.hw - sf / 2 };
        top = storeys(LOOK_HOUSE, N);
        box(`${id}u`, up, H - 0.5, top - H + 0.5, color, LOOK_HOUSE, r(k, 32), true);
        roofBox = up;
      }
      if (face) {
        const balc = bn >= 3 && rank >= 2 && r(k, 34) < 0.25;
        if (balc) {
          // concrete balconies with a solid parapet, one per upper floor
          for (let f = 1; f < bn; f++) {
            const s: Obb = { x: fx + face.nx * 0.5, z: fz + face.nz * 0.5, hl: Math.max(1, b.hl - 0.4), hw: 0.5, c: tx, s: tz };
            box(`${id}b${f}`, s, storeys(LOOK_HOUSE, f) - 0.5, 1.1, BALCONY, undefined, 0, true);
          }
        }
        // shophouses: an arcade canopy over the pavement at the shop level
        if (zone === 'shop' && r(k, 35) < 0.55) box(`${id}c`, { x: fx + face.nx * 0.7, z: fz + face.nz * 0.7, hl: b.hl - 0.15, hw: 0.7, c: tx, s: tz }, 3.6, 0.3, CANOPY, undefined, 0, true);
        // vertical shop signs on the shopping streets
        const signP = zone === 'shop' ? 0.7 : rank >= 3 ? 0.5 : rank >= 2 ? 0.3 : 0.12;
        if (!balc && H >= 7 && r(k, 36) < signP) {
          const t = (r(k, 37) - 0.5) * Math.max(0, b.hl * 2 - 2);
          signC.push({ r: r(k, 38), p: { x: fx + tx * t + face.nx * 0.65, y: 5.2 + r(k, 39) * 1.2, z: fz + tz * t + face.nz * 0.65, yaw: Math.atan2(tx, tz), word: Math.floor(r(k, 40) * SHOP_WORDS.length), color: Math.floor(r(k, 41) * SIGN_COLORS.length) } });
        }
        if (!balc) acsOn(face, fx, fz, tx, tz, b.hl * 2, H, k, bn - 1);
      }
      roofDecor(roofBox, top, k, zone === 'old' || zone === 'res');
    }

    function acsOn(face: { nx: number; nz: number }, fx: number, fz: number, tx: number, tz: number, len: number, H: number, k: number, floors: number) {
      if (floors <= 0 || H < 6) return;
      const count = r(k, 50) < 0.45 ? 0 : len < 8 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const fl = Math.floor(r(k, 51, i) * floors);
        const t = (r(k, 52, i) - 0.5) * (len - 1.6);
        acC.push({ r: r(k, 53, i), p: { x: fx + tx * t + face.nx * 0.24, y: 3.6 + fl * 3 + 0.5, z: fz + tz * t + face.nz * 0.24, yaw: Math.atan2(face.nx, face.nz) } });
      }
    }

    function shedOn(b: Obb, y: number, k: number) {
      // the decor draws sheds axis-aligned: a square small enough to stay on a rotated roof
      const s = Math.min(b.hl, b.hw) * 2 * 0.5;
      const off = (r(k, 60) - 0.5) * Math.max(0, b.hl * 2 - s * 1.5);
      return { x: b.x + b.c * off, y, z: b.z + b.s * off, w: s, d: s, h: 2.4, color: SHED[Math.floor(r(k, 61) * SHED.length)] };
    }

    function roofDecor(b: Obb, y: number, k: number, sheds: boolean) {
      if (Math.min(b.hl, b.hw) * 2 >= 3.2) tankC.push({ r: r(k, 62), p: { x: b.x + b.c * (r(k, 63) - 0.5) * Math.max(0, b.hl * 2 - 2.6), y, z: b.z + b.s * (r(k, 63) - 0.5) * Math.max(0, b.hl * 2 - 2.6) } });
      if (sheds && Math.min(b.hl, b.hw) * 2 >= 4 && r(k, 64) < 0.3) decor.sheds.push(shedOn(b, y, k));
    }
  });

  const thin = <T>(c: { p: T; r: number }[], max: number) => (c.length <= max ? c.map((x) => x.p) : c.filter((x) => x.r < max / c.length).map((x) => x.p));
  decor.tanks = thin(tankC, maxTanks);
  decor.shopSigns = thin(signC, maxSigns);
  decor.acs = thin(acC, maxAcs);
  return { shapes, pitched, decor, footprints };
}
