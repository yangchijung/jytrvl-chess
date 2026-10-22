import type { GameRoom } from './GameRoom';
import type { Matchmaker } from './Matchmaker';
import type { RateLimiter } from './RateLimiter';
import type { TerritoryRoom } from './TerritoryRoom';
import type { TerritoryLobby } from './TerritoryLobby';
import type { SnakeRoom } from './arena/SnakeRoom';
import type { BlocksRoom } from './arena/BlocksRoom';
import type { ArenaLobby } from './arena/ArenaLobby';
import type { RescueRoom } from './RescueRoom';

export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameRoom>;
  MATCH: DurableObjectNamespace<Matchmaker>;
  LIMITER: DurableObjectNamespace<RateLimiter>;
  TROOMS: DurableObjectNamespace<TerritoryRoom>;
  TLOBBY: DurableObjectNamespace<TerritoryLobby>;
  SROOMS: DurableObjectNamespace<SnakeRoom>;
  BROOMS: DurableObjectNamespace<BlocksRoom>;
  ALOBBY: DurableObjectNamespace<ArenaLobby>;
  RROOMS: DurableObjectNamespace<RescueRoom>;
  /** "off" makes every new Territory room four-way again (T3 kill switch); anything else allows 'flow' rooms */
  TERRITORY_FLOW?: string;
}
