// Math Island batch A — Make-Ten Train (湊十小火車), grade 1 (N-1-3 basic addition, N-1-2 addition).
// Each car is a ten-frame. Car 1 already has `a` riders; `b` riders wait on the platform. Car 2 can only be
// boarded once car 1 is full, so the child makes ten first and sees "10 and 3 is 13" (8 + 5). The total is
// accepted only after everyone has boarded with car 1 full first. Pure and deterministic.
import { choicesAround, readWith, validBase, type Read } from './common';

export interface TrainProblem {
  id: string;
  /** riders already in car 1 */
  a: number;
  /** riders waiting on the platform */
  b: number;
}

/** Five fixed problems: one exact make-ten, then sums 11–16 that cross ten (single-digit addends). */
export const TRAIN_PROBLEMS: readonly TrainProblem[] = [
  { id: 'g1-train-01', a: 7, b: 3 },
  { id: 'g1-train-02', a: 8, b: 5 },
  { id: 'g1-train-03', a: 9, b: 4 },
  { id: 'g1-train-04', a: 7, b: 6 },
  { id: 'g1-train-05', a: 8, b: 8 },
];
export const CAR = 10;
/** where one waiting rider is: -1 platform, 0 car 1, 1 car 2 */
export const PLATFORM = -1;

export interface TrainSave {
  schemaVersion: 1;
  game: 'train';
  index: number;
  at: number[];
  solved: boolean;
  done: string[];
  voice: boolean;
}
export const TRAIN_KEY = 'jy.math.train.v1';

const fresh = (p: TrainProblem) => Array<number>(p.b).fill(PLATFORM);
export const blankTrain = (voice = true): TrainSave => ({ schemaVersion: 1, game: 'train', index: 0, at: fresh(TRAIN_PROBLEMS[0]), solved: false, done: [], voice });
export const finishedT = (s: TrainSave) => s.index >= TRAIN_PROBLEMS.length;
export const problemOfT = (s: TrainSave): TrainProblem | null => TRAIN_PROBLEMS[s.index] ?? null;

/** riders in car 1 (seated + boarded) and car 2, counted from the objects */
export function cars(s: TrainSave): [number, number] {
  const p = problemOfT(s);
  if (!p) return [0, 0];
  let c1 = p.a,
    c2 = 0;
  for (const x of s.at) if (x === 0) c1++;
    else if (x === 1) c2++;
  return [c1, c2];
}
export const allBoarded = (s: TrainSave) => s.at.length > 0 && s.at.every((x) => x !== PLATFORM);
export const choicesOfT = (p: TrainProblem, index: number) => choicesAround(p.a + p.b, index, 1);

export type TResult = 'moved' | 'same' | 'locked' | 'ignored' | 'full' | 'fillFirst' | 'notAll' | 'wrong' | 'right';

export function moveRider(s: TrainSave, i: number, to: number): { s: TrainSave; r: TResult } {
  const p = problemOfT(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (!Number.isInteger(i) || i < 0 || i >= s.at.length || ![PLATFORM, 0, 1].includes(to)) return { s, r: 'ignored' };
  if (s.at[i] === to) return { s, r: 'same' };
  const [c1] = cars(s);
  if (to === 0 && c1 >= CAR) return { s, r: 'full' };
  if (to === 1 && c1 < CAR) return { s, r: 'fillFirst' };
  // a rider leaving car 1 while car 2 has riders would leave a gap before ten; send one from car 2 down instead
  if (s.at[i] === 0 && to !== 0 && s.at.some((x) => x === 1)) return { s, r: 'fillFirst' };
  const at = s.at.slice();
  at[i] = to;
  return { s: { ...s, at }, r: 'moved' };
}

export function answerTrain(s: TrainSave, n: number): { s: TrainSave; r: TResult } {
  const p = problemOfT(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (!choicesOfT(p, s.index).includes(n)) return { s, r: 'ignored' };
  if (!allBoarded(s)) return { s, r: 'notAll' };
  const [c1, c2] = cars(s);
  if (c2 > 0 && c1 < CAR) return { s, r: 'fillFirst' };
  if (n !== c1 + c2) return { s, r: 'wrong' };
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
}

export function restartTrain(s: TrainSave): TrainSave {
  const p = problemOfT(s);
  return p ? { ...s, at: fresh(p), solved: false, done: s.done.filter((d) => d !== p.id) } : s;
}
export function nextTrain(s: TrainSave): TrainSave {
  if (!s.solved || finishedT(s)) return s;
  const index = s.index + 1;
  const p = TRAIN_PROBLEMS[index];
  return { ...s, index, at: p ? fresh(p) : [], solved: false };
}
export const playAgainT = (s: TrainSave): TrainSave => blankTrain(s.voice);

export function validTrain(x: unknown): x is TrainSave {
  if (!validBase(x, 'train', TRAIN_PROBLEMS.length)) return false;
  if (!x.done.every((d) => TRAIN_PROBLEMS.some((p) => p.id === d))) return false;
  const p = TRAIN_PROBLEMS[x.index];
  if (!p) return true;
  if (x.at.length !== p.b || !x.at.every((a) => a >= PLATFORM && a <= 1)) return false;
  const c1 = p.a + x.at.filter((a) => a === 0).length,
    c2 = x.at.filter((a) => a === 1).length;
  if (c1 > CAR || (c2 > 0 && c1 < CAR)) return false;
  if (x.solved && x.at.some((a) => a === PLATFORM)) return false;
  return true;
}
export const readTrain = (get: () => string | null): Read<TrainSave> => readWith(get, validTrain);
