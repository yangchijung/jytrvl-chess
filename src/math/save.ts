// Math Island — anonymous single-device progress (spec §5, MA04).
// Loading reuses the protected loader (an unreadable or newer save is copied aside first, never overwritten).
// Multi-tab: one verifiable single writer per game, held with a Web Lock for the life of the tab. Another tab
// of the same game opens view-only and can take over ("改在這裡玩"), which ends the first tab's writing at once.
// This is not the restaurant's "read twice" approach and is not claimed to be atomic without Web Locks: in a
// browser without them (none of the targets: Safari 15.4+, Chrome, Edge, Firefox) the tab writes with a
// compare-before-write check and the page says that other tabs are not coordinated.
import { loadKeyed, type Notice, type Store } from '../doodle/storage';

export type Role = 'writer' | 'viewer' | 'uncoordinated';
export type SaveStatus = 'ok' | 'failed' | 'none';

interface Reader<T> {
  key: string;
  read: (get: () => string | null) => { kind: 'ok'; save: T } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };
  blank: () => T;
  valid: (x: unknown) => x is T;
}

type LockManagerLike = {
  request: (name: string, opts: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown) => Promise<void> | void) => Promise<unknown>;
};
const locksOf = (): LockManagerLike | null => {
  try {
    const l = (globalThis.navigator as unknown as { locks?: LockManagerLike } | undefined)?.locks;
    return l && typeof l.request === 'function' ? l : null;
  } catch {
    return null;
  }
};

export class Progress<T> {
  v: T;
  role: Role = 'writer';
  notice: Notice;
  status: SaveStatus = 'none';
  /** the text this tab last read or wrote: used to notice another tab's change */
  private base: string | null = null;
  private target: string | null;
  private store: Store | null;
  private release: (() => void) | null = null;
  private subs = new Set<() => void>();
  private gone = false;

  constructor(
    private cfg: Reader<T>,
    store?: Store,
  ) {
    let s: Store | null = null;
    try {
      s = store ?? window.localStorage;
    } catch {
      s = null;
    }
    this.store = s;
    const l = loadKeyed<T>({ key: cfg.key, read: cfg.read, blank: cfg.blank }, s ?? undefined);
    this.v = l.s;
    this.target = l.target;
    this.notice = l.notice;
    this.base = this.readRaw();
  }

  private readRaw(): string | null {
    if (!this.store || !this.target) return null;
    try {
      return this.store.getItem(this.target);
    } catch {
      return null;
    }
  }

  get canSave() {
    return this.target !== null;
  }

  subscribe(f: () => void) {
    this.subs.add(f);
    return () => this.subs.delete(f);
  }
  private emit() {
    for (const f of this.subs) f();
  }

  /** Ask to be the single writer; without the lock this tab stays view-only until takeOver(). */
  start() {
    const locks = locksOf();
    if (!locks) {
      this.role = 'uncoordinated';
      this.emit();
      return;
    }
    this.role = 'viewer'; // until the lock is granted
    this.hold(locks, { ifAvailable: true });
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }

  private hold(locks: LockManagerLike, opts: { ifAvailable?: boolean; steal?: boolean }) {
    locks
      .request(`lock:${this.cfg.key}`, opts, (lock) => {
        if (this.gone) return;
        if (!lock) {
          this.role = 'viewer';
          this.emit();
          return;
        }
        this.role = 'writer';
        this.adoptStored(); // the newest progress, in case another tab wrote before handing over
        this.emit();
        return new Promise<void>((res) => (this.release = res));
      })
      .catch(() => {
        // the lock was taken by another tab ("play here instead" there): stop writing at once
        if (this.gone) return;
        this.release = null;
        this.role = 'viewer';
        this.emit();
      });
  }

  /** "改在這裡玩": take the single-writer lock from the other tab. */
  takeOver() {
    const locks = locksOf();
    if (!locks || this.role === 'writer') return;
    this.hold(locks, { steal: true });
  }

  stop() {
    this.gone = true;
    this.release?.();
    this.release = null;
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
    this.subs.clear();
  }

  /** Read what is stored now (an event's own snapshot may be stale) and show it if it is valid. */
  private adoptStored(): boolean {
    const raw = this.readRaw();
    if (raw === null || raw === this.base) return false;
    const r = this.cfg.read(() => raw);
    if (r.kind !== 'ok') return false;
    this.v = r.save;
    this.base = raw;
    return true;
  }

  private onStorage = (e: StorageEvent) => {
    if (!this.target || (e.key !== null && e.key !== this.target)) return;
    if (this.role === 'writer') return; // the single writer's own state is the newest
    if (this.adoptStored()) this.emit();
  };

  /**
   * Commit one finished action (never an animation frame). Returns false when this tab may not write; then the
   * state is left unchanged so a view-only tab never shows progress that was not saved.
   */
  commit(next: T): boolean {
    if (this.role === 'viewer') return false;
    if (this.role === 'uncoordinated' && this.adoptStored()) {
      // another tab changed it since this tab last looked: show that instead of overwriting it
      this.status = 'none';
      this.emit();
      return false;
    }
    this.v = next;
    const text = JSON.stringify(next);
    if (!this.target || !this.store || !this.cfg.valid(next)) {
      this.status = this.target ? 'failed' : 'none';
      this.emit();
      return true;
    }
    let ok = false;
    try {
      this.store.setItem(this.target, text);
      ok = this.store.getItem(this.target) === text;
    } catch {
      ok = false;
    }
    this.status = ok ? 'ok' : 'failed';
    if (ok) this.base = text;
    this.emit();
    return true;
  }
}

/** Read-only peek for the island page ("continue at problem 3"); never writes or backs anything up. */
export function peek<T>(cfg: Pick<Reader<T>, 'key' | 'read'>, store?: Store): T | null {
  try {
    const s = store ?? window.localStorage;
    const r = cfg.read(() => s.getItem(cfg.key));
    return r.kind === 'ok' ? r.save : null;
  } catch {
    return null;
  }
}
