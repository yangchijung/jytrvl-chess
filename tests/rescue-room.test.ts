import { describe, expect, it } from 'vitest';
import { deal, effectiveHost, join, newRoom, reduce, rolesOf, type RescueRoomState } from '../shared/rescue/room';

const P = (n: number) => ({ playerId: `p${n}`, userId: n === 1 ? 'u1' : null, name: `P${n}` });
const room = (n: number): RescueRoomState => {
  let s = newRoom('ABCDEF', null, 'M2');
  for (let i = 1; i <= n; i++) s = join(s, P(i), Array.from({ length: i - 1 }, (_, k) => k));
  return s;
};
const all = [0, 1, 2];

describe('rescue online room', () => {
  it('deals one role each to three people, two to someone in a pair', () => {
    const s3 = room(3);
    expect(s3.roles).toEqual({ navigator: 0, engineer: 1, supplier: 2 });
    expect(s3.hostId).toBe('p1');
    const s2 = room(2);
    expect(rolesOf(s2, 0)).toEqual(['navigator', 'supplier']);
    expect(rolesOf(s2, 1)).toEqual(['engineer']);
    expect(deal([], 0).navigator).toBeNull();
  });

  it('a fourth person only watches; a newcomer can take the seat of someone who left', () => {
    const s = room(3);
    expect(join(s, P(4), all).seats.map((x) => x.playerId)).toEqual(['p1', 'p2', 'p3']);
    const t = join(s, P(4), [0, 1]); // p3 left
    expect(t.seats[2].playerId).toBe('p4');
    expect(t.roles.supplier).toBe(2);
    const h = join(s, P(5), [1, 2]); // host p1 left
    expect(h.seats[0].playerId).toBe('p5');
    expect(h.hostId).toBe('p5');
  });

  it('only the holder can confirm a role; editing the plan clears confirmations', () => {
    let s = room(3);
    expect(reduce(s, 'p2', { t: 'ok', role: 'navigator', on: true }, all).error).toBe('not_your_role');
    s = reduce(s, 'p1', { t: 'ok', role: 'navigator', on: true }, all).state;
    expect(s.oks).toEqual(['navigator']);
    s = reduce(s, 'p3', { t: 'plan', plan: [{ route: 'yellow', cargo: ['plank', 'battery'] }, { route: null, cargo: [] }] }, all).state;
    expect(s.oks).toEqual([]);
    expect(reduce(s, 'p3', { t: 'plan', plan: [{ route: 'lava' as never, cargo: [] }, { route: null, cargo: [] }] }, all).error).toBe('bad_plan');
    expect(reduce(s, 'p9', { t: 'go' }, all).error).toBe('not_seated');
  });

  it('go needs a team of two, all three confirmations, then runs the shared engine', () => {
    let one = room(1);
    one = reduce(one, 'p1', { t: 'ok', role: 'navigator', on: true }, [0]).state;
    expect(reduce(one, 'p1', { t: 'go' }, [0]).error).toBe('need_team');
    let s = room(3);
    const plan = [
      { route: 'yellow' as const, cargo: ['plank' as const, 'battery' as const] },
      { route: 'yellow' as const, cargo: ['panel' as const, 'cable' as const] },
    ];
    s = reduce(s, 'p2', { t: 'plan', plan }, all).state;
    expect(reduce(s, 'p2', { t: 'go' }, all).error).toBe('need_confirm');
    for (const [p, r] of [['p1', 'navigator'], ['p2', 'engineer'], ['p3', 'supplier']] as const) s = reduce(s, p, { t: 'ok', role: r, on: true }, all).state;
    s = reduce(s, 'p3', { t: 'go' }, all).state;
    expect(s.result?.ok).toBe(true);
    expect(s.runId).toBe(1);
    expect(s.done).toEqual(['M2']);
    expect(reduce(s, 'p1', { t: 'plan', plan }, all).error).toBe('running');
    s = reduce(s, 'p2', { t: 'retry' }, all).state;
    expect(s.result).toBeNull();
    expect(s.plan).toEqual(plan);
  });

  it('host picks missions and deals roles again (offline host → first connected seat stands in)', () => {
    let s = room(3);
    expect(reduce(s, 'p2', { t: 'mission', id: 'M3' }, all).error).toBe('not_host');
    s = reduce(s, 'p1', { t: 'mission', id: 'M3' }, all).state;
    expect(s.missionId).toBe('M3');
    expect(s.plan).toHaveLength(3);
    s = reduce(s, 'p1', { t: 'rotate' }, all).state;
    expect(s.roles).toEqual({ navigator: 1, engineer: 2, supplier: 0 });
    expect(effectiveHost(s, [1, 2])).toBe(1);
    s = reduce(s, 'p2', { t: 'rotate' }, [1, 2]).state; // p1 offline: roles only for the two online
    expect(Object.values(s.roles).every((v) => v === 1 || v === 2)).toBe(true);
    expect(reduce(s, 'p1', { t: 'mission', id: 'X' }, all).error).toBe('bad_mission');
  });
});
