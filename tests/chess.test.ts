import { describe, it, expect } from 'vitest';
import { ChessRules } from '../shared/games/chess/rules';

const play = (moves: string[], fen?: string) => {
  const g = new ChessRules(fen ? { startFen: fen, moves: [] } : undefined);
  for (const m of moves) expect(g.play(m), m).not.toBeNull();
  return g;
};

describe('chess — FIDE rules', () => {
  it('has 20 legal moves at start', () => {
    expect(new ChessRules().legalMoves()).toHaveLength(20);
  });

  it('rejects illegal moves and moves after the game ended', () => {
    const g = new ChessRules();
    expect(g.play('e2e5')).toBeNull();
    expect(g.play('e7e5')).toBeNull(); // wrong side
    expect(g.play('zz')).toBeNull();
    const m = play(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(m.result()).toEqual({ kind: 'win', winner: 1, reason: 'checkmate' });
    expect(m.play('a2a3')).toBeNull();
  });

  it('castling both sides and loses rights after king moves', () => {
    const g = new ChessRules({ startFen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', moves: [] });
    expect(g.legalMoves()).toContain('e1g1');
    expect(g.legalMoves()).toContain('e1c1');
    g.play('e1g1');
    expect(g.fen().split(' ')[2]).toBe('kq');
    expect(g.legalMoves()).toContain('e8c8');
  });

  it('cannot castle through check', () => {
    const g = new ChessRules({ startFen: 'r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1', moves: [] });
    expect(g.legalMoves()).not.toContain('e1g1');
  });

  it('en passant only immediately', () => {
    const g = play(['e2e4', 'a7a6', 'e4e5', 'd7d5']);
    expect(g.legalMoves()).toContain('e5d6');
    g.play('e5d6');
    expect(g.records.at(-1)!.capture).toBe('p');
    const h = play(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'a2a3', 'a6a5']);
    expect(h.legalMoves()).not.toContain('e5d6');
  });

  it('promotion requires explicit piece and supports underpromotion', () => {
    const g = new ChessRules({ startFen: '8/P7/8/8/8/8/8/k6K w - - 0 1', moves: [] });
    expect(g.play('a7a8')).toBeNull();
    expect(g.play('a7a8n')).not.toBeNull();
    expect(g.fen().startsWith('N7')).toBe(true);
  });

  it('stalemate is an automatic draw', () => {
    const g = play(['b5b6'], 'k7/8/8/1Q6/8/8/8/K7 w - - 0 1');
    expect(g.result()).toEqual({ kind: 'draw', reason: 'stalemate' });
  });

  it('insufficient material', () => {
    expect(new ChessRules({ startFen: 'k7/8/8/8/8/8/8/K6B w - - 0 1', moves: [] }).result()?.reason).toBe('insufficient_material');
    expect(new ChessRules({ startFen: 'k7/8/8/8/8/8/8/K6R w - - 0 1', moves: [] }).result()).toBeNull();
  });

  it('threefold is claimable, fivefold is automatic', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const g = play([...shuffle, ...shuffle]);
    expect(g.repetitionCount()).toBe(3);
    expect(g.result()).toBeNull();
    expect(g.claimableDraw()).toEqual({ reason: 'threefold_repetition' });
    for (const m of [...shuffle, ...shuffle]) g.play(m);
    expect(g.repetitionCount()).toBe(5);
    expect(g.result()).toEqual({ kind: 'draw', reason: 'fivefold_repetition' });
  });

  it('fifty-move claim and seventy-five-move automatic', () => {
    const g = new ChessRules({ startFen: 'k7/8/8/8/8/8/8/K6R w - - 99 80', moves: [] });
    expect(g.claimableDraw()).toBeNull();
    g.play('h1h2');
    expect(g.claimableDraw()).toEqual({ reason: 'fifty_move' });
    const h = new ChessRules({ startFen: 'k7/8/8/8/8/8/8/K6R w - - 149 80', moves: [] });
    h.play('h1h2');
    expect(h.result()).toEqual({ kind: 'draw', reason: 'seventyfive_move' });
  });

  it('checkmate on the 150th half-move wins rather than draws', () => {
    const g = new ChessRules({ startFen: 'k7/8/1K6/8/8/8/8/7R w - - 149 80', moves: [] });
    g.play('h1h8');
    expect(g.result()).toEqual({ kind: 'win', winner: 0, reason: 'checkmate' });
  });

  it('PGN round trip and state rebuild', () => {
    const g = play(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
    const pgn = g.pgn({ Event: 'JY Games' });
    expect(pgn).toContain('3. Bb5');
    const back = ChessRules.fromPgn(pgn);
    expect(back.fen()).toBe(g.fen());
    expect(new ChessRules(g.state()).fen()).toBe(g.fen());
  });

  it('timeout material check', () => {
    const g = new ChessRules({ startFen: 'k7/8/8/8/8/8/8/K6N w - - 0 1', moves: [] });
    expect(g.hasMatingMaterial(0)).toBe(false);
    expect(g.hasMatingMaterial(1)).toBe(false);
  });
});
