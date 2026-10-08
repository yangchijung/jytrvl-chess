import { describe, it, expect } from 'vitest';
import { LESSONS } from '../src/learn/lessons';
import { buildStepRules, matchesExpect } from '../src/learn/build';
import type { GameId } from '../shared/types';

describe('lessons are valid with the real rules engines', () => {
  for (const game of ['chess', 'xiangqi', 'banqi'] as GameId[]) {
    LESSONS[game].forEach((step, i) => {
      it(`${game} #${i + 1} ${step.title.en}`, () => {
        const r = buildStepRules(game, step);
        expect(step.title.zh && step.title.en && step.text.zh && step.text.en).toBeTruthy();
        if (step.kind === 'info') return;
        expect(r.result(), 'position must not be finished').toBeNull();
        const legal = r.legalMoves();
        if (step.kind === 'explore') {
          expect(legal.length).toBeGreaterThan(0);
          return;
        }
        const ok = legal.filter((m) => matchesExpect(step.expect, m));
        expect(ok.length, `no legal move matches ${JSON.stringify(step.expect)}; legal: ${legal.join(',')}`).toBeGreaterThan(0);
        if (step.expect && 'moves' in step.expect) for (const m of step.expect.moves) expect(legal.some((l) => l === m || l.startsWith(m))).toBe(true);
        if (step.kind === 'challenge') {
          // challenges are mates in one: every accepted move must end the game in a win
          for (const m of ok) {
            const rr = buildStepRules(game, step);
            rr.play(m);
            expect(rr.result()?.kind, `${m} should mate`).toBe('win');
          }
        }
      });
    });
  }

  it('the pinned-knight lesson really has a pinned knight', () => {
    const step = LESSONS.chess.find((s) => s.category === 'mistakes')!;
    const r = buildStepRules('chess', step);
    expect(r.legalFrom('e2')).toEqual([]);
  });

  it('the general cannot capture the soldier in the banqi lesson', () => {
    const step = LESSONS.banqi.find((s) => s.kind === 'explore')!;
    const r = buildStepRules('banqi', step);
    expect(r.legalFrom('a1')).not.toContain('a1-b1');
  });
});
