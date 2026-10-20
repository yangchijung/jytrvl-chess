// R3-S1: two tabs on the same V3 game must never undo each other's meals, payments or purchases.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apply, available, buyRows, newGuided, panItems, type Action, type State } from '../shared/restaurant/engine';
import { V3Controller, V3_KEY, blankV3, type V3Save } from '../src/restaurant/v3';

class Memory {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}
let n = 0;
const act = (s: State, a: Record<string, unknown>) => {
  const r = apply(s, { id: `x${n++}`, ...a } as Action);
  expect(r.error).toBeUndefined();
  return r.s;
};
const bought = () => {
  const s = act(newGuided(), { t: 'toBuy' });
  return act(s, { t: 'purchase', packs: Object.fromEntries(buyRows(s).map((r) => [r.item, r.suggested])) });
};
const seed = (state: State, extra: Partial<V3Save> = {}) => {
  const m = new Memory();
  m.setItem(V3_KEY, JSON.stringify({ ...blankV3(), state, ...extra }));
  return m;
};
const stored = (m: Memory) => JSON.parse(m.getItem(V3_KEY)!) as V3Save;
/** controllers whose storage events never arrive (the delayed-event window) */
const tab = (m: Memory) => {
  const c = new V3Controller(m);
  (c as unknown as { lockUntil: number }).lockUntil = 0;
  return c;
};
const unlock = (c: V3Controller) => ((c as unknown as { lockUntil: number }).lockUntil = 0);

// modern browsers: Web Locks serialise every commit (here the lock is granted at once)
const nav = globalThis as unknown as { navigator?: unknown };
const realNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const withLocks = () =>
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (_n: string, fn: () => void) => (fn(), Promise.resolve()) } } });
const noLocks = () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
afterAll(() => {
  if (realNav) Object.defineProperty(globalThis, 'navigator', realNav);
  else delete nav.navigator;
});

describe('restaurant V3: two tabs on one game (R3-S1, with Web Locks)', () => {
  beforeAll(withLocks);
  it('same base: a stale pan change after another tab cooked does not erase the meal; the stale tab adopts it and asks for a new tap', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    expect(available(stored(m).state).egg).toBe(5);
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } });
    expect(stored(m).state.servings).toHaveLength(1);
    expect(available(stored(m).state).egg).toBe(5);
    expect(a.conflict).toBe(true);
    expect(a.otherTab).toBe(true);
    expect(a.v.state.servings).toHaveLength(1); // adopted the full newer game
    expect(a.v.draft.items).toEqual([]); // the stale tap was not applied
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } }); // tapping again works on the new base
    expect(stored(m).draft.items).toEqual(['rice']);
    expect(stored(m).state.servings).toHaveLength(1);
    expect(a.conflict).toBe(false);
    expect(a.saveState).toBe('saved');
  });

  it('a payment in one tab is never rolled back or replayed by the other', () => {
    const cooked = act(bought(), { t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    const m = seed(cooked);
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(stored(m).state.cash).toBe(415);
    // the stale tab tries to serve the same plate to the same guest: adopted instead, no second payment
    a.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(stored(m).state.cash).toBe(415);
    expect(stored(m).state.ledger.filter((l) => l.kind === 'sale')).toHaveLength(1);
    expect(stored(m).state.orders[0].status).toBe('sold');
    expect(a.v.state.cash).toBe(415);
    expect(a.conflict).toBe(true);
  });

  it('interleaved writes: purchase, cook, serve and the plant each land once and in order', () => {
    const m = seed(newGuided());
    const a = tab(m),
      b = tab(m);
    a.dispatch({ t: 'toBuy' });
    b.dispatch({ t: 'toBuy' }); // stale: adopts "buy" instead of replaying
    expect(b.conflict).toBe(true);
    unlock(b);
    const packs = Object.fromEntries(buyRows(b.v.state).map((r) => [r.item, r.suggested]));
    b.dispatch({ t: 'purchase', packs });
    unlock(a);
    a.dispatch({ t: 'purchase', packs }); // stale again: no second purchase
    expect(stored(m).state.cash).toBe(383);
    expect(stored(m).state.ledger.filter((l) => l.kind === 'purchase')).toHaveLength(1);
    expect(a.v.state.phase).toBe('serve');
    unlock(a);
    a.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    unlock(b);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') }); // stale: adopt, no extra cook
    expect(stored(m).state.servings).toHaveLength(1);
    unlock(b);
    b.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(stored(m).state.cash).toBe(415);
  });

  it('closing choices: a plant bought in one tab is not bought again or undone by a stale preview in the other', () => {
    // play a whole day in one state, then open two tabs at closing
    let s = bought();
    for (const [o, d] of [
      [0, 'tomato_egg_rice'],
      [1, 'vegetable_egg_rice'],
      [2, 'tomato_egg_rice'],
      [3, 'vegetable_egg_rice'],
      [4, 'tomato_egg_rice'],
      [5, 'vegetable_egg_rice'],
    ] as const) {
      s = act(s, { t: 'cook', dish: d, items: panItems(d) });
      s = act(s, { t: 'serve', order: o, dish: d });
    }
    expect(s.phase).toBe('closed');
    const m = seed(s);
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'decor', buy: true });
    a.update({ plantPreview: true });
    unlock(a);
    a.dispatch({ t: 'decor', buy: true });
    expect(stored(m).state.cash).toBe(414);
    expect(stored(m).state.decor).toEqual(['plant']);
    expect(stored(m).plantPreview).toBe(false);
  });

  it('a stale tab’s “play again” does not wipe a newer game started elsewhere; after adopting, it can restart', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    a.restart();
    expect(stored(m).state.servings).toHaveLength(1); // not wiped
    expect(a.conflict).toBe(true);
    a.restart(); // now on the newest base: a deliberate restart works
    expect(stored(m).state.phase).toBe('plan');
    expect(stored(m).state.cash).toBe(500);
    expect(stored(m).state.seq).toBeGreaterThan(b.v.state.seq);
  });

  it('a storage event from the other tab is adopted immediately (no conflict needed)', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    (a as unknown as { onStorage: (e: { key: string; newValue: string }) => void }).onStorage({ key: V3_KEY, newValue: m.getItem(V3_KEY)! });
    expect(a.v.state.servings).toHaveLength(1);
    a.update({ draft: { dish: 'vegetable_egg_rice', items: ['rice'] } });
    expect(a.conflict).toBe(false);
    expect(stored(m).draft.items).toEqual(['rice']);
    expect(stored(m).state.servings).toHaveLength(1);
  });
});

describe('restaurant V3: without Web Locks (R3-S2) and late storage events (R3-S3)', () => {
  beforeAll(noLocks);
  it('S2: another tab writing between this tab’s read and write is caught by the second look; the meal stays', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    const get = m.getItem.bind(m);
    let armed = true;
    m.getItem = (k: string) => {
      const v = get(k);
      if (armed && k === V3_KEY) {
        armed = false;
        b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
      }
      return v;
    };
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } });
    expect(stored(m).state.servings).toHaveLength(1);
    expect(available(stored(m).state).egg).toBe(5);
    expect(a.conflict).toBe(true);
    expect(a.v.state.servings).toHaveLength(1);
  });

  it('S2: after a write race is caught, this tab stops writing (view-only) until the child takes over', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    const get = m.getItem.bind(m);
    let calls = 0;
    m.getItem = (k: string) => {
      const v = get(k);
      // B writes after A's first look but before A's second look (a genuine simultaneous write)
      if (k === V3_KEY && ++calls === 1) b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
      return v;
    };
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } });
    m.getItem = get;
    expect(a.readOnly).toBe(true);
    unlock(a);
    a.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(stored(m).state.cash).toBe(383); // view-only: nothing written
    unlock(b);
    b.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' }); // the other tab keeps playing
    expect(stored(m).state.cash).toBe(415);
    a.takeOver();
    expect(a.readOnly).toBe(false);
    expect(a.v.state.cash).toBe(415); // adopted the newest progress
    unlock(a);
    a.update({ draft: { dish: 'vegetable_egg_rice', items: ['rice'] } });
    expect(stored(m).draft.items).toEqual(['rice']);
    expect(stored(m).state.cash).toBe(415);
  });

  it('S2: tabs used one after another (no simultaneous write) adopt and keep playing without view-only', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } });
    expect(a.conflict).toBe(true);
    expect(a.readOnly).toBe(false);
    unlock(a);
    a.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(stored(m).state.cash).toBe(415);
  });

  it('S3: a late storage event with an older snapshot does not roll the screen back', () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    const older = m.getItem(V3_KEY)!;
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } }); // adopts B's game
    unlock(a);
    a.dispatch({ t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(a.v.state.cash).toBe(415);
    (a as unknown as { onStorage: (e: { key: string; newValue: string }) => void }).onStorage({ key: V3_KEY, newValue: older });
    expect(a.v.state.cash).toBe(415);
    expect(stored(m).state.cash).toBe(415);
  });

  it('a lock that cannot be had falls back to the guarded (two-look) path, never an unprotected write', async () => {
    const m = seed(bought());
    const a = tab(m),
      b = tab(m);
    b.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: () => Promise.reject(new Error('AbortError')) } } });
    a.update({ draft: { dish: 'tomato_egg_rice', items: ['rice'] } });
    await Promise.resolve();
    await Promise.resolve();
    expect(stored(m).state.servings).toHaveLength(1); // B's meal kept
    expect(a.conflict).toBe(true); // the change was seen and adopted
    expect(a.v.state.servings).toHaveLength(1);
    noLocks();
  });
});
