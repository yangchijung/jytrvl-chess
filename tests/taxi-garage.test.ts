// Rush Taxi stage 5: the garage's saved cab and driver choice.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHOICE, GARAGE_KEY, loadChoice, saveChoice } from '../src/taxi/ui/garageChoice';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('garage choice', () => {
  it('defaults to the classic cab and grandpa when nothing is saved or there is no storage', () => {
    expect(loadChoice(memory())).toEqual(DEFAULT_CHOICE);
    expect(loadChoice(null)).toEqual(DEFAULT_CHOICE);
    expect(DEFAULT_CHOICE).toEqual({ car: 'classic', driver: 'abo' });
  });
  it('round-trips a choice under jy.taxi.garage', () => {
    const s = memory();
    saveChoice({ car: 'rocket', driver: 'jiejie' }, s);
    expect(JSON.parse(s.m.get(GARAGE_KEY)!)).toEqual({ car: 'rocket', driver: 'jiejie' });
    expect(loadChoice(s)).toEqual({ car: 'rocket', driver: 'jiejie' });
  });
  it('falls back per field on unknown ids and on broken JSON', () => {
    const s = memory();
    s.setItem(GARAGE_KEY, JSON.stringify({ car: 'tank', driver: 'ayi' }));
    expect(loadChoice(s)).toEqual({ car: 'classic', driver: 'ayi' });
    s.setItem(GARAGE_KEY, '{oops');
    expect(loadChoice(s)).toEqual(DEFAULT_CHOICE);
    s.setItem(GARAGE_KEY, 'null');
    expect(loadChoice(s)).toEqual(DEFAULT_CHOICE);
  });
  it('never throws when storage throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadChoice(bad)).toEqual(DEFAULT_CHOICE);
    expect(() => saveChoice({ car: 'swift', driver: 'xiaoge' }, bad)).not.toThrow();
  });
});
