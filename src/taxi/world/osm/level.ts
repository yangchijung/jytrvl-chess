// Rush Taxi — the real-map city: turns the OpenStreetMap data (./data.ts) into a Level.
//
// What it builds here (plain data, no Three.js or Rapier, so unit tests can check it):
// - building boxes from the mapped footprints (oriented boxes, drawn with the facade shader);
// - passenger stops along the streets;
// - destinations at the real landmarks, each with a name board;
// - the spawn point, the road graph for traffic, trees in the parks, and the walls round the map.
//
// The ground, roads, sidewalks and water are polygons, drawn and made solid by ./surfaces.ts from `level.osm`.
// Blocks without mapped buildings are filled by the block-fill step (later), which also reads `level.osm`.
import type { Level, Sign, Tree } from '../level';
import type { Shape } from '../greybox';
import type { Place, Spot } from '../../gameplay/rules';
import { LOOK_HALL, LOOK_HOUSE, LOOK_TOWER, LOOK_WAREHOUSE } from '../facade';
import { KAOHSIUNG, RANK, type OsmCityData, type OsmRoad, type XZ } from './data';
import { fillBlocks } from './fill';

/** the landmark names shown in the game (short, as people say them) */
export const LANDMARK_NAMES: Record<string, { zh: string; en: string }> = {
  tower85: { zh: '85 大樓', en: '85 Sky Tower' },
  musiccenter: { zh: '流行音樂中心', en: 'Kaohsiung Music Center' },
  pier2: { zh: '駁二藝術特區', en: 'Pier-2 Art Center' },
  pier2tower: { zh: '駁二塔', en: 'Pier-2 Tower' },
  lovepier: { zh: '真愛碼頭', en: 'True Love Pier' },
  gloriouspier: { zh: '光榮碼頭', en: 'Glory Pier' },
  xinguangpier: { zh: '新光碼頭', en: 'Xinguang Pier' },
  mainstation: { zh: '高雄車站', en: 'Kaohsiung Station' },
  oldstation: { zh: '舊高雄車站', en: 'Old Kaohsiung Station' },
  sankuaicuo: { zh: '三塊厝車站', en: 'Sankuaicuo Station' },
  gushanstation: { zh: '鼓山車站', en: 'Gushan Station' },
  liuhe: { zh: '六合夜市', en: 'Liuhe Night Market' },
  nanhua: { zh: '南華夜市', en: 'Nanhua Night Market' },
  guanghua: { zh: '光華夜市', en: 'Guanghua Night Market' },
  lightcorridor: { zh: '城市光廊', en: 'City Light Corridor' },
  historymuseum: { zh: '歷史博物館', en: 'Museum of History' },
  literature: { zh: '文學館', en: 'Literature Library' },
  mainlibrary: { zh: '市圖總館', en: 'Main Public Library' },
  culturalcenter: { zh: '文化中心', en: 'Cultural Center' },
  cityhall: { zh: '四維市政中心', en: 'City Government Center' },
  oldcouncil: { zh: '原市議會', en: 'Old City Council' },
  railpark: { zh: '打狗鐵道公園', en: 'Takao Railway Park' },
  railmuseum: { zh: '哈瑪星鐵道館', en: 'Hamasen Railway Museum' },
  harbormuseum: { zh: '港史館', en: 'Harbor Museum' },
  labormuseum: { zh: '勞工博物館', en: 'Labor Museum' },
  yanchengmarket: { zh: '鹽埕市場', en: 'Yancheng Market' },
  lingyamarket: { zh: '苓雅市場', en: 'Lingya Market' },
  sanfeng: { zh: '三鳳宮', en: 'Sanfeng Temple' },
  csc: { zh: '中鋼大樓', en: 'CSC Building' },
  exhibition: { zh: '高雄展覽館', en: 'Exhibition Center' },
  centralpark: { zh: '中央公園', en: 'Central Park' },
  greatharbor: { zh: '大港橋', en: 'Great Harbor Bridge' },
};

/** building look (facade style) by district and land use */
function styleFor(district: string | undefined, use: string | undefined, kind: string | undefined, h: number) {
  if (kind === 'warehouse' || kind === 'industrial' || use === 'industrial' || use === 'port') return LOOK_WAREHOUSE;
  if (kind === 'school' || kind === 'university' || kind === 'public' || kind === 'government' || kind === 'hospital') return LOOK_HALL;
  if (h >= 30) return LOOK_TOWER;
  if (district === '鹽埕區' || district === '鼓山區' || district === '三民區') return LOOK_HOUSE;
  return h >= 16 ? LOOK_TOWER : LOOK_HOUSE;
}

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

function pointInRing(x: number, z: number, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface RoadHit {
  road: OsmRoad;
  /** index of the road piece and the segment on it */
  ri: number;
  seg: number;
  /** nearest point on the centre line, the unit direction of the segment (a → b) and the distance */
  x: number;
  z: number;
  dx: number;
  dz: number;
  d: number;
}

/** the nearest point on any road's centre line (optionally only roads that pass `ok`) */
export function nearestRoad(data: OsmCityData, x: number, z: number, ok: (r: OsmRoad) => boolean = () => true): RoadHit | null {
  let best: RoadHit | null = null;
  data.roads.forEach((road, ri) => {
    if (!ok(road)) return;
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [ax, az] = road.pts[s];
      const [bx, bz] = road.pts[s + 1];
      const vx = bx - ax,
        vz = bz - az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      const px = ax + vx * t,
        pz = az + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) {
        const L = Math.sqrt(L2);
        best = { road, ri, seg: s, x: px, z: pz, dx: vx / L, dz: vz / L, d };
      }
    }
  });
  return best;
}

/** length of a polyline and the point/direction at distance `at` along it */
export function along(pts: XZ[], at: number) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= at || i === pts.length - 2) {
      const t = L ? Math.min(1, Math.max(0, (at - acc) / L)) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: L ? (bx - ax) / L : 1, dz: L ? (bz - az) / L : 0 };
    }
    acc += L;
  }
  const [x, z] = pts[0];
  return { x, z, dx: 1, dz: 0 };
}
export function polyLength(pts: XZ[]) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}

/** storeys → height (m); unmapped buildings get a height from their district and size */
function heightOf(b: OsmCityData['buildings'][number], district: string | undefined) {
  if (b.h && b.h > 3) return Math.min(b.h, 140);
  if (b.lv) return Math.min(3.4 * b.lv + 1, 140);
  const r = hash(b.obb[0], b.obb[1]);
  const area = b.obb[2] * b.obb[3];
  if (b.kind === 'warehouse' || b.kind === 'industrial') return 8 + r * 4;
  const base = district === '鹽埕區' || district === '鼓山區' ? 10 : district === '前鎮區' ? 12 : 13;
  return base + r * 10 + Math.min(18, area / 60);
}

/** railings along both edges of every bridge (solid, low) */
export function bridgeRails(data: OsmCityData) {
  const out: { x: number; z: number; yaw: number; L: number }[] = [];
  for (const r of data.roads) {
    if (!r.bridge) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1) continue;
      const dx = (bx - ax) / L,
        dz = (bz - az) / L;
      for (const side of [1, -1]) {
        const off = (r.w / 2 + 0.6) * side;
        out.push({ x: (ax + bx) / 2 - dz * off, z: (az + bz) / 2 + dx * off, yaw: -Math.atan2(dz, dx), L: L + 0.4 });
      }
    }
  }
  return out;
}

export function osmLevel(data: OsmCityData = KAOHSIUNG): Level {
  const [x0, z0, x1, z1] = data.bounds;
  const shapes: Shape[] = [];

  // ---------- districts: which one a point is in ----------
  const districtAt = (x: number, z: number) => data.districts.find((d) => d.poly.some((p) => pointInRing(x, z, p[0])))?.zh;

  // ---------- buildings from the mapped footprints ----------
  data.buildings.forEach((b, i) => {
    const [cx, cz, L, W, ang] = b.obb;
    if (L < 2 || W < 2) return;
    const dz = districtAt(cx, cz);
    const h = heightOf(b, dz);
    shapes.push({ kind: 'box', id: `b${i}`, p: [cx, h / 2, cz], size: [L, h, W], yaw: -ang, color: '#D8D2C4', look: styleFor(dz, undefined, b.kind, h) });
  });

  // ---------- bridge railings (solid) ----------
  bridgeRails(data).forEach((r, i) => shapes.push({ kind: 'box', id: `br${i}`, p: [r.x, 0.55, r.z], size: [r.L, 1.1, 0.4], yaw: r.yaw, color: '#ECEFF1' }));

  // ---------- walls round the map (invisible) ----------
  const T = 4;
  const wall = (id: string, cx: number, cz: number, sx: number, sz: number): Shape => ({ kind: 'box', id, p: [cx, 6, cz], size: [sx, 12, sz], color: '#000000', hidden: true });
  shapes.push(wall('wn', (x0 + x1) / 2, z0 - T / 2, x1 - x0 + 2 * T, T), wall('ws', (x0 + x1) / 2, z1 + T / 2, x1 - x0 + 2 * T, T), wall('ww', x0 - T / 2, (z0 + z1) / 2, T, z1 - z0), wall('we', x1 + T / 2, (z0 + z1) / 2, T, z1 - z0));

  // ---------- passenger stops: on the kerb of every street piece long enough (both kerbs on two-way roads) ----------
  const stops: Spot[] = [];
  data.roads.forEach((r, ri) => {
    if (r.bridge || r.cls.endsWith('_link')) return;
    const L = polyLength(r.pts);
    if (L < 45) return;
    const n = Math.max(1, Math.floor(L / 120));
    for (let k = 0; k < n; k++) {
      const p = along(r.pts, (L * (k + 0.5)) / n);
      // right-hand kerb (drive on the right): the right of direction (dx, dz) in x-east/z-south is (−dz, dx)
      const sides = r.oneway ? [1] : [1, -1];
      for (const side of sides) {
        const rx = -p.dz * side,
          rz = p.dx * side;
        const lane = r.w / 2 - 1.8;
        stops.push({ id: `s${ri}_${k}_${side}`, x: p.x + rx * lane, z: p.z + rz * lane, cx: p.x + rx * (r.w / 2 + 1.4), cz: p.z + rz * (r.w / 2 + 1.4) });
      }
    }
  });

  // ---------- destinations at the landmarks, with name boards ----------
  const places: Place[] = [];
  const signs: Sign[] = [];
  for (const lm of data.landmarks) {
    const hit = nearestRoad(data, lm.x, lm.z, (r) => !r.bridge && RANK[r.cls] >= 1);
    if (!hit || hit.d > 160) continue;
    // the kerb on the landmark's side of the road
    const sx = lm.x - hit.x,
      sz = lm.z - hit.z;
    const sl = Math.hypot(sx, sz) || 1;
    const ux = sx / sl,
      uz = sz / sl;
    const w = hit.road.w;
    const name = LANDMARK_NAMES[lm.id] ?? { zh: lm.zh, en: lm.en || lm.zh };
    places.push({ id: lm.id, name, x: hit.x + ux * (w / 2 - 1.8), z: hit.z + uz * (w / 2 - 1.8), cx: hit.x + ux * (w / 2 + 1.4), cz: hit.z + uz * (w / 2 + 1.4) });
    // board on the kerb, facing the road (yaw 0 = facing +z)
    const bx = hit.x + ux * (w / 2 + 3.2),
      bz = hit.z + uz * (w / 2 + 3.2);
    signs.push({ id: lm.id, name, x: bx, y: 5.5, z: bz, yaw: Math.atan2(-ux, -uz) });
  }

  // ---------- spawn: on the main road beside Central Park, heading along it ----------
  const cp = data.landmarks.find((l) => l.id === 'lightcorridor') ?? data.landmarks[0];
  const sh = nearestRoad(data, cp.x, cp.z, (r) => !r.bridge && RANK[r.cls] >= 4) ?? nearestRoad(data, 0, 0)!;
  const right = { x: -sh.dz, z: sh.dx };
  const spawnX = sh.x + right.x * (sh.road.oneway ? 0 : sh.road.w / 4);
  const spawnZ = sh.z + right.z * (sh.road.oneway ? 0 : sh.road.w / 4);
  // yaw: 0 faces +z; the car faces along (dx, dz)
  const spawn = { p: { x: spawnX, y: 1.0, z: spawnZ }, yaw: Math.atan2(sh.dx, sh.dz) };

  // ---------- road graph: every polyline vertex is a node, so traffic follows the curves ----------
  const gNodes: { x: number; z: number }[] = data.nodes.map(([x, z]) => ({ x, z }));
  const gEdges: [number, number][] = [];
  for (const r of data.roads) {
    if (r.cls.endsWith('_link')) continue;
    let prev = r.a;
    for (let i = 1; i < r.pts.length - 1; i++) {
      gNodes.push({ x: r.pts[i][0], z: r.pts[i][1] });
      gEdges.push([prev, gNodes.length - 1]);
      prev = gNodes.length - 1;
    }
    gEdges.push([prev, r.b]);
  }

  // ---------- trees in the parks ----------
  const trees: Tree[] = [];
  for (const b of data.blocks) {
    if (!b.park) continue;
    const ring = b.poly[0];
    let minx = Infinity,
      maxx = -Infinity,
      minz = Infinity,
      maxz = -Infinity;
    for (const [x, z] of ring) {
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      minz = Math.min(minz, z);
      maxz = Math.max(maxz, z);
    }
    for (let x = minx + 6; x < maxx - 4; x += 11) {
      for (let z = minz + 6; z < maxz - 4; z += 11) {
        const jx = x + (hash(x, z) - 0.5) * 6,
          jz = z + (hash(z, x) - 0.5) * 6;
        if (hash(jx, jz, 3) < 0.55 && pointInRing(jx, jz, ring) && b.poly.slice(1).every((h) => !pointInRing(jx, jz, h))) trees.push({ x: jx, z: jz, h: 5 + hash(jx, jz, 7) * 4 });
      }
    }
  }

  // ---------- the empty blocks: frontage rows, interiors and rooftop / wall decor (./fill.ts) ----------
  const fill = fillBlocks(data);
  shapes.push(...fill.shapes);
  const decor = { ...fill.decor, scooters: [], lamps: [], signals: [], palms: [], curbs: [], boats: [] };

  const half = Math.max(x1 - x0, z1 - z0) / 2;
  return {
    id: 'city',
    bounds: half,
    rect: { x0, z0, x1, z1 },
    ground: [],
    water: { y: -1.4, floor: -3.2, x0, x1, z0, z1 },
    shapes,
    prims: [],
    lots: [],
    marks: [],
    signs,
    trees,
    stops,
    places,
    spawn,
    graph: { nodes: gNodes, edges: gEdges },
    walks: [],
    avoid: [],
    decor,
    massing: { masses: [], slabs: [], pitched: fill.pitched, roofs: [] },
    osm: data,
  };
}
