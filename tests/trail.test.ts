import { describe, expect, it } from 'vitest';
import { apply, bestPlan, campNode, easyPlan, legalMoves, newGame, normalPlan, replay, reviewTurns, turningPoint, turnsLeft, undoTurn, validMap, type Game, type TrailMap } from '../shared/trail/engine';
import { MAPS } from '../shared/trail/maps';

type AI = 'best' | 'normal' | 'easy';
function playTurn(g: Game, ai: AI): Game {
  const me = g.players[g.turn];
  const path = ai === 'best' ? bestPlan(g.map, me).path : ai === 'normal' ? normalPlan(g.map, me) : easyPlan(g.map, me);
  const t = g.turn,
    r = g.round;
  for (const s of path) {
    g = apply(g, { t: 'move', to: s });
    if (g.turn !== t || g.round !== r || g.status !== 'playing') return g;
  }
  return apply(g, { t: 'end' });
}
function play(m: TrailMap, first: 0 | 1, ais: [AI, AI]) {
  let g = newGame(m, first);
  for (let n = 0; g.status === 'playing' && n < 100; n++) g = playTurn(g, ais[g.turn]);
  return g;
}

// tiny line map: start - a(apple) - forest - mud(mountain? no) ...
const LINE: TrailMap = {
  id: 'line',
  name: { zh: '', en: '' },
  nodes: [
    { id: 0, x: 0, y: 0, kind: 'start' },
    { id: 1, x: 10, y: 0, kind: 'apple' },
    { id: 2, x: 20, y: 0, kind: 'badge', badge: 'forest' },
    { id: 3, x: 30, y: 0, kind: 'mud' },
    { id: 4, x: 40, y: 0, kind: 'badge', badge: 'mountain' },
    { id: 5, x: 50, y: 0, kind: 'badge', badge: 'lake' },
    { id: 6, x: 60, y: 0, kind: 'camp' },
  ],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
};

describe('try again trail rules', () => {
  it('energy: +2 per turn, mud costs 2, apple +2 once per explorer, save at most 1', () => {
    let g = newGame(LINE, 0);
    expect(g.players[0].energy).toBe(2);
    g = apply(g, { t: 'move', to: 1 }); // apple: 2-1+2 = 3
    expect(g.players[0].energy).toBe(3);
    g = apply(g, { t: 'move', to: 2 }); // forest badge
    expect(g.players[0].badges).toEqual(['forest']);
    g = apply(g, { t: 'move', to: 3 }); // mud: 2-2 = 0 → turn ends automatically
    expect(g.turn).toBe(1);
    expect(g.players[0].energy).toBe(0);
    g = apply(g, { t: 'end' }); // player 1 rests with 2 → saves 1
    expect(g.players[1].energy).toBe(1);
    expect(g.players[0].energy).toBe(2);
    expect(g.round).toBe(2);
    g = apply(g, { t: 'end' });
    expect(g.players[1].energy).toBe(3);
    g = apply(g, { t: 'move', to: 1 });
    expect(g.players[1].energy).toBe(4); // the apple works for the second explorer too
    expect(() => apply(g, { t: 'move', to: 5 })).toThrow();
  });

  it('first player finishing still gives the second player the round; same round is a tie', () => {
    for (const m of MAPS) {
      for (const f of [0, 1] as const) {
        const g = play(m, f, ['best', 'best']);
        expect(g.status).toBe('over');
        expect(g.winner).toBe('tie');
        expect(g.players[0].doneRound).toBe(g.players[1].doneRound);
      }
    }
  });

  it('the better route wins against a slower one, whoever moves first', () => {
    for (const m of MAPS)
      for (const f of [0, 1] as const) {
        expect(play(m, f, ['best', 'normal']).winner).toBe(0);
        expect(play(m, f, ['normal', 'best']).winner).toBe(1);
      }
  });

  it('maps are valid, need 4 turns at best, and computers finish', () => {
    for (const m of MAPS) {
      expect(validMap(m)).toBe(true);
      const g = newGame(m, 0);
      expect(turnsLeft(m, g.players[0])).toBe(4);
      for (const ai of ['normal', 'easy'] as const) {
        const end = play(m, 0, [ai, ai]);
        expect(end.status).toBe('over');
        expect(end.players[0].at).toBe(campNode(m));
        expect(end.round).toBeLessThanOrEqual(7);
      }
    }
  });

  it('replay from the log rebuilds the same game; undo only rewinds the current turn', () => {
    const m = MAPS[0];
    const g = play(m, 1, ['easy', 'normal']);
    const r = replay(m, 1, g.log);
    expect(r.winner).toBe(g.winner);
    expect(r.players).toEqual(g.players);
    let h = newGame(m, 0);
    h = apply(h, { t: 'move', to: legalMoves(h)[0] });
    const back = undoTurn(h);
    expect(back.log).toEqual([]);
    expect(back.players[0].energy).toBe(2);
    expect(() => apply(replay(m, 0, g.log.concat({ t: 'end' })), { t: 'end' })).toThrow();
  });

  it('review finds the turn that cost an extra turn and suggests the best route', () => {
    const m = MAPS[0];
    // player 0 rests on turn 1, then plays best
    let g = newGame(m, 0);
    g = apply(g, { t: 'end' });
    while (g.status === 'playing') g = playTurn(g, g.turn === 0 ? 'best' : 'normal');
    const rev = reviewTurns(m, 0, g.log, 0);
    expect(rev.length).toBeGreaterThan(0);
    const tp = turningPoint(rev)!;
    expect(tp.round).toBe(1);
    expect(tp.path).toEqual([]);
    expect(tp.after - tp.before).toBeGreaterThan(0);
    expect(tp.better.length).toBeGreaterThan(0);
    // a perfect game has no turning point
    const perfect = play(m, 0, ['best', 'normal']);
    expect(turningPoint(reviewTurns(m, 0, perfect.log, 0))).toBeNull();
  });

  it('rejects malformed maps', () => {
    expect(validMap({ ...MAPS[0], nodes: MAPS[0].nodes.filter((n) => n.kind !== 'camp') })).toBe(false);
    expect(validMap({ ...MAPS[0], edges: MAPS[0].edges.slice(0, 2) })).toBe(false);
    expect(validMap(null)).toBe(false);
  });
});
