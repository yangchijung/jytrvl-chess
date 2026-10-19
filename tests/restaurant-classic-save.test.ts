// Classic (V2) save protection added with V3 R1-b: an unreadable save is never overwritten.
import { afterEach, describe, expect, it } from 'vitest';
import { newGame } from '../shared/restaurant/engine';
import { KEY, RestaurantController } from '../src/restaurant/game';
import { backupKey } from '../src/doodle/storage';

class Memory {
  data = new Map<string, string>();
  failBackup = false;
  silent = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failBackup && k.includes('.backup-')) throw new Error('QuotaExceededError');
    if (!this.silent) this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
const use = (m: Memory) => {
  g.localStorage = m;
  g.window = { localStorage: m, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }) };
};
afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe('classic restaurant save protection', () => {
  it('an unreadable save is backed up and read back before the day starts over', () => {
    const m = new Memory();
    m.data.set(KEY, '{"version":1,"cash":-5}');
    use(m);
    const c = new RestaurantController();
    expect(c.invalid).toBe(true);
    expect(m.getItem(backupKey('{"version":1,"cash":-5}', KEY))).toBe('{"version":1,"cash":-5}');
    c.dispatch({ t: 'toBuy' });
    expect(c.saveState).toBe('saved');
    expect(JSON.parse(m.getItem(KEY)!).phase).toBe('buy');
  });

  it('when the backup fails, the unreadable original is never overwritten; play continues in the alternate key', () => {
    const m = new Memory();
    m.data.set(KEY, 'not json');
    m.failBackup = true;
    use(m);
    const c = new RestaurantController();
    c.dispatch({ t: 'toBuy' });
    expect(m.getItem(KEY)).toBe('not json');
    expect(JSON.parse(m.getItem(`${KEY}.recovered`)!).phase).toBe('buy');
    expect(c.saveState).toBe('saved');
  });

  it('“saved” is only shown when the text reads back', () => {
    const m = new Memory();
    use(m);
    const c = new RestaurantController();
    m.silent = true;
    c.dispatch({ t: 'toBuy' });
    expect(c.saveState).toBe('failed');
  });

  it('a newer save from another tab is adopted instead of being overwritten', () => {
    const m = new Memory();
    m.data.set(KEY, JSON.stringify(newGame()));
    use(m);
    const a = new RestaurantController();
    const b = new RestaurantController();
    b.dispatch({ t: 'toBuy' });
    a.dispatch({ t: 'setPlan', dish: 'tomato_egg_rice', n: 5 });
    expect(JSON.parse(m.getItem(KEY)!).phase).toBe('buy');
    expect(a.s.phase).toBe('buy');
    expect(a.otherTab).toBe(true);
  });
});
