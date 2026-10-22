// Territory Rush realtime protocol (browser ⇄ TerritoryRoom Durable Object).
import type { Dir, EndResult, TerritoryEvent, TerritorySnapshot } from '../../shared/territory/engine';
import type { BotLevel } from '../../shared/territory/ai';
import type { FlowPublic } from '../../shared/territory/flow';

/**
 * Movement engine of a room, fixed when the room is created and never changed afterwards (T3 versioning):
 * 'grid' = the original four-way game (every room created before T3, and rooms asked for by old pages);
 * 'flow' = continuous steering. A room without the field is 'grid'.
 */
export type TEngine = 'grid' | 'flow';

export type TRoomStatus = 'lobby' | 'countdown' | 'playing' | 'ended';

export interface TSeatPublic {
  name: string;
  bot: boolean;
  level?: BotLevel;
  connected: boolean;
  isUser: boolean;
  color: number;
}

export type TClientMsg =
  | { t: 'dir'; d: Dir }
  /** continuous steering: target heading in radians (screen axes); only in 'flow' rooms */
  | { t: 'aim'; a: number }
  | { t: 'start' }
  | { t: 'bot'; op: 'add'; level: BotLevel }
  | { t: 'bot'; op: 'remove'; seat: number }
  | { t: 'again' }
  | { t: 'ping' };

export interface TLobbyMsg {
  t: 'lobby';
  id: string;
  kind: 'private' | 'match';
  status: TRoomStatus;
  minutes: number;
  /** absent = 'grid' (servers before T3) */
  engine?: TEngine;
  hostSeat: number | null;
  mySeat: number | null;
  seats: TSeatPublic[];
}

export interface TSnapMsg {
  t: 'snap';
  status: TRoomStatus;
  snap: TerritorySnapshot;
  mySeat: number | null;
  /** ms until play starts (countdown) */
  countdownMs: number;
  /** 'flow' rooms: every player's continuous state */
  flow?: FlowPublic[];
}

/** Per-tick delta. pl = flat [x, y, dir, alive, land, kills, bestLand] per player. */
export interface TTickMsg {
  t: 'tick';
  n: number;
  pl: number[];
  oc: number[]; // owner changes: index, value, …
  tc: number[]; // trail changes: index, value, …
  ev: TerritoryEvent[];
  /** 'flow' rooms: [fx, fy, heading, target] × FL_SCALE per player (pl stays filled for older pages) */
  fl?: number[];
}

export interface TEndMsg {
  t: 'end';
  result: EndResult;
  /** stats were stored for the signed-in players of this match */
  recorded: boolean;
}

export type TServerMsg = TLobbyMsg | TSnapMsg | TTickMsg | TEndMsg | { t: 'error'; code: string } | { t: 'pong' } | { t: 'matched'; room: string } | { t: 'queue'; waiting: number };

export const T_PLAYER_FIELDS = 7;
export const T_COUNTDOWN_MS = 3000;
export const T_MIN_PLAYERS = 2;
export const T_ROOM_TTL_MS = 6 * 3600_000;
