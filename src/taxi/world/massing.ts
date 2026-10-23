// Rush Taxi — building massing: the shapes that make a block read as part of a Taiwanese harbour city instead of a
// row of identical boxes. Old-street rows of narrow 透天厝 with uneven heights, set-back top floors and concrete
// balconies; downtown towers on podiums with setbacks and mechanical penthouses or framed tops (the tallest by the
// river); stepped mid-rise slabs with a stair core and an entrance canopy in the university district; harbour sheds
// with low-pitched or sawtooth roofs. Plain data, no Three.js, so the layout rules can be unit tested.
//
// Every building keeps one `base` volume on its old footprint: it is the street wall, the collider and the wall the
// shop signs and air conditioners hang on. Everything above or in front of it is drawn only (upper volumes also get
// a simple hidden collider in city.ts).

/** a drawn volume with the building shader; y0 = bottom, look = the facade style (0 house, 1 tower, 2 hall, 3 shed) */
export interface Mass {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  h: number;
  color: string;
  look: number;
}
/** a small plain box (balconies, canopies, crown frames); y = centre */
export interface Slab {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}
/** a pitched shed roof sitting on a wall top at y: teeth 0 = one low gable along `axis`, otherwise sawtooth bays along it */
export interface Pitch {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  rise: number;
  axis: 'x' | 'z';
  teeth: number;
  wall: string;
  roof: string;
}
/** a flat, uncovered roof area (where tanks and sheet-metal sheds may stand) */
export interface RoofRect {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
}
export interface Massing {
  masses: Mass[];
  slabs: Slab[];
  pitched: Pitch[];
  roofs: RoofRect[];
}
/** one building of a block */
export interface Bld {
  /** hash key within the block (for the decor's random choices) */
  k: number;
  base: Mass;
  upper: Mass[];
  slabs: Slab[];
  pitch?: Pitch;
  /** the flat roof for tanks and sheds; null when the roof is pitched or a glass tower's */
  roof: RoofRect | null;
  /** the street face that carries balconies (no shop signs or air conditioners there) */
  balcony?: { nx: number; nz: number };
}
export interface BlockCtx {
  cx: number;
  cz: number;
  /** deterministic random in [0, 1) for this block */
  r: (...k: number[]) => number;
  color: (k: number) => string;
  height: number[];
  /** next to the Love River: where downtown puts its landmark towers */
  nearRiver: boolean;
  lot: number;
}

/** wall height for n storeys of a facade style, matching the shader's floor grid (ground floor, floors, parapet) */
export const FLOORS: Record<number, { ground: number; fh: number }> = { 0: { ground: 3.4, fh: 3.0 }, 1: { ground: 4.2, fh: 3.6 }, 2: { ground: 3.4, fh: 3.8 }, 3: { ground: 3.4, fh: 3.0 } };
export const storeys = (look: number, n: number) => FLOORS[look].ground + FLOORS[look].fh * (n - 1) + 0.5;

const PENTHOUSE = '#8C959D';
const FRAME = '#D5DADF';
const BALCONY = '#E4E0D8';
const CANOPY = '#CFD4D9';
const SHEET = ['#8E9AA3', '#7E8C80', '#A35D4A', '#6F8FA6'];

const top = (m: Mass) => m.y0 + m.h;
const roofOf = (m: Mass, inset = 0): RoofRect => ({ x: m.x, z: m.z, w: m.w - inset * 2, d: m.d - inset * 2, y: top(m) });

/** (u along the row, v across) → world, for blocks laid out along x or along z */
function frame(cx: number, cz: number, alongX: boolean) {
  return {
    mass: (u: number, v: number, lu: number, lv: number, y0: number, h: number, color: string, look: number): Mass => (alongX ? { x: cx + u, z: cz + v, w: lu, d: lv, y0, h, color, look } : { x: cx + v, z: cz + u, w: lv, d: lu, y0, h, color, look }),
    slab: (u: number, v: number, lu: number, lv: number, y: number, h: number, color: string): Slab => (alongX ? { x: cx + u, z: cz + v, w: lu, d: lv, y, h, color } : { x: cx + v, z: cz + u, w: lv, d: lu, y, h, color }),
    normal: (sv: number) => (alongX ? { nx: 0, nz: sv } : { nx: sv, nz: 0 }),
  };
}

/** old street (哈瑪星·鹽埕): two rows of narrow 透天厝 back to back with a drivable alley between them */
export function alleyBlock(c: BlockCtx, alongX: boolean): Bld[] {
  const { r, lot } = c;
  const F = frame(c.cx, c.cz, alongX);
  const gap = 8,
    a = (lot - 6 - gap) / 2,
    off = gap / 2 + a / 2,
    len = lot - 6;
  const out: Bld[] = [];
  for (const s of [-1, 1]) {
    // split the row into house lots 4.2–6.6 m wide
    const lots: [number, number][] = [];
    for (let u = -len / 2, i = 0; len / 2 - u > 0.01; i++) {
      let w = 4.2 + r(s, i, 20) * 2.4;
      if (len / 2 - u - w < 3.8) w = len / 2 - u;
      lots.push([u, w]);
      u += w;
    }
    lots.forEach(([u0, w], i) => {
      const k = i * 2 + (s > 0 ? 1 : 0);
      const x = r(k, 21);
      const n = x < 0.1 ? 2 : x < 0.45 ? 3 : x < 0.8 ? 4 : 5;
      const setback = n >= 4 && r(k, 22) < 0.6;
      const bn = setback ? n - 1 : n;
      const color = c.color(k);
      const um = u0 + w / 2;
      const base = F.mass(um, s * off, w, a, 0, storeys(0, bn), color, 0);
      const b: Bld = { k, base, upper: [], slabs: [], roof: null };
      let roofMass = base;
      if (setback) {
        // the top floor steps back from the street (a terrace in front) and a little from the alley
        const sf = 1.4 + r(k, 23) * 1.6,
          sb = r(k, 24) * 2;
        const y0 = top(base) - 0.5;
        const up = F.mass(um, s * (off + (sb - sf) / 2), w, a - sf - sb, y0, storeys(0, n) - y0, color, 0);
        b.upper.push(up);
        roofMass = up;
      }
      b.roof = roofOf(roofMass);
      if (bn >= 2 && r(k, 25) < 0.45) {
        // cantilevered balconies with a solid parapet on the street face, one per upper floor
        for (let f = 1; f < bn; f++) b.slabs.push(F.slab(um, s * (off + a / 2 + 0.5), w - 0.8, 1.0, storeys(0, f) - 0.5 + 0.45, 1.1, BALCONY));
        b.balcony = F.normal(s);
      }
      out.push(b);
    });
  }
  return out;
}

/** downtown: one big tower on a podium (often near the river) or four towers, with setbacks and roof crowns */
export function towerBlock(c: BlockCtx): Bld[] {
  const { r, cx, cz } = c;
  const [h0, h1] = c.height;
  const crown = (b: Bld, t: Mass, k: number, framed: boolean) => {
    const pw = Math.max(3, t.w * 0.42),
      pd = Math.max(3, t.d * 0.42);
    const sx = (r(k, 40) - 0.5) * (t.w - pw - 2),
      sz = (r(k, 41) - 0.5) * (t.d - pd - 2);
    b.upper.push({ x: t.x + sx, z: t.z + sz, w: pw, d: pd, y0: top(t) - 0.1, h: 3.6, color: PENTHOUSE, look: 3 });
    if (!framed) return;
    // a framed top: corner fins rising past the roof, tied by a ring beam
    const fh = 5.5,
      yt = top(t);
    for (const [ex, ez] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      b.slabs.push({ x: t.x + ex * (t.w / 2 - 0.3), y: yt + fh / 2 - 0.2, z: t.z + ez * (t.d / 2 - 0.3), w: 0.6, h: fh, d: 0.6, color: FRAME });
    for (const ex of [-1, 1]) b.slabs.push({ x: t.x + ex * (t.w / 2 - 0.3), y: yt + fh - 0.6, z: t.z, w: 0.6, h: 0.8, d: t.d - 1.2, color: FRAME });
    for (const ez of [-1, 1]) b.slabs.push({ x: t.x, y: yt + fh - 0.6, z: t.z + ez * (t.d / 2 - 0.3), w: t.w - 1.2, h: 0.8, d: 0.6, color: FRAME });
  };
  /** stacked tiers from y0 up to T, each tier narrower by `shrink` on every side */
  const tiers = (x: number, z: number, w: number, d: number, y0: number, T: number, cuts: number[], shrink: number, color: string) => {
    const out: Mass[] = [];
    let from = y0;
    [...cuts, T].forEach((to, i) => {
      out.push({ x, z, w: w - i * shrink * 2, d: d - i * shrink * 2, y0: from, h: to - from, color, look: 1 });
      from = to - 0.1;
    });
    return out;
  };
  const snap = (y: number) => storeys(1, Math.max(2, Math.round((y - 4.7) / 3.6) + 1));
  const big = r(13) < 0.3 || (c.nearRiver && r(14) < 0.55);
  if (big) {
    const color = c.color(0);
    const podH = storeys(1, 2 + (r(0, 30) < 0.5 ? 1 : 0));
    const base: Mass = { x: cx, z: cz, w: 32, d: 32, y0: 0, h: podH, color, look: 1 };
    const T = snap(c.nearRiver ? 64 + r(0, 31) * 22 : h0 + 10 + r(0, 31) * (h1 - h0));
    const tw = 16 + r(0, 32) * 6,
      td = 16 + r(0, 33) * 6;
    const ox = (r(0, 34) - 0.5) * (32 - tw - 4),
      oz = (r(0, 35) - 0.5) * (32 - td - 4);
    const cuts = T > 40 ? [snap(T * 0.6), snap(T * 0.85)] : [snap(T * 0.7)];
    const ts = tiers(cx + ox, cz + oz, tw, td, podH - 0.3, T, cuts, T > 40 ? 1.8 : 1.5, color);
    const b: Bld = { k: 0, base, upper: ts, slabs: [], roof: null };
    crown(b, ts[ts.length - 1], 0, c.nearRiver || r(0, 36) < 0.5);
    return [b];
  }
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz], i) => {
    const color = c.color(i);
    const T = snap(h0 + r(i, 7) * (h1 - h0));
    const x = cx + sx * 11.5,
      z = cz + sz * 11.5;
    let b: Bld;
    if (r(i, 31) < 0.5 && T > 20) {
      // a podium on the whole lot with a slimmer tower nudged toward the corner
      const podH = storeys(1, 2);
      const base: Mass = { x, z, w: 14, d: 14, y0: 0, h: podH, color, look: 1 };
      const ts = tiers(x + sx * 0.8, z + sz * 0.8, 10, 10, podH - 0.3, T, T > 34 ? [snap(T * 0.72)] : [], 1, color);
      b = { k: i, base, upper: ts, slabs: [], roof: null };
    } else {
      // a straight shaft that steps in near the top
      const cut = T > 26 ? snap(T * 0.7) : T;
      const base: Mass = { x, z, w: 14, d: 14, y0: 0, h: cut, color, look: 1 };
      b = { k: i, base, upper: cut < T ? [{ x, z, w: 11, d: 11, y0: cut - 0.1, h: T - cut + 0.1, color, look: 1 }] : [], slabs: [], roof: null };
    }
    const last = b.upper[b.upper.length - 1] ?? b.base;
    crown(b, last, i, r(i, 36) < 0.25);
    return b;
  });
}

/** university and park district (左營·鳳山): a mid-rise slab, stepped, with a stair core and an entrance canopy */
export function campusBlock(c: BlockCtx, alongX: boolean): Bld[] {
  const { r } = c;
  const F = frame(c.cx, c.cz, alongX);
  const L = 32,
    D = 18;
  const n = 2 + Math.floor(r(0, 40) * 3);
  const color = c.color(0);
  const base = F.mass(0, 0, L, D, 0, storeys(2, n), color, 2);
  const b: Bld = { k: 0, base, upper: [], slabs: [], roof: roofOf(base) };
  // one storey more over the middle or over one end
  const ml = 12 + Math.floor(r(0, 42) * 3) * 3; // 12, 15 or 18
  const end = r(0, 41) < 0.4;
  const side = r(0, 43) < 0.5 ? -1 : 1;
  const mu = end ? side * (L - ml) / 2 : (r(0, 44) - 0.5) * 4;
  const y0 = top(base) - 0.5;
  const up = F.mass(mu, 0, ml, D, y0, storeys(2, n + 1) - y0, color, 2);
  b.upper.push(up);
  // tanks go on the lower part of the roof: the longer uncovered end of the base
  const left = mu - ml / 2 + L / 2,
    right = L / 2 - (mu + ml / 2);
  const fl = Math.max(left, right);
  if (fl >= 4) {
    const uc = left >= right ? -L / 2 + left / 2 : L / 2 - right / 2;
    const rr = F.mass(uc, 0, fl, D, 0, top(base), color, 2);
    b.roof = roofOf(rr);
  } else b.roof = null;
  // stair core on the upper roof
  const coreU = mu + (r(0, 45) - 0.5) * (ml - 6);
  b.upper.push(F.mass(coreU, (r(0, 46) - 0.5) * 6, 4, 4, top(up) - 0.1, 3.2, PENTHOUSE, 3));
  // entrance canopy on a long side, on two thin columns
  const sv = r(0, 47) < 0.5 ? -1 : 1;
  const cu = (r(0, 48) - 0.5) * 12;
  b.slabs.push(F.slab(cu, sv * (D / 2 + 1.2), 8, 2.4, 3.9, 0.3, CANOPY));
  for (const e of [-1, 1]) b.slabs.push(F.slab(cu + e * 3.6, sv * (D / 2 + 2.2), 0.3, 0.3, 1.9, 3.8, CANOPY));
  return [b];
}

/** harbour: two long sheds with a loading lane between, under low gables, sawtooth bays or a flat roof */
export function harbourBlock(c: BlockCtx, alongX: boolean): Bld[] {
  const { r } = c;
  const [h0, h1] = c.height;
  const F = frame(c.cx, c.cz, alongX);
  const out: Bld[] = [];
  for (const s of [-1, 1]) {
    const k = s > 0 ? 1 : 0;
    const H = Math.round(h0 + r(k, 7) * (h1 - h0));
    const color = c.color(k);
    const base = F.mass(0, s * 10.5, 38, 14, 0, H, color, 3);
    const b: Bld = { k, base, upper: [], slabs: [], roof: null };
    const t = r(k, 50);
    const axis: 'x' | 'z' = alongX ? 'x' : 'z';
    const roof = SHEET[Math.floor(r(k, 51) * SHEET.length)];
    if (t < 0.45) b.pitch = { x: base.x, z: base.z, w: base.w + (alongX ? 0 : 0.6), d: base.d + (alongX ? 0.6 : 0), y: H, rise: 1.5 + r(k, 52) * 0.8, axis, teeth: 0, wall: color, roof };
    else if (t < 0.8) b.pitch = { x: base.x, z: base.z, w: base.w, d: base.d, y: H, rise: 2.2 + r(k, 52) * 0.6, axis, teeth: 6, wall: color, roof };
    else b.roof = roofOf(base);
    out.push(b);
  }
  return out;
}

/** footprint corners of a pitched roof's triangles in world space (positions only, 3 numbers per vertex) */
export function pitchTriangles(p: Pitch): { pos: number[]; glass: boolean[] } {
  const L = p.axis === 'x' ? p.w : p.d,
    D = p.axis === 'x' ? p.d : p.w;
  const pos: number[] = [];
  const glass: boolean[] = [];
  // local (u along, y, v across); each triangle is wound so its normal points away from `ref` (inside the roof)
  const tri = (a: number[], b: number[], c: number[], ref: number[], g = false) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    // world handedness: with (x, y, z) = (u, y, v) for axis x and (v, y, u) for axis z the winding flips
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [(a[0] + b[0] + c[0]) / 3 - ref[0], (a[1] + b[1] + c[1]) / 3 - ref[1], (a[2] + b[2] + c[2]) / 3 - ref[2]];
    let out = n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0;
    if (p.axis === 'z') out = !out;
    const vs = out ? [a, b, c] : [a, c, b];
    for (const [u, y, v] of vs) pos.push(p.axis === 'x' ? p.x + u : p.x + v, p.y + y, p.axis === 'x' ? p.z + v : p.z + u);
    glass.push(g);
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], ref: number[], g = false) => {
    tri(a, b, c, ref, g);
    tri(a, c, d, ref, g);
  };
  const r = p.rise,
    hl = L / 2,
    hd = D / 2;
  if (!p.teeth) {
    const ref = [0, r / 3, 0];
    quad([-hl, 0, -hd], [hl, 0, -hd], [hl, r, 0], [-hl, r, 0], ref);
    quad([-hl, r, 0], [hl, r, 0], [hl, 0, hd], [-hl, 0, hd], ref);
    for (const e of [-1, 1]) tri([e * hl, 0, -hd], [e * hl, r, 0], [e * hl, 0, hd], ref);
  } else {
    const t = L / p.teeth;
    for (let i = 0; i < p.teeth; i++) {
      const a = -hl + i * t,
        b = a + t;
      const ref = [a + t * 0.67, r / 3, 0];
      quad([a, 0, -hd], [a, 0, hd], [b, r, hd], [b, r, -hd], ref); // the sheet slope
      quad([b, 0, -hd], [b, r, -hd], [b, r, hd], [b, 0, hd], ref, true); // the glazed north light
      for (const e of [-1, 1]) tri([a, 0, e * hd], [b, 0, e * hd], [b, r, e * hd], ref);
    }
  }
  return { pos, glass };
}
