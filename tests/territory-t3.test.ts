// Territory Rush T3 — online continuous steering: what the server sends is enough for a page to rebuild
// exactly what the server simulates (snapshot + per-tick changes), and old four-way snapshots still load.
import { describe, expect, it } from 'vitest';
import { TerritoryGame, rng } from '../shared/territory/engine';
import { FL_FIELDS, FlowGame } from '../shared/territory/flow';
import { flowBotThink, newFlowBotMemory } from '../shared/territory/flow-ai';

function server(n = 4, seed = 7) {
  const g = new FlowGame({ width: 40, height: 40, durationTicks: 4000, seed });
  for (let k = 0; k < n; k++) g.addPlayer(`p${k}`, `P${k}`, true);
  g.start();
  const brains = g.players.map((_, k) => ({ mem: newFlowBotMemory(), rand: rng(seed + k * 7919) }));
  const step = () => {
    g.players.forEach((p, k) => p.alive && flowBotThink(g, k, brains[k].mem, 'medium', brains[k].rand));
    g.step();
    const pl: number[] = [];
    for (const p of g.players) pl.push(p.x, p.y, p.dir, p.alive ? 1 : 0, p.land, p.kills, p.bestLand);
    return { n: g.tick, pl, oc: g.ownerChanges.flatMap((c) => [c.i, c.v]), tc: g.trailChanges.flatMap((c) => [c.i, c.v]), fl: g.flowTick() };
  };
  return { g, step };
}
/** The page side of src/territory/online.ts, without the DOM. */
function applyTick(c: FlowGame, m: { n: number; pl: number[]; oc: number[]; tc: number[]; fl: number[] }) {
  c.tick = m.n;
  c.players.forEach((p, k) => {
    const o = k * 7;
    [p.x, p.y, p.dir] = [m.pl[o], m.pl[o + 1], m.pl[o + 2] as 0 | 1 | 2 | 3];
    p.alive = m.pl[o + 3] === 1;
    [p.land, p.kills, p.bestLand] = [m.pl[o + 4], m.pl[o + 5], m.pl[o + 6]];
  });
  for (let i = 0; i < m.oc.length; i += 2) c.owner[m.oc[i]] = m.oc[i + 1];
  for (let i = 0; i < m.tc.length; i += 2) {
    const [cell, v, was] = [m.tc[i], m.tc[i + 1], c.trail[m.tc[i]]];
    if (was >= 0 && was !== v) {
      const tr = c.players[was].trail;
      const at = tr.indexOf(cell);
      if (at >= 0) tr.splice(at, 1);
    }
    if (v >= 0 && was !== v) c.players[v].trail.push(cell);
    c.trail[cell] = v;
  }
  c.applyFlowTick(m.fl);
}

describe('Territory T3 online continuous steering', () => {
  it('a page rebuilt from a mid-game snapshot and then fed ticks matches the server for 600 steps', () => {
    const { g, step } = server(4, 11);
    for (let k = 0; k < 120; k++) step();
    const snap = JSON.parse(JSON.stringify({ snap: g.snapshot(), flow: g.flowPublic() })); // over the wire
    const c = FlowGame.fromFlowSnapshot(snap.snap, snap.flow);
    let outSeen = 0;
    for (let k = 0; k < 600; k++) {
      applyTick(c, JSON.parse(JSON.stringify(step())));
      expect(Array.from(c.owner)).toEqual(Array.from(g.owner));
      expect(Array.from(c.trail)).toEqual(Array.from(g.trail));
      g.players.forEach((p, i) => {
        const [fs, fc] = [g.flow[i], c.flow[i]];
        expect(Math.abs(fs.fx - fc.fx)).toBeLessThan(1e-3);
        expect(Math.abs(fs.fy - fc.fy)).toBeLessThan(1e-3);
        expect(Math.abs(fs.heading - fc.heading)).toBeLessThan(1e-3);
        expect(c.players[i].alive).toBe(p.alive);
        expect(new Set(c.players[i].trail)).toEqual(new Set(p.trail));
        // the drawn line exists exactly while the player is out
        if (p.alive) expect(fc.path.length > 0).toBe(p.trail.length > 0);
        if (p.trail.length) outSeen++;
      });
      if (g.result) break;
    }
    expect(outSeen).toBeGreaterThan(100); // players really went out and came home during the check
    expect(g.flowTick().length).toBe(g.players.length * FL_FIELDS);
  });

  it('a reconnect snapshot taken while players are out carries their lines', () => {
    const { g, step } = server(3, 5);
    let k = 0;
    while (!g.players.some((p) => p.alive && p.trail.length > 6) && k++ < 2000) step();
    const out = g.players.findIndex((p) => p.alive && p.trail.length > 6);
    expect(out).toBeGreaterThanOrEqual(0);
    const c = FlowGame.fromFlowSnapshot(JSON.parse(JSON.stringify(g.snapshot())), JSON.parse(JSON.stringify(g.flowPublic())));
    expect(c.flow[out].path.length).toBeGreaterThan(3);
    expect(new Set(c.players[out].trail)).toEqual(new Set(g.players[out].trail));
    expect(c.flow[out].target).toBeCloseTo(g.flow[out].target, 3);
  });

  it('old four-way snapshots still load as four-way games; bad continuous data falls back to the cell position', () => {
    const t = new TerritoryGame({ width: 30, height: 30, durationTicks: 100, seed: 1 });
    t.addPlayer('a', 'A', false);
    t.addPlayer('b', 'B', true);
    t.start();
    for (let k = 0; k < 10; k++) t.step();
    const back = TerritoryGame.fromSnapshot(JSON.parse(JSON.stringify(t.snapshot())));
    expect(back).not.toBeInstanceOf(FlowGame);
    expect(back.players.map((p) => [p.x, p.y])).toEqual(t.players.map((p) => [p.x, p.y]));
    const f = FlowGame.fromFlowSnapshot(t.snapshot(), [{ fx: NaN, fy: 1, h: 0, t: 0, path: [] }]);
    expect(f.flow[0].fx).toBe(t.players[0].x + 0.5);
    expect(f.flow[1].fy).toBe(t.players[1].y + 0.5);
  });
});

describe('Territory T3 autopilot', () => {
  it('the autopilot that takes over a disconnected player who is out with a trail brings it home (no wall run)', () => {
    let homeAgain = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = new FlowGame({ width: 48, height: 48, durationTicks: 4000, seed });
      g.addPlayer('h', 'Human', false);
      g.addPlayer('b', 'Bot', true);
      g.start();
      // the human goes out 8 cells in its start direction, then disconnects
      for (let k = 0; k < 16; k++) g.step();
      if (!g.players[0].alive || !g.players[0].trail.length) continue;
      const mem = newFlowBotMemory(), bm = newFlowBotMemory(), r = rng(seed), rb = rng(seed + 9);
      let back = false;
      for (let k = 0; k < 200 && g.players[0].alive && !back; k++) {
        flowBotThink(g, 0, mem, 'medium', r);
        if (g.players[1].alive) flowBotThink(g, 1, bm, 'medium', rb);
        g.step();
        if (g.players[0].alive && g.players[0].trail.length === 0) back = true;
      }
      expect(g.players[0].reason).not.toBe('wall');
      if (back) homeAgain++;
    }
    expect(homeAgain).toBeGreaterThanOrEqual(28); // without the fix only 19 of 30 got home
  });
});
