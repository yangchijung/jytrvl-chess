// Rush Taxi — where the cab is in the real-map city, for the HUD: the 行政區 (district) it is in and the name of the
// road it is driving on. Pure data (no DOM), so it can be unit tested.
//
// The road lookup uses a grid index over the road pieces (about 3,400 of them), so one lookup only measures the
// pieces in the 3 × 3 cells round the cab and then asks `nearestRoad` (world/osm/level.ts) about those.
import type { OsmCityData, OsmRoad, Ring } from '../world/osm/data';
import { DISTRICT_EN } from '../world/osm/data';
import { nearestRoad } from '../world/osm/level';

function inRing(x: number, z: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface DistrictName {
  zh: string;
  en: string;
}

/** finds the district a point is in; the bounding boxes skip most polygon tests */
export function districtFinder(data: OsmCityData) {
  const ds = data.districts.map((d) => {
    const parts = d.poly.map((p) => {
      let x0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        z1 = -Infinity;
      for (const [x, z] of p[0]) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
      return { p, bb: [x0, z0, x1, z1] as const };
    });
    return { name: { zh: d.zh, en: DISTRICT_EN[d.zh] ?? d.en ?? d.zh } as DistrictName, parts };
  });
  return (x: number, z: number): DistrictName | null => {
    for (const d of ds)
      for (const { p, bb } of d.parts) {
        if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
        if (inRing(x, z, p[0]) && p.slice(1).every((h) => !inRing(x, z, h))) return d.name;
      }
    return null;
  };
}

/** cell size (m) of the road index; a lookup reaches at least one cell in every direction */
export const ROAD_CELL = 40;

/** a grid index of the road pieces: `near(x, z)` lists the pieces with a segment in the 3 × 3 cells round (x, z) */
export function roadIndex(data: OsmCityData, cell = ROAD_CELL) {
  const [bx0, bz0] = data.bounds;
  const cells = new Map<number, number[]>();
  const key = (c: number, r: number) => (r + 1000) * 4096 + (c + 1000);
  data.roads.forEach((road, ri) => {
    const seen = new Set<number>();
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [ax, az] = road.pts[s];
      const [bx, bz] = road.pts[s + 1];
      const half = road.w / 2;
      const c0 = Math.floor((Math.min(ax, bx) - half - bx0) / cell),
        c1 = Math.floor((Math.max(ax, bx) + half - bx0) / cell);
      const r0 = Math.floor((Math.min(az, bz) - half - bz0) / cell),
        r1 = Math.floor((Math.max(az, bz) + half - bz0) / cell);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const k = key(c, r);
          if (seen.has(k)) continue;
          seen.add(k);
          let list = cells.get(k);
          if (!list) cells.set(k, (list = []));
          list.push(ri);
        }
    }
  });
  return {
    cell,
    cells: cells.size,
    near(x: number, z: number): OsmRoad[] {
      const c = Math.floor((x - bx0) / cell),
        r = Math.floor((z - bz0) / cell);
      const out = new Set<number>();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) for (const ri of cells.get(key(c + dc, r + dr)) ?? []) out.add(ri);
      return [...out].map((ri) => data.roads[ri]);
    },
  };
}

/** how far off a road's centre line (beyond half its width) the cab can be and still be "on" it (m) */
export const ON_ROAD_SLACK = 3;

/**
 * The road the cab is on, or null off-road. Uses the index for the candidates and `nearestRoad` for the distance.
 * A cab within half the road's width plus ON_ROAD_SLACK of a named road's centre line is on it.
 */
export function roadFinder(data: OsmCityData) {
  const idx = roadIndex(data);
  return (x: number, z: number): { zh: string; en: string } | null => {
    const roads = idx.near(x, z);
    if (!roads.length) return null;
    const hit = nearestRoad({ ...data, roads }, x, z);
    if (!hit || hit.d > hit.road.w / 2 + ON_ROAD_SLACK || !hit.road.name) return null;
    return { zh: hit.road.name, en: hit.road.en || hit.road.name };
  };
}
