// Rush Taxi — the skyline slice of the detailed landmark models: the 85 Sky Tower, the Kaohsiung Music Center (its
// high-low towers, the white hexagon "coral reef" pavilions and the harbour-edge walkway) and the CSC headquarters.
//
// Each builder keeps the placement of the simple model it replaces (place / fitRect / faceRoad from landmarks.ts:
// clear of the roads and the water, front to the road, the mapped boxes under it dropped) and draws the looks as free
// geometry (`Kit.mesh`): flat-shaded triangles with vertex colours, windows as coloured bands on their own triangles,
// lit floors and LED lines marked with `aGlow` so they light up at night. Colliders stay simple hidden boxes.
//
// Local frame of a model: x = the kit's u (along the length), z = v (+v is the front, to the road), y up.
import * as THREE from 'three';
import type { OsmLandmark } from '../data';
import { Kit, TOWER85_SCALE, hash, place, pointInRing, rectRing, type Ctx, type Model } from '../landmarks';

// ---------------------------------------------------------------------------------------------------------------
// a small triangle writer
// ---------------------------------------------------------------------------------------------------------------
export type P2 = [number, number];
type V3 = [number, number, number];

const colours = new Map<string, THREE.Color>();
function col(hex: string) {
  let c = colours.get(hex);
  if (!c) colours.set(hex, (c = new THREE.Color(hex)));
  return c;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** collects triangles (with colour and night glow) for one mesh part */
export class Geo {
  pos: number[] = [];
  col: number[] = [];
  glow: number[] = [];
  tri(a: V3, b: V3, c: V3, color: string, g = 0) {
    const k = col(color);
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.col.push(k.r, k.g, k.b);
      this.glow.push(g);
    }
  }
  /** a quad a-b-c-d; if `face` is given the winding is turned so that the quad faces that way */
  quad(a: V3, b: V3, c: V3, d: V3, color: string, g = 0, face?: V3) {
    if (face && dot3(cross(sub(b, a), sub(d, a)), face) < 0) [b, d] = [d, b];
    this.tri(a, b, c, color, g);
    this.tri(a, c, d, color, g);
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

// ---------------------------------------------------------------------------------------------------------------
// plan rings (x, z), wound so that walls face out and caps face up (negative shoelace area in x-z)
// ---------------------------------------------------------------------------------------------------------------
function area(r: P2[]) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    a += ax * bz - bx * az;
  }
  return a / 2;
}
export function orient(r: P2[]): P2[] {
  return area(r) > 0 ? [...r].reverse() : r;
}
/** a rectangle with cut corners (c = the cut), centred at (cx, cz) */
export function chamfer(hx: number, hz: number, c: number, cx = 0, cz = 0): P2[] {
  if (c <= 0)
    return orient([
      [cx - hx, cz - hz],
      [cx + hx, cz - hz],
      [cx + hx, cz + hz],
      [cx - hx, cz + hz],
    ]);
  return orient([
    [cx - hx + c, cz - hz],
    [cx + hx - c, cz - hz],
    [cx + hx, cz - hz + c],
    [cx + hx, cz + hz - c],
    [cx + hx - c, cz + hz],
    [cx - hx + c, cz + hz],
    [cx - hx, cz + hz - c],
    [cx - hx, cz - hz + c],
  ]);
}
export function ngon(n: number, r: number, rot = 0, cx = 0, cz = 0, sx = 1): P2[] {
  return orient(Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + (i / n) * Math.PI * 2) * r * sx, cz + Math.sin(rot + (i / n) * Math.PI * 2) * r] as P2));
}
export function turn(r: P2[], a: number, cx = 0, cz = 0): P2[] {
  const c = Math.cos(a),
    s = Math.sin(a);
  return r.map(([x, z]) => [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c]);
}
/** the outward normal of edge i */
function edgeN(r: P2[], i: number): P2 {
  const [ax, az] = r[i];
  const [bx, bz] = r[(i + 1) % r.length];
  const L = Math.hypot(bx - ax, bz - az) || 1;
  return [-(bz - az) / L, (bx - ax) / L];
}
/** the ring moved out by d (convex rings) */
export function offset(r: P2[], d: number): P2[] {
  return r.map((p, i) => {
    const n1 = edgeN(r, (i - 1 + r.length) % r.length),
      n2 = edgeN(r, i);
    let nx = n1[0] + n2[0],
      nz = n1[1] + n2[1];
    const L = Math.hypot(nx, nz) || 1;
    nx /= L;
    nz /= L;
    const k = d / Math.max(0.35, nx * n2[0] + nz * n2[1]);
    return [p[0] + nx * k, p[1] + nz * k];
  });
}
function centroid(r: P2[]): P2 {
  return [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
}
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** a flat cap over the ring at height y (up, or down when `down`) */
export function cap(g: Geo, r: P2[], y: number, color: string, down = false, glow = 0) {
  const [cx, cz] = centroid(r);
  for (let i = 0; i < r.length; i++) {
    const a = r[i],
      b = r[(i + 1) % r.length];
    if (down) g.tri([cx, y, cz], [b[0], y, b[1]], [a[0], y, a[1]], color, glow);
    else g.tri([cx, y, cz], [a[0], y, a[1]], [b[0], y, b[1]], color, glow);
  }
}
/** plain walls from ring A at y0 to ring B at y1 (same vertex count), with caps */
export function loft(g: Geo, A: P2[], B: P2[] | null, y0: number, y1: number, color: string, o: { top?: string | null; bottom?: string | null; glow?: number } = {}) {
  const b = B ?? A;
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length;
    const n = edgeN(A, i);
    g.quad([A[i][0], y0, A[i][1]], [A[j][0], y0, A[j][1]], [b[j][0], y1, b[j][1]], [b[i][0], y1, b[i][1]], color, o.glow ?? 0, [n[0], 0, n[1]]);
  }
  if (o.top !== null) cap(g, b, y1, o.top ?? color);
  if (o.bottom) cap(g, A, y0, o.bottom, true);
}
/** a thin ledge or LED line round a ring: h tall, standing `out` proud of the wall */
export function ledge(g: Geo, r: P2[], y: number, h: number, out: number, color: string, glow = 0) {
  loft(g, offset(r, out), null, y, y + h, color, { top: color, bottom: color, glow });
}

export interface Skin {
  /** spandrel / frame colour, glass, lit-glass colours */
  wall: string;
  glass: string;
  lit: string;
  /** band height (m) and the share of it that is glass (the top part) */
  floor: number;
  glassFrac: number;
  /** split a glass band into pieces about this long (m), so floors light up unevenly */
  segLen?: number;
  maxSeg?: number;
  /** share of lit pieces and their glow */
  litRate?: number;
  litGlow?: number;
  seed: number;
  /** vertical mullion fins (vertical walls only) */
  fins?: { every: number; w: number; d: number; color: string };
  top?: string | null;
  bottom?: string | null;
}
/** a curtain-wall facade from ring A at y0 to ring B at y1: spandrel and glass bands, some floors lit */
export function facade(g: Geo, A: P2[], B: P2[] | null, y0: number, y1: number, s: Skin) {
  const b = B ?? A;
  const bands = Math.max(1, Math.round((y1 - y0) / s.floor));
  const P = (i: number, f: number, t: number): V3 => {
    const j = (i + 1) % A.length;
    const p = lerp2(lerp2(A[i], A[j], f), lerp2(b[i], b[j], f), t);
    return [p[0], y0 + (y1 - y0) * t, p[1]];
  };
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length;
    const n = edgeN(A, i);
    const face: V3 = [n[0], 0, n[1]];
    const len = Math.hypot(A[j][0] - A[i][0], A[j][1] - A[i][1]);
    const segs = Math.max(1, Math.min(s.maxSeg ?? 4, Math.round(len / (s.segLen ?? 7))));
    for (let k = 0; k < bands; k++) {
      const t0 = k / bands,
        t1 = (k + 1) / bands,
        tm = t0 + (t1 - t0) * (1 - s.glassFrac);
      for (let q = 0; q < segs; q++) {
        const f0 = q / segs,
          f1 = (q + 1) / segs;
        g.quad(P(i, f0, t0), P(i, f1, t0), P(i, f1, tm), P(i, f0, tm), s.wall, 0, face);
        const lit = hash(s.seed, i, k, q) < (s.litRate ?? 0.4);
        g.quad(P(i, f0, tm), P(i, f1, tm), P(i, f1, t1), P(i, f0, t1), lit ? s.lit : s.glass, lit ? (s.litGlow ?? 0.85) : 0, face);
      }
    }
    if (s.fins && !B) {
      const nf = Math.floor(len / s.fins.every);
      const t: P2 = [(A[j][0] - A[i][0]) / (len || 1), (A[j][1] - A[i][1]) / (len || 1)];
      for (let q = 1; q <= nf; q++) {
        const f = q / (nf + 1);
        const c = lerp2(A[i], A[j], f);
        const w = s.fins.w / 2,
          d = s.fins.d;
        const l: P2 = [c[0] - t[0] * w, c[1] - t[1] * w],
          r: P2 = [c[0] + t[0] * w, c[1] + t[1] * w];
        const lo: P2 = [l[0] + n[0] * d, l[1] + n[1] * d],
          ro: P2 = [r[0] + n[0] * d, r[1] + n[1] * d];
        const v = (p: P2, y: number): V3 => [p[0], y, p[1]];
        g.quad(v(lo, y0), v(ro, y0), v(ro, y1), v(lo, y1), s.fins.color, 0, face);
        g.quad(v(l, y0), v(lo, y0), v(lo, y1), v(l, y1), s.fins.color, 0, [-t[0], 0, -t[1]]);
        g.quad(v(ro, y0), v(r, y0), v(r, y1), v(ro, y1), s.fins.color, 0, [t[0], 0, t[1]]);
      }
    }
  }
  if (s.top !== null) cap(g, b, y1, s.top ?? s.wall);
  if (s.bottom) cap(g, A, y0, s.bottom, true);
}

/** places a part: one mesh prim at the model's centre */
function put(k: Kit, g: Geo, u = 0, v = 0) {
  if (g.triangles) k.mesh(u, v, 0, g.geometry());
}

// ---------------------------------------------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------------------------------------------
const T85 = {
  glass: '#3A7480', // blue-green glass
  glassDeep: '#2F646E',
  lit: '#8DB3AA',
  spandrel: '#BAC6C9',
  fin: '#E9EDED',
  podium: '#BFC5C4',
  podiumGlass: '#56807F',
  roof: '#9CA5A6',
  white: '#F2F4F3',
  red: '#B3302A',
  steel: '#A7B0B6',
};
const MUS = {
  white: '#F3F4F1',
  pale: '#DCE0DF',
  grey: '#B9BFC0',
  glass: '#9DB4BE',
  glassDeep: '#5F7A86',
  lit: '#E4DCC4',
  led: '#DDF1F8',
};
const CSC = {
  panel: '#B9C0C5',
  panelDark: '#7D8790',
  glass: '#566E7E',
  lit: '#8A99A0',
  joint: '#3A434C',
  core: '#56616C',
};

// ---------------------------------------------------------------------------------------------------------------
// 85 Sky Tower (高雄八五大樓): the broad podium, two legs with the open gap between them up to about the 35th floor,
// the floors that join them, the central shaft in stepped tiers, and the spire with its mast — the 「高」 outline.
// Drawn at TOWER85_SCALE of the real 347 m so it stays inside the view range.
// ---------------------------------------------------------------------------------------------------------------
export function skylineTower85(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 80, W: 55 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const s = TOWER85_SCALE;
  const L = r.L,
    W = r.W;
  const skin = (seed: number, extra: Partial<Skin> = {}): Skin => ({
    wall: T85.spandrel,
    glass: T85.glass,
    lit: T85.lit,
    floor: 4.8,
    glassFrac: 0.72,
    segLen: 6,
    litRate: 0.42,
    seed,
    fins: { every: 5.5, w: 0.45, d: 0.35, color: T85.fin },
    ...extra,
  });

  // the podium (the department store floors), a set-back roof terrace and a glass shop front at street level
  const podH = 15;
  const pod = new Geo();
  const P0 = chamfer(L / 2, W / 2, 2.5);
  facade(pod, P0, null, 0, 5.2, { wall: T85.podium, glass: T85.podiumGlass, lit: T85.lit, floor: 5.2, glassFrac: 0.7, segLen: 8, litRate: 0.6, litGlow: 0.6, seed: 1, top: null });
  facade(pod, P0, null, 5.2, podH, { wall: T85.podium, glass: '#7E9A9A', lit: T85.lit, floor: 4.9, glassFrac: 0.3, segLen: 10, litRate: 0.25, seed: 2, top: T85.roof });
  ledge(pod, P0, 5.0, 0.6, 0.5, T85.white);
  ledge(pod, chamfer(L / 2 - 1.2, W / 2 - 1.2, 2), podH, 1.0, 0, T85.white);
  put(k, pod);
  k.wall(0, 0, 0, L, W, podH);

  // the two legs: separate towers at both ends, the hollow between them; their outer sides step in once
  const legL = L * 0.3,
    legW = Math.min(W - 4, W * 0.68),
    legU = L / 2 - legL / 2 - 2.2;
  const join = 150 * s; // the legs meet at about the 35th floor (150 m)
  const step = 62;
  for (const sg of [-1, 1]) {
    const g = new Geo();
    const A = chamfer(legL / 2, legW / 2, 2.2);
    // above the step the outer side comes in by 2.4 m: the leg's centre moves towards the gap
    const B = chamfer(legL / 2 - 1.2, legW / 2 - 0.8, 2.0, -sg * 1.2, 0);
    facade(g, A, null, podH, step, skin(10 + sg, { top: T85.roof }));
    ledge(g, A, step - 0.2, 0.9, 0.4, T85.fin);
    facade(g, B, null, step + 0.7, join, skin(20 + sg, { top: null }));
    put(k, g, sg * legU, 0);
    k.wall(sg * legU, 0, podH, legL, legW, join - podH);
  }

  // the join: the floors that bridge the gap, with a lit sky-lobby band, then the central shaft in tiers
  const up = new Geo();
  const outer = legU + legL / 2 - 2.4;
  const J = chamfer(outer, legW / 2 - 0.8, 2.0);
  const joinTop = join + 13;
  facade(up, J, null, join, joinTop, skin(30, { floor: 4.3, glassFrac: 0.75, litRate: 0.55, top: T85.roof, bottom: T85.spandrel, fins: { every: 4.5, w: 0.45, d: 0.35, color: T85.fin } }));
  ledge(up, J, join - 0.8, 0.8, 0.5, T85.fin);
  ledge(up, J, joinTop - 0.2, 1.0, 0.5, T85.fin);

  const tiers = [
    { y1: 250 * s, hx: Math.min(outer * 0.62, L * 0.22), hz: (legW / 2) * 0.86, c: 2.4 },
    { y1: 283 * s, hx: 0, hz: 0, c: 2.0 },
    { y1: 310 * s, hx: 0, hz: 0, c: 1.6 },
  ];
  tiers[1].hx = tiers[0].hx * 0.78;
  tiers[1].hz = tiers[0].hz * 0.84;
  tiers[2].hx = tiers[0].hx * 0.55;
  tiers[2].hz = tiers[0].hz * 0.64;
  let y = joinTop + 0.8;
  tiers.forEach((t, i) => {
    const R = chamfer(t.hx, t.hz, t.c);
    facade(up, R, null, y, t.y1, skin(40 + i, { top: T85.roof, fins: { every: i === 2 ? 3.5 : 5, w: 0.45, d: 0.35, color: T85.fin } }));
    ledge(up, R, t.y1 - 0.3, 1.1, 0.6, T85.white);
    // a lit crown line under each set-back
    ledge(up, R, t.y1 - 2.0, 0.35, 0.2, T85.lit, 0.9);
    y = t.y1 + 0.8;
  });
  k.wall(0, 0, join, 2 * outer, legW - 1.6, joinTop - join);
  k.wall(0, 0, joinTop, 2 * tiers[0].hx, 2 * tiers[0].hz, tiers[0].y1 - joinTop);

  // the crown and the spire with its antenna mast, up to 347 m × s
  const topY = 347 * s;
  const crownY = 322 * s;
  const cr = Math.min(tiers[2].hx, tiers[2].hz) * 0.62;
  const O = ngon(8, cr, Math.PI / 8);
  facade(up, O, null, y, crownY, { wall: T85.fin, glass: T85.glassDeep, lit: T85.lit, floor: 2.2, glassFrac: 0.5, litRate: 0.5, seed: 50, top: T85.roof, maxSeg: 1 });
  ledge(up, O, crownY - 0.2, 0.8, 0.4, T85.white);
  const m1 = ngon(8, cr * 0.42, Math.PI / 8);
  loft(up, m1, ngon(8, cr * 0.2, Math.PI / 8), crownY + 0.6, crownY + 7, T85.white, { top: null });
  const m2 = ngon(6, 0.55, 0);
  loft(up, ngon(6, cr * 0.2, 0), m2, crownY + 7, topY - 3, T85.white, { top: null });
  for (const yy of [crownY + 9, crownY + 11.5]) ledge(up, ngon(6, 0.6, 0), yy, 0.3, 0.25, T85.steel, 0);
  loft(up, m2, ngon(6, 0.12, 0), topY - 3, topY - 0.4, T85.white, { top: null });
  // the aircraft warning light at the tip
  loft(up, ngon(6, 0.3, 0), ngon(6, 0.2, 0), topY - 0.4, topY, T85.red, { top: T85.red, glow: 1 });
  put(k, up);

  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// Kaohsiung Music Center (高雄流行音樂中心): the main hall with the high-low towers (高低塔) — two slender, faceted
// white towers with LED lines at their joints — the covered walkway along the harbour edge, and the white hexagon
// "coral reef" pavilions (海音館 cluster) with tilted faceted roofs and cut-out openings
// ---------------------------------------------------------------------------------------------------------------
/** a faceted tower: stacked sections whose irregular hexagon plans turn and swell a little, so the walls break into
 * facets; floor bands of glass in a white frame, LED lines at the section joints, a sloping crown */
function facetTower(g: Geo, hx: number, hz: number, y0: number, h: number, seed: number) {
  const base = (sw: number, rot: number, j: number): P2[] =>
    orient(
      Array.from({ length: 6 }, (_, i) => {
        const a = rot + (i / 6) * Math.PI * 2 + Math.PI / 6;
        const rr = sw * (0.92 + 0.16 * hash(seed, i, j));
        return [Math.cos(a) * hx * rr, Math.sin(a) * hz * rr] as P2;
      }),
    );
  const n = Math.max(3, Math.round(h / 12));
  const rings: P2[][] = [];
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    // slim waist, then the upper floors flare out (the cantilevered top of the real towers)
    const sw = 0.94 + 0.08 * Math.sin(t * Math.PI * 1.4) + (t > 0.8 ? 0.16 * (t - 0.8) * 5 : 0);
    rings.push(base(sw, (j % 2 ? 1 : -1) * 0.07, j));
  }
  const skin: Skin = { wall: MUS.white, glass: MUS.glass, lit: MUS.lit, floor: 4.2, glassFrac: 0.4, segLen: 5, maxSeg: 3, litRate: 0.4, litGlow: 0.8, seed, top: null };
  for (let j = 0; j < n; j++) {
    const ya = y0 + (h * j) / n,
      yb = y0 + (h * (j + 1)) / n;
    facade(g, rings[j], rings[j + 1], ya, yb, { ...skin, seed: seed * 10 + j });
    if (j > 0) ledge(g, rings[j], ya - 0.18, 0.36, 0.18, MUS.led, 1);
  }
  // the crown: a white parapet that slopes up to one side, and a pale roof
  const top = rings[n];
  const yt = y0 + h;
  const rise = (p: P2) => 1.2 + 2.6 * (p[0] / hx + 1) * 0.5;
  for (let i = 0; i < top.length; i++) {
    const a = top[i],
      b = top[(i + 1) % top.length];
    const nn = edgeN(top, i);
    g.quad([a[0], yt, a[1]], [b[0], yt, b[1]], [b[0], yt + rise(b), b[1]], [a[0], yt + rise(a), a[1]], MUS.white, 0, [nn[0], 0, nn[1]]);
  }
  const [cx, cz] = centroid(top);
  const ym = yt + top.reduce((s, p) => s + rise(p), 0) / top.length;
  for (let i = 0; i < top.length; i++) {
    const a = top[i],
      b = top[(i + 1) % top.length];
    g.tri([cx, ym, cz], [a[0], yt + rise(a), a[1]], [b[0], yt + rise(b), b[1]], MUS.pale);
  }
  ledge(g, top, yt + 0.4, 0.3, 0.12, MUS.led, 1);
}

/** one hexagon "coral" pavilion: radius R, roof tilted (tx, tz metres across), openings cut into some walls */
export function pavilion(g: Geo, R: number, h: number, tx: number, tz: number, seed: number) {
  const ring = ngon(6, R, Math.PI / 6);
  const top = (p: P2) => h + (tx * p[0]) / R / 2 + (tz * p[1]) / R / 2;
  const v = (p: P2, y: number): V3 => [p[0], y, p[1]];
  for (let i = 0; i < 6; i++) {
    const p = ring[i],
      q = ring[(i + 1) % 6];
    const n = edgeN(ring, i);
    const face: V3 = [n[0], 0, n[1]];
    const tp = top(p),
      tq = top(q);
    const yb = Math.min(tp, tq) - 1.6;
    const open = hash(seed, i) < 0.6 && yb > 3.2;
    if (!open) {
      g.quad(v(p, 0), v(q, 0), v(q, tq), v(p, tp), MUS.white, 0, face);
      continue;
    }
    // openings vary: wide windows, tall slits, doors at the foot
    const kind = hash(seed, i, 3);
    const ya = kind < 0.3 ? 0 : 0.9,
      f0 = kind > 0.7 ? 0.36 : 0.18,
      f1 = kind > 0.7 ? 0.64 : 0.82,
      d = 0.6;
    const e = (f: number) => lerp2(p, q, f);
    const inn = (pt: P2): P2 => [pt[0] - n[0] * d, pt[1] - n[1] * d];
    // the frame round the opening
    if (ya > 0) g.quad(v(p, 0), v(q, 0), v(q, ya), v(p, ya), MUS.white, 0, face);
    g.quad(v(p, ya), v(e(f0), ya), v(e(f0), yb), v(p, yb), MUS.white, 0, face);
    g.quad(v(e(f1), ya), v(q, ya), v(q, yb), v(e(f1), yb), MUS.white, 0, face);
    g.quad(v(p, yb), v(q, yb), v(q, tq), v(p, tp), MUS.white, 0, face);
    // the reveal (the wall's depth) and the glass at the back, lit inside at night
    const a0 = e(f0),
      a1 = e(f1),
      i0 = inn(a0),
      i1 = inn(a1);
    const t: V3 = [q[0] - p[0], 0, q[1] - p[1]];
    if (ya > 0) g.quad(v(a0, ya), v(a1, ya), v(i1, ya), v(i0, ya), MUS.pale, 0, [0, 1, 0]);
    g.quad(v(a0, yb), v(a1, yb), v(i1, yb), v(i0, yb), MUS.pale, 0, [0, -1, 0]);
    g.quad(v(a0, ya), v(i0, ya), v(i0, yb), v(a0, yb), MUS.pale, 0, t);
    g.quad(v(a1, ya), v(i1, ya), v(i1, yb), v(a1, yb), MUS.pale, 0, [-t[0], 0, -t[2]]);
    const lit = hash(seed, i, 7) < 0.7;
    g.quad(v(i0, ya), v(i1, ya), v(i1, yb), v(i0, yb), lit ? MUS.lit : MUS.glassDeep, lit ? 0.75 : 0, face);
  }
  // a bevelled rim (facets that catch the light), the tilted roof plane, and an LED line under the eave
  const inner = ring.map(([x, z]) => [x * 0.84, z * 0.84] as P2);
  const bev = 0.7;
  for (let i = 0; i < 6; i++) {
    const a = ring[i],
      b = ring[(i + 1) % 6],
      ia = inner[i],
      ib = inner[(i + 1) % 6];
    const n = edgeN(ring, i);
    g.quad(v(a, top(a)), v(b, top(b)), v(ib, top(ib) + bev), v(ia, top(ia) + bev), MUS.white, 0, [n[0], 1, n[1]]);
    g.tri([0, h + bev, 0], v(ia, top(ia) + bev), v(ib, top(ib) + bev), MUS.pale);
  }
  const lo = Math.min(...ring.map(top));
  ledge(g, ring, lo - 0.75, 0.22, 0.08, MUS.led, 1);
}

/** a wavy canopy walkway along u from u0 to u1 at v = vc (width w), on slim posts */
function walkway(k: Kit, u0: number, u1: number, vc: number, w: number, seed: number) {
  const g = new Geo();
  const n = Math.max(4, Math.round((u1 - u0) / 3));
  const yAt = (u: number) => 4.9 + 0.55 * Math.sin(u / 6 + seed);
  const th = 0.35;
  const v0 = vc - w / 2,
    v1 = vc + w / 2;
  for (let i = 0; i < n; i++) {
    const ua = u0 + ((u1 - u0) * i) / n,
      ub = u0 + ((u1 - u0) * (i + 1)) / n;
    const ya = yAt(ua),
      yb = yAt(ub);
    g.quad([ua, ya + th, v0], [ub, yb + th, v0], [ub, yb + th, v1], [ua, ya + th, v1], MUS.white, 0, [0, 1, 0]);
    g.quad([ua, ya, v0], [ub, yb, v0], [ub, yb, v1], [ua, ya, v1], MUS.pale, 0, [0, -1, 0]);
    g.quad([ua, ya, v1], [ub, yb, v1], [ub, yb + th, v1], [ua, ya + th, v1], MUS.white, 0, [0, 0, 1]);
    g.quad([ua, ya, v0], [ub, yb, v0], [ub, yb + th, v0], [ua, ya + th, v0], MUS.white, 0, [0, 0, -1]);
    // LED lines along both edges, under the canopy
    for (const ve of [v0 + 0.15, v1 - 0.15]) g.quad([ua, ya - 0.01, ve - 0.08], [ub, yb - 0.01, ve - 0.08], [ub, yb - 0.01, ve + 0.08], [ua, ya - 0.01, ve + 0.08], MUS.led, 1, [0, -1, 0]);
  }
  for (const e of [u0, u1]) {
    const y = yAt(e);
    g.quad([e, y, v0], [e, y, v1], [e, y + th, v1], [e, y + th, v0], MUS.white, 0, [e === u0 ? -1 : 1, 0, 0]);
  }
  // posts, with simple colliders
  const np = Math.max(2, Math.round((u1 - u0) / 9));
  for (let i = 0; i <= np; i++) {
    const u = u0 + 0.6 + ((u1 - u0 - 1.2) * i) / np;
    for (const vp of [v0 + 0.5, v1 - 0.5]) {
      loft(g, chamfer(0.16, 0.16, 0, u, vp), null, 0, yAt(u), MUS.pale, { top: null });
      k.wall(u, vp, 0, 0.5, 0.5, 4.5);
    }
  }
  put(k, g);
}

export function skylineMusicCenter(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const kits: Kit[] = [];
  const r = place(ctx, lm, { L: 100, W: 54 });
  if (r) {
    const k = new Kit(m.id, r.cx, r.cz, r.ang);
    const L = r.L,
      W = r.W;
    // the side towards the harbour (more water beyond it); the walkway runs along that edge
    const wet = (sg: number) => {
      let n = 0;
      for (let i = -4; i <= 4; i++) for (const d of [6, 14, 24, 36]) {
        const [x, z] = k.at((i * L) / 9, sg * (W / 2 + d));
        if (ctx.site.inWater(x, z)) n++;
      }
      return n;
    };
    const side = wet(-1) >= wet(1) ? -1 : 1;
    const hallW = W * 0.72,
      hallV = -side * W * 0.04;
    const hall = new Geo();
    const H0 = chamfer((L * 0.9) / 2, hallW / 2, 3, 0, hallV);
    facade(hall, H0, null, 0, 9, { wall: MUS.white, glass: MUS.glassDeep, lit: MUS.lit, floor: 4.5, glassFrac: 0.42, segLen: 6, litRate: 0.55, litGlow: 0.7, seed: 61, top: MUS.pale });
    ledge(hall, H0, 9, 0.9, 0.3, MUS.white);
    ledge(hall, H0, 8.2, 0.25, 0.32, MUS.led, 1);
    // hexagon skylights on the hall roof
    for (let i = 0; i < 5; i++) {
      const hu = (i - 2) * 6.8 + L * 0.01,
        hv = hallV + (i % 2 ? 1 : -1) * hallW * 0.2;
      loft(hall, ngon(6, 2.8, Math.PI / 6, hu, hv), ngon(6, 2.2, Math.PI / 6, hu, hv), 9.9, 11.6, MUS.glass, { top: MUS.glassDeep, glow: 0 });
    }
    put(k, hall);
    k.wall(0, hallV, 0, L * 0.9, hallW, 9);
    // the high tower and the low tower
    const towers = [
      { u: -L * 0.22, hx: L * 0.105, hz: hallW * 0.3, h: 62, seed: 71 },
      { u: L * 0.24, hx: L * 0.095, hz: hallW * 0.27, h: 42, seed: 72 },
    ];
    for (const t of towers) {
      const g = new Geo();
      facetTower(g, t.hx, t.hz, 9.9, t.h - 9.9, t.seed);
      put(k, g, t.u, hallV);
      k.wall(t.u, hallV, 9, t.hx * 1.8, t.hz * 1.8, t.h - 9);
    }
    // the covered walkway on the harbour edge
    walkway(k, -L * 0.46, L * 0.46, side * (W / 2 - 3.4), 4.6, 3);
    m.covers.push(rectRing(r));
    kits.push(k);
  }
  // the coral pavilions, on the mapped building across the river mouth (Glory Pier)
  const bi = ctx.data.buildings.findIndex((b) => (b.name ?? '').includes('礁群'));
  if (bi >= 0) {
    const b = ctx.data.buildings[bi];
    const k = new Kit(m.id + '-coral', b.obb[0], b.obb[1], b.obb[4]);
    const R = 6.2;
    const dx = R * Math.sqrt(3),
      dz = R * 1.5;
    const [, , L, W] = b.obb;
    for (let j = -Math.ceil(W / dz); j <= Math.ceil(W / dz); j++)
      for (let i = -Math.ceil(L / dx); i <= Math.ceil(L / dx); i++) {
        const u = i * dx + (j % 2 ? dx / 2 : 0),
          v = j * dz;
        const [x, z] = k.at(u, v);
        if (!pointInRing(x, z, b.poly) || ctx.site.roadGap(x, z) < R + 1 || !ctx.site.onLand(x, z)) continue;
        const hh = hash(x, z);
        const h = 6 + Math.floor(hh * 4) * 2.5;
        const g = new Geo();
        pavilion(g, R - 0.5, h, (hash(z, x) - 0.5) * 5, (hash(x + 1, z) - 0.5) * 5, Math.floor(hh * 1000));
        k.mesh(u, v, 0, g.geometry());
        k.pillar(u, v, 0, (R - 0.5) * 0.95, h);
      }
    m.replaces.push(bi);
    m.covers.push(b.poly);
    kits.push(k);
  }
  return kits.length ? kits : null;
}

// ---------------------------------------------------------------------------------------------------------------
// CSC headquarters (中鋼總部大樓): four square towers round a core, built of stacked cube modules; each module is
// turned a little further about the core than the one below, so the whole tower twists as it steps up (about 135 m)
// ---------------------------------------------------------------------------------------------------------------
export function skylineCsc(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 33, W: 33 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const half = Math.min(r.L, r.W) / 2 - 0.3;
  const mods = 10,
    modH = 12.3,
    gap = 1.0;
  const twist = (2.0 * Math.PI) / 180;
  // the cluster's half side, so the most-turned module (and its step-out) stays inside the site
  const amax = twist * (mods + 1);
  const S = Math.min(13, (half - 0.6) / (Math.cos(amax) + Math.sin(amax)));
  const q = S / 2; // each tower's half side (two towers per side of the cluster)
  const g = new Geo();
  // the dark core, seen in the slots between the towers
  const core = chamfer(S * 0.42, S * 0.42, 0);
  loft(g, core, null, 0, mods * modH + 8, CSC.core, { top: CSC.joint });
  const skin: Skin = { wall: CSC.panel, glass: CSC.glass, lit: CSC.lit, floor: modH / 3, glassFrac: 0.5, segLen: 4, maxSeg: 2, litRate: 0.4, litGlow: 0.8, seed: 0, top: CSC.panelDark, bottom: CSC.joint };
  const corners: P2[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  corners.forEach(([a, b], ti) => {
    // two diagonal towers rise one module higher
    const n = mods + (a + b === 0 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ang = twist * i;
      const out = i % 2 ? 0.45 : 0; // the stepped cubes: every other module stands a little proud
      const cx = a * (q + out * 0.7),
        cz = b * (q + out * 0.7);
      const y0 = i * modH,
        y1 = y0 + modH - gap;
      const sq = turn(chamfer(q - gap / 2 + out * 0.3, q - gap / 2 + out * 0.3, 0, cx, cz), ang);
      facade(g, sq, null, y0, y1, { ...skin, seed: 100 + ti * 20 + i, bottom: i === 0 ? null : CSC.joint });
      // the recessed joint between the cubes
      if (i < n - 1) loft(g, turn(chamfer(q - gap / 2 - 0.6, q - gap / 2 - 0.6, 0, a * q, b * q), ang + twist / 2), null, y1, y1 + gap, CSC.joint, { top: null });
    }
    k.wall(a * q, b * q, 0, 2 * q - gap, 2 * q - gap, n * modH);
  });
  // the roof: a plant box and a mast on the core
  const yr = mods * modH + 8;
  loft(g, ngon(8, 1.6, Math.PI / 8), ngon(8, 0.3, Math.PI / 8), yr, yr + 7, CSC.panel, { top: null });
  ledge(g, core, yr - 1.2, 0.3, 0.1, CSC.lit, 1);
  put(k, g);
  k.wall(0, 0, 0, S * 0.84, S * 0.84, yr);
  m.covers.push(rectRing(r));
  return [k];
}
