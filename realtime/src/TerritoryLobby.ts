// TerritoryLobby Durable Object — public matchmaking queue for Territory Rush.
// Starts a match as soon as 8 players wait, or 10 s after the second player joined.
// Matches with fewer than 4 humans are topped up with Medium bots.
import { DurableObject } from 'cloudflare:workers';
import { roomCode } from '../../server/crypto';
import type { Env } from './env';
import type { TRoomMeta, TSeat } from './TerritoryRoom';
import type { TServerMsg } from './territoryProtocol';

interface Waiter {
  playerId: string;
  userId: string | null;
  name: string;
  ipHash: string;
  joinedAt: number;
}

const FILL_TO = 4;
const WAIT_MS = 10_000;
const BOT_NAMES = ['Nova', 'Pixel', 'Bolt', 'Mochi', 'Echo', 'Kiwi', 'Comet', 'Tofu'];

export class TerritoryLobby extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const w: Waiter = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: req.headers.get('x-jy-name') ?? 'Guest',
      ipHash: req.headers.get('x-jy-ip') ?? '',
      joinedAt: Date.now(),
    };
    if (!w.playerId) return new Response('no identity', { status: 400 });
    for (const old of this.ctx.getWebSockets(w.playerId)) old.close(4000, 'replaced');
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [w.playerId]);
    pair[1].serializeAttachment(w);
    await this.evaluate();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (String(raw).includes('ping')) ws.send(JSON.stringify({ t: 'pong' } satisfies TServerMsg));
  }
  async webSocketClose() {
    this.notify();
  }
  async alarm() {
    await this.evaluate(true);
  }

  private queue(): { ws: WebSocket; w: Waiter }[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, w: ws.deserializeAttachment() as Waiter }))
      .filter((x) => x.w)
      .sort((a, b) => a.w.joinedAt - b.w.joinedAt);
  }

  private notify() {
    const q = this.queue();
    for (const x of q) {
      try {
        x.ws.send(JSON.stringify({ t: 'queue', waiting: q.length } satisfies TServerMsg));
      } catch {
        /* closed */
      }
    }
  }

  private async evaluate(fromAlarm = false) {
    const q = this.queue();
    if (q.length >= 8 || (q.length >= 2 && (fromAlarm || Date.now() - q[1].w.joinedAt >= WAIT_MS))) {
      const group = q.slice(0, 8);
      const seats: TSeat[] = group.map((x) => ({ playerId: x.w.playerId, userId: x.w.userId, name: x.w.name, bot: false, ipHash: x.w.ipHash }));
      for (let k = 0; seats.length < FILL_TO; k++) seats.push({ playerId: null, userId: null, name: `${BOT_NAMES[k]}🤖`, bot: true, level: 'medium', ipHash: '' });
      const room = await this.createRoom(seats);
      for (const x of group) {
        x.ws.send(JSON.stringify({ t: 'matched', room } satisfies TServerMsg));
        x.ws.close(1000, 'matched');
      }
    } else if (q.length >= 2) {
      const due = q[1].w.joinedAt + WAIT_MS;
      const cur = await this.ctx.storage.getAlarm();
      if (cur === null || cur > due) await this.ctx.storage.setAlarm(due);
    }
    this.notify();
  }

  private async createRoom(seats: TSeat[]): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const id = roomCode();
      const meta: TRoomMeta = { id, kind: 'match', minutes: 3, hostId: null, createdAt: Date.now() };
      const stub = this.env.TROOMS.get(this.env.TROOMS.idFromName(id));
      const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ meta, seats }) });
      if (res.ok) return id;
    }
    throw new Error('could not allocate room');
  }
}
