import { describe, expect, it } from 'vitest';
import { run, solve, validLevel, turn, type Level } from '../shared/robot/engine';
import { LEVELS } from '../shared/robot/levels';

const L1 = LEVELS[0];

describe('robot engine', () => {
  it('turns clockwise / counter-clockwise', () => {
    expect(turn('N', 'right')).toBe('E');
    expect(turn('N', 'left')).toBe('W');
  });
  it('delivering is success; reaching the door without the parcel is not', () => {
    expect(run(L1, ['forward', 'forward', 'pick', 'forward', 'forward', 'drop']).outcome).toBe('success');
    expect(run(L1, ['forward', 'forward', 'forward', 'forward']).outcome).toBe('incomplete');
  });
  it('stops at the first error and reports which step (bump / wrong door / nothing to pick)', () => {
    const r = run(L1, ['forward', 'forward', 'pick', 'forward', 'forward', 'forward']);
    expect(r).toMatchObject({ outcome: 'error', errorAt: 5, error: 'bump' });
    expect(r.steps.at(-1)!.robot.x).toBe(4); // did not move into the wall
    expect(run(L1, ['pick']).error).toBe('nothing_to_pick');
    expect(run(L1, ['drop']).error).toBe('not_carrying');
    const lv4 = LEVELS[3];
    const toRed = ['forward', 'forward', 'pick', 'forward', 'forward', 'right', 'forward', 'forward', 'drop'] as Level['blocks'];
    // R04 blue parcel at (2,2): going to the red door and dropping is a wrong door
    expect(run(lv4, toRed).error).toBe('wrong_door');
  });
  it('a longer but correct program also succeeds', () => {
    expect(run(L1, ['left', 'right', 'forward', 'forward', 'pick', 'right', 'left', 'forward', 'forward', 'drop']).outcome).toBe('success');
  });
  it('carries one parcel at a time', () => {
    const lv: Level = { ...L1, parcels: [{ color: 'blue', x: 1, y: 1 }, { color: 'red', x: 1, y: 1 }], doors: [{ color: 'blue', x: 4, y: 1 }, { color: 'red', x: 0, y: 1 }] };
    expect(run(lv, ['forward', 'pick', 'pick']).error).toBe('hands_full');
  });
});

describe('provisional levels', () => {
  it('are valid and solvable within maxBlocks; the found solution replays to success', () => {
    for (const lv of LEVELS) {
      expect(validLevel(lv), lv.id).toBe(true);
      const sol = solve(lv);
      expect(sol, lv.id).not.toBeNull();
      expect(sol!.length).toBeLessThanOrEqual(lv.maxBlocks);
      expect(run(lv, sol!).outcome, lv.id).toBe('success');
    }
  });
  it('rejects malformed levels', () => {
    expect(validLevel({ ...L1, w: 1 })).toBe(false);
    expect(validLevel({ ...L1, parcels: [{ color: 'green', x: 1, y: 1 }] })).toBe(false);
    expect(validLevel({ ...L1, doors: [] })).toBe(false);
    expect(validLevel({ ...L1, walls: [[0, 1]] })).toBe(false); // wall on the start
  });
});
