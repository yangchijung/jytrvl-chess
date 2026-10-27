// Rush Taxi — culture slice: a small triangle builder for the detailed landmark models (hero/culture.ts).
//
// Everything is built in a model part's own metres (x along the kit's u, z along its v, y up, origin at the foot)
// as plain non-indexed triangles with a colour and a night glow per vertex, then handed to `Kit.mesh`.
// Every face is given the direction it should face (`hint`); the winding is flipped to match, so faces are always
// seen from outside (the landmark material culls back faces).
import * as THREE from 'three';

export type V3 = [number, number, number];
export type P2 = [number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const UP: V3 = [0, 1, 0];
const DOWN: V3 = [0, -1, 0];
const tmp = new THREE.Color();
const cache = new Map<string, [number, number, number]>();
function rgb(c: string): [number, number, number] {
  let v = cache.get(c);
  if (!v) {
    tmp.set(c);
    v = [tmp.r, tmp.g, tmp.b];
    cache.set(c, v);
  }
  return v;
}

export class Geo {
  pos: number[] = [];
  col: number[] = [];
  glow: number[] = [];
  get tris() {
    return this.pos.length / 9;
  }
  tri(a: V3, b: V3, c: V3, color: string, g = 0, hint?: V3) {
    const n = cross(sub(b, a), sub(c, a));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-7) return;
    if (hint && dot(n, hint) < 0) [b, c] = [c, b];
    const [r, gg, bb] = rgb(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(r, gg, bb);
      this.glow.push(g);
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, color: string, g: number, hint: V3) {
    this.tri(a, b, c, color, g, hint);
    this.tri(a, c, d, color, g, hint);
  }
  /** the geometry for `Kit.mesh` (position, colour, aGlow) */
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    return g;
  }

  /** a box standing on y0, turned by yaw about y; no bottom face (it stands on something) */
  box(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, color: string, o: { g?: number; yaw?: number; top?: string | false; bottom?: boolean } = {}) {
    const hx = sx / 2,
      hz = sz / 2,
      y1 = y0 + sy;
    const c = Math.cos(o.yaw ?? 0),
      s = Math.sin(o.yaw ?? 0);
    const P = (u: number, y: number, v: number): V3 => [cx + u * c - v * s, y, cz + u * s + v * c];
    const cs: P2[] = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ];
    const g = o.g ?? 0;
    for (let i = 0; i < 4; i++) {
      const A = cs[i],
        B = cs[(i + 1) % 4];
      const mu = (A[0] + B[0]) / 2,
        mv = (A[1] + B[1]) / 2;
      this.quad(P(A[0], y0, A[1]), P(B[0], y0, B[1]), P(B[0], y1, B[1]), P(A[0], y1, A[1]), color, g, [mu * c - mv * s, 0, mu * s + mv * c]);
    }
    if (o.top !== false) this.quad(P(-hx, y1, -hz), P(hx, y1, -hz), P(hx, y1, hz), P(-hx, y1, hz), o.top ?? color, g, UP);
    if (o.bottom) this.quad(P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), color, g, DOWN);
  }

  /** a flat panel (window, door, inset) on an axis-aligned wall facing (nx, nz), its bottom at y0, `out` off the wall */
  panel(cx: number, y0: number, cz: number, w: number, h: number, nx: number, nz: number, color: string, g = 0, out = 0.06) {
    const tx = -nz,
      tz = nx;
    const x = cx + nx * out,
      z = cz + nz * out;
    const a: V3 = [x - (tx * w) / 2, y0, z - (tz * w) / 2],
      b: V3 = [x + (tx * w) / 2, y0, z + (tz * w) / 2];
    this.quad(a, b, [b[0], y0 + h, b[2]], [a[0], y0 + h, a[2]], color, g, [nx, 0, nz]);
  }
  /** an arched window: a rectangle under a half disc, the whole thing h tall */
  arch(cx: number, y0: number, cz: number, w: number, h: number, nx: number, nz: number, color: string, g = 0, seg = 6, out = 0.06) {
    const r = w / 2;
    const yc = y0 + Math.max(0.01, h - r);
    this.panel(cx, y0, cz, w, yc - y0, nx, nz, color, g, out);
    const tx = -nz,
      tz = nx;
    const x = cx + nx * out,
      z = cz + nz * out;
    const c: V3 = [x, yc, z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI,
        a1 = ((i + 1) / seg) * Math.PI;
      this.tri(c, [x + tx * r * Math.cos(a0), yc + r * Math.sin(a0), z + tz * r * Math.cos(a0)], [x + tx * r * Math.cos(a1), yc + r * Math.sin(a1), z + tz * r * Math.cos(a1)], color, g, [nx, 0, nz]);
    }
  }

  /** a round (or polygonal) column; rt = top radius */
  cyl(cx: number, y0: number, cz: number, r: number, h: number, seg: number, color: string, o: { g?: number; rt?: number; top?: string | false; a0?: number } = {}) {
    const rt = o.rt ?? r,
      g = o.g ?? 0,
      a0 = o.a0 ?? 0;
    for (let i = 0; i < seg; i++) {
      const a = a0 + (i / seg) * Math.PI * 2,
        b = a0 + ((i + 1) / seg) * Math.PI * 2,
        m = (a + b) / 2;
      const p0: V3 = [cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r],
        p1: V3 = [cx + Math.cos(b) * r, y0, cz + Math.sin(b) * r],
        p2: V3 = [cx + Math.cos(b) * rt, y0 + h, cz + Math.sin(b) * rt],
        p3: V3 = [cx + Math.cos(a) * rt, y0 + h, cz + Math.sin(a) * rt];
      this.quad(p0, p1, p2, p3, color, g, [Math.cos(m), (r - rt) / Math.max(h, 0.01), Math.sin(m)]);
      if (o.top !== false && rt > 0) this.tri([cx, y0 + h, cz], p3, p2, o.top ?? color, g, UP);
    }
  }

  /** a body of revolution: profile points [radius, height] from the bottom round the outside to the top */
  lathe(cx: number, y0: number, cz: number, prof: P2[], seg: number, color: string, g = 0, colors?: string[]) {
    for (let k = 0; k + 1 < prof.length; k++) {
      const [r0, h0] = prof[k];
      const [r1, h1] = prof[k + 1];
      const nr = h1 - h0,
        ny = -(r1 - r0);
      const c = colors?.[k] ?? color;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2,
          b = ((i + 1) / seg) * Math.PI * 2,
          m = (a + b) / 2;
        const P = (r: number, h: number, t: number): V3 => [cx + Math.cos(t) * r, y0 + h, cz + Math.sin(t) * r];
        this.quad(P(r0, h0, a), P(r0, h0, b), P(r1, h1, b), P(r1, h1, a), c, g, [Math.cos(m) * nr, ny, Math.sin(m) * nr]);
      }
    }
  }

  /** a tube along a polyline with a rectangular-ish section (sides 3…8), radii per point (taper); end caps */
  tube(pts: V3[], r: number | number[], sides: number, color: string, g = 0, o: { rh?: number | number[]; caps?: boolean; spin?: number } = {}) {
    const n = pts.length;
    const rad = (i: number) => (Array.isArray(r) ? r[i] : r);
    const radh = (i: number) => (o.rh === undefined ? rad(i) : Array.isArray(o.rh) ? o.rh[i] : o.rh);
    const rings: V3[][] = [];
    for (let i = 0; i < n; i++) {
      const T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      let S = cross(T, UP);
      if (Math.hypot(S[0], S[1], S[2]) < 1e-3) S = [1, 0, 0];
      S = norm(S);
      const U = cross(S, T);
      const ring: V3[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (o.spin ?? Math.PI / sides) + (k / sides) * Math.PI * 2;
        const cs = Math.cos(a) * rad(i),
          sn = Math.sin(a) * radh(i);
        ring.push([pts[i][0] + S[0] * cs + U[0] * sn, pts[i][1] + S[1] * cs + U[1] * sn, pts[i][2] + S[2] * cs + U[2] * sn]);
      }
      rings.push(ring);
    }
    for (let i = 0; i + 1 < n; i++) {
      const cm: V3 = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2];
      for (let k = 0; k < sides; k++) {
        const a = rings[i][k],
          b = rings[i][(k + 1) % sides],
          c = rings[i + 1][(k + 1) % sides],
          d = rings[i + 1][k];
        const mid: V3 = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
        this.quad(a, b, c, d, color, g, sub(mid, cm));
      }
    }
    if (o.caps !== false)
      for (const [i, j] of [
        [0, 1],
        [n - 1, n - 2],
      ]) {
        const out = sub(pts[i], pts[j]);
        for (let k = 1; k + 1 < sides; k++) this.tri(rings[i][0], rings[i][k], rings[i][k + 1], color, g, out);
      }
  }

  /** a straight prism over a convex polygon (x, z), from y0 to y1, with its top */
  prism(poly: P2[], y0: number, y1: number, color: string, o: { g?: number; top?: string | false } = {}) {
    const g = o.g ?? 0;
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length,
      cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i],
        B = poly[(i + 1) % poly.length];
      this.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], color, g, [(A[0] + B[0]) / 2 - cx, 0, (A[1] + B[1]) / 2 - cz]);
    }
    if (o.top !== false) for (let i = 1; i + 1 < poly.length; i++) this.tri([poly[0][0], y1, poly[0][1]], [poly[i][0], y1, poly[i][1]], [poly[i + 1][0], y1, poly[i + 1][1]], o.top ?? color, g, UP);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// curved Chinese roofs
// ---------------------------------------------------------------------------------------------------------------
export type Slope = 'f' | 'b' | 'l' | 'r';
export interface RoofO {
  /** centre of the roof in the part's frame */
  x?: number;
  z?: number;
  /** eave half sizes along x and z, at height y0 */
  a: number;
  b: number;
  /** half sizes of the top: a ridge (rb = 0, ra > 0, or ra = 0, rb > 0), a point (both 0) or an opening (a skirt) */
  ra: number;
  rb: number;
  /** the top's centre is moved this far along z from the eave's centre (a porch under one side of a skirt) */
  rz?: number;
  y0: number;
  H: number;
  /** how much the eave corners turn up (m) */
  lift?: number;
  /** how much the ridge rises towards its ends (the swallowtail sweep, m) */
  sag?: number;
  thick?: number;
  color: string;
  /** every other tile column in this colour (the rows of tiles) */
  stripe?: string;
  under?: string;
  /** the fascia (eave edge) colour and glow (a string of lights along the eaves at night) */
  fascia?: string;
  fasciaGlow?: number;
  ns?: number;
  nt?: number;
  /** which slopes: f(ront, +z), b(ack), l(eft, −x), r(ight); default all four (a hip roof); 'fb' is a gable roof */
  slopes?: string;
}
const OUT: Record<Slope, V3> = { f: [0, 0, 1], b: [0, 0, -1], l: [-1, 0, 0], r: [1, 0, 0] };

/** a point of a roof slope: s 0 at the eave … 1 at the top, t 0…1 along the eave; `under` lowers it (the soffit) */
export function roofPt(o: RoofO, k: Slope, s: number, t: number, under = 0): V3 {
  const { a, b, ra, rb } = o;
  const E: Record<Slope, [P2, P2]> = { f: [[-a, b], [a, b]], b: [[a, -b], [-a, -b]], r: [[a, b], [a, -b]], l: [[-a, -b], [-a, b]] };
  const R: Record<Slope, [P2, P2]> = { f: [[-ra, rb], [ra, rb]], b: [[ra, -rb], [-ra, -rb]], r: [[ra, rb], [ra, -rb]], l: [[-ra, -rb], [-ra, rb]] };
  const [e0, e1] = E[k];
  const [r0, r1] = R[k];
  const ex = e0[0] + (e1[0] - e0[0]) * t,
    ez = e0[1] + (e1[1] - e0[1]) * t;
  const rx = r0[0] + (r1[0] - r0[0]) * t,
    rz = r0[1] + (r1[1] - r0[1]) * t + (o.rz ?? 0);
  const e = Math.abs(2 * t - 1);
  const y = o.y0 + o.H * (0.4 * s + 0.6 * s * s) + (o.lift ?? 0) * e ** 3 * (1 - s) ** 2 + (o.sag ?? 0) * e * e * s ** 1.5 - under;
  return [(o.x ?? 0) + ex + (rx - ex) * s, y, (o.z ?? 0) + ez + (rz - ez) * s];
}
/** the roof's underside height at a fraction s of the way from the eave to the top (middle of the slope) */
export function roofUnderY(o: RoofO, s: number) {
  return roofPt(o, 'f', s, 0.5, o.thick ?? 0.35)[1];
}

/** a curved roof: tiled top, soffit, fascia; gable roofs ('fb') also get their rake edges */
export function roof(G: Geo, o: RoofO) {
  const ns = o.ns ?? 4,
    nt = o.nt ?? 10,
    th = o.thick ?? 0.35;
  const sl = [...(o.slopes ?? 'fblr')] as Slope[];
  const under = o.under ?? '#5B4A3C',
    fascia = o.fascia ?? under;
  const gable = !sl.includes('l') && !sl.includes('r');
  const open = o.ra > 0 && o.rb > 0;
  for (const k of sl) {
    for (let j = 0; j < nt; j++) {
      const t0 = j / nt,
        t1 = (j + 1) / nt;
      const c = o.stripe && j % 2 ? o.stripe : o.color;
      for (let i = 0; i < ns; i++) {
        const s0 = i / ns,
          s1 = (i + 1) / ns;
        G.quad(roofPt(o, k, s0, t0), roofPt(o, k, s0, t1), roofPt(o, k, s1, t1), roofPt(o, k, s1, t0), c, 0, UP);
        G.quad(roofPt(o, k, s0, t0, th), roofPt(o, k, s0, t1, th), roofPt(o, k, s1, t1, th), roofPt(o, k, s1, t0, th), under, 0, DOWN);
      }
      // the fascia along the eave
      G.quad(roofPt(o, k, 0, t0), roofPt(o, k, 0, t1), roofPt(o, k, 0, t1, th), roofPt(o, k, 0, t0, th), fascia, o.fasciaGlow ?? 0, OUT[k]);
      if (open) G.quad(roofPt(o, k, 1, t0), roofPt(o, k, 1, t1), roofPt(o, k, 1, t1, th), roofPt(o, k, 1, t0, th), under, 0, [-OUT[k][0], 0.2, -OUT[k][2]]);
    }
    if (gable)
      for (const t of [0, 1]) {
        const p0 = roofPt(o, k, 0, t);
        const side: V3 = [Math.sign(p0[0] - (o.x ?? 0)), 0, 0];
        for (let i = 0; i < ns; i++) G.quad(roofPt(o, k, i / ns, t), roofPt(o, k, (i + 1) / ns, t), roofPt(o, k, (i + 1) / ns, t, th), roofPt(o, k, i / ns, t, th), fascia, 0, side);
      }
  }
}

/** the gable end walls of a two-slope roof, at x = ±xw, down to y = base */
export function gableWalls(G: Geo, o: RoofO, xw: number, base: number, color: string) {
  const ns = o.ns ?? 4,
    th = o.thick ?? 0.35;
  for (const sg of [-1, 1]) {
    const u = sg * xw;
    const t = (u + o.a) / (2 * o.a);
    const pts: V3[] = [];
    for (let i = 0; i <= ns; i++) pts.push(roofPt(o, 'f', i / ns, t, th + 0.02));
    for (let i = ns; i >= 0; i--) pts.push(roofPt(o, 'b', i / ns, 1 - t, th + 0.02));
    const c: V3 = [(o.x ?? 0) + u, base, o.z ?? 0];
    for (const p of pts) p[0] = c[0];
    for (let i = 0; i + 1 < pts.length; i++) G.tri(c, pts[i], pts[i + 1], color, 0, [sg, 0, 0]);
    // close the bottom corners down to the base line
    G.tri(c, [c[0], base, pts[0][2]], pts[0], color, 0, [sg, 0, 0]);
    G.tri(c, pts[pts.length - 1], [c[0], base, pts[pts.length - 1][2]], color, 0, [sg, 0, 0]);
  }
}

/** points of the ridge line of a roof whose top is a line along x (rb = 0), n + 1 points, raised by dy */
export function ridgeLine(o: RoofO, n: number, dy = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = roofPt(o, 'f', 1, i / n);
    out.push([p[0], p[1] + dy, p[2]]);
  }
  return out;
}

/** a smooth curve through control points, n + 1 samples */
export function curve(ctrl: V3[], n: number): V3[] {
  const c = new THREE.CatmullRomCurve3(ctrl.map((p) => new THREE.Vector3(...p)));
  return c.getPoints(n).map((v) => [v.x, v.y, v.z] as V3);
}
