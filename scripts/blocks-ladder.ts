/// <reference types="node" />
// Block Puzzle Battle AI ladder: versus matches between two AI levels (same piece sequence for both).
// Usage: npx tsx scripts/blocks-ladder.ts [matches=20]
import { writeFileSync, mkdirSync } from 'node:fs';
import { BlocksGame, TPS, W, rng } from '../shared/blocks/engine';
import { BlocksBot, type BlocksLevel } from '../shared/blocks/ai';

const N = Number(process.argv[2] ?? 20);
const PAIRS: [BlocksLevel, BlocksLevel][] = [
  ['easy', 'medium'],
  ['medium', 'hard'],
  ['easy', 'hard'],
];
const LIMIT = 5 * 60 * TPS;

export function versus(a: BlocksLevel, b: BlocksLevel, seed: number) {
  const games = [new BlocksGame({ seed, mode: 'versus' }), new BlocksGame({ seed, mode: 'versus' })];
  const bots = [new BlocksBot(a, rng(seed * 3 + 1)), new BlocksBot(b, rng(seed * 3 + 2))];
  const holes = rng(seed ^ 0x5bd1e995);
  let maxMs = 0;
  for (let t = 0; t < LIMIT; t++) {
    for (let k = 0; k < 2; k++) {
      const g = games[k];
      const t0 = performance.now();
      for (const act of bots[k].update(g)) g.input(act);
      maxMs = Math.max(maxMs, performance.now() - t0);
      g.step();
      for (const e of g.drainEvents()) if (e.type === 'lock' && g.lastAttack > 0) games[1 - k].addGarbage(g.lastAttack, Math.floor(holes() * W));
    }
    const over = games.map((g) => g.status === 'over');
    if (over[0] || over[1]) return { winner: over[0] && over[1] ? null : over[0] ? b : a, ticks: t, maxMs, sent: games.map((g) => g.stats.attack) };
  }
  // time limit: more attack sent wins
  const [s0, s1] = games.map((g) => g.stats.attack);
  return { winner: s0 === s1 ? null : s0 > s1 ? a : b, ticks: LIMIT, maxMs, sent: [s0, s1] };
}

if (process.argv[1]?.endsWith('blocks-ladder.ts')) {
  const report: Record<string, unknown> = { date: new Date().toISOString(), matches: N };
  for (const [a, b] of PAIRS) {
    const wins: Record<string, number> = { [a]: 0, [b]: 0, draw: 0 };
    let maxMs = 0,
      ticks = 0;
    for (let s = 1; s <= N; s++) {
      const r = versus(a, b, s * 7919);
      wins[r.winner ?? 'draw']++;
      maxMs = Math.max(maxMs, r.maxMs);
      ticks += r.ticks;
    }
    console.log(`${a} vs ${b}:`, JSON.stringify(wins), `avg ${(ticks / N / TPS).toFixed(0)}s, max think ${maxMs.toFixed(1)}ms`);
    report[`${a}-${b}`] = { wins, avgSeconds: ticks / N / TPS, maxThinkMs: maxMs };
  }
  mkdirSync('docs/test-results', { recursive: true });
  writeFileSync('docs/test-results/blocks-ladder.json', JSON.stringify(report, null, 2));
}
