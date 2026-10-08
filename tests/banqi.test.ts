import { describe, it, expect } from 'vitest';
import { BanqiRules, fullSet, bqParse, type BqPiece, BANQI_PRESETS } from '../shared/games/banqi/rules';

/** Build a game where every square is already face-up as given (null = empty). Helper flips through history-free setup. */
function setup(cells: (BqPiece | null)[], opts = {}, seatColor: ['red' | 'black', 'red' | 'black'] = ['red', 'black']) {
  const g = new BanqiRules({ layout: fullSet(), moves: [], options: opts });
  g.board = [...cells];
  g.faceUp = cells.map((c) => !!c);
  g.seatColor = seatColor;
  return g;
}
const empty = () => new Array<BqPiece | null>(32).fill(null);
const at = (n: string) => bqParse(n);

describe('banqi — Taiwan default rules', () => {
  it('32 pieces, correct composition, shuffle keeps composition', () => {
    const g = BanqiRules.create();
    expect(g.layout).toHaveLength(32);
    expect([...g.layout].sort().join('')).toBe(fullSet().sort().join(''));
    expect(g.publicView().cells.every((c) => c === 'X')).toBe(true);
  });

  it('first flip decides colours', () => {
    const g = BanqiRules.create();
    expect(g.legalMoves()).toHaveLength(32);
    const rec = g.play('f:a1')!;
    const red = rec.reveal === rec.reveal!.toUpperCase();
    expect(g.seatColor[0]).toBe(red ? 'red' : 'black');
    expect(g.seatColor[1]).toBe(red ? 'black' : 'red');
    expect(g.sideToMove()).toBe(1);
  });

  it('public view never contains hidden identities', () => {
    const g = BanqiRules.create();
    g.play('f:c2');
    const v = g.publicView();
    expect(v.cells.filter((c) => c !== 'X' && c !== null)).toHaveLength(1);
    expect(JSON.stringify(v)).not.toContain('layout');
    expect(Object.values(v.hiddenPool).reduce((a, b) => a + b, 0)).toBe(31);
  });

  it('rank captures: higher or equal captures lower, not the reverse', () => {
    const c = empty();
    c[at('a1')] = 'R';
    c[at('b1')] = 'n';
    c[at('a2')] = 'a';
    const g = setup(c);
    expect(g.legalMoves()).toContain('a1-b1');
    expect(g.legalMoves()).not.toContain('a1-a2');
  });

  it('soldier captures general, general cannot capture soldier', () => {
    const c = empty();
    c[at('a1')] = 'P';
    c[at('b1')] = 'k';
    c[at('h4')] = 'K';
    c[at('g4')] = 'p';
    const g = setup(c);
    expect(g.legalMoves()).toContain('a1-b1');
    expect(g.legalMoves()).not.toContain('h4-g4');
  });

  it('cannon captures only by jumping exactly one piece, any distance, any rank', () => {
    const c = empty();
    c[at('a1')] = 'C';
    c[at('b1')] = 'p';
    c[at('c1')] = null;
    c[at('h1')] = 'k';
    c[at('a2')] = 'a';
    const g = setup(c);
    expect(g.legalMoves()).toContain('a1-h1'); // jump over b1
    expect(g.legalMoves()).not.toContain('a1-b1'); // adjacent: no
    expect(g.legalMoves()).not.toContain('a1-a2');
  });

  it('cannot capture face-down pieces; flipping is always available', () => {
    const g = BanqiRules.create();
    g.play('f:a1');
    g.play('f:h4');
    const moves = g.legalMoves();
    expect(moves.some((m) => m.endsWith('-a2') || m.endsWith('-b1'))).toBe(false);
  });

  it('a side with no pieces loses; a side with no moves loses', () => {
    const c = empty();
    c[at('a1')] = 'R';
    c[at('b1')] = 'n';
    const g = setup(c);
    g.play('a1-b1');
    expect(g.result()).toEqual({ kind: 'win', winner: 0, reason: 'all_captured' });

    const d = empty();
    d[at('a1')] = 'p'; // black to move with a soldier boxed in by red higher pieces it cannot capture
    d[at('a2')] = 'A';
    d[at('b1')] = 'B';
    const h = setup(d);
    h.turn = 1;
    expect(h.result()).toEqual({ kind: 'win', winner: 0, reason: 'no_moves' });
  });

  it('no-progress draw', () => {
    const c = empty();
    c[at('a1')] = 'R';
    c[at('h4')] = 'r';
    const g = setup(c, { repetitionLimit: 0 });
    const cyc = ['a1-a2', 'h4-h3', 'a2-a1', 'h3-h4'];
    let i = 0;
    while (!g.result()) g.play(cyc[i++ % 4]);
    expect(g.result()).toEqual({ kind: 'draw', reason: 'no_progress' });
    expect(i).toBe(50);
  });

  it('repetition draw', () => {
    const c = empty();
    c[at('a1')] = 'R';
    c[at('h4')] = 'r';
    const g = setup(c);
    const cyc = ['a1-a2', 'h4-h3', 'a2-a1', 'h3-h4'];
    let i = 0;
    while (!g.result()) g.play(cyc[i++ % 4]);
    expect(g.result()?.reason).toBe('repetition');
  });

  it('strict rank preset: cannon captures adjacent by rank, no jump', () => {
    const c = empty();
    c[at('a1')] = 'C';
    c[at('b1')] = 'p';
    c[at('h1')] = 'k';
    const g = setup(c, BANQI_PRESETS.strict_rank);
    expect(g.legalMoves()).toContain('a1-b1');
    expect(g.legalMoves()).not.toContain('a1-h1');
  });

  it('chain capture preset lets the same piece keep capturing or pass', () => {
    const c = empty();
    c[at('a1')] = 'R';
    c[at('b1')] = 'n';
    c[at('c1')] = 'p';
    c[at('h4')] = 'k';
    const g = setup(c, BANQI_PRESETS.taiwan_chain);
    g.play('a1-b1');
    expect(g.sideToMove()).toBe(0);
    expect(g.legalMoves().sort()).toEqual(['b1-c1', 'pass']);
    g.play('pass');
    expect(g.sideToMove()).toBe(1);
  });

  it('state replays identically', () => {
    const g = BanqiRules.create();
    for (let i = 0; i < 20 && !g.result(); i++) g.play(g.legalMoves()[0]);
    const h = new BanqiRules(g.state());
    expect(h.publicView()).toEqual(g.publicView());
  });
});

describe('banqi — no information leak through the public view', () => {
  it('public view is identical for two different hidden layouts with the same visible history', () => {
    const a = new BanqiRules({ layout: fullSet(), moves: [] });
    const rev = [...fullSet()].reverse();
    const b = new BanqiRules({ layout: rev, moves: [] });
    const strip = (v: ReturnType<BanqiRules['publicView']>) => JSON.stringify(v);
    expect(strip(a.publicView())).toBe(strip(b.publicView()));
  });
});
