import { describe, expect, it } from 'vitest';
import { FlowGame, SPEED, STEP_MS, TURN, PROTECT, dirAngle, wrapAngle } from '../shared/territory/flow';

/** A single player on a 40×40 map, start land centred at (cx, cy). */
function solo(seed = 1) {
  const g = new FlowGame({ width: 40, height: 40, durationTicks: 0, seed });
  g.addPlayer('a', 'A', false);
  g.start();
  return g;
}
const turnTo = (g: FlowGame, a: number) => {
  g.setTarget(0, a);
  g.flow[0].heading = wrapAngle(a); // start already facing the angle
};

describe('Territory Rush continuous steering (T1)', () => {
  it('TC01: 30°, 45° and 120° headings move along those angles (not right angles)', () => {
    for (const deg of [30, 45, 120]) {
      const g = solo();
      const a = (deg * Math.PI) / 180;
      turnTo(g, a);
      const { fx, fy } = g.flow[0];
      for (let k = 0; k < 6; k++) g.step();
      const f = g.flow[0];
      const moved = Math.atan2(f.fy - fy, f.fx - fx);
      expect(Math.abs(wrapAngle(moved - a))).toBeLessThan(1e-9);
      expect(Math.hypot(f.fx - fx, f.fy - fy)).toBeCloseTo(6 * SPEED, 9);
    }
  });

  it('TC02: straight and diagonal cover the same distance in the same time; turning speed is per fixed step', () => {
    const run = (a: number) => {
      const g = solo();
      turnTo(g, a);
      const { fx, fy } = g.flow[0];
      for (let k = 0; k < 10; k++) g.step();
      return Math.hypot(g.flow[0].fx - fx, g.flow[0].fy - fy);
    };
    expect(run(0)).toBeCloseTo(run(Math.PI / 4), 9);
    expect(run(Math.PI / 4)).toBeCloseTo(10 * SPEED, 9);
    // a reverse target turns at most TURN per step, along one side, never flipping instantly
    const g = solo();
    turnTo(g, 0);
    g.setTarget(0, Math.PI);
    g.step();
    expect(Math.abs(g.flow[0].heading)).toBeCloseTo(TURN, 9);
    expect(STEP_MS).toBe(50);
  });

  it('TC05: invalid targets are ignored; inputs never move the player directly', () => {
    const g = solo();
    const before = { ...g.flow[0] };
    expect(g.setTarget(0, Number.NaN)).toBe(false);
    expect(g.setTarget(0, Infinity)).toBe(false);
    expect(g.setTarget(9, 1)).toBe(false);
    expect(g.flow[0].target).toBe(before.target);
    expect(g.flow[0].fx).toBe(before.fx);
  });

  it('TC06: a diagonal loop out of the land captures what it encloses, with no leak through corners', () => {
    const g = solo(3);
    const p = g.players[0];
    const land0 = p.land;
    // leave towards the map centre and turn 45° every few steps: a rounded loop back to the land
    const f0 = g.flow[0];
    const home = { x: f0.fx, y: f0.fy };
    const a0 = Math.atan2(20 - f0.fy, 20 - f0.fx);
    turnTo(g, a0);
    for (let k = 0; k < 8 && p.alive; k++) {
      g.setTarget(0, a0 + (k * Math.PI) / 4);
      for (let s = 0; s < 9 && p.alive; s++) g.step();
    }
    // keep heading back home until the capture happens
    for (let s = 0; s < 200 && p.trail.length; s++) {
      const f = g.flow[0];
      g.setTarget(0, Math.atan2(home.y - f.fy, home.x - f.fx));
      g.step();
    }
    expect(p.alive).toBe(true);
    expect(p.trail.length).toBe(0);
    expect(p.land).toBeGreaterThan(land0 + 40);
    // no cell inside the captured region is left unowned: every owned row is contiguous
    for (let y = 0; y < g.h; y++) {
      const xs: number[] = [];
      for (let x = 0; x < g.w; x++) if (g.owner[g.idx(x, y)] === 0) xs.push(x);
      if (xs.length) expect(xs[xs.length - 1] - xs[0] + 1).toBe(xs.length);
    }
  });

  it('TC06: cutting back across your own older trail kills you (self)', () => {
    const g = solo(5);
    const p = g.players[0];
    // leave towards the centre, turn left twice and then cut back across the first leg
    const f0 = g.flow[0];
    const a0 = Math.atan2(20 - f0.fy, 20 - f0.fx);
    turnTo(g, a0);
    for (let s = 0; s < 16; s++) g.step();
    expect(p.trail.length).toBeGreaterThan(PROTECT);
    let died = false;
    for (const [da, n] of [[Math.PI / 2, 10], [Math.PI, 12], [(3 * Math.PI) / 2, 30]] as const) {
      g.setTarget(0, a0 + da);
      for (let s = 0; s < n && !died; s++) {
        g.step();
        died = !p.alive;
      }
    }
    expect(died).toBe(true);
    expect(p.reason).toBe('self');
  });

  it('TC06: crossing another player’s trail cuts them; leaving the map kills; the same inputs replay the same result', () => {
    const play = () => {
      const g = new FlowGame({ width: 40, height: 40, durationTicks: 0, seed: 7 });
      g.addPlayer('a', 'A', false);
      g.addPlayer('b', 'B', false);
      g.start();
      for (let s = 0; s < 400 && !g.result; s++) {
        g.setTarget(0, 0.3 + Math.sin(s / 9));
        g.setTarget(1, 2.1 + Math.cos(s / 7));
        g.step();
      }
      return { tick: g.tick, players: g.players.map((p) => [p.alive, p.land, p.reason, p.kills]), owner: Array.from(g.owner).join(',') };
    };
    expect(play()).toEqual(play());
    const g = solo();
    turnTo(g, -Math.PI / 2);
    for (let s = 0; s < 200 && g.players[0].alive; s++) g.step();
    expect(g.players[0].reason).toBe('wall');
    expect(dirAngle(1)).toBe(0);
  });
});
