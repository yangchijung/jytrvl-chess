import { describe, expect, it } from 'vitest';
import {
  COLOR_COUNT,
  COLOR_DIST,
  TERRITORY_COLORS,
  assignColors,
  autoColor,
  isColor,
  nearestFree,
  parseColor,
  resolveColor,
  trColor,
} from '../shared/territory/colors';
import { MAX_PLAYERS } from '../shared/territory/engine';

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const BOARD_LIGHT = '#fffdf8';
const BOARD_DARK = '#1a2333';

describe('territory palette', () => {
  it('has 9 unique, named colours — more than the 8-player maximum', () => {
    expect(COLOR_COUNT).toBe(9);
    expect(COLOR_COUNT).toBeGreaterThan(MAX_PLAYERS);
    expect(new Set(TERRITORY_COLORS.map((c) => c.id)).size).toBe(COLOR_COUNT);
    expect(new Set(TERRITORY_COLORS.map((c) => c.base)).size).toBe(COLOR_COUNT);
    for (const c of TERRITORY_COLORS) {
      expect(c.zh.length).toBeGreaterThan(1);
      expect(c.en.length).toBeGreaterThan(2);
      for (const h of [c.base, c.land, c.landDk, c.dark, c.ink]) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('meets contrast for what is drawn on and around each colour', () => {
    for (const c of TERRITORY_COLORS) {
      // check mark / text on the swatch (graphics ≥ 3:1)
      expect(contrast(c.ink, c.base), `${c.id} ink`).toBeGreaterThanOrEqual(3.8);
      // outlines (land edge, trail edge, swatch border) on the light board and on the colour's own light land
      expect(contrast(c.dark, BOARD_LIGHT), `${c.id} dark/light board`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.dark, c.land), `${c.id} dark/land`).toBeGreaterThanOrEqual(3.5);
      // heads, trails and land edges on the dark board
      expect(contrast(c.base, BOARD_DARK), `${c.id} base/dark board`).toBeGreaterThanOrEqual(3);
      // fills are visibly different from the board
      expect(contrast(c.landDk, BOARD_DARK), `${c.id} landDk`).toBeGreaterThan(2);
    }
  });

  it('every pair of colours stays apart even for deutan/protan viewers', () => {
    for (let i = 0; i < COLOR_COUNT; i++) {
      expect(COLOR_DIST[i][i]).toBe(0);
      for (let j = 0; j < COLOR_COUNT; j++) if (i !== j) expect(COLOR_DIST[i][j]).toBeGreaterThan(3);
    }
    // spread in lightness, not only hue: the lightest and darkest bases are ≥ 3:1 apart
    const byLum = [...TERRITORY_COLORS].sort((a, b) => lum(a.base) - lum(b.base));
    expect(contrast(byLum[0].base, byLum.at(-1)!.base)).toBeGreaterThanOrEqual(3);
  });
});

describe('colour assignment', () => {
  it('validates and parses colours', () => {
    expect(isColor(0)).toBe(true);
    expect(isColor(8)).toBe(true);
    for (const v of [9, -1, 1.5, NaN, '3', null, undefined]) expect(isColor(v)).toBe(false);
    expect(parseColor('3')).toBe(3);
    for (const v of ['9', '-1', '1e1', 'x', '', null, undefined, '03x']) expect(parseColor(v as string)).toBeNull();
    expect(trColor(11).id).toBe(TERRITORY_COLORS[2].id); // old/odd values wrap instead of crashing
  });

  it('nearest free colour walks the hue order up first, then down', () => {
    expect(nearestFree(3, [])).toBe(3);
    expect(nearestFree(3, [3])).toBe(4);
    expect(nearestFree(3, [3, 4])).toBe(2);
    expect(nearestFree(8, [8])).toBe(0); // wraps
  });

  it('first come keeps its colour; a later clash gets the nearest free one', () => {
    expect(assignColors([5, 5])).toEqual([5, 6]);
    expect(assignColors([5, 5, 5])).toEqual([5, 6, 4]);
    expect(resolveColor(2, [2])).toBe(3);
    expect(resolveColor(2, [7])).toBe(2);
  });

  it('players without a request (bots, old clients) never duplicate and avoid requested colours', () => {
    const r = assignColors([0, null, null, null, null, null, null, null]);
    expect(r[0]).toBe(0);
    expect(new Set(r).size).toBe(8);
    // a bot listed before a human still leaves the human's request alone
    expect(assignColors([null, 4])[1]).toBe(4);
    // old clients only: still unique, deterministic
    const old = assignColors(Array(8).fill(undefined));
    expect(new Set(old).size).toBe(8);
    expect(assignColors(Array(8).fill(undefined))).toEqual(old);
    // invalid values are treated as "no request"
    expect(new Set(assignColors([42, -1, 'red', 2.5])).size).toBe(4);
  });

  it('automatic colours look as different as possible from the colours in use', () => {
    for (let me = 0; me < COLOR_COUNT; me++) {
      const bot = autoColor([me]);
      expect(bot).not.toBe(me);
      const best = Math.max(...COLOR_DIST[me].filter((_, k) => k !== me));
      expect(COLOR_DIST[me][bot]).toBe(best);
    }
  });

  it('valid unique requests are never changed', () => {
    for (let k = 0; k < 50; k++) {
      const req = [...Array(COLOR_COUNT).keys()].sort(() => Math.random() - 0.5).slice(0, 8);
      expect(assignColors(req)).toEqual(req);
    }
  });
});
