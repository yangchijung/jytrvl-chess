// Restaurant controller (V2 scene). The rules engine (shared/restaurant/engine.ts) is the only source of truth:
// every action is applied and saved first; animations only replay the committed result.
// - Each action has a unique id; resends are ignored by the engine.
// - Input is blocked while an animation plays or the game is paused (no double taps).
// - Restart asks first and keeps the sequence number growing, so other tabs adopt it instead of ignoring it.
// - The unsent shopping draft (manual pack counts) is saved too.
import { apply, newGame, validState, type Action, type ErrorCode, type State } from '../../shared/restaurant/engine';
import type { ItemId } from '../../shared/restaurant/data';

export const KEY = 'jy.restaurant.v1';
const DRAFT = 'jy.restaurant.v1.draft';
export type Op = Action extends infer A ? (A extends { id: string } ? Omit<A, 'id'> : never) : never;
export type Fx = 'select' | 'deliver' | 'cook' | 'serve' | 'nomatch' | 'night' | 'plant' | 'arrive' | null;

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const FX_MS: Record<Exclude<Fx, null>, number> = { select: 220, deliver: 850, cook: 800, serve: 750, nomatch: 500, night: 600, plant: 600, arrive: 500 };

export interface RView {
  s: State;
  error: ErrorCode | null;
  saveState: 'saved' | 'failed' | 'none';
  invalid: boolean;
  paused: boolean;
  fx: Fx;
  fxKey: number;
  /** last committed action, for the animation (e.g. which dish was served) */
  last: Op | null;
  draft: Partial<Record<ItemId, number>> | null;
  otherTab: boolean;
  version: number;
}

function reducedMotion() {
  if (typeof window === 'undefined') return true;
  return document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export class RestaurantController {
  s: State;
  error: ErrorCode | null = null;
  saveState: 'saved' | 'failed' | 'none' = 'none';
  invalid = false;
  paused = false;
  fx: Fx = null;
  fxKey = 0;
  last: Op | null = null;
  draft: Partial<Record<ItemId, number>> | null = null;
  otherTab = false;
  private fxTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private cached: RView | null = null;

  constructor() {
    let loaded: State | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        let x: unknown = null;
        try {
          x = JSON.parse(raw);
        } catch {
          /* unreadable */
        }
        if (validState(x)) loaded = x;
        else {
          this.invalid = true;
          localStorage.setItem(`${KEY}.unreadable.${Date.now()}`, raw);
        }
      }
      const d = localStorage.getItem(DRAFT);
      if (d) this.draft = JSON.parse(d);
    } catch {
      this.saveState = 'failed';
    }
    this.s = loaded ?? newGame();
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }
  dispose() {
    if (this.fxTimer) clearTimeout(this.fxTimer);
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
  }
  private onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const x = JSON.parse(e.newValue);
      if (validState(x) && x.seq > this.s.seq) {
        this.s = x;
        this.otherTab = true;
        this.endFx();
        this.emit();
      }
    } catch {
      /* ignore */
    }
  };

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = (): RView =>
    (this.cached ??= { s: this.s, error: this.error, saveState: this.saveState, invalid: this.invalid, paused: this.paused, fx: this.fx, fxKey: this.fxKey, last: this.last, draft: this.draft, otherTab: this.otherTab, version: this.version });
  private emit() {
    this.version++;
    this.cached = null;
    this.listeners.forEach((f) => f());
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
      this.saveState = 'saved';
    } catch {
      this.saveState = 'failed';
    }
  }

  get busy() {
    return this.paused || this.fx !== null;
  }

  private startFx(fx: Fx) {
    if (!fx || reducedMotion()) return;
    this.fx = fx;
    this.fxKey++;
    if (this.fxTimer) clearTimeout(this.fxTimer);
    this.fxTimer = setTimeout(() => this.endFx(true), FX_MS[fx]);
  }
  private endFx(emit = false) {
    if (this.fxTimer) clearTimeout(this.fxTimer);
    this.fxTimer = null;
    if (this.fx === null) return;
    this.fx = null;
    if (emit) this.emit();
  }
  /** Skip the current animation (the result is already committed). */
  skipFx() {
    this.endFx(true);
  }

  /** Applies an action: commit + save first, then play its animation. Ignored while paused or animating. */
  dispatch(op: Op, fx: Fx = null, id = uid()): ErrorCode | null {
    if (this.busy) return null;
    const r = apply(this.s, { ...op, id } as Action);
    this.error = r.error ?? null;
    if (!r.error && !r.duplicate) {
      this.s = r.s;
      this.last = op;
      this.otherTab = false;
      if (op.t === 'purchase') this.setDraft(null);
      this.save();
      this.startFx(fx);
    }
    this.emit();
    return this.error;
  }

  setDraft(d: Partial<Record<ItemId, number>> | null) {
    this.draft = d;
    try {
      if (d) localStorage.setItem(DRAFT, JSON.stringify(d));
      else localStorage.removeItem(DRAFT);
    } catch {
      /* draft is a convenience */
    }
    this.emit();
  }

  pause(on: boolean) {
    this.paused = on;
    this.emit();
  }

  /** Start over (the page asks for confirmation first). The sequence keeps growing so other tabs follow. */
  restart() {
    const seq = this.s.seq + 1;
    this.endFx();
    this.s = { ...newGame(), seq };
    this.error = null;
    this.invalid = false;
    this.paused = false;
    this.last = null;
    this.otherTab = false;
    this.setDraft(null);
    this.save();
    this.emit();
  }
  clearError() {
    this.error = null;
    this.emit();
  }
}
