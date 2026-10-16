// RescueRoom Durable Object — Planet Rescue Crew played on separate devices (2–3 people, own accounts or
// guest names). The rules live in shared/rescue/room.ts; this object only stores the room, tracks
// connections and sends each person their own view. No results are recorded anywhere.
import { DurableObject } from 'cloudflare:workers';
import { effectiveHost, join, newRoom, reduce, seatOf, type RClientMsg, type RServerMsg, type RescueRoomState } from '../../shared/rescue/room';
import type { Env } from './env';

export const R_ROOM_TTL_MS = 6 * 3600_000;

interface Attachment {
  playerId: string;
  userId: string | null;
  name: string;
}

export class RescueRoom extends DurableObject<Env> {
  private s: RescueRoomState | null = null;
  private buckets = new Map<WebSocket, { tokens: number; at: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<RescueRoomState>('room')) ?? null;
    });
  }

  private async save() {
    if (!this.s) return;
    await this.ctx.storage.put('room', this.s);
    await this.ctx.storage.setAlarm(Date.now() + R_ROOM_TTL_MS);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (this.s) return Response.json({ error: 'exists' }, { status: 409 });
      const body = (await req.json()) as { id: string; hostId: string; missionId: string };
      this.s = newRoom(body.id, body.hostId, body.missionId);
      await this.save();
      return Response.json({ ok: true });
    }
    if (url.pathname === '/info') {
      if (!this.s) return Response.json({ exists: false });
      return Response.json({ exists: true, players: this.s.seats.length, missionId: this.s.missionId });
    }
    if (url.pathname === '/ws') return this.accept(req);
    return new Response('not found', { status: 404 });
  }

  private connectedSeats(): number[] {
    if (!this.s) return [];
    return this.s.seats.map((x, i) => (this.ctx.getWebSockets(x.playerId).some((w) => w.readyState === WebSocket.OPEN) ? i : -1)).filter((i) => i >= 0);
  }

  private accept(req: Request): Response {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!this.s) return new Response('room not found', { status: 404 });
    const att: Attachment = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: (req.headers.get('x-jy-name') ?? 'Guest').slice(0, 24),
    };
    if (!att.playerId) return new Response('no identity', { status: 400 });
    const connected = this.connectedSeats(); // before this socket counts
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [att.playerId]);
    pair[1].serializeAttachment(att);
    const next = join(this.s, { playerId: att.playerId, userId: att.userId, name: att.name }, connected);
    if (next !== this.s) {
      this.s = next;
      void this.save();
    }
    queueMicrotask(() => this.sendAll());
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.s || !this.allow(ws)) return;
    let m: RClientMsg;
    try {
      m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (m.t === 'ping') return this.send(ws, { t: 'pong' });
    const att = ws.deserializeAttachment() as Attachment;
    const { state, error } = reduce(this.s, att.playerId, m, this.connectedSeats());
    if (error) return this.send(ws, { t: 'error', code: error });
    if (state !== this.s) {
      this.s = state;
      await this.save();
      this.sendAll();
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.buckets.delete(ws);
    this.sendAll();
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? { tokens: 20, at: now };
    b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 10);
    b.at = now;
    this.buckets.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'expired');
    await this.ctx.storage.deleteAll();
    this.s = null;
  }

  private send(ws: WebSocket, m: RServerMsg) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* closed */
    }
  }

  private sendAll() {
    const s = this.s;
    if (!s) return;
    const connected = this.connectedSeats();
    const host = effectiveHost(s, connected);
    const seats = s.seats.map((x, i) => ({ name: x.name, connected: connected.includes(i), isUser: !!x.userId }));
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { t: 'state', id: s.id, mySeat: seatOf(s, att.playerId), hostSeat: host, seats, roles: s.roles, missionId: s.missionId, plan: s.plan, oks: s.oks, result: s.result, runId: s.runId, done: s.done });
    }
  }
}
