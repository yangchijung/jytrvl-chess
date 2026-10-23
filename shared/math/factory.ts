// Math Island M0 — Packing Factory (分裝工廠), grade 3: share all the items equally into boxes, then say how
// many are in each box. Spec §3: the answer is accepted only after (1) everything is shared out and (2) every
// box has the same number; 12 shared as 5/4/3 is never accepted because the total happens to be right.
// Exact division only in M0 (no remainders, divisor never 0). Pure and deterministic.

export interface FactoryProblem {
  id: string;
  total: number;
  boxes: number;
}

/** The five fixed M0 problems, in order (§3). Skill N-3-4 / R-3-1: equal sharing, meaning of division. */
export const FACTORY_PROBLEMS: readonly FactoryProblem[] = [
  { id: 'g3-factory-01', total: 12, boxes: 3 },
  { id: 'g3-factory-02', total: 18, boxes: 3 },
  { id: 'g3-factory-03', total: 8, boxes: 2 },
  { id: 'g3-factory-04', total: 10, boxes: 2 },
  { id: 'g3-factory-05', total: 15, boxes: 3 },
];

/** where one item is: -1 = still on the conveyor (the source), 0..boxes-1 = in that box */
export type Spot = number;
export const SOURCE = -1;

export interface FactorySave {
  schemaVersion: 1;
  game: 'factory';
  /** 0..4 the current problem; 5 = all five finished */
  index: number;
  at: Spot[];
  solved: boolean;
  done: string[];
  voice: boolean;
}

export const FACTORY_KEY = 'jy.math.factory.v1';

const fresh = (p: FactoryProblem): Spot[] => Array(p.total).fill(SOURCE);

export function blankFactory(voice = true): FactorySave {
  return { schemaVersion: 1, game: 'factory', index: 0, at: fresh(FACTORY_PROBLEMS[0]), solved: false, done: [], voice };
}
export const finishedF = (s: FactorySave) => s.index >= FACTORY_PROBLEMS.length;
export const problemOfF = (s: FactorySave): FactoryProblem | null => FACTORY_PROBLEMS[s.index] ?? null;
/** how many items are in each box (counted from the objects) */
export function counts(s: FactorySave): number[] {
  const p = problemOfF(s);
  const c = Array(p ? p.boxes : 0).fill(0);
  for (const a of s.at) if (a >= 0 && a < c.length) c[a]++;
  return c;
}
export const allShared = (s: FactorySave) => s.at.length > 0 && s.at.every((a) => a >= 0);
export const evenBoxes = (s: FactorySave) => {
  const c = counts(s);
  return c.length > 0 && c.every((n) => n === c[0]);
};

export function choicesOfF(p: FactoryProblem, index: number): number[] {
  const per = p.total / p.boxes;
  const set = [per - 1, per, per + 1].filter((n) => n >= 1);
  while (set.length < 3) set.push(Math.max(...set) + 1);
  const rot = [2, 0, 1, 2, 0][index % 5];
  return [...set.slice(rot), ...set.slice(0, rot)];
}

export type FResult = 'moved' | 'same' | 'locked' | 'ignored' | 'notAll' | 'unequal' | 'wrong' | 'right';

export function moveItem(s: FactorySave, i: number, to: Spot): { s: FactorySave; r: FResult } {
  const p = problemOfF(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (!Number.isInteger(i) || i < 0 || i >= s.at.length || !Number.isInteger(to) || to < SOURCE || to >= p.boxes) return { s, r: 'ignored' };
  if (s.at[i] === to) return { s, r: 'same' };
  const at = s.at.slice();
  at[i] = to;
  return { s: { ...s, at }, r: 'moved' };
}

/** Judge "how many in each box": first everything shared, then every box equal, then the number. */
export function answerFactory(s: FactorySave, n: number): { s: FactorySave; r: FResult } {
  const p = problemOfF(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (!choicesOfF(p, s.index).includes(n)) return { s, r: 'ignored' };
  if (!allShared(s)) return { s, r: 'notAll' };
  if (!evenBoxes(s)) return { s, r: 'unequal' };
  if (n !== counts(s)[0]) return { s, r: 'wrong' };
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
}

export function restartFactory(s: FactorySave): FactorySave {
  const p = problemOfF(s);
  if (!p) return s;
  return { ...s, at: fresh(p), solved: false, done: s.done.filter((d) => d !== p.id) };
}
export function nextFactory(s: FactorySave): FactorySave {
  if (!s.solved || finishedF(s)) return s;
  const index = s.index + 1;
  const p = FACTORY_PROBLEMS[index];
  return { ...s, index, at: p ? fresh(p) : [], solved: false };
}
export const playAgainF = (s: FactorySave): FactorySave => blankFactory(s.voice);

export function validFactory(x: unknown): x is FactorySave {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== 1 || s.game !== 'factory' || typeof s.solved !== 'boolean' || typeof s.voice !== 'boolean') return false;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) > FACTORY_PROBLEMS.length) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => typeof d === 'string' && FACTORY_PROBLEMS.some((p) => p.id === d))) return false;
  if (new Set(s.done).size !== s.done.length) return false;
  const p = FACTORY_PROBLEMS[s.index as number];
  if (!Array.isArray(s.at)) return false;
  if (!p) return s.at.length === 0 && s.solved === false;
  if (s.at.length !== p.total || !s.at.every((a) => Number.isInteger(a) && a >= SOURCE && a < p.boxes)) return false;
  if (s.solved) {
    const c = Array(p.boxes).fill(0);
    for (const a of s.at as number[]) if (a >= 0) c[a]++;
    if (!(s.at as number[]).every((a) => a >= 0) || !c.every((n) => n === p.total / p.boxes)) return false;
  }
  return true;
}

export type ReadF = { kind: 'ok'; save: FactorySave } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };
export function readFactory(get: () => string | null): ReadF {
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
  return validFactory(x) ? { kind: 'ok', save: x } : { kind: 'broken', raw, cause: 'schema' };
}
