// Color Doodle V2 save (docs/product/DOODLE_WORKBENCH_V2.md §5). One document under its own key holds the free
// paper, the stamp grid, every picture-play scene (each with its own undo history) and the 29-colour palette
// state. The V1 keys (jy.doodle.v1, jy.doodle.scene.v1) are only ever read, once, to import the first time V2 is
// empty; their text is never changed, and nothing in V2 format is ever written back to them.
import {
  COLORS,
  LESSONS,
  MAX_OPS,
  empty,
  isColorId,
  validFreeOp,
  validGridOp,
  validHistory,
  validRun,
  type ColorId,
  type FreeOp,
  type GridOp,
  type History,
  type LessonRun,
  type Saved,
} from './model';
import { SCENE_REGIONS, type SceneOp, type SceneSave } from './scene';

export const V2_KEY = 'jy.doodle.v2';
export const RECENT_MAX = 5;

export interface SceneWork {
  fills: History<SceneOp>;
  /** the scene's mixing task (fish: orange was mixed here) */
  mixedOrange: boolean;
  done: boolean;
}
export type View = 'free' | 'grid' | 'scene';
export interface SavedV2 {
  schemaVersion: 2;
  free: History<FreeOp>;
  grid: History<GridOp>;
  done: string[];
  level: 'easy' | 'more';
  /** colours the child has mixed (shown under 我的顏色) */
  mixedColors: ColorId[];
  /** last colours painted with, newest first (at most RECENT_MAX) */
  recent: ColorId[];
  /** short mixing quests completed: 'pink' (red+white), 'pale_pink' (pink+white), 'use' (a mixed colour used) */
  quests: string[];
  view: View;
  sceneId: string;
  scenes: Record<string, SceneWork>;
  active: LessonRun | null;
  /** where this document came from the first time (kept for support; never re-imported) */
  origin: 'new' | 'v1';
}

export const blankWork = (): SceneWork => ({ fills: empty<SceneOp>(), mixedOrange: false, done: false });
export function blankV2(): SavedV2 {
  return { schemaVersion: 2, free: empty(), grid: empty(), done: [], level: 'easy', mixedColors: [], recent: [], quests: [], view: 'free', sceneId: 'fish', scenes: { fish: blankWork() }, active: null, origin: 'new' };
}

/**
 * The first V2 document, built from whatever valid V1 data exists (drawing + grid + tasks, and the fish).
 * Nothing is copied from an unreadable V1 save: it simply stays where it is.
 */
export function fromV1(main: Saved | null, scene: SceneSave | null): SavedV2 {
  const b = blankV2();
  if (!main && !scene) return b;
  return {
    ...b,
    origin: 'v1',
    ...(main
      ? {
          free: main.free,
          grid: main.grid,
          done: main.done,
          level: main.level,
          mixedColors: main.mixedColors,
          active: main.active ?? null,
          view: (main.surface ?? 'free') as View,
        }
      : {}),
    ...(scene ? { scenes: { fish: { fills: scene.fills, mixedOrange: scene.mixedOrange, done: scene.done } }, ...(scene.open ? { view: 'scene' as View } : {}) } : {}),
  };
}

function validWork(w: SceneWork, regions: readonly string[]): boolean {
  return (
    !!w &&
    typeof w.mixedOrange === 'boolean' &&
    typeof w.done === 'boolean' &&
    validHistory(w.fills, (o: SceneOp) => !!o && (o.t === 'clear' || (o.t === 'fill' && regions.includes(o.region) && (o.color === null || isColorId(o.color)))))
  );
}

export function validV2(x: unknown): x is SavedV2 {
  const s = x as SavedV2;
  if (!s || typeof s !== 'object' || s.schemaVersion !== 2) return false;
  if (!validHistory(s.free, (o: FreeOp) => validFreeOp(o, isColorId)) || !validHistory(s.grid, (o: GridOp) => validGridOp(o, isColorId))) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => LESSONS.some((l) => l.id === d))) return false;
  if (s.level !== 'easy' && s.level !== 'more') return false;
  if (!Array.isArray(s.mixedColors) || !s.mixedColors.every(isColorId)) return false;
  if (!Array.isArray(s.recent) || s.recent.length > RECENT_MAX || !s.recent.every(isColorId)) return false;
  if (!Array.isArray(s.quests) || !s.quests.every((q) => q === 'pink' || q === 'pale_pink' || q === 'use')) return false;
  if (s.view !== 'free' && s.view !== 'grid' && s.view !== 'scene') return false;
  if (typeof s.sceneId !== 'string' || !(s.sceneId in SCENE_REGIONS)) return false;
  if (!s.scenes || typeof s.scenes !== 'object') return false;
  for (const [id, w] of Object.entries(s.scenes)) if (!(id in SCENE_REGIONS) || !validWork(w, SCENE_REGIONS[id])) return false;
  if (!(s.active === null || validRun(s.active, isColorId))) return false;
  return s.origin === 'new' || s.origin === 'v1';
}

export type ReadV2 = { kind: 'ok'; save: SavedV2 } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };
export function readV2(get: () => string | null): ReadV2 {
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
  return validV2(x) ? { kind: 'ok', save: x } : { kind: 'broken', raw, cause: 'schema' };
}

/** Work for a scene (a scene opened for the first time starts empty). */
export const workOf = (s: SavedV2, id: string): SceneWork => s.scenes[id] ?? blankWork();
export const withWork = (s: SavedV2, id: string, w: SceneWork): SavedV2 => ({ ...s, scenes: { ...s.scenes, [id]: w } });
/** Paint with a colour: it moves to the front of the recent list. */
export const useRecent = (s: SavedV2, c: ColorId): SavedV2 => (s.recent[0] === c ? s : { ...s, recent: [c, ...s.recent.filter((x) => x !== c)].slice(0, RECENT_MAX) });
export const addMixed = (s: SavedV2, c: ColorId): SavedV2 => (s.mixedColors.includes(c) ? s : { ...s, mixedColors: [...s.mixedColors, c] });
export const addQuest = (s: SavedV2, q: 'pink' | 'pale_pink' | 'use'): SavedV2 => (s.quests.includes(q) ? s : { ...s, quests: [...s.quests, q] });
export { COLORS, MAX_OPS };
