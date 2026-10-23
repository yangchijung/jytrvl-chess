// Territory Rush player colours (shared by the browser and the TerritoryRoom / TerritoryLobby Durable Objects).
//
// A player's colour is an index into TERRITORY_COLORS. The list is ordered by hue, so "nearest" (used when two
// players ask for the same colour) means the neighbouring hue. Each colour has:
//   base   – runner head, trail core, minimap, swatch
//   land   – territory fill on the light board
//   landDk – territory fill on the dark board
//   dark   – outlines (land edge and trail edge on the light board, eye pupils, swatch border)
//   ink    – check mark / text drawn on top of `base` (navy or white, whichever contrasts more)
// Contrast is checked in tests/territory-colors.test.ts.

export interface TerritoryColor {
  id: string;
  zh: string;
  en: string;
  base: string;
  land: string;
  landDk: string;
  dark: string;
  ink: string;
}

export const TERRITORY_COLORS: readonly TerritoryColor[] = [
  { id: 'tomato', zh: '番茄紅', en: 'Tomato red', base: '#e8322b', land: '#ffb2ab', landDk: '#a02d2e', dark: '#a3150f', ink: '#ffffff' },
  { id: 'tangerine', zh: '橘子橘', en: 'Tangerine', base: '#ff7d0f', land: '#ffcb94', landDk: '#af5e1c', dark: '#a84c00', ink: '#1b2a41' },
  { id: 'sunflower', zh: '向日葵黃', en: 'Sunflower yellow', base: '#ffcc00', land: '#ffe98a', landDk: '#af9112', dark: '#8a6a00', ink: '#1b2a41' },
  { id: 'lime', zh: '萊姆綠', en: 'Lime green', base: '#7dd321', land: '#cbf29d', landDk: '#5a9527', dark: '#3f7a08', ink: '#1b2a41' },
  { id: 'emerald', zh: '翡翠綠', en: 'Emerald', base: '#00b36b', land: '#8fe6c2', landDk: '#098157', dark: '#006b40', ink: '#1b2a41' },
  { id: 'sky', zh: '天空藍', en: 'Sky blue', base: '#14b4eb', land: '#a3e4fb', landDk: '#1681ab', dark: '#0a6b94', ink: '#1b2a41' },
  { id: 'royal', zh: '寶石藍', en: 'Royal blue', base: '#3d63ff', land: '#b3c3ff', landDk: '#314db8', dark: '#1f37b0', ink: '#ffffff' },
  { id: 'violet', zh: '紫羅蘭', en: 'Violet', base: '#9447ff', land: '#d6bdff', landDk: '#693ab8', dark: '#5b1fbf', ink: '#ffffff' },
  { id: 'pink', zh: '桃紅', en: 'Hot pink', base: '#f2298f', land: '#ffaed6', landDk: '#a6276f', dark: '#a3125c', ink: '#ffffff' },
];

export const COLOR_COUNT = TERRITORY_COLORS.length;

/** Colour given to the first seat that did not ask for one (the old seat-0 colour was green). */
export const FIRST_AUTO_COLOR = 4;

export function isColor(c: unknown): c is number {
  return typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < COLOR_COUNT;
}

/** Parse a colour from a query string / header value; anything else is null (server assigns one). */
export function parseColor(v: string | null | undefined): number | null {
  if (v === null || v === undefined || !/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return isColor(n) ? n : null;
}

/** Palette entry for any stored colour value (out-of-range values from old data wrap instead of crashing). */
export function trColor(c: number): TerritoryColor {
  const n = Number.isFinite(c) ? Math.abs(Math.trunc(c)) % COLOR_COUNT : 0;
  return TERRITORY_COLORS[n];
}

// ---------- perceptual distance (CIELAB ΔE76, worst case over normal, deutan and protan vision) ----------
const CVD: (number[][] | null)[] = [
  null,
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ], // deuteranopia (Machado 2009, severity 1)
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ], // protanopia
];
function toLab(hex: string, m: number[][] | null): number[] {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const v = m ? m.map((r) => Math.min(1, Math.max(0, r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2]))) : lin;
  const X = (0.4124 * v[0] + 0.3576 * v[1] + 0.1805 * v[2]) / 0.95047;
  const Y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  const Z = (0.0193 * v[0] + 0.1192 * v[1] + 0.9505 * v[2]) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
/** DIST[i][j]: how far apart colours i and j look for the viewer who sees them closest. */
export const COLOR_DIST: readonly (readonly number[])[] = TERRITORY_COLORS.map((a) =>
  TERRITORY_COLORS.map((b) => Math.min(...CVD.map((m) => Math.hypot(...toLab(a.base, m).map((x, k) => x - toLab(b.base, m)[k]))))),
);

/** The free colour closest in hue order to `want` (one step up first, then one step down, …). */
export function nearestFree(want: number, taken: Iterable<number>): number {
  const used = new Set(taken);
  for (let d = 0; d < COLOR_COUNT; d++) {
    for (const c of d === 0 ? [want] : [want + d, want - d]) {
      const k = ((c % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
      if (!used.has(k)) return k;
    }
  }
  return ((want % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT; // more players than colours (cannot happen: max 8)
}

/** A colour for a seat that did not ask: the free one that looks most different from every colour in use. */
export function autoColor(taken: Iterable<number>): number {
  const used = [...new Set(taken)].filter(isColor);
  if (!used.length) return FIRST_AUTO_COLOR;
  let best = -1,
    bestScore = -1;
  for (let c = 0; c < COLOR_COUNT; c++) {
    if (used.includes(c)) continue;
    const score = Math.min(...used.map((u) => COLOR_DIST[c][u]));
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best < 0 ? nearestFree(FIRST_AUTO_COLOR, used) : best;
}

/** One seat's colour given the colours already held by earlier seats: keep a free valid request, move a clashing
 *  request to the nearest free colour, and give seats without a (valid) request an automatic colour. */
export function resolveColor(request: unknown, taken: Iterable<number>): number {
  const used = [...taken];
  if (!isColor(request)) return autoColor(used);
  return used.includes(request) ? nearestFree(request, used) : request;
}

/** Fresh colours for seats in join order. Seats that asked are resolved first, in order (first come keeps its
 *  colour, a later clash gets the nearest free one); seats without a request (bots, old clients) then take the
 *  remaining colours that look most different. Valid, unique requests are never changed. */
export function assignColors(requests: readonly unknown[]): number[] {
  const out: (number | null)[] = requests.map(() => null);
  const used: number[] = [];
  requests.forEach((r, k) => {
    if (!isColor(r)) return;
    out[k] = resolveColor(r, used);
    used.push(out[k]!);
  });
  requests.forEach((_, k) => {
    if (out[k] !== null) return;
    out[k] = autoColor(used);
    used.push(out[k]!);
  });
  return out as number[];
}
