/// <reference types="node" />
// Territory Rush AI ladder: bot-only matches between two levels (equal numbers of each), many seeds.
// Usage: npx tsx scripts/territory-ladder.ts [matches=20] [playersPerSide=2]
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerritoryGame, mapSizeFor, rng } from '../shared/territory/engine';
import { botThink, newBotMemory, type BotLevel } from '../shared/territory/ai';

const N = Number(process.argv[2] ?? 20);
const SIDE = Number(process.argv[3] ?? 2);
const ALL: [BotLevel, BotLevel][] = [
  ['easy', 'medium'],
  ['medium', 'hard'],
  ['easy', 'hard'],
];
const PAIRS = process.argv[4] ? ALL.filter(([a, b]) => `${a}-${b}` === process.argv[4]) : ALL;

function match(a: BotLevel, b: BotLevel, seed: number) {
  const n = SIDE * 2;
  const size = mapSizeFor(n);
  const g = new TerritoryGame({ width: size, height: size, durationTicks: 1800, seed });
  const levels: BotLevel[] = [];
  for (let k = 0; k < n; k++) {
    const lvl = (k + seed) % 2 === 0 ? a : b;
    levels.push(lvl);
    g.addPlayer(`b${k}`, `${lvl}${k}`, true);
  }
  g.start();
  const mem = levels.map(() => newBotMemory());
  const rands = levels.map((_, k) => rng(seed * 31 + k));
  let ms = 0;
  while (!g.result) {
    const t0 = performance.now();
    levels.forEach((lvl, k) => botThink(g, k, mem[k], lvl, rands[k]));
    ms = Math.max(ms, performance.now() - t0);
    g.step();
  }
  const pts: Record<BotLevel, number> = { easy: 0, medium: 0, hard: 0 };
  const land: Record<BotLevel, number> = { easy: 0, medium: 0, hard: 0 };
  const deaths: Record<BotLevel, number> = { easy: 0, medium: 0, hard: 0 };
  g.result.ranking.forEach((pi, rank) => (pts[levels[pi]] += n - 1 - rank));
  g.players.forEach((p) => {
    land[levels[p.idx]] += p.bestLand;
    if (!p.alive) deaths[levels[p.idx]]++;
  });
  const winnerLevel = g.result.winner !== null ? levels[g.result.winner] : null;
  return { winnerLevel, pts, land, deaths, ticks: g.tick, maxThinkMs: ms };
}

const report: Record<string, unknown> = { date: new Date().toISOString(), matches: N, playersPerSide: SIDE };
for (const [a, b] of PAIRS) {
  const agg = { [a]: { wins: 0, rankPts: 0, land: 0, deaths: 0 }, [b]: { wins: 0, rankPts: 0, land: 0, deaths: 0 } } as Record<string, { wins: number; rankPts: number; land: number; deaths: number }>;
  let maxMs = 0;
  for (let s = 1; s <= N; s++) {
    const r = match(a, b, s * 7919);
    if (r.winnerLevel) agg[r.winnerLevel].wins++;
    for (const l of [a, b]) {
      agg[l].rankPts += r.pts[l];
      agg[l].land += r.land[l];
      agg[l].deaths += r.deaths[l];
    }
    maxMs = Math.max(maxMs, r.maxThinkMs);
  }
  console.log(`${a} vs ${b}:`, JSON.stringify(agg), `max think ${maxMs.toFixed(1)}ms/tick`);
  report[`${a}-${b}`] = { ...agg, maxThinkMsPerTick: maxMs };
}
mkdirSync('docs/test-results', { recursive: true });
writeFileSync(`docs/test-results/territory-ladder-${SIDE}v${SIDE}${process.argv[4] ? '-' + process.argv[4] : ''}.json`, JSON.stringify(report, null, 2));
