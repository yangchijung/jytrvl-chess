import type { GameRoom } from './GameRoom';
import type { Matchmaker } from './Matchmaker';
import type { RateLimiter } from './RateLimiter';
import type { TerritoryRoom } from './TerritoryRoom';
import type { TerritoryLobby } from './TerritoryLobby';

export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameRoom>;
  MATCH: DurableObjectNamespace<Matchmaker>;
  LIMITER: DurableObjectNamespace<RateLimiter>;
  TROOMS: DurableObjectNamespace<TerritoryRoom>;
  TLOBBY: DurableObjectNamespace<TerritoryLobby>;
}
