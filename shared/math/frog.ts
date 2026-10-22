// Math Island batch B — Number-Line Frog (數線青蛙), grade 3 (N-3-11 whole numbers on a number line, starting at
// 0, no negatives). "Start at 30, jump right 4 times, 10 each time": the child picks the lily pad where the frog
// lands. A wrong pick is answered by how many jumps that pad would take (or that it cannot be reached), which
// targets the classic slip of counting tick marks instead of jumps. Pure and deterministic.
import { readWith, type Read } from './common';

export interface FrogProblem {
  id: string;
  /** the line runs from 0 to max, with a tick every `tick` */
  max: number;
  tick: number;
  /** ticks that show their number (others are blank) */
  labels: number[];
  start: number;
  /** jump size: positive = to the right, negative = to the left */
  jump: number;
  times: number;
}

const every = (max: number, by: number) => Array.from({ length: max / by + 1 }, (_, k) => k * by);
/** Five fixed problems: ticks of 1, then 10, then 100, then a line with only its ends labelled. */
export const FROG_PROBLEMS: readonly FrogProblem[] = [
  { id: 'g3-frog-01', max: 20, tick: 1, labels: every(20, 5), start: 3, jump: 2, times: 4 },
  { id: 'g3-frog-02', max: 20, tick: 1, labels: every(20, 5), start: 15, jump: -3, times: 3 },
  { id: 'g3-frog-03', max: 100, tick: 10, labels: every(100, 50), start: 30, jump: 10, times: 4 },
  { id: 'g3-frog-04', max: 1000, tick: 100, labels: [0, 500, 1000], start: 200, jump: 200, times: 3 },
  { id: 'g3-frog-05', max: 100, tick: 10, labels: [0, 100], start: 0, jump: 20, times: 3 },
];

export interface FrogSave {
  schemaVersion: 1;
  game: 'frog';
  index: number;
  /** the tick the child has marked, or null */
  pick: number | null;
  solved: boolean;
  done: string[];
  voice: boolean;
}
export const FROG_KEY = 'jy.math.frog.v1';

export const blankFrog = (voice = true): FrogSave => ({ schemaVersion: 1, game: 'frog', index: 0, pick: null, solved: false, done: [], voice });
export const finishedF2 = (s: FrogSave) => s.index >= FROG_PROBLEMS.length;
export const problemOfF2 = (s: FrogSave): FrogProblem | null => FROG_PROBLEMS[s.index] ?? null;
export const landing = (p: FrogProblem) => p.start + p.jump * p.times;
export const ticksOf = (p: FrogProblem) => every(p.max, p.tick);
/** the spoken / written task */
export const taskOf = (p: FrogProblem) => `從 ${p.start} 開始，往${p.jump > 0 ? '右' : '左'}跳 ${p.times} 次，每次跳 ${Math.abs(p.jump)}。青蛙會停在哪裡？`;

/** Mark a tick (snapped to the nearest one on the line). */
export function pickAt(s: FrogSave, value: number): FrogSave {
  const p = problemOfF2(s);
  if (!p || s.solved || !Number.isFinite(value)) return s;
  const v = Math.max(0, Math.min(p.max, Math.round(value / p.tick) * p.tick));
  return v === s.pick ? s : { ...s, pick: v };
}
/** Move the mark one tick left or right. */
export const nudgePick = (s: FrogSave, d: number): FrogSave => {
  const p = problemOfF2(s);
  if (!p) return s;
  return pickAt(s, (s.pick ?? p.start) + d * p.tick);
};

/** How many jumps of this problem's size reach `v` from the start (null: cannot be reached that way). */
export function jumpsTo(p: FrogProblem, v: number): number | null {
  const d = v - p.start;
  if (d === 0 || d % p.jump !== 0 || d / p.jump < 0) return null;
  return d / p.jump;
}

export type FResult2 = 'locked' | 'noPick' | 'start' | 'otherWay' | 'notOnPath' | 'jumps' | 'right';
/** "Go!": judged against the landing pad; a wrong pad says how many jumps it would take. */
export function checkFrog(s: FrogSave): { s: FrogSave; r: FResult2; jumps?: number } {
  const p = problemOfF2(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (s.pick === null) return { s, r: 'noPick' };
  if (s.pick === landing(p)) return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
  if (s.pick === p.start) return { s, r: 'start' };
  if (Math.sign(s.pick - p.start) !== Math.sign(p.jump)) return { s, r: 'otherWay' };
  const n = jumpsTo(p, s.pick);
  if (n === null) return { s, r: 'notOnPath' };
  return { s, r: 'jumps', jumps: n };
}

export function restartFrog(s: FrogSave): FrogSave {
  const p = problemOfF2(s);
  return p ? { ...s, pick: null, solved: false, done: s.done.filter((d) => d !== p.id) } : s;
}
export function nextFrog(s: FrogSave): FrogSave {
  if (!s.solved || finishedF2(s)) return s;
  return { ...s, index: s.index + 1, pick: null, solved: false };
}
export const playAgainF2 = (s: FrogSave): FrogSave => blankFrog(s.voice);

export function validFrog(x: unknown): x is FrogSave {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== 1 || s.game !== 'frog' || typeof s.solved !== 'boolean' || typeof s.voice !== 'boolean') return false;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) > FROG_PROBLEMS.length) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => FROG_PROBLEMS.some((p) => p.id === d)) || new Set(s.done).size !== s.done.length) return false;
  const p = FROG_PROBLEMS[s.index as number];
  if (!p) return s.pick === null && !s.solved;
  if (s.pick !== null && (!Number.isInteger(s.pick) || (s.pick as number) < 0 || (s.pick as number) > p.max || (s.pick as number) % p.tick !== 0)) return false;
  if (s.solved && s.pick !== landing(p)) return false;
  return true;
}
export const readFrog = (get: () => string | null): Read<FrogSave> => readWith(get, validFrog);
