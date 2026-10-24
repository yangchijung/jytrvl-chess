// Rush Taxi — the minimap's pure parts (no DOM, no Three.js), so they can be unit tested:
// - what the static map is made of, read from the level data (blocks, parks, river, bridges, sea);
// - the world → map transform (heading up: the way the camera looks is always the top of the map);
// - clamping a marker that is off the map to the round map's edge.
//
// World axes: +z is "north" in the city data (doors: n = +z). Seen from above with north up, +x is on the LEFT
// (the chase camera looking along +z has world −x on its right), so the north-up map frame is mx = −x, my = −z
// (canvas y grows downwards).
import type { Level } from '../world/level';
import type { OsmCityData, Poly, RoadClass, XZ } from '../world/osm/data';
import { RANK } from '../world/osm/data';

/** metres from the car to the map's edge (the map shows a 2·RANGE m wide disc) */
export const MINIMAP_RANGE = 150;
/** pixels per metre of the pre-rendered static map */
export const MAP_PX_PER_M = 1.5;
/** how far past the city walls the static map reaches (m), so the edge of the disc never shows a void */
export const MAP_MARGIN = MINIMAP_RANGE + 10;

/** the minimap palette: the site's ink and paper, plus flat map colours for land use */
export const MAP_COLORS = {
  ink: '#23303F',
  paper: '#FFFAF2',
  road: '#FFFAF2',
  block: '#C9CED6',
  park: '#9CC27A',
  plaza: '#DDD6C8',
  water: '#7DB4DD',
  land: '#B7C99A',
  car: '#FFC72C',
  dest: '#43A047',
} as const;

export interface MapRect {
  /** centre and size in world metres */
  x: number;
  z: number;
  w: number;
  d: number;
  kind: 'block' | 'park' | 'plaza' | 'water' | 'road' | 'land';
}

/** the colour the city uses for park lots (city.ts) */
const PARK_LOT = '#7CB342';
/** the stunt park lot (city.ts) */
const STUNT_LOT = '#BDBDBD';
/** road width (m), city.json `road` */
const ROAD = 14;

/**
 * The static map as a back-to-front list of flat rectangles in world metres:
 * land outside the walls, the sea, the street area inside the walls, the lots, the river, then the bridges
 * (every road-graph edge that crosses the river).
 */
export function mapLayers(level: Level): MapRect[] {
  const B = level.bounds;
  const E = B + MAP_MARGIN;
  const out: MapRect[] = [{ x: 0, z: 0, w: E * 2, d: E * 2, kind: 'land' }];
  // the sea lies outside the west wall (city.json `sea: 'west'`, drawn at x < −bounds in build.ts)
  if (level.id === 'city') out.push({ x: (-B - E) / 2, z: 0, w: E - B, d: E * 2, kind: 'water' });
  out.push({ x: 0, z: 0, w: B * 2, d: B * 2, kind: 'road' });
  for (const l of level.lots) out.push({ x: l.x, z: l.z, w: l.w, d: l.d, kind: l.color === PARK_LOT ? 'park' : l.color === STUNT_LOT ? 'plaza' : 'block' });
  const w = level.water;
  if (w) {
    out.push({ x: (w.x0 + w.x1) / 2, z: (w.z0 + w.z1) / 2, w: w.x1 - w.x0, d: w.z1 - w.z0, kind: 'water' });
    const g = level.graph;
    if (g)
      for (const [a, b] of g.edges) {
        const A = g.nodes[a],
          C = g.nodes[b];
        // a north–south street whose ends lie on both banks: a bridge
        if (Math.abs(A.x - C.x) < 0.5 && Math.min(A.z, C.z) < w.z0 && Math.max(A.z, C.z) > w.z1) out.push({ x: A.x, z: (w.z0 + w.z1) / 2, w: ROAD, d: w.z1 - w.z0, kind: 'road' });
      }
  }
  return out;
}

/** the static map's pixel size and the world → static-map pixel mapping (north up) */
export function staticMapFrame(level: Level, pxPerM = MAP_PX_PER_M) {
  const E = level.bounds + MAP_MARGIN;
  const size = Math.ceil(E * 2 * pxPerM);
  return {
    size,
    extent: E,
    /** world (x, z) → pixel (u, v) on the static map */
    toPx: (x: number, z: number) => ({ u: (E - x) * pxPerM, v: (E - z) * pxPerM }),
  };
}

/**
 * A world point relative to the car (dx, dz metres) → an offset from the map centre in map pixels, with the map
 * turned so `view` (the camera's yaw: atan2(forward.x, forward.z)) points up. `scale` = pixels per metre.
 * Equivalent to canvas `rotate(view)` applied to the north-up frame (−dx, −dz).
 */
export function worldToMap(dx: number, dz: number, view: number, scale: number) {
  const s = Math.sin(view),
    c = Math.cos(view);
  return { x: (-dx * c + dz * s) * scale, y: (-dx * s - dz * c) * scale };
}

/** keeps a marker inside a round map of `radius` px around the centre; says whether it had to be pulled in */
export function clampToEdge(x: number, y: number, radius: number) {
  const r = Math.hypot(x, y);
  if (r <= radius) return { x, y, clamped: false };
  const k = radius / r;
  return { x: x * k, y: y * k, clamped: true };
}

/** the angle (radians, canvas rotation: 0 = up, + = clockwise) for an arrow that shows `yaw` on a map turned to `view` */
export function headingOnMap(yaw: number, view: number) {
  const d = view - yaw;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

// ---------------------------------------------------------------------------------------------------------------
// The real-map city (level.osm): too big for one canvas at a readable scale (2.6 × 3.0 km at ~1 px/m would be about
// 2700 × 3200 px), so its static map is cut into square tiles that are drawn on demand and kept in a small cache.
// Tile pixels are world-aligned: pixel (i, j) of a tile = world (x0 + i / k, z0 + j / k). The minimap draws them
// under the same heading-up transform as the markers.

/** pixels per metre of an OSM map tile: the minimap shows at most ~1.05 device px per metre (156 css px × 2 dpr for
 * 2 · MINIMAP_RANGE m), so this stays sharp without wasting memory */
export const OSM_TILE_PX_PER_M = 1.25;
/** tile edge (m): a 300 m wide turned disc touches at most 3 × 3 of them */
export const OSM_TILE_M = 256;
/** how many drawn tiles the cache keeps (each 322 × 322 px, ~0.4 MB): enough for the view plus the way back */
export const OSM_TILE_CACHE = 20;


/** a drawable piece of the OSM map, in back-to-front order */
export type OsmMapItem =
  | { t: 'poly'; kind: 'park' | 'water'; poly: Poly; bb: [number, number, number, number] }
  | { t: 'road'; rank: number; w: number; pts: XZ[]; bb: [number, number, number, number] };

export interface OsmMapModel {
  /** the area the tiles cover (play area plus MAP_MARGIN): x0, z0, x1, z1 */
  area: [number, number, number, number];
  /** the play area (the walls) */
  rect: [number, number, number, number];
  cols: number;
  rows: number;
  tileM: number;
  items: OsmMapItem[];
  /** item indices per tile (row-major), in drawing order */
  bins: number[][];
  landmarks: { x: number; z: number }[];
}

/** how a road class is drawn: main roads wider and lighter, side streets narrower and a little darker */
export function roadStyle(cls: RoadClass | number) {
  const rank = typeof cls === 'number' ? cls : RANK[cls];
  if (rank >= 4) return { color: MAP_COLORS.paper, minPx: 4 };
  if (rank === 3) return { color: '#F1ECE2', minPx: 3 };
  return { color: '#E2DDD3', minPx: 2 };
}

function bbOf(pts: XZ[], pad = 0): [number, number, number, number] {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const [x, z] of pts) {
    if (x < a) a = x;
    if (z < b) b = z;
    if (x > c) c = x;
    if (z > d) d = z;
  }
  return [a - pad, b - pad, c + pad, d + pad];
}

/** the OSM static map as tiles: parks, then water, then roads by rank (side streets first, main roads on top) */
export function osmMapModel(data: OsmCityData, tileM = OSM_TILE_M): OsmMapModel {
  const [rx0, rz0, rx1, rz1] = data.bounds;
  const area: [number, number, number, number] = [rx0 - MAP_MARGIN, rz0 - MAP_MARGIN, rx1 + MAP_MARGIN, rz1 + MAP_MARGIN];
  const cols = Math.ceil((area[2] - area[0]) / tileM);
  const rows = Math.ceil((area[3] - area[1]) / tileM);
  const items: OsmMapItem[] = [];
  for (const p of data.parks) items.push({ t: 'poly', kind: 'park', poly: p.poly, bb: bbOf(p.poly[0]) });
  for (const b of data.blocks) if (b.park) items.push({ t: 'poly', kind: 'park', poly: b.poly, bb: bbOf(b.poly[0]) });
  for (const w of data.water) items.push({ t: 'poly', kind: 'water', poly: w, bb: bbOf(w[0]) });
  const roads = data.roads.map((r) => ({ rank: RANK[r.cls], w: r.w, pts: r.pts })).sort((a, b) => a.rank - b.rank);
  for (const r of roads) items.push({ t: 'road', rank: r.rank, w: r.w, pts: r.pts, bb: bbOf(r.pts, r.w / 2 + 2) });
  const bins: number[][] = Array.from({ length: cols * rows }, () => []);
  // the 1-pixel overlap each tile draws round its edge (see osmTileOrigin) is covered by a 2 m pad
  const pad = 2;
  items.forEach((it, i) => {
    const c0 = Math.max(0, Math.floor((it.bb[0] - pad - area[0]) / tileM));
    const c1 = Math.min(cols - 1, Math.floor((it.bb[2] + pad - area[0]) / tileM));
    const r0 = Math.max(0, Math.floor((it.bb[1] - pad - area[1]) / tileM));
    const r1 = Math.min(rows - 1, Math.floor((it.bb[3] + pad - area[1]) / tileM));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) bins[r * cols + c].push(i);
  });
  return { area, rect: [rx0, rz0, rx1, rz1], cols, rows, tileM, items, bins, landmarks: data.landmarks.map((l) => ({ x: l.x, z: l.z })) };
}

/** the world origin and size (m) of tile (c, r), including the 1-pixel overlap on every side that hides seams */
export function osmTileOrigin(m: OsmMapModel, c: number, r: number, k = OSM_TILE_PX_PER_M) {
  const px = Math.ceil(m.tileM * k) + 2;
  return { x: m.area[0] + c * m.tileM - 1 / k, z: m.area[1] + r * m.tileM - 1 / k, size: px / k, px };
}

/** the tiles (col, row) that a disc of `radius` m round (x, z) touches */
export function osmTilesAround(m: OsmMapModel, x: number, z: number, radius: number) {
  const c0 = Math.max(0, Math.floor((x - radius - m.area[0]) / m.tileM));
  const c1 = Math.min(m.cols - 1, Math.floor((x + radius - m.area[0]) / m.tileM));
  const r0 = Math.max(0, Math.floor((z - radius - m.area[1]) / m.tileM));
  const r1 = Math.min(m.rows - 1, Math.floor((z + radius - m.area[1]) / m.tileM));
  const out: { c: number; r: number }[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push({ c, r });
  return out;
}

/** which way north is in world (x, z): the grid city's data has +z north, the OSM city has z = south */
export function northOf(level: Level): { x: number; z: number } {
  return level.osm ? { x: 0, z: -1 } : { x: 0, z: 1 };
}
