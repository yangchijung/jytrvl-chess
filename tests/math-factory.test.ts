import { describe, expect, it } from 'vitest';
import { FACTORY_PROBLEMS, SOURCE, answerFactory, blankFactory, choicesOfF, counts, finishedF, moveItem, nextFactory, readFactory, restartFactory, validFactory, type FactorySave } from '../shared/math/factory';
import { APPLE_KEY, blankApple, readApple, validApple, moveApple } from '../shared/math/apple';
import { FACTORY_KEY } from '../shared/math/factory';
import { Progress } from '../src/math/save';
import { CLIPS } from '../src/math/audio';

/** put item i into box (i mod boxes): an even share */
const shareEvenly = (s: FactorySave) => s.at.reduce((acc, _, i) => moveItem(acc, i, i % FACTORY_PROBLEMS[s.index].boxes).s, s);
/** independent check of "how many per box": count by repeated subtraction, not with the program's division */
const perBox = (total: number, boxes: number) => {
  let left = total,
    each = 0;
  while (left >= boxes) {
    left -= boxes;
    each++;
  }
  return left === 0 ? each : NaN;
};

describe('Packing Factory model (MA03)', () => {
  it('has the five fixed exact-division problems from the spec, in order, never dividing by 0', () => {
    expect(FACTORY_PROBLEMS.map((p) => `${p.total}/${p.boxes}`)).toEqual(['12/3', '18/3', '8/2', '10/2', '15/3']);
    for (const p of FACTORY_PROBLEMS) {
      expect(p.boxes).toBeGreaterThan(0);
      expect(Number.isInteger(perBox(p.total, p.boxes))).toBe(true);
    }
  });

  it('three different legal choices, exactly one equal to the independently counted share', () => {
    FACTORY_PROBLEMS.forEach((p, i) => {
      const c = choicesOfF(p, i);
      expect(new Set(c).size).toBe(3);
      expect(c.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
      expect(c.filter((n) => n === perBox(p.total, p.boxes))).toHaveLength(1);
    });
  });

  it('12 shared as 5/4/3 is never accepted, even though the total is right; then all shared, then equal, then the number', () => {
    let s = blankFactory();
    expect(answerFactory(s, 4).r).toBe('notAll');
    const plan = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2]; // 5 / 4 / 3
    plan.forEach((b, i) => (s = moveItem(s, i, b).s));
    expect(counts(s)).toEqual([5, 4, 3]);
    for (const n of choicesOfF(FACTORY_PROBLEMS[0], 0)) expect(answerFactory(s, n).r).toBe('unequal');
    s = moveItem(s, 0, 2).s; // 4 / 4 / 4
    expect(counts(s)).toEqual([4, 4, 4]);
    s = moveItem(s, 11, SOURCE).s; // one back on the belt
    expect(answerFactory(s, 4).r).toBe('notAll');
    s = moveItem(s, 11, 2).s;
    expect(answerFactory(s, 3).r).toBe('wrong');
    expect(answerFactory(s, 3).s).toBe(s);
    const ok = answerFactory(s, 4);
    expect(ok.r).toBe('right');
    expect(moveItem(ok.s, 0, 1).r).toBe('locked');
    expect(answerFactory(ok.s, 4).r).toBe('locked');
  });

  it('moves never duplicate or lose items; impossible targets are ignored', () => {
    let s = blankFactory();
    for (let k = 0; k < 5; k++) s = moveItem(s, 3, 1).s;
    expect(s.at).toHaveLength(12);
    expect(counts(s)).toEqual([0, 1, 0]);
    expect(moveItem(s, 3, 1).r).toBe('same');
    expect(moveItem(s, 3, 3).r).toBe('ignored');
    expect(moveItem(s, 3, -2).r).toBe('ignored');
    expect(moveItem(s, 12, 0).r).toBe('ignored');
    expect(moveItem(s, 0, 1.5).r).toBe('ignored');
    // items can move between boxes and back
    s = moveItem(s, 3, 2).s;
    s = moveItem(s, 3, SOURCE).s;
    expect(s.at.every((a) => a === SOURCE)).toBe(true);
  });

  it('all five problems in order; restart; finished; strict reader', () => {
    let s = blankFactory();
    s = restartFactory(moveItem(s, 0, 0).s);
    expect(s.at.every((a) => a === SOURCE)).toBe(true);
    for (let k = 0; k < 5; k++) {
      const p = FACTORY_PROBLEMS[s.index];
      s = answerFactory(shareEvenly(s), perBox(p.total, p.boxes)).s;
      expect(s.solved).toBe(true);
      expect(validFactory(s)).toBe(true);
      s = nextFactory(s);
    }
    expect(finishedF(s)).toBe(true);
    expect(validFactory(s)).toBe(true);
    const good = blankFactory();
    expect(readFactory(() => JSON.stringify(good)).kind).toBe('ok');
    for (const bad of [{ ...good, game: 'apple' }, { ...good, at: good.at.slice(1) }, { ...good, at: good.at.map(() => 3) }, { ...good, solved: true }, { ...good, at: [5, 4, 3].flatMap((n, b) => Array(n).fill(b)), solved: true }]) expect(readFactory(() => JSON.stringify(bad)).kind).toBe('broken');
  });

  it('the two games use separate saves: neither reads the other', () => {
    expect(FACTORY_KEY).not.toBe(APPLE_KEY);
    expect(readApple(() => JSON.stringify(blankFactory())).kind).toBe('broken');
    expect(readFactory(() => JSON.stringify(blankApple())).kind).toBe('broken');
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const a = new Progress({ key: APPLE_KEY, read: readApple, blank: () => blankApple(), valid: validApple }, st);
    const f = new Progress({ key: FACTORY_KEY, read: readFactory, blank: () => blankFactory(), valid: validFactory }, st);
    a.start();
    f.start();
    a.commit(moveApple(a.v, 0, 'basket').s);
    f.commit(moveItem(f.v, 0, 1).s);
    expect(JSON.parse(m.get(APPLE_KEY)!).game).toBe('apple');
    expect(JSON.parse(m.get(FACTORY_KEY)!).at[0]).toBe(1);
  });

  it('every factory clip has text; the right-answer sentences match the problems', () => {
    expect(CLIPS.factory_right_01).toBe('3 盒，每盒 4 個，一共 12 個。');
    expect(CLIPS.factory_right_05).toBe('3 盒，每盒 5 個，一共 15 個。');
    expect(Object.keys(CLIPS).filter((k) => k.startsWith('factory_'))).toHaveLength(12);
  });
});
