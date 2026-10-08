// jytrvl-chess-realtime — hosts the Durable Objects used by the JY Chess Pages project.
// This worker has no public route (workers_dev = false); it is reached only via DO bindings.
export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';
export { RateLimiter } from './RateLimiter';

export default {
  async fetch(): Promise<Response> {
    return new Response('JY Chess realtime service', { status: 404 });
  },
} satisfies ExportedHandler;
