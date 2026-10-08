import { describe, it, expect } from 'vitest';
import { XiangqiRules, legalMovesOf, parseFen, chineseNotation, parseSq, type XqBoard } from '../shared/games/xiangqi/rules';
import type { Seat } from '../shared/types';

function perft(board: XqBoard, side: Seat, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMovesOf(board, side);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const cap = board[m.to];
    board[m.to] = board[m.from];
    board[m.from] = null;
    n += perft(board, side === 0 ? 1 : 0, depth - 1);
    board[m.from] = board[m.to];
    board[m.to] = cap;
  }
  return n;
}

const pos = (fen: string) => new XiangqiRules({ startFen: fen, moves: [] });

describe('xiangqi — move generation', () => {
  it('perft from the start position matches published values (44 / 1920 / 79666)', () => {
    const { board } = parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1');
    expect(perft(board, 0, 1)).toBe(44);
    expect(perft(board, 0, 2)).toBe(1920);
    expect(perft(board, 0, 3)).toBe(79666);
  });

  it('horse leg (蹩馬腿) blocks the horse', () => {
    const g = pos('4k4/9/9/9/9/9/9/4P4/4N4/3K5 w - - 0 1');
    const moves = g.legalMovesFrom('e2');
    expect(moves).not.toContain('e2d4');
    expect(moves).not.toContain('e2f4');
    expect(moves).toContain('e2c3');
  });

  it('elephant eye (塞象眼) and elephants cannot cross the river', () => {
    const g = pos('3k5/9/9/9/9/2B6/3P5/9/9/4K4 w - - 0 1');
    const moves = g.legalMovesFrom('c5');
    expect(moves).not.toContain('c5e3'); // eye d4 blocked
    expect(moves).toContain('c5a3');
    expect(moves.some((m) => m.endsWith('7'))).toBe(false); // e7/a7 across river
  });

  it('cannon needs exactly one screen to capture (炮打隔子)', () => {
    const g = pos('5k3/9/9/4p4/9/4r4/9/9/4C4/3K5 w - - 0 1');
    const moves = g.legalMovesFrom('e2');
    expect(moves).toContain('e2e7'); // jump over r on e5, capture p on e7
    expect(moves).not.toContain('e2e5'); // can't capture without screen
  });

  it('generals may not face each other (將帥不得照面)', () => {
    const g = pos('3k5/9/9/9/9/9/p8/9/9/4K4 w - - 0 1');
    expect(g.legalMoves()).not.toContain('e1d1');
    expect(g.legalMoves()).toContain('e1f1');
  });

  it('soldier moves sideways only after crossing the river', () => {
    const g = pos('3k5/9/9/9/9/9/2P6/9/9/4K4 w - - 0 1');
    expect(g.legalMovesFrom('c4')).toEqual(['c4c5']);
    const h = pos('3k5/9/9/9/2P6/9/9/9/9/4K4 w - - 0 1');
    expect(h.legalMovesFrom('c6').sort()).toEqual(['c6b6', 'c6c7', 'c6d6']);
  });

  it('palace limits for general and advisor', () => {
    const g = pos('3k5/9/9/9/9/9/p8/9/9/3AK4 w - - 0 1');
    expect(g.legalMovesFrom('d1')).toEqual(['d1e2']);
    expect(g.legalMovesFrom('e1').sort()).toEqual(['e1e2', 'e1f1']);
  });
});

describe('xiangqi — results', () => {
  it('checkmate', () => {
    const g = pos('1R1k5/R8/9/9/9/9/9/9/9/4K4 b - - 0 1');
    expect(g.result()).toEqual({ kind: 'win', winner: 0, reason: 'checkmate' });
  });

  it('no legal move without check (困斃) loses', () => {
    const g = pos('3k5/R8/9/9/9/9/9/9/9/4K4 b - - 0 1');
    expect(g.inCheck()).toBe(false);
    expect(g.result()).toEqual({ kind: 'win', winner: 0, reason: 'stalemate_loss' });
  });

  it('insufficient attacking material is a draw', () => {
    expect(pos('3ak4/9/9/9/9/9/9/9/9/4KA3 w - - 0 1').result()).toEqual({ kind: 'draw', reason: 'insufficient_material' });
  });

  it('perpetual check (長將) loses for the checking side', () => {
    // Red chariot checks back and forth; black king shuffles.
    const g = pos('4k4/9/9/9/9/9/9/9/9/R2K5 w - - 0 1');
    g.play('a1a10');
    const cycle = ['e10e9', 'a10a9', 'e9e10', 'a9a10'];
    let res = null;
    for (let i = 0; i < 3 && !res; i++) {
      for (const m of cycle) {
        if (!g.play(m)) throw new Error(`bad ${m} ${g.fen()} ${g.legalMoves()}`);
        res = g.result();
        if (res) break;
      }
    }
    expect(res).toEqual({ kind: 'win', winner: 1, reason: 'perpetual_check' });
  });

  it('plain repetition without check or chase is a draw', () => {
    const g = new XiangqiRules();
    const cycle = ['b1c3', 'b10c8', 'c3b1', 'c8b10'];
    let res = null;
    for (let i = 0; i < 3 && !res; i++)
      for (const m of cycle) {
        g.play(m);
        res = g.result();
        if (res) break;
      }
    expect(res).toEqual({ kind: 'draw', reason: 'repetition' });
  });

  it('chinese notation', () => {
    const { board } = parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1');
    expect(chineseNotation(board, parseSq('h3'), parseSq('e3'))).toBe('炮二平五');
    expect(chineseNotation(board, parseSq('h1'), parseSq('g3'))).toBe('傌二進三');
    expect(chineseNotation(board, parseSq('h10'), parseSq('g8'))).toBe('馬８進７');
    expect(chineseNotation(board, parseSq('h8'), parseSq('e8'))).toBe('包８平５');
    expect(chineseNotation(board, parseSq('a1'), parseSq('a2'))).toBe('俥九進一');
  });

  it('rebuilds from state', () => {
    const g = new XiangqiRules();
    ['h3e3', 'h10g8', 'h1g3'].forEach((m) => g.play(m));
    expect(new XiangqiRules(g.state()).fen()).toBe(g.fen());
  });
});
