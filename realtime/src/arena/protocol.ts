// Shared realtime protocol for the arena games (Snake Arena, Block Puzzle Battle).
// Room lobby / seating / host controls are identical; each game adds its own state messages.
import type { SnakeResult, SnakeEvent } from '../../../shared/snake/engine';
import type { BlocksSnapshot } from '../../../shared/blocks/engine';

export type ArenaGameId = 'snake' | 'blocks';
export type ArenaLevel = 'easy' | 'medium' | 'hard';
export type ArenaStatus = 'lobby' | 'countdown' | 'playing' | 'ended';
export type ArenaKind = 'private' | 'match' | 'ranked';

export interface ArenaSeatPublic {
  name: string;
  bot: boolean;
  level?: ArenaLevel;
  connected: boolean;
  isUser: boolean;
  color: number;
  rating?: number;
}

export interface ArenaOptions {
  /** snake: match length in minutes; blocks: unused */
  minutes: number;
  /** snake map */
  map?: string;
}

export type ArenaClientMsg =
  | { t: 'start' }
  | { t: 'bot'; op: 'add'; level: ArenaLevel }
  | { t: 'bot'; op: 'remove'; seat: number }
  | { t: 'again' }
  | { t: 'ping' }
  // snake
  | { t: 'dir'; d: number }
  // blocks: action index applied at client tick k, sequence number s
  | { t: 'in'; s: number; k: number; a: number };

export interface ArenaLobbyMsg {
  t: 'lobby';
  game: ArenaGameId;
  id: string;
  kind: ArenaKind;
  status: ArenaStatus;
  options: ArenaOptions;
  hostSeat: number | null;
  mySeat: number | null;
  seats: ArenaSeatPublic[];
  maxSeats: number;
}

// ---- Snake ----
export interface SnakeSnapMsg {
  t: 'ssnap';
  status: ArenaStatus;
  snap: unknown; // SnakeGame snapshot
  mySeat: number | null;
  countdownMs: number;
}
/** per step: sn = flat [alive, head, length, dir, score, kills] per snake; fa/fr = food added [cell, kind…] / removed */
export interface SnakeStepMsg {
  t: 'sstep';
  n: number;
  sn: number[];
  fa: number[];
  fr: number[];
  ev: SnakeEvent[];
}
export const SNAKE_FIELDS = 6;

// ---- Blocks ----
export interface BlocksStateMsg {
  t: 'bstate';
  seat: number;
  /** last input sequence number applied for this seat */
  ack: number;
  snap: BlocksSnapshot;
}
export interface BlocksStartMsg {
  t: 'bstart';
  status: ArenaStatus;
  seed: number;
  mySeat: number | null;
  /** ms until play starts */
  countdownMs: number;
  /** server tick at the moment of sending (for clock alignment) */
  serverTick: number;
  snaps: BlocksSnapshot[];
}

export interface ArenaEndMsg {
  t: 'end';
  winner: number | null;
  reason: string;
  ranking: number[];
  recorded: boolean;
  ratingChange?: { old: number; new: number }[] | null;
  result?: SnakeResult;
}

export type ArenaServerMsg =
  | ArenaLobbyMsg
  | SnakeSnapMsg
  | SnakeStepMsg
  | BlocksStateMsg
  | BlocksStartMsg
  | ArenaEndMsg
  | { t: 'error'; code: string }
  | { t: 'pong' }
  | { t: 'matched'; room: string }
  | { t: 'queue'; waiting: number };

export const ARENA_COUNTDOWN_MS = 3000;
export const ARENA_ROOM_TTL_MS = 6 * 3600_000;
export const BOT_NAMES = ['Nova', 'Pixel', 'Bolt', 'Mochi', 'Echo', 'Kiwi', 'Comet', 'Tofu'];
