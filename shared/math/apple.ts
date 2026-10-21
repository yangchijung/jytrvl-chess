// Math Island M0 — Apple Basket (蘋果籃), grade 1: put two piles together and count the total.
// Spec: docs/product/math-island/開發規格書_v1.md §3 (fixed problems, MR01: the problem can only be finished
// once both piles are really in the basket; the answer is judged from the game state, never a button flag).
// Pure and deterministic: the page only renders this state and sends actions to it.

export interface AppleProblem {
  id: string;
  a: number;
  b: number;
}

/** The five fixed M0 problems, in order (§3). Skill N-1-2 / R-1-1: joining two groups, addition sentence. */
export const APPLE_PROBLEMS: readonly AppleProblem[] = [
  { id: 'g1-apple-01', a: 3, b: 4 },
  { id: 'g1-apple-02', a: 2, b: 3 },
  { id: 'g1-apple-03', a: 4, b: 1 },
  { id: 'g1-apple-04', a: 1, b: 2 },
  { id: 'g1-apple-05', a: 4, b: 4 },
];
export const MAX_PILE = 4;

export type Place = 'pile' | 'basket';
export type Group = 'a' | 'b';
export interface AppleItem {
  /** index into AppleSave.at */
  i: number;
  group: Group;
  /** slot inside its pile / its half of the basket (0..MAX_PILE-1); fixed, so nothing shifts or vanishes */
  slot: number;
}

export interface AppleSave {
  schemaVersion: 1;
  game: 'apple';
  /** 0..4 the current problem; 5 = all five finished */
  index: number;
  /** where each apple of the current problem is: group a first, then group b */
  at: Place[];
  /** the current problem has been answered correctly */
  solved: boolean;
  /** ids of problems answered correctly (in order) */
  done: string[];
  /** read the short prompts aloud (default on) */
  voice: boolean;
}

export const APPLE_KEY = 'jy.math.apple.v1';

export function itemsOf(p: AppleProblem): AppleItem[] {
  const out: AppleItem[] = [];
  for (let k = 0; k < p.a; k++) out.push({ i: k, group: 'a', slot: k });
  for (let k = 0; k < p.b; k++) out.push({ i: p.a + k, group: 'b', slot: k });
  return out;
}

export function blankApple(voice = true): AppleSave {
  const p = APPLE_PROBLEMS[0];
  return { schemaVersion: 1, game: 'apple', index: 0, at: Array(p.a + p.b).fill('pile'), solved: false, done: [], voice };
}

export const finished = (s: AppleSave) => s.index >= APPLE_PROBLEMS.length;
export const problemOf = (s: AppleSave): AppleProblem | null => APPLE_PROBLEMS[s.index] ?? null;
export const inBasket = (s: AppleSave) => s.at.filter((x) => x === 'basket').length;
/** Both piles are completely in the basket: only then can the total be judged (MR01). */
export const allIn = (s: AppleSave) => s.at.length > 0 && s.at.every((x) => x === 'basket');

/**
 * Three different, legal answer choices with exactly one correct (§3). Fixed per problem so a reload shows the
 * same buttons; the correct one is not always in the same position.
 */
export function choicesOf(p: AppleProblem, index: number): number[] {
  const t = p.a + p.b;
  const set = [t - 1, t, t + 1].filter((n) => n >= 1);
  while (set.length < 3) set.push(Math.max(...set) + 1);
  const rot = [1, 2, 0, 1, 2][index % 5];
  return [...set.slice(rot), ...set.slice(0, rot)];
}

export type Result = 'moved' | 'same' | 'locked' | 'notReady' | 'wrong' | 'right' | 'ignored';

/** Move one apple to its pile or the basket. Repeated or impossible moves change nothing (no doubling). */
export function moveApple(s: AppleSave, i: number, to: Place): { s: AppleSave; r: Result } {
  if (finished(s) || s.solved) return { s, r: 'locked' };
  if (!Number.isInteger(i) || i < 0 || i >= s.at.length || (to !== 'pile' && to !== 'basket')) return { s, r: 'ignored' };
  if (s.at[i] === to) return { s, r: 'same' };
  const at = s.at.slice();
  at[i] = to;
  return { s: { ...s, at }, r: 'moved' };
}

/**
 * Judge an answer from the state. Before both piles are in the basket it is not judged at all (a neutral
 * "put them together first"), a wrong number keeps everything in place, a right one finishes the problem.
 */
export function answerApple(s: AppleSave, n: number): { s: AppleSave; r: Result } {
  const p = problemOf(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (!choicesOf(p, s.index).includes(n)) return { s, r: 'ignored' };
  if (!allIn(s)) return { s, r: 'notReady' };
  if (n !== p.a + p.b) return { s, r: 'wrong' };
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
}

/** Put every apple of the current problem back on its pile (keeps the problem and finished ones). */
export function restartApple(s: AppleSave): AppleSave {
  const p = problemOf(s);
  if (!p) return s;
  return { ...s, at: Array(p.a + p.b).fill('pile'), solved: false, done: s.done.filter((d) => d !== p.id) };
}

/** Go on after a correct answer; only allowed once the current problem is solved. */
export function nextApple(s: AppleSave): AppleSave {
  if (!s.solved || finished(s)) return s;
  const index = s.index + 1;
  const p = APPLE_PROBLEMS[index];
  return { ...s, index, at: p ? Array(p.a + p.b).fill('pile') : [], solved: false };
}

export const playAgain = (s: AppleSave): AppleSave => blankApple(s.voice);

/** Strict reader: anything that does not fit exactly is treated as unreadable (kept aside, never guessed). */
export function validApple(x: unknown): x is AppleSave {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== 1 || s.game !== 'apple' || typeof s.solved !== 'boolean' || typeof s.voice !== 'boolean') return false;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) > APPLE_PROBLEMS.length) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => typeof d === 'string' && APPLE_PROBLEMS.some((p) => p.id === d))) return false;
  if (new Set(s.done).size !== s.done.length) return false;
  if (!Array.isArray(s.at) || !s.at.every((v) => v === 'pile' || v === 'basket')) return false;
  const p = APPLE_PROBLEMS[s.index as number];
  if (!p) return s.at.length === 0 && s.solved === false;
  if (s.at.length !== p.a + p.b) return false;
  if (s.solved && !(s.at as Place[]).every((v) => v === 'basket')) return false;
  return true;
}

export type Read<T> = { kind: 'ok'; save: T } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };
export function readApple(get: () => string | null): Read<AppleSave> {
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
  return validApple(x) ? { kind: 'ok', save: x } : { kind: 'broken', raw, cause: 'schema' };
}
