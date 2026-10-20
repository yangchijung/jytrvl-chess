// Restaurant V3 controller (guided play, docs/product/RESTAURANT_PLAYFUL_V3.md). The rules engine is the only
// source of truth: every action is applied and saved first, animations only show the committed result.
// - Own versioned save `jy.restaurant.v3`; the classic save `jy.restaurant.v1` is never written from here.
// - Loading uses the same protection as Color Doodle (backup before any write, alternate key when the backup
//   fails, read-back before "saved"), but with this game's own schema.
// - Each action carries a unique id (resends are ignored by the engine); a short input lock stops double taps.
// - Another tab's newer save (higher seq) is adopted instead of being overwritten.
import { apply, newGuided, validState, type Action, type ErrorCode, type State } from '../../shared/restaurant/engine';
import { DISH_IDS, ITEM_IDS, type DishId, type ItemId } from '../../shared/restaurant/data';
import { loadKeyed, type Notice, type Read } from '../doodle/storage';

export const V3_KEY = 'jy.restaurant.v3';
export const CLASSIC_KEY = 'jy.restaurant.v1';
/** which version /restaurant shows ('v3' | 'classic'); the classic game keeps its own save */
export const VIEW_KEY = 'jy.restaurant.view';

export interface Draft {
  dish: DishId | null;
  items: ItemId[];
}
export interface V3Save {
  schemaVersion: 3;
  state: State;
  /** the pan: chosen dish and ingredients (not booked until "Cook one") */
  draft: Draft;
  /** servings cooked by hand so far (quick cook is offered after two) */
  cooks: number;
  /** the plant is only previewed, not bought */
  plantPreview: boolean;
  /** earlier finished days kept when "Play again" starts a new one (newest last, at most 5) */
  history?: Past[];
}
export interface Past {
  soldCount: number;
  result: number;
  cashClose: number;
  decor: number;
}
export const blankV3 = (): V3Save => ({ schemaVersion: 3, state: newGuided(), draft: { dish: null, items: [] }, cooks: 0, plantPreview: false });

export function validV3(x: unknown): x is V3Save {
  const v = x as V3Save;
  return (
    !!v &&
    v.schemaVersion === 3 &&
    validState(v.state) &&
    v.state.mode === 'guided' &&
    !!v.draft &&
    (v.draft.dish === null || DISH_IDS.includes(v.draft.dish)) &&
    Array.isArray(v.draft.items) &&
    v.draft.items.length <= 4 &&
    v.draft.items.every((i) => ITEM_IDS.includes(i)) &&
    Number.isInteger(v.cooks) &&
    v.cooks >= 0 &&
    typeof v.plantPreview === 'boolean' &&
    (v.history === undefined ||
      (Array.isArray(v.history) && v.history.length <= 5 && v.history.every((h) => !!h && [h.soldCount, h.result, h.cashClose, h.decor].every((x) => typeof x === 'number' && Number.isFinite(x)))))
  );
}
export function readV3(get: () => string | null): Read<V3Save> {
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
  return validV3(x) ? { kind: 'ok', save: x } : { kind: 'broken', raw, cause: 'schema' };
}

export type Op = Action extends infer A ? (A extends { id: string } ? Omit<A, 'id'> : never) : never;
export type Fx = 'pan' | 'cook' | 'serve' | 'wrong' | 'plant' | null;
const FX_MS = 200; // every causal motion is 120–220 ms; one at a time

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
function reducedMotion() {
  if (typeof window === 'undefined') return true;
  return document.documentElement.hasAttribute('data-reduce-motion') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export interface V3View {
  v: V3Save;
  error: ErrorCode | null;
  saveState: 'saved' | 'failed' | 'none';
  notice: Notice;
  oldRaw: string | null;
  fx: Fx;
  fxKey: number;
  last: Op | null;
  otherTab: boolean;
  /** the last tap was not applied because another tab changed the game first */
  conflict: boolean;
  /** this tab has stopped writing (no Web Locks and another tab changed the game) until the child takes over */
  readOnly: boolean;
}

export class V3Controller {
  v: V3Save;
  target: string | null;
  notice: Notice;
  oldRaw: string | null;
  error: ErrorCode | null = null;
  saveState: 'saved' | 'failed' | 'none';
  fx: Fx = null;
  fxKey = 0;
  last: Op | null = null;
  otherTab = false;
  private lockUntil = 0;
  private fxTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private cached: V3View | null = null;

  /** the stored text this tab last read or wrote: every write first checks the store still holds it (R3-S1) */
  private base: string | null = null;
  private store: Pick<Storage, 'getItem' | 'setItem'> | null = null;
  conflict = false;

  constructor(store?: Pick<Storage, 'getItem' | 'setItem'>) {
    const r = loadKeyed<V3Save>({ key: V3_KEY, read: readV3, blank: blankV3 }, store);
    this.v = r.s;
    this.target = r.target;
    this.notice = r.notice;
    this.oldRaw = r.oldRaw;
    this.saveState = r.target ? 'none' : 'failed';
    try {
      this.store = store ?? window.localStorage;
      this.base = this.target ? this.store.getItem(this.target) : null;
    } catch {
      this.store = null;
    }
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }
  dispose() {
    if (this.fxTimer) clearTimeout(this.fxTimer);
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
  }
  /**
   * R3-S3: a storage event only says "something changed". It may arrive late and carry an older snapshot, so
   * the stored text is read again now; only a current text that differs from this tab's base is adopted.
   */
  private onStorage = (e: StorageEvent) => {
    if (!this.target || e.key !== this.target) return;
    let current: string | null;
    try {
      current = this.store ? this.store.getItem(this.target) : null;
    } catch {
      return;
    }
    if (current === null || current === this.base) return;
    const r = readV3(() => current);
    if (r.kind === 'ok') {
      this.v = r.save;
      this.base = current;
      this.otherTab = true;
      this.emit();
    }
  };

  /**
   * Without Web Locks (or when a lock cannot be had) the store cannot be changed atomically across tabs. Every
   * write then looks at the stored text twice (before applying and right before writing); a change caught by
   * the second look means two tabs are writing at once, so this tab stops writing and offers "play here
   * instead" (R3-S2). With Web Locks (current Chrome, Edge, Firefox, Safari 15.4+) commits are serialised.
   */
  readOnly = false;
  /** Take over this game in this tab (the page asks the child): adopt the newest stored progress, then write again. */
  takeOver() {
    this.readOnly = false;
    this.conflict = false;
    try {
      const current = this.target && this.store ? this.store.getItem(this.target) : null;
      const r = current !== null ? readV3(() => current) : null;
      if (r?.kind === 'ok') {
        this.v = r.save;
        this.base = current;
      }
    } catch {
      /* keep the progress on screen */
    }
    this.emit();
  }

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = (): V3View =>
    (this.cached ??= { v: this.v, error: this.error, saveState: this.saveState, notice: this.notice, oldRaw: this.oldRaw, fx: this.fx, fxKey: this.fxKey, last: this.last, otherTab: this.otherTab, conflict: this.conflict, readOnly: this.readOnly });
  private emit() {
    this.cached = null;
    this.listeners.forEach((f) => f());
  }
  /**
   * R3-S1: one change at a time across tabs. Under a cross-tab lock (Web Locks; a synchronous call where the
   * API is missing), read the stored text, and only if it is still the base this tab built on, apply the change
   * and write it (read back before "saved"). If another tab changed it first, adopt that full state instead,
   * write nothing and ask the child to tap again — no lost meal, no replayed payment.
   */
  private commit(change: (v: V3Save) => { next: V3Save; ok: boolean }, done: (applied: boolean) => void) {
    const read = (): { ok: boolean; text: string | null } => {
      if (!this.store || !this.target) return { ok: false, text: null };
      try {
        return { ok: true, text: this.store.getItem(this.target) };
      } catch {
        return { ok: false, text: null };
      }
    };
    /** another tab changed the stored game: adopt it whole, write nothing, ask for a new tap */
    const adopt = (text: string | null, unlocked: boolean): boolean => {
      const r = readV3(() => text);
      if (r.kind !== 'ok') return false;
      this.v = r.save;
      this.base = text;
      this.otherTab = true;
      this.conflict = true;
      if (unlocked) this.readOnly = true;
      done(false);
      this.emit();
      return true;
    };
    const run = (locked: boolean) => {
      if (this.readOnly) {
        // this tab stopped writing after another tab changed the game; nothing is applied until "play here"
        this.conflict = true;
        done(false);
        this.emit();
        return;
      }
      const first = read();
      if (first.ok && first.text !== this.base) {
        // changed while this tab was idle (e.g. the child played in another tab): adopt and ask for a new tap
        if (adopt(first.text, false)) return;
        // the stored text is no longer readable: never write over it
        const c = change(this.v);
        if (c.ok) this.v = c.next;
        this.saveState = 'failed';
        done(c.ok);
        this.emit();
        return;
      }
      const c = change(this.v);
      if (!c.ok) {
        done(false);
        this.emit();
        return;
      }
      if (!first.ok) {
        this.v = c.next;
        this.saveState = 'failed';
        done(true);
        this.emit();
        return;
      }
      const text = JSON.stringify(c.next);
      let ok = false;
      try {
        if (validV3(JSON.parse(text))) {
          if (!locked) {
            // no lock: look once more right before writing; a change made since the first read wins, and since
            // two tabs are now writing at the same moment this one becomes view-only until the child takes over
            const again = read();
            if (again.text !== this.base && adopt(again.text, true)) return;
          }
          this.store!.setItem(this.target!, text);
          ok = this.store!.getItem(this.target!) === text;
        }
      } catch {
        ok = false;
      }
      this.v = c.next;
      this.conflict = false;
      this.otherTab = false;
      if (ok) this.base = text;
      this.saveState = ok ? 'saved' : 'failed';
      done(true);
      this.emit();
    };
    const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks?.request && this.target) {
      let ran = false;
      void locks
        .request(`lock:${this.target}`, () => {
          ran = true;
          run(true);
        })
        .catch(() => {
          // the lock could not be had: never write unprotected — use the guarded single-writer path instead
          if (!ran) run(false);
        });
    } else run(false);
  }
  private play(fx: Fx) {
    if (!fx || reducedMotion()) return;
    this.fx = fx;
    this.fxKey++;
    if (this.fxTimer) clearTimeout(this.fxTimer);
    this.fxTimer = setTimeout(() => {
      this.fx = null;
      this.emit();
    }, FX_MS);
  }
  get locked() {
    return Date.now() < this.lockUntil;
  }

  /** Applies a rules action: commit and save first, then show its short motion. */
  dispatch(op: Op, fx: Fx = null, after?: (v: V3Save) => Partial<V3Save>): void {
    if (this.locked) return;
    this.lockUntil = Date.now() + 180; // no double taps, even before the commit finishes
    const id = uid();
    this.commit(
      (v) => {
        const r = apply(v.state, { ...op, id } as Action);
        this.error = r.error ?? null;
        if (r.error || r.duplicate) return { next: v, ok: false };
        const next = { ...v, state: r.s };
        return { next: { ...next, ...(after ? after(next) : {}) }, ok: true };
      },
      (applied) => {
        if (applied) {
          this.last = op;
          this.play(fx);
        } else if (this.error) this.play(op.t === 'serve' ? 'wrong' : null);
      },
    );
  }
  /** Pan / preview changes that are not bookings (saved so a reload keeps them). */
  update(patch: Partial<V3Save>, fx: Fx = null) {
    if (this.locked && fx) return;
    this.error = null;
    this.commit(
      (v) => ({ next: { ...v, ...patch, state: { ...v.state, seq: v.state.seq + 1 } }, ok: true }),
      (applied) => applied && this.play(fx),
    );
  }
  clearError() {
    this.error = null;
    this.emit();
  }
  /** Start a new day (the page asks first). seq keeps growing so other tabs follow. */
  restart() {
    this.error = null;
    this.commit(
      (v) => {
        // the finished day stays on record (R1-b: play again keeps the last game)
        const r = v.state.results[v.state.results.length - 1];
        const past: Past[] = r ? [...(v.history ?? []), { soldCount: r.soldCount, result: r.result, cashClose: v.state.cash, decor: r.decor }].slice(-5) : (v.history ?? []);
        return { next: { ...blankV3(), history: past, state: { ...newGuided(), seq: v.state.seq + 1 } }, ok: true };
      },
      (applied) => {
        if (applied) this.last = null;
      },
    );
  }
}
