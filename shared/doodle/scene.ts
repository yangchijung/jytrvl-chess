// Color Doodle — picture play ("玩圖畫", B1 "我的小魚"). A scene is an original line drawing split into a few
// large regions that are filled with one tap. Saved under its own versioned key, never inside the old
// free/grid save (docs/product/DOODLE_PLAYFUL_V1_1.md §5).
import { COLORS, MAX_OPS, empty, push, type ColorId, type History } from './model';

export const SCENE_KEY = 'jy.doodle.scene.v1';
export const SCENE_IDS = ['fish'] as const;
export type SceneId = (typeof SCENE_IDS)[number];
export const FISH_REGIONS = ['body', 'tail', 'fin'] as const;
export type Region = (typeof FISH_REGIONS)[number];

export type SceneOp = { t: 'fill'; region: Region; color: ColorId | null } | { t: 'clear' };

export interface SceneSave {
  schemaVersion: 1;
  sceneId: SceneId;
  /** picture play was the open view when the page was left (the old save keeps its own free/grid choice) */
  open: boolean;
  fills: History<SceneOp>;
  /** the mixing task for this scene: orange was mixed here (recipe mix_orange) */
  mixedOrange: boolean;
  /** the task was completed once (kept even if the child later changes colours) */
  done: boolean;
}
export const blankScene = (): SceneSave => ({ schemaVersion: 1, sceneId: 'fish', open: false, fills: empty<SceneOp>(), mixedOrange: false, done: false });

/** Current colour of every region (after the last applied "new picture"). */
export function regionColors(h: History<SceneOp>): Record<Region, ColorId | null> {
  const out: Record<Region, ColorId | null> = { body: null, tail: null, fin: null };
  for (const op of h.ops.slice(0, h.n)) {
    if (op.t === 'clear') for (const r of FISH_REGIONS) out[r] = null;
    else out[op.region] = op.color;
  }
  return out;
}
export const anyFilled = (h: History<SceneOp>) => Object.values(regionColors(h)).some(Boolean);
/** Task rule: orange was mixed in this scene and orange is on at least one region. */
export const taskMet = (s: Pick<SceneSave, 'mixedOrange' | 'fills'>) => s.mixedOrange && Object.values(regionColors(s.fills)).includes('orange');

/** Adds a fill without exceeding MAX_OPS: a full history folds into the current colours (the picture is unchanged). */
export function pushScene(h: History<SceneOp>, op: SceneOp): History<SceneOp> {
  let base = { ops: h.ops.slice(0, h.n), n: h.n };
  if (base.n + 1 > MAX_OPS) {
    const cur = regionColors(base);
    const ops: SceneOp[] = FISH_REGIONS.flatMap((region) => (cur[region] ? [{ t: 'fill' as const, region, color: cur[region] }] : []));
    base = { ops, n: ops.length };
  }
  return push(base, op);
}

const isColor = (x: unknown): x is ColorId => COLORS.some((c) => c.id === x);
const isRegion = (x: unknown): x is Region => (FISH_REGIONS as readonly unknown[]).includes(x);
const validOp = (o: SceneOp) => !!o && (o.t === 'clear' || (o.t === 'fill' && isRegion(o.region) && (o.color === null || isColor(o.color))));

export function validScene(x: unknown): x is SceneSave {
  const s = x as SceneSave;
  const h = s?.fills;
  return (
    !!s &&
    s.schemaVersion === 1 &&
    (SCENE_IDS as readonly unknown[]).includes(s.sceneId) &&
    typeof s.open === 'boolean' &&
    typeof s.mixedOrange === 'boolean' &&
    typeof s.done === 'boolean' &&
    !!h &&
    Array.isArray(h.ops) &&
    h.ops.length <= MAX_OPS &&
    Number.isInteger(h.n) &&
    h.n >= 0 &&
    h.n <= h.ops.length &&
    h.ops.every(validOp)
  );
}

export type SceneRead = { kind: 'ok'; save: SceneSave } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };
export function readScene(get: () => string | null): SceneRead {
  let raw: string | null;
  try {
    raw = get();
  } catch {
    return { kind: 'noStorage' };
  }
  if (raw === null) return { kind: 'empty' };
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { kind: 'broken', raw, cause: 'json' };
  }
  return validScene(x) ? { kind: 'ok', save: x } : { kind: 'broken', raw, cause: 'schema' };
}

/**
 * Original fish line art (drawn for JY Games, 2026-10-19; no external assets). viewBox 0 0 400 300.
 * Tail and back fin are drawn first so the body overlaps their roots.
 */
export const FISH_ART = {
  viewBox: { w: 400, h: 300 },
  tail: 'M268 150 C300 118 330 92 368 78 C356 116 354 184 368 222 C330 208 300 182 268 150 Z',
  body: 'M44 150 C70 84 150 58 220 70 C262 78 292 110 300 150 C292 190 262 222 220 230 C150 242 70 216 44 150 Z',
  fin: 'M128 84 C150 34 214 24 256 64 C238 70 214 74 200 80 C176 76 150 78 128 84 Z',
  eye: { cx: 96, cy: 132, r: 11 },
  mouth: 'M50 160 C58 164 66 164 72 160',
  tailPivot: { x: 280, y: 150 },
};
