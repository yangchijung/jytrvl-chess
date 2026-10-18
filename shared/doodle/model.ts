// Color Doodle — pure model (docs/product/DOODLE_COLOR_LAB_V1.md). Paint mixing is a fixed, explicit table
// (simplified RYB teaching model); colours are never averaged. Drawings are replayable operation lists.
import data from './lessons.json';

export type ColorId = 'red' | 'yellow' | 'blue' | 'white' | 'orange' | 'green' | 'purple' | 'light_blue';
export type Mark = 'circle' | 'triangle' | 'square' | 'cross' | 'diamond' | 'leaf' | 'star' | 'square-outline';
export type Shape = 'circle' | 'triangle' | 'square';
export type Size = 's' | 'm' | 'l';
export interface ColorDef {
  id: ColorId;
  hex: string;
  name: { zh: string; en: string };
  mark: Mark;
}
export interface Recipe {
  id: string;
  inputs: [ColorId, ColorId];
  output: ColorId;
}
export interface Lesson {
  id: string;
  level: 'easy' | 'more';
  prompt: { zh: string; en: string };
  recipe?: string;
  choices: string[];
  correct?: string;
  classification?: { warm: ColorId[]; cool: ColorId[] };
  applyPrompt: { zh: string; en: string };
  success: { zh: string; en: string };
  complete: {
    recipe?: string;
    appliedColor?: ColorId;
    appliedColors?: ColorId[];
    minimumMarks?: number;
    minimumMarksEach?: number;
    classifyCorrectly?: boolean;
    chosen?: string;
  };
}

export const COLORS = data.colors as ColorDef[];
export const RECIPES = data.recipes.map((r) => ({ id: r.id, inputs: r.inputs as [ColorId, ColorId], output: r.output as ColorId })) as Recipe[];
export const LESSONS = data.lessons as unknown as Lesson[];
export const WHEEL = data.wheel as ColorId[];
export const COPY = data.copy as Record<string, { zh: string; en: string }>;
export const BASE_COLORS: ColorId[] = ['red', 'yellow', 'blue', 'white'];
export const colorOf = (id: ColorId) => COLORS.find((c) => c.id === id)!;

/** Fixed recipe lookup, order-independent. Unsupported pairs return null (never an invented colour). */
export function mix(a: ColorId, b: ColorId): Recipe | null {
  return RECIPES.find((r) => (r.inputs[0] === a && r.inputs[1] === b) || (r.inputs[0] === b && r.inputs[1] === a)) ?? null;
}

// ------------------------------------------------------------------ drawings
/** Points are normalised to the paper (0..1 on both axes; the paper keeps a fixed 4:3 ratio). */
export type FreeOp =
  | { t: 'stroke'; color: ColorId; size: Size; erase?: boolean; pts: [number, number][] }
  | { t: 'stamp'; color: ColorId; shape: Shape; size: Size; x: number; y: number }
  | { t: 'clear' };
export interface Cell {
  color: ColorId;
  shape: Shape;
}
export type GridOp = { t: 'cell'; i: number; value: Cell | null } | { t: 'clear' };

/** Undo history: ops[0..n) are applied, ops[n..] can be redone. A new op drops the redo branch. */
export interface History<Op> {
  ops: Op[];
  n: number;
}
export const empty = <Op>(): History<Op> => ({ ops: [], n: 0 });
export const push = <Op>(h: History<Op>, op: Op): History<Op> => ({ ops: [...h.ops.slice(0, h.n), op], n: h.n + 1 });
export const undo = <Op>(h: History<Op>): History<Op> => ({ ...h, n: Math.max(0, h.n - 1) });
export const redo = <Op>(h: History<Op>): History<Op> => ({ ...h, n: Math.min(h.ops.length, h.n + 1) });
export const canUndo = <Op>(h: History<Op>) => h.n > 0;
export const canRedo = <Op>(h: History<Op>) => h.n < h.ops.length;

/** Free-drawing ops still visible (everything after the last applied clear). */
export function visibleFree(h: History<FreeOp>): FreeOp[] {
  const applied = h.ops.slice(0, h.n);
  const last = applied.map((o) => o.t).lastIndexOf('clear');
  return applied.slice(last + 1);
}
export function gridCells(h: History<GridOp>): (Cell | null)[] {
  const cells: (Cell | null)[] = Array(9).fill(null);
  for (const op of h.ops.slice(0, h.n)) {
    if (op.t === 'clear') cells.fill(null);
    else cells[op.i] = op.value;
  }
  return cells;
}

// ------------------------------------------------------------------ lessons
/** What happened while a lesson was open. A mark = a committed stroke or stamp (never judged for quality). */
export interface LessonRun {
  lessonId: string;
  guess: string | null; // prediction (optional in easy mode)
  mixed: string[]; // recipe ids mixed
  chosen: string | null; // answer for choice-only lessons (L05 warm pick, L06 opposite)
  marks: Partial<Record<ColorId, number>>;
}
export const newRun = (lessonId: string): LessonRun => ({ lessonId, guess: null, mixed: [], chosen: null, marks: {} });

export type Step = 'predict' | 'mix' | 'choose' | 'apply' | 'done';
/** The next thing to do in a lesson (prediction is optional in easy mode; a wrong guess never blocks). */
export function lessonStep(l: Lesson, run: LessonRun, level: 'easy' | 'more'): Step {
  const c = l.complete;
  if (l.recipe) {
    if (level === 'more' && !run.guess && !run.mixed.includes(l.recipe)) return 'predict';
    if (!run.mixed.includes(l.recipe)) return 'mix';
  } else if (run.chosen === null || (c.classifyCorrectly && !isCorrectChoice(l, run.chosen)) || (c.chosen && run.chosen !== c.chosen)) return 'choose';
  const need = c.appliedColors ?? (c.appliedColor ? [c.appliedColor] : []);
  const min = c.minimumMarksEach ?? c.minimumMarks ?? 1;
  if (!need.every((col) => (run.marks[col] ?? 0) >= min)) return 'apply';
  return 'done';
}
export function isCorrectChoice(l: Lesson, choice: string): boolean {
  if (l.classification) return l.classification.warm.includes(choice as ColorId); // "pick the warm colour"
  return choice === l.correct;
}

// ------------------------------------------------------------------ saving
export const SCHEMA = 1;
export interface Saved {
  schemaVersion: 1;
  free: History<FreeOp>;
  grid: History<GridOp>;
  done: string[]; // completed lesson ids
  level: 'easy' | 'more';
  mixedColors: ColorId[]; // mixed results appear in the palette
}
export const blankSave = (): Saved => ({ schemaVersion: 1, free: empty(), grid: empty(), done: [], level: 'easy', mixedColors: [] });

const isColor = (x: unknown): x is ColorId => COLORS.some((c) => c.id === x);
const num01 = (x: unknown) => typeof x === 'number' && x >= -0.05 && x <= 1.05;
const isSize = (x: unknown) => x === 's' || x === 'm' || x === 'l';
const isShape = (x: unknown) => x === 'circle' || x === 'triangle' || x === 'square';
function validFreeOp(o: FreeOp): boolean {
  if (!o || typeof o !== 'object') return false;
  if (o.t === 'clear') return true;
  if (o.t === 'stroke') return isColor(o.color) && isSize(o.size) && Array.isArray(o.pts) && o.pts.length > 0 && o.pts.length < 5000 && o.pts.every((p) => Array.isArray(p) && num01(p[0]) && num01(p[1]));
  if (o.t === 'stamp') return isColor(o.color) && isShape(o.shape) && isSize(o.size) && num01(o.x) && num01(o.y);
  return false;
}
function validGridOp(o: GridOp): boolean {
  if (!o || typeof o !== 'object') return false;
  if (o.t === 'clear') return true;
  return o.t === 'cell' && Number.isInteger(o.i) && o.i >= 0 && o.i < 9 && (o.value === null || (isColor(o.value?.color) && isShape(o.value?.shape)));
}
const validHistory = <Op>(h: History<Op>, ok: (o: Op) => boolean) => !!h && Array.isArray(h.ops) && h.ops.length <= 2000 && Number.isInteger(h.n) && h.n >= 0 && h.n <= h.ops.length && h.ops.every(ok);

/** Strict check of a stored drawing; anything unexpected is rejected (the caller keeps a backup, never overwrites silently). */
export function validSave(x: unknown): x is Saved {
  const s = x as Saved;
  return (
    !!s &&
    s.schemaVersion === SCHEMA &&
    validHistory(s.free, validFreeOp) &&
    validHistory(s.grid, validGridOp) &&
    Array.isArray(s.done) &&
    s.done.every((d) => LESSONS.some((l) => l.id === d)) &&
    (s.level === 'easy' || s.level === 'more') &&
    Array.isArray(s.mixedColors) &&
    s.mixedColors.every(isColor)
  );
}
