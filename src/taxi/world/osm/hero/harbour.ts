// Rush Taxi — the harbour slice of the detailed landmark models (hero models): Pier-2 Art Center and its tower, True
// Love Pier, Glory Pier, the Great Harbor Bridge, the Harbor Museum and Xinguang Pier.
//
// Placement stays as in landmarks.ts (mapped footprints, fitted rectangles clear of the roads and the water, the
// nearest road in front); only the looks are new: free geometry written with ./harbour-geo.ts, merged by build.ts into
// the landmark meshes (no extra draw calls). Lit windows, the bridge's light line and the canopy uplights carry `aGlow`.
// Colliders stay simple hidden boxes.
//
// Every part is its own mesh, centred on its own footprint, so the end-of-build checks (roads, water) see a tight box.
// Nothing here reads the landmark module at load time (it imports this one): the builders are hoisted function
// declarations and its values are read only when they run.
import type { OsmLandmark, Ring, XZ } from '../data';
import { GLYPH, Kit, WAREHOUSE_WALLS, findSpot, hash, place, rectRing, type Ctx, type Model, type Rect } from '../landmarks';
import { Geo, shade, type V3 } from './harbour-geo';

const P = {
  white: '#F2F3F0',
  offwhite: '#E6E2D8',
  cream: '#EDE3CC',
  stone: '#BDB6A8',
  paving: '#B8B1A3',
  pavingDark: '#A39C8F',
  concrete: '#A9ADB0',
  steel: '#9AA6B1',
  steelDark: '#56616C',
  rust: '#9A5A36',
  rustDark: '#6E3F27',
  sheet: '#7B7872',
  sheetDark: '#67645F',
  sheetLight: '#8A867E',
  door: '#5F6A74',
  doorDark: '#4B545C',
  window: '#A39A7A',
  windowDark: '#5E6A72',
  glass: '#7F97A3',
  glassPale: '#B9CCD6',
  wood: '#9C7653',
  woodDark: '#80603F',
  lamp: '#F3E2B0',
  led: '#EDF3F6',
  paint: '#F5F1E6',
  grass: '#6E9A4E',
  black: '#2B2E33',
  roofTile: '#5D605F',
};
const CONTAINERS = ['#B3392F', '#E0A93A', '#2F6F9E', '#4E8A55', '#D9663A'];

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------
/** adds a writer's triangles to the kit as one mesh part, centred on its own footprint (tight checks) */
function put(k: Kit, whole: Geo, o: { u?: number; v?: number; y0?: number } = {}) {
  for (const g of whole.parts()) putPart(k, g, o);
}
function putPart(k: Kit, g: Geo, o: { u?: number; v?: number; y0?: number }) {
  if (!g.tris) return;
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (let i = 0; i < g.pos.length; i += 3) {
    x0 = Math.min(x0, g.pos[i]);
    x1 = Math.max(x1, g.pos[i]);
    z0 = Math.min(z0, g.pos[i + 2]);
    z1 = Math.max(z1, g.pos[i + 2]);
  }
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  const h = new Geo();
  h.add(g, -cx, 0, -cz);
  k.mesh((o.u ?? 0) + cx, (o.v ?? 0) + cz, o.y0 ?? 0, h.geometry());
}

/** distance (m) from (x, z) to the nearest light-rail centre line */
export function railGap(ctx: Ctx, x: number, z: number) {
  let best = Infinity;
  for (const line of ctx.data.rail)
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      if (Math.min(ax, bx) - best > x || Math.max(ax, bx) + best < x || Math.min(az, bz) - best > z || Math.max(az, bz) + best < z) continue;
      const vx = bx - ax,
        vz = bz - az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
  return best;
}
/** the light-rail trains need this much (m) from the track centre to anything standing low beside it */
export const RAIL_CLEAR = 2.6;

/** which local side (+v or −v) of a kit's rectangle the water is on, or 0 */
function waterSide(ctx: Ctx, k: Kit, L: number, W: number): 1 | -1 | 0 {
  let best: 1 | -1 | 0 = 0,
    bd = Infinity;
  for (const s of [1, -1] as const)
    for (let d = W / 2 + 1; d < W / 2 + 30; d += 1.5) {
      const hits = [-L / 3, 0, L / 3].filter((u) => {
        const [x, z] = k.at(u, s * d);
        return ctx.site.inWater(x, z);
      }).length;
      if (hits >= 2) {
        if (d < bd) {
          bd = d;
          best = s;
        }
        break;
      }
    }
  return best;
}

/** paints `text` in seven-segment strokes (landmarks.ts GLYPH) on a wall facing side·z at z = side·zw */
function paintGlyphs(g: Geo, text: string, u0: number, zw: number, side: 1 | -1, y0: number, h: number, col: string) {
  const w = h * 0.55,
    t = h * 0.14,
    pitch = w + h * 0.3;
  const z = side * (zw + 0.04);
  const n: V3 = [0, 0, side];
  const bar = (uc: number, yc: number, bw: number, bh: number) => g.quad([uc - bw / 2, yc - bh / 2, z], [uc + bw / 2, yc - bh / 2, z], [uc + bw / 2, yc + bh / 2, z], [uc - bw / 2, yc + bh / 2, z], col, n);
  [...text].forEach((ch, i) => {
    const cu = (i - (text.length - 1) / 2) * pitch;
    // a reader facing the wall reads along +u when the wall faces +v, along −u when it faces −v
    const U = (du: number) => u0 + side * (cu + du);
    for (const seg of GLYPH[ch] ?? '') {
      if (seg === 'a') bar(U(0), y0 + h - t / 2, w, t);
      if (seg === 'g') bar(U(0), y0 + h / 2, w, t);
      if (seg === 'd') bar(U(0), y0 + t / 2, w, t);
      if (seg === 'b') bar(U(w / 2 - t / 2), y0 + (h * 3) / 4, t, h / 2);
      if (seg === 'c') bar(U(w / 2 - t / 2), y0 + h / 4, t, h / 2);
      if (seg === 'f') bar(U(-w / 2 + t / 2), y0 + (h * 3) / 4, t, h / 2);
      if (seg === 'e') bar(U(-w / 2 + t / 2), y0 + h / 4, t, h / 2);
    }
  });
  return [...text].length * pitch;
}

/** strip breaks along x from x0 to x1, about `step` apart */
function breaks(x0: number, x1: number, step: number) {
  const n = Math.max(1, Math.round((x1 - x0) / step));
  return Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
}

// ---------------------------------------------------------------------------------------------------------------
// Pier-2: the warehouses
// ---------------------------------------------------------------------------------------------------------------
export type RoofKind = 'gable' | 'vault' | 'saw';
/**
 * one old harbour warehouse, centred at the origin: L along x, W along z, walls H; the street side faces side·z.
 * Weathered walls (darker low down, a brick plinth), a corrugated-sheet roof of uneven panels, roller doors in steel
 * frames, a row of high windows (lit at night) and the painted warehouse code.
 */
export function warehouseGeo(L: number, W: number, H: number, wall: string, roof: RoofKind, side: 1 | -1, label: string, seed: number) {
  const g = new Geo();
  const hx = L / 2,
    hz = W / 2;
  const low = shade(wall, 0.72),
    mid = shade(wall, 0.9);
  const plinth = shade('#8E5038', 0.95);
  const ph = 0.9;
  // the walls: a brick plinth, then the paint, weathered darker towards the ground
  const wallQuad = (a: V3, b: V3, n: V3) => {
    // a → b along the ground; the quad rises to H
    g.quad([a[0], 0, a[2]], [b[0], 0, b[2]], [b[0], ph, b[2]], [a[0], ph, a[2]], plinth, n);
    g.quad([a[0], ph, a[2]], [b[0], ph, b[2]], [b[0], H, b[2]], [a[0], H, a[2]], [low, low, wall, wall], n);
  };
  wallQuad([-hx, 0, hz], [hx, 0, hz], [0, 0, 1]);
  wallQuad([hx, 0, -hz], [-hx, 0, -hz], [0, 0, -1]);
  wallQuad([-hx, 0, -hz], [-hx, 0, hz], [-1, 0, 0]);
  wallQuad([hx, 0, hz], [hx, 0, -hz], [1, 0, 0]);

  // the roof
  const tone = (i: number) => {
    const r = hash(seed, i * 3.7);
    return r < 0.18 ? P.sheetDark : r > 0.92 ? P.rust : r > 0.66 ? P.sheetLight : P.sheet;
  };
  const ov = 0.45,
    t = 0.2;
  const xs = breaks(-hx - 0.3, hx + 0.3, 3.2);
  if (roof === 'gable') {
    const R = Math.min(3, W * 0.24);
    const eave = H - 0.12;
    const prof: [number, number][] = [
      [-hz - ov, eave],
      [hz + ov, eave],
      [hz + ov, eave + t],
      [0, H + R + t],
      [-hz - ov, eave + t],
    ];
    // top slopes in panels; underside and edges in the dark sheet
    g.extrudeX(prof, xs, (s, e) => (e === 2 || e === 3 ? tone(s * 2 + e) : P.sheetDark), { caps: P.sheetDark });
    // ridge cap
    g.box(-hx - 0.3, hx + 0.3, H + R + t - 0.05, H + R + t + 0.12, -0.18, 0.18, P.steelDark, { skip: ['b', '-x', '+x'] });
    // the gable walls
    for (const s of [-1, 1]) g.tri([s * hx, H, -hz], [s * hx, H, hz], [s * hx, H + R - 0.02, 0], wall, [s, 0, 0]);
  } else if (roof === 'vault') {
    const R = Math.min(3.4, W * 0.26);
    const n = 8;
    const arc = (r0: number, lift: number) => Array.from({ length: n + 1 }, (_, i) => {
      const a = Math.PI - (i / n) * Math.PI;
      return [Math.cos(a) * (hz + r0), H - 0.12 + lift + Math.sin(a) * R] as [number, number];
    });
    const outer = arc(ov, t),
      inner = arc(ov, 0).reverse();
    g.extrudeX([...outer, ...inner], xs, (s, e) => (e < n ? tone(s * 3 + e) : P.sheetDark), { caps: P.sheetDark });
    // the arched end walls
    for (const s of [-1, 1]) {
      const pts: V3[] = Array.from({ length: n + 1 }, (_, i) => {
        const a = Math.PI - (i / n) * Math.PI;
        return [s * hx, H - 0.12 + Math.sin(a) * R * Math.sqrt(Math.max(0, 1 - ((ov / (hz + ov)) * 1) ** 2)) * 0.98, Math.cos(a) * hz] as V3;
      });
      g.fan(pts, wall, [s, 0, 0]);
    }
  } else {
    // sawtooth: teeth across the width, each a sheet slope and a glazed north light; the side walls follow the teeth
    const n = Math.max(2, Math.round(L / 6.5));
    const R = 2.3;
    const step = L / n;
    for (let i = 0; i < n; i++) {
      const a = -hx + i * step,
        b = a + step;
      const c = tone(i);
      g.quad([a, H, -hz - 0.3], [b, H + R, -hz - 0.3], [b, H + R, hz + 0.3], [a, H, hz + 0.3], c, [-R, step, 0]);
      g.quad([b, H + R, -hz - 0.3], [b, H, -hz - 0.3], [b, H, hz + 0.3], [b, H + R, hz + 0.3], P.glass, [1, 0, 0], 0.55);
      for (const s of [-1, 1]) g.tri([a, H, s * hz], [b, H, s * hz], [b, H + R - 0.05, s * hz], wall, [0, 0, s]);
      // the underside of the eave strip, seen from the street
      g.quad([a, H, hz], [b, H + R, hz], [b, H + R, hz + 0.3], [a, H, hz + 0.3], P.sheetDark, [R, -step, 0]);
      g.quad([a, H, -hz - 0.3], [b, H + R, -hz - 0.3], [b, H + R, -hz], [a, H, -hz], P.sheetDark, [R, -step, 0]);
    }
  }

  // the street side: roller doors in steel frames, the painted code above the middle
  const nd = L >= 30 ? 3 : 2;
  const pitch = L / nd;
  const dw = Math.min(4.2, pitch * 0.6),
    dh = Math.min(4.4, H - 2.4);
  const fz = side * hz;
  const out = (d: number) => side * (hz + d);
  for (let i = 0; i < nd; i++) {
    const u = -hx + pitch * (i + 0.5);
    const z = out(0.03);
    g.quad([u - dw / 2, 0, z], [u + dw / 2, 0, z], [u + dw / 2, dh, z], [u - dw / 2, dh, z], [P.doorDark, P.doorDark, P.door, P.door], [0, 0, side]);
    // the slats: two darker lines across the door
    for (const y of [dh * 0.36, dh * 0.7]) g.quad([u - dw / 2, y, out(0.05)], [u + dw / 2, y, out(0.05)], [u + dw / 2, y + 0.1, out(0.05)], [u - dw / 2, y + 0.1, out(0.05)], P.doorDark, [0, 0, side]);
    // frame posts and the roller box
    const zz = [Math.min(fz, out(0.22)), Math.max(fz, out(0.22))] as const;
    for (const s of [-1, 1]) g.box(u + s * (dw / 2 + 0.12) - 0.12, u + s * (dw / 2 + 0.12) + 0.12, 0, dh, zz[0], zz[1], P.steelDark, { skip: ['b', side > 0 ? '-z' : '+z'] });
    g.box(u - dw / 2 - 0.3, u + dw / 2 + 0.3, dh, dh + 0.5, Math.min(fz, out(0.4)), Math.max(fz, out(0.4)), P.steelDark, { skip: [side > 0 ? '-z' : '+z'] });
  }
  // the code, big above the doors
  const gh = Math.max(1.4, Math.min(3, H - dh - 1.4));
  const labelW = paintGlyphs(g, label, 0, hz, side, dh + 0.7, gh, P.paint);
  // high windows along both long sides (some lit at night), not over the painted code
  const nw = Math.max(2, Math.floor(L / 4.4));
  const wy0 = H - 1.9,
    wy1 = H - 0.9;
  for (const s of [-1, 1] as const)
    for (let i = 0; i < nw; i++) {
      const u = -hx + (L / nw) * (i + 0.5);
      if (s === side && (Math.abs(u) < labelW / 2 + 1 || wy0 < dh + 0.8 + gh)) continue;
      const lit = hash(seed, i, s) < 0.6 ? 0.9 : 0.15;
      const z = s * (hz + 0.03);
      g.quad([u - 0.9, wy0, z], [u + 0.9, wy0, z], [u + 0.9, wy1, z], [u - 0.9, wy1, z], P.window, [0, 0, s], lit);
    }
  // windows on the end walls too (the back of the row is seen from the quay)
  for (const s of [-1, 1] as const) {
    const lit = hash(seed, s, 9) < 0.5 ? 0.9 : 0.15;
    const x = s * (hx + 0.03);
    for (const zc of W > 9 ? [-W / 4, W / 4] : [0]) g.quad([x, wy0, zc - 0.8], [x, wy0, zc + 0.8], [x, wy1, zc + 0.8], [x, wy1, zc - 0.8], P.window, [s, 0, 0], lit);
  }
  return g;
}

/** the big rusty robot sculpture: a blocky figure on a plinth, about 9 m tall */
export function robotGeo(seed: number) {
  const g = new Geo();
  const r = P.rust,
    d = P.rustDark,
    s = P.steel;
  g.box(-2.2, 2.2, 0, 0.6, -1.6, 1.6, P.concrete);
  // legs, hips, torso, shoulders
  for (const x of [-0.9, 0.9]) {
    g.box(x - 0.55, x + 0.55, 0.6, 3.6, -0.6, 0.6, d);
    g.box(x - 0.7, x + 0.7, 0.6, 1.2, -0.75, 0.95, s);
  }
  g.box(-1.3, 1.3, 3.6, 4.3, -0.7, 0.7, s);
  g.box(-1.5, 1.5, 4.3, 6.8, -0.9, 0.9, r, { skip: [] });
  g.box(-0.8, 0.8, 5, 6.1, 0.9, 1.0, d, { skip: ['-z'] });
  // arms: one down, one raised in a wave
  g.box(-2.3, -1.5, 4.0, 6.7, -0.45, 0.45, d, { skip: [] });
  g.box(-2.25, -1.55, 3.3, 4.0, -0.4, 0.4, s, { skip: [] });
  g.boxR(2.15, 7.0, 0, 0.8, 3.2, 0.9, 0, d);
  g.box(1.8, 2.5, 8.6, 9.2, -0.4, 0.4, s, { skip: [] });
  // the head and its two round eyes (lit at night) and an antenna
  g.box(-0.75, 0.75, 6.8, 7.0, -0.5, 0.5, s, { skip: [] });
  g.box(-0.9, 0.9, 7.0, 8.4, -0.75, 0.75, r, { skip: [] });
  for (const x of [-0.42, 0.42]) g.tube([x, 7.8, 0.75], [x, 7.8, 0.85], 0.22, 8, P.lamp, { caps: true, glow: 0.8 });
  g.tube([0, 8.4, 0], [0, 9.3, 0], 0.06, 4, s);
  void seed;
  return g;
}

/** a few shipping containers stacked as a public-art piece */
export function containerGeo(seed: number) {
  const g = new Geo();
  const one = (cx: number, y0: number, cz: number, yaw: number, col: string) => {
    const c = new Geo();
    const hx = 3.05,
      hz = 1.22,
      h = 2.6;
    c.box(-hx, hx, 0, h, -hz, hz, col, { low: shade(col, 0.82) });
    // corrugation ribs along the long sides, the door end darker with its locking bars
    for (const s of [-1, 1])
      for (let i = 1; i < 8; i++) {
        const x = -hx + (2 * hx * i) / 8;
        c.quad([x - 0.12, 0.1, s * (hz + 0.02)], [x + 0.12, 0.1, s * (hz + 0.02)], [x + 0.12, h - 0.1, s * (hz + 0.02)], [x - 0.12, h - 0.1, s * (hz + 0.02)], shade(col, 0.78), [0, 0, s]);
      }
    c.quad([hx + 0.02, 0.1, -hz + 0.1], [hx + 0.02, 0.1, hz - 0.1], [hx + 0.02, h - 0.1, hz - 0.1], [hx + 0.02, h - 0.1, -hz + 0.1], shade(col, 0.7), [1, 0, 0]);
    for (const z of [-0.5, 0.5]) c.quad([hx + 0.04, 0.2, z - 0.05], [hx + 0.04, 0.2, z + 0.05], [hx + 0.04, h - 0.2, z + 0.05], [hx + 0.04, h - 0.2, z - 0.05], P.steelDark, [1, 0, 0]);
    g.add(c, cx, y0, cz, yaw);
  };
  const cs = [0, 1, 2, 3].map((i) => CONTAINERS[Math.floor(hash(seed, i) * CONTAINERS.length)]);
  one(0, 0, -1.4, 0, cs[0]);
  one(0.6, 0, 1.4, 0, cs[1]);
  one(0.4, 2.6, 0, 0.35, cs[2]);
  return g;
}

export function pier2(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const list = ctx.data.buildings
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => (b.kind === 'warehouse' || /倉|庫/.test(b.name ?? '')) && Math.hypot(b.obb[0] - lm.x, b.obb[1] - lm.z) < 200 && b.obb[2] >= 10 && b.obb[3] >= 6)
    .sort((p, q) => p.b.obb[0] - q.b.obb[0]);
  if (!list.length) return null;
  const kits: Kit[] = [];
  let n = 1;
  for (const { b, i } of list) {
    const [cx0, cz0, L0, W0, ang0] = b.obb;
    let r: Rect = { cx: cx0, cz: cz0, L: L0 >= W0 ? L0 : W0, W: L0 >= W0 ? W0 : L0, ang: L0 >= W0 ? ang0 : ang0 + Math.PI / 2 };
    // a kerb where people wait sometimes falls inside a mapped footprint: trim that side back
    for (const sp of ctx.spots) {
      const c = Math.cos(r.ang),
        sn = Math.sin(r.ang);
      const du = (sp.x - r.cx) * c + (sp.z - r.cz) * sn,
        dv = -(sp.x - r.cx) * sn + (sp.z - r.cz) * c;
      if (Math.abs(du) > r.L / 2 + 1 || Math.abs(dv) > r.W / 2 + 1) continue;
      const cutU = r.L / 2 + 1 - Math.abs(du),
        cutV = r.W / 2 + 1 - Math.abs(dv);
      if (cutV <= cutU) {
        const sh = ((Math.sign(dv) || 1) * -cutV) / 2;
        r = { ...r, W: r.W - cutV, cx: r.cx - sh * sn, cz: r.cz + sh * c };
      } else {
        const sh = ((Math.sign(du) || 1) * -cutU) / 2;
        r = { ...r, L: r.L - cutU, cx: r.cx + sh * c, cz: r.cz + sh * sn };
      }
    }
    if (r.L < 6 || r.W < 4) continue;
    const { cx, cz, L, W } = r;
    const k = new Kit(`${m.id}-${i}`, cx, cz, r.ang);
    const wall = WAREHOUSE_WALLS[Math.floor(hash(cx, cz) * WAREHOUSE_WALLS.length)];
    const H = 7 + Math.round(hash(cz, cx) * 2);
    // the street side: doors and the painted number
    const hit = ctx.site.nearest(cx, cz);
    const fv = hit ? -Math.sin(k.ang) * (hit.x - cx) + Math.cos(k.ang) * (hit.z - cz) : 1;
    const side: 1 | -1 = fv >= 0 ? 1 : -1;
    const named = /C(\d+)/.exec(b.name ?? '');
    const label = named ? `C${named[1]}` : `C${n++}`;
    // the Penglai warehouses (the western group off Penglai Rd) have sawtooth roofs; the big quay sheds (棧庫) are
    // vaulted, the rest gabled with a few vaults among them
    const penglai = cx < -1120 && cz < -150 && !/棧/.test(b.name ?? '');
    const roof: RoofKind = penglai ? 'saw' : /棧/.test(b.name ?? '') || hash(cx, 7, cz) < 0.22 ? 'vault' : 'gable';
    put(k, warehouseGeo(L, W, H, wall, roof, side, label, i));
    k.wall(0, 0, 0, L, W, H);
    m.replaces.push(i);
    m.covers.push(b.poly);
    kits.push(k);
  }
  // public art on the open ground among the warehouses: the robot and the stacked containers
  const avoid: Ring[] = [...ctx.taken, ...m.covers];
  const art = [
    { id: 'robot', r: 3.4, at: [lm.x + 10, lm.z - 10] as XZ, geo: robotGeo, L: 4.6, W: 3.4, H: 9 },
    { id: 'boxes', r: 4.4, at: [lm.x - 30, lm.z + 20] as XZ, geo: containerGeo, L: 7.4, W: 5.4, H: 5.2 },
  ];
  for (const a of art) {
    const sp = findArtSpot(ctx, a.at, a.r, avoid);
    if (!sp) continue;
    const hit = ctx.site.nearest(sp[0], sp[1]);
    // faces the street it stands beside
    const ang = hit ? Math.atan2(hit.z - sp[1], hit.x - sp[0]) - Math.PI / 2 : 0;
    const k = new Kit(`${m.id}-${a.id}`, sp[0], sp[1], ang);
    put(k, a.geo(i0(sp)));
    k.wall(0, 0, 0, a.L, a.W, a.H);
    const cover = rectRing({ cx: sp[0], cz: sp[1], L: 2 * a.r, W: 2 * a.r, ang });
    m.covers.push(cover);
    avoid.push(cover);
    kits.push(k);
  }
  return kits;
}
const i0 = (p: XZ) => Math.round(p[0] * 7 + p[1] * 13);
/** a clear disc of radius r near `at`: on land, off the roads, outside `avoid`, and clear of the light rail */
function findArtSpot(ctx: Ctx, at: XZ, r: number, avoid: Ring[]): XZ | null {
  for (let tries = 0; tries < 6; tries++) {
    const ang = tries * 1.05;
    const sp = findSpot(ctx.site, at[0] + Math.cos(ang) * tries * 12, at[1] + Math.sin(ang) * tries * 12, r, 3, avoid, 90);
    if (!sp) continue;
    if (railGap(ctx, sp[0], sp[1]) < r + RAIL_CLEAR + 1) {
      avoid = [...avoid, rectRing({ cx: sp[0], cz: sp[1], L: 2 * r, W: 2 * r, ang: 0 })];
      continue;
    }
    return sp;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Pier-2 Tower: a steel-framed lookout with landings and a glazed top deck under a thin roof
// ---------------------------------------------------------------------------------------------------------------
export function lookoutGeo(S: number, H: number) {
  const g = new Geo();
  const h = S / 2;
  g.box(-h - 0.6, h + 0.6, 0, 0.4, -h - 0.6, h + 0.6, P.stone);
  // the stair core
  g.box(-h * 0.45, h * 0.45, 0.4, H - 3.2, -h * 0.45, h * 0.45, P.offwhite, { low: shade(P.offwhite, 0.85) });
  // the glazed lift shaft on the core's front, its cab lit at night
  g.box(-h * 0.25, h * 0.25, 0.4, H - 3.4, h * 0.45, h * 0.45 + 0.08, P.glass, { skip: ['b', '-z'], glow: 0.25 });
  g.cut();
  // corner columns
  for (const a of [-1, 1]) for (const b of [-1, 1]) g.box(a * h - 0.22, a * h + 0.22, 0.4, H, b * h - 0.22, b * h + 0.22, P.white, { skip: ['b'] });
  // landings every stage with X-bracing on each face
  const stages = Math.max(3, Math.round((H - 4) / 6.5));
  const st = (H - 4) / stages;
  for (let i = 0; i < stages; i++) {
    const y0 = 0.4 + i * st,
      y1 = y0 + st;
    for (const [ax, az, bx, bz] of [
      [-h, -h, h, -h],
      [h, -h, h, h],
      [h, h, -h, h],
      [-h, h, -h, -h],
    ]) {
      g.tube([ax, y0, az], [bx, y1, bz], 0.07, 4, P.steel);
      g.tube([bx, y0, bz], [ax, y1, az], 0.07, 4, P.steel);
    }
    if (i > 0) g.box(-h + 0.2, h - 0.2, y0 - 0.2, y0, -h + 0.2, h - 0.2, P.steel, { skip: [] });
  }
  g.cut();
  // the top deck: slab, glass balustrade, LED line under the slab, slim roof on the columns
  const yd = H - 4 + 0.4;
  g.box(-h - 0.8, h + 0.8, yd - 0.4, yd, -h - 0.8, h + 0.8, P.white, { skip: [] });
  const e = h + 0.8;
  const corners: V3[] = [
    [-e, yd, -e],
    [e, yd, -e],
    [e, yd, e],
    [-e, yd, e],
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4];
    const a1: V3 = [a[0], yd + 1.1, a[2]],
      b1: V3 = [b[0], yd + 1.1, b[2]];
    g.sheet(a, b, b1, P.glassPale);
    g.sheet(a, b1, a1, P.glassPale);
    g.tube(a1, b1, 0.05, 4, P.steel);
    // the light line round the deck edge
    const n: V3 = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
    g.quad([a[0] * 1.01, yd - 0.32, a[2] * 1.01], [b[0] * 1.01, yd - 0.32, b[2] * 1.01], [b[0] * 1.01, yd - 0.12, b[2] * 1.01], [a[0] * 1.01, yd - 0.12, a[2] * 1.01], P.led, n, 1);
  }
  g.box(-h - 1.2, h + 1.2, H, H + 0.35, -h - 1.2, h + 1.2, P.white, { skip: [] });
  return g;
}
export function pier2tower(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 10, W: 10 }, { cap: { L: 12, W: 12 } });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const S = Math.max(5, Math.min(r.L, r.W) - 3);
  put(k, lookoutGeo(S, 30));
  k.wall(0, 0, 0, S + 1, S + 1, 30);
  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// True Love Pier: white sail membranes on masts over a timber deck with railings on the water side
// ---------------------------------------------------------------------------------------------------------------
/** a deck L × W with plank strips, edge fascia and railings on the `rail` side (±z) */
function deckGeo(g: Geo, L: number, W: number, y: number, rail: 1 | -1 | 0, col = P.wood) {
  const hx = L / 2,
    hz = W / 2;
  const xs = breaks(-hx, hx, 1.6);
  for (let i = 0; i + 1 < xs.length; i++) g.quad([xs[i], y, -hz], [xs[i + 1], y, -hz], [xs[i + 1], y, hz], [xs[i], y, hz], i % 2 ? col : shade(col, 0.9), [0, 1, 0]);
  g.box(-hx, hx, 0, y - 0.001, -hz, hz, P.woodDark, { skip: ['b', 't'] });
  const sides = rail === 0 ? [] : [rail];
  for (const s of sides) {
    const z = s * (hz - 0.15);
    for (const x of breaks(-hx + 0.2, hx - 0.2, 2)) g.box(x - 0.06, x + 0.06, y, y + 1.05, z - 0.06, z + 0.06, P.steel, { skip: ['b'] });
    g.tube([-hx + 0.2, y + 1.08, z], [hx - 0.2, y + 1.08, z], 0.06, 4, P.wood);
    g.tube([-hx + 0.2, y + 0.55, z], [hx - 0.2, y + 0.55, z], 0.025, 4, P.steel);
  }
}
/** a sail membrane: tack (mast foot), head (mast top), clew (the far corner); bellied, both faces, uplit low down */
function sailGeo(g: Geo, tack: V3, head: V3, clew: V3, belly: V3, n = 4) {
  const pt = (a: number, b: number): V3 => {
    // barycentric (1 − a − b, a, b) over tack, head, clew, pushed out by the belly in the middle
    const c = 1 - a - b;
    const w = 4 * a * b + 4 * c * a + 4 * c * b;
    return [tack[0] * c + head[0] * a + clew[0] * b + belly[0] * w * 0.5, tack[1] * c + head[1] * a + clew[1] * b + belly[1] * w * 0.5, tack[2] * c + head[2] * a + clew[2] * b + belly[2] * w * 0.5];
  };
  const glowAt = (p: V3) => Math.max(0.05, 0.5 - (p[1] - tack[1]) * 0.05);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n - i; j++) {
      const a = pt(i / n, j / n),
        b = pt((i + 1) / n, j / n),
        c = pt(i / n, (j + 1) / n);
      g.sheet(a, b, c, P.white, [glowAt(a), glowAt(b), glowAt(c)]);
      if (j < n - i - 1) {
        const d = pt((i + 1) / n, (j + 1) / n);
        g.sheet(b, d, c, P.white, [glowAt(b), glowAt(d), glowAt(c)]);
      }
    }
}
export function lovePierGeo(L: number, W: number, rail: 1 | -1 | 0) {
  const g = new Geo();
  const y = 0.5;
  deckGeo(g, L, W, y, rail);
  g.cut();
  // three sails rising in a row, the tallest at the river mouth end
  const sails = [
    { x: -L * 0.3, h: 15, r: 6 },
    { x: L * 0.03, h: 12.5, r: 5.2 },
    { x: L * 0.33, h: 10, r: 4.4 },
  ];
  const zm = -(rail || 1) * W * 0.15;
  for (const [si, s] of sails.entries()) {
    // the clews alternate a little, so the row of sails reads from every side
    const tw = (rail || 1) * (si === 1 ? 0.22 : 0.4);
    const lean = 0.9;
    const foot: V3 = [s.x - s.r * 0.5, y, zm];
    const top: V3 = [foot[0] - lean, y + s.h, zm];
    g.tube(foot, top, 0.2, 8, P.steel, { rb: 0.12 });
    const tack: V3 = [foot[0] + 0.2, y + 2.6, zm];
    const clew: V3 = [s.x + s.r * 0.85, y + 3.1, zm + tw * W];
    sailGeo(g, tack, [top[0] + 0.2, top[1] - 0.4, zm], clew, [0.4, 0, Math.sign(tw) * 1.3]);
    // stays from the mast top to the deck, and the sheet from the clew
    g.tube(top, [foot[0] - s.r * 0.55, y, zm - 0.6], 0.03, 4, P.steelDark);
    g.tube(clew, [clew[0] + 0.4, y, clew[2]], 0.03, 4, P.steelDark);
    // the uplight at the mast foot
    g.box(foot[0] + 0.3, foot[0] + 0.8, y, y + 0.25, zm - 0.25, zm + 0.25, P.lamp, { glow: 1 });
    g.cut();
  }
  // benches along the landward edge
  const bz = -(rail || 1) * (W / 2 - 1.2);
  for (const x of [-L * 0.32, 0, L * 0.32]) g.box(x - 1.3, x + 1.3, y, y + 0.45, bz - 0.3, bz + 0.3, P.woodDark);
  return g;
}
export function lovepier(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  // towards the river mouth from the mapped point, clear of the Music Center
  const sp = findSpot(ctx.site, lm.x + 14, lm.z + 24, 9, 3, ctx.taken, 70);
  if (!sp) return null;
  const hit = ctx.site.nearest(sp[0], sp[1]);
  const ang = hit ? Math.atan2(hit.dz, hit.dx) : 0;
  const k = new Kit(m.id, sp[0], sp[1], ang);
  const L = 16,
    W = 9;
  const rail = waterSide(ctx, k, L, W);
  put(k, lovePierGeo(L, W, rail));
  for (const x of [-L * 0.3 - 3, L * 0.03 - 2.6, L * 0.33 - 2.2]) k.wall(x, -(rail || 1) * W * 0.15, 0, 0.6, 0.6, 12);
  if (rail) k.wall(0, rail * (W / 2 - 0.15), 0, L, 0.3, 1.1);
  m.covers.push(rectRing({ cx: sp[0], cz: sp[1], L: L + 1, W: W + 1, ang }));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// Glory Pier: a paved harbour-edge plaza with a lawn, bollards on the quay and a light canopy on slim columns
// ---------------------------------------------------------------------------------------------------------------
export function gloryPierGeo(L: number, W: number, quay: 1 | -1 | 0) {
  const g = new Geo();
  const hx = L / 2,
    hz = W / 2;
  const q = quay || 1;
  // paving in a two-tone grid, a lawn strip on the landward side
  const xs = breaks(-hx, hx, 4);
  const zs = [-hz, -hz / 3, hz / 3, hz];
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < zs.length; j++) {
      const lawn = j === (q > 0 ? 0 : 2);
      g.quad([xs[i], 0.12, zs[j]], [xs[i + 1], 0.12, zs[j]], [xs[i + 1], 0.12, zs[j + 1]], [xs[i], 0.12, zs[j + 1]], lawn ? P.grass : (i + j) % 2 ? P.paving : P.pavingDark, [0, 1, 0]);
    }
  g.box(-hx, hx, 0, 0.119, -hz, hz, P.stone, { skip: ['b', 't'] });
  g.cut();
  // bollards along the quay edge
  for (const x of breaks(-hx + 1, hx - 1, 3.5)) g.tube([x, 0.12, q * (hz - 0.5)], [x, 0.75, q * (hz - 0.5)], 0.22, 8, P.black, { caps: true });
  g.cut();
  // the light canopy: a thin white plate with a gentle wave, on two rows of slim columns, lit from below
  const cl = Math.min(L * 0.7, 30),
    cw = Math.min(W * 0.4, 5.5);
  const cz = q * W * 0.08;
  const yc = 6.2;
  const cx = breaks(-cl / 2, cl / 2, 2.5);
  const wave = (x: number) => yc + 0.5 * Math.sin((x / cl) * Math.PI * 2);
  for (let i = 0; i + 1 < cx.length; i++) {
    const a = cx[i],
      b = cx[i + 1];
    g.quad([a, wave(a) + 0.18, cz - cw / 2], [b, wave(b) + 0.18, cz - cw / 2], [b, wave(b) + 0.18, cz + cw / 2], [a, wave(a) + 0.18, cz + cw / 2], P.white, [0, 1, 0]);
    g.quad([a, wave(a), cz - cw / 2], [b, wave(b), cz - cw / 2], [b, wave(b), cz + cw / 2], [a, wave(a), cz + cw / 2], P.offwhite, [0, -1, 0], 0.35);
    for (const s of [-1, 1]) g.quad([a, wave(a), cz + (s * cw) / 2], [b, wave(b), cz + (s * cw) / 2], [b, wave(b) + 0.18, cz + (s * cw) / 2], [a, wave(a) + 0.18, cz + (s * cw) / 2], P.led, [0, 0, s], 1);
  }
  for (const s of [-1, 1]) g.quad([s * (cl / 2), wave(s * (cl / 2)), cz - cw / 2], [s * (cl / 2), wave(s * (cl / 2)), cz + cw / 2], [s * (cl / 2), wave(s * (cl / 2)) + 0.18, cz + cw / 2], [s * (cl / 2), wave(s * (cl / 2)) + 0.18, cz - cw / 2], P.white, [s, 0, 0]);
  const cols = breaks(-cl / 2 + 1.5, cl / 2 - 1.5, 6);
  for (const x of cols)
    for (const s of [-1, 1]) {
      g.tube([x, 0.12, cz + s * (cw / 2 - 0.6)], [x, wave(x), cz + s * (cw / 2 - 0.6)], 0.14, 6, P.white);
      // the uplight at its foot
      g.box(x - 0.2, x + 0.2, 0.12, 0.3, cz + s * (cw / 2 - 0.6) - 0.45, cz + s * (cw / 2 - 0.6) - 0.25, P.lamp, { glow: 1 });
    }
  g.cut();
  // lamp posts on the landward side
  for (const x of [-hx + 2, hx - 2]) {
    const z = -q * (hz - 1);
    g.tube([x, 0.12, z], [x, 5.2, z], 0.1, 6, P.steelDark);
    g.box(x - 0.35, x + 0.35, 5.2, 5.5, z - 0.35, z + 0.35, P.lamp, { glow: 1, skip: [] });
  }
  return g;
}
export function gloriouspier(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 30, W: 14 }, { ring: null, clear: 3 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const quay = waterSide(ctx, k, r.L, r.W);
  put(k, gloryPierGeo(r.L, r.W, quay));
  const cl = Math.min(r.L * 0.7, 30),
    cw = Math.min(r.W * 0.4, 5.5);
  for (const x of breaks(-cl / 2 + 1.5, cl / 2 - 1.5, 6)) for (const s of [-1, 1]) k.wall(x, (quay || 1) * r.W * 0.08 + s * (cw / 2 - 0.6), 0, 0.4, 0.4, 6);
  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// Great Harbor Bridge: the white swing bridge — a cambered deck girder, one tall slanted pylon on the pivot, stay
// cables fanned to both deck edges, glass parapets and the light line along the fascia (decor only, over the water)
// ---------------------------------------------------------------------------------------------------------------
export function bridgeGeo(L: number, pivotX: number, dir: 1 | -1) {
  const g = new Geo();
  const n = 14;
  const camber = Math.min(2.2, L * 0.025);
  const y = (x: number) => 1.2 + camber * (1 - ((2 * x) / L) ** 2);
  const xs = breaks(-L / 2, L / 2, L / n);
  const tw = 2.7,
    bw = 1.5,
    dp = 1.0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i],
      b = xs[i + 1];
    const ya = y(a),
      yb = y(b);
    // walkway, sloped sides of the girder, the soffit
    g.quad([a, ya, -tw], [b, yb, -tw], [b, yb, tw], [a, ya, tw], P.offwhite, [0, 1, 0]);
    for (const s of [-1, 1]) {
      g.quad([a, ya, s * tw], [b, yb, s * tw], [b, yb - 0.25, s * tw], [a, ya - 0.25, s * tw], P.white, [0, 0, s]);
      g.quad([a, ya - 0.25, s * tw], [b, yb - 0.25, s * tw], [b, yb - 0.45, s * tw], [a, ya - 0.45, s * tw], P.led, [0, 0, s], 1);
      g.quad([a, ya - 0.45, s * tw], [b, yb - 0.45, s * tw], [b, yb - dp, s * bw], [a, ya - dp, s * bw], P.white, [0, -0.6, s]);
      // glass parapet and the handrail
      g.sheet([a, ya, s * (tw - 0.1)], [b, yb, s * (tw - 0.1)], [b, yb + 1.15, s * (tw - 0.1)], P.glassPale);
      g.sheet([a, ya, s * (tw - 0.1)], [b, yb + 1.15, s * (tw - 0.1)], [a, ya + 1.15, s * (tw - 0.1)], P.glassPale);
      g.tube([a, ya + 1.18, s * (tw - 0.1)], [b, yb + 1.18, s * (tw - 0.1)], 0.05, 4, P.white);
    }
    g.quad([a, ya - dp, -bw], [b, yb - dp, -bw], [b, yb - dp, bw], [a, ya - dp, bw], shade(P.white, 0.85), [0, -1, 0]);
    // the deck in two halves (each part keeps a tight footprint)
    if (i === Math.floor((xs.length - 1) / 2) - 1) g.cut();
  }
  for (const s of [-1, 1]) {
    const x = (s * L) / 2;
    g.fan([[x, y(x), -tw], [x, y(x), tw], [x, y(x) - 0.45, tw], [x, y(x) - dp, bw], [x, y(x) - dp, -bw], [x, y(x) - 0.45, -tw]], P.white, [s, 0, 0]);
  }
  g.cut();
  // the pivot drum and the pylon, leaning back over the bank; cables to both deck edges along the span
  const px = pivotX;
  g.tube([px, -1.8, 0], [px, y(px) - dp, 0], 3.2, 16, P.concrete, { caps: true });
  const top: V3 = [px - dir * 7, 30, 0];
  const base: V3 = [px, y(px), 0];
  g.tube(base, top, 1.0, 6, P.white, { rb: 0.45, caps: true });
  g.tube([top[0], top[1], 0], [top[0] - dir * 0.6, top[1] + 1.6, 0], 0.45, 6, P.white, { rb: 0.1, caps: true });
  const nc = 7;
  for (let i = 0; i < nc; i++) {
    const t = 0.55 + (i / (nc - 1)) * 0.42;
    const at: V3 = [base[0] + (top[0] - base[0]) * t, base[1] + (top[1] - base[1]) * t, 0];
    const dx = px + dir * (6 + (i / (nc - 1)) * (L * 0.62));
    if (Math.abs(dx) > L / 2 - 1) continue;
    for (const s of [-1, 1]) g.tube(at, [dx, y(dx), s * (tw - 0.2)], 0.06, 4, P.white);
  }
  // the light line up the pylon's front
  g.tube([px - dir * 0.1, y(px) + 0.5, 0], [top[0] + dir * 0.3, top[1] - 1, 0], 0.08, 4, P.led, { glow: 1 });
  return g;
}
export function greatharbor(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const { site } = ctx;
  if (!site.inWater(lm.x, lm.z)) return null;
  const reach = (a: number, sgn: number) => {
    for (let d = 1; d < 150; d++) if (!site.inWater(lm.x + Math.cos(a) * d * sgn, lm.z + Math.sin(a) * d * sgn)) return d;
    return 150;
  };
  let best = { a: 0, n: 0, p: 0, span: Infinity };
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI;
    const n = reach(a, -1),
      p = reach(a, 1);
    if (n + p < best.span) best = { a, n, p, span: n + p };
  }
  if (best.span > 140) return null;
  const k = new Kit(m.id, lm.x, lm.z, best.a);
  const u0 = -best.n + 0.5,
    u1 = best.p - 0.5;
  const cu = (u0 + u1) / 2,
    L = u1 - u0;
  // the pivot (and its pylon) sit at the near (−u) bank; the deck swings out over the water
  put(k, bridgeGeo(L, -L / 2 + 3.5, 1), { u: cu });
  m.overWater = true;
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// Harbor Museum: a tidy two-storey hall — plinth, cornice, rows of tall windows, a hipped roof and a front porch,
// with a ship's anchor on display in front
// ---------------------------------------------------------------------------------------------------------------
export function museumGeo(L: number, W: number) {
  const g = new Geo();
  const hx = L / 2,
    hz = W / 2;
  const H = 9;
  g.box(-hx, hx, 0, 0.7, -hz, hz, P.stone, { skip: ['b'] });
  g.box(-hx + 0.3, hx - 0.3, 0.7, H, -hz + 0.3, hz - 0.3, P.cream, { skip: ['b', 't'], low: shade(P.cream, 0.88) });
  // string course and cornice
  g.box(-hx + 0.15, hx - 0.15, 4.6, 4.9, -hz + 0.15, hz - 0.15, P.offwhite, { skip: ['b', 't'] });
  g.box(-hx, hx, H, H + 0.5, -hz, hz, P.offwhite, { skip: ['b'] });
  // two rows of windows round all four walls
  const win = (s: 1 | -1, axis: 'x' | 'z', span: number, off: number) => {
    const n = Math.max(1, Math.floor(span / 3.2));
    for (let i = 0; i < n; i++) {
      const c = -span / 2 + (span / n) * (i + 0.5);
      for (const [y0, y1, lit] of [
        [1.6, 3.9, 0.7],
        [5.6, 8.0, 0.4],
      ] as const) {
        const o = off + 0.03;
        if (axis === 'z') g.quad([c - 0.6, y0, s * o], [c + 0.6, y0, s * o], [c + 0.6, y1, s * o], [c - 0.6, y1, s * o], P.windowDark, [0, 0, s], hash(c, y0, s) < 0.6 ? lit : 0);
        else g.quad([s * o, y0, c - 0.6], [s * o, y0, c + 0.6], [s * o, y1, c + 0.6], [s * o, y1, c - 0.6], P.windowDark, [s, 0, 0], hash(c, y0, s * 3) < 0.6 ? lit : 0);
      }
    }
  };
  for (const s of [-1, 1] as const) {
    win(s, 'z', L - 2, hz - 0.3);
    win(s, 'x', W - 2, hx - 0.3);
  }
  g.cut();
  // hipped roof
  const R = Math.min(3.2, W * 0.3);
  const e = 0.6;
  const ridge = Math.max(0, hx - hz);
  const A: V3 = [-hx - e, H + 0.5, -hz - e],
    B: V3 = [hx + e, H + 0.5, -hz - e],
    Cc: V3 = [hx + e, H + 0.5, hz + e],
    D: V3 = [-hx - e, H + 0.5, hz + e];
  const E: V3 = [-ridge, H + 0.5 + R, 0],
    F: V3 = [ridge, H + 0.5 + R, 0];
  g.quad(A, B, F, E, P.roofTile, [0, 1, -1]);
  g.quad(Cc, D, E, F, P.roofTile, [0, 1, 1]);
  g.tri(B, Cc, F, shade(P.roofTile, 0.92), [1, 1, 0]);
  g.tri(D, A, E, shade(P.roofTile, 0.92), [-1, 1, 0]);
  g.quad(A, D, Cc, B, shade(P.roofTile, 0.7), [0, -1, 0]);
  g.cut();
  // the porch at the front (+z): columns and a flat roof, doors behind
  const pw = Math.min(8, L * 0.4);
  g.box(-pw / 2, pw / 2, 0, 0.7, hz, hz + 2.6, P.stone, { skip: ['b', '-z'] });
  for (const x of [-pw / 2 + 0.4, pw / 2 - 0.4]) g.box(x - 0.3, x + 0.3, 0.7, 4.4, hz + 2.0, hz + 2.6, P.offwhite, { skip: ['b'] });
  g.box(-pw / 2 - 0.3, pw / 2 + 0.3, 4.4, 4.9, hz - 0.3, hz + 2.9, P.offwhite, { skip: [] });
  g.quad([-1.2, 0.7, hz + 0.02], [1.2, 0.7, hz + 0.02], [1.2, 3.6, hz + 0.02], [-1.2, 3.6, hz + 0.02], P.woodDark, [0, 0, 1], 0.5);
  return g;
}
/** a ship's anchor on a low plinth */
function anchorGeo() {
  const g = new Geo();
  g.box(-1.4, 1.4, 0, 0.5, -0.8, 0.8, P.stone);
  const c = P.black;
  g.tube([0, 0.9, 0], [0, 4.2, 0], 0.16, 6, c);
  g.tube([-0.8, 3.6, 0], [0.8, 3.6, 0], 0.1, 6, c, { caps: true });
  g.tube([0, 4.2, 0], [0, 4.6, 0], 0.28, 8, c, { caps: true });
  for (const s of [-1, 1]) {
    g.tube([0, 0.9, 0], [s * 1.0, 1.3, 0], 0.14, 6, c);
    g.tube([s * 1.0, 1.3, 0], [s * 1.3, 2.0, 0], 0.13, 6, c, { rb: 0.04 });
  }
  return g;
}
export function harbormuseum(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 30, W: 18 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  // the porch and the anchor stand in the front setback when there is room, otherwise the hall gives up depth for them
  const deep = !r.tight && r.W >= 12;
  const W = deep ? r.W - 3.5 : r.W - 3,
    L = r.L;
  put(k, museumGeo(L, Math.max(5, W)), { v: -(r.W - Math.max(5, W)) / 2 });
  k.wall(0, -(r.W - Math.max(5, W)) / 2, 0, L, Math.max(5, W), 9.5);
  const [ax, az] = k.at(L / 2 - 2.2, r.W / 2 - 1.2);
  if (ctx.site.roadGap(ax, az) > 3 && L > 10) {
    put(k, anchorGeo(), { u: L / 2 - 2.2, v: r.W / 2 - 1.4 });
    k.wall(L / 2 - 2.2, r.W / 2 - 1.4, 0, 2.8, 1.6, 4.6);
  }
  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// Xinguang Pier: a timber quay deck with mooring bollards, a small white ferry kiosk under a curved roof, lamp posts
// ---------------------------------------------------------------------------------------------------------------
export function xinguangGeo(L: number, W: number, quay: 1 | -1 | 0) {
  const g = new Geo();
  const q = quay || 1;
  deckGeo(g, L, W, 0.35, quay, '#A07E5A');
  // mooring bollards along the edge (outside the railing line, on the deck)
  for (const x of breaks(-L / 2 + 1.5, L / 2 - 1.5, 5)) g.tube([x, 0.35, q * (W / 2 - 0.7)], [x, 0.95, q * (W / 2 - 0.7)], 0.2, 8, P.black, { caps: true });
  g.cut();
  // the kiosk: white walls, a glazed front, a curved roof
  const kl = Math.min(7, L * 0.35),
    kw = Math.min(4, W * 0.45);
  const kz = -q * (W / 2 - kw / 2 - 0.6);
  g.box(-kl / 2, kl / 2, 0.35, 3.3, kz - kw / 2, kz + kw / 2, P.white, { skip: ['b', 't'] });
  g.quad([-kl / 2 + 0.6, 0.6, kz + q * (kw / 2 + 0.02)], [kl / 2 - 0.6, 0.6, kz + q * (kw / 2 + 0.02)], [kl / 2 - 0.6, 2.8, kz + q * (kw / 2 + 0.02)], [-kl / 2 + 0.6, 2.8, kz + q * (kw / 2 + 0.02)], P.glass, [0, 0, q], 0.8);
  const n = 8;
  const arc = (lift: number) => Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI - (i / n) * Math.PI;
    return [kz + Math.cos(a) * (kw / 2 + 0.5), 3.2 + lift + Math.sin(a) * 0.9] as [number, number];
  });
  g.extrudeX([...arc(0.15), ...arc(0).reverse()], [-kl / 2 - 0.5, kl / 2 + 0.5], (_s, e) => (e < n ? '#3F7FBF' : P.offwhite), { caps: P.offwhite });
  for (const s of [-1, 1]) g.fan(Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI - (i / n) * Math.PI;
    return [s * (kl / 2), 3.25 + Math.sin(a) * 0.85, kz + Math.cos(a) * (kw / 2)] as V3;
  }), P.white, [s, 0, 0]);
  g.cut();
  // lamp posts
  for (const x of [-L / 2 + 1.5, L / 2 - 1.5]) {
    const z = -q * (W / 2 - 0.5);
    g.tube([x, 0.35, z], [x, 4.6, z], 0.09, 6, P.steelDark);
    g.box(x - 0.3, x + 0.3, 4.6, 4.9, z - 0.3, z + 0.3, P.lamp, { glow: 1, skip: [] });
  }
  return g;
}
export function xinguangpier(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 20, W: 10 }, { ring: null, clear: 3 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const quay = waterSide(ctx, k, r.L, r.W);
  put(k, xinguangGeo(r.L, r.W, quay));
  const kl = Math.min(7, r.L * 0.35),
    kw = Math.min(4, r.W * 0.45);
  k.wall(0, -(quay || 1) * (r.W / 2 - kw / 2 - 0.6), 0, kl, kw, 3.3);
  if (quay) k.wall(0, quay * (r.W / 2 - 0.15), 0, r.L, 0.3, 1.1);
  m.covers.push(rectRing(r));
  return [k];
}

/** the landmark ids of this slice */
export const HARBOUR_IDS = ['pier2', 'pier2tower', 'lovepier', 'gloriouspier', 'greatharbor', 'harbormuseum', 'xinguangpier'];
