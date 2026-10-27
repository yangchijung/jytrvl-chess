import * as THREE from 'three';
// Rush Taxi — the real-map city's transit landmarks, modelled in detail with free geometry (Kit.mesh):
// - Kaohsiung Station (2024): the vast, low canopy with a planted roof that dips into glazed funnels on slender columns;
// - the old Kaohsiung Station (1941, Imperial Crown style): cream masonry under hipped-and-gabled tiled roofs, a clock;
// - Sankuaicuo Station (1923): a small timber station under a dark tiled roof;
// - Gushan Station: a light station hall under a shallow arched roof;
// - Formosa Boulevard Station: the four glass entrance pavilions whose roofs fold up like hands at prayer;
// - the Exhibition Center: the long harbourside hall under its wave roof.
// The placement (fitting to the mapped footprint, keeping clear of roads and water) is the shared logic of landmarks.ts.
import {
  C, CLEAR, Kit, faceRoad, fitRect, footProblem, footSamples, formosaJunction, place, pointInRing, rectOfRing, rectRing,
  type Builder, type Ctx, type Model, type Rect,
} from '../landmarks';

type V = [number, number, number];

// ---------------------------------------------------------------------------------------------------------------
// free geometry: triangles with vertex colours and night glow, faces turned to the outside
// ---------------------------------------------------------------------------------------------------------------
export class Geo {
  pos: number[] = [];
  col: number[] = [];
  glow: number[] = [];
  private cc = new Map<string, THREE.Color>();
  private rgb(s: string) {
    let c = this.cc.get(s);
    if (!c) this.cc.set(s, (c = new THREE.Color(s)));
    return c;
  }
  /** one triangle; `g` is the night glow, for the whole triangle or per corner */
  tri(a: V, b: V, c: V, color: string, g: number | [number, number, number] = 0) {
    const k = this.rgb(color);
    [a, b, c].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(k.r, k.g, k.b);
      this.glow.push(typeof g === 'number' ? g : g[i]);
    });
  }
  /** a flat (or nearly flat) polygon, fanned from its first corner, its front face turned towards the direction `out`;
   * the glow for the whole polygon or per corner */
  poly(pts: V[], color: string, out: V, g: number | number[] = 0) {
    let nx = 0,
      ny = 0,
      nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    const p = flip ? [...pts].reverse() : pts;
    const gl = typeof g === 'number' ? null : flip ? [...g].reverse() : g;
    for (let i = 1; i + 1 < p.length; i++) this.tri(p[0], p[i], p[i + 1], color, gl ? [gl[0], gl[i], gl[i + 1]] : (g as number));
  }
  /** an axis-aligned box from its foot centre */
  box(x: number, y0: number, z: number, sx: number, sy: number, sz: number, color: string, g = 0) {
    const a = sx / 2,
      c = sz / 2,
      y1 = y0 + sy;
    const P = (i: number, j: number, k: number): V => [x + i * a, j ? y1 : y0, z + k * c];
    this.poly([P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)], color, [0, 1, 0], g);
    this.poly([P(-1, 0, -1), P(1, 0, -1), P(1, 0, 1), P(-1, 0, 1)], color, [0, -1, 0], g);
    this.poly([P(1, 0, -1), P(1, 1, -1), P(1, 1, 1), P(1, 0, 1)], color, [1, 0, 0], g);
    this.poly([P(-1, 0, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, 0, 1)], color, [-1, 0, 0], g);
    this.poly([P(-1, 0, 1), P(1, 0, 1), P(1, 1, 1), P(-1, 1, 1)], color, [0, 0, 1], g);
    this.poly([P(-1, 0, -1), P(1, 0, -1), P(1, 1, -1), P(-1, 1, -1)], color, [0, 0, -1], g);
  }
  /** a quad split along its a→b / d→c edges into bays: a frame strip, then a pane, …, and a closing frame strip */
  bays(a: V, b: V, c: V, d: V, n: number, frame: number, pane: (i: number) => [string, number], frameColor: string, out: V) {
    const lerp = (p: V, q: V, t: number): V => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    const f = Math.min(0.3, frame / len);
    const w = (1 - f * (n + 1)) / n;
    let t = 0;
    for (let i = 0; i <= n; i++) {
      this.poly([lerp(a, b, t), lerp(a, b, t + f), lerp(d, c, t + f), lerp(d, c, t)], frameColor, out);
      t += f;
      if (i === n) break;
      const [pc, pg] = pane(i);
      this.poly([lerp(a, b, t), lerp(a, b, t + w), lerp(d, c, t + w), lerp(d, c, t)], pc, out, pg);
      t += w;
    }
  }
  get triangles() {
    return this.pos.length / 9;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    return g;
  }
}

const T = {
  cream: '#E8DDC0',
  creamDark: '#D6C8A6',
  tile: '#4E5A55',
  tileDark: '#3C4743',
  ridge: '#33393A',
  soffit: '#8A8478',
  window: '#3F5566',
  frame: '#F2EEE2',
  timber: '#5E4634',
  timberLight: '#8C6A4C',
  garden: '#6F9650',
  garden2: '#7DA35B',
  path: '#CFC8B8',
  skylight: '#A8C8D8',
  canopyUnder: '#ECEEEA',
  canopyEdge: '#F6F7F3',
  pavGlass: '#8DB6CC',
  pavGlass2: '#77A2BC',
  pavFrame: '#39434C',
  door: '#2A3036',
  lamp: '#F4E3B5',
  roofWhite: '#F3F4F1',
  roofGrey: '#D5DBDF',
  roofUnder: '#C9CED2',
};
/** glass tinted by the Dome of Light's stained glass below: close to plain glass by day, its colours glow at night */
const DOME = ['#C4AC74', '#B98A84', '#7E9AC6', '#84AE96'];

// ---------------------------------------------------------------------------------------------------------------
// the hipped-and-gabled roof (入母屋): eaves L × W at y 0 with the corners turned up, hips to h1, a gable to the ridge
// ---------------------------------------------------------------------------------------------------------------
/** ridge along local x (u) unless `alongV`; the geometry is centred on its own foot */
export function irimoya(L: number, W: number, H: number, o: { alongV?: boolean; tile?: string; gable?: string; lift?: number; hip?: number } = {}) {
  const g = new Geo();
  const tile = o.tile ?? T.tile,
    gable = o.gable ?? T.cream;
  // build with the ridge along x, then swap for a ridge along z
  const [l, w] = o.alongV ? [W, L] : [L, W];
  const P = (x: number, y: number, z: number): V => (o.alongV ? [z, y, x] : [x, y, z]);
  const O = (x: number, y: number, z: number): V => (o.alongV ? [z, y, x] : [x, y, z]);
  const lift = o.lift ?? 0;
  const a = Math.min(l * 0.24, w * 0.45) * (o.hip ?? 1);
  const h1 = H * 0.46;
  const b = (h1 / H) * (w / 2);
  const E = (i: number, k: number) => P((i * l) / 2, lift, (k * w) / 2);
  const I = (i: number, k: number) => P(i * (l / 2 - a), h1, k * (w / 2 - b));
  const R = (i: number) => P(i * (l / 2 - a), H, 0);
  // each long slope: the hipped band along the eaves, and the gabled part above it (convex pieces)
  for (const k of [-1, 1]) {
    g.poly([E(-1, k), E(1, k), I(1, k), I(-1, k)], tile, O(0, 0.6, k));
    g.poly([I(-1, k), I(1, k), R(1), R(-1)], tile, O(0, 0.6, k));
  }
  for (const i of [-1, 1]) {
    g.poly([E(i, 1), E(i, -1), I(i, -1), I(i, 1)], tile, O(i, 0.6, 0));
    g.poly([I(i, 1), I(i, -1), R(i)], gable, O(i, 0, 0));
    // the gable's barge boards, just proud of the gable
    const gx = i * (l / 2 - a + 0.06);
    for (const k of [-1, 1]) g.poly([P(gx, h1, k * (w / 2 - b)), P(gx, H, 0), P(gx, H - 0.45, 0), P(gx, h1 - 0.02, k * (w / 2 - b - 0.5))], T.tileDark, O(i, 0, 0));
  }
  g.poly([E(-1, -1), E(1, -1), E(1, 1), E(-1, 1)], T.soffit, [0, -1, 0]);
  // the ridge and its end tiles (鬼瓦)
  const rl = 2 * (l / 2 - a) + 0.4;
  if (o.alongV) {
    g.box(0, H - 0.2, 0, 0.55, 0.5, rl, T.ridge);
    for (const i of [-1, 1]) g.box(0, H - 0.2, i * (rl / 2), 0.7, 0.95, 0.5, T.ridge);
  } else {
    g.box(0, H - 0.2, 0, rl, 0.5, 0.55, T.ridge);
    for (const i of [-1, 1]) g.box(i * (rl / 2), H - 0.2, 0, 0.5, 0.95, 0.7, T.ridge);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// the old Kaohsiung Station (1941): Imperial Crown style — a western masonry body under a tall Japanese tiled roof
// ---------------------------------------------------------------------------------------------------------------
/** the station front: L along the street, W deep, +v is the front */
export function imperialCrown(k: Kit, L: number, W: number) {
  const cL = Math.max(9, Math.min(15, L * 0.42)),
    wL = (L - cL) / 2;
  const cH = 9.2,
    wH = 6.2,
    wW = W * 0.82,
    wv = -W * 0.06;
  k.box(0, 0, 0, L + 0.6, W + 0.6, 0.7, C.stone);
  // the central hall, its cornice and the crown: a hipped-and-gabled roof with the gable to the front
  k.box(0, 0, 0.7, cL, W, cH, T.cream, { solid: true });
  k.box(0, 0, 0.7 + cH - 0.6, cL + 0.5, W + 0.5, 0.6, T.creamDark);
  k.box(0, 0, 0.7, cL + 0.4, W + 0.4, 0.9, T.creamDark);
  k.mesh(0, 0, 0.7 + cH, irimoya(cL + 2.6, W + 2.6, 7.6, { alongV: true }).geometry());
  // tall windows on the central hall's front, either side of the clock, and on its back
  for (const s of [-1, 1]) {
    for (const f of [-1, 1]) {
      k.box(s * cL * 0.3, f * (W / 2 + 0.05), 5.4, 1.5, 0.12, 3.2, T.window);
      k.box(s * cL * 0.3, f * (W / 2 + 0.08), 5.2, 1.9, 0.08, 0.25, T.frame);
    }
  }
  // the clock above the entrance
  const cg = new Geo();
  cg.box(0, -1.15, 0, 2.3, 2.3, 0.24, T.creamDark);
  const ring: V[] = [],
    face: V[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push([Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.16]);
    face.push([Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.19]);
  }
  cg.poly(ring, T.ridge, [0, 0, 1]);
  cg.poly(face, '#F7F3E6', [0, 0, 1], 0.55);
  cg.poly([[-0.05, 0, 0.22], [0.05, 0, 0.22], [0.05, 0.75, 0.22], [-0.05, 0.65, 0.22]], T.ridge, [0, 0, 1]);
  cg.poly([[0, -0.05, 0.22], [0.48, -0.05, 0.22], [0.48, 0.05, 0.22], [0, 0.05, 0.22]], T.ridge, [0, 0, 1]);
  k.mesh(0, W / 2 + 0.12, 8.05, cg.geometry());
  // the wings: lower, set back, with a row of tall windows between pilasters and their own tiled roofs
  for (const s of [-1, 1]) {
    const u = s * (cL / 2 + wL / 2);
    k.box(u, wv, 0.7, wL, wW, wH, T.cream, { solid: true });
    k.box(u, wv, 0.7 + wH - 0.5, wL + 0.3, wW + 0.3, 0.5, T.creamDark);
    const n = Math.max(1, Math.floor(wL / 2.8));
    const pitch = wL / n;
    for (let i = 0; i < n; i++) {
      const wu = u - wL / 2 + pitch * (i + 0.5);
      for (const f of [-1, 1]) k.box(wu, wv + f * (wW / 2 + 0.05), 1.9, 1.2, 0.12, 3.0, T.window);
      k.box(wu - pitch / 2, wv + wW / 2 + 0.1, 0.7, 0.45, 0.2, wH - 0.5, T.creamDark);
    }
    // the wing's end wall: two windows
    for (const e of [-0.22, 0.22]) k.box(s * (L / 2 + 0.05), wv + e * wW, 1.9, 0.12, 1.2, 3.0, T.window);
    k.mesh(u, wv, 0.7 + wH, irimoya(wL + 1.4, wW + 1.8, 3.6, { hip: 0.7 }).geometry());
  }
  // the entrance porch: three openings under a small tiled roof
  const pL = cL * 0.62,
    pv = W / 2 + 1.5;
  k.box(0, pv, 0.7, pL, 3, 4.2, T.cream);
  for (const i of [-1, 0, 1]) k.box((i * pL) / 3.2, pv + 1.55, 0.7, 1.7, 0.12, 2.9, T.door);
  k.box(0, pv, 4.9, pL + 0.4, 3.4, 0.35, T.creamDark);
  k.mesh(0, pv, 5.25, irimoya(pL + 1.2, 4.2, 1.5).geometry());
}
export const oldstation: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 34, W: 13 }, { ring: null });
  const p = lm.poly ? rectOfRing(lm.poly) : null;
  // keep the mapped centre; the mapped polygon is the deep central hall, so the wings run across its long side
  const base: Rect | null = p ? fitRect(ctx.site, { ...p, ang: p.ang + Math.PI / 2, L: 34, W: 13 }, CLEAR, 14, 10) : r;
  if (!base) return null;
  const f = faceRoad(ctx.site, base, true);
  const k = new Kit(m.id, f.cx, f.cz, f.ang);
  imperialCrown(k, f.L, f.W);
  // the building and the entrance porch at its front
  const [px, pz] = k.at(0, 1.9);
  m.covers.push(rectRing({ ...f, cx: px, cz: pz, W: f.W + 3.8 }));
  return [k];
};

// ---------------------------------------------------------------------------------------------------------------
// Kaohsiung Station (2024): the canopy
// ---------------------------------------------------------------------------------------------------------------
/** a rounded rectangle's outline point for a grid point (s, t) in [-1, 1]² (concentric squircle mapping) */
function squircle(s: number, t: number, L: number, W: number, seed: number): [number, number, number] {
  const r = Math.max(Math.abs(s), Math.abs(t));
  if (r < 1e-9) return [0, 0, 0];
  const dx = s / r,
    dy = t / r;
  const n = 4;
  const k = Math.pow(Math.pow(Math.abs(dx), n) + Math.pow(Math.abs(dy), n), -1 / n);
  const th = Math.atan2(dy, dx);
  const wob = 1 + 0.025 * Math.sin(th * 5 + seed) * r ** 3;
  return [r * k * dx * (L / 2) * wob, r * k * dy * (W / 2) * wob, r];
}
export interface Funnel {
  u: number;
  v: number;
}
/** the canopy: a thin undulating slab, planted on top, white beneath, dipping into glazed funnels onto the columns */
export function canopyGeo(L: number, W: number, funnels: Funnel[], o: { base?: number; NI?: number; NJ?: number; seed?: number } = {}) {
  const NI = o.NI ?? 44,
    NJ = o.NJ ?? 30,
    base = o.base ?? 14.5,
    seed = o.seed ?? 0.7;
  const bottom = 7.3;
  const RF = 7;
  const grid: { u: number; v: number; top: number; bot: number; w: number }[][] = [];
  for (let i = 0; i <= NI; i++) {
    const row: (typeof grid)[number] = [];
    for (let j = 0; j <= NJ; j++) {
      const [u, v, r] = squircle(-1 + (2 * i) / NI, -1 + (2 * j) / NJ, L, W, seed);
      let y = base + 1.3 * Math.sin((u / L) * Math.PI * 3 + seed) * Math.cos((v / W) * Math.PI * 1.2) + 0.6 * Math.sin((v / W) * Math.PI * 2 + (u / L) * 3);
      let w = 0;
      for (const f of funnels) w = Math.max(w, Math.exp(-((Math.hypot(u - f.u, v - f.v) / RF) ** 2)));
      y -= (y - bottom) * w;
      // the edge rises slightly and thins: the roof floats
      y += 0.5 * r ** 6;
      const th = 0.5 + 0.7 * (1 - r ** 4);
      row.push({ u, v, top: y, bot: y - th, w });
    }
    grid.push(row);
  }
  const g = new Geo();
  for (let i = 0; i < NI; i++)
    for (let j = 0; j < NJ; j++) {
      const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
      const w = (q[0].w + q[1].w + q[2].w + q[3].w) / 4;
      const r = Math.max(Math.abs(-1 + (2 * i + 1) / NI), Math.abs(-1 + (2 * j + 1) / NJ));
      // top: the glazed funnel bowls, a white rim at the edge, garden beds and footpaths between
      const top = w > 0.4 ? T.skylight : r > 0.95 ? T.canopyEdge : j % 7 === 3 || i % 11 === 5 ? T.path : (i + j) % 3 ? T.garden : T.garden2;
      g.poly(q.map((p): V => [p.u, p.top, p.v]), top, [0, 1, 0]);
      // beneath: white, lit softly round the funnels at night
      g.poly(q.map((p): V => [p.u, p.bot, p.v]), T.canopyUnder, [0, -1, 0], q.map((p) => 0.3 * p.w ** 3));
    }
  // the thin edge all round
  const edge = (p: (typeof grid)[number][number], q: (typeof grid)[number][number]) => {
    const mx = (p.u + q.u) / 2,
      mz = (p.v + q.v) / 2;
    g.poly([[p.u, p.bot, p.v], [q.u, q.bot, q.v], [q.u, q.top, q.v], [p.u, p.top, p.v]], T.canopyEdge, [mx, 0, mz]);
  };
  for (let i = 0; i < NI; i++) {
    edge(grid[i][0], grid[i + 1][0]);
    edge(grid[i][NJ], grid[i + 1][NJ]);
  }
  for (let j = 0; j < NJ; j++) {
    edge(grid[0][j], grid[0][j + 1]);
    edge(grid[NI][j], grid[NI][j + 1]);
  }
  return g;
}
export const mainstation: Builder = (ctx, lm, m) => {
  const bi = ctx.data.buildings.findIndex((b) => b.kind === 'train_station' && Math.hypot(b.obb[0] - lm.x, b.obb[1] - lm.z) < 60);
  const b = bi >= 0 ? ctx.data.buildings[bi] : null;
  const R0: Rect = b ? { cx: b.obb[0], cz: b.obb[1], L: b.obb[2], W: b.obb[3], ang: b.obb[4] } : { cx: lm.x, cz: lm.z, L: 120, W: 80, ang: 0 };
  // the old station stands in the canopy's opening: keep the canopy to the north of it
  const old = ctx.data.landmarks.find((l) => l.id === 'oldstation');
  const k0 = new Kit(m.id, R0.cx, R0.cz, R0.ang);
  const loc = (x: number, z: number) => {
    const dx = x - R0.cx,
      dz = z - R0.cz;
    return [dx * Math.cos(R0.ang) + dz * Math.sin(R0.ang), -dx * Math.sin(R0.ang) + dz * Math.cos(R0.ang)];
  };
  let u0 = -R0.L / 2 + 8,
    u1 = R0.L / 2 - 8;
  if (old) {
    const [ou] = loc(old.x, old.z);
    if (ou > 0) u1 = Math.min(u1, ou - 26);
    else u0 = Math.max(u0, ou + 26);
  }
  const cu = (u0 + u1) / 2,
    CL = u1 - u0,
    CW = R0.W - 8;
  const [ccx, ccz] = k0.at(cu, 0);
  const k = new Kit(m.id, ccx, ccz, R0.ang);
  // the funnels and their slender columns, only where a column stands clear of the streets
  const funnels: Funnel[] = [];
  for (const fu of [-0.4, -0.14, 0.13, 0.39])
    for (const fv of [-0.28, 0.02, 0.3]) {
      const u = (fu + (fv > 0.1 ? 0.04 : fv < -0.1 ? -0.03 : 0)) * CL,
        v = fv * CW;
      const [x, z] = k.at(u, v);
      if (ctx.site.roadGap(x, z) < 3 || !ctx.site.onLand(x, z)) continue;
      funnels.push({ u, v });
      k.cyl(u, v, 0, 0.5, 6.6, C.white, { seg: 10, solid: true });
      k.cone(u, v, 4.4, 1.4, 2.2, C.white, { down: true, seg: 10 });
    }
  k.mesh(0, 0, 0, canopyGeo(CL, CW, funnels).geometry());
  // the station hall under the canopy: a glass hall between white fins, its lobby lit at night
  const hall: Rect | null = fitRect(ctx.site, { cx: ccx, cz: ccz, L: Math.min(46, CL * 0.4), W: Math.min(24, CW * 0.4), ang: R0.ang }, 2, 12, 8);
  m.covers.push(rectRing({ cx: ccx, cz: ccz, L: CL, W: CW, ang: R0.ang }));
  if (bi >= 0) m.replaces.push(bi);
  if (!hall) return [k];
  const hk = new Kit(m.id + '-hall', hall.cx, hall.cz, hall.ang);
  const H = 6.2;
  hk.box(0, 0, 0, hall.L, hall.W, H, C.glassLight, { solid: true });
  hk.box(0, 0, H, hall.L + 0.8, hall.W + 0.8, 0.7, C.white);
  const n = Math.max(4, Math.floor(hall.L / 3.4));
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) hk.box(-hall.L / 2 + (i * hall.L) / n, s * (hall.W / 2 + 0.12), 0, 0.3, 0.24, H, C.white);
  for (const s of [-1, 1]) {
    hk.mesh(0, s * (hall.W / 2 + 0.06), 2.6, new THREE.BoxGeometry(hall.L - 0.6, 0.9, 0.1).translate(0, 0.45, 0), { color: T.lamp, glow: 0.6 });
    // the entrances at the ends
    hk.box(s * (hall.L / 2 + 0.06), 0, 0, 0.12, Math.min(8, hall.W * 0.4), 3.2, T.door);
  }
  m.covers.push(rectRing(hall));
  return [k, hk];
};

// ---------------------------------------------------------------------------------------------------------------
// Sankuaicuo Station (1923): a small timber station
// ---------------------------------------------------------------------------------------------------------------
export const sankuaicuo: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 18, W: 10 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  const wl = L - 0.7,
    ww = W - 0.7,
    H = 3.6;
  k.box(0, 0, 0, L, W, 0.4, C.stone);
  k.box(0, 0, 0.4, wl, ww, H, '#E9E1CC', { solid: true });
  // dark board skirting, timber posts and a wall plate
  k.box(0, 0, 0.4, wl + 0.1, ww + 0.1, 1.0, T.timberLight);
  k.box(0, 0, 0.4 + H - 0.35, wl + 0.12, ww + 0.12, 0.35, T.timber);
  const n = Math.max(2, Math.round(wl / 2.2));
  for (let i = 0; i <= n; i++)
    for (const s of [-1, 1]) k.box(-wl / 2 + (i * wl) / n, s * (ww / 2 + 0.06), 0.4, 0.2, 0.14, H, T.timber);
  // windows with timber frames, and the double doors in the middle of the front
  for (let i = 0; i < n; i++) {
    const u = -wl / 2 + ((i + 0.5) * wl) / n;
    const door = i === Math.floor(n / 2);
    for (const s of [-1, 1]) {
      if (door && s === 1) k.box(u, ww / 2 + 0.08, 0.4, Math.min(1.8, wl / n - 0.4), 0.12, 2.5, T.timber);
      else k.box(u, s * (ww / 2 + 0.08), 1.6, Math.min(1.2, wl / n - 0.6), 0.12, 1.3, T.window);
    }
  }
  k.mesh(0, 0, 0.4 + H, irimoya(L + 0.2, W + 0.2, Math.min(3, W * 0.42), { tile: '#3F4744', gable: '#E9E1CC' }).geometry());
  // the small gable over the entrance, on the front slope
  const pw = Math.min(3.2, L * 0.3);
  k.roof(0, W * 0.32, 0.4 + H + 0.2, Math.min(2.6, W * 0.45), pw, 1.4, '#3F4744', 0, Math.PI / 2);
  m.covers.push(rectRing(r));
  return [k];
};

// ---------------------------------------------------------------------------------------------------------------
// Gushan Station: a light station hall under a shallow arched roof
// ---------------------------------------------------------------------------------------------------------------
/** an arched slab: the profile across z (from -W/2 to W/2, rising `rise`), `t` thick, L long along x, centred */
export function archSlab(L: number, W: number, rise: number, t: number, top: string, under: string, n = 12) {
  const g = new Geo();
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const z = -W / 2 + (W * i) / n;
    return [z, rise * (1 - (2 * z / W) ** 2)] as [number, number];
  });
  for (let i = 0; i < n; i++) {
    const [z0, y0] = pts[i],
      [z1, y1] = pts[i + 1];
    const out: V = [0, z1 - z0, -(y1 - y0)];
    g.poly([[-L / 2, y0 + t, z0], [L / 2, y0 + t, z0], [L / 2, y1 + t, z1], [-L / 2, y1 + t, z1]], top, out);
    g.poly([[-L / 2, y0, z0], [L / 2, y0, z0], [L / 2, y1, z1], [-L / 2, y1, z1]], under, [-out[0], -out[1], -out[2]]);
    for (const s of [-1, 1]) g.poly([[(s * L) / 2, y0, z0], [(s * L) / 2, y1, z1], [(s * L) / 2, y1 + t, z1], [(s * L) / 2, y0 + t, z0]], top, [s, 0, 0]);
  }
  for (const i of [0, n]) {
    const [z, y] = pts[i];
    g.poly([[-L / 2, y, z], [L / 2, y, z], [L / 2, y + t, z], [-L / 2, y + t, z]], top, [0, 0, i ? 1 : -1]);
  }
  return g;
}
export const gushanstation: Builder = (ctx, lm, m) => {
  const r = place(ctx, lm, { L: 20, W: 12 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  const hl = L - 1.4,
    hw = W - 2.4,
    H = 5;
  k.box(0, 0, 0, L, W, 0.4, C.stone);
  k.box(0, -0.4, 0.4, hl, hw, H, '#EDEBE4', { solid: true });
  // the glass front between white fins, a lit band along its top
  const fv = -0.4 + hw / 2;
  k.box(0, fv + 0.05, 0.4, hl * 0.72, 0.12, H - 0.8, C.glassLight);
  const n = Math.max(3, Math.floor((hl * 0.72) / 2));
  for (let i = 0; i <= n; i++) k.box(-hl * 0.36 + (i * hl * 0.72) / n, fv + 0.14, 0.4, 0.22, 0.2, H - 0.8, C.white);
  k.mesh(0, fv + 0.12, H - 0.9, new THREE.BoxGeometry(hl * 0.72, 0.5, 0.08).translate(0, 0.25, 0), { color: T.lamp, glow: 0.6 });
  k.box(0, fv + 0.1, 0.4, Math.min(3.6, hl * 0.2), 0.14, 2.6, T.door);
  // a clerestory band of windows round the back and the ends, a grey plinth course
  const bv = -0.4 - hw / 2;
  k.box(0, bv - 0.05, H - 1.6, hl * 0.86, 0.12, 1.1, C.glass);
  for (const s of [-1, 1]) k.box(s * (hl / 2 + 0.05), -0.4, H - 1.6, 0.12, hw * 0.7, 1.1, C.glass);
  k.box(0, -0.4, 0.4, hl + 0.16, hw + 0.16, 0.6, '#9EA3A6');
  // the arched roof over the hall and the canopy at the front, on slender columns
  k.mesh(0, 0, 0.4 + H, archSlab(L - 0.2, W - 0.2, Math.min(1.8, W * 0.16), 0.35, C.white, '#B9C1C7').geometry());
  for (const s of [-1, 1]) k.cyl(s * (L / 2 - 1.2), W / 2 - 0.5, 0.4, 0.14, H, C.white, { seg: 6 });
  m.covers.push(rectRing(r));
  return [k];
};

// ---------------------------------------------------------------------------------------------------------------
// Formosa Boulevard Station: the four glass entrances (the dome itself is underground)
// ---------------------------------------------------------------------------------------------------------------
const PAV = { base: 2.8, top: 10.8, hb: 6.2, tip: 2.4 };
/** pale glass with a hint of the dome's colour below (by day it reads as glass; at night that colour glows) */
const TINT = DOME.map((c) => '#' + new THREE.Color('#A3D0CB').lerp(new THREE.Color(c), 0.6).getHexString());
const HAND = {
  glass: ['#A3D0CB', '#97C6C8'],
  inner: '#6F9A9C',
  mullion: '#5E7F86',
  frame: '#E8EEEC',
};
/**
 * one entrance pavilion ("Prayer", Shin Takamatsu): two thin, slightly curved glass hands leaning together over a
 * glazed base, palms meeting at a narrow slit along the ridge, the fingertips leaning out over the entrance (+x);
 * L × W plus the leaning tip, centred
 */
export function pavilion(seed = 0, L = 13, W = 7.6) {
  const { base, top, tip } = PAV;
  const g = new Geo();
  const sx = -tip / 2;
  const P = (x: number, y: number, z: number): V => [x + sx, y, z];
  const SEG = 4,
    TH = 0.32,
    SLIT = 0.42;
  const foot = W / 2 - 0.25;
  const x0 = (t: number) => -L / 2 + 1.4 * t,
    x1 = (t: number) => L / 2 + tip * t;
  // the hand's outer face across the pavilion: leaning in, bowed slightly outwards like a palm
  const prof = (t: number) => {
    const z = SLIT + (foot - SLIT) * (1 - t) * (1 + 0.35 * t);
    const y = base + (top - base) * t;
    // the outward normal of the curve in (z, y)
    const e = 1e-3;
    const z2 = SLIT + (foot - SLIT) * (1 - (t + e)) * (1 + 0.35 * (t + e));
    const dz = z2 - z,
      dy = ((top - base) * e);
    const n = Math.hypot(dz, dy);
    return { z, y, nz: dy / n, ny: -dz / n };
  };
  const pal = (seed: number, row: number) => (i: number): [string, number] => {
    // the upper half glows in the dome's colours at night; by day it is pale glass with a hint of the tint
    if (row >= SEG / 2 && (i + row + seed) % 2 === 0) return [TINT[(i + seed + row) % TINT.length], 0.6];
    return [HAND.glass[(i + row) % 2], row >= SEG / 2 ? 0.22 : 0];
  };
  for (const s of [-1, 1]) {
    const O = (t: number, x: number): V => {
      const p = prof(t);
      return P(x, p.y, s * p.z);
    };
    const I = (t: number, x: number): V => {
      const p = prof(t);
      return P(x, p.y - p.ny * TH, s * (p.z - p.nz * TH));
    };
    for (let k = 0; k < SEG; k++) {
      const a = k / SEG,
        b = (k + 1) / SEG;
      const pa = prof(a);
      // the outer glass between mullions, the plain inner face, the light frame on the front and back edges
      g.bays(O(a, x0(a)), O(a, x1(a)), O(b, x1(b)), O(b, x0(b)), 6, 0.18, pal(seed + (s > 0 ? 1 : 0), k), HAND.mullion, [0, pa.ny, s * pa.nz]);
      g.poly([I(a, x0(a)), I(a, x1(a)), I(b, x1(b)), I(b, x0(b))], HAND.inner, [0, -pa.ny, -s * pa.nz]);
      g.poly([O(a, x1(a)), O(b, x1(b)), I(b, x1(b)), I(a, x1(a))], HAND.frame, [1, 0, 0]);
      g.poly([O(a, x0(a)), O(b, x0(b)), I(b, x0(b)), I(a, x0(a))], HAND.frame, [-1, 0, 0]);
    }
    // the fingertip edge along the ridge, lit pale against the sky
    g.poly([O(1, x0(1)), O(1, x1(1)), I(1, x1(1)), I(1, x0(1))], HAND.frame, [0, 1, 0]);
  }
  // the glazed gables between the hands, set back from the frames; the dome's colours show through at night
  for (const e of [1, -1]) {
    const X = (t: number) => (e > 0 ? x1(t) - 0.12 : x0(t) + 0.12);
    const pts: V[] = [];
    for (let k = 0; k <= SEG; k++) {
      const p = prof(k / SEG);
      pts.push(P(X(k / SEG), p.y - p.ny * TH, -(p.z - p.nz * TH)));
    }
    for (let k = SEG; k >= 0; k--) {
      const p = prof(k / SEG);
      pts.push(P(X(k / SEG), p.y - p.ny * TH, p.z - p.nz * TH));
    }
    const EM = P(X(0), base, 0);
    for (let i = 0; i + 1 < pts.length; i++) {
      const lit = e > 0 && i % 3 === 1;
      g.poly([EM, pts[i], pts[i + 1]], lit ? TINT[(seed + i) % TINT.length] : HAND.glass[i % 2], [e, 0, 0], lit ? 0.5 : 0);
    }
  }
  // the glazed base: glass bays between mullions, the entrance at the front, a light cornice under the hands
  for (const s of [-1, 1]) g.bays(P(-L / 2, 0.25, (s * W) / 2), P(L / 2, 0.25, (s * W) / 2), P(L / 2, base, (s * W) / 2), P(-L / 2, base, (s * W) / 2), 6, 0.18, (i) => [HAND.glass[i % 2], 0], HAND.mullion, [0, 0, s]);
  g.bays(P(-L / 2, 0.25, -W / 2), P(-L / 2, 0.25, W / 2), P(-L / 2, base, W / 2), P(-L / 2, base, -W / 2), 3, 0.18, (i) => [HAND.glass[i % 2], 0], HAND.mullion, [-1, 0, 0]);
  g.poly([P(L / 2, 0.25, -W / 2), P(L / 2, 0.25, W / 2), P(L / 2, base, W / 2), P(L / 2, base, -W / 2)], HAND.mullion, [1, 0, 0]);
  g.poly([P(L / 2 + 0.04, 0.25, -W * 0.32), P(L / 2 + 0.04, 0.25, W * 0.32), P(L / 2 + 0.04, base - 0.35, W * 0.32), P(L / 2 + 0.04, base - 0.35, -W * 0.32)], T.lamp, [1, 0, 0], 0.55);
  g.box(sx, base - 0.02, 0, L + 0.3, 0.3, W + 0.3, HAND.frame);
  g.box(sx, 0, 0, L + 0.8, 0.25, W + 0.8, '#8E9089');
  return g;
}
/** Formosa Boulevard's four entrances ("Prayer", mapped at the junction's corners), facing the junction */
export function formosaGates(ctx: Ctx, m: Model) {
  const j = formosaJunction(ctx.data);
  if (!j) return null;
  const { site } = ctx;
  const B = ctx.data.buildings;
  const gates = B.map((b, i) => ({ b, i })).filter(({ b }) => (b.name ?? '') === '祈禱' && Math.hypot(b.obb[0] - j[0], b.obb[1] - j[1]) < 80);
  if (!gates.length) return null;
  const kits: Kit[] = [];
  gates.forEach(({ b, i }, q) => {
    const [cx, cz, bl, bw, ba] = b.obb;
    // the entrance (+u) towards the junction, along whichever side of the plot points there best
    const tx = j[0] - cx,
      tz = j[1] - cz;
    const along = Math.abs(Math.cos(ba) * tx + Math.sin(ba) * tz) >= Math.abs(-Math.sin(ba) * tx + Math.cos(ba) * tz);
    let ang = along ? ba : ba + Math.PI / 2;
    if (Math.cos(ang) * tx + Math.sin(ang) * tz < 0) ang += Math.PI;
    const r0: Rect = { cx, cz, L: along ? bl : bw, W: along ? bw : bl, ang };
    const r = fitRect(site, r0, 1, 8, 6, ctx.taken);
    if (!r) return;
    const L = Math.min(15, r.L - PAV.tip - 0.8),
      W = Math.min(11, r.W - 1.6);
    if (L < 6 || W < 4) return;
    const k = new Kit(`${m.id}-${q}`, r.cx, r.cz, r.ang);
    k.mesh(0, 0, 0, pavilion(q, L, W).geometry());
    k.wall(-PAV.tip / 2, 0, 0, L, W, PAV.hb);
    m.replaces.push(i);
    m.covers.push(rectRing(r));
    // the station's mapped outline buildings that the pavilion stands in go too (the station is underground)
    B.forEach((o, oi) => {
      if (oi !== i && o.kind === 'transportation' && pointInRing(r.cx, r.cz, o.poly)) m.replaces.push(oi);
    });
    kits.push(k);
  });
  if (!kits.length) return null;
  // the name board beside the nearest entrance, on its side away from the traffic, facing the nearest road
  const k = [...kits].sort((p, q) => Math.hypot(p.cx - j[0], p.cz - j[1]) - Math.hypot(q.cx - j[0], q.cz - j[1]))[0];
  const cands = [k.at(0, 7.5), k.at(0, -7.5), k.at(-9.5, 0)];
  const [sx, sz] = cands.sort((p, q) => site.roadGap(q[0], q[1]) - site.roadGap(p[0], p[1]))[0];
  const hit = site.nearest(sx, sz);
  const yaw = hit ? Math.atan2(hit.x - sx, hit.z - sz) : 0;
  m.signs.push({ id: 'formosa', name: { zh: '美麗島 光之穹頂', en: 'Dome of Light' }, x: sx, y: 3.2, z: sz, yaw, decor: true });
  return kits;
}

// ---------------------------------------------------------------------------------------------------------------
// the Exhibition Center: the long harbourside hall under the wave roof
// ---------------------------------------------------------------------------------------------------------------
/** the wave roof over L × W (u along the harbour), rising and rolling towards the sea side (`sea` = ±1 along v); and the glass hall walls up to it */
export function exhibitionGeo(L: number, W: number, o: { NI?: number; NJ?: number; sea?: number } = {}) {
  const NI = o.NI ?? 40,
    NJ = o.NJ ?? 14,
    sea = o.sea ?? 1;
  const top = (u: number, v: number) => {
    const un = (2 * u) / L,
      vn = (2 * v * sea) / W;
    return 17 + 5 * Math.sin(Math.PI * 1.1 * (un + 1) + 0.3) * (0.6 + 0.4 * vn) + 2.5 * (vn + 1) / 2 + 1.1 * Math.sin(Math.PI * vn * 1.5 + un * 2);
  };
  const th = (v: number) => 0.6 + 0.8 * (1 - ((2 * v) / W) ** 2);
  const roof = new Geo();
  const U = (i: number) => -L / 2 + (L * i) / NI,
    Vv = (j: number) => -W / 2 + (W * j) / NJ;
  for (let i = 0; i < NI; i++)
    for (let j = 0; j < NJ; j++) {
      const q: [number, number][] = [[U(i), Vv(j)], [U(i + 1), Vv(j)], [U(i + 1), Vv(j + 1)], [U(i), Vv(j + 1)]];
      // the roof's long ribbons, white and pale grey
      roof.poly(q.map(([u, v]): V => [u, top(u, v), v]), Math.floor(j / 2) % 2 ? T.roofGrey : T.roofWhite, [0, 1, 0]);
      roof.poly(q.map(([u, v]): V => [u, top(u, v) - th(v), v]), T.roofUnder, [0, -1, 0]);
    }
  const edge = (u0: number, v0: number, u1: number, v1: number, out: V) =>
    roof.poly([[u0, top(u0, v0) - th(v0), v0], [u1, top(u1, v1) - th(v1), v1], [u1, top(u1, v1), v1], [u0, top(u0, v0), v0]], T.roofWhite, out);
  for (let i = 0; i < NI; i++) for (const s of [-1, 1]) edge(U(i), (s * W) / 2, U(i + 1), (s * W) / 2, [0, 0, s]);
  for (let j = 0; j < NJ; j++) for (const s of [-1, 1]) edge((s * L) / 2, Vv(j), (s * L) / 2, Vv(j + 1), [s, 0, 0]);
  // the hall walls: set in under the roof, glass bays between frames, a transom band, lit low bays at night
  const hl = L - 10,
    hw = W - 16;
  const walls = new Geo();
  const under = (u: number, v: number) => top(u, v) - th(v) - 0.05;
  const wall = (u0: number, v0: number, u1: number, v1: number, out: V, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = i / n,
        b = (i + 1) / n;
      const pu0 = u0 + (u1 - u0) * a,
        pv0 = v0 + (v1 - v0) * a,
        pu1 = u0 + (u1 - u0) * b,
        pv1 = v0 + (v1 - v0) * b;
      const fu = pu0 + (pu1 - pu0) * 0.12,
        fv = pv0 + (pv1 - pv0) * 0.12;
      const lit = i % 3 === 1;
      walls.poly([[pu0, 0, pv0], [fu, 0, fv], [fu, under(fu, fv), fv], [pu0, under(pu0, pv0), pv0]], C.white, out);
      walls.poly([[fu, 0, fv], [pu1, 0, pv1], [pu1, 4.2, pv1], [fu, 4.2, fv]], lit ? T.lamp : C.glass, out, lit ? 0.35 : 0);
      walls.poly([[fu, 4.2, fv], [pu1, 4.2, pv1], [pu1, 5, pv1], [fu, 5, fv]], C.band, out);
      walls.poly([[fu, 5, fv], [pu1, 5, pv1], [pu1, under(pu1, pv1), pv1], [fu, under(fu, fv), fv]], (i % 2 ? C.glassLight : C.glass), out);
    }
  };
  const nl = Math.max(6, Math.round(hl / 4.5)),
    nw = Math.max(3, Math.round(hw / 4.5));
  for (const s of [-1, 1]) {
    wall(-hl / 2, (s * hw) / 2, hl / 2, (s * hw) / 2, [0, 0, s], nl);
    wall((s * hl) / 2, -hw / 2, (s * hl) / 2, hw / 2, [s, 0, 0], nw);
  }
  return { roof, walls, hl, hw, under };
}
export const exhibition: Builder = (ctx, lm, m) => {
  // the hall stands at its mapped building on the harbour, south of the landmark's point
  const bi = ctx.data.buildings.findIndex((b) => (b.name ?? '').includes('展覽館') && Math.hypot(b.obb[0] - lm.x, b.obb[1] - lm.z) < 260);
  const ring = bi >= 0 ? ctx.data.buildings[bi].poly : null;
  const r = place(ctx, lm, { L: 120, W: 60 }, { ring, keepLong: true });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = Math.min(r.L, 150),
    W = Math.min(r.W, 70);
  // the roof rises and rolls towards the harbour
  const seaAt = (s: number) => {
    for (let d = W / 2; d < W / 2 + 300; d += 4) {
      const [x, z] = k.at(0, s * d);
      if (ctx.site.inWater(x, z)) return d;
    }
    return Infinity;
  };
  const sea = seaAt(-1) < seaAt(1) ? -1 : 1;
  const { roof, walls, hl, hw, under } = exhibitionGeo(L, W, { sea });
  k.box(0, 0, 0, hl + 2, hw + 2, 0.3, C.stone);
  k.mesh(0, 0, 0.3, walls.geometry());
  k.mesh(0, 0, 0.3, roof.geometry());
  k.wall(0, 0, 0, hl, hw, 12);
  // slender columns carrying the roof's overhang
  for (let i = 0; i <= 6; i++)
    for (const s of [-1, 1]) {
      const u = -L / 2 + 4 + (i * (L - 8)) / 6,
        v = s * (W / 2 - 3);
      k.cyl(u, v, 0.3, 0.3, under(u, v) + 0.1, C.white, { seg: 8, solid: true });
    }
  if (bi >= 0) m.replaces.push(bi);
  m.covers.push(rectRing({ ...r, L, W }));
  return [k];
};
