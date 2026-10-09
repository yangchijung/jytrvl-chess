/// <reference types="node" />
// Snake Arena AI ladder: bot-only versus matches (1v1 and 2v2) between two levels.
// Usage: npx tsx scripts/snake-ladder.ts [matches=20] [perSide=1]
import { writeFileSync, mkdirSync } from 'node:fs';
import { SnakeGame, arenaSizeFor, rng, MAPS } from '../shared/snake/engine';
import { snakeThink, newSnakeMemory, type SnakeLevel } from '../shared/snake/ai';

const N = Number(process.argv[2] ?? 20);
const SIDE = Number(process.argv[3] ?? 1);
const PAIRS: [SnakeLevel, SnakeLevel][] = [
  ['easy', 'medium'],
  ['medium', 'hard'],
  ['easy', 'hard'],
];

function match(a: SnakeLevel, b: SnakeLevel, seed: number) {
  const n = SIDE * 2;
  const size = arenaSizeFor(n);
  const g = new SnakeGame({ width: size, height: size, seed, mode: 'versus', map: MAPS[seed % MAPS.length], walls: true, durationSteps: 1800 });
  const lv: SnakeLevel[] = [];
  for (let k = 0; k < n; k++) {
    lv.push((k + seed) % 2 === 0 ? a : b);
    g.addSnake(`b${k}`, `${lv[k]}${k}`, true);
  }
  g.start();
  const mem = lv.map(() => newSnakeMemory());
  const rs = lv.map((_, k) => rng(seed * 13 + k));
  let ms = 0;
  while (!g.result) {
    const t0 = performance.now();
    lv.forEach((l, k) => snakeThink(g, k, mem[k], l, rs[k]));
    ms = Math.max(ms, performance.now() - t0);
    g.step();
  }
  return { winner: g.result.winner !== null ? lv[g.result.winner] : null, len: lv.map((l, k) => [l, g.snakes[k].maxLen] as const), ms, steps: g.tick };
}

const report: Record<string, unknown> = { date: new Date().toISOString(), matches: N, perSide: SIDE };
for (const [a, b] of PAIRS) {
  const wins: Record<string, number> = { [a]: 0, [b]: 0, draw: 0 };
  const maxLen: Record<string, number> = { [a]: 0, [b]: 0 };
  let ms = 0;
  for (let s = 1; s <= N; s++) {
    const r = match(a, b, s * 7919);
    wins[r.winner ?? 'draw']++;
    for (const [l, v] of r.len) maxLen[l] += v;
    ms = Math.max(ms, r.ms);
  }
  console.log(`${a} vs ${b}:`, JSON.stringify(wins), 'total max length', JSON.stringify(maxLen), `max think ${ms.toFixed(1)}ms/step`);
  report[`${a}-${b}`] = { wins, maxLen, maxThinkMs: ms };
}
mkdirSync('docs/test-results', { recursive: true });
writeFileSync(`docs/test-results/snake-ladder-${SIDE}v${SIDE}.json`, JSON.stringify(report, null, 2));
