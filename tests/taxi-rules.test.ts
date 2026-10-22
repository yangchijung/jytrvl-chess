import { describe, expect, it } from 'vitest';
import { RULES, bandOf, newRun, rankOf, tick, tipFor, type CarNow } from '../src/taxi/gameplay/rules';
import { PLACES, STOPS } from '../src/taxi/gameplay/places';

const DT = 1 / 60;
const car = (x: number, z: number, o: Partial<CarNow> = {}): CarNow => ({ x, z, kmh: 0, drifting: false, airborne: false, landedAfter: 0, crash: false, nearMiss: false, ...o });
const run = (s: ReturnType<typeof newRun>, sec: number, c: CarNow) => {
  const all = [];
  for (let k = 0; k < Math.round(sec / DT); k++) all.push(...tick(s, DT, c, STOPS, PLACES));
  return all;
};

describe('Rush Taxi rules', () => {
  it('a run starts with 50 s, five people waiting, the first one close to the car (findable in 30 s)', () => {
    const s = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 });
    expect(s.time).toBe(50);
    expect(s.waiting).toHaveLength(RULES.waiting);
    const first = s.waiting[0];
    expect(Math.hypot(first.stop.x, first.stop.z + 60)).toBeLessThan(45);
    expect(new Set(s.waiting.map((p) => p.stop.id)).size).toBe(RULES.waiting);
    for (const p of s.waiting) expect(Math.hypot(p.stop.x - p.dest.x, p.stop.z - p.dest.z)).toBeGreaterThan(60);
  });

  it('bands: red near, yellow middle, green far; farther pays more and allows more time', () => {
    expect([bandOf(100), bandOf(200), bandOf(300)]).toEqual(['red', 'yellow', 'green']);
    const s = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 });
    const sorted = [...s.waiting].sort((a, b) => a.dist - b.dist);
    expect(sorted[sorted.length - 1].fare).toBeGreaterThan(sorted[0].fare);
    expect(sorted[sorted.length - 1].limit).toBeGreaterThan(sorted[0].limit);
  });

  it('pick up only by stopping in the circle: driving through fast does not count', () => {
    const s = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 });
    const p = s.waiting[0];
    run(s, 1, car(p.stop.x, p.stop.z, { kmh: 40 }));
    expect(s.rider).toBeNull();
    const ev = run(s, 0.5, car(p.stop.x + 1, p.stop.z, { kmh: 3 }));
    expect(s.rider?.id).toBe(p.id);
    expect(ev.some((e) => e.t === 'pickup')).toBe(true);
    expect(s.waiting).toHaveLength(RULES.waiting); // someone new waits elsewhere
    expect(s.firstPickupAt).not.toBeNull();
  });

  it('arriving quickly is Speedy (+5 s), later Normal (+2 s), late Slow (+0 s); the fare is paid', () => {
    for (const [wait, rating, bonus] of [
      [0.2, 'speedy', 5],
      [0.6, 'normal', 2],
      [0.85, 'slow', 0],
    ] as const) {
      const s = newRun('practice', STOPS, PLACES, { x: 0, z: -60 });
      const p = s.waiting[0];
      run(s, 0.5, car(p.stop.x, p.stop.z));
      run(s, p.limit * wait, car(500, 500, { kmh: 80 })); // driving somewhere
      const before = s.money;
      const ev = run(s, 0.4, car(p.dest.x, p.dest.z, { kmh: 5 }));
      const drop = ev.find((e) => e.t === 'drop');
      expect(drop && drop.t === 'drop' && drop.rating).toBe(rating);
      expect(drop && drop.t === 'drop' && drop.bonus).toBe(bonus);
      expect(s.money - before).toBe(p.fare);
      expect(s.rides).toBe(1);
    }
  });

  it('the clock: bonus seconds are added in arcade; the passenger leaves when their own time runs out', () => {
    const s = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 });
    const p = s.waiting[0];
    run(s, 0.5, car(p.stop.x, p.stop.z));
    const t0 = s.time;
    run(s, 1, car(500, 500, { kmh: 80 }));
    run(s, 0.4, car(p.dest.x, p.dest.z, { kmh: 5 }));
    expect(s.time).toBeCloseTo(t0 - 1.4 + 5, 1);
    const s2 = newRun('practice', STOPS, PLACES, { x: 0, z: -60 });
    const q = s2.waiting[0];
    run(s2, 0.5, car(q.stop.x, q.stop.z));
    const ev = run(s2, q.limit + 1, car(500, 500, { kmh: 80 }));
    expect(ev.some((e) => e.t === 'timeout')).toBe(true);
    expect(s2.rider).toBeNull();
  });

  it('tips: drifts and jumps with a passenger build the combo and the multiplier; a crash breaks it; nothing without a passenger', () => {
    const s = newRun('practice', STOPS, PLACES, { x: 0, z: -60 });
    run(s, 2, car(500, 500, { kmh: 80, drifting: true }));
    expect(s.combo).toBe(0); // empty taxi: no tips
    const p = s.waiting[0];
    run(s, 0.5, car(p.stop.x, p.stop.z));
    run(s, 3.05, car(500, 500, { kmh: 80, drifting: true })); // 3 drift stunts
    expect(s.combo).toBe(3);
    tick(s, DT, car(500, 500, { kmh: 80, landedAfter: 1.5 }), STOPS, PLACES); // big jump = 2
    expect(s.combo).toBe(5);
    expect(s.tips).toBe(tipFor(0) + tipFor(1) + tipFor(2) + tipFor(3) + tipFor(4));
    const ev = tick(s, DT, car(500, 500, { kmh: 80, crash: true }), STOPS, PLACES);
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(5);
    expect(ev.some((e) => e.t === 'crash')).toBe(true);
  });

  it('the run ends at 0 s with a rank; practice never ends', () => {
    const s = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 });
    const ev = run(s, 51, car(500, 500));
    expect(s.phase).toBe('over');
    expect(ev.filter((e) => e.t === 'over')).toHaveLength(1);
    expect([rankOf(0), rankOf(200), rankOf(400), rankOf(700), rankOf(1000)]).toEqual(['D', 'C', 'B', 'A', 'S']);
    const pr = newRun('practice', STOPS, PLACES, { x: 0, z: -60 });
    run(pr, 120, car(500, 500));
    expect(pr.phase).toBe('play');
  });

  it('the same seed gives the same passengers (deterministic)', () => {
    const a = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 }, 7);
    const b = newRun('arcade', STOPS, PLACES, { x: 0, z: -60 }, 7);
    expect(a.waiting.map((p) => `${p.stop.id}>${p.dest.id}`)).toEqual(b.waiting.map((p) => `${p.stop.id}>${p.dest.id}`));
  });
});
