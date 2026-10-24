// Rush Taxi: draws and solidifies the real-map city's flat parts. Input is `level.osm`, the OpenStreetMap
// polygons from ./data.ts.
// - Drawing: land, blocks (lots, parks), sidewalks (raised a hand's width), asphalt, lane markings and crossings,
//   the water, and the river and harbour walls.
// - Physics: the land as triangle-mesh colliders (water is a hole you drop into); bridges are part of the land.
// Each 460 m square (2 × 2 data tiles) is one merged mesh with vertex colours, so the camera's frustum culls whole
// squares and the city costs a few draw calls.
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Level } from '../level';
import { RANK, type OsmCityData, type Poly, type XZ } from './data';
import { along, polyLength } from './level';

type R = typeof RAPIER_NS;

export const SURF = {
  land: '#CDBF9F',
  lot: '#D9CFBA',
  park: '#7AAF4C',
  industrial: '#BFC3C2',
  walk: '#E4DCCB',
  road: '#4E5157',
  white: '#F2F2EE',
  yellow: '#F2C230',
  bank: '#9AA3A8',
} as const;
/** heights of the layers (m): the car drives at 0 on the land collider */
export const LAYER = { land: -0.02, lot: 0.0, road: 0.015, mark: 0.03, walk: 0.14 } as const;
/** data tiles merged per drawn square (per side) */
const GROUP = 2;

/** triangulate a polygon (outer ring + holes) into flat triangles at height y, appended to pos/col */
function fillPoly(poly: Poly, y: number, color: THREE.Color, pos: number[], col: number[]) {
  const outer = poly[0].map(([x, z]) => new THREE.Vector2(x, z));
  const holes = poly.slice(1).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  if (outer.length < 3) return;
  if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  for (const h of holes) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
  const all = [...outer, ...holes.flat()];
  for (const [a, b, c] of tris) {
    // counter-clockwise seen from above (+y up, x east, z south): wind a, c, b
    for (const i of [a, c, b]) {
      pos.push(all[i].x, y, all[i].y);
      col.push(color.r, color.g, color.b);
    }
  }
}

/** a flat quad of length L and width W centred at (x, z) along unit (dx, dz) */
function quad(x: number, z: number, dx: number, dz: number, L: number, W: number, y: number, color: THREE.Color, pos: number[], col: number[]) {
  const ax = (dx * L) / 2,
    az = (dz * L) / 2,
    bx = (-dz * W) / 2,
    bz = (dx * W) / 2;
  const p = [
    [x - ax - bx, z - az - bz],
    [x + ax - bx, z + az - bz],
    [x + ax + bx, z + az + bz],
    [x - ax + bx, z - az + bz],
  ];
  const tri = (i: number, j: number, k: number) => {
    for (const n of [i, j, k]) {
      pos.push(p[n][0], y, p[n][1]);
      col.push(color.r, color.g, color.b);
    }
  };
  // make the face point up whatever the winding
  const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
  if (cross > 0) {
    tri(0, 2, 1);
    tri(0, 3, 2);
  } else {
    tri(0, 1, 2);
    tri(0, 2, 3);
  }
}

/** which drawn square a data tile belongs to */
function groupOf(data: OsmCityData, tile: number) {
  const cols = data.surfaces.tile[0];
  const i = tile % cols,
    j = Math.floor(tile / cols);
  return Math.floor(j / GROUP) * Math.ceil(cols / GROUP) + Math.floor(i / GROUP);
}
export function groupOfPoint(data: OsmCityData, x: number, z: number) {
  const [cols, rows, size, x0, z0] = data.surfaces.tile;
  const i = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / size)));
  const j = Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / size)));
  return groupOf(data, j * cols + i);
}

/** lane markings and zebra crossings, as quads (white and yellow) */
export function markings(data: OsmCityData) {
  const out: { x: number; z: number; dx: number; dz: number; L: number; W: number; yellow: boolean }[] = [];
  // how many roads meet at each node: crossings only where a real junction is
  const deg = new Map<number, number>();
  for (const r of data.roads) {
    deg.set(r.a, (deg.get(r.a) ?? 0) + 1);
    deg.set(r.b, (deg.get(r.b) ?? 0) + 1);
  }
  // the widest road at each node: markings stop short of its kerb
  const wide = new Map<number, number>();
  for (const r of data.roads) {
    wide.set(r.a, Math.max(wide.get(r.a) ?? 0, r.w));
    wide.set(r.b, Math.max(wide.get(r.b) ?? 0, r.w));
  }
  for (const r of data.roads) {
    const L = polyLength(r.pts);
    const startGap = (deg.get(r.a)! >= 3 ? (wide.get(r.a) ?? r.w) / 2 + 3.5 : 1) + (RANK[r.cls] >= 3 && deg.get(r.a)! >= 3 ? 4 : 0);
    const endGap = (deg.get(r.b)! >= 3 ? (wide.get(r.b) ?? r.w) / 2 + 3.5 : 1) + (RANK[r.cls] >= 3 && deg.get(r.b)! >= 3 ? 4 : 0);
    if (L - startGap - endGap < 4) continue;
    const rank = RANK[r.cls];
    // centre line: double yellow on big two-way roads, dashed white on the rest; one-way roads get dashed lane lines
    const lines: { off: number; yellow: boolean; dash: boolean }[] = [];
    if (!r.oneway && rank >= 4) lines.push({ off: -0.18, yellow: true, dash: false }, { off: 0.18, yellow: true, dash: false });
    else if (!r.oneway && r.w >= 7) lines.push({ off: 0, yellow: false, dash: true });
    if (r.oneway && r.w >= 9) {
      const lanes = Math.max(2, Math.round(r.w / 3.4));
      for (let k = 1; k < lanes; k++) lines.push({ off: -r.w / 2 + (r.w * k) / lanes, yellow: false, dash: true });
    }
    if (!r.oneway && rank >= 4 && r.w >= 16) {
      // a lane line in each direction on the widest roads
      lines.push({ off: r.w / 4, yellow: false, dash: true }, { off: -r.w / 4, yellow: false, dash: true });
    }
    for (const ln of lines) {
      const step = ln.dash ? 9 : 3;
      const len = ln.dash ? 4 : 3.02;
      for (let s = startGap + len / 2; s < L - endGap - len / 2; s += step) {
        const p = along(r.pts, s);
        out.push({ x: p.x - p.dz * ln.off, z: p.z + p.dx * ln.off, dx: p.dx, dz: p.dz, L: len, W: 0.16, yellow: ln.yellow });
      }
    }
    // zebra crossings at both ends of roads that meet a junction
    if (rank >= 2 && r.w >= 7) {
      for (const [end, gap] of [
        [0, startGap - 2.5],
        [1, endGap - 2.5],
      ] as const) {
        const node = end === 0 ? r.a : r.b;
        if ((deg.get(node) ?? 0) < 3 || L < 2 * gap + 6) continue;
        const p = along(r.pts, end === 0 ? gap : L - gap);
        const stripes = Math.floor((r.w - 1) / 1.1);
        for (let k = 0; k < stripes; k++) {
          const off = -r.w / 2 + 0.9 + k * 1.1;
          out.push({ x: p.x - p.dz * off, z: p.z + p.dx * off, dx: p.dx, dz: p.dz, L: 3, W: 0.5, yellow: false });
        }
      }
    }
  }
  return out;
}

/** the river and harbour walls: vertical strips along every water edge, from the ground down below the water */
function bankWalls(data: OsmCityData, floor: number) {
  const pos: number[] = [];
  for (const poly of data.water) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        pos.push(ax, 0, az, bx, 0, bz, bx, floor, bz, ax, 0, az, bx, floor, bz, ax, floor, az);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function drawSurfaces(scene: THREE.Scene, level: Level, water: { river: THREE.Material; sea: THREE.Material }) {
  const data = level.osm!;
  const groups = new Map<number, { pos: number[]; col: number[] }>();
  const bucket = (g: number) => {
    let b = groups.get(g);
    if (!b) groups.set(g, (b = { pos: [], col: [] }));
    return b;
  };
  const C = (hex: string) => new THREE.Color(hex);
  const land = C(SURF.land),
    lot = C(SURF.lot),
    park = C(SURF.park),
    ind = C(SURF.industrial),
    walk = C(SURF.walk),
    road = C(SURF.road),
    white = C(SURF.white),
    yellow = C(SURF.yellow);
  for (const [t, p] of data.surfaces.land) fillPoly(p, LAYER.land, land, bucket(groupOf(data, t)).pos, bucket(groupOf(data, t)).col);
  for (const b of data.blocks) {
    const c = b.park ? park : b.use === 'industrial' || b.use === 'port' || b.use === 'railway' ? ind : lot;
    const g = bucket(groupOf(data, b.tile));
    fillPoly(b.poly, LAYER.lot, c, g.pos, g.col);
  }
  for (const [t, p] of data.surfaces.walk) fillPoly(p, LAYER.walk, walk, bucket(groupOf(data, t)).pos, bucket(groupOf(data, t)).col);
  for (const [t, p] of data.surfaces.road) fillPoly(p, LAYER.road, road, bucket(groupOf(data, t)).pos, bucket(groupOf(data, t)).col);
  for (const m of markings(data)) {
    const g = bucket(groupOfPoint(data, m.x, m.z));
    quad(m.x, m.z, m.dx, m.dz, m.L, m.W, LAYER.mark, m.yellow ? yellow : white, g.pos, g.col);
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  let tris = 0;
  for (const [, b] of groups) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'osm-ground';
    scene.add(mesh);
    tris += b.pos.length / 9;
  }

  // water: the big harbour basin gets the sea material, rivers and canals the river one
  const wl = level.water!.y;
  for (const poly of data.water) {
    const pos: number[] = [];
    const col: number[] = [];
    fillPoly(poly, wl, white, pos, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    let minx = Infinity,
      maxx = -Infinity;
    for (const [x] of poly[0]) {
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
    }
    const m = new THREE.Mesh(g, maxx - minx > 600 ? water.sea : water.river);
    m.name = 'osm-water';
    scene.add(m);
  }
  const walls = new THREE.Mesh(bankWalls(data, level.water!.floor), new THREE.MeshLambertMaterial({ color: SURF.bank, side: THREE.DoubleSide }));
  walls.name = 'osm-banks';
  scene.add(walls);
  return { meshes: groups.size, triangles: tris };
}

/** the land as triangle-mesh colliders (one per drawn square); returns their handles (never a crash) */
export function buildSurfacePhysics(RAPIER: R, world: RAPIER_NS.World, level: Level) {
  const data = level.osm!;
  const handles: number[] = [];
  const groups = new Map<number, number[]>();
  const white = new THREE.Color();
  for (const [t, p] of data.surfaces.land) {
    const g = groupOf(data, t);
    let a = groups.get(g);
    if (!a) groups.set(g, (a = []));
    fillPoly(p, 0, white, a, []);
  }
  for (const [, pos] of groups) {
    const verts = new Float32Array(pos);
    const idx = new Uint32Array(pos.length / 3).map((_, i) => i);
    const c = world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(1));
    handles.push(c.handle);
  }
  return handles;
}

export type { XZ };
