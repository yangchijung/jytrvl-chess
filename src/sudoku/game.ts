// Classic Sudoku controller: wraps the pure session with selection, timer, pause, hints, saving and tab coordination.
import { DIFFICULTIES, type Difficulty, type Step } from '../../shared/sudoku/engine';
import { pickPuzzle } from '../../shared/sudoku/bank';
import { applyHint, erase, hint, input, newSession, restartSession, undo, type Hint, type InputResult, type Session } from '../../shared/sudoku/session';
import { KEY, addRecord, backupInvalid, load, parseEnvelope, pushRecent, recent, save, type Envelope } from './store';

export type Phase = 'lobby' | 'running' | 'paused' | 'otherTab' | 'complete';
export type Msg =
  | 'sudoku.given.locked'
  | 'sudoku.notes.filled'
  | 'sudoku.select.help'
  | 'sudoku.conflict'
  | 'sudoku.hint.conflict'
  | 'sudoku.hint.unavailable'
  | null;

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface View {
  phase: Phase;
  s: Session | null;
  sel: number;
  notesMode: boolean;
  zoom: boolean;
  box: number;
  hint: Hint | null;
  msg: Msg;
  saveState: 'saved' | 'failed' | 'none';
  invalidSave: boolean;
  version: number;
}

export class SudokuController {
  readonly tabId = uid();
  phase: Phase = 'lobby';
  s: Session | null = null;
  sel = 40;
  notesMode = false;
  zoom = false;
  box = 4;
  hintView: Hint | null = null;
  msg: Msg = null;
  saveState: 'saved' | 'failed' | 'none' = 'none';
  invalidSave = false;
  private invalidRaw: string | null = null;
  private revision = 0;
  private lastWrite: { revision: number; writer: string } | null = null;
  private runningSince: number | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private cached: View | null = null;

  constructor() {
    const l = load();
    if (l.kind === 'ok') {
      this.revision = l.env.revision;
      this.lastWrite = { revision: l.env.revision, writer: l.env.writer };
      if (l.env.session.status === 'playing') this.s = l.env.session;
    } else if (l.kind === 'invalid') {
      this.invalidSave = true;
      this.invalidRaw = l.raw;
    } else if (l.kind === 'blocked') this.saveState = 'failed';
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onHide);
      window.addEventListener('storage', this.onStorage);
    }
  }

  dispose() {
    this.pause();
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.onHide);
      window.removeEventListener('storage', this.onStorage);
    }
  }

  // ---------- store-like API for React ----------
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = (): View => {
    if (!this.cached)
      this.cached = { phase: this.phase, s: this.s, sel: this.sel, notesMode: this.notesMode, zoom: this.zoom, box: this.box, hint: this.hintView, msg: this.msg, saveState: this.saveState, invalidSave: this.invalidSave, version: this.version };
    return this.cached;
  };
  private emit() {
    this.version++;
    this.cached = null;
    this.listeners.forEach((f) => f());
  }

  /** Active play time in ms (monotonic clock while running; saved total otherwise). */
  elapsed(): number {
    if (!this.s) return 0;
    return this.s.activeElapsedMs + (this.runningSince !== null ? Math.max(0, now() - this.runningSince) : 0);
  }
  private flushTime() {
    if (this.s && this.runningSince !== null) {
      this.s = { ...this.s, activeElapsedMs: this.elapsed() };
      this.runningSince = now();
    }
  }

  private persist(force = false) {
    if (!this.s) return;
    const env: Envelope = { session: this.s, revision: this.revision + 1, writer: this.tabId, savedAt: Date.now() };
    const r = save(env, this.lastWrite, force);
    if (r === 'conflict') {
      this.toOtherTab();
      return;
    }
    if (r === 'ok') {
      this.revision = env.revision;
      this.lastWrite = { revision: env.revision, writer: this.tabId };
      this.saveState = 'saved';
    } else this.saveState = 'failed';
  }

  private toOtherTab() {
    if (this.runningSince !== null) this.flushTime();
    this.runningSince = null;
    this.phase = 'otherTab';
    this.hintView = null;
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.pause();
  };
  private onHide = () => this.pause();
  private onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    const env = parseEnvelope(e.newValue);
    if (!env || env.writer === this.tabId) return;
    if (this.phase === 'running' || this.phase === 'paused' || (this.phase === 'lobby' && this.s)) {
      this.toOtherTab();
      this.emit();
    }
  };

  // ---------- lifecycle ----------
  startNew(d: Difficulty, rand = Math.random) {
    if (this.invalidRaw) {
      backupInvalid(this.invalidRaw);
      this.invalidRaw = null;
      this.invalidSave = false;
    }
    const p = pickPuzzle(DIFFICULTIES.includes(d) ? d : 'easy', recent(), rand);
    this.s = newSession(p, { sessionId: uid(), now: Date.now() });
    pushRecent(p.puzzleId);
    this.resetUi();
    this.phase = 'running';
    this.runningSince = now();
    this.persist(true);
    this.emit();
  }

  restart() {
    if (!this.s) return;
    this.s = restartSession(this.s, { sessionId: uid(), now: Date.now() });
    this.resetUi();
    this.phase = 'running';
    this.runningSince = now();
    this.persist(true);
    this.emit();
  }

  private resetUi() {
    this.sel = this.s ? Math.max(0, [...this.s.givens].findIndex((c) => c === '0')) : 40;
    this.box = boxIndex(this.sel);
    this.notesMode = false;
    this.zoom = false;
    this.hintView = null;
    this.msg = null;
  }

  /** Continue (from the lobby, a pause or another tab). Taking over from another tab reloads its latest copy. */
  resume() {
    if (this.phase === 'otherTab' || this.phase === 'lobby') {
      const l = load();
      if (l.kind === 'ok' && l.env.session.status === 'playing') {
        this.s = l.env.session;
        this.revision = l.env.revision;
      }
    }
    if (!this.s || this.s.status !== 'playing') return;
    this.phase = 'running';
    this.runningSince = now();
    this.lastWrite = null;
    this.persist(true); // become the writer
    this.emit();
  }

  pause() {
    if (this.phase !== 'running') return;
    this.flushTime();
    this.runningSince = null;
    this.phase = 'paused';
    this.persist();
    this.emit();
  }

  backToLobby() {
    if (this.phase === 'running') this.pause();
    if (this.s?.status === 'complete') this.s = null;
    this.phase = 'lobby';
    this.hintView = null;
    this.emit();
  }

  // ---------- play ----------
  select(cell: number) {
    if (cell < 0 || cell > 80) return;
    this.sel = cell;
    this.box = boxIndex(cell);
    this.msg = this.s && this.s.givens[cell] !== '0' ? null : this.msg === 'sudoku.given.locked' ? null : this.msg;
    this.emit();
  }
  move(dr: number, dc: number) {
    const r = Math.floor(this.sel / 9) + dr,
      c = (this.sel % 9) + dc;
    if (r < 0 || r > 8 || c < 0 || c > 8) return; // no wrap-around
    this.select(r * 9 + c);
  }
  setBox(b: number) {
    if (b < 0 || b > 8) return;
    this.box = b;
    if (boxIndex(this.sel) !== b) this.sel = (Math.floor(b / 3) * 3 + 1) * 9 + (b % 3) * 3 + 1;
    this.emit();
  }
  toggleZoom() {
    this.zoom = !this.zoom;
    this.box = boxIndex(this.sel);
    this.emit();
  }
  toggleNotes() {
    this.notesMode = !this.notesMode;
    this.emit();
  }

  private act(f: (s: Session) => { s: Session; r: InputResult } | Session) {
    if (this.phase !== 'running' || !this.s) return;
    const out = f(this.s);
    const r = 's' in out && 'r' in out ? out : { s: out as Session, r: 'ok' as InputResult };
    this.msg = r.r === 'given' ? 'sudoku.given.locked' : r.r === 'filled' ? 'sudoku.notes.filled' : null;
    if (r.s !== this.s) {
      this.flushTime();
      this.s = r.s;
      if (this.hintView?.kind === 'conflict' || this.hintView?.kind === 'contradiction') this.hintView = null;
      if (this.s.status === 'complete') this.finish();
      else this.persist();
    }
    this.emit();
  }

  digit(d: number) {
    this.act((s) => input(s, this.sel, d, this.notesMode));
  }
  erase() {
    this.act((s) => erase(s, this.sel));
  }
  undo() {
    this.act((s) => undo(s));
  }

  requestHint() {
    if (this.phase !== 'running' || !this.s) return;
    const r = hint(this.s);
    this.flushTime();
    this.s = r.s;
    this.hintView = r.h;
    this.msg = r.h.kind === 'unavailable' ? 'sudoku.hint.unavailable' : null;
    if (r.h.kind === 'step') {
      const focus = r.h.step.place?.cell ?? r.h.step.cells[0];
      this.sel = focus;
      this.box = boxIndex(focus);
    } else if (r.h.kind === 'contradiction') {
      this.sel = r.h.cell;
      this.box = boxIndex(r.h.cell);
    } else if (r.h.kind === 'conflict') {
      this.sel = r.h.cells[0];
      this.box = boxIndex(r.h.cells[0]);
    }
    this.persist();
    this.emit();
  }
  applyHint(st: Step) {
    this.act((s) => applyHint(s, st));
    if (this.s?.status === 'playing') this.hintView = null;
    this.emit();
  }
  closeHint() {
    this.hintView = null;
    this.emit();
  }

  private finish() {
    if (!this.s) return;
    this.flushTime();
    this.runningSince = null;
    const ms = this.s.activeElapsedMs;
    this.s = { ...this.s, completedAt: Date.now() };
    this.phase = 'complete';
    this.hintView = null;
    addRecord({ sessionId: this.s.sessionId, puzzleId: this.s.puzzleId, difficulty: this.s.difficulty, ms, hints: this.s.hintsUsed, assisted: this.s.assisted, replay: this.s.replay, completedAt: this.s.completedAt! });
    this.persist();
  }

  /** Test hook: pretend a lot of time passed (used by the browser tests for long-session checks). */
  addElapsedForTest(ms: number) {
    if (this.s) this.s = { ...this.s, activeElapsedMs: this.s.activeElapsedMs + ms };
    this.emit();
  }
}

export const boxIndex = (cell: number) => Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor((cell % 9) / 3);

export function formatTime(ms: number): string {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
