// Matchmaker Durable Object — one instance per pool (game + rated + time control).
// The queue is simply the set of open, hibernatable WebSockets, so it survives hibernation.
import { DurableObject } from 'cloudflare:workers';
import { roomCode } from '../../server/crypto';
import type { Env } from './env';
import type { RoomMeta, SeatInfo, ServerMsg, BanqiPresetName } from './protocol';
import type { GameId } from '../../shared/types';

interface Waiter extends SeatInfo {
  joinedAt: number;
}

export class Matchmaker extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const u = new URL(req.url);
    const w: Waiter = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: req.headers.get('x-jy-name') ?? 'Guest',
      rating: req.headers.get('x-jy-rating') ? Number(req.headers.get('x-jy-rating')) : null,
      ipHash: req.headers.get('x-jy-ip') ?? '',
      joinedAt: Date.now(),
    };
    if (!w.playerId) return new Response('no identity', { status: 400 });
    await this.ctx.storage.put('pool', {
      game: u.searchParams.get('game'),
      rated: u.searchParams.get('rated') === '1',
      minutes: Number(u.searchParams.get('minutes') ?? 5),
      inc: Number(u.searchParams.get('inc') ?? 3),
    });
    // one queue entry per player
    for (const old of this.ctx.getWebSockets(w.playerId)) old.close(4000, 'replaced');
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [w.playerId]);
    pair[1].serializeAttachment(w);
    await this.tryMatch();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (String(raw).includes('ping')) ws.send(JSON.stringify({ t: 'pong' } satisfies ServerMsg));
  }

  async webSocketClose() {
    await this.notifyQueue();
  }

  async alarm() {
    await this.tryMatch();
  }

  private queue(): { ws: WebSocket; w: Waiter }[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, w: ws.deserializeAttachment() as Waiter }))
      .filter((x) => x.w)
      .sort((a, b) => a.w.joinedAt - b.w.joinedAt);
  }

  private compatible(a: Waiter, b: Waiter, rated: boolean, now: number): boolean {
    if (a.playerId === b.playerId) return false;
    if (!rated) return true;
    if (!a.userId || !b.userId || a.userId === b.userId) return false;
    if (a.ipHash && a.ipHash === b.ipHash) return false;
    const waited = (now - Math.min(a.joinedAt, b.joinedAt)) / 1000;
    const window = Math.min(800, 100 + waited * 20);
    return Math.abs((a.rating ?? 1200) - (b.rating ?? 1200)) <= window;
  }

  private async tryMatch() {
    const pool = await this.ctx.storage.get<{ game: GameId; rated: boolean; minutes: number; inc: number }>('pool');
    if (!pool) return;
    const now = Date.now();
    const q = this.queue();
    const used = new Set<WebSocket>();
    for (let i = 0; i < q.length; i++) {
      if (used.has(q[i].ws)) continue;
      for (let j = i + 1; j < q.length; j++) {
        if (used.has(q[j].ws)) continue;
        if (!this.compatible(q[i].w, q[j].w, pool.rated, now)) continue;
        used.add(q[i].ws);
        used.add(q[j].ws);
        const room = await this.createRoom(pool, q[i].w, q[j].w);
        for (const x of [q[i], q[j]]) {
          x.ws.send(JSON.stringify({ t: 'matched', room } satisfies ServerMsg));
          x.ws.close(1000, 'matched');
        }
        break;
      }
    }
    await this.notifyQueue();
    if (this.queue().length >= 2) await this.ctx.storage.setAlarm(Date.now() + 2000);
  }

  private async notifyQueue() {
    const q = this.queue();
    for (const x of q) {
      try {
        x.ws.send(JSON.stringify({ t: 'queue', waiting: q.length } satisfies ServerMsg));
      } catch {
        /* closed */
      }
    }
  }

  private async createRoom(pool: { game: GameId; rated: boolean; minutes: number; inc: number }, a: Waiter, b: Waiter): Promise<string> {
    const flip = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
    const strip = ({ joinedAt: _j, ...s }: Waiter): SeatInfo => s;
    const seats: [SeatInfo, SeatInfo] = flip ? [strip(a), strip(b)] : [strip(b), strip(a)];
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = roomCode();
      const meta: RoomMeta = {
        id,
        game: pool.game,
        rated: pool.rated,
        time: { minutes: pool.minutes, incrementSec: pool.inc },
        banqiPreset: 'taiwan' as BanqiPresetName,
        createdAt: Date.now(),
        kind: 'match',
        creatorId: null,
        creatorSeat: 'random',
      };
      const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(id));
      const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ meta, seats }) });
      if (res.ok) return id;
    }
    throw new Error('could not allocate room');
  }
}
