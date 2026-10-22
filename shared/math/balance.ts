// Math Island batch A — Balance Scale (天平等一等), grades 1–2 (R-1-1 expressions and the equals sign;
// N-2-3 / R-2-4 later). The equals sign means "both sides weigh the same", not "the answer goes here": the
// unknown box sits on the left in some problems and next to a number in others. The child adds blocks to the
// pan with the box until the scale is level, then presses "done". Pure and deterministic.
import { readWith, validBase, type Read } from './common';

/** one side of the equation, in order; 'x' is the box the child fills */
export type Term = number | 'x';
export interface BalanceProblem {
  id: string;
  left: Term[];
  right: Term[];
}

/** Five fixed problems; the box moves around so the answer is not always "after the =". Sums stay ≤ 12. */
export const BALANCE_PROBLEMS: readonly BalanceProblem[] = [
  { id: 'g1-balance-01', left: [5, 3], right: ['x'] },
  { id: 'g1-balance-02', left: ['x'], right: [4, 2] },
  { id: 'g1-balance-03', left: [5, 3], right: ['x', 2] },
  { id: 'g1-balance-04', left: [6, 4], right: [7, 'x'] },
  { id: 'g1-balance-05', left: ['x', 5], right: [9, 3] },
];
/** blocks in the bin at the start of every problem (more than any answer needs) */
export const SUPPLY = 10;
/** where one loose block is: -1 bin, 0 the pan with the box */
export const BIN = -1;
export const PAN = 0;

export interface BalanceSave {
  schemaVersion: 1;
  game: 'balance';
  index: number;
  at: number[];
  solved: boolean;
  done: string[];
  voice: boolean;
}
export const BALANCE_KEY = 'jy.math.balance.v1';

const sum = (t: Term[]) => t.reduce<number>((n, x) => n + (x === 'x' ? 0 : x), 0);
/** the side that has the box */
export const boxSide = (p: BalanceProblem): 'left' | 'right' => (p.left.includes('x') ? 'left' : 'right');
/** the number that makes both sides equal */
export const unknownOf = (p: BalanceProblem) => (boxSide(p) === 'left' ? sum(p.right) - sum(p.left) : sum(p.left) - sum(p.right));

const fresh = () => Array<number>(SUPPLY).fill(BIN);
export const blankBalance = (voice = true): BalanceSave => ({ schemaVersion: 1, game: 'balance', index: 0, at: fresh(), solved: false, done: [], voice });
export const finishedB = (s: BalanceSave) => s.index >= BALANCE_PROBLEMS.length;
export const problemOfB = (s: BalanceSave): BalanceProblem | null => BALANCE_PROBLEMS[s.index] ?? null;
export const inPan = (s: BalanceSave) => s.at.filter((a) => a === PAN).length;

/** both sides' weights with the blocks the child put in */
export function weights(s: BalanceSave): { left: number; right: number } {
  const p = problemOfB(s);
  if (!p) return { left: 0, right: 0 };
  const n = inPan(s);
  return boxSide(p) === 'left' ? { left: sum(p.left) + n, right: sum(p.right) } : { left: sum(p.left), right: sum(p.right) + n };
}
/** the equation as text, with the box shown as □ until solved */
export function equation(p: BalanceProblem, solved: boolean): string {
  const side = (t: Term[]) => t.map((x) => (x === 'x' ? (solved ? String(unknownOf(p)) : '□') : String(x))).join(' + ');
  return `${side(p.left)} = ${side(p.right)}`;
}

export type BResult = 'moved' | 'same' | 'locked' | 'ignored' | 'leftHeavy' | 'rightHeavy' | 'right';

export function moveBlock(s: BalanceSave, i: number, to: number): { s: BalanceSave; r: BResult } {
  if (!problemOfB(s) || s.solved) return { s, r: 'locked' };
  if (!Number.isInteger(i) || i < 0 || i >= s.at.length || (to !== BIN && to !== PAN)) return { s, r: 'ignored' };
  if (s.at[i] === to) return { s, r: 'same' };
  const at = s.at.slice();
  at[i] = to;
  return { s: { ...s, at }, r: 'moved' };
}

/** "Done": accepted only when the scale is level. */
export function checkBalance(s: BalanceSave): { s: BalanceSave; r: BResult } {
  const p = problemOfB(s);
  if (!p || s.solved) return { s, r: 'locked' };
  const w = weights(s);
  if (w.left > w.right) return { s, r: 'leftHeavy' };
  if (w.right > w.left) return { s, r: 'rightHeavy' };
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
}

export function restartBalance(s: BalanceSave): BalanceSave {
  const p = problemOfB(s);
  return p ? { ...s, at: fresh(), solved: false, done: s.done.filter((d) => d !== p.id) } : s;
}
export function nextBalance(s: BalanceSave): BalanceSave {
  if (!s.solved || finishedB(s)) return s;
  const index = s.index + 1;
  return { ...s, index, at: BALANCE_PROBLEMS[index] ? fresh() : [], solved: false };
}
export const playAgainB = (s: BalanceSave): BalanceSave => blankBalance(s.voice);

export function validBalance(x: unknown): x is BalanceSave {
  if (!validBase(x, 'balance', BALANCE_PROBLEMS.length)) return false;
  if (!x.done.every((d) => BALANCE_PROBLEMS.some((p) => p.id === d))) return false;
  const p = BALANCE_PROBLEMS[x.index];
  if (!p) return true;
  if (x.at.length !== SUPPLY || !x.at.every((a) => a === BIN || a === PAN)) return false;
  if (x.solved && x.at.filter((a) => a === PAN).length !== unknownOf(p)) return false;
  return true;
}
export const readBalance = (get: () => string | null): Read<BalanceSave> => readWith(get, validBalance);
