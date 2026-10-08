import type { GameId, GameResult, MoveRecord, Seat, TimeControl } from '../../shared/types';
import type { PublicPosition } from '../../shared/games/registry';

export type Mode = 'ai' | 'local' | 'practice' | 'online';

export interface PlayerInfo {
  name: string;
  isAi?: boolean;
  rating?: number;
  connected?: boolean;
}

export interface ClockState {
  /** remaining ms per seat, null when untimed */
  ms: [number, number] | null;
  running: Seat | null;
  paused: boolean;
}

export interface Offer {
  kind: 'draw' | 'undo';
  from: Seat;
}

export interface Snapshot {
  game: GameId;
  mode: Mode;
  position: PublicPosition;
  sideToMove: Seat;
  /** seats this device may move for */
  mySeats: Seat[];
  players: [PlayerInfo, PlayerInfo];
  records: MoveRecord[];
  result: GameResult | null;
  lastMove: [string, string] | null;
  checkSquare: string | null;
  clock: ClockState;
  canUndo: boolean;
  canRedo: boolean;
  canPause: boolean;
  claimable: string | null;
  thinking: boolean;
  offer: Offer | null;
  coachAllowed: boolean;
  rated: boolean;
  /** extra info for online games */
  online?: {
    roomId: string;
    status: 'connecting' | 'open' | 'reconnecting' | 'closed';
    mySeat: Seat | null;
    spectator: boolean;
    waiting: boolean;
    opponentAwaySec: number | null;
    ratingChange?: { old: number; new: number } | null;
    error?: string | null;
  };
}

export interface GameController {
  snapshot(): Snapshot;
  subscribe(fn: () => void): () => void;
  legalFrom(square: string): string[];
  move(m: string): boolean;
  undo(): void;
  redo(): void;
  resign(): void;
  offerDraw(): void;
  claimDraw(): void;
  respondOffer(accept: boolean): void;
  pause(): void;
  resume(): void;
  restart(): void;
  explain(square: string): { key: string } | null;
  dispose(): void;
  /** serialisable save (local only) */
  save?(): unknown;
  /** full game state for review/analysis — null while hidden information must stay secret */
  exportState(): import('../../shared/games/registry').AnyState | null;
  /** rules object for the current position, if available on this device */
  currentRules?(): import('../../shared/games/registry').Rules;
}

export interface LocalOptions {
  game: GameId;
  mode: Exclude<Mode, 'online'>;
  aiSeat: Seat | null;
  level: 'easy' | 'medium' | 'hard';
  time: TimeControl;
  allowUndo: boolean;
  coach: boolean;
  banqiPreset: 'taiwan' | 'taiwan_chain' | 'strict_rank';
  playerNames: [string, string];
}
