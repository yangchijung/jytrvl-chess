import { describe, it, expect } from 'vitest';
import { BanqiRules } from '../shared/games/banqi/rules';
import { chooseBanqiMove, determinize } from '../shared/ai/banqi-ai';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('banqi AI fairness', () => {
  it('decision depends only on the public view, never on the hidden layout', () => {
    // two games with identical public history but different hidden pieces
    for (let trial = 0; trial < 5; trial++) {
      const a = BanqiRules.create(undefined, seeded(100 + trial));
      for (let i = 0; i < 6 && !a.result(); i++) a.play(a.legalMoves().find((m) => m.startsWith('f:'))!);
      const view = a.publicView();
      // build a different layout consistent with the same view
      const b = determinize(view, seeded(999 + trial));
      expect(b.publicView().cells).toEqual(view.cells);
      const m1 = chooseBanqiMove(view, a.sideToMove(), { level: 'medium', rand: seeded(7), budgetMs: 60000 });
      const m2 = chooseBanqiMove(b.publicView(), b.sideToMove(), { level: 'medium', rand: seeded(7), budgetMs: 60000 });
      expect(m1).toBe(m2);
    }
  });
  it('every level returns a legal move', () => {
    const g = BanqiRules.create();
    for (let i = 0; i < 40 && !g.result(); i++) {
      const lvl = (['easy', 'medium', 'hard'] as const)[i % 3];
      const m = chooseBanqiMove(g.publicView(), g.sideToMove(), { level: lvl, budgetMs: 150 });
      expect(g.legalMoves()).toContain(m);
      g.play(m);
    }
  });
});
