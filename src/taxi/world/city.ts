// Rush Taxi — turns the hand-made city JSON (loosely Kaohsiung: the Love River across the middle, the harbour and
// the sea to the west) into a level: ground on both sides of the river, bridges, railings, jump ramps, ordinary
// blocks filled from their district's style (Hamasen houses with alleys between them, downtown towers around little
// plazas, Zuoying halls with trees, harbour warehouses), parks with trees, the stunt park, 33 landmarks with name
// boards, passenger stops on every street, the road graph for traffic and sidewalk
// loops for pedestrians. Deterministic: the same JSON always gives the same city.
import CITY from './city.json';
import type { Decor, Level, Prim, Rect, Shape, Sign, Tree, Walk } from './level';
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

const C = { lot: '#D6CCBC', park: '#72B544', stunt: '#C9BCA4', harborLot: '#C4C2B8', rail: '#F1EEE6', ramp: '#D2A55E', wall: '#CFC4B2', mark: '#F7F5EE', post: '#5D6B78', seawall: '#93A5A3' };
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

/** generic shop words for the vertical signboards (no brands) */
export const SHOP_WORDS = ['小吃', '牙醫', '診所', '藥局', '早餐', '麵店', '書局', '機車行', '眼鏡', '冰品', '便當', '洗衣', '五金', '茶行', '水果', '文具', '髮廊', '鞋店', '海產', '旅社', '鐘錶', '電器', '豆花', '肉圓'];
export const SIGN_COLORS = [
  ['#C62828', '#FFFFFF'],
  ['#F9A825', '#23303F'],
  ['#1565C0', '#FFFFFF'],
  ['#FFFFFF', '#C62828'],
  ['#2E7D32', '#FFFFFF'],
  ['#FFFFFF', '#1565C0'],
];
const LOOK: Record<string, number> = { alley: 0, towers: 1, campus: 2, warehouses: 3 };

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
  const blds: { x: number; z: number; w: number; d: number; h: number; look: number; cx: number; cz: number; gx: number; gz: number; k: number }[] = [];
  const shopBlocks: { cx: number; cz: number; gx: number; gz: number; dist: District }[] = [];
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
      walks.push({ cx, cz, h: lot / 2 - 2.4 }); // between the house fronts and the parked scooters
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
      shopBlocks.push({ cx, cz, gx, gz, dist });
      const [h0, h1] = style.height;
      const hgt = (k: number) => Math.round(h0 + h(gx, gz, k, 7) * (h1 - h0));
      const col = (k: number) => pick(style.colors, h(gx, gz, k, 3));
      const building = (x: number, z: number, w: number, d: number, k: number) => {
        const y = hgt(k);
        const look = LOOK[style.style] ?? 0;
        shapes.push({ kind: 'box', id: `c${n++}`, p: [cx + x, y / 2, cz + z], size: [w, y, d], color: col(k), look });
        blds.push({ x: cx + x, z: cz + z, w, d, h: y, look, cx, cz, gx, gz, k });
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
    for (let s = road / 2 + 6; s + 3 < len - road / 2 - 5; s += 6) {
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

  const decor = makeDecor();
  // palm trunks are solid
  for (const p of decor.palms) shapes.push({ kind: 'cyl', id: `c${n++}`, p: [p.x, 2, p.z], r: 0.3, h: 4, color: '#8D6E63', hidden: true });

  function makeDecor(): Decor {
    const d: Decor = { tanks: [], sheds: [], acs: [], shopSigns: [], scooters: [], lamps: [], signals: [], palms: [], curbs: [], boats: [] };
    const SHED = ['#5B8DB8', '#D9DCE1', '#8FA3B5', '#4F7D5C', '#B0BEC5'];
    const SCOOT = ['#E53935', '#FFFFFF', '#1E88E5', '#212121', '#FDD835', '#90A4AE', '#8E24AA', '#43A047'];
    for (const b of blds) {
      const r = (...k: number[]) => h(b.gx, b.gz, b.k, ...k);
      // the faces that look onto a street: near the lot edge, facing out of the block
      const faces: { nx: number; nz: number; cx: number; cz: number; len: number }[] = [];
      const rx = b.x - b.cx,
        rz2 = b.z - b.cz;
      if (rx + b.w / 2 > 12) faces.push({ nx: 1, nz: 0, cx: b.x + b.w / 2, cz: b.z, len: b.d });
      if (rx - b.w / 2 < -12) faces.push({ nx: -1, nz: 0, cx: b.x - b.w / 2, cz: b.z, len: b.d });
      if (rz2 + b.d / 2 > 12) faces.push({ nx: 0, nz: 1, cx: b.x, cz: b.z + b.d / 2, len: b.w });
      if (rz2 - b.d / 2 < -12) faces.push({ nx: 0, nz: -1, cx: b.x, cz: b.z - b.d / 2, len: b.w });
      faces.forEach((f, fi) => {
        const tx = -f.nz,
          tz = f.nx; // along the face
        // shop signboards: old town and downtown, above the arcade
        if ((b.look === 0 || b.look === 1) && b.h >= 7) {
          const count = Math.min(3, Math.floor(f.len / 4.5));
          for (let i = 0; i < count; i++) {
            if (r(fi, i, 1) < 0.25) continue;
            const t = (((i + 0.5) / count) - 0.5) * (f.len - 2) + (r(fi, i, 2) - 0.5) * 1.2;
            d.shopSigns.push({ x: f.cx + tx * t + f.nx * 0.65, y: 5.2 + r(fi, i, 3) * 1.2, z: f.cz + tz * t + f.nz * 0.65, yaw: Math.atan2(tx, tz), word: Math.floor(r(fi, i, 4) * SHOP_WORDS.length), color: Math.floor(r(fi, i, 5) * SIGN_COLORS.length) });
          }
        }
        // air conditioners on the upper floors (not on glass towers)
        if (b.look !== 1) {
          const floors = Math.max(0, Math.floor((b.h - 3.4) / 3));
          const count = Math.min(6, Math.floor(f.len / 4) * floors > 0 ? 2 + Math.floor(r(fi, 6) * 4) : 0);
          for (let i = 0; i < count; i++) {
            const fl = Math.floor(r(fi, i, 7) * floors);
            const t = (r(fi, i, 8) - 0.5) * (f.len - 2);
            d.acs.push({ x: f.cx + tx * t + f.nx * 0.24, y: 3.6 + fl * 3 + 0.5, z: f.cz + tz * t + f.nz * 0.24, yaw: Math.atan2(f.nx, f.nz) });
          }
        }
      });
      // rooftops: water tanks (houses, halls, warehouses) and sheet-metal extensions (old town)
      if (b.look !== 1) {
        const tanks = 1 + (r(9) < 0.5 ? 1 : 0);
        for (let i = 0; i < tanks; i++) d.tanks.push({ x: b.x + (r(10, i) - 0.5) * (b.w - 3), y: b.h, z: b.z + (r(11, i) - 0.5) * (b.d - 3) });
      }
      if (b.look === 0 && r(12) < 0.45) {
        const w = b.w * 0.55,
          dd = b.d * 0.55;
        const sx = r(13) < 0.5 ? -1 : 1,
          sz = r(14) < 0.5 ? -1 : 1;
        d.sheds.push({ x: b.x + sx * (b.w - w) / 2, y: b.h, z: b.z + sz * (b.d - dd) / 2, w, d: dd, h: 2.4, color: SHED[Math.floor(r(15) * SHED.length)] });
      }
    }
    // the pavement of each ordinary block: scooters parked nose to the kerb, a lamp per side, painted kerbs
    for (const blk of shopBlocks) {
      const sides: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      sides.forEach(([nx, nz], si) => {
        const tx = -nz,
          tz = nx;
        const e = lot / 2;
        // a river-side street has no kerb on the river side to worry about: blocks never face the river directly
        d.lamps.push({ x: blk.cx + nx * (e - 0.5) + tx * 12, z: blk.cz + nz * (e - 0.5) + tz * 12, yaw: Math.atan2(nx, nz) });
        const kerbCol = blk.dist === 'downtown' ? '#C62828' : blk.dist === 'hamasen' ? '#F2C230' : '#C9CDD2';
        d.curbs.push({ x: blk.cx + nx * (e - 0.15), z: blk.cz + nz * (e - 0.15), w: nx ? 0.3 : lot, d: nx ? lot : 0.3, color: kerbCol });
        if (blk.dist !== 'hamasen' && blk.dist !== 'downtown') return;
        // rows of scooters, clear of the stop in the middle of the side, the lamp and the corners
        for (const [a, b2] of [
          [-18.5, -5],
          [5, 18.5],
        ]) {
          if (h(blk.gx, blk.gz, si, a) < 0.4) continue;
          const from = a + h(blk.gx, blk.gz, si, a, 1) * 3,
            to = b2 - h(blk.gx, blk.gz, si, a, 2) * 3;
          for (let t = from; t <= to; t += 0.9) {
            if (Math.abs(t - 12) < 1.2) continue;
            if (h(blk.gx, blk.gz, si, Math.round(t * 10)) < 0.2) continue; // a gap here and there
            d.scooters.push({ x: blk.cx + nx * (e - 1.0) + tx * t, z: blk.cz + nz * (e - 1.0) + tz * t, yaw: Math.atan2(nx, nz), color: SCOOT[Math.floor(h(blk.gx, blk.gz, si, Math.round(t * 10), 3) * SCOOT.length)] });
          }
        }
      });
    }
    // traffic lights at every crossing with three or more streets: one head on the far right corner for each
    // direction of travel (as in Taiwan)
    const deg = nodes.map(() => 0);
    for (const [a, b] of edges) deg[a]++, deg[b]++;
    nodes.forEach((nd, i) => {
      if (deg[i] < 3) return;
      const o = road / 2 + 1.2;
      d.signals.push({ x: nd.x + o, z: nd.z + o, yaw: -Math.PI / 2, axis: 'x' }); // for traffic heading +x
      d.signals.push({ x: nd.x - o, z: nd.z - o, yaw: Math.PI / 2, axis: 'x' }); // heading −x
      d.signals.push({ x: nd.x - o, z: nd.z + o, yaw: Math.PI, axis: 'z' }); // heading +z
      d.signals.push({ x: nd.x + o, z: nd.z - o, yaw: 0, axis: 'z' }); // heading −z
    });
    // palms: along both river promenades and on the harbour's corners
    for (let x = -330; x <= 330; x += 22) {
      if (river.bridges.some((b) => Math.abs(x - b) < 11) || CITY.ramps.some((rr) => Math.abs(x - rr.p[0]) < 9)) continue;
      for (const sz of [1, -1]) d.palms.push({ x, z: sz * (rz + 2.6), h: 7 + h(x, sz) * 3 });
    }
    for (const blk of shopBlocks)
      if (blk.dist === 'harbor')
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          d.palms.push({ x: blk.cx + sx * (lot / 2 - 1.2), z: blk.cz + sz * (lot / 2 - 1.2), h: 6 + h(blk.gx, blk.gz, sx, sz) * 3 });
    // Love River cruise boats
    d.boats = [
      { z: 7, x0: -320, x1: 320, speed: 4, color: '#E53935' },
      { z: -7, x0: -320, x1: 320, speed: 3.2, color: '#1E88E5' },
      { z: 6, x0: -320, x1: 320, speed: 3.6, color: '#FFB300' },
    ];
    return d;
  }

  // crossings: zebra stripes before every crossing and a stop line on the approaching lane
  for (const [a, b] of edges)
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const A = nodes[from],
        B = nodes[to];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const ux = (B.x - A.x) / len,
        uz = (B.z - A.z) / len;
      const cx = B.x - ux * (road / 2 + 2.4),
        cz = B.z - uz * (road / 2 + 2.4);
      for (let s2 = -road / 2 + 1; s2 <= road / 2 - 1; s2 += 1.1) marks.push({ x: cx - uz * s2, z: cz + ux * s2, w: ux ? 3 : 0.55, d: uz ? 3 : 0.55, color: C.mark });
      // stop line across the right-hand lane only
      const sx = B.x - ux * (road / 2 + 4.6) - uz * 3.5,
        sz = B.z - uz * (road / 2 + 4.6) + ux * 3.5;
      marks.push({ x: sx, z: sz, w: ux ? 0.4 : 6.4, d: uz ? 0.4 : 6.4, color: C.mark });
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
    decor,
  };
}
