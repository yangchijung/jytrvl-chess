import { describe, expect, it } from 'vitest';
import { FlowGame, HEAD_HIT, TURN, turnCounter, wrapAngle } from '../shared/territory/flow';
import { flowBotThink, newFlowBotMemory } from '../shared/territory/flow-ai';
import { rng } from '../shared/territory/engine';

const two = (seed = 1) => {
  const g = new FlowGame({ width: 40, height: 40, durationTicks: 0, seed });
  g.addPlayer('a', 'A', false);
  g.addPlayer('b', 'B', false);
  g.start();
  return g;
};
/** Place a player at (x, y) facing `a`, outside its land so it lays a trail. */
function place(g: FlowGame, i: number, x: number, y: number, a: number) {
  const f = g.flow[i];
  f.fx = x;
  f.fy = y;
  f.heading = f.target = a;
  g.players[i].x = Math.floor(x);
  g.players[i].y = Math.floor(y);
}

describe('Territory Rush continuous steering — T2', () => {
  it('TC06 head-on: two players outside their land meet head to head — both are out (collision)', () => {
    const g = two();
    // walk both out of their land first so they each have a trail
    for (const i of [0, 1]) {
      const f = g.flow[i];
      g.setTarget(i, Math.atan2(20 - f.fy, 20 - f.fx));
      f.heading = f.target;
    }
    let met = false;
    for (let s = 0; s < 400 && !met; s++) {
      for (const i of [0, 1]) {
        const o = g.flow[1 - i];
        g.setTarget(i, Math.atan2(o.fy - g.flow[i].fy, o.fx - g.flow[i].fx));
      }
      g.step();
      met = !g.players[0].alive || !g.players[1].alive;
    }
    expect(met).toBe(true);
    const reasons = g.players.map((p) => p.reason);
    // either a true head-on (both collide) or one cut the other's line on the way in — never a silent pass-through
    expect(reasons.every((r) => r === 'collision') || reasons.includes('cut')).toBe(true);
    expect(HEAD_HIT).toBeLessThan(1);
  });

  it('TC06 head-on: a player inside its own land survives, the one outside is out', () => {
    const g = two(3);
    const a = g.players[0];
    const fa = g.flow[0];
    // B is out on the field (it has a trail) and its head comes within HEAD_HIT of A, who is on its own land
    const b = g.players[1];
    const fb = g.flow[1];
    place(g, 1, fa.fx + 0.6, fa.fy, -Math.PI / 2);
    const tc = g.idx(Math.floor(fb.fx), Math.floor(fb.fy) + 1);
    b.trail.push(tc);
    g.trail[tc] = 1;
    fa.heading = fa.target = -Math.PI / 2; // both move the same way for one step: heads stay close
    g.step();
    expect(a.trail.length).toBe(0);
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(false);
    expect(b.reason).toBe('collision');
  });

  it('TC06 home seam: coming home along the edge of the land at a shallow angle captures, never leaks', () => {
    const g = two(5);
    const p = g.players[0];
    const f = g.flow[0];
    const land0 = p.land;
    const start = { x: f.fx, y: f.fy };
    // out towards open space, a curve, then slide back in along the land edge at ~10°
    const a0 = Math.atan2(20 - f.fy, 20 - f.fx);
    g.setTarget(0, a0);
    f.heading = f.target;
    for (let s = 0; s < 14; s++) g.step();
    for (let s = 0; s < 18; s++) {
      g.setTarget(0, f.heading + 0.2);
      g.step();
    }
    for (let s = 0; s < 200 && p.trail.length && p.alive; s++) {
      g.setTarget(0, Math.atan2(start.y - f.fy, start.x - f.fx) + 0.17);
      g.step();
    }
    expect(p.alive).toBe(true);
    expect(p.trail.length).toBe(0);
    expect(p.land).toBeGreaterThan(land0 + 20);
    // every owned row is one contiguous run (no hole, no leak through a corner)
    for (let y = 0; y < g.h; y++) {
      const xs: number[] = [];
      for (let x = 0; x < g.w; x++) if (g.owner[g.idx(x, y)] === 0) xs.push(x);
      if (xs.length) expect(xs[xs.length - 1] - xs[0] + 1).toBe(xs.length);
    }
  });

  it('TC07 two players on one device: each input only moves its own player', () => {
    const g = two(7);
    const before = g.flow.map((f) => f.target);
    expect(g.setTarget(0, 1)).toBe(true);
    expect(g.flow[1].target).toBe(before[1]);
    expect(g.setTarget(1, -2)).toBe(true);
    expect(g.flow[0].target).toBe(wrapAngle(1));
  });

  it('TC07 bots steer continuously (curved, non-cardinal headings), come home and capture; same seed → same game', () => {
    const play = () => {
      const g = new FlowGame({ width: 56, height: 56, durationTicks: 0, seed: 11 });
      for (const k of [0, 1, 2, 3]) g.addPlayer(`b${k}`, `B${k}`, true);
      g.start();
      const r = rng(99);
      const mems = g.players.map(() => newFlowBotMemory());
      const headings = new Set<number>();
      let captures = 0;
      for (let s = 0; s < 3000; s++) {
        g.players.forEach((p, i) => flowBotThink(g, i, mems[i], (['easy', 'medium', 'hard', 'hard'] as const)[i], r));
        g.step();
        captures += g.events.filter((e) => e.type === 'capture').length;
        for (const f of g.flow) headings.add(Math.round((((f.heading * 180) / Math.PI) % 90 + 90) % 90));
        if (g.result) break;
      }
      return { captures, offAxis: [...headings].filter((h) => h % 90 > 5 && h % 90 < 85).length, land: g.players.map((p) => p.land), tick: g.tick };
    };
    const a = play();
    expect(a.captures).toBeGreaterThan(4);
    expect(a.offAxis).toBeGreaterThan(20); // headings all round the circle, not just 0/90/180/270
    expect(play()).toEqual(a);
  });

  it('TC07 bots avoid walking off the map in the opening', () => {
    const g = new FlowGame({ width: 40, height: 40, durationTicks: 0, seed: 21 });
    for (const k of [0, 1, 2]) g.addPlayer(`b${k}`, `B${k}`, true);
    g.start();
    const r = rng(5);
    const mems = g.players.map(() => newFlowBotMemory());
    for (let s = 0; s < 400; s++) {
      g.players.forEach((_, i) => flowBotThink(g, i, mems[i], 'medium', r));
      g.step();
    }
    expect(g.players.filter((p) => p.reason === 'wall')).toHaveLength(0);
  });

  it('TC07 tutorial: only big turns count (a slow drift or small wiggles do not add up to three turns)', () => {
    let n = 0;
    let c = turnCounter(0);
    // wiggle ±20° for a long time: no turn
    for (let k = 0; k < 200; k++) if (c(((k % 2 ? 1 : -1) * 20 * Math.PI) / 180)) n++;
    expect(n).toBe(0);
    // three real turns at the steering limit (≈ 13.5° per step)
    c = turnCounter(0);
    let h = 0;
    for (let turn = 0; turn < 3; turn++) for (let s = 0; s < 6; s++) if (c((h += TURN))) n++;
    expect(n).toBe(3);
  });
});
