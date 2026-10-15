// Restaurant prototype controller: applies actions with unique ids and saves after every change, so a refresh
// restores the same plan, stock, meals, capacity and money; another tab adopts the newer saved state.
import { apply, newGame, validState, type Action, type ErrorCode, type State } from '../../shared/restaurant/engine';

const KEY = 'jy.restaurant.v1';
type Op = Action extends infer A ? (A extends { id: string } ? Omit<A, 'id'> : never) : never;
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export interface RView {
  s: State;
  error: ErrorCode | null;
  saveState: 'saved' | 'failed' | 'none';
  invalid: boolean;
  version: number;
}

export class RestaurantController {
  s: State;
  error: ErrorCode | null = null;
  saveState: 'saved' | 'failed' | 'none' = 'none';
  invalid = false;
  private listeners = new Set<() => void>();
  private version = 0;
  private cached: RView | null = null;

  constructor() {
    let loaded: State | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const x = JSON.parse(raw);
        if (validState(x)) loaded = x;
        else {
          this.invalid = true;
          localStorage.setItem(`${KEY}.unreadable.${Date.now()}`, raw);
        }
      }
    } catch {
      this.saveState = 'failed';
    }
    this.s = loaded ?? newGame();
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }
  dispose() {
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
  }
  private onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const x = JSON.parse(e.newValue);
      if (validState(x) && x.seq > this.s.seq) {
        this.s = x;
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
  snapshot = (): RView => (this.cached ??= { s: this.s, error: this.error, saveState: this.saveState, invalid: this.invalid, version: this.version });
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

  /** Applies an action; `id` may be passed to make a retry idempotent (tests). */
  dispatch(op: Op, id = uid()): ErrorCode | null {
    const r = apply(this.s, { ...op, id } as Action);
    this.error = r.error ?? null;
    if (!r.error && !r.duplicate) {
      this.s = r.s;
      this.save();
    }
    this.emit();
    return this.error;
  }

  restart() {
    this.s = newGame();
    this.error = null;
    this.invalid = false;
    this.save();
    this.emit();
  }
  clearError() {
    this.error = null;
    this.emit();
  }
}
