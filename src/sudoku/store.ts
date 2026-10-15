// Local persistence for Classic Sudoku (this browser only, never synced).
// One in-progress game; a single writer tab (revision + writer id); unreadable saves are kept, never silently cleared.
import { validSession, type Session } from '../../shared/sudoku/session';
import type { Difficulty } from '../../shared/sudoku/engine';

export const KEY = 'jy.sudoku.v1.current';
const RECORDS = 'jy.sudoku.v1.records';
const RECENT = 'jy.sudoku.v1.recent';
const SETUP = 'jy.sudoku.v1.difficulty';
export const RECORD_LIMIT = 30;

export interface Envelope {
  session: Session;
  revision: number;
  writer: string;
  savedAt: number;
}

export type Loaded = { kind: 'none' } | { kind: 'ok'; env: Envelope } | { kind: 'invalid'; raw: string } | { kind: 'blocked' };

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function load(): Loaded {
  const s = ls();
  if (!s) return { kind: 'blocked' };
  let raw: string | null;
  try {
    raw = s.getItem(KEY);
  } catch {
    return { kind: 'blocked' };
  }
  if (!raw) return { kind: 'none' };
  try {
    const env = JSON.parse(raw) as Envelope;
    if (env && Number.isInteger(env.revision) && typeof env.writer === 'string' && validSession(env.session)) return { kind: 'ok', env };
  } catch {
    /* fall through */
  }
  return { kind: 'invalid', raw };
}

export function parseEnvelope(raw: string | null): Envelope | null {
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope;
    return env && validSession(env.session) ? env : null;
  } catch {
    return null;
  }
}

export type SaveResult = 'ok' | 'failed' | 'conflict';

/**
 * Writes only if the stored copy is still the one this tab wrote last (same writer and revision), so a second
 * tab never silently overwrites the first. `force` takes over (used when the player resumes in this tab).
 */
export function save(env: Envelope, expect: { revision: number; writer: string } | null, force = false): SaveResult {
  const s = ls();
  if (!s) return 'failed';
  try {
    if (!force && expect) {
      const cur = parseEnvelope(s.getItem(KEY));
      if (cur && (cur.writer !== expect.writer || cur.revision !== expect.revision)) return 'conflict';
    }
    s.setItem(KEY, JSON.stringify(env));
    return 'ok';
  } catch {
    return 'failed';
  }
}

/** Keeps an unreadable save under a backup key before a new game replaces it. */
export function backupInvalid(raw: string) {
  try {
    ls()?.setItem(`jy.sudoku.v1.unreadable.${Date.now()}`, raw);
  } catch {
    /* storage full: the original stays in place because we do not overwrite it below */
  }
}

export interface CompletionRecord {
  sessionId: string;
  puzzleId: string;
  difficulty: Difficulty;
  ms: number;
  hints: number;
  assisted: boolean;
  replay: boolean;
  completedAt: number;
}

export function records(): CompletionRecord[] {
  try {
    const r = JSON.parse(ls()?.getItem(RECORDS) ?? '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

/** Adds a completion once per session id; keeps the latest 30. */
export function addRecord(r: CompletionRecord): boolean {
  const list = records();
  if (list.some((x) => x.sessionId === r.sessionId)) return false;
  try {
    ls()?.setItem(RECORDS, JSON.stringify([r, ...list].slice(0, RECORD_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function recent(): string[] {
  try {
    const r = JSON.parse(ls()?.getItem(RECENT) ?? '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}
export function pushRecent(id: string) {
  try {
    ls()?.setItem(RECENT, JSON.stringify([...recent().filter((x) => x !== id), id].slice(-30)));
  } catch {
    /* ignore */
  }
}

export function savedDifficulty(): Difficulty {
  try {
    const d = ls()?.getItem(SETUP);
    return d === 'medium' || d === 'hard' ? d : 'easy';
  } catch {
    return 'easy';
  }
}
export function saveDifficulty(d: Difficulty) {
  try {
    ls()?.setItem(SETUP, d);
  } catch {
    /* ignore */
  }
}
