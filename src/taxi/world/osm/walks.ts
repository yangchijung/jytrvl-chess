// Rush Taxi — where people walk on the real map: sidewalk loops round the blocks, and point tests for the sidewalk
// and road polygons (data.surfaces, cut into 230 m tiles). Plain data and maths only, so unit tests can check it.
//
// The sidewalk lies between a block and the road, so a block's outline pushed outwards by about 1.2 m runs along
// the middle of its sidewalk (sidewalks are 2.5 m wide on small streets, 3.5 m on bigger ones).
import type { OsmCityData, Poly, Ring, XZ } from './data';

export function ringArea(ring: Ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}
export function ringLength(ring: Ring) {
  let L = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}
/** a closed ring pushed outwards by d (mitred; sharp corners capped) */
export function growRing(ring: Ring, d: number): Ring {
  // with x east and z south, a positive area here means the ring runs clockwise on the map
  const sign = ringArea(ring) > 0 ? -1 : 1;
  const n = ring.length;
  const out: XZ[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n],
      c = ring[i],
      q = ring[(i + 1) % n];
    const u0 = norm(c[0] - p[0], c[1] - p[1]),
      u1 = norm(q[0] - c[0], q[1] - c[1]);
    // the right-hand normal of each edge, flipped to point outwards
    const n0 = [-u0[1] * sign, u0[0] * sign],
      n1 = [-u1[1] * sign, u1[0] * sign];
    let mx = n0[0] + n1[0],
      mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) (mx = n1[0]), (mz = n1[1]);
    else (mx /= ml), (mz /= ml);
    const cos = Math.max(0.5, mx * n1[0] + mz * n1[1]);
    out.push([c[0] + (mx * d) / cos, c[1] + (mz * d) / cos]);
  }
  return out;
}
function norm(x: number, z: number) {
  const L = Math.hypot(x, z) || 1;
  return [x / L, z / L];
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
export function pointInPoly(x: number, z: number, poly: Poly) {
  return pointInRing(x, z, poly[0]) && poly.slice(1).every((h) => !pointInRing(x, z, h));
}

/** point tests against the tiled surface polygons: is (x, z) on a sidewalk, on the road? (land excludes water) */
export function surfaceTests(data: OsmCityData) {
  const [cols, rows, size, x0, z0] = data.surfaces.tile;
  const index = (list: [number, Poly][]) => {
    const by: Poly[][] = Array.from({ length: cols * rows }, () => []);
    for (const [t, p] of list) by[t]?.push(p);
    return by;
  };
  const walk = index(data.surfaces.walk),
    road = index(data.surfaces.road),
    land = index(data.surfaces.land);
  const test = (by: Poly[][]) => (x: number, z: number) => {
    const i = Math.floor((x - x0) / size),
      j = Math.floor((z - z0) / size);
    if (i < 0 || j < 0 || i >= cols || j >= rows) return false;
    return by[j * cols + i].some((p) => pointInPoly(x, z, p));
  };
  return { onWalk: test(walk), onRoad: test(road), onLand: test(land) };
}

/** sidewalk loops: every block outline pushed out by `d` (outer ring only), skipping tiny blocks */
export function sidewalkLoops(data: OsmCityData, d = 1.2): { loop: Ring; cx: number; cz: number; len: number }[] {
  const out: { loop: Ring; cx: number; cz: number; len: number }[] = [];
  for (const b of data.blocks) {
    const ring = b.poly[0];
    if (ring.length < 3 || Math.abs(ringArea(ring)) < 120) continue;
    const loop = growRing(ring, d);
    let cx = 0,
      cz = 0;
    for (const [x, z] of loop) (cx += x), (cz += z);
    out.push({ loop, cx: cx / loop.length, cz: cz / loop.length, len: ringLength(loop) });
  }
  return out;
}
