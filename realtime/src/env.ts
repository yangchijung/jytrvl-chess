import type { GameRoom } from './GameRoom';
import type { Matchmaker } from './Matchmaker';
import type { RateLimiter } from './RateLimiter';

export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameRoom>;
  MATCH: DurableObjectNamespace<Matchmaker>;
  LIMITER: DurableObjectNamespace<RateLimiter>;
}
