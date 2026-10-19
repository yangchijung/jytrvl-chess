// Restaurant V3 controller (guided play, docs/product/RESTAURANT_PLAYFUL_V3.md). The rules engine is the only
// source of truth: every action is applied and saved first, animations only show the committed result.
// - Own versioned save `jy.restaurant.v3`; the classic save `jy.restaurant.v1` is never written from here.
// - Loading uses the same protection as Color Doodle (backup before any write, alternate key when the backup
//   fails, read-back before "saved"), but with this game's own schema.
// - Each action carries a unique id (resends are ignored by the engine); a short input lock stops double taps.
// - Another tab's newer save (higher seq) is adopted instead of being overwritten.
import { apply, newGuided, validState, type Action, type ErrorCode, type State } from '../../shared/restaurant/engine';
import { DISH_IDS, ITEM_IDS, type DishId, type ItemId } from '../../shared/restaurant/data';
import { loadKeyed, saveChecked, type Notice, type Read } from '../doodle/storage';

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
    typeof v.plantPreview === 'boolean'
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

  constructor(store?: Pick<Storage, 'getItem' | 'setItem'>) {
    const r = loadKeyed<V3Save>({ key: V3_KEY, read: readV3, blank: blankV3 }, store);
    this.v = r.s;
    this.target = r.target;
    this.notice = r.notice;
    this.oldRaw = r.oldRaw;
    this.saveState = r.target ? 'none' : 'failed';
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }
  dispose() {
    if (this.fxTimer) clearTimeout(this.fxTimer);
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
  }
  private onStorage = (e: StorageEvent) => {
    if (e.key !== this.target || !e.newValue) return;
    const r = readV3(() => e.newValue);
    if (r.kind === 'ok' && r.save.state.seq > this.v.state.seq) {
      this.v = r.save;
      this.otherTab = true;
      this.emit();
    }
  };

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = (): V3View =>
    (this.cached ??= { v: this.v, error: this.error, saveState: this.saveState, notice: this.notice, oldRaw: this.oldRaw, fx: this.fx, fxKey: this.fxKey, last: this.last, otherTab: this.otherTab });
  private emit() {
    this.cached = null;
    this.listeners.forEach((f) => f());
  }
  private save() {
    // a newer save from another tab is never overwritten by an older one
    try {
      const r = this.target ? readV3(() => localStorage.getItem(this.target!)) : null;
      if (r?.kind === 'ok' && r.save.state.seq > this.v.state.seq) {
        this.v = r.save;
        this.otherTab = true;
        return;
      }
    } catch {
      /* fall through to the checked write */
    }
    this.saveState = saveChecked(this.target, JSON.stringify(this.v), validV3) ? 'saved' : 'failed';
  }
  private play(fx: Fx) {
    this.lockUntil = Date.now() + 180; // no double taps, even without animation
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
  dispatch(op: Op, fx: Fx = null, after?: (v: V3Save) => Partial<V3Save>): ErrorCode | null {
    if (this.locked) return null;
    const r = apply(this.v.state, { ...op, id: uid() } as Action);
    this.error = r.error ?? null;
    if (!r.error && !r.duplicate) {
      const next = { ...this.v, state: r.s };
      this.v = { ...next, ...(after ? after(next) : {}) };
      this.last = op;
      this.otherTab = false;
      this.save();
      this.play(fx);
    } else if (r.error) this.play(op.t === 'serve' ? 'wrong' : null);
    this.emit();
    return this.error;
  }
  /** Pan / preview changes that are not bookings (saved so a reload keeps them). */
  update(patch: Partial<V3Save>, fx: Fx = null) {
    if (this.locked && fx) return;
    this.v = { ...this.v, ...patch, state: { ...this.v.state, seq: this.v.state.seq + 1 } };
    this.error = null;
    this.save();
    this.play(fx);
    this.emit();
  }
  clearError() {
    this.error = null;
    this.emit();
  }
  /** Start a new day (the page asks first). seq keeps growing so other tabs follow. */
  restart() {
    const seq = this.v.state.seq + 1;
    this.v = { ...blankV3(), state: { ...newGuided(), seq } };
    this.error = null;
    this.last = null;
    this.save();
    this.emit();
  }
}
