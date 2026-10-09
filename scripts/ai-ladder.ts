/// <reference types="node" />
// AI difficulty ladder: plays Easy vs Medium and Medium vs Hard (and Easy vs Hard) for all three games
// with the real level settings, alternating colours, and reports scores.
// Usage: npx tsx scripts/ai-ladder.ts [gamesPerPair=4] [chess,xiangqi,banqi]
import { writeFileSync, mkdirSync } from 'node:fs';
import { ChessRules } from '../shared/games/chess/rules';
import { XiangqiRules } from '../shared/games/xiangqi/rules';
import { BanqiRules } from '../shared/games/banqi/rules';
import { chooseEngineMove, type Level } from '../shared/ai/choose';
import { chooseBanqiMove, visibleKey } from '../shared/ai/banqi-ai';
import { nodeStockfish, nodeFairyStockfish } from './node-engines';
import type { UciClient } from '../shared/ai/uci';
import type { GameResult } from '../shared/types';

const N = Number(process.argv[2] ?? 4);
const which = (process.argv[3] ?? 'chess,xiangqi,banqi').split(',');
const ALL_PAIRS: [Level, Level][] = [
  ['easy', 'medium'],
  ['medium', 'hard'],
  ['easy', 'hard'],
];
// optional 4th arg: e.g. "medium-hard" to run a single pairing
const PAIRS = process.argv[4] ? ALL_PAIRS.filter(([a, b]) => `${a}-${b}` === process.argv[4]) : ALL_PAIRS;
const MAX_PLIES = 300;

async function playEngineGame(game: 'chess' | 'xiangqi', white: Level, black: Level, client: UciClient): Promise<GameResult> {
  const g: ChessRules | XiangqiRules = game === 'chess' ? new ChessRules() : new XiangqiRules();
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const r = g.result();
    if (r) return r;
    const lvl = g.sideToMove() === 0 ? white : black;
    const mv = await chooseEngineMove(game, g.fen(), g.legalMoves(), lvl, client);
    if (!g.play(mv)) throw new Error(`AI produced illegal move ${mv} in ${g.fen()}`);
  }
  return { kind: 'draw', reason: 'ply_cap' };
}

function playBanqiGame(first: Level, second: Level): GameResult {
  const g = BanqiRules.create();
  const seen = new Set<string>();
  for (let ply = 0; ply < 600; ply++) {
    const r = g.result();
    if (r) return r;
    const seat = g.sideToMove();
    seen.add(visibleKey(g.publicView()));
    const mv = chooseBanqiMove(g.publicView(), seat, { level: seat === 0 ? first : second, budgetMs: 600, seen });
    if (!g.play(mv)) throw new Error(`banqi AI illegal ${mv}`);
  }
  return { kind: 'draw', reason: 'ply_cap' };
}

async function main() {
  const report: Record<string, unknown> = { date: new Date().toISOString(), gamesPerPair: N };
  let sf: UciClient | null = null;
  let fsf: { client: UciClient; terminate: () => void } | null = null;
  for (const game of which) {
    const rows: unknown[] = [];
    if (game === 'chess') sf = await nodeStockfish();
    if (game === 'xiangqi') fsf = await nodeFairyStockfish();
    for (const [weak, strong] of PAIRS) {
      let strongScore = 0;
      const detail: string[] = [];
      for (let i = 0; i < N; i++) {
        const strongIsFirst = i % 2 === 0;
        const [a, b] = strongIsFirst ? [strong, weak] : [weak, strong];
        const r =
          game === 'banqi' ? playBanqiGame(a, b) : await playEngineGame(game as 'chess' | 'xiangqi', a, b, game === 'chess' ? sf! : fsf!.client);
        const strongSeat = strongIsFirst ? 0 : 1;
        const pts = r.kind === 'draw' ? 0.5 : r.winner === strongSeat ? 1 : 0;
        strongScore += pts;
        detail.push(`${a}-${b}:${r.kind === 'draw' ? 'draw' : r.winner === 0 ? '1-0' : '0-1'}(${r.reason})`);
        console.log(game, weak, 'vs', strong, `game ${i + 1}:`, detail.at(-1));
      }
      rows.push({ weak, strong, strongScore, games: N, detail });
      console.log(`== ${game} ${strong} scored ${strongScore}/${N} vs ${weak}`);
    }
    report[game] = rows;
    if (fsf) {
      fsf.terminate();
      fsf = null;
    }
  }
  mkdirSync('docs/test-results', { recursive: true });
  writeFileSync(`docs/test-results/ai-ladder-${which.join('-')}${process.argv[4] ? '-' + process.argv[4] : ''}.json`, JSON.stringify(report, null, 2));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
