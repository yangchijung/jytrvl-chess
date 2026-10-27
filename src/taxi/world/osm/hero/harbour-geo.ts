import * as THREE from 'three';
// Rush Taxi — a small triangle writer for the detailed landmark models (hero slices). Every face is given with the
// direction it should face, and the writer turns its winding to match, so faces are always visible from outside.
// Vertex colours and a per-vertex night glow (`aGlow`) ride along; build.ts computes flat normals.

export type V3 = [number, number, number];
type Col = string | THREE.Color;
const tmp = new THREE.Color();

/** a colour scaled by f (shading / weathering) */
export function shade(c: Col, f: number) {
  return new THREE.Color(c).multiplyScalar(f);
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Geo {
  pos: number[] = [];
  col: number[] = [];
  glow: number[] = [];
  /** triangle counts where the model is cut into separate parts (see `parts`) */
  cuts: number[] = [];
  get tris() {
    return this.pos.length / 9;
  }
  /** one triangle; `n` (the way it should face) fixes the winding; colours and glow per vertex or for all three */
  tri(a: V3, b: V3, c: V3, col: Col | Col[], n?: V3, glow: number | number[] = 0) {
    let p = [a, b, c];
    let cs = Array.isArray(col) ? col : [col, col, col];
    let gs = Array.isArray(glow) ? glow : [glow, glow, glow];
    if (n && dot(cross(sub(b, a), sub(c, a)), n) < 0) {
      p = [a, c, b];
      cs = [cs[0], cs[2], cs[1]];
      gs = [gs[0], gs[2], gs[1]];
    }
    for (let i = 0; i < 3; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      tmp.set(cs[i]);
      this.col.push(tmp.r, tmp.g, tmp.b);
      this.glow.push(gs[i]);
    }
  }
  /** a planar quad a-b-c-d (in order round its edge) facing n */
  quad(a: V3, b: V3, c: V3, d: V3, col: Col | Col[], n: V3, glow: number | number[] = 0) {
    const cs = Array.isArray(col) ? col : [col, col, col, col];
    const gs = Array.isArray(glow) ? glow : [glow, glow, glow, glow];
    this.tri(a, b, c, [cs[0], cs[1], cs[2]], n, [gs[0], gs[1], gs[2]]);
    this.tri(a, c, d, [cs[0], cs[2], cs[3]], n, [gs[0], gs[2], gs[3]]);
  }
  /** both faces of a thin sheet (sails, glass balustrades) */
  sheet(a: V3, b: V3, c: V3, col: Col | Col[], glow: number | number[] = 0) {
    const n = cross(sub(b, a), sub(c, a));
    this.tri(a, b, c, col, n, glow);
    this.tri(a, b, c, col, [-n[0], -n[1], -n[2]], glow);
  }
  /** a convex planar polygon as a fan, facing n */
  fan(pts: V3[], col: Col, n: V3, glow = 0) {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(pts[0], pts[i], pts[i + 1], col, n, glow);
  }
  /** an axis-aligned box; `skip` leaves out faces nobody sees ('b' bottom, 't' top, '-x' '+x' '-z' '+z') */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: Col, o: { skip?: string[]; glow?: number; top?: Col; low?: Col } = {}) {
    const sk = new Set(o.skip ?? ['b']);
    const g = o.glow ?? 0;
    const lo = o.low ?? col;
    const side = (a: V3, b: V3, c: V3, d: V3, n: V3) => this.quad(a, b, c, d, [lo, lo, col, col], n, g);
    if (!sk.has('-z')) side([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
    if (!sk.has('+z')) side([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]);
    if (!sk.has('-x')) side([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]);
    if (!sk.has('+x')) side([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
    if (!sk.has('t')) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], o.top ?? col, [0, 1, 0], g);
    if (!sk.has('b')) this.quad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], col, [0, -1, 0], g);
  }
  /** a box centred at (cx, cy, cz), turned by yaw about y (local x towards −z for positive yaw, as three.js rotateY) */
  boxR(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, col: Col, o: { glow?: number; skipBottom?: boolean; top?: Col } = {}) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const P = (x: number, y: number, z: number): V3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const hx = sx / 2,
      hy = sy / 2,
      hz = sz / 2;
    const ctr: V3 = [cx, cy, cz];
    const f = (a: V3, b: V3, cc: V3, d: V3, colr: Col) => {
      const m: V3 = [(a[0] + cc[0]) / 2, (a[1] + cc[1]) / 2, (a[2] + cc[2]) / 2];
      this.quad(a, b, cc, d, colr, sub(m, ctr), o.glow ?? 0);
    };
    f(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), col);
    f(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), col);
    f(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), col);
    f(P(hx, -hy, -hz), P(hx, -hy, hz), P(hx, hy, hz), P(hx, hy, -hz), col);
    f(P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz), o.top ?? col);
    if (!o.skipBottom) f(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), col);
  }
  /** a round (or `seg`-sided) tube from a to b, radius r (rb at b), open ends unless `caps` */
  tube(a: V3, b: V3, r: number, seg: number, col: Col, o: { rb?: number; caps?: boolean; glow?: number; colB?: Col } = {}) {
    const ax = sub(b, a);
    const L = Math.hypot(...ax) || 1;
    const d: V3 = [ax[0] / L, ax[1] / L, ax[2] / L];
    // two directions square to the axis
    const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = cross(d, ref);
    const l1 = Math.hypot(...e1);
    e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    const e2 = cross(d, e1);
    const rb = o.rb ?? r;
    const ring = (p: V3, rr: number, i: number): V3 => {
      const t = (i / seg) * Math.PI * 2 + Math.PI / seg;
      const cs = Math.cos(t) * rr,
        sn = Math.sin(t) * rr;
      return [p[0] + e1[0] * cs + e2[0] * sn, p[1] + e1[1] * cs + e2[1] * sn, p[2] + e1[2] * cs + e2[2] * sn];
    };
    const cb = o.colB ?? col;
    for (let i = 0; i < seg; i++) {
      const a0 = ring(a, r, i),
        a1 = ring(a, r, i + 1),
        b1 = ring(b, rb, i + 1),
        b0 = ring(b, rb, i);
      const t = ((i + 0.5) / seg) * Math.PI * 2 + Math.PI / seg;
      const n: V3 = [e1[0] * Math.cos(t) + e2[0] * Math.sin(t), e1[1] * Math.cos(t) + e2[1] * Math.sin(t), e1[2] * Math.cos(t) + e2[2] * Math.sin(t)];
      this.quad(a0, a1, b1, b0, [col, col, cb, cb], n, o.glow ?? 0);
    }
    if (o.caps) {
      this.fan(Array.from({ length: seg }, (_, i) => ring(b, rb, i)), cb, d, o.glow ?? 0);
      this.fan(Array.from({ length: seg }, (_, i) => ring(a, r, i)), col, [-d[0], -d[1], -d[2]], o.glow ?? 0);
    }
  }
  /**
   * a profile in the (z, y) plane swept along x from xs[0] to the last break; the sides are cut at every break so each
   * strip can take its own colour (corrugated sheet panels); the ends are closed when `caps`
   */
  extrudeX(profile: [number, number][], xs: number[], col: (strip: number, edge: number) => Col, o: { caps?: Col; glow?: (edge: number) => number; skipEdges?: number[] } = {}) {
    // orient the profile counter-clockwise (z right, y up) so (dy, −dz) points outwards
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const [z0, y0] = profile[i];
      const [z1, y1] = profile[(i + 1) % profile.length];
      area += z0 * y1 - z1 * y0;
    }
    const pr = area < 0 ? [...profile].reverse() : profile;
    const skip = new Set(o.skipEdges ?? []);
    for (let s = 0; s + 1 < xs.length; s++)
      for (let i = 0; i < pr.length; i++) {
        const [za, ya] = pr[i];
        const [zb, yb] = pr[(i + 1) % pr.length];
        const n0 = pr.length;
        const ei = area < 0 ? (((n0 - 2 - i) % n0) + n0) % n0 : i;
        if (skip.has(ei)) continue;
        // outward normal of a CCW (z, y) polygon: (dy, −dz) in (z, y), i.e. y = −dz, z = dy
        const nn: V3 = [0, -(zb - za), yb - ya];
        this.quad([xs[s], ya, za], [xs[s + 1], ya, za], [xs[s + 1], yb, zb], [xs[s], yb, zb], col(s, ei), nn, o.glow?.(ei) ?? 0);
      }
    if (o.caps) {
      const tris = THREE.ShapeUtils.triangulateShape(pr.map(([z, y]) => new THREE.Vector2(z, y)), []);
      for (const [x, nx] of [
        [xs[0], -1],
        [xs[xs.length - 1], 1],
      ])
        for (const t of tris) this.tri([x, pr[t[0]][1], pr[t[0]][0]], [x, pr[t[1]][1], pr[t[1]][0]], [x, pr[t[2]][1], pr[t[2]][0]], o.caps, [nx, 0, 0]);
    }
  }
  /** appends another writer's triangles, turned by yaw about y and moved by (dx, dy, dz) */
  add(g: Geo, dx = 0, dy = 0, dz = 0, yaw = 0) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let i = 0; i < g.pos.length; i += 3) {
      const x = g.pos[i],
        y = g.pos[i + 1],
        z = g.pos[i + 2];
      this.pos.push(dx + x * c + z * s, dy + y, dz - x * s + z * c);
    }
    this.col.push(...g.col);
    this.glow.push(...g.glow);
  }
  /** ends a part here: the triangles so far and those after become separate mesh parts */
  cut() {
    if (this.tris && this.cuts[this.cuts.length - 1] !== this.tris) this.cuts.push(this.tris);
    return this;
  }
  /** the parts between the cuts, each as its own writer */
  parts() {
    const ends = [...this.cuts.filter((c) => c < this.tris), this.tris];
    let a = 0;
    return ends.map((b) => {
      const g = new Geo();
      g.pos = this.pos.slice(a * 9, b * 9);
      g.col = this.col.slice(a * 9, b * 9);
      g.glow = this.glow.slice(a * 3, b * 3);
      a = b;
      return g;
    });
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    return g;
  }
}

/** the mean outward test of a closed solid: the share of triangles whose normal points away from `centre` */
export function outwardShare(g: Geo, centre: V3) {
  let ok = 0;
  for (let i = 0; i < g.pos.length; i += 9) {
    const a: V3 = [g.pos[i], g.pos[i + 1], g.pos[i + 2]],
      b: V3 = [g.pos[i + 3], g.pos[i + 4], g.pos[i + 5]],
      c: V3 = [g.pos[i + 6], g.pos[i + 7], g.pos[i + 8]];
    const m: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(cross(sub(b, a), sub(c, a)), sub(m, centre)) > 0) ok++;
  }
  return ok / (g.pos.length / 9);
}
