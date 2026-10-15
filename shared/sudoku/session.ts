// Classic Sudoku game session: entries, notes, undo transactions, conflicts, completion and explainable hints.
// Pure data in / data out so it can be unit-tested and saved as JSON (schemaVersion 1).
import { PEERS, TIERS, bit, candidates, conflicts, findStep, parseGrid, type Difficulty, type Grid, type Step } from './engine';

export const SCHEMA_VERSION = 1;
export const HISTORY_LIMIT = 100;

export interface Puzzle {
  puzzleId: string;
  rulesVersion: string;
  difficultyVersion: string;
  difficulty: Difficulty;
  givens: string;
  solution: string;
}

export interface CellChange {
  cell: number;
  entry: [number, number];
  notes: [number, number];
}
export interface Action {
  kind: 'fill' | 'erase' | 'note' | 'hint-fill' | 'hint-eliminate';
  changes: CellChange[];
  /** proven eliminations added by an applied hint (removed again on undo) */
  elims?: [number, number][];
}

export interface Session {
  schemaVersion: number;
  sessionId: string;
  puzzleId: string;
  rulesVersion: string;
  difficultyVersion: string;
  difficulty: Difficulty;
  givens: string;
  solution: string;
  entries: number[];
  notes: number[];
  history: Action[];
  /** proven candidate eliminations the hint engine keeps building on */
  elims: [number, number][];
  hintsUsed: number;
  /** keys of hint steps already revealed this game (a revealed step is never counted twice) */
  hintKeys: string[];
  assisted: boolean;
  replay: boolean;
  activeElapsedMs: number;
  startedAt: number;
  completedAt: number | null;
  status: 'playing' | 'complete';
}

export function newSession(p: Puzzle, opts: { sessionId: string; now: number; replay?: boolean }): Session {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: opts.sessionId,
    puzzleId: p.puzzleId,
    rulesVersion: p.rulesVersion,
    difficultyVersion: p.difficultyVersion,
    difficulty: p.difficulty,
    givens: p.givens,
    solution: p.solution,
    entries: new Array(81).fill(0),
    notes: new Array(81).fill(0),
    history: [],
    elims: [],
    hintsUsed: 0,
    hintKeys: [],
    assisted: false,
    replay: !!opts.replay,
    activeElapsedMs: 0,
    startedAt: opts.now,
    completedAt: null,
    status: 'playing',
  };
}

/** Same puzzle from scratch; marked as a replay. The earlier game's hint use stays in its own record. */
export function restartSession(s: Session, opts: { sessionId: string; now: number }): Session {
  return newSession(s, { ...opts, replay: true });
}

export const givensOf = (s: Session): Grid => parseGrid(s.givens);
export const isGiven = (s: Session, cell: number) => s.givens[cell] !== '0' && s.givens[cell] !== '.';
/** Digits on the board (givens + entries). */
export const boardOf = (s: Session): Grid => givensOf(s).map((v, i) => v || s.entries[i]);
export const conflictCells = (s: Session) => conflicts(boardOf(s));

export type InputResult = 'ok' | 'given' | 'noop' | 'filled' | 'complete' | 'over';

function commit(s: Session, a: Action): Session {
  if (!a.changes.length && !a.elims?.length) return s;
  const entries = s.entries.slice(),
    notes = s.notes.slice();
  for (const c of a.changes) {
    entries[c.cell] = c.entry[1];
    notes[c.cell] = c.notes[1];
  }
  const history = [...s.history, a].slice(-HISTORY_LIMIT);
  const elims = a.elims ? [...s.elims, ...a.elims] : s.elims;
  const next = { ...s, entries, notes, history, elims };
  return complete(next) ? { ...next, status: 'complete' } : next;
}

/** Places (or replaces) a digit; clears this cell's notes and removes the digit from peers' notes — one undo step. */
function fillAction(s: Session, cell: number, digit: number, kind: Action['kind']): Action {
  const changes: CellChange[] = [{ cell, entry: [s.entries[cell], digit], notes: [s.notes[cell], 0] }];
  for (const p of PEERS[cell]) if (s.notes[p] & bit(digit)) changes.push({ cell: p, entry: [s.entries[p], s.entries[p]], notes: [s.notes[p], s.notes[p] & ~bit(digit)] });
  return { kind, changes };
}

export function input(s: Session, cell: number, digit: number, notesMode: boolean): { s: Session; r: InputResult } {
  if (s.status !== 'playing') return { s, r: 'over' };
  if (cell < 0 || cell > 80 || digit < 1 || digit > 9) return { s, r: 'noop' };
  if (isGiven(s, cell)) return { s, r: 'given' };
  if (notesMode) {
    if (s.entries[cell]) return { s, r: 'filled' };
    const n = s.notes[cell] ^ bit(digit);
    return { s: commit(s, { kind: 'note', changes: [{ cell, entry: [0, 0], notes: [s.notes[cell], n] }] }), r: 'ok' };
  }
  if (s.entries[cell] === digit) return { s, r: 'noop' };
  const next = commit(s, fillAction(s, cell, digit, 'fill'));
  return { s: next, r: next.status === 'complete' ? 'complete' : 'ok' };
}

export function erase(s: Session, cell: number): { s: Session; r: InputResult } {
  if (s.status !== 'playing') return { s, r: 'over' };
  if (isGiven(s, cell)) return { s, r: 'given' };
  if (!s.entries[cell] && !s.notes[cell]) return { s, r: 'noop' };
  return { s: commit(s, { kind: 'erase', changes: [{ cell, entry: [s.entries[cell], 0], notes: [s.notes[cell], 0] }] }), r: 'ok' };
}

/** Reverts the last action exactly (including notes removed automatically). Hint counts are never refunded. */
export function undo(s: Session): Session {
  if (s.status !== 'playing' || !s.history.length) return s;
  const a = s.history[s.history.length - 1];
  const entries = s.entries.slice(),
    notes = s.notes.slice();
  for (const c of a.changes) {
    entries[c.cell] = c.entry[0];
    notes[c.cell] = c.notes[0];
  }
  let elims = s.elims;
  if (a.elims?.length) {
    const drop = new Set(a.elims.map(([c, d]) => c * 10 + d));
    elims = s.elims.filter(([c, d]) => !drop.has(c * 10 + d));
  }
  return { ...s, entries, notes, elims, history: s.history.slice(0, -1) };
}

/** Complete only when all 81 cells hold digits, every unit is valid and the givens are untouched. */
export function complete(s: Session): boolean {
  const g = givensOf(s);
  if (s.entries.some((v, i) => g[i] && v)) return false;
  const b = boardOf(s);
  return b.every((v) => v >= 1 && v <= 9) && conflicts(b).size === 0;
}

// ---------- hints ----------

export type Hint =
  | { kind: 'conflict'; cells: number[] }
  | { kind: 'contradiction'; cell: number; digit: number; counted: boolean }
  | { kind: 'step'; step: Step; key: string; counted: boolean }
  | { kind: 'unavailable' }
  | { kind: 'none' };

export const stepKey = (st: Step) =>
  `${st.technique}:${st.place ? `${st.place.cell}=${st.place.digit}` : st.eliminate.map((e) => `${e.cell}-${e.digit}`).join(',')}`;

/** Candidate masks the logic engine reasons with: recomputed from the board, minus proven eliminations. */
export function proofCandidates(s: Session): number[] {
  const c = candidates(boardOf(s));
  for (const [cell, d] of s.elims) c[cell] &= ~bit(d);
  return c;
}

/**
 * Next hint. 1) duplicates → point at them (not counted). 2) an entry that makes the puzzle unsolvable
 * (puzzles have one solution, so any entry differing from it) → point at it (counted). 3) the next logic step
 * with its evidence (counted once per distinct step, when first revealed).
 */
export function hint(s: Session): { s: Session; h: Hint } {
  if (s.status !== 'playing') return { s, h: { kind: 'none' } };
  const dup = [...conflictCells(s)];
  if (dup.length) return { s, h: { kind: 'conflict', cells: dup.sort((a, b) => a - b) } };
  const sol = parseGrid(s.solution);
  const wrong = s.entries.findIndex((v, i) => v && v !== sol[i]);
  if (wrong >= 0) {
    const key = `contradiction:${wrong}=${s.entries[wrong]}`;
    const fresh = !s.hintKeys.includes(key);
    const next = fresh ? { ...s, hintsUsed: s.hintsUsed + 1, hintKeys: [...s.hintKeys, key], assisted: true } : s;
    return { s: next, h: { kind: 'contradiction', cell: wrong, digit: s.entries[wrong], counted: fresh } };
  }
  const st = findStep(boardOf(s), proofCandidates(s), TIERS.hard);
  if (!st) return { s, h: { kind: 'unavailable' } };
  const key = stepKey(st);
  const fresh = !s.hintKeys.includes(key);
  const next = fresh ? { ...s, hintsUsed: s.hintsUsed + 1, hintKeys: [...s.hintKeys, key], assisted: true } : s;
  return { s: next, h: { kind: 'step', step: st, key, counted: fresh } };
}

/** "Fill it for me" / "Apply eliminations" — an undoable transaction; never changes the hint count. */
export function applyHint(s: Session, st: Step): Session {
  if (s.status !== 'playing') return s;
  if (st.place) {
    if (isGiven(s, st.place.cell) || s.entries[st.place.cell] === st.place.digit) return s;
    return commit(s, fillAction(s, st.place.cell, st.place.digit, 'hint-fill'));
  }
  const byCell = new Map<number, number>();
  for (const e of st.eliminate) byCell.set(e.cell, (byCell.get(e.cell) ?? 0) | bit(e.digit));
  const changes: CellChange[] = [];
  for (const [cell, mask] of byCell) if (s.notes[cell] & mask) changes.push({ cell, entry: [s.entries[cell], s.entries[cell]], notes: [s.notes[cell], s.notes[cell] & ~mask] });
  const have = new Set(s.elims.map(([c, d]) => c * 10 + d));
  const elims = st.eliminate.filter((e) => !have.has(e.cell * 10 + e.digit)).map((e) => [e.cell, e.digit] as [number, number]);
  return commit(s, { kind: 'hint-eliminate', changes, elims });
}

/** Validates a parsed save; returns null when it cannot be used (caller keeps the raw data). */
export function validSession(x: unknown): x is Session {
  const s = x as Session;
  const arr = (a: unknown, max: number) => Array.isArray(a) && a.length === 81 && a.every((v) => Number.isInteger(v) && v >= 0 && v <= max);
  return (
    !!s &&
    s.schemaVersion === SCHEMA_VERSION &&
    typeof s.sessionId === 'string' &&
    typeof s.puzzleId === 'string' &&
    /^[0-9]{81}$/.test(s.givens) &&
    /^[1-9]{81}$/.test(s.solution) &&
    arr(s.entries, 9) &&
    arr(s.notes, 0b1111111110) &&
    Array.isArray(s.history) &&
    Array.isArray(s.elims) &&
    Array.isArray(s.hintKeys) &&
    Number.isFinite(s.activeElapsedMs) &&
    s.activeElapsedMs >= 0 &&
    (s.status === 'playing' || s.status === 'complete')
  );
}
