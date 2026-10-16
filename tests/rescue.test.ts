import { describe, expect, it } from 'vitest';
import { ROUTE_IDS, run, solutions, validMission, type Mission, type RouteId } from '../shared/rescue/engine';
import { MISSIONS } from '../shared/rescue/missions';

const M = (id: string) => MISSIONS.find((m) => m.id === id)!;
const routeOf = (m: Mission, kind: string) => ROUTE_IDS.find((r) => m.routes[r] === kind) as RouteId;

describe('planet rescue crew rules', () => {
  it('a good plan succeeds and reports deliveries in order', () => {
    const r = run(M('M2'), [
      { route: 'yellow', cargo: ['plank', 'battery'] },
      { route: 'yellow', cargo: ['panel', 'cable'] },
    ]);
    expect(r.ok).toBe(true);
    expect(r.events.map((e) => e.t)).toEqual(['depart', 'fix_bridge', 'deliver', 'depart', 'deliver']);
    expect(r.delivered).toEqual({ battery: 1, panel: 1, cable: 1 });
  });

  it('each problem stops the run with a cause, not a person', () => {
    const m2 = M('M2');
    expect(run(m2, [{ route: 'yellow', cargo: ['battery', 'panel'] }]).problem).toMatchObject({ t: 'bridge_broken', trip: 0 });
    expect(run(m2, [{ route: 'red', cargo: ['battery'] }]).problem).toMatchObject({ t: 'blocked' });
    expect(run(m2, [{ route: 'yellow', cargo: ['plank', 'battery', 'panel'] }]).problem).toMatchObject({ t: 'over_capacity', load: 3, capacity: 2 });
    expect(run(m2, [{ route: 'yellow', cargo: ['battery', 'battery'] }]).problem).toMatchObject({ t: 'not_in_storage', item: 'battery', have: 1 });
    expect(run(m2, [{ route: 'blue', cargo: ['battery'] }, { route: 'yellow', cargo: ['plank'] }]).problem).toMatchObject({ t: 'out_of_time', used: 3, time: 2 });
    expect(run(M('M3'), [{ route: 'red', cargo: ['battery'] }]).problem).toMatchObject({ t: 'no_heavy', item: 'battery' });
    expect(run(m2, [{ route: 'yellow', cargo: ['plank', 'battery'] }]).problem).toMatchObject({ t: 'missing', items: { panel: 1, cable: 1 } });
    expect(run(m2, [{ route: null, cargo: ['battery'] }]).problem).toMatchObject({ t: 'no_route' });
    expect(run(m2, [{ route: 'yellow', cargo: [] }]).problem).toMatchObject({ t: 'empty' });
    expect(run(m2, [{ route: null, cargo: [] }]).problem).toMatchObject({ t: 'missing' }); // untouched trips are ignored
  });

  it('the bridge needs one plank once, then stays fixed', () => {
    const m4 = M('M4');
    const r = run(m4, [
      { route: 'red', cargo: ['plank', 'battery', 'battery'] },
      { route: 'red', cargo: ['cable', 'cable', 'water'] },
    ]);
    expect(r.ok).toBe(true);
    expect(r.events.filter((e) => e.t === 'fix_bridge')).toHaveLength(1);
  });

  it('every mission is valid and solvable within its time', () => {
    for (const m of MISSIONS) {
      expect(validMission(m)).toBe(true);
      const s = solutions(m, 3);
      expect(s.length).toBeGreaterThan(0);
      for (const p of s) expect(run(m, p).ok).toBe(true);
    }
  });

  it('every mission needs each role: ignoring one role card makes a natural plan fail', () => {
    for (const m of MISSIONS) {
      const needList = Object.entries(m.needs).flatMap(([i, n]) => Array(n).fill(i));
      // without the engineer: carry something the base does not need
      const unneeded = (Object.keys(m.storage) as (keyof typeof m.storage)[]).find((i) => !m.needs[i])!;
      const safe = routeOf(m, 'open') ?? routeOf(m, 'long') ?? routeOf(m, 'bridge');
      expect(run(m, [{ route: safe, cargo: [unneeded] }]).ok).toBe(false);
      // without the supplier: capacity, stock or "heavy" decides the plan (too much cargo, or a heavy part on the shortcut)
      const overload = run(m, [{ route: safe, cargo: [...needList, ...needList].slice(0, m.capacity + 1) }]).problem?.t;
      expect(['over_capacity', 'not_in_storage']).toContain(overload);
      // without the navigator: some route is a trap for the needed cargo
      const traps = ROUTE_IDS.filter((r) => !run(m, [{ route: r, cargo: needList.slice(0, m.capacity) }]).ok && run(m, [{ route: r, cargo: needList.slice(0, m.capacity) }]).problem?.t !== 'missing');
      expect(traps.length).toBeGreaterThan(0);
    }
  });

  it('rejects malformed missions', () => {
    expect(validMission({ ...MISSIONS[0], capacity: 0 })).toBe(false);
    expect(validMission({ ...MISSIONS[0], routes: { red: 'lava', yellow: 'open', blue: 'open' } })).toBe(false);
    expect(validMission({ ...MISSIONS[0], needs: {} })).toBe(false);
    expect(validMission(undefined)).toBe(false);
  });
});
