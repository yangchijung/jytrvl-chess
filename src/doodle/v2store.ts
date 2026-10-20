// Color Doodle V2 — loading, first-time import from V1 and saving with one verifiable writer per browser.
// Loading reuses the protected loader (an unreadable or newer V2 document is copied aside first). The import
// from V1 happens only when no V2 document exists at all, and only reads the V1 keys. Multi-tab: the tab that
// holds the Web Lock writes; another tab opens view-only and can take over ("改在這裡玩"), which ends the
// first tab's writing at once. Without Web Locks the page says tabs are not coordinated (never claimed atomic).
import { loadKeyed, KEY as V1_KEY, type Notice, type Store } from './storage';
import { readSave } from '../../shared/doodle/model';
import { SCENE_KEY, readScene } from '../../shared/doodle/scene';
import { V2_KEY, blankV2, fromV1, readV2, validV2, type SavedV2 } from '../../shared/doodle/v2';

export type Role = 'writer' | 'viewer' | 'uncoordinated';
export type SaveStatus = 'ok' | 'failed' | 'none';

type LockManagerLike = { request: (name: string, opts: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown) => Promise<void> | void) => Promise<unknown> };
const locksOf = (): LockManagerLike | null => {
  try {
    const l = (globalThis.navigator as unknown as { locks?: LockManagerLike } | undefined)?.locks;
    return l && typeof l.request === 'function' ? l : null;
  } catch {
    return null;
  }
};

export class DoodleStore {
  v: SavedV2;
  role: Role = 'writer';
  notice: Notice;
  oldRaw: string | null;
  status: SaveStatus = 'none';
  /** this tab built the V2 document from V1 data and has not written it yet */
  imported: boolean;
  private target: string | null;
  private store: Store | null;
  private base: string | null = null;
  private release: (() => void) | null = null;
  private subs = new Set<() => void>();
  private gone = false;

  constructor(given?: Store) {
    let st: Store | null = null;
    try {
      st = given ?? window.localStorage;
    } catch {
      st = null;
    }
    this.store = st;
    let hadV2 = true;
    try {
      hadV2 = st ? st.getItem(V2_KEY) !== null : true;
    } catch {
      hadV2 = true;
    }
    const first = () => {
      if (hadV2 || !st) return blankV2();
      const m = readSave(() => st!.getItem(V1_KEY));
      const sc = readScene(() => st!.getItem(SCENE_KEY));
      return fromV1(m.kind === 'ok' ? m.save : null, sc.kind === 'ok' ? sc.save : null);
    };
    const l = loadKeyed<SavedV2>({ key: V2_KEY, read: readV2, blank: first }, st ?? undefined);
    this.v = l.s;
    this.target = l.target;
    this.notice = l.notice;
    this.oldRaw = l.oldRaw;
    this.imported = !hadV2 && this.v.origin === 'v1';
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

  start() {
    this.gone = false;
    const locks = locksOf();
    if (!locks) {
      this.role = 'uncoordinated';
      this.writeImport();
      this.emit();
      return;
    }
    this.role = 'viewer';
    this.hold(locks, { ifAvailable: true });
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }
  /** The imported document is written right away, so a later V1 change can never be imported again. */
  private writeImport() {
    if (this.imported && this.readRaw() === null) this.commit(this.v);
    this.imported = false;
  }
  private hold(locks: LockManagerLike, opts: { ifAvailable?: boolean; steal?: boolean }) {
    locks
      .request(`lock:${V2_KEY}`, opts, (lock) => {
        if (this.gone) return;
        if (!lock) {
          this.role = 'viewer';
          this.emit();
          return;
        }
        this.role = 'writer';
        this.adoptStored();
        this.writeImport();
        this.emit();
        return new Promise<void>((res) => (this.release = res));
      })
      .catch(() => {
        if (this.gone) return;
        this.release = null;
        this.role = 'viewer';
        this.emit();
      });
  }
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
  /** Show what is stored now (a storage event's own snapshot may be stale). */
  private adoptStored(): boolean {
    const raw = this.readRaw();
    if (raw === null || raw === this.base) return false;
    const r = readV2(() => raw);
    if (r.kind !== 'ok') return false;
    this.v = r.save;
    this.base = raw;
    return true;
  }
  private onStorage = (e: StorageEvent) => {
    if (!this.target || (e.key !== null && e.key !== this.target) || this.role === 'writer') return;
    if (this.adoptStored()) this.emit();
  };

  /**
   * Save one finished change. Returns false when this tab may not write (view-only): the caller keeps showing
   * the stored state. "Saved" only when what was written reads back exactly.
   */
  commit(next: SavedV2): boolean {
    if (this.role === 'viewer') return false;
    if (this.role === 'uncoordinated' && this.base !== null && this.adoptStored()) {
      this.status = 'none';
      this.emit();
      return false;
    }
    this.v = next;
    const text = JSON.stringify(next);
    if (!this.target || !this.store || !validV2(next)) {
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
