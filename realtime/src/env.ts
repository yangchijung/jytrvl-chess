import type { GameRoom } from './GameRoom';
import type { Matchmaker } from './Matchmaker';
import type { RateLimiter } from './RateLimiter';
import type { TerritoryRoom } from './TerritoryRoom';
import type { TerritoryLobby } from './TerritoryLobby';
import type { SnakeRoom } from './arena/SnakeRoom';
import type { BlocksRoom } from './arena/BlocksRoom';
import type { ArenaLobby } from './arena/ArenaLobby';

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
}
