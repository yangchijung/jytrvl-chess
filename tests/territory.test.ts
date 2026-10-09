import { describe, it, expect } from 'vitest';
import { TerritoryGame, NONE, rle, unrle, type Dir } from '../shared/territory/engine';

/** Build a game with players placed manually (bypasses spawn). */
function setup(w: number, h: number, players: { x: number; y: number; dir: Dir; land?: [number, number, number, number] }[], durationTicks = 0) {
  const g = new TerritoryGame({ width: w, height: h, durationTicks, seed: 1 });
  players.forEach((pp, k) => {
    const p = g.addPlayer(`p${k}`, `P${k}`, false);
    p.x = pp.x;
    p.y = pp.y;
    p.dir = pp.dir;
    const [x0, y0, x1, y1] = pp.land ?? [pp.x - 1, pp.y - 1, pp.x + 1, pp.y + 1];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        g.owner[g.idx(x, y)] = k;
        p.land++;
      }
    p.bestLand = p.land;
  });
  g.started = true;
  return g;
}
const steps = (g: TerritoryGame, n: number) => {
  for (let i = 0; i < n; i++) g.step();
};

describe('territory engine — movement & trails', () => {
  it('moves one cell per tick and leaves a trail outside own land', () => {
    const g = setup(20, 20, [{ x: 5, y: 5, dir: 1 }]);
    steps(g, 1);
    expect([g.players[0].x, g.players[0].y]).toEqual([6, 5]);
    expect(g.players[0].trail).toEqual([]); // still inside 3x3 land (4..6)
    steps(g, 2);
    expect(g.players[0].trail.length).toBe(2);
    expect(g.trail[g.idx(8, 5)]).toBe(0);
  });

  it('ignores 180° reversal and accepts quick double turns', () => {
    const g = setup(20, 20, [{ x: 5, y: 5, dir: 1 }]);
    expect(g.steer(0, 3)).toBe(false);
    expect(g.steer(0, 0)).toBe(true);
    expect(g.steer(0, 3)).toBe(true);
    steps(g, 2);
    expect([g.players[0].x, g.players[0].y]).toEqual([4, 4]);
  });

  it('dies leaving the map', () => {
    const g = setup(10, 10, [{ x: 8, y: 5, dir: 1, land: [7, 4, 9, 6] }]);
    steps(g, 2);
    expect(g.players[0].alive).toBe(false);
    expect(g.players[0].reason).toBe('wall');
  });
});

describe('territory engine — capture', () => {
  it('returning home captures the trail and the enclosed area', () => {
    const g = setup(20, 20, [{ x: 5, y: 5, dir: 1 }]); // land 4..6
    // go right 4, down 4, left 4, up back into land
    steps(g, 4); // x=9
    g.steer(0, 2);
    steps(g, 4); // y=9
    g.steer(0, 3);
    steps(g, 4); // x=5
    g.steer(0, 0);
    steps(g, 3); // y=6 → home
    const p = g.players[0];
    expect(p.trail).toEqual([]);
    // loop x 5..9 × y 5..9 (25 cells) + the rest of the original 3x3 land (5 cells)
    for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) expect(g.owner[g.idx(x, y)], `${x},${y}`).toBe(0);
    expect(g.owner[g.idx(7, 4)]).toBe(NONE);
    expect(g.owner[g.idx(4, 8)]).toBe(NONE);
    expect(p.land).toBe(30);
    expect(g.events.some((e) => e.type === 'capture')).toBe(true);
  });

  it('capture steals enclosed enemy land and eliminates a landless enemy', () => {
    const g = setup(60, 60, [
      { x: 5, y: 5, dir: 1 },
      { x: 10, y: 10, dir: 0, land: [10, 10, 10, 10] },
    ]);
    g.players[1].x = 10;
    g.players[1].y = 10;
    // freeze player 1 inside the loop by keeping it in its own single cell is impossible (it moves) — instead
    // give player 1 a separate head far away but land inside the loop
    g.players[1].x = 55;
    g.players[1].y = 55;
    g.players[1].land = 1; // land only at (10,10)
    steps(g, 7); // x=12
    g.steer(0, 2);
    steps(g, 7); // y=12
    g.steer(0, 3);
    steps(g, 7); // x=5
    g.steer(0, 0);
    // player 1 keeps moving up from (25,25); it has a long trail but no land left after capture
    steps(g, 6);
    expect(g.owner[g.idx(10, 10)]).toBe(0);
    expect(g.players[1].alive).toBe(false);
    expect(g.players[1].reason).toBe('land');
    expect(g.players[0].kills).toBe(1);
  });
});

describe('territory engine — kills', () => {
  it('crossing an enemy trail eliminates the enemy', () => {
    const g = setup(30, 30, [
      { x: 5, y: 10, dir: 1 },
      { x: 10, y: 3, dir: 2, land: [9, 2, 11, 4] },
    ]);
    steps(g, 5); // p0 trail from x=7..10 on y=10; p1 moving down x=10 from y=3
    // p1 reaches y=10 at tick 7 — p0 head passed x=10 at tick 5 → trail there
    steps(g, 3);
    expect(g.players[0].alive).toBe(false);
    expect(g.players[0].reason).toBe('cut');
    expect(g.players[0].killedBy).toBe(1);
    expect(g.players[1].kills).toBe(1);
    // dead player's land and trail removed
    expect([...g.owner].includes(0)).toBe(false);
    expect([...g.trail].includes(0)).toBe(false);
  });

  it('hitting your own trail is fatal', () => {
    const g = setup(20, 20, [{ x: 5, y: 5, dir: 1 }]);
    steps(g, 4);
    g.steer(0, 2);
    steps(g, 2);
    g.steer(0, 3);
    steps(g, 1);
    g.steer(0, 0);
    steps(g, 2);
    expect(g.players[0].alive).toBe(false);
    expect(g.players[0].reason).toBe('self');
  });

  it('head-on: player at home survives, exposed player dies; both exposed both die', () => {
    const g = setup(30, 30, [
      { x: 5, y: 10, dir: 1, land: [3, 9, 12, 11] },
      { x: 15, y: 10, dir: 3, land: [14, 9, 16, 11] },
    ]);
    // p0 inside land until x=12; p1 leaves land at x=13 → collision around x=12/13
    steps(g, 6);
    const dead = g.players.filter((p) => !p.alive);
    expect(dead.map((p) => p.idx)).toEqual([1]);
    expect(g.players[1].reason).toBe('collision');

    const h = setup(30, 30, [
      { x: 5, y: 10, dir: 1 },
      { x: 15, y: 10, dir: 3 },
    ]);
    steps(h, 6);
    expect(h.players.every((p) => !p.alive)).toBe(true);
    expect(h.result?.reason).toBe('all_dead');
  });
});

describe('territory engine — game end & sync', () => {
  it('last standing wins', () => {
    const g = setup(30, 30, [
      { x: 5, y: 10, dir: 1 },
      { x: 10, y: 3, dir: 2, land: [9, 2, 11, 4] },
    ]);
    steps(g, 8);
    expect(g.result).toMatchObject({ winner: 1, reason: 'last_standing' });
    expect(g.result!.ranking[0]).toBe(1);
  });

  it('time limit: most land wins', () => {
    const g = setup(40, 40, [
      { x: 5, y: 5, dir: 1, land: [3, 3, 9, 9] },
      { x: 30, y: 30, dir: 3 },
    ], 2);
    g.players[0].dir = 2;
    g.players[0].y = 4;
    steps(g, 2);
    expect(g.result).toMatchObject({ winner: 0, reason: 'time' });
  });

  it('domination ends the game', () => {
    const g = setup(10, 10, [
      { x: 4, y: 4, dir: 1, land: [0, 0, 9, 5] },
      { x: 2, y: 8, dir: 1, land: [1, 8, 1, 8] },
    ]);
    g.step();
    expect(g.result?.reason).toBe('domination');
    expect(g.result?.winner).toBe(0);
  });

  it('standard start places all players with 5x5 land, no overlap', () => {
    for (const n of [1, 2, 4, 8]) {
      const g = new TerritoryGame({ width: 96, height: 96, durationTicks: 0, seed: 42 });
      for (let k = 0; k < n; k++) g.addPlayer(`p${k}`, `P${k}`, false);
      g.start();
      for (const p of g.players) expect(p.land).toBe(25);
    }
  });

  it('snapshot round-trip and RLE', () => {
    const a = new Int8Array([-1, -1, 0, 0, 0, 3, -1]);
    const b = new Int8Array(7);
    unrle(rle(a), b);
    expect([...b]).toEqual([...a]);
    const g = new TerritoryGame({ width: 48, height: 48, durationTicks: 100, seed: 7 });
    g.addPlayer('a', 'A', false);
    g.addPlayer('b', 'B', true);
    g.start();
    steps(g, 5);
    const h = TerritoryGame.fromSnapshot(g.snapshot());
    expect([...h.owner]).toEqual([...g.owner]);
    expect([...h.trail]).toEqual([...g.trail]);
    expect(h.players[0].trail.length).toBe(g.players[0].trail.length);
  });
});

describe('territory AI — fairness', () => {
  it('bot decisions do not depend on other players’ pending (unapplied) inputs', async () => {
    const { botThink, newBotMemory } = await import('../shared/territory/ai');
    const { rng } = await import('../shared/territory/engine');
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const base = new TerritoryGame({ width: 48, height: 48, durationTicks: 0, seed: 11 });
      base.addPlayer('h', 'H', false);
      base.addPlayer('b', 'B', true);
      base.start();
      for (let i = 0; i < 12; i++) base.step();
      const run = (pending: Dir[]) => {
        const g = TerritoryGame.fromSnapshot(base.snapshot());
        g.players[0].queue = [...pending]; // the human's queued turn, not yet visible on the board
        const mem = newBotMemory();
        const r = rng(5);
        const out: number[] = [];
        for (let t = 0; t < 1; t++) {
          botThink(g, 1, mem, level, r);
          out.push(...g.players[1].queue, g.players[1].dir);
        }
        return out;
      };
      expect(run([])).toEqual(run([((base.players[0].dir + 1) % 4) as Dir]));
      expect(run([])).toEqual(run([((base.players[0].dir + 3) % 4) as Dir]));
    }
  });
});
