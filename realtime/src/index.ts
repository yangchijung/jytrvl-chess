// jytrvl-chess-realtime — hosts the Durable Objects used by the JY Games Pages project.
// This worker has no public route (workers_dev = false); it is reached only via DO bindings.
export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';
export { RateLimiter } from './RateLimiter';
export { TerritoryRoom } from './TerritoryRoom';
export { TerritoryLobby } from './TerritoryLobby';
export { SnakeRoom } from './arena/SnakeRoom';
export { BlocksRoom } from './arena/BlocksRoom';
export { ArenaLobby } from './arena/ArenaLobby';

export default {
  async fetch(): Promise<Response> {
    return new Response('JY Games realtime service', { status: 404 });
  },
} satisfies ExportedHandler;
