// WebSocket protocol shared by the browser client and the GameRoom Durable Object.
import type { GameId, GameResult, MoveRecord, Seat, TimeControl } from '../../shared/types';
import type { PublicPosition, AnyState } from '../../shared/games/registry';

export type BanqiPresetName = 'taiwan' | 'taiwan_chain' | 'strict_rank';

export interface RoomMeta {
  id: string;
  game: GameId;
  rated: boolean;
  time: TimeControl;
  banqiPreset: BanqiPresetName;
  createdAt: number;
  kind: 'private' | 'match';
  creatorId: string | null;
  creatorSeat: 'first' | 'second' | 'random';
}

export interface SeatInfo {
  playerId: string;
  userId: string | null;
  name: string;
  rating: number | null;
  ipHash: string;
}

export type ClientMsg =
  | { t: 'move'; m: string; ply: number }
  | { t: 'resign' }
  | { t: 'offer'; kind: 'draw' | 'undo' }
  | { t: 'respond'; accept: boolean }
  | { t: 'claim' }
  | { t: 'ping' };

export interface RoomStateMsg {
  t: 'state';
  room: {
    id: string;
    game: GameId;
    rated: boolean;
    time: TimeControl;
    status: 'waiting' | 'playing' | 'ended';
    seats: [PublicSeat | null, PublicSeat | null];
    mySeat: Seat | null;
    position: PublicPosition | null;
    records: MoveRecord[];
    moves: string[];
    sideToMove: Seat;
    result: GameResult | null;
    clock: { ms: [number, number] | null; running: Seat | null; serverNow: number };
    offer: { kind: 'draw' | 'undo'; from: Seat } | null;
    lastMove: [string, string] | null;
    checkSquare: string | null;
    claimable: string | null;
    awaySeat: Seat | null;
    awayDeadline: number | null;
    ratingChange: [{ old: number; new: number } | null, { old: number; new: number } | null] | null;
    /** full state (incl. banqi layout) — only sent after the game has ended */
    final: AnyState | null;
  };
}

export interface PublicSeat {
  name: string;
  rating: number | null;
  connected: boolean;
  isUser: boolean;
}

export type ServerMsg = RoomStateMsg | { t: 'error'; code: string } | { t: 'pong' } | { t: 'matched'; room: string } | { t: 'queue'; waiting: number };

export const ABANDON_MS = 60_000;
export const ROOM_TTL_MS = 24 * 3600_000;
export const WAITING_TTL_MS = 6 * 3600_000;
