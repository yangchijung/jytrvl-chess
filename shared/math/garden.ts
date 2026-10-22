// Math Island batch B — Multiplication Garden (乘法花圃), grade 2 (N-2-6 multiplication as "so many of the same",
// N-2-7 the 10×10 facts without rote memorising, R-2-3 the order of factors). The child pulls out a rectangle of
// flowers from the top-left corner. Following Taiwanese textbooks the equation is written "flowers in each row ×
// number of rows": 3 rows of 4 is 4 × 3. Turning the bed shows 3 × 4 has the same number. Pure and deterministic.
import { choicesAround, readWith, type Read } from './common';

export const GRID = 8;

export type GardenProblem =
  /** plant `rows` rows of `cols` each, then say how many */
  | { id: string; kind: 'make'; cols: number; rows: number; split?: number }
  /** plant `total` flowers in equal rows, `need` different ways */
  | { id: string; kind: 'ways'; total: number; need: number };

/** Five fixed problems; the last splits 7 × 4 into 5 × 4 and 2 × 4 with a fence. */
export const GARDEN_PROBLEMS: readonly GardenProblem[] = [
  { id: 'g2-garden-01', kind: 'make', cols: 4, rows: 3 },
  { id: 'g2-garden-02', kind: 'make', cols: 5, rows: 2 },
  { id: 'g2-garden-03', kind: 'ways', total: 12, need: 2 },
  { id: 'g2-garden-04', kind: 'make', cols: 3, rows: 6 },
  { id: 'g2-garden-05', kind: 'make', cols: 7, rows: 4, split: 5 },
];

export interface GardenSave {
  schemaVersion: 1;
  game: 'garden';
  index: number;
  rows: number;
  cols: number;
  /** "colsxrows" arrangements already accepted in a 'ways' problem */
  found: string[];
  /** the rectangle is right; for 'make' the total still has to be picked */
  planted: boolean;
  solved: boolean;
  done: string[];
  voice: boolean;
}
export const GARDEN_KEY = 'jy.math.garden.v1';

export const blankGarden = (voice = true): GardenSave => ({ schemaVersion: 1, game: 'garden', index: 0, rows: 0, cols: 0, found: [], planted: false, solved: false, done: [], voice });
export const finishedG = (s: GardenSave) => s.index >= GARDEN_PROBLEMS.length;
export const problemOfG = (s: GardenSave): GardenProblem | null => GARDEN_PROBLEMS[s.index] ?? null;
/** "4 × 3" — flowers in each row × rows */
export const expr = (cols: number, rows: number) => `${cols} × ${rows}`;
export const totalOf = (p: GardenProblem) => (p.kind === 'make' ? p.cols * p.rows : p.total);
export const choicesOfG = (p: GardenProblem, index: number) => choicesAround(totalOf(p), index, 1);

/** every rectangle (at least 2 each way) that fits the bed, for a 'ways' problem */
export function waysOf(total: number): string[] {
  const out: string[] = [];
  for (let c = 2; c <= GRID; c++) for (let r = 2; r <= GRID; r++) if (c * r === total) out.push(`${c}x${r}`);
  return out;
}

export type GResult = 'sized' | 'same' | 'locked' | 'ignored' | 'notYet' | 'notPlanted' | 'shape' | 'notEqual' | 'again' | 'found' | 'wrong' | 'right';

/** Pull the rectangle to `rows` × `cols` (0 clears it). */
export function sizeTo(s: GardenSave, rows: number, cols: number): { s: GardenSave; r: GResult } {
  if (!problemOfG(s) || s.solved || s.planted) return { s, r: 'locked' };
  if (!Number.isInteger(rows) || !Number.isInteger(cols)) return { s, r: 'ignored' };
  const r = Math.max(0, Math.min(GRID, rows)),
    c = Math.max(0, Math.min(GRID, cols));
  if (r === s.rows && c === s.cols) return { s, r: 'same' };
  return { s: { ...s, rows: r, cols: c }, r: 'sized' };
}

/** "Plant": check the rectangle against the task. */
export function plant(s: GardenSave): { s: GardenSave; r: GResult } {
  const p = problemOfG(s);
  if (!p || s.solved || s.planted) return { s, r: 'locked' };
  if (s.rows === 0 || s.cols === 0) return { s, r: 'notYet' };
  if (p.kind === 'make') {
    if (s.cols !== p.cols || s.rows !== p.rows) return { s, r: 'shape' };
    return { s: { ...s, planted: true }, r: 'found' };
  }
  if (s.rows * s.cols !== p.total) return { s, r: 'notEqual' };
  if (s.rows < 2 || s.cols < 2) return { s, r: 'notEqual' };
  const key = `${s.cols}x${s.rows}`;
  if (s.found.includes(key)) return { s, r: 'again' };
  const found = [...s.found, key];
  if (found.length >= p.need) return { s: { ...s, found, planted: true, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
  return { s: { ...s, found, rows: 0, cols: 0 }, r: 'found' };
}

/** "How many flowers?" for a 'make' problem, after the rectangle is right. */
export function answerGarden(s: GardenSave, n: number): { s: GardenSave; r: GResult } {
  const p = problemOfG(s);
  if (!p || s.solved || p.kind !== 'make') return { s, r: 'locked' };
  if (!choicesOfG(p, s.index).includes(n)) return { s, r: 'ignored' };
  if (!s.planted) return { s, r: 'notPlanted' };
  if (n !== s.rows * s.cols) return { s, r: 'wrong' };
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
}

export function restartGarden(s: GardenSave): GardenSave {
  const p = problemOfG(s);
  return p ? { ...s, rows: 0, cols: 0, found: [], planted: false, solved: false, done: s.done.filter((d) => d !== p.id) } : s;
}
export function nextGarden(s: GardenSave): GardenSave {
  if (!s.solved || finishedG(s)) return s;
  return { ...s, index: s.index + 1, rows: 0, cols: 0, found: [], planted: false, solved: false };
}
export const playAgainG = (s: GardenSave): GardenSave => blankGarden(s.voice);

export function validGarden(x: unknown): x is GardenSave {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== 1 || s.game !== 'garden' || typeof s.solved !== 'boolean' || typeof s.planted !== 'boolean' || typeof s.voice !== 'boolean') return false;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) > GARDEN_PROBLEMS.length) return false;
  for (const k of ['rows', 'cols'] as const) if (!Number.isInteger(s[k]) || (s[k] as number) < 0 || (s[k] as number) > GRID) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => GARDEN_PROBLEMS.some((p) => p.id === d)) || new Set(s.done).size !== s.done.length) return false;
  if (!Array.isArray(s.found) || !s.found.every((f) => typeof f === 'string') || new Set(s.found).size !== s.found.length) return false;
  const p = GARDEN_PROBLEMS[s.index as number];
  if (!p) return !s.solved && !s.planted;
  if (p.kind === 'make') {
    if (s.found.length) return false;
    if (s.planted && (s.cols !== p.cols || s.rows !== p.rows)) return false;
    if (s.solved && !s.planted) return false;
  } else {
    const ok = waysOf(p.total);
    if (!s.found.every((f) => ok.includes(f as string))) return false;
    if (s.solved !== s.found.length >= p.need || s.planted !== s.solved) return false;
  }
  return true;
}
export const readGarden = (get: () => string | null): Read<GardenSave> => readWith(get, validGarden);
