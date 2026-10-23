// Rush Taxi — the minimap's pure parts (no DOM, no Three.js), so they can be unit tested:
// - what the static map is made of, read from the level data (blocks, parks, river, bridges, sea);
// - the world → map transform (heading up: the way the camera looks is always the top of the map);
// - clamping a marker that is off the map to the round map's edge.
//
// World axes: +z is "north" in the city data (doors: n = +z). Seen from above with north up, +x is on the LEFT
// (the chase camera looking along +z has world −x on its right), so the north-up map frame is mx = −x, my = −z
// (canvas y grows downwards).
import type { Level } from '../world/level';

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
