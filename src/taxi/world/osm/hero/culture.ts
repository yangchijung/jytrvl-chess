// Rush Taxi — culture slice: detailed models of Kaohsiung's cultural landmarks, as free geometry (`Kit.mesh`).
//
// - 高雄市文化中心 (culturalcenter): the 1981 modern Chinese-style complex — the central 至德堂 under a double-eaved
//   hip roof, two long halls beside it, the colonnaded corridor of square columns in front, blue glazed tiles.
// - 三鳳宮 (sanfeng): the Taoist temple — front plaza with the big incense burner, the 三川殿 with its stepped roofs,
//   the double-eaved main hall, the three-storey rear hall; curved swallowtail ridges (燕尾脊) with cut-and-paste
//   porcelain (剪黏) dragons and a pagoda; red columns, gold trim, red lanterns and ridge light strings at night.
// - 原高雄市議會 (oldcouncil): the 1939 building with its central tower and arched windows.
// - 高雄歷史博物館 (historymuseum): the 1939 former City Hall, Imperial Crown style — cream body, central tower under
//   a two-tier pagoda-like tiled roof.
// - 四維市政中心 (cityhall) and 高雄文學館 (literature): tidy modern blocks.
//
// Placement is the same as the plain models (`place` fits the real footprint, clear of roads and water; the front
// faces the nearest road). Every part is its own mesh centred on its own footprint, so the landmark checks can test
// it tightly; colliders are plain hidden boxes (`Kit.wall`).
//
// Function declarations only (landmarks.ts imports this file and this file imports landmarks.ts).
import { Kit, place, rectRing, type Ctx, type Model } from '../landmarks';
import type { OsmLandmark } from '../data';
import { Geo, curve, gableWalls, ridgeLine, roof, roofPt as roofPtAt, roofUnderY, type RoofO, type V3 } from './culture-geo';

const K = {
  white: '#F1EEE6',
  offwhite: '#E6E1D3',
  stone: '#B9B2A4',
  paving: '#CFC8BA',
  lawn: '#6E9A4E',
  blue: '#2F5E9E',
  blue2: '#3D6DAE',
  blueDark: '#244A7C',
  soffit: '#DCD3BF',
  red: '#B3302A',
  redDark: '#8E2420',
  column: '#A8281F',
  gold: '#D8A62B',
  goldDeep: '#B8862A',
  tile: '#B9472A',
  tile2: '#A63E25',
  templeUnder: '#6E2A20',
  bronze: '#6E5530',
  bronzeLight: '#8B6A35',
  glass: '#5E7D93',
  glassDark: '#46596A',
  win: '#4E5D68',
  /** lit windows: warm by day too (lights on inside), glowing at night */
  lit: '#CDB57E',
  /** big glazed lobbies: pale glass by day, lit at night */
  lobby: '#8FAFC0',
  cream: '#E8DCBB',
  creamDark: '#CBBC97',
  roofGreen: '#4C5B55',
  roofGreen2: '#56665F',
  brown: '#8C6E4E',
  councilWall: '#D6C4A0',
  lantern: '#D2382A',
  light: '#F2C462',
  wood: '#A27A52',
  black: '#2B2E33',
};
/** the cut-and-paste porcelain colours */
const JIAN = ['#2E8B57', '#E8B830', '#2F6FB5', '#D94A3A', '#F0EDE0', '#3FA7A0'];

function hash(a: number, b: number) {
  let x = Math.imul(Math.round(a * 13) ^ 0x9e3779b9, 2654435761) ^ Math.imul(Math.round(b * 17) + 0x7f4a7c15, 2246822507);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
/** a window: dark glass, or (share `lit`) lit inside, glowing at night */
function win(G: Geo, x: number, y0: number, z: number, w: number, h: number, nx: number, nz: number, lit = 0.35, arched = false) {
  const on = hash(x * 3 + nz * 7 + y0, z * 3 + nx * 5 - y0) < lit;
  if (arched) G.arch(x, y0, z, w, h, nx, nz, on ? K.lit : K.win, on ? 1 : 0, 6);
  else G.panel(x, y0, z, w, h, nx, nz, on ? K.lit : K.win, on ? 1 : 0);
}
/** a square column (no top or bottom: it stands under a roof) */
function sqCol(G: Geo, x: number, y0: number, z: number, s: number, h: number, color: string) {
  G.box(x, y0, z, s, h, s, color, { top: false });
}

/** a model built in several mesh parts (each keeps its own footprint for the checks) */
function parts(k: Kit) {
  const list: Geo[] = [];
  return {
    next() {
      const g = new Geo();
      list.push(g);
      return g;
    },
    done() {
      for (const g of list) if (g.tris) k.mesh(0, 0, 0, g.geometry());
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// roof ornaments
// ---------------------------------------------------------------------------------------------------------------
/** a straight main ridge on a hip roof with the curled ridge ends (鴟吻), and the four hip ridges */
function hipRidges(G: Geo, o: RoofO, rw: number, color: string) {
  const top = ridgeLine(o, 1, rw * 0.6);
  if (o.ra > 0.5) {
    G.tube(top, rw / 0.707, 4, color, 0, { rh: (rw * 1.4) / 0.707 });
    for (const [i, d] of [
      [0, -1],
      [1, 1],
    ] as const) {
      const e = top[i];
      const pts = curve([[e[0] - d * 0.5, e[1], e[2]], [e[0], e[1] + 0.3, e[2]], [e[0] - d * 0.2, e[1] + 1.3, e[2]], [e[0] - d * 0.9, e[1] + 1.5, e[2]]], 5);
      G.tube(pts, [rw, rw, rw * 0.9, rw * 0.8, rw * 0.7, rw * 0.5], 4, color);
    }
  }
  // hip ridges from the eave corners to the ridge ends
  for (const [k, t] of [
    ['f', 0],
    ['f', 1],
    ['b', 0],
    ['b', 1],
  ] as const) {
    const pts: V3[] = [];
    for (let i = 0; i <= 4; i++) {
      const p = (k === 'f' ? fPt : bPt)(o, i / 4, t);
      pts.push([p[0], p[1] + rw * 0.5, p[2]]);
    }
    G.tube(pts, rw * 0.9, 4, color, 0, { caps: true });
  }
}
function fPt(o: RoofO, s: number, t: number) {
  return roofPtAt(o, 'f', s, t);
}
function bPt(o: RoofO, s: number, t: number) {
  return roofPtAt(o, 'b', s, t);
}

/**
 * the swallowtail ridge (燕尾脊) of a two-slope temple roof: the curved ridge that sweeps up at both ends and splits
 * into two tails, cut-and-paste porcelain panels on its faces, a light string along it, and (big roofs) two
 * dragons facing a pagoda in the middle
 */
function swallowRidge(G: Geo, o: RoofO, o2: { rw: number; rh: number; tail: number; dragons?: boolean; light?: boolean; n?: number }) {
  const { rw, rh, tail } = o2;
  const n = o2.n ?? 12;
  const line = ridgeLine(o, n, rh * 0.55);
  G.tube(line, rw / 0.707, 4, K.tile2, 0, { rh: rh / 0.707, caps: false });
  // a gold cap along the top
  G.tube(
    line.map((p) => [p[0], p[1] + rh + 0.04, p[2]] as V3),
    (rw * 0.8) / 0.707,
    4,
    K.gold,
    0,
    { rh: 0.06 / 0.707, caps: false },
  );
  // the porcelain panels on both faces, and the light strings under them
  for (const sg of [-1, 1]) {
    for (let i = 1; i < n - 1; i++) {
      const a = line[i],
        b = line[i + 1];
      const c = JIAN[(i + (sg > 0 ? 0 : 3)) % JIAN.length];
      const z = a[2] + sg * (rw + 0.03);
      G.quad([a[0], a[1] - rh * 0.45, z], [b[0], b[1] - rh * 0.45, z], [b[0], b[1] + rh * 0.55, z], [a[0], a[1] + rh * 0.55, z], c, 0, [0, 0, sg]);
    }
    if (o2.light !== false)
      G.tube(
        line.map((p) => [p[0], p[1] - rh * 0.7, p[2] + sg * (rw + 0.06)] as V3),
        0.07,
        3,
        K.light,
        1,
        { caps: false },
      );
  }
  // the swallowtails: each ridge end rises and splits in two
  for (const [i, d] of [
    [0, -1],
    [n, 1],
  ] as const) {
    const e = line[i];
    for (const zs of [-1, 1]) {
      const ctrl: V3[] = [
        [e[0] - d * 0.5, e[1], e[2]],
        [e[0], e[1] + 0.05 * tail, e[2]],
        [e[0] + d * 0.55 * tail, e[1] + 0.3 * tail, e[2] + zs * 0.1 * tail],
        [e[0] + d * 0.9 * tail, e[1] + 0.75 * tail, e[2] + zs * 0.22 * tail],
        [e[0] + d * 1.02 * tail, e[1] + 1.15 * tail, e[2] + zs * 0.3 * tail],
      ];
      const pts = curve(ctrl, 7);
      const rr = pts.map((_, j) => Math.max(0.06, rw * (1 - j / 8.5)));
      const hh = pts.map((_, j) => Math.max(0.06, rh * 0.9 * (1 - j / 8)));
      G.tube(pts, rr, 4, K.tile2, 0, { rh: hh });
      // a gold tip
      const t = pts[pts.length - 1];
      G.tube([t, [t[0] + d * 0.05, t[1] + 0.3, t[2] + zs * 0.05]], [0.09, 0.02], 4, K.gold);
    }
  }
  if (o2.dragons) {
    const mid = line[Math.floor(n / 2)];
    const y = mid[1] + rh;
    pagoda(G, mid[0], y, mid[2], 0.32);
    // two dragons facing the pagoda
    for (const d of [-1, 1]) {
      const pts: V3[] = [];
      const x0 = mid[0] + d * 0.8,
        x1 = mid[0] + d * (o.a * 0.62);
      for (let i = 0; i <= 8; i++) {
        const f = i / 8;
        const x = x1 + (x0 - x1) * f;
        const ii = Math.round((n / 2) * (1 + d * (1 - f) * 0.62 * (o.a / o.ra)));
        const base = line[Math.max(0, Math.min(n, ii))];
        pts.push([x, base[1] + rh + 0.25 + 0.32 * Math.sin(f * Math.PI * 2.2) + f * 0.25, mid[2] + 0.08 * Math.sin(f * 9)]);
      }
      G.tube(pts, 0.15, 4, '#2E8B57', 0);
      // scales: coloured fins along the back
      for (let i = 1; i < 8; i++) {
        const p = pts[i];
        const c = JIAN[(i + 1) % JIAN.length];
        G.tri([p[0] - 0.18, p[1] + 0.12, p[2]], [p[0] + 0.18, p[1] + 0.12, p[2]], [p[0], p[1] + 0.42, p[2]], c, 0, [0, 0, 1]);
        G.tri([p[0] - 0.18, p[1] + 0.12, p[2]], [p[0] + 0.18, p[1] + 0.12, p[2]], [p[0], p[1] + 0.42, p[2]], c, 0, [0, 0, -1]);
      }
      // the head (gold, red whiskers) facing the pagoda
      const h = pts[8];
      G.box(h[0], h[1] - 0.2, h[2], 0.5, 0.4, 0.34, K.gold);
      G.box(h[0] - d * 0.25, h[1] - 0.1, h[2], 0.3, 0.12, 0.4, '#D94A3A');
    }
  } else {
    // a small gourd on short ridges
    const mid = line[Math.floor(n / 2)];
    G.lathe(mid[0], mid[1] + rh, mid[2], [[0, 0], [0.22, 0.15], [0.12, 0.35], [0.2, 0.5], [0, 0.75]], 6, K.gold);
  }
}
/** the little seven-storey pagoda on a temple ridge */
function pagoda(G: Geo, x: number, y: number, z: number, r: number) {
  let yy = y;
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.16;
    G.cyl(x, yy, z, r * s, 0.38 * s, 6, JIAN[i % JIAN.length], { top: false });
    G.lathe(x, yy + 0.38 * s, z, [[0, 0], [r * s * 1.7, 0.02], [r * s * 0.5, 0.2 * s], [0, 0.22 * s]], 6, K.gold);
    yy += 0.58 * s;
  }
  G.lathe(x, yy, z, [[0, 0], [0.14, 0.1], [0.06, 0.25], [0.11, 0.38], [0, 0.6]], 6, K.gold);
}
/** a red lantern hanging with its top at y */
function lantern(G: Geo, x: number, y: number, z: number, s = 1) {
  G.lathe(x, y - 0.95 * s, z, [[0, 0], [0.12 * s, 0], [0.32 * s, 0.18 * s], [0.38 * s, 0.45 * s], [0.32 * s, 0.72 * s], [0.12 * s, 0.85 * s], [0, 0.85 * s]], 6, K.lantern, 0.9, [K.gold, K.lantern, K.lantern, K.lantern, K.lantern, K.gold]);
  G.box(x, y - 0.12 * s, z, 0.04, 0.12 * s, 0.04, K.black, { top: false });
}

// ---------------------------------------------------------------------------------------------------------------
// 高雄市文化中心
// ---------------------------------------------------------------------------------------------------------------
export function culturalcenter(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r0 = place(ctx, lm, { L: 86, W: 36 });
  if (!r0) return null;
  const L = Math.min(r0.L, 86),
    W = Math.min(r0.W, 36);
  const k = new Kit(m.id, r0.cx, r0.cz, r0.ang);
  const hw = L / 2,
    hd = W / 2;
  const base = 1.1;
  // ---- the park lawn and the podium with its front steps ----
  const g0 = new Geo();
  g0.box(0, 0, 0, L, 0.12, W, K.lawn);
  g0.box(0, 0.12, -0.3, L - 2.4, base - 0.12, W - 3, K.stone, { top: K.paving });
  g0.box(0, 0.12, hd - 1.15, 14, (base - 0.12) * 0.66, 1.3, K.stone, { top: K.paving });
  g0.box(0, 0.12, hd - 0.65, 14, (base - 0.12) * 0.33, 0.7, K.stone, { top: K.paving });
  // hedges along the lawn
  for (const s of [-1, 1]) g0.box(s * (hw - 0.6), 0.12, -0.8, 0.8, 0.8, W - 6, '#4F7A3A');
  k.mesh(0, 0, 0, g0.geometry());

  // ---- 至德堂: the main hall, its tall portico and the double-eaved hip roof ----
  const aw = Math.min(13, L * 0.2);
  const front = hd - 6.4; // the halls' front walls
  const back = -hd + 2;
  const vm = (front + back) / 2,
    hm = (front - back) / 2;
  const porch = front + 3.6; // the portico's column line
  {
    const G = new Geo();
    const yTop = 13.4;
    G.box(0, base, 0, 2 * aw, yTop - base, 2 * hm, K.offwhite);
    // pilasters and the tall glass between them, on all four faces
    const nf = 6;
    for (let i = 0; i <= nf; i++) {
      const x = -aw + (2 * aw * i) / nf;
      for (const s of [-1, 1]) sqCol(G, x, base, s * (hm + 0.3), 1.0, yTop - base, K.white);
      if (i < nf) {
        const xm = x + aw / nf;
        G.panel(xm, base + 1.2, hm, (2 * aw) / nf - 1.8, 9.5, 0, 1, K.glassDark, 0.55);
        win(G, xm, base + 6, -hm, 1.2, 4, 0, -1, 0.3);
      }
    }
    const nsd = 6;
    for (let i = 0; i <= nsd; i++) {
      const z = -hm + (2 * hm * i) / nsd;
      for (const s of [-1, 1]) {
        sqCol(G, s * (aw + 0.3), base, z, 1.0, yTop - base, K.white);
        if (i < nsd) win(G, s * aw, base + 7.2, z + hm / nsd, 1.3, 3.6, s, 0, 0.4);
      }
    }
    // the portico: six big square columns under the lower eave
    for (let i = 0; i < 6; i++) sqCol(G, -aw + 1.4 + ((2 * aw - 2.8) * i) / 5, base, porch - vm, 1.3, yTop - base + 0.2, K.white);
    // the lower eave (a skirt round the hall and over the portico)
    const fz = porch - vm + 2.2,
      bz = -hm - 2.2;
    const skirt: RoofO = { a: aw + 2.4, b: (fz - bz) / 2, z: (fz + bz) / 2, rz: -(fz + bz) / 2, ra: aw - 1.3, rb: hm - 1.7, y0: yTop, H: 2.5, lift: 0.7, thick: 0.45, color: K.blue, stripe: K.blue2, under: K.soffit, fascia: K.blueDark, ns: 2, nt: 12 };
    roof(G, skirt);
    // ceiling lights in the portico
    for (let i = 0; i < 5; i++) G.panel(-aw + 2.8 + ((2 * aw - 5.6) * i) / 4, yTop - 0.3, porch - vm - 1.5, 1.6, 0.25, 0, 1, K.light, 1);
    // the upper hall with its clerestory, and the big roof
    const ua = aw - 1.6,
      ub = hm - 2;
    G.box(0, yTop, 0, 2 * ua, 5.4, 2 * ub, K.offwhite);
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) G.panel(-ua + ((i + 0.5) * 2 * ua) / 8, yTop + 2.8, s * ub, 1.6, 1.6, 0, s, K.lit, 0.9);
    const up: RoofO = { a: aw + 0.6, b: hm + 0.4, ra: aw - 5.5, rb: 0, y0: yTop + 5.4, H: 7, lift: 1.1, thick: 0.5, color: K.blue, stripe: K.blue2, under: K.soffit, fascia: K.blueDark, ns: 4, nt: 12 };
    roof(G, up);
    hipRidges(G, up, 0.3, K.blueDark);
    k.mesh(0, vm, 0, G.geometry());
    k.wall(0, vm + 1.8, 0, 2 * aw + 1, 2 * hm + 3.6, 13);
  }

  // ---- the two long halls beside it ----
  const wu0 = aw + 0.6,
    wu1 = hw - 1.6;
  const uw = (wu0 + wu1) / 2,
    ha = (wu1 - wu0) / 2;
  const wb = -hd + 2.5;
  const vw = (front + wb) / 2,
    hb = (front - wb) / 2;
  for (const sg of [-1, 1]) {
    const G = new Geo();
    const yTop = 9.6;
    G.box(0, base, 0, 2 * ha, yTop - base, 2 * hb, K.offwhite);
    const nx = Math.max(3, Math.round((2 * ha) / 3.2));
    for (let i = 0; i <= nx; i++) {
      const x = -ha + (2 * ha * i) / nx;
      for (const s of [-1, 1]) sqCol(G, x, base, s * (hb + 0.25), 0.8, yTop - base, K.white);
      if (i < nx) for (const s of [-1, 1]) win(G, x + ha / nx, base + 4.2, s * hb, 1.2, 3.4, 0, s, 0.35);
    }
    const nz = Math.max(4, Math.round((2 * hb) / 3.4));
    for (let i = 0; i <= nz; i++) {
      const z = -hb + (2 * hb * i) / nz;
      sqCol(G, sg * (ha + 0.25), base, z, 0.8, yTop - base, K.white);
      if (i < nz) win(G, sg * ha, base + 4.2, z + hb / nz, 1.2, 3.4, sg, 0, 0.35);
    }
    const o: RoofO = { a: ha + 1.5, b: hb + 1.8, ra: 0, rb: Math.max(1, hb + 1.8 - (ha + 1.5) * 0.85), y0: yTop, H: 5, lift: 0.8, thick: 0.45, color: K.blue, stripe: K.blue2, under: K.soffit, fascia: K.blueDark, ns: 3, nt: 10 };
    roof(G, o);
    // the ridge along z, and its ends
    const t0 = roofPtAt(o, 'r', 1, 0),
      t1 = roofPtAt(o, 'r', 1, 1);
    G.tube([[t0[0], t0[1] + 0.2, t0[2]], [t1[0], t1[1] + 0.2, t1[2]]], 0.36, 4, K.blueDark, 0, { rh: 0.55 });
    k.mesh(sg * uw, vw, 0, G.geometry());
    k.wall(sg * uw, vw, 0, 2 * ha, 2 * hb, 9);
  }

  // ---- the colonnaded corridor in front of the long halls ----
  const vc0 = front,
    vc1 = porch;
  const vcc = (vc0 + vc1) / 2,
    hc = (vc1 - vc0) / 2;
  for (const sg of [-1, 1]) {
    const G = new Geo();
    const n = Math.max(3, Math.round((2 * ha) / 3.6));
    const yTop = 6.4;
    for (let i = 0; i <= n; i++) sqCol(G, -ha + (2 * ha * i) / n, base, hc, 0.8, yTop - base, K.white);
    // a low rail between the columns, and the paving under the corridor
    G.box(0, base, hc, 2 * ha, 0.6, 0.25, K.white);
    const o: RoofO = { a: ha + 0.9, b: hc + 1.2, ra: ha - 1.2, rb: 0, y0: yTop, H: 1.7, lift: 0.4, thick: 0.4, color: K.blue, stripe: K.blue2, under: K.soffit, fascia: K.blueDark, ns: 3, nt: 12 };
    roof(G, o);
    // ceiling lights along the corridor
    for (let i = 0; i < n; i++) G.box(-ha + (2 * ha * (i + 0.5)) / n, yTop - 0.36, 0, 0.9, 0.06, 0.9, K.light, { g: 1, bottom: true, top: false });
    k.mesh(sg * uw, vcc, 0, G.geometry());
    k.wall(sg * uw, vcc + hc, 0, 2 * ha, 0.9, 3);
  }
  m.covers.push(rectRing({ ...r0, L, W }));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// 三鳳宮
// ---------------------------------------------------------------------------------------------------------------
/** a curved swallowtail temple roof as one free-geometry part (used by the plain `swallowRoof` helper too) */
export function swallowRoofGeo(L: number, W: number, H: number, o: { dragons?: boolean; wallBase?: number; wallX?: number } = {}) {
  const G = new Geo();
  const r: RoofO = { a: L / 2, b: W / 2, ra: L / 2, rb: 0, y0: 0, H, lift: Math.min(0.8, L * 0.04), sag: Math.min(1.2, L * 0.06), thick: 0.32, color: K.tile, stripe: K.tile2, under: K.templeUnder, fascia: K.gold, fasciaGlow: 1, ns: 4, nt: Math.max(8, Math.min(14, Math.round(L / 1.4))), slopes: 'fb' };
  roof(G, r);
  if (o.wallX) gableWalls(G, r, o.wallX, o.wallBase ?? -0.4, K.red);
  swallowRidge(G, r, { rw: Math.max(0.18, W * 0.022), rh: Math.max(0.3, H * 0.16), tail: Math.min(2.2, Math.max(1, L * 0.09)), dragons: o.dragons });
  return G;
}

export function sanfeng(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 30, W: 34 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  const hd = W / 2;
  // the depth of the plaza, the front hall, the main hall and the rear hall
  const dP = W * 0.2,
    dF = W * 0.25,
    dM = W * 0.31,
    dR = W - dP - dF - dM - 0.8;
  const vF = hd - dP - dF / 2,
    vM = hd - dP - dF - 0.4 - dM / 2,
    vR = -hd + dR / 2;
  const plat = 0.6;

  // ---- the ground: paving, the plaza, the incense burner and two lantern posts ----
  {
    const G = new Geo();
    G.box(0, 0, 0, L, plat, W, K.stone, { top: '#C9C2B4' });
    const zP = hd - dP / 2;
    // the big incense burner (天公爐): bronze pot on three legs under a little roof
    const zb = zP - 0.2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      G.box(Math.cos(a) * 0.8, plat, zb + Math.sin(a) * 0.8, 0.3, 0.6, 0.3, K.bronze);
    }
    G.lathe(0, plat + 0.5, zb, [[0, 0], [0.85, 0.05], [1.2, 0.6], [1.15, 1.2], [1.35, 1.32], [1.3, 1.45], [0.75, 1.5]], 12, K.bronze, 0, [K.bronze, K.bronze, K.bronzeLight, K.gold, K.bronze, K.bronze]);
    // the glowing embers in its mouth
    G.cyl(0, plat + 1.9, zb, 0.72, 0.05, 12, '#E07B39', { g: 0.8 });
    G.cyl(0, plat + 2.0, zb, 0.3, 0.9, 6, K.bronze, { top: false });
    G.lathe(0, plat + 2.9, zb, [[0, 0], [1.0, 0.05], [0.7, 0.35], [0.2, 0.75], [0, 0.8]], 12, K.bronzeLight);
    G.lathe(0, plat + 3.65, zb, [[0, 0], [0.18, 0.1], [0.08, 0.3], [0.14, 0.45], [0, 0.7]], 6, K.gold);
    // lantern posts at the plaza's front corners
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 1.2);
      G.cyl(x, plat, zP + dP * 0.25, 0.14, 4.2, 6, K.redDark);
      G.box(x, plat + 3.9, zP + dP * 0.25, 0.9, 0.08, 0.08, K.gold, { bottom: true });
      lantern(G, x + 0.35, plat + 3.9, zP + dP * 0.25, 0.8);
      lantern(G, x - 0.35, plat + 3.9, zP + dP * 0.25, 0.8);
    }
    k.mesh(0, 0, 0, G.geometry());
    k.wall(0, zb, plat, 2.4, 2.4, 3.2);
  }

  // ---- 三川殿: the front hall, a higher middle roof between two lower ones; red columns, doors, lanterns ----
  {
    const G = new Geo();
    const wF = L * 0.92,
      hz = dF / 2;
    const y0 = plat;
    G.box(0, y0, 0, wF + 0.6, 0.35, dF, K.stone);
    const yb = y0 + 0.35;
    const wallZ = hz - 1.6;
    G.box(0, yb, (wallZ - hz + 0.2) / 2, wF - 0.4, 5.4, wallZ + hz - 0.2, K.red);
    // the doors: a wide middle one and two side doors, with the door-god panels
    for (const [x, w] of [
      [0, 2.6],
      [-wF * 0.28, 1.8],
      [wF * 0.28, 1.8],
    ] as const) {
      G.panel(x, yb, wallZ, w + 0.5, 3.9, 0, 1, K.gold, 0);
      G.panel(x, yb, wallZ, w, 3.6, 0, 1, '#7E1F1A', 0, 0.09);
      for (const s of [-1, 1]) G.panel(x + (s * w) / 4, yb + 1.1, wallZ, w * 0.36, 1.8, 0, 1, JIAN[s > 0 ? 2 : 0], 0, 0.11);
    }
    // stone windows on the side bays
    for (const s of [-1, 1]) G.panel(s * wF * 0.42, yb + 1.6, wallZ, 1.4, 1.4, 0, 1, '#9C958A', 0, 0.09);
    // the plaque over the middle door
    G.panel(0, yb + 4.3, wallZ, 2.4, 0.8, 0, 1, K.gold, 0.3, 0.1);
    // six red columns on the porch, with gold capitals
    for (let i = 0; i < 6; i++) {
      const x = -wF * 0.42 + (wF * 0.84 * i) / 5;
      G.cyl(x, yb, hz - 0.6, 0.3, 5.3, 8, K.column, { top: false });
      G.box(x, yb + 5.0, hz - 0.6, 0.75, 0.3, 0.75, K.gold);
      G.cyl(x, yb, hz - 0.6, 0.45, 0.4, 8, K.stone);
    }
    // the roofs: the middle one higher, the side ones lower
    const midA = wF * 0.24,
      sideA = wF * 0.14,
      sideX = midA + sideA - 0.6;
    const yMid = yb + 6.2,
      ySide = yb + 5.3;
    G.box(0, yb + 5.4, -0.3, midA * 2 - 0.8, yMid - yb - 5.4 + 0.1, dF - 2.6, K.red);
    const mid = swallowRoofGeo(midA * 2, dF + 1.5, 2.1, { dragons: true, wallX: midA - 0.5, wallBase: -(yMid - yb - 5.4) - 0.2 });
    addAt(G, mid, 0, yMid, -0.3);
    for (const s of [-1, 1]) {
      const side = swallowRoofGeo(sideA * 2, dF + 1.2, 1.8, { wallX: sideA - 0.4, wallBase: -0.2 });
      addAt(G, side, s * sideX, ySide, -0.4);
    }
    // red lanterns under the front eaves
    for (let i = 0; i < 7; i++) lantern(G, -wF * 0.42 + (wF * 0.84 * i) / 6, yb + 4.9, hz + 0.1, 0.9);
    k.mesh(0, vF, 0, G.geometry());
    k.wall(0, vF - 0.8, 0, wF, dF - 1.6, 6);
  }

  // ---- 正殿: the main hall, double eaves ----
  {
    const G = new Geo();
    const wM = L * 0.86,
      hz = dM / 2;
    const yb = plat + 0.9;
    G.box(0, plat, 0, wM + 1, 0.9, dM, K.stone, { top: '#C9C2B4' });
    const ba = wM / 2 - 1,
      bb = hz - 1;
    const up: RoofO = { a: ba + 1.0, b: bb + 1.1, ra: ba + 1.0, rb: 0, y0: yb + 8.0, H: 2.8, thick: 0.32, color: K.tile };
    const yWall = roofUnderY(up, 1.1 / (bb + 1.1)) + 0.05;
    G.box(0, yb, 0, 2 * ba, yWall - yb, 2 * bb, K.red);
    // doors and windows on the front wall
    for (const x of [-ba * 0.62, 0, ba * 0.62]) {
      G.panel(x, yb, bb, x === 0 ? 2.6 : 1.8, 3.8, 0, 1, '#7E1F1A');
      G.panel(x, yb + 3.9, bb, x === 0 ? 2.6 : 1.8, 0.5, 0, 1, K.gold, 0.4);
    }
    for (let i = 0; i < 6; i++) {
      const x = -ba + 0.5 + ((2 * ba - 1) * i) / 5;
      G.cyl(x, yb, bb + 0.7, 0.32, 5.6, 8, K.column, { top: false });
      G.box(x, yb + 5.3, bb + 0.7, 0.8, 0.3, 0.8, K.gold);
    }
    // the lower eave round the hall
    const skirt: RoofO = { a: ba + 1.4, b: bb + 1.8, ra: ba + 0.05, rb: bb + 0.05, y0: yb + 5.6, H: 1.3, lift: 0.6, thick: 0.3, color: K.tile, stripe: K.tile2, under: K.templeUnder, fascia: K.gold, fasciaGlow: 1, ns: 2, nt: 10 };
    roof(G, skirt);
    // porcelain figures on the skirt corners
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = sx * (ba + 1.2),
        z = sz * (bb + 1.6),
        y = yb + 5.6 + 0.6;
      G.box(x, y, z, 0.3, 0.5, 0.3, JIAN[(sx + 1 + (sz + 1) / 2) % JIAN.length]);
      G.box(x - sx * 0.4, y - 0.05, z - sz * 0.3, 0.25, 0.4, 0.25, JIAN[(sx + 3) % JIAN.length]);
    }
    for (let i = 0; i < 6; i++) lantern(G, -ba + 0.5 + ((2 * ba - 1) * (i + 0.5)) / 6, yb + 5.4, bb + 1.4, 0.8);
    const top = swallowRoofGeo(up.a * 2, up.b * 2, up.H, { dragons: true, wallX: ba, wallBase: yWall - up.y0 - 0.05 });
    addAt(G, top, 0, up.y0, 0);
    k.mesh(0, vM, 0, G.geometry());
    k.wall(0, vM, 0, 2 * ba, 2 * bb, 7);
  }

  // ---- 後殿: the three-storey rear hall, balconies and pent eaves on each floor ----
  {
    const G = new Geo();
    const wR = L * 0.94,
      hz = dR / 2;
    const ba = wR / 2,
      bb = hz - 0.9;
    const yb = plat;
    const fh = 4.1;
    const top: RoofO = { a: ba + 0.6, b: bb + 1.2, ra: ba + 0.6, rb: 0, y0: yb + 3 * fh + 0.2, H: 2.8, thick: 0.32, color: K.tile };
    const yWall = roofUnderY(top, 1.2 / (bb + 1.2)) + 0.05;
    G.box(0, yb, -0.4, 2 * ba, yWall - yb, 2 * bb, K.red);
    for (let f = 0; f < 3; f++) {
      const y = yb + f * fh;
      // windows (lit inside at night) and the doors on the ground floor
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = -ba + ((i + 0.5) * 2 * ba) / n;
        if (f === 0) G.panel(x, y + 0.2, bb - 0.4, 1.8, 3.0, 0, 1, i === 2 ? '#7E1F1A' : '#8E2A22');
        else G.panel(x, y + 1.0, bb - 0.4, 1.6, 2.0, 0, 1, K.lit, 0.9);
        win(G, x, y + 1.2, -bb - 0.4, 1.2, 1.8, 0, -1, 0.5);
      }
      if (f > 0) {
        // the balcony: a red slab and a gold rail in front of the floor
        G.box(0, y - 0.25, bb + 0.2, 2 * ba - 0.6, 0.25, 1.2, K.redDark, { bottom: true });
        G.box(0, y, bb + 0.75, 2 * ba - 0.6, 0.9, 0.1, K.gold);
      }
      // red columns along the front of each floor
      for (let i = 0; i <= 5; i++) G.cyl(-ba + 0.5 + ((2 * ba - 1) * i) / 5, y, bb + 0.6, 0.2, fh - 0.3, 8, K.column, { top: false });
      if (f < 2) {
        // a pent eave over the floor, front and back
        const pent: RoofO = { a: ba + 0.5, b: bb + 1.5, z: -0.4, ra: ba + 0.5, rb: bb + 0.4, y0: y + fh - 0.2, H: 0.7, lift: 0.4, thick: 0.25, color: K.tile, stripe: K.tile2, under: K.templeUnder, fascia: K.gold, fasciaGlow: 1, ns: 1, nt: 10, slopes: 'fb' };
        roof(G, pent);
      }
    }
    for (let i = 0; i < 5; i++) lantern(G, -ba + ((i + 0.5) * 2 * ba) / 5, yb + 2 * fh - 0.25, bb + 1.2, 0.75);
    const rf = swallowRoofGeo(top.a * 2, top.b * 2, top.H, { dragons: false, wallX: ba - 0.05, wallBase: yWall - top.y0 - 0.05 });
    addAt(G, rf, 0, top.y0, -0.4);
    // a pagoda on the rear hall's ridge
    pagoda(G, 0, top.y0 + top.H + 0.5 + 0.6, -0.4, 0.38);
    k.mesh(0, vR, 0, G.geometry());
    k.wall(0, vR - 0.4, 0, 2 * ba, 2 * bb, 12);
  }
  m.covers.push(rectRing(r));
  return [k];
}
/** copies the triangles of `src` into `dst`, moved by (x, y, z) */
function addAt(dst: Geo, src: Geo, x: number, y: number, z: number) {
  for (let i = 0; i < src.pos.length; i += 3) dst.pos.push(src.pos[i] + x, src.pos[i + 1] + y, src.pos[i + 2] + z);
  dst.col.push(...src.col);
  dst.glow.push(...src.glow);
}

// ---------------------------------------------------------------------------------------------------------------
// 高雄歷史博物館 (the 1939 City Hall, Imperial Crown style)
// ---------------------------------------------------------------------------------------------------------------
export function historymuseum(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 44, W: 16 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = Math.min(r.L, 48),
    W = Math.min(r.W, 26);
  const hw = L / 2,
    hd = W / 2;
  const fh = 3.9;
  const H = 3 * fh + 0.6; // three storeys
  const fd = Math.min(12, W * 0.55); // the front block's depth
  const fz = hd - 4.2 - fd / 2; // its centre (the porch stands in front)
  const P = parts(k);
  let G = P.next();
  // the front block, the corner pavilions, the rear wings (a U round a courtyard)
  G.box(0, 0, fz, 2 * hw - 1, 0.6, fd + 1, K.creamDark);
  G.box(0, 0.6, fz, 2 * hw - 2, H - 0.6, fd, K.cream);
  const pw = Math.min(7, L * 0.16);
  for (const s of [-1, 1]) {
    const x = s * (hw - 1 - pw / 2);
    G.box(x, 0, fz + 0.4, pw, H + 1.2, fd + 0.8, K.cream);
    // rear wing
    const wz0 = -hd + 0.6,
      wz1 = fz - fd / 2;
    if (wz1 - wz0 > 3) G.box(x, 0, (wz0 + wz1) / 2, pw - 1, H, wz1 - wz0, K.cream);
    // a low tiled hip roof on each pavilion
    const pr: RoofO = { x, z: fz + 0.4, a: pw / 2 + 0.7, b: fd / 2 + 1.1, ra: 0, rb: Math.max(0.5, fd / 2 - pw / 2), y0: H + 1.2, H: 2.4, lift: 0.4, thick: 0.3, color: K.roofGreen, stripe: K.roofGreen2, under: K.creamDark, fascia: K.roofGreen, ns: 2, nt: 8 };
    roof(G, pr);
  }
  // the tiled eave (a slanted band of tiles) round the top of the long block: the Japanese roof line on a Western body
  const band: RoofO = { z: fz, a: hw - 1 - pw + 0.2, b: fd / 2 + 0.9, ra: hw - 1 - pw + 0.2, rb: fd / 2 - 0.2, y0: H - 0.5, H: 0.9, lift: 0, thick: 0.25, color: K.roofGreen, stripe: K.roofGreen2, under: K.creamDark, fascia: K.roofGreen, ns: 1, nt: 10, slopes: 'fb' };
  roof(G, band);
  G.box(0, H - 0.1, fz, 2 * (hw - 1 - pw) + 0.4, 0.8, fd - 0.2, K.creamDark);
  // windows: tall vertical windows by floor, front and back; the pavilions get pairs
  for (let f = 0; f < 3; f++) {
    const y = 0.6 + f * fh + 0.9;
    const span = hw - 1 - pw;
    const n = Math.max(4, Math.floor((2 * span) / 2.4));
    for (let i = 0; i < n; i++) {
      const x = -span + ((i + 0.5) * 2 * span) / n;
      if (Math.abs(x) < 6) continue; // the tower and the porch
      win(G, x, y, fz + fd / 2, 1.1, 2.3, 0, 1, 0.3);
      win(G, x, y, fz - fd / 2, 1.1, 2.3, 0, -1, 0.3);
    }
    for (const s of [-1, 1]) for (const d of [-1, 1]) win(G, s * (hw - 1 - pw / 2) + d * 1.3, y, fz + 0.4 + fd / 2 + 0.4, 1.0, 2.3, 0, 1, 0.3);
  }
  G = P.next();
  // the central tower and its two-tier pagoda roof
  const ts = 9;
  const tH = H + 7.5;
  G.box(0, 0.6, fz, ts, tH - 0.6, ts, K.cream);
  G.box(0, H + 0.4, fz, ts + 0.6, 0.6, ts + 0.6, K.creamDark);
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    // the tall windows of the tower's top storeys
    for (const d of [-1, 0, 1]) win(G, nx * (ts / 2) + nz * d * 2.2, H + 1.6, fz + nz * (ts / 2) - nx * d * 2.2, 1.2, 4.2, nx, nz, 0.6);
  }
  const t1: RoofO = { z: fz, a: ts / 2 + 1.8, b: ts / 2 + 1.8, ra: ts / 2 - 1.3, rb: ts / 2 - 1.3, y0: tH, H: 2.0, lift: 0.7, thick: 0.35, color: K.roofGreen, stripe: K.roofGreen2, under: K.creamDark, fascia: K.roofGreen, ns: 2, nt: 8 };
  roof(G, t1);
  const t2b = ts / 2 - 1.5;
  G.box(0, tH + 1.6, fz, 2 * t2b, 2.4, 2 * t2b, K.cream);
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ])
    G.panel(nx * t2b, tH + 2.1, fz + nz * t2b, 1.6, 1.4, nx, nz, K.lit, 0.8);
  const t2: RoofO = { z: fz, a: t2b + 1.6, b: t2b + 1.6, ra: 0, rb: 0, y0: tH + 4.0, H: 3.6, lift: 0.6, thick: 0.3, color: K.roofGreen, stripe: K.roofGreen2, under: K.creamDark, fascia: K.roofGreen, ns: 4, nt: 8 };
  roof(G, t2);
  G.lathe(0, tH + 7.5, fz, [[0, 0], [0.35, 0.05], [0.2, 0.4], [0.3, 0.6], [0.08, 0.9], [0.05, 2.0], [0, 2.1]], 8, K.bronzeLight);
  G = P.next();
  // the porte-cochère in front of the tower
  const pz0 = fz + fd / 2,
    pz1 = hd - 0.6;
  const pzc = (pz0 + pz1) / 2,
    pd = pz1 - pz0;
  for (const s of [-1, 1]) for (const d of [-1, 1]) G.box(s * 4.2, 0.6, pzc + d * (pd / 2 - 0.5), 0.9, 4.6, 0.9, K.cream, { top: false });
  G.box(0, 5.2, pzc, 9.6, 0.9, pd, K.creamDark, { bottom: true });
  G.box(0, 6.1, pzc + pd / 2 - 0.15, 9.6, 0.6, 0.3, K.cream);
  G.box(0, 0, pzc - pd / 2 + 1.4, 8, 0.5, 2.8, K.creamDark);
  G.panel(0, 0.6, fz + fd / 2, 3.4, 3.6, 0, 1, K.lobby, 0.8);
  P.done();
  k.wall(0, fz, 0, 2 * hw - 2, fd, H);
  for (const s of [-1, 1]) k.wall(s * 4.2, pzc, 0, 0.9, pd, 4);
  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// 原高雄市議會 (1939): a three-storey block, the central tower, arched windows
// ---------------------------------------------------------------------------------------------------------------
export function oldcouncil(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 30, W: 18 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = Math.min(r.L, 40),
    W = Math.min(r.W, 18);
  const hw = L / 2 - 0.5,
    hd = W / 2 - 0.8;
  const fh = 3.8,
    H = 3 * fh + 0.5;
  const P = parts(k);
  let G = P.next();
  G.box(0, 0, 0, 2 * hw + 0.6, 0.5, 2 * hd + 0.6, K.brown);
  G.box(0, 0.5, 0, 2 * hw, H - 0.5, 2 * hd, K.councilWall);
  // horizontal bands between the floors, and the cornice
  for (let f = 1; f < 3; f++) G.box(0, 0.5 + f * fh - 0.15, 0, 2 * hw + 0.2, 0.3, 2 * hd + 0.2, K.creamDark);
  G.box(0, H, 0, 2 * hw + 0.5, 0.5, 2 * hd + 0.5, K.brown);
  G.box(0, H + 0.5, 0, 2 * hw, 0.6, 2 * hd, K.councilWall);
  G = P.next();
  // windows: square below, arched on the top floor; front and back
  const n = Math.max(4, Math.floor((2 * hw) / 2.6));
  for (let f = 0; f < 3; f++)
    for (let i = 0; i < n; i++) {
      const x = -hw + ((i + 0.5) * 2 * hw) / n;
      if (Math.abs(x) < 4.4) continue;
      for (const s of [-1, 1]) win(G, x, 0.5 + f * fh + 0.8, s * hd, 1.2, f === 2 ? 2.5 : 2.1, 0, s, 0.3, f === 2);
    }
  for (const s of [-1, 1]) for (let f = 0; f < 3; f++) for (const d of [-1, 1]) win(G, s * hw, 0.5 + f * fh + 0.8, d * hd * 0.45, 1.2, f === 2 ? 2.5 : 2.1, s, 0, 0.3, f === 2);
  G = P.next();
  // the central tower, slightly forward, with its arched lookout and stepped crown
  const ts = 7.4,
    tz = hd - ts / 2 + 0.8,
    tH = H + 8;
  G.box(0, 0.5, tz, ts, tH - 0.5, ts, K.councilWall);
  // the arched entrance and the arched windows of the tower
  G.arch(0, 0.5, tz + ts / 2, 2.6, 3.6, 0, 1, '#4A3B2E', 0.3, 8);
  for (let f = 1; f < 3; f++) G.arch(0, 0.5 + f * fh + 0.7, tz + ts / 2, 1.4, 2.6, 0, 1, K.lit, 0.8);
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ])
    for (const d of [-1, 1]) G.arch(nx * (ts / 2) + nz * d * 1.3, H + 3.4, tz + nz * (ts / 2) - nx * d * 1.3, 1.3, 3.2, nx, nz, K.win, 0, 6);
  G.box(0, H + 1.8, tz, ts + 0.4, 0.3, ts + 0.4, K.creamDark);
  G.box(0, tH, tz, ts + 0.6, 0.5, ts + 0.6, K.brown);
  G.box(0, tH + 0.5, tz, ts - 1.2, 1.2, ts - 1.2, K.councilWall);
  G.box(0, tH + 1.7, tz, ts - 2.6, 0.9, ts - 2.6, K.creamDark);
  G.cyl(0, tH + 2.6, tz, 0.07, 4, 4, K.white);
  P.done();
  k.wall(0, 0, 0, 2 * hw, 2 * hd, H);
  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// 四維市政中心: two office wings and the taller middle block with its roof frame; lit floors at night
// ---------------------------------------------------------------------------------------------------------------
export function cityhall(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 70, W: 50 }, { keepLong: true });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = r.L,
    W = r.W;
  const P = parts(k);
  let G = P.next();
  // the podium with its glazed lobby
  G.box(0, 0, 0, L, 6, W * 0.86, K.stone, { top: '#9FA39C' });
  G.panel(0, 0.4, W * 0.43, L * 0.6, 4.4, 0, 1, K.lobby, 0.7);
  for (const s of [-1, 1]) G.panel(s * L * 0.4, 0.4, W * 0.43, L * 0.12, 4.4, 0, 1, K.glassDark, 0);
  G = P.next();
  // the wings: floors of strip windows, some lit at night
  const ww = L * 0.34,
    wd = W * 0.7,
    wz = -W * 0.04;
  for (const s of [-1, 1]) {
    const x = s * L * 0.31;
    G.box(x, 6, wz, ww, 26, wd, '#D8D3C6');
    for (let y = 8; y < 31; y += 3.6) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const xi = x - ww / 2 + ((i + 0.5) * ww) / n;
        for (const f of [-1, 1]) {
          const lit = hash(xi + f, y) < 0.45;
          G.panel(xi, y, wz + (f * wd) / 2, ww / n - 0.3, 1.6, 0, f, lit ? K.lit : K.glass, lit ? 0.85 : 0);
        }
      }
      for (const f of [-1, 1]) {
        const lit = hash(x + f * 3, y) < 0.4;
        G.panel(x + (f * ww) / 2, y, wz, wd - 1, 1.6, f, 0, lit ? K.lit : K.glass, lit ? 0.85 : 0);
      }
    }
  }
  G = P.next();
  // the middle block, its glass spine and the roof frame
  const mw = L * 0.3,
    md = W * 0.62;
  G.box(0, 6, 0, mw, 40, md, '#E4DFD2');
  G.panel(0, 8, md / 2, L * 0.12, 37, 0, 1, K.glass, 0);
  for (let y = 9; y < 44; y += 3.6) {
    G.panel(0, y, md / 2, L * 0.1, 1.4, 0, 1, hash(y, 2) < 0.6 ? K.lit : K.glassDark, hash(y, 2) < 0.6 ? 0.9 : 0, 0.1);
    for (const s of [-1, 1]) G.panel(s * mw * 0.32, y, md / 2, mw * 0.22, 1.4, 0, 1, hash(y, s) < 0.4 ? K.lit : K.glass, hash(y, s) < 0.4 ? 0.8 : 0);
    for (const f of [-1, 1]) G.panel(f * (mw / 2), y, 0, md - 2, 1.4, f, 0, hash(y, f + 5) < 0.4 ? K.lit : K.glass, hash(y, f + 5) < 0.4 ? 0.8 : 0);
    G.panel(0, y, -md / 2, mw - 2, 1.4, 0, -1, hash(y, 9) < 0.4 ? K.lit : K.glass, hash(y, 9) < 0.4 ? 0.8 : 0);
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) G.box(a * L * 0.14, 46, b * W * 0.29, 0.8, 5, 0.8, K.white);
  G.box(0, 51, 0, mw, 1, md, K.white, { bottom: true });
  // the entrance canopy
  G.box(0, 5, W * 0.43 + 1.5, 14, 0.5, 3, K.white, { bottom: true });
  // flagpoles in the forecourt
  for (const i of [-1, 0, 1]) G.cyl(i * 4, 0, W * 0.43 + 2, 0.12, 12, 6, K.white);
  P.done();
  k.wall(0, 0, 0, L, W * 0.86, 6);
  for (const s of [-1, 1]) k.wall(s * L * 0.31, wz, 6, ww, wd, 26);
  m.covers.push(rectRing(r));
  return [k];
}

// ---------------------------------------------------------------------------------------------------------------
// 高雄文學館: a small two-storey library, a glass ground floor under a white upper floor with timber louvres
// ---------------------------------------------------------------------------------------------------------------
export function literature(ctx: Ctx, lm: OsmLandmark, m: Model): Kit[] | null {
  const r = place(ctx, lm, { L: 30, W: 18 });
  if (!r) return null;
  const k = new Kit(m.id, r.cx, r.cz, r.ang);
  const L = Math.min(r.L, 40),
    W = Math.min(r.W, 24);
  const hw = L / 2 - 0.6,
    hd = W / 2 - 0.6;
  const P = parts(k);
  let G = P.next();
  G.box(0, 0, 0, 2 * hw + 1, 0.3, 2 * hd + 1, K.paving);
  // the glass ground floor, set back under the upper floor
  G.box(0, 0.3, 0, 2 * hw - 1.6, 4, 2 * hd - 1.6, K.glassDark);
  for (const s of [-1, 1]) {
    G.panel(0, 0.6, s * (hd - 0.8), 2 * hw - 2.4, 3.2, 0, s, K.lobby, 0.75);
    G.panel(s * (hw - 0.8), 0.6, 0, 2 * hd - 2.4, 3.2, s, 0, K.lobby, 0.75);
  }
  G = P.next();
  // corner posts, the white upper floor and its timber louvres
  for (const a of [-1, 1]) for (const b of [-1, 1]) G.box(a * (hw - 0.4), 0.3, b * (hd - 0.4), 0.6, 4.1, 0.6, K.white, { top: false });
  G.box(0, 4.3, 0, 2 * hw, 4.4, 2 * hd, K.white, { bottom: true });
  for (const s of [-1, 1]) {
    G.panel(0, 5.0, s * hd, 2 * hw - 2, 3.0, 0, s, K.win, 0);
    const n = Math.floor((2 * hw - 2) / 0.9);
    for (let i = 0; i <= n; i++) G.box(-hw + 1 + (i * (2 * hw - 2)) / n, 5.0, s * (hd + 0.2), 0.16, 3.0, 0.25, K.wood, { top: false });
    G.panel(s * hw, 5.4, 0, 2 * hd - 3, 2.2, s, 0, K.lobby, 0.6);
  }
  G = P.next();
  // the thin roof slab with its overhang, and a reading terrace's railing
  G.box(0, 8.7, 0, 2 * hw + 1.4, 0.35, 2 * hd + 1.4, K.white, { bottom: true });
  G.box(0, 9.05, -hd * 0.3, 2 * hw - 2, 0.9, 0.08, '#9AA6B1');
  P.done();
  k.wall(0, 0, 0, 2 * hw - 1.6, 2 * hd - 1.6, 8.7);
  m.covers.push(rectRing(r));
  return [k];
}
