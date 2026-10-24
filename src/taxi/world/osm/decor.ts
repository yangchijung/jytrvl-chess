// Rush Taxi — street furniture for the real-map city, as plain data (no Three.js), from the OpenStreetMap data:
// - street lamps on the kerbs, spaced by road class;
// - rows of parked scooters on the sidewalks of the old districts (鹽埕、三民、新興、苓雅), clear of stops,
//   crossings and junction corners;
// - palms along the Love River banks and the harbour edge;
// - painted kerbs: red near junctions, yellow on the busy roads, grey on the rest;
// - Love River cruise boats that follow the river's centre line;
// - 路名牌: green street-name boards (zh above, en below) at the junctions of the bigger roads, real names;
// - the light rail (環狀輕軌): rails on the road, or on a grass bed with low trackside posts.
//
// Nothing here stands on a carriageway or in the water (tests/taxi-osm-decor.test.ts checks it). The light rail is
// the exception by design: its rails lie on the road where the line runs in the street.
// `addOsmDecor(level)` merges all of it into `level.decor` (creating it when another step has not).
import type { Decor, Level } from '../level';
import type { Place, Spot } from '../../gameplay/rules';
import { RANK, type OsmCityData, type OsmRoad, type Ring, type XZ } from './data';

export type StreetSign = NonNullable<Decor['streetSigns']>[number];
export type RailDecor = NonNullable<Decor['rail']>;

/** deterministic hash → [0, 1) */
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

function pointInRing(x: number, z: number, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax,
    vz = bz - az;
  const L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
  return Math.hypot(x - ax - vx * t, z - az - vz * t);
}
function ringArea(r: Ring) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x, z] = r[i];
    const [x2, z2] = r[(i + 1) % r.length];
    a += x * z2 - x2 * z;
  }
  return Math.abs(a / 2);
}
function polyLen(pts: XZ[]) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}
/** point and unit direction at distance `s` along a polyline */
function at(pts: XZ[], s: number) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= s || i === pts.length - 2) {
      const t = L ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: L ? (bx - ax) / L : 1, dz: L ? (bz - az) / L : 0 };
    }
    acc += L;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}

/** points in a grid of 16 m cells: "is there one within r of (x, z)?" without scanning them all */
class PointGrid {
  private cells = new Map<number, XZ[]>();
  private readonly C = 16;
  constructor(pts: XZ[] = []) {
    for (const p of pts) this.add(p[0], p[1]);
  }
  add(x: number, z: number) {
    const k = Math.floor(x / this.C) * 100003 + Math.floor(z / this.C);
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push([x, z]);
  }
  near(x: number, z: number, r: number) {
    const c0 = Math.floor((x - r) / this.C),
      c1 = Math.floor((x + r) / this.C),
      d0 = Math.floor((z - r) / this.C),
      d1 = Math.floor((z + r) / this.C);
    for (let cx = c0; cx <= c1; cx++)
      for (let cz = d0; cz <= d1; cz++) for (const [px, pz] of this.cells.get(cx * 100003 + cz) ?? []) if (Math.hypot(px - x, pz - z) < r) return true;
    return false;
  }
}

/** sidewalk width beside a road (as scripts/osm/build_city.py cuts it) */
export const walkWidth = (r: OsmRoad) => (RANK[r.cls] <= 2 ? 2.5 : 3.5);

/** a grid of road segments for fast "is this on a carriageway / on a sidewalk" questions */
export class RoadIndex {
  private cells = new Map<number, number[]>();
  private segs: { ax: number; az: number; bx: number; bz: number; hw: number; ww: number; ri: number }[] = [];
  private readonly C = 24;
  constructor(roads: OsmRoad[]) {
    roads.forEach((r, ri) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const id = this.segs.length;
        const hw = r.w / 2;
        this.segs.push({ ax, az, bx, bz, hw, ww: walkWidth(r), ri });
        // every cell within hw + 6 m of the segment (sampled every 4 m along it)
        const m = hw + 6 + 4;
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(L / 4));
        const done = new Set<number>();
        for (let t = 0; t <= n; t++) {
          const px = ax + ((bx - ax) * t) / n,
            pz = az + ((bz - az) * t) / n;
          for (let cx = Math.floor((px - m) / this.C); cx <= Math.floor((px + m) / this.C); cx++)
            for (let cz = Math.floor((pz - m) / this.C); cz <= Math.floor((pz + m) / this.C); cz++) {
              const k = cx * 100003 + cz;
              if (done.has(k)) continue;
              done.add(k);
              (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(id);
            }
        }
      }
    });
  }
  private near(x: number, z: number) {
    return this.cells.get(Math.floor(x / this.C) * 100003 + Math.floor(z / this.C)) ?? [];
  }
  /** how far (x, z) is outside the nearest carriageway edge (negative = on the asphalt); capped at 6 */
  clearance(x: number, z: number) {
    let best = 6;
    for (const id of this.near(x, z)) {
      const s = this.segs[id];
      best = Math.min(best, segDist(x, z, s.ax, s.az, s.bx, s.bz) - s.hw);
    }
    return best;
  }
  /** is (x, z) on a sidewalk band (outside every carriageway, inside some road's sidewalk)? */
  onWalk(x: number, z: number) {
    let walk = false;
    for (const id of this.near(x, z)) {
      const s = this.segs[id];
      const d = segDist(x, z, s.ax, s.az, s.bx, s.bz);
      if (d < s.hw) return false;
      if (d < s.hw + s.ww) walk = true;
    }
    return walk;
  }
}

/** the water polygons: inside tests and distance to the nearest bank, with the edges in a grid of 16 m cells (a
 * cell without edges is all water or all land: its answer is worked out once) */
export class WaterIndex {
  private polys: { poly: Ring[]; x0: number; z0: number; x1: number; z1: number }[];
  private edges = new Map<number, number[]>();
  private segs: number[] = [];
  private inside = new Map<number, boolean>();
  private readonly C = 16;
  constructor(water: OsmCityData['water']) {
    this.polys = water.map((poly) => {
      let x0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        z1 = -Infinity;
      for (const [x, z] of poly[0]) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
      for (const ring of poly)
        for (let i = 0; i < ring.length; i++) {
          const [ax, az] = ring[i];
          const [bx, bz] = ring[(i + 1) % ring.length];
          const id = this.segs.length;
          this.segs.push(ax, az, bx, bz);
          // every cell the edge passes through, plus one cell round it (so a cell's neighbourhood is complete)
          const done = new Set<number>();
          const L = Math.hypot(bx - ax, bz - az);
          const n = Math.max(1, Math.ceil(L / (this.C / 4)));
          for (let t = 0; t <= n; t++) {
            const px = Math.floor((ax + ((bx - ax) * t) / n) / this.C),
              pz = Math.floor((az + ((bz - az) * t) / n) / this.C);
            for (let cx = px - 1; cx <= px + 1; cx++)
              for (let cz = pz - 1; cz <= pz + 1; cz++) {
                const k = cx * 100003 + cz;
                if (done.has(k)) continue;
                done.add(k);
                (this.edges.get(k) ?? this.edges.set(k, []).get(k)!).push(id);
              }
          }
        }
      return { poly, x0, z0, x1, z1 };
    });
  }
  private exact(x: number, z: number) {
    for (const p of this.polys) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1 || !pointInRing(x, z, p.poly[0])) continue;
      let hole = false;
      for (let h = 1; h < p.poly.length; h++) if (pointInRing(x, z, p.poly[h])) hole = true;
      if (!hole) return true;
    }
    return false;
  }
  inWater(x: number, z: number) {
    const cx = Math.floor(x / this.C),
      cz = Math.floor(z / this.C);
    const k = cx * 100003 + cz;
    if (this.edges.has(k)) return this.exact(x, z);
    let v = this.inside.get(k);
    if (v === undefined) this.inside.set(k, (v = this.exact((cx + 0.5) * this.C, (cz + 0.5) * this.C)));
    return v;
  }
  /** distance to the nearest water edge (up to `max`) */
  bankDist(x: number, z: number, max = 8) {
    let best = max;
    const r = Math.ceil((max + this.C / 4) / this.C); // (the edges are sampled every C/4)
    const cx = Math.floor(x / this.C),
      cz = Math.floor(z / this.C);
    const S = this.segs;
    for (let i = cx - r + 1; i <= cx + r - 1; i++)
      for (let j = cz - r + 1; j <= cz + r - 1; j++)
        for (const id of this.edges.get(i * 100003 + j) ?? []) {
          const o = id * 4;
          const d = segDist(x, z, S[o], S[o + 1], S[o + 2], S[o + 3]);
          if (d < best) best = d;
        }
    return best;
  }
  /** in the water, or closer than `m` to it */
  wet(x: number, z: number, m: number) {
    return this.inWater(x, z) || this.bankDist(x, z, m) < m;
  }
}

/** the Love River: the water polygon that the river-bank roads (河東路、河西路) follow; else the second biggest */
export function loveRiver(data: OsmCityData) {
  const bank = data.roads.filter((r) => r.name === '河東路' || r.name === '河西路').flatMap((r) => r.pts);
  let best = -1,
    score = 0;
  data.water.forEach((p, i) => {
    let n = 0;
    for (const [x, z] of bank) if (p[0].some(([a, b]) => Math.abs(a - x) < 60 && Math.abs(b - z) < 60)) n++;
    if (n > score) (score = n), (best = i);
  });
  if (best < 0) {
    const byArea = data.water.map((p, i) => [ringArea(p[0]), i]).sort((a, b) => b[0] - a[0]);
    best = byArea[1]?.[1] ?? -1;
  }
  return best;
}
/** the harbour: the biggest water polygon */
export function harbour(data: OsmCityData) {
  let best = -1,
    area = 0;
  data.water.forEach((p, i) => {
    const a = ringArea(p[0]);
    if (a > area) (area = a), (best = i);
  });
  return best;
}

/**
 * The centre line of a long, thin water polygon: split its ring at the two vertices farthest apart (the two ends),
 * walk one bank and take the midpoint to the nearest point on the other bank, smooth it, and keep the longest run
 * that stays `clear` metres from both banks.
 */
export function riverCentre(ring: Ring, water: WaterIndex, clear = 4): XZ[] {
  const n = ring.length;
  if (n < 4) return [];
  let bi = 0,
    bj = 0,
    bd = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
      if (d > bd) (bd = d), (bi = i), (bj = j);
    }
  const A: XZ[] = [];
  for (let k = bi; k !== bj; k = (k + 1) % n) A.push(ring[k]);
  A.push(ring[bj]);
  const B: XZ[] = [];
  for (let k = bj; k !== bi; k = (k + 1) % n) B.push(ring[k]);
  B.push(ring[bi]);
  const LA = polyLen(A);
  const mids: XZ[] = [];
  for (let s = 0; s <= LA; s += 8) {
    const p = at(A, s);
    let best = Infinity,
      qx = 0,
      qz = 0;
    for (let i = 0; i < B.length - 1; i++) {
      const [ax, az] = B[i];
      const [bx, bz] = B[i + 1];
      const vx = bx - ax,
        vz = bz - az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.z - az) * vz) / L2));
      const d = Math.hypot(p.x - ax - vx * t, p.z - az - vz * t);
      if (d < best) (best = d), (qx = ax + vx * t), (qz = az + vz * t);
    }
    mids.push([(p.x + qx) / 2, (p.z + qz) / 2]);
  }
  // smooth (moving average over 5 points)
  const sm: XZ[] = mids.map((_, i) => {
    let sx = 0,
      sz = 0,
      c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(mids.length - 1, i + 2); k++) (sx += mids[k][0]), (sz += mids[k][1]), c++;
    return [sx / c, sz / c];
  });
  return longestRun(sm, (x, z) => water.inWater(x, z) && water.bankDist(x, z, clear + 1) >= clear);
}
/** the longest run of consecutive points that pass `ok` */
function longestRun(pts: XZ[], ok: (x: number, z: number) => boolean) {
  let best: XZ[] = [],
    cur: XZ[] = [];
  for (const p of pts) {
    if (ok(p[0], p[1])) {
      cur.push(p);
      if (cur.length > best.length) best = cur;
    } else cur = [];
  }
  return best;
}
/** a polyline moved sideways by `off` (+ = to the right of travel in x-east/z-south: (−dz, dx)) */
function offsetLine(pts: XZ[], off: number): XZ[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / L) * off, p[1] + (dx / L) * off];
  });
}

/** one English name per street, as the boards print it: the most used OSM spelling, words capitalised, Rd./St. */
export function boardNames(data: OsmCityData) {
  const votes = new Map<string, Map<string, number>>();
  for (const r of data.roads) {
    if (!r.name) continue;
    const m = votes.get(r.name) ?? votes.set(r.name, new Map()).get(r.name)!;
    if (r.en) m.set(r.en, (m.get(r.en) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const [zh, m] of votes) {
    const en = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (en) out.set(zh, shortEn(en));
  }
  return out;
}
export function shortEn(en: string) {
  return en
    .trim()
    .replace(/\.+$/, '')
    .split(/\s+/)
    .map((w) => (/^\d/.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .replace(/\bRoad$/, 'Rd.')
    .replace(/\bStreet$/, 'St.')
    .replace(/\bBoulevard$/, 'Blvd.')
    .replace(/\bAvenue$/, 'Ave.');
}

export interface OsmDecorOpts {
  stops?: Spot[];
  places?: Place[];
  /** most street-name boards (two per junction) */
  maxBoards?: number;
}
export interface OsmDecor {
  lamps: Decor['lamps'];
  scooters: Decor['scooters'];
  palms: Decor['palms'];
  curbs: Decor['curbs'];
  boats: Decor['boats'];
  streetSigns: StreetSign[];
  rail: RailDecor;
}

/** the districts where scooters line the sidewalks */
export const SCOOTER_DISTRICTS = ['鹽埕區', '三民區', '新興區', '苓雅區'];
const SCOOT = ['#E53935', '#FFFFFF', '#1E88E5', '#212121', '#FDD835', '#90A4AE', '#8E24AA', '#43A047'];
export const KERB = { red: '#C62828', yellow: '#E2B227', grey: '#B9BDC2' } as const;
/** lamp spacing along a road by rank (m) */
const LAMP_STEP: Record<number, number> = { 5: 34, 4: 38, 3: 60, 2: 100, 1: 150 };

export function osmDecor(data: OsmCityData, opts: OsmDecorOpts = {}): OsmDecor {
  const roads = new RoadIndex(data.roads);
  const water = new WaterIndex(data.water);
  const [bx0, bz0, bx1, bz1] = data.bounds;
  const inMap = (x: number, z: number, m = 4) => x > bx0 + m && x < bx1 - m && z > bz0 + m && z < bz1 - m;
  const keep = (x: number, z: number, roadM: number, waterM: number) => inMap(x, z) && roads.clearance(x, z) >= roadM && !water.wet(x, z, waterM);

  // junctions: how many road pieces meet at each node, and the widest one
  const deg = new Map<number, number>();
  const wide = new Map<number, number>();
  for (const r of data.roads)
    for (const n of [r.a, r.b]) {
      deg.set(n, (deg.get(n) ?? 0) + 1);
      wide.set(n, Math.max(wide.get(n) ?? 0, r.w));
    }
  const isJunction = (n: number) => (deg.get(n) ?? 0) >= 3;
  /** how far from a junction node the corner (sidewalk round the crossing road) reaches */
  const cornerR = (n: number) => (wide.get(n) ?? 0) / 2 + 3.5;
  const junctions = new PointGrid([...deg.keys()].filter(isJunction).map((n) => data.nodes[n]));
  const nearJunction = (x: number, z: number, r: number) => junctions.near(x, z, r);
  const kerbPts = new PointGrid([...(opts.stops ?? []), ...(opts.places ?? [])].map((s): XZ => [s.cx ?? s.x, s.cz ?? s.z]));
  const nearStop = (x: number, z: number, r: number) => kerbPts.near(x, z, r);
  const lampGrid = new PointGrid();
  const palmGrid = new PointGrid();

  const lamps: Decor['lamps'] = [];
  const scooters: Decor['scooters'] = [];
  const curbs: Decor['curbs'] = [];
  const palms: Decor['palms'] = [];

  // ---------- districts of each road (by its middle) ----------
  const districtOf = (x: number, z: number) => data.districts.find((d) => d.poly.some((p) => pointInRing(x, z, p[0])))?.zh;

  data.roads.forEach((r, ri) => {
    if (r.bridge) return;
    const L = polyLen(r.pts);
    if (L < 6) return;
    const rank = RANK[r.cls];
    const hw = r.w / 2;
    const ww = walkWidth(r);
    // the part of the road between the junction corners
    const s0 = isJunction(r.a) ? cornerR(r.a) : 0;
    const s1 = L - (isJunction(r.b) ? cornerR(r.b) : 0);
    if (s1 - s0 < 2) return;
    const sides = [1, -1];

    // ---------- kerbs: one box per straight piece (≤ 24 m), red for 10 m before a junction ----------
    if (rank >= 3) {
      for (const side of sides) {
        let s = s0;
        while (s < s1 - 0.5) {
          const redEnd = isJunction(r.a) ? s0 + 10 : -Infinity;
          const redStart = isJunction(r.b) ? s1 - 10 : Infinity;
          // cut at the polyline's vertices and at the colour changes
          let e = Math.min(s1, s + 24);
          let acc = 0;
          for (let i = 0; i < r.pts.length - 1; i++) {
            acc += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
            if (acc > s + 0.3 && acc < e) {
              e = acc;
              break;
            }
          }
          if (s < redEnd && e > redEnd) e = redEnd;
          if (s < redStart && e > redStart) e = redStart;
          const m = at(r.pts, (s + e) / 2);
          const off = (hw + 0.13) * side;
          const x = m.x - m.dz * off,
            z = m.z + m.dx * off;
          const len = e - s;
          const red = (s + e) / 2 < redEnd || (s + e) / 2 > redStart;
          const ends = [at(r.pts, s + 0.2), at(r.pts, e - 0.2)].map((p) => [p.x - p.dz * off, p.z + p.dx * off]);
          if (len > 0.6 && keep(x, z, 0.05, 0.3) && ends.every(([ex, ez]) => roads.clearance(ex, ez) >= 0)) {
            curbs.push({ x, z, w: len, d: 0.26, color: red ? KERB.red : rank >= 4 ? KERB.yellow : KERB.grey, yaw: -Math.atan2(m.dz, m.dx) });
          }
          s = e;
        }
      }
    }

    // ---------- lamps: on the kerb, arm over the road ----------
    const step = LAMP_STEP[rank] ?? 60;
    const lampSides = rank >= 3 ? sides : [ri % 2 ? 1 : -1];
    for (const side of lampSides) {
      const start = s0 + 4 + (side < 0 ? step / 2 : 0) + hash(ri, side) * 6;
      for (let s = start; s < s1 - 4; s += step) {
        const p = at(r.pts, s);
        const off = (hw + 0.55) * side;
        const x = p.x - p.dz * off,
          z = p.z + p.dx * off;
        if (!keep(x, z, 0.4, 1) || nearStop(x, z, 3.5) || nearJunction(x, z, 5)) continue;
        lampGrid.add(x, z);
        // the arm points at the road: towards −side × the right-hand normal
        lamps.push({ x, z, yaw: Math.atan2(p.dz * side, -p.dx * side) });
      }
    }

    // ---------- scooters: rows on the sidewalk, nose to the kerb, in the old districts ----------
    if (rank <= 4 && L > 24) {
      const mid = at(r.pts, L / 2);
      const dz = districtOf(mid.x, mid.z);
      if (dz && SCOOTER_DISTRICTS.includes(dz)) {
        const a = (isJunction(r.a) ? cornerR(r.a) + 6 : 3) + 1,
          b = L - (isJunction(r.b) ? cornerR(r.b) + 6 : 3) - 1;
        for (const side of r.oneway || rank >= 3 ? sides : [ri % 2 ? 1 : -1]) {
          if (hash(ri, side, 1) < (rank >= 4 ? 0.82 : 0.76)) continue;
          let s = a + hash(ri, side, 2) * 6;
          while (s < b) {
            const run = 3 + hash(ri, side, s, 3) * 6;
            for (let t = s; t < Math.min(b, s + run); t += 0.9) {
              if (hash(ri, side, Math.round(t * 10)) < 0.18) continue; // a gap here and there
              const p = at(r.pts, t);
              const off = (hw + Math.min(ww - 0.8, 1.25)) * side;
              const x = p.x - p.dz * off,
                z = p.z + p.dx * off;
              // the nose and the tail must be on the sidewalk too
              const nose = [x + p.dz * 0.7 * side, z - p.dx * 0.7 * side],
                tail = [x - p.dz * 0.7 * side, z + p.dx * 0.7 * side];
              if (!keep(x, z, 0.4, 1) || roads.clearance(nose[0], nose[1]) < 0.15 || roads.clearance(tail[0], tail[1]) < 0.15) continue;
              if (nearStop(x, z, 5) || nearJunction(x, z, 10) || lampGrid.near(x, z, 1.2)) continue;
              scooters.push({ x, z, yaw: Math.atan2(p.dz * side, -p.dx * side), color: SCOOT[Math.floor(hash(ri, side, t, 4) * SCOOT.length)] });
            }
            s += run + 30 + hash(ri, side, s, 5) * 40;
          }
        }
      }
    }
  });

  // ---------- palms: along the Love River banks and the harbour edge, a few metres inland ----------
  const parkBlocks = data.blocks.filter((b) => b.park);
  const otherBlocks = data.blocks.filter((b) => !b.park);
  const box = (b: (typeof data.blocks)[number]) => {
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    for (const [x, z] of b.poly[0]) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    return { b, x0, z0, x1, z1 };
  };
  const parkBoxes = parkBlocks.map(box),
    otherBoxes = otherBlocks.map(box);
  const inBlock = (x: number, z: number, list: ReturnType<typeof box>[]) =>
    list.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && pointInRing(x, z, q.b.poly[0]) && q.b.poly.slice(1).every((h) => !pointInRing(x, z, h)));
  const buildings = data.buildings.map((b) => b.obb);
  const inBuilding = (x: number, z: number, m: number) =>
    buildings.some(([cx, cz, L, W, ang]) => {
      const dx = x - cx,
        dz = z - cz;
      if (Math.abs(dx) > L + W || Math.abs(dz) > L + W) return false;
      const u = dx * Math.cos(ang) + dz * Math.sin(ang),
        v = -dx * Math.sin(ang) + dz * Math.cos(ang);
      return Math.abs(u) < L / 2 + m && Math.abs(v) < W / 2 + m;
    });
  const river = loveRiver(data);
  const port = harbour(data);
  for (const [wi, step, inland] of [
    [river, 15, 3.2],
    [port, 20, 3.6],
  ] as const) {
    if (wi < 0) continue;
    for (const ring of data.water[wi]) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1) continue;
        // the map edge is not a bank
        if (!inMap(ax, az, 3) && !inMap(bx, bz, 3)) continue;
        const ux = (bx - ax) / L,
          uz = (bz - az) / L;
        for (let s = (hash(ax, az) * step) % L; s < L; s += step) {
          for (const side of [1, -1]) {
            const x = ax + ux * s - uz * inland * side,
              z = az + uz * s + ux * inland * side;
            if (water.inWater(x, z)) continue;
            // on a sidewalk, in a park, or on open land; never in a building plot
            if (!keep(x, z, 1.2, 2.2) || nearStop(x, z, 4) || nearJunction(x, z, 6) || palmGrid.near(x, z, 6)) continue;
            if (!(roads.onWalk(x, z) || inBlock(x, z, parkBoxes) || !inBlock(x, z, otherBoxes)) || inBuilding(x, z, 1.5)) continue;
            palmGrid.add(x, z);
            palms.push({ x, z, h: 6.5 + hash(x, z, 9) * 3 });
          }
        }
      }
    }
  }

  // ---------- Love River boats: three lanes along the centre line, going back and forth ----------
  const boats: Decor['boats'] = [];
  if (river >= 0) {
    // (the river alone: at its mouth the lanes must not run on into the harbour)
    const riverWater = new WaterIndex([data.water[river]]);
    const centre = riverCentre(data.water[river][0], riverWater, 4);
    const lanes: [number, number, string][] = [
      [-6, 3.4, '#E53935'],
      [0, 2.8, '#FFB300'],
      [6, 3.8, '#1E88E5'],
    ];
    lanes.forEach(([off, speed, color], k) => {
      const path = longestRun(offsetLine(centre, off), (x, z) => riverWater.inWater(x, z) && riverWater.bankDist(x, z, 4) >= 3);
      if (path.length < 6 || polyLen(path) < 120) return;
      // x0/x1/z keep the straight-line fields meaningful for code that reads them (start and end of the path)
      boats.push({ z: path[0][1], x0: path[0][0], x1: path[path.length - 1][0], speed, color, path, phase: (k * 0.37 + 0.15) % 1 });
    });
  }

  // ---------- 路名牌: at junctions of two named roads of rank ≥ 3 ----------
  const names = boardNames(data);
  const streetSigns: StreetSign[] = [];
  {
    type Arm = { zh: string; en: string; dx: number; dz: number; w: number; rank: number };
    const arms = new Map<number, Arm[]>();
    for (const r of data.roads) {
      if (!r.name || r.bridge || RANK[r.cls] < 3 || r.pts.length < 2) continue;
      for (const end of [0, 1]) {
        const n = end ? r.b : r.a;
        if (!isJunction(n)) continue;
        const p0 = end ? r.pts[r.pts.length - 1] : r.pts[0];
        const p1 = end ? r.pts[r.pts.length - 2] : r.pts[1];
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        (arms.get(n) ?? arms.set(n, []).get(n)!).push({ zh: r.name, en: names.get(r.name) ?? '', dx: (p1[0] - p0[0]) / L, dz: (p1[1] - p0[1]) / L, w: r.w, rank: RANK[r.cls] });
      }
    }
    const cands: { n: number; a: Arm; b: Arm; score: number }[] = [];
    for (const [n, list] of arms) {
      const byName = new Map<string, Arm>();
      for (const a of list) if (!byName.has(a.zh) || byName.get(a.zh)!.rank < a.rank) byName.set(a.zh, a);
      const two = [...byName.values()].sort((p, q) => q.rank - p.rank || q.w - p.w);
      if (two.length < 2 || !two[0].en || !two[1].en) continue;
      // the two must cross, not run on in the same line
      const [a, b] = two;
      if (Math.abs(a.dx * b.dz - a.dz * b.dx) < 0.5) continue;
      cands.push({ n, a, b, score: a.rank + b.rank + hash(n) * 0.5 });
    }
    cands.sort((p, q) => q.score - p.score);
    const maxBoards = opts.maxBoards ?? 250;
    const taken: XZ[] = [];
    for (const c of cands) {
      if (streetSigns.length * 2 + 2 > maxBoards) break;
      const [nx, nz] = data.nodes[c.n];
      if (taken.some(([x, z]) => Math.hypot(x - nx, z - nz) < 75)) continue;
      // a corner: clear of both carriageways, on the sidewalk (try the four corners)
      let spot: XZ | null = null;
      let dir = [1, 1];
      for (const [sa, sb] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        for (const extra of [1.2, 2.0, 3.0]) {
          // along arm A far enough to clear road B, along arm B far enough to clear road A
          const x = nx + sa * c.a.dx * (c.b.w / 2 + extra) + sb * c.b.dx * (c.a.w / 2 + extra),
            z = nz + sa * c.a.dz * (c.b.w / 2 + extra) + sb * c.b.dz * (c.a.w / 2 + extra);
          if (keep(x, z, 0.6, 1.5) && roads.onWalk(x, z) && !nearStop(x, z, 3)) {
            spot = [x, z];
            dir = [sa, sb];
            break;
          }
        }
        if (spot) break;
      }
      if (!spot) continue;
      taken.push([nx, nz]);
      // each board lies along its own road (read by the traffic on the cross street); yaw = the face normal
      // (cos yaw, −sin yaw) runs along the board: away from the junction, so the board hangs over its own sidewalk
      const yawOf = (a: Arm, sgn: number) => Math.atan2(-a.dz * sgn, a.dx * sgn);
      streetSigns.push({
        x: spot[0],
        z: spot[1],
        boards: [
          { zh: c.a.zh, en: c.a.en, yaw: yawOf(c.a, dir[0]), y: 4.6 },
          { zh: c.b.zh, en: c.b.en, yaw: yawOf(c.b, dir[1]), y: 3.65 },
        ],
      });
    }
  }

  // ---------- light rail: rails on the road, or a grass bed with low trackside posts ----------
  const rail: RailDecor = { pieces: [], poles: [] };
  data.rail.forEach((line, li) => {
    const L = polyLen(line);
    if (L < 2) return;
    const n = Math.max(1, Math.ceil(L / 8));
    for (let k = 0; k < n; k++) {
      const s = (L * k) / n,
        e = (L * (k + 1)) / n;
      const a = at(line, s),
        b = at(line, e);
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2;
      if (water.inWater(mx, mz) || water.inWater(a.x, a.z) || water.inWater(b.x, b.z) || !inMap(mx, mz, 1)) continue;
      const cl = roads.clearance(mx, mz);
      const bed: RailDecor['pieces'][number]['bed'] = cl < 0.3 ? 'road' : roads.onWalk(mx, mz) ? 'walk' : 'grass';
      rail.pieces.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, bed });
    }
    for (let s = 10, i = 0; s < L - 5; s += 28, i++) {
      const p = at(line, s);
      const side = i % 2 ? 1 : -1;
      const x = p.x - p.dz * 2.3 * side,
        z = p.z + p.dx * 2.3 * side;
      if (keep(x, z, 0.8, 1) && roads.clearance(p.x, p.z) >= 0.3 && !nearStop(x, z, 3)) rail.poles.push({ x, z });
    }
    void li;
  });

  return { lamps, scooters, palms, curbs, boats, streetSigns, rail };
}

/** an empty Decor (every list present) */
export function emptyDecor(): Decor {
  return { tanks: [], sheds: [], acs: [], shopSigns: [], scooters: [], lamps: [], signals: [], palms: [], curbs: [], boats: [] };
}

/** adds the street furniture to `level.decor` (creating it if needed) and makes the palm trunks solid */
export function addOsmDecor(level: Level) {
  if (!level.osm) return level;
  const d = (level.decor ??= emptyDecor());
  const o = osmDecor(level.osm, { stops: level.stops, places: level.places });
  d.lamps.push(...o.lamps);
  d.scooters.push(...o.scooters);
  d.palms.push(...o.palms);
  d.curbs.push(...o.curbs);
  d.boats.push(...o.boats);
  d.streetSigns = [...(d.streetSigns ?? []), ...o.streetSigns];
  d.rail = { pieces: [...(d.rail?.pieces ?? []), ...o.rail.pieces], poles: [...(d.rail?.poles ?? []), ...o.rail.poles] };
  // palm trunks are solid, as in the grid city
  o.palms.forEach((p, i) => level.shapes.push({ kind: 'cyl', id: `palm${i}`, p: [p.x, 2, p.z], r: 0.3, h: 4, color: '#8D6E63', hidden: true }));
  return level;
}
