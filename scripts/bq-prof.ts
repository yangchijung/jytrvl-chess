/// <reference types="node" />
import { BanqiRules } from '../shared/games/banqi/rules';
import { chooseBanqiMove } from '../shared/ai/banqi-ai';
const g = BanqiRules.create();
for (let i = 0; i < 24 && !g.result(); i++) g.play(chooseBanqiMove(g.publicView(), g.sideToMove(), { level: 'easy' }));
console.log('legal', g.legalMoves().length);
for (const lvl of ['medium', 'hard'] as const) {
  const t = Date.now();
  chooseBanqiMove(g.publicView(), g.sideToMove(), { level: lvl, budgetMs: 100000 });
  console.log(lvl, Date.now() - t, 'ms (full samples)');
}
