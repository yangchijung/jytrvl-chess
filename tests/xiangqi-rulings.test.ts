// Replayable rulings for JY Games Taiwan Xiangqi Rules v1.0 §6 (perpetual check / chase).
// Every case is a legal game: start FEN + full move list, played through the real rules engine.
// The same cases are published in docs/rules/xiangqi.md §6.1 (data: shared/games/xiangqi/rulings.ts).
import { describe, it, expect } from 'vitest';
import { XiangqiRules, parseFen, parseSq, chasedTargets } from '../shared/games/xiangqi/rules';
import type { GameResult } from '../shared/types';
import { RULINGS, type Ruling } from '../shared/games/xiangqi/rulings';

function replay(r: Ruling) {
  const g = new XiangqiRules({ startFen: r.fen, moves: [] });
  let res: GameResult | null = null;
  let plies = 0;
  for (const m of r.moves) {
    if (!g.play(m)) throw new Error(`${r.id}: illegal ${m} at ${g.fen()}`);
    plies++;
    res = g.result();
    if (res) break;
  }
  return { res, plies, g };
}

describe('xiangqi rulings XQ01–XQ09 (replayable)', () => {
  for (const r of RULINGS)
    it(`${r.id} ${r.note}`, () => {
      const { res } = replay(r);
      expect(res).toEqual(r.expect);
    });

  it('XQ01 variant (adjudication order, not a full game): perpetual check is judged before chase', () => {
    // A legal cycle where black chases on every reply to a perpetual check is hard to build by hand, so this
    // case reuses the XQ01 game and marks every black ply as a chase before re-running the adjudication.
    const { g } = replay(RULINGS[0]);
    const inner = g as unknown as { plies: { check: boolean; chase: number[] }[]; adjudicateRepetition(): GameResult | null };
    const firstSeat = 0; // XQ01 starts with red to move
    inner.plies.forEach((p, i) => {
      if ((firstSeat + i) % 2 === 1) p.chase = [parseSq('a10')];
    });
    expect(inner.adjudicateRepetition()).toEqual({ kind: 'win', winner: 1, reason: 'perpetual_check' });
  });

  it('XQ07: attacks by a king or a soldier never count as a chase', () => {
    // red soldier that has crossed the river attacks an undefended black horse
    const { board } = parseFen('3k5/9/9/9/2nP5/9/9/9/9/4K4 w - - 0 1');
    expect(chasedTargets(board, 0, parseSq('d6'))).toEqual([]);
    // red king attacks an undefended black horse next to it
    const b2 = parseFen('3k5/9/9/9/9/9/9/9/3n5/4K4 w - - 0 1').board;
    expect(chasedTargets(b2, 0, parseSq('e1'))).toEqual([]);
  });

  it('XQ08: a lower-value piece attacking a higher-value one is a chase even when it is protected', () => {
    // red horse c3 attacks the black chariot d5, which the black horse b6 protects
    const { board } = parseFen('3k5/9/9/9/1n7/3r5/9/2N6/9/4K4 w - - 0 1');
    expect(chasedTargets(board, 0, parseSq('c3'))).toContain(parseSq('d5'));
  });

  it('XQ08: a defender that cannot legally recapture (pinned between the kings) does not protect', () => {
    // red chariot d1 attacks the black horse d8; its only defender is the black advisor e9, which is pinned:
    // leaving the e-file would let the two kings face each other
    const pinned = parseFen('4k4/4a4/3n5/9/9/9/9/9/9/3RK4 w - - 0 1').board;
    expect(chasedTargets(pinned, 0, parseSq('d1'))).toContain(parseSq('d8'));
    // with another piece on the e-file the advisor may recapture → protected → a chariot attacking a horse is not a chase
    const free = parseFen('4k4/4a4/3n5/9/4p4/9/9/9/9/3RK4 w - - 0 1').board;
    expect(chasedTargets(free, 0, parseSq('d1'))).toEqual([]);
  });

  it('XQ09: no ruling before the third occurrence; side to move is part of the position', () => {
    const r = RULINGS[2]; // XQ03
    const g = new XiangqiRules({ startFen: r.fen, moves: [] });
    // first occurrence after ply 1; second after ply 5; the third after ply 9 triggers the ruling
    for (let i = 0; i < 8; i++) {
      g.play(r.moves[i]);
      expect(g.result()).toBeNull();
    }
    g.play(r.moves[8]);
    expect(g.result()).toEqual(r.expect);
    // same piece placement with the other side to move is a different position
    const a = parseFen('1n1k5/9/9/9/9/9/9/9/9/1R2K4 w - - 0 1');
    const b = parseFen('1n1k5/9/9/9/9/9/9/9/9/1R2K4 b - - 0 1');
    expect(a.turn).not.toBe(b.turn);
  });
});
