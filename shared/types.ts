// JY Chess — shared types used by the browser, Pages Functions and the realtime worker.
// Every game module implements GameModule so the platform (rooms, history, UI shell)
// never needs to know the rules of a particular game.

export type GameId = 'chess' | 'xiangqi' | 'banqi';
export const GAME_IDS: GameId[] = ['chess', 'xiangqi', 'banqi'];

/** Seat in a game. For chess/xiangqi seat 0 = white/red (moves first). For banqi seat 0 moves first; colour is decided by the first flip. */
export type Seat = 0 | 1;

export type ResultKind = 'win' | 'draw';

export interface GameResult {
  kind: ResultKind;
  /** winning seat when kind === 'win' */
  winner?: Seat;
  /** machine-readable reason, translated by the UI (i18n key `reason.<code>`) */
  reason: string;
}

export interface MoveRecord {
  /** canonical move string understood by the module (e.g. "e2e4", "e2e4q", "h2e2", "f:a1", "m:a1-a2") */
  move: string;
  /** human-readable notation for the move list (SAN for chess, Chinese notation for xiangqi …) */
  notation: string;
  /** seat that played it */
  seat: Seat;
  /** optional extra data (banqi flips reveal a piece) */
  reveal?: string;
  capture?: string;
}

export interface DrawClaim {
  /** reason code when the player *may* claim a draw (threefold, fifty-move) */
  reason: string;
}

export interface Clock {
  initialMs: number;
  incrementMs: number;
}

export interface TimeControl {
  /** minutes per side, 0 = untimed */
  minutes: number;
  incrementSec: number;
}

export const DEFAULT_TIME_CONTROLS: TimeControl[] = [
  { minutes: 0, incrementSec: 0 },
  { minutes: 3, incrementSec: 2 },
  { minutes: 5, incrementSec: 3 },
  { minutes: 10, incrementSec: 5 },
  { minutes: 15, incrementSec: 10 },
  { minutes: 30, incrementSec: 0 },
];
