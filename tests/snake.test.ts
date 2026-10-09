import { describe, it, expect } from 'vitest';
import { SnakeGame, replaySolo, START_LEN, FOOD_POINTS, rng, type Dir, type SnakeConfig } from '../shared/snake/engine';
import { snakeThink, newSnakeMemory } from '../shared/snake/ai';

const cfg = (p: Partial<SnakeConfig> = {}): SnakeConfig => ({ width: 20, height: 20, seed: 1, mode: 'classic', map: 'open', walls: true, durationSteps: 0, ...p });

/** place a snake manually: body cells given as [x,y] head first */
function put(g: SnakeGame, i: number, cells: [number, number][], dir: Dir) {
  const s = g.snakes[i];
  for (const c of s.body) g.occ[c] = -1;
  s.body = cells.map(([x, y]) => g.idx(x, y));
  for (const c of s.body) g.occ[c] = i;
  s.dir = dir;
  s.queue = [];
}

describe('snake — movement', () => {
  it('starts with length 4 and moves one cell per step', () => {
    const g = new SnakeGame(cfg());
    g.addSnake('a', 'A', false);
    g.start();
    const s = g.snakes[0];
    expect(s.body.length).toBe(START_LEN);
    const h0 = s.body[0];
    g.food.clear();
    g.step();
    expect(s.body[0]).toBe(g.next(h0, s.dir));
    expect(s.body.length).toBe(START_LEN);
  });
  it('ignores reversal; queues up to two turns', () => {
    const g = new SnakeGame(cfg());
    g.addSnake('a', 'A', false);
    g.start();
    const s = g.snakes[0];
    expect(g.steer(0, ((s.dir + 2) % 4) as Dir)).toBe(false);
    expect(g.steer(0, 0)).toBe(true);
    expect(g.steer(0, 3)).toBe(true);
    expect(s.queue).toEqual([0, 3]);
  });
  it('eating food grows by one and scores 10', () => {
    const g = new SnakeGame(cfg());
    g.addSnake('a', 'A', false);
    g.start();
    put(g, 0, [[5, 5], [4, 5], [3, 5], [2, 5]], 1);
    g.food.clear();
    g.food.set(g.idx(6, 5), 1);
    g.step();
    expect(g.snakes[0].body.length).toBe(5);
    expect(g.snakes[0].score).toBe(FOOD_POINTS);
    expect(g.food.size).toBe(1); // a new food spawned
  });
  it('wrap-around when walls are off; death when on', () => {
    const a = new SnakeGame(cfg({ walls: false }));
    a.addSnake('a', 'A', false);
    a.start();
    put(a, 0, [[19, 5], [18, 5], [17, 5], [16, 5]], 1);
    a.food.clear();
    a.step();
    expect(a.xy(a.snakes[0].body[0])).toEqual([0, 5]);
    const b = new SnakeGame(cfg({ walls: true }));
    b.addSnake('a', 'A', false);
    b.start();
    put(b, 0, [[19, 5], [18, 5], [17, 5], [16, 5]], 1);
    b.food.clear();
    b.step();
    expect(b.snakes[0].alive).toBe(false);
    expect(b.snakes[0].reason).toBe('wall');
    expect(b.result?.reason).toBe('crash');
  });
  it('biting yourself ends the game; moving into your own tail cell is allowed', () => {
    const g = new SnakeGame(cfg());
    g.addSnake('a', 'A', false);
    g.start();
    g.food.clear();
    // a 2x2 loop: head can follow the tail
    put(g, 0, [[5, 5], [5, 6], [6, 6], [6, 5]], 0);
    g.steer(0, 1); // right into (6,5) = tail, which moves away this step
    g.step();
    expect(g.snakes[0].alive).toBe(true);
    const h = new SnakeGame(cfg());
    h.addSnake('a', 'A', false);
    h.start();
    h.food.clear();
    put(h, 0, [[5, 5], [5, 6], [6, 6], [6, 5], [7, 5]], 0);
    h.steer(0, 1); // (6,5) is not the tail now
    h.step();
    expect(h.snakes[0].alive).toBe(false);
    expect(h.snakes[0].reason).toBe('self');
  });
});

describe('snake — versus rules', () => {
  const vs = () => {
    const g = new SnakeGame(cfg({ mode: 'versus', durationSteps: 300 }));
    g.addSnake('a', 'A', false);
    g.addSnake('b', 'B', false);
    g.start();
    g.food.clear();
    return g;
  };
  it('running into another body kills you and credits the owner', () => {
    const g = vs();
    put(g, 0, [[5, 5], [4, 5], [3, 5], [2, 5]], 1);
    put(g, 1, [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7]], 0);
    g.step();
    expect(g.snakes[0].alive).toBe(false);
    expect(g.snakes[0].reason).toBe('body');
    expect(g.snakes[1].kills).toBe(1);
    expect(g.result?.winner).toBe(1);
    expect(g.food.size).toBeGreaterThan(0); // the fallen snake leaves food
  });
  it('head-on: longer snake survives; equal lengths both die', () => {
    const g = vs();
    put(g, 0, [[5, 5], [4, 5], [3, 5], [2, 5], [1, 5]], 1);
    put(g, 1, [[7, 5], [8, 5], [9, 5], [10, 5]], 3);
    g.step();
    expect(g.snakes[0].alive).toBe(true);
    expect(g.snakes[1].alive).toBe(false);
    const h = vs();
    put(h, 0, [[5, 5], [4, 5], [3, 5], [2, 5]], 1);
    put(h, 1, [[7, 5], [8, 5], [9, 5], [10, 5]], 3);
    h.step();
    expect(h.snakes.every((s) => !s.alive)).toBe(true);
    expect(h.result?.reason).toBe('all_dead');
  });
  it('time limit: the longest living snake wins', () => {
    const g = vs();
    put(g, 0, [[5, 5], [4, 5], [3, 5], [2, 5], [1, 5]], 1);
    put(g, 1, [[5, 15], [4, 15], [3, 15], [2, 15]], 1);
    for (let k = 0; k < 300 && !g.result; k++) {
      // keep both circling in small squares
      if (k % 3 === 0) for (const i of [0, 1]) g.steer(i, ((g.snakes[i].dir + 1) % 4) as Dir);
      g.food.clear();
      g.step();
    }
    expect(g.result?.reason).toBe('time');
    expect(g.result?.winner).toBe(0);
  });
});

describe('snake — modes', () => {
  it('time attack: crashing costs points and respawns', () => {
    const g = new SnakeGame(cfg({ mode: 'timeattack', durationSteps: 100 }));
    g.addSnake('a', 'A', false);
    g.start();
    g.snakes[0].score = 80;
    put(g, 0, [[19, 5], [18, 5], [17, 5], [16, 5]], 1);
    g.food.clear();
    g.step();
    expect(g.snakes[0].alive).toBe(true);
    expect(g.snakes[0].deaths).toBe(1);
    expect(g.snakes[0].score).toBe(30);
    while (!g.result) g.step();
    expect(g.result.reason).toBe('time');
  });
  it('survival: obstacles appear over time', () => {
    const g = new SnakeGame(cfg({ mode: 'survival', width: 30, height: 30 }));
    g.addSnake('a', 'A', true);
    g.start();
    const m = newSnakeMemory(),
      r = rng(2);
    const walls0 = g.wall.reduce((a, b) => a + b, 0);
    for (let k = 0; k < 200 && !g.result; k++) {
      snakeThink(g, 0, m, 'hard', r);
      g.step();
    }
    expect(g.wall.reduce((a, b) => a + b, 0)).toBeGreaterThan(walls0);
  });
  it('maps build walls deterministically', () => {
    for (const map of ['pillars', 'cross', 'rooms'] as const) {
      const a = new SnakeGame(cfg({ map, width: 30, height: 30 }));
      const b = new SnakeGame(cfg({ map, width: 30, height: 30 }));
      expect(a.wall.reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
      expect([...a.wall]).toEqual([...b.wall]);
      a.addSnake('x', 'X', false);
      a.addSnake('y', 'Y', false);
      a.start(); // spawns must avoid walls
      for (const s of a.snakes) for (const c of s.body) expect(a.wall[c]).toBe(0);
    }
  });
});

describe('snake — determinism, replay, AI', () => {
  it('snapshot round-trip continues identically', () => {
    const g = new SnakeGame(cfg({ mode: 'versus', width: 30, height: 30, seed: 9, durationSteps: 600 }));
    for (let k = 0; k < 3; k++) g.addSnake(`b${k}`, `B${k}`, true);
    g.start();
    const mem = [newSnakeMemory(), newSnakeMemory(), newSnakeMemory()];
    const rs = [rng(1), rng(2), rng(3)];
    for (let t = 0; t < 50; t++) {
      g.snakes.forEach((_, k) => snakeThink(g, k, mem[k], 'medium', rs[k]));
      g.step();
    }
    const h = SnakeGame.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
    for (let t = 0; t < 30; t++) {
      g.step();
      h.step();
    }
    expect(h.snakes.map((s) => s.body.join())).toEqual(g.snakes.map((s) => s.body.join()));
    expect([...h.food.entries()].sort()).toEqual([...g.food.entries()].sort());
  });
  it('solo replay reproduces the score exactly', () => {
    const c = cfg({ seed: 31, width: 24, height: 24 });
    const g = new SnakeGame(c);
    g.addSnake('p', 'P', false);
    g.start();
    const m = newSnakeMemory(),
      r = rng(4);
    const log: [number, number][] = [];
    while (!g.result && g.tick < 3000) {
      const before = g.snakes[0].queue.length;
      snakeThink(g, 0, m, 'hard', r);
      if (g.snakes[0].queue.length > before) log.push([g.tick, g.snakes[0].queue.at(-1)!]);
      g.step();
    }
    const rp = replaySolo(c, log, g.tick);
    expect(rp.snakes[0].score).toBe(g.snakes[0].score);
    expect(rp.snakes[0].score).toBeGreaterThan(100);
  });
  it('AI does not read other players’ pending inputs', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const base = new SnakeGame(cfg({ mode: 'versus', width: 30, height: 30, seed: 5, durationSteps: 0 }));
      base.addSnake('h', 'H', false);
      base.addSnake('b', 'B', true);
      base.start();
      for (let k = 0; k < 5; k++) base.step();
      const run = (pending: Dir[]) => {
        const g = SnakeGame.fromSnapshot(base.snapshot());
        g.snakes[0].queue = [...pending];
        snakeThink(g, 1, newSnakeMemory(), level, rng(7));
        return [...g.snakes[1].queue, g.snakes[1].dir];
      };
      const d = base.snakes[0].dir;
      expect(run([])).toEqual(run([((d + 1) % 4) as Dir]));
    }
  });
  it('hard AI survives long on its own', () => {
    const g = new SnakeGame(cfg({ width: 24, height: 24, seed: 3 }));
    g.addSnake('p', 'P', true);
    g.start();
    const m = newSnakeMemory(),
      r = rng(9);
    while (!g.result && g.tick < 2000) {
      snakeThink(g, 0, m, 'hard', r);
      g.step();
    }
    expect(g.snakes[0].body.length).toBeGreaterThan(30);
  });
});
