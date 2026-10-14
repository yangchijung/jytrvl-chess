// Published rulings for JY Games Taiwan Xiangqi Rules v1.0 §6 (see docs/rules/xiangqi.md §6.1).
// Each case is a legal game: start FEN + move list; tests/xiangqi-rulings.test.ts replays them.
import type { GameResult } from '../../types';

export interface Ruling {
  id: string;
  fen: string;
  moves: string[];
  expect: GameResult | null;
  note: string;
}

/** repeat a 4-ply cycle until the engine ends the game (or `max` plies) */
const cycle = (first: string[], loop: string[], times = 3) => [...first, ...Array.from({ length: loop.length * times }, (_, i) => loop[i % loop.length])];

export const RULINGS: Ruling[] = [
  {
    id: 'XQ01',
    fen: '4k4/9/9/9/9/9/9/9/9/R2K5 w - - 0 1',
    moves: cycle(['a1a10'], ['e10e9', 'a10a9', 'e9e10', 'a9a10']),
    expect: { kind: 'win', winner: 1, reason: 'perpetual_check' },
    note: '紅車每步將軍，黑將閒走 → 紅負（長將）',
  },
  {
    id: 'XQ02',
    fen: 'r2k5/9/9/9/9/9/9/9/9/4K4 b - - 0 1',
    moves: cycle(['a10a1'], ['e1e2', 'a1a2', 'e2e1', 'a2a1']),
    expect: { kind: 'win', winner: 0, reason: 'perpetual_check' },
    note: '黑車每步將軍，紅帥閒走 → 黑負（長將）',
  },
  {
    id: 'XQ03',
    fen: '1n1k5/9/9/9/9/9/9/9/9/R3K4 w - - 0 1',
    moves: cycle(['a1b1'], ['b10c8', 'b1c1', 'c8b10', 'c1b1']),
    expect: { kind: 'win', winner: 1, reason: 'perpetual_chase' },
    note: '紅車每步捉無根黑馬，黑馬逃走不捉子 → 紅負（長捉）',
  },
  {
    id: 'XQ04',
    fen: 'r2k5/9/9/9/9/9/9/9/9/1N2K4 b - - 0 1',
    moves: cycle(['a10b10'], ['b1c3', 'b10c10', 'c3b1', 'c10b10']),
    expect: { kind: 'win', winner: 0, reason: 'perpetual_chase' },
    note: '黑車每步捉無根紅傌，紅傌逃走不捉子 → 黑負（長捉）',
  },
  {
    id: 'XQ05',
    fen: '1n1k5/3C5/9/4C4/9/9/9/9/9/R3K4 w - - 0 1',
    moves: cycle(['a1b1'], ['b10c8', 'b1c1', 'c8b10', 'c1b1']),
    expect: { kind: 'draw', reason: 'repetition' },
    note: '紅車每步捉黑馬；黑馬每步以小捉大（捉紅炮）→ 雙方皆違規，和局',
  },
  {
    id: 'XQ06',
    fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
    moves: cycle([], ['b1c3', 'b10c8', 'c3b1', 'c8b10']),
    expect: { kind: 'draw', reason: 'repetition' },
    note: '雙方閒著循環 → 和局',
  },
  {
    id: 'XQ07',
    fen: '3k5/9/9/p1p6/9/9/9/9/9/R3K4 w - - 0 1',
    moves: cycle([], ['a1c1', 'd10d9', 'c1a1', 'd9d10']),
    expect: { kind: 'draw', reason: 'repetition' },
    note: '紅車輪流攻擊黑方未過河的卒 → 不算捉，閒著循環和局',
  },
];

