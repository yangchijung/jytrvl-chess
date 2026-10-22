// Rush Taxi — turns the hand-made city JSON (loosely Kaohsiung: the Love River across the middle, the harbour and
// the sea to the west) into a level: ground on both sides of the river, bridges, railings, jump ramps, ordinary
// blocks filled from their district's style (Hamasen houses with alleys between them, downtown towers around little
// plazas, Zuoying halls with trees, harbour warehouses), parks with trees, the stunt park, 33 landmarks with name
// boards, passenger stops on every street, the road graph for traffic and sidewalk
// loops for pedestrians. Deterministic: the same JSON always gives the same city.
import CITY from './city.json';
import type { Level, Prim, Rect, Shape, Sign, Tree, Walk } from './level';
import type { Place, Spot } from '../gameplay/rules';

type PrimRow = (string | number)[];
interface LandmarkJson {
  id: string;
  zh: string;
  en: string;
  block: number[];
  door: string;
  prims: PrimRow[];
}
type District = keyof typeof CITY.districts;

const C = { lot: '#D9DCE1', park: '#7CB342', stunt: '#BDBDBD', harborLot: '#CFD8DC', rail: '#ECEFF1', ramp: '#C9A86A', wall: '#B5BCC6', mark: '#F5F5F5', post: '#5D6B78', seawall: '#90A4AE' };
export const DOORS: Record<string, [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };

/** small deterministic hash → [0, 1) */
function h(...k: number[]) {
  let x = 2166136261;
  for (const v of k) {
    x ^= v + 0x9e3779b9 + (x << 6) + (x >>> 2);
    x = Math.imul(x, 16777619);
  }
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
const pick = <T>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];

/** which district a block is in: by quarter (the middle column counts as east) */
export function districtOf(gx: number, gz: number): District {
  const quad = (gz > 0 ? 'N' : 'S') + (gx < 0 ? 'W' : 'E');
  return (Object.keys(CITY.districts) as District[]).find((k) => CITY.districts[k].quad === quad)!;
}

export function cityLevel(): Level {
  const { pitch, road, half, lines, river, spawn } = CITY;
  const lot = pitch - road; // 46
  const rz = river.z;
  const shapes: Shape[] = [];
  const prims: Prim[] = [];
  const lots: Rect[] = [];
  const marks: Rect[] = [];
  const signs: Sign[] = [];
  const trees: Tree[] = [];
  const walks: Walk[] = [];
  const places: Place[] = [];
  let n = 0;
  const box = (p: [number, number, number], size: [number, number, number], color: string, hidden = false) => shapes.push({ kind: 'box', id: `c${n++}`, p, size, color, hidden });

  // ---------- ground, river, bridges, railings, walls ----------
  const depth = 6;
  const landLen = half - rz;
  const ground: Level['ground'] = [
    { p: [0, -depth / 2, rz + landLen / 2], size: [half * 2, depth, landLen] },
    { p: [0, -depth / 2, -rz - landLen / 2], size: [half * 2, depth, landLen] },
  ];
  for (const x of river.bridges) {
    box([x, -0.3, 0], [road, 0.6, rz * 2], '#8A9099');
    box([x - road / 2 - 0.25, 0.5, 0], [0.5, 1, rz * 2], C.rail);
    box([x + road / 2 + 0.25, 0.5, 0], [0.5, 1, rz * 2], C.rail);
  }
  // railings along both banks, open at the bridges and at the jump ramps
  const gaps = [...river.bridges.map((x) => [x - road / 2, x + road / 2]), ...CITY.ramps.map((r) => [r.p[0] - r.size[0] / 2, r.p[0] + r.size[0] / 2])].sort((a, b) => a[0] - b[0]);
  for (const side of [1, -1]) {
    let from = -half;
    for (const [a, b] of [...gaps, [half, half]]) {
      if (a - from > 0.5) box([(from + a) / 2, 0.5, side * (rz + 0.25)], [a - from, 1, 0.5], C.rail);
      from = Math.max(from, b);
    }
  }
  box([0, 1.5, half + 1], [half * 2 + 4, 3, 2], C.wall);
  box([0, 1.5, -half - 1], [half * 2 + 4, 3, 2], C.wall);
  const seaWest = CITY.sea === 'west';
  box([half + 1, 1.5, 0], [2, 3, half * 2], seaWest ? C.wall : C.seawall);
  box([-half - 1, 1.5, 0], [2, 3, half * 2], seaWest ? C.seawall : C.wall);
  // the river's name on both ends of every bridge
  for (const x of river.bridges)
    for (const sz of [1, -1]) {
      const bx = x + road / 2 + 1.5,
        bz = sz * (rz + 3);
      prims.push({ t: 'box', x: bx, y: 1.5, z: bz, sx: 0.3, sy: 3, sz: 0.3, color: C.post });
      signs.push({ id: `river-${x}-${sz}`, name: river.name, x: bx, y: 3.4, z: bz, yaw: sz > 0 ? Math.PI : 0, decor: true });
    }
  for (const r of CITY.ramps) shapes.push({ kind: 'wedge', id: r.id, p: r.p as [number, number, number], size: r.size as [number, number, number], yaw: r.yaw, color: C.ramp });

  // ---------- blocks ----------
  const landmarks = new Map<string, LandmarkJson>((CITY.landmarks as LandmarkJson[]).map((l) => [`${l.block[0]},${l.block[1]}`, l]));
  const parks = new Set(CITY.parks.map((p) => `${p[0]},${p[1]}`));
  const stunt = `${CITY.stuntPark.block[0]},${CITY.stuntPark.block[1]}`;
  const span = Math.round((lines.length - 1) / 2); // blocks from −5 to 5
  for (let gx = -span; gx <= span; gx++)
    for (let gz = -span; gz <= span; gz++) {
      if (gz === 0) continue; // the river
      const cx = gx * pitch,
        cz = gz * pitch;
      if (Math.abs(cx) + lot / 2 > half || Math.abs(cz) + lot / 2 > half) continue;
      const key = `${gx},${gz}`;
      const dist = districtOf(gx, gz);
      const style = CITY.districts[dist] as { style: string; height: number[]; colors: string[] };
      walks.push({ cx, cz, h: lot / 2 - 1.5 });
      const lm = landmarks.get(key);
      if (lm) {
        lots.push({ x: cx, z: cz, w: lot, d: lot, color: C.lot });
        addLandmark(lm, cx, cz);
        continue;
      }
      if (parks.has(key)) {
        lots.push({ x: cx, z: cz, w: lot, d: lot, color: C.park });
        // trees in a loose ring so the middle stays open to drive through (a shortcut)
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + h(gx, gz, k) * 0.5;
          const rr = 14 + h(gx, gz, k, 1) * 6;
          trees.push({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, h: 5 + h(gx, gz, k, 2) * 4 });
        }
        continue;
      }
      if (key === stunt) {
        lots.push({ x: cx, z: cz, w: lot, d: lot, color: C.stunt });
        for (const r of CITY.stuntPark.ramps) shapes.push({ kind: 'wedge', id: r.id, p: [cx + r.p[0], r.p[1], cz + r.p[2]], size: r.size as [number, number, number], yaw: r.yaw, color: C.ramp });
        continue;
      }
      lots.push({ x: cx, z: cz, w: lot, d: lot, color: dist === 'harbor' ? C.harborLot : C.lot });
      const [h0, h1] = style.height;
      const hgt = (k: number) => Math.round(h0 + h(gx, gz, k, 7) * (h1 - h0));
      const col = (k: number) => pick(style.colors, h(gx, gz, k, 3));
      const building = (x: number, z: number, w: number, d: number, k: number) => {
        const y = hgt(k);
        box([cx + x, y / 2, cz + z], [w, y, d], col(k));
      };
      const alongX = h(gx, gz, 11) < 0.5;
      if (style.style === 'alley') {
        // two rows of houses with an alley between them (wide enough to drive through)
        const gap = 8,
          a = (lot - 6 - gap) / 2,
          off = gap / 2 + a / 2;
        for (const s of [-1, 1]) {
          // each row is two or three houses of different heights
          const parts = 2 + Math.floor(h(gx, gz, s, 5) * 2);
          const len = lot - 6;
          for (let k = 0; k < parts; k++) {
            const seg = len / parts,
              mid = -len / 2 + seg * (k + 0.5);
            if (alongX) building(mid, s * off, seg - 0.6, a, k * 2 + (s > 0 ? 1 : 0));
            else building(s * off, mid, a, seg - 0.6, k * 2 + (s > 0 ? 1 : 0));
          }
        }
      } else if (style.style === 'towers') {
        if (h(gx, gz, 13) < 0.3) building(0, 0, 32, 32, 0);
        else for (const [i, [sx, sz]] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].entries()) building(sx * 11.5, sz * 11.5, 14, 14, i);
      } else if (style.style === 'campus') {
        if (alongX) building(0, 0, 32, 18, 0);
        else building(0, 0, 18, 32, 0);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) trees.push({ x: cx + sx * 18.5, z: cz + sz * 18.5, h: 5 + h(gx, gz, sx, sz) * 3 });
      } else {
        // warehouses: two long sheds with a loading lane between
        const off = 10.5;
        for (const s of [-1, 1]) {
          if (alongX) building(0, s * off, 38, 14, s > 0 ? 1 : 0);
          else building(s * off, 0, 14, 38, s > 0 ? 1 : 0);
        }
      }
    }

  function addLandmark(lm: LandmarkJson, cx: number, cz: number) {
    for (const row of lm.prims) {
      const [t, x, y, z] = row as [string, number, number, number];
      const X = cx + x,
        Z = cz + z;
      const color = row[row.length - (t === 'tor' ? 2 : 1)] as string;
      let p: Prim;
      if (t === 'box') {
        const [sx, sy, sz] = row.slice(4, 7) as number[];
        p = { t, x: X, y, z: Z, sx, sy, sz, color };
        if (y - sy / 2 < 4 && sy > 0.3) box([X, y, Z], [sx, sy, sz], color, true);
      } else if (t === 'cyl' || t === 'cone') {
        const [r, hh] = row.slice(4, 6) as number[];
        p = { t, x: X, y, z: Z, r, h: hh, color };
        if (y - Math.abs(hh) / 2 < 4 && Math.abs(hh) > 0.3) shapes.push({ kind: 'cyl', id: `c${n++}`, p: [X, y, Z], r: t === 'cone' ? r * 0.6 : r, h: Math.abs(hh), color, hidden: true });
      } else if (t === 'sph') {
        const r = row[4] as number;
        p = { t, x: X, y, z: Z, r, color };
        if (y - r < 3) shapes.push({ kind: 'ball', id: `c${n++}`, p: [X, y, Z], r, color, hidden: true });
      } else {
        const [R, tube] = row.slice(4, 6) as number[];
        p = { t: 'tor', x: X, y, z: Z, R, tube, color, yaw: (row[7] as number) ?? 0 };
      }
      prims.push(p);
    }
    // the name board on a post at the edge of the lot, facing the door's street
    const [dx, dz] = DOORS[lm.door];
    const bx = cx + dx * (lot / 2 - 0.5),
      bz = cz + dz * (lot / 2 - 0.5);
    prims.push({ t: 'box', x: bx, y: 2.5, z: bz, sx: 0.35, sy: 5, sz: 0.35, color: C.post });
    // a blade sign, across the pavement, so traffic from both directions can read it
    signs.push({ id: lm.id, name: { zh: lm.zh, en: lm.en }, x: bx - dx * 2.5, y: 5.6, z: bz - dz * 2.5, yaw: Math.atan2(dx, dz) + Math.PI / 2 });
    // drop-off point: the near lane of the door's street
    places.push({ id: lm.id, name: { zh: lm.zh, en: lm.en }, x: cx + dx * (pitch / 2 - 5), z: cz + dz * (pitch / 2 - 5) });
  }

  // ---------- road graph: every crossing; north–south streets cross the river only on bridges ----------
  const avoid = CITY.ramps.map((r) => ({ x: r.p[0], z: r.p[2], r: 7 }));
  const nodes: { x: number; z: number }[] = [];
  const idx = new Map<string, number>();
  for (const x of lines)
    for (const z of lines) {
      idx.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z });
    }
  const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const vx = b.x - a.x,
      vz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(a.x + vx * t - p.x, a.z + vz * t - p.z);
  };
  const edges: [number, number][] = [];
  const addEdge = (a: number, b: number) => {
    if (avoid.some((v) => segDist(v, nodes[a], nodes[b]) < v.r)) return;
    edges.push([a, b]);
  };
  for (let i = 0; i < lines.length; i++)
    for (let j = 0; j + 1 < lines.length; j++) {
      addEdge(idx.get(`${lines[j]},${lines[i]}`)!, idx.get(`${lines[j + 1]},${lines[i]}`)!); // along x
      const z0 = lines[j],
        z1 = lines[j + 1];
      if (z0 < 0 && z1 > 0 && !river.bridges.includes(lines[i])) continue; // no bridge here
      addEdge(idx.get(`${lines[i]},${z0}`)!, idx.get(`${lines[i]},${z1}`)!); // along z
    }

  // ---------- road markings: dashed centre lines ----------
  for (const [a, b] of edges) {
    const A = nodes[a],
      B = nodes[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / len,
      uz = (B.z - A.z) / len;
    for (let s = road / 2 + 2; s + 3 < len - road / 2; s += 6) {
      const x = A.x + ux * (s + 1.5),
        z = A.z + uz * (s + 1.5);
      marks.push({ x, z, w: ux ? 3 : 0.3, d: uz ? 3 : 0.3, color: C.mark });
    }
  }

  // ---------- passenger stops: the middle of every street, both kerbs (not on bridges, not at the ramps) ----------
  const stops: Spot[] = [];
  for (const [a, b] of edges) {
    const A = nodes[a],
      B = nodes[b];
    const mx = (A.x + B.x) / 2,
      mz = (A.z + B.z) / 2;
    if (Math.abs(mz) < rz + 1) continue; // a bridge
    const ux = Math.sign(B.x - A.x),
      uz = Math.sign(B.z - A.z);
    for (const s of [1, -1]) {
      const lx = -uz * s,
        lz = ux * s; // sideways
      // on a riverside street the river side has no kerb to stand on
      const kz = mz + lz * 8.5;
      if (Math.abs(kz) < rz + 2) continue;
      stops.push({ id: `s${stops.length}`, x: mx + lx * 4.5, z: mz + lz * 4.5, cx: mx + lx * 8.5, cz: kz });
    }
  }

  return {
    id: 'city',
    bounds: half,
    ground,
    water: { y: river.water, floor: river.floor, x0: -half, x1: half, z0: -rz, z1: rz },
    shapes,
    prims,
    lots,
    marks,
    signs,
    trees,
    stops,
    places,
    spawn: { p: { x: spawn.p[0], y: spawn.p[1], z: spawn.p[2] }, yaw: spawn.yaw },
    graph: { nodes, edges },
    walks,
    avoid,
  };
}
