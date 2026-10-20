import { describe, expect, it } from 'vitest';
import { APPLE_PROBLEMS, allIn, answerApple, blankApple, choicesOf, finished, itemsOf, moveApple, nextApple, readApple, restartApple, validApple, type AppleSave } from '../shared/math/apple';
import { SNAP_PX, distToBox, snapTo } from '../src/math/place';
import { Progress } from '../src/math/save';
import { APPLE_KEY } from '../shared/math/apple';

const putAll = (s: AppleSave) => s.at.reduce((acc, _, i) => moveApple(acc, i, 'basket').s, s);

describe('Apple Basket model (MA03, MR01)', () => {
  it('has the five fixed problems from the spec, in order', () => {
    expect(APPLE_PROBLEMS.map((p) => `${p.a}+${p.b}`)).toEqual(['3+4', '2+3', '4+1', '1+2', '4+4']);
  });

  it('every problem offers three different legal choices with exactly one correct, independently checked', () => {
    APPLE_PROBLEMS.forEach((p, i) => {
      const c = choicesOf(p, i);
      expect(new Set(c).size).toBe(3);
      expect(c.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
      const total = itemsOf(p).length; // counted from the objects, not from a + b
      expect(c.filter((n) => n === total)).toHaveLength(1);
    });
    // the right answer is not always in the same place
    expect(new Set(APPLE_PROBLEMS.map((p, i) => choicesOf(p, i).indexOf(p.a + p.b))).size).toBeGreaterThan(1);
  });

  it('MR01: the correct number does not finish the problem until both piles are in the basket', () => {
    let s = blankApple();
    expect(answerApple(s, 7).r).toBe('notReady');
    for (const i of [0, 1, 2]) s = moveApple(s, i, 'basket').s; // only group a
    expect(answerApple(s, 7).r).toBe('notReady');
    s = moveApple(s, 3, 'basket').s;
    s = moveApple(s, 4, 'basket').s;
    s = moveApple(s, 5, 'basket').s; // one apple still out
    const r = answerApple(s, 7);
    expect(r.r).toBe('notReady');
    expect(r.s).toBe(s);
    s = moveApple(s, 6, 'basket').s;
    expect(allIn(s)).toBe(true);
    expect(answerApple(s, 6).r).toBe('wrong');
    expect(answerApple(s, 6).s).toBe(s); // a wrong answer keeps the work
    const ok = answerApple(s, 7);
    expect(ok.r).toBe('right');
    expect(ok.s.solved).toBe(true);
    expect(ok.s.done).toEqual(['g1-apple-01']);
    // answering again, or a number that is not offered, changes nothing
    expect(answerApple(ok.s, 7).r).toBe('locked');
    expect(answerApple(s, 99).r).toBe('ignored');
  });

  it('moves are idempotent: repeated taps never add or lose apples; the total is conserved', () => {
    let s = blankApple();
    for (let k = 0; k < 5; k++) s = moveApple(s, 0, 'basket').s;
    expect(s.at.filter((x) => x === 'basket')).toHaveLength(1);
    expect(s.at).toHaveLength(7);
    expect(moveApple(s, 0, 'basket').r).toBe('same');
    expect(moveApple(s, 9, 'basket').r).toBe('ignored');
    expect(moveApple(s, -1, 'basket').r).toBe('ignored');
    s = moveApple(s, 0, 'pile').s; // taking one back
    expect(s.at.every((x) => x === 'pile')).toBe(true);
    // after solving, apples are locked in place
    const solved = answerApple(putAll(s), 7).s;
    expect(moveApple(solved, 0, 'pile').r).toBe('locked');
  });

  it('next only after a correct answer; start over resets the current problem; five problems then finished', () => {
    let s = blankApple();
    expect(nextApple(s)).toBe(s);
    s = moveApple(s, 0, 'basket').s;
    s = restartApple(s);
    expect(s.at.every((x) => x === 'pile')).toBe(true);
    for (let k = 0; k < APPLE_PROBLEMS.length; k++) {
      const p = APPLE_PROBLEMS[s.index];
      s = answerApple(putAll(s), p.a + p.b).s;
      expect(s.solved).toBe(true);
      s = nextApple(s);
    }
    expect(finished(s)).toBe(true);
    expect(s.done).toHaveLength(5);
    expect(validApple(s)).toBe(true);
  });

  it('strict reader: unreadable, inconsistent or newer saves are not guessed', () => {
    expect(readApple(() => null).kind).toBe('empty');
    expect(readApple(() => '{').kind).toBe('broken');
    const good = blankApple();
    expect(readApple(() => JSON.stringify(good)).kind).toBe('ok');
    const bad = [
      { ...good, schemaVersion: 2 },
      { ...good, at: ['pile'] },
      { ...good, at: good.at.map(() => 'basket'), solved: true, index: 9 },
      { ...good, solved: true }, // solved but apples still out
      { ...good, done: ['g1-apple-01', 'g1-apple-01'] },
      { ...good, at: good.at.map(() => 'floor') },
    ];
    for (const b of bad) expect(readApple(() => JSON.stringify(b)).kind).toBe('broken');
    expect(readApple(() => {
      throw new Error('blocked');
    }).kind).toBe('noStorage');
  });
});

describe('placement rule (MA02, MR04)', () => {
  const basket = { id: 'basket' as const, box: { left: 100, top: 100, right: 200, bottom: 200 } };
  const pile = { id: 'pile' as const, box: { left: 280, top: 100, right: 380, bottom: 200 } };
  it('uses the distance from the object centre to the target area: 47 and 48 px snap, 49 px does not', () => {
    expect(SNAP_PX).toBe(48);
    expect(distToBox(150, 150, basket.box)).toBe(0);
    expect(snapTo(100 - 47, 150, [basket])).toMatchObject({ kind: 'target', id: 'basket' });
    expect(snapTo(100 - 48, 150, [basket])).toMatchObject({ kind: 'target', id: 'basket' });
    expect(snapTo(100 - 49, 150, [basket])).toEqual({ kind: 'none' });
    // corner: true distance, not a box widened by 48 on each side
    expect(snapTo(100 - 40, 100 - 40, [basket])).toEqual({ kind: 'none' }); // 56.6 px away
    expect(snapTo(100 - 30, 100 - 30, [basket])).toMatchObject({ kind: 'target' }); // 42.4 px
  });
  it('nearest target wins; an exact tie is ambiguous (never a random pick); bad input never snaps', () => {
    expect(snapTo(230, 150, [basket, pile])).toMatchObject({ kind: 'target', id: 'basket' });
    expect(snapTo(260, 150, [basket, pile])).toMatchObject({ kind: 'target', id: 'pile' });
    expect(snapTo(240, 150, [basket, pile])).toEqual({ kind: 'ambiguous', ids: ['basket', 'pile'] });
    expect(snapTo(Number.NaN, 150, [basket])).toEqual({ kind: 'none' });
  });
});

/** A store with getItem/setItem; optionally failing writes. */
function mem(init: Record<string, string> = {}, failWrites = false) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
  };
}
const cfg = { key: APPLE_KEY, read: readApple, blank: () => blankApple(), valid: validApple };
const noLocks = () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
/** A minimal Web Locks stand-in: one holder per name, ifAvailable and steal. */
function fakeLocks() {
  const held = new Map<string, { reject: (e: Error) => void; release: () => void }>();
  const request = (name: string, opts: { ifAvailable?: boolean; steal?: boolean }, cb: (l: unknown) => Promise<void> | void) =>
    new Promise((resolve, reject) => {
      const cur = held.get(name);
      if (cur && opts.ifAvailable) return Promise.resolve(cb(null)).then(resolve, reject);
      if (cur && opts.steal) {
        held.delete(name);
        cur.reject(Object.assign(new Error('stolen'), { name: 'AbortError' }));
      }
      let release = () => {};
      held.set(name, { reject, release: () => release() });
      Promise.resolve(cb({ name })).then(
        (v) => {
          if (held.get(name)?.reject === reject) held.delete(name);
          resolve(v);
        },
        reject,
      );
      release = () => resolve(undefined);
    });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request } } });
}
const flush = async () => {
  for (let k = 0; k < 5; k++) await Promise.resolve();
};

describe('progress saving (MA04)', () => {
  it('half-done and solved states survive a reload; a failed write is reported, never called saved', () => {
    noLocks();
    const st = mem();
    const a = new Progress(cfg, st);
    a.start();
    a.commit(moveApple(a.v, 0, 'basket').s);
    expect(a.status).toBe('ok');
    expect(new Progress(cfg, st).v.at[0]).toBe('basket');
    const full = mem({}, true);
    const b = new Progress(cfg, full);
    b.start();
    b.commit(moveApple(b.v, 0, 'basket').s);
    expect(b.status).toBe('failed');
    expect(b.v.at[0]).toBe('basket'); // the child keeps playing
  });

  it('an unreadable save is kept aside untouched and play starts from problem 1', () => {
    noLocks();
    const st = mem({ [APPLE_KEY]: '{"broken' });
    const a = new Progress(cfg, st);
    expect(a.notice).toBe('broken');
    expect([...st.m.values()]).toContain('{"broken');
    a.start();
    a.commit(moveApple(a.v, 0, 'basket').s);
    expect([...st.m.entries()].some(([k, v]) => k.includes('.backup-') && v === '{"broken')).toBe(true);
  });

  it('with Web Locks a second tab is view-only; taking over stops the first tab writing; no lost progress', async () => {
    fakeLocks();
    const st = mem();
    const a = new Progress(cfg, st);
    a.start();
    await flush();
    expect(a.role).toBe('writer');
    const b = new Progress(cfg, st);
    b.start();
    await flush();
    expect(b.role).toBe('viewer');
    a.commit(moveApple(a.v, 0, 'basket').s);
    expect(b.commit(moveApple(b.v, 1, 'basket').s)).toBe(false); // refused, nothing written
    expect(JSON.parse(st.getItem(APPLE_KEY)!).at.slice(0, 2)).toEqual(['basket', 'pile']);
    b.takeOver();
    await flush();
    expect(b.role).toBe('writer');
    expect(a.role).toBe('viewer');
    expect(b.v.at[0]).toBe('basket'); // adopted what A had saved
    expect(a.commit(moveApple(a.v, 2, 'basket').s)).toBe(false);
    b.commit(moveApple(b.v, 1, 'basket').s);
    expect(JSON.parse(st.getItem(APPLE_KEY)!).at.slice(0, 3)).toEqual(['basket', 'basket', 'pile']);
    a.stop();
    b.stop();
  });

  it('without Web Locks it reports that tabs are not coordinated and never overwrites a newer change it sees', () => {
    noLocks();
    const st = mem();
    const a = new Progress(cfg, st);
    const b = new Progress(cfg, st);
    a.start();
    b.start();
    expect(a.role).toBe('uncoordinated');
    a.commit(moveApple(a.v, 0, 'basket').s);
    expect(b.commit(moveApple(b.v, 1, 'basket').s)).toBe(false); // B first shows A's change
    expect(b.v.at[0]).toBe('basket');
    expect(b.commit(moveApple(b.v, 1, 'basket').s)).toBe(true);
    expect(JSON.parse(st.getItem(APPLE_KEY)!).at.slice(0, 2)).toEqual(['basket', 'basket']);
  });
});
