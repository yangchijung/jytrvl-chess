// Base class for arena game rooms (Snake Arena, Block Puzzle Battle): lobby, seats, host controls,
// bots, reconnection, input rate limiting, idle cleanup. Subclasses implement the game itself.
import { DurableObject } from 'cloudflare:workers';
import { ARENA_COUNTDOWN_MS, ARENA_ROOM_TTL_MS, BOT_NAMES, type ArenaClientMsg, type ArenaGameId, type ArenaKind, type ArenaLevel, type ArenaLobbyMsg, type ArenaOptions, type ArenaServerMsg, type ArenaStatus } from './protocol';
import type { Env } from '../env';

export interface ArenaSeat {
  playerId: string | null; // null = bot
  userId: string | null;
  name: string;
  bot: boolean;
  level?: ArenaLevel;
  ipHash: string;
  rating?: number;
}

export interface ArenaMeta {
  id: string;
  game: ArenaGameId;
  kind: ArenaKind;
  options: ArenaOptions;
  hostId: string | null;
  createdAt: number;
}

export interface Attachment {
  playerId: string;
  userId: string | null;
  name: string;
  ipHash: string;
  rating?: number;
}

export abstract class ArenaRoom extends DurableObject<Env> {
  protected meta: ArenaMeta | null = null;
  protected seats: ArenaSeat[] = [];
  protected status: ArenaStatus = 'lobby';
  protected countdownAt = 0;
  private buckets = new Map<WebSocket, { tokens: number; at: number }>();

  abstract readonly maxSeats: number;
  abstract readonly minSeats: number;
  /** token bucket: burst and refill per second */
  protected readonly bucket = { burst: 30, rate: 25 };

  /** create the game for the current seats and enter countdown */
  protected abstract createGame(seed: number): void;
  /** send the full game state to one socket (join / reconnect) */
  protected abstract sendState(ws: WebSocket, playerId: string): void;
  /** game input from a seated player (or spectator → seat null) */
  protected abstract onGameMessage(seat: number | null, m: ArenaClientMsg, ws: WebSocket): void;
  /** play starts (after countdown) */
  protected abstract startPlay(): void;
  /** drop the game and timers (back to lobby) */
  protected abstract resetGame(): void;
  protected abstract hasGame(): boolean;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<{ meta: ArenaMeta; seats: ArenaSeat[] }>('room');
      if (saved) {
        this.meta = saved.meta;
        this.seats = saved.seats;
      }
    });
  }

  protected async save() {
    if (this.meta) await this.ctx.storage.put('room', { meta: this.meta, seats: this.seats });
    await this.ctx.storage.setAlarm(Date.now() + ARENA_ROOM_TTL_MS);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (this.meta) return Response.json({ error: 'exists' }, { status: 409 });
      const body = (await req.json()) as { meta: ArenaMeta; seats?: ArenaSeat[] };
      this.meta = body.meta;
      this.seats = body.seats ?? [];
      await this.save();
      if (this.meta.kind !== 'private') this.beginCountdown(4000);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/info') {
      if (!this.meta) return Response.json({ exists: false });
      return Response.json({ exists: true, game: this.meta.game, kind: this.meta.kind, status: this.status, players: this.seats.length });
    }
    if (url.pathname === '/ws') return this.accept(req);
    return new Response('not found', { status: 404 });
  }

  private accept(req: Request): Response {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!this.meta) return new Response('room not found', { status: 404 });
    const rating = Number(req.headers.get('x-jy-rating') || 0) || undefined;
    const att: Attachment = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: req.headers.get('x-jy-name') ?? 'Guest',
      ipHash: req.headers.get('x-jy-ip') ?? '',
      rating,
    };
    if (!att.playerId) return new Response('no identity', { status: 400 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [att.playerId]);
    pair[1].serializeAttachment(att);
    if (this.status === 'lobby' && this.meta.kind === 'private' && this.seatOf(att.playerId) === null && this.seats.length < this.maxSeats) {
      this.seats.push({ playerId: att.playerId, userId: att.userId, name: att.name, bot: false, ipHash: att.ipHash, rating });
      if (!this.meta.hostId) this.meta.hostId = att.playerId;
      void this.save();
    }
    queueMicrotask(() => {
      this.sendLobby();
      if (this.hasGame()) this.sendState(pair[1], att.playerId);
    });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  protected seatOf(playerId: string): number | null {
    const i = this.seats.findIndex((s) => s.playerId === playerId);
    return i < 0 ? null : i;
  }
  protected connected(playerId: string | null): boolean {
    if (!playerId) return false;
    return this.ctx.getWebSockets(playerId).some((w) => w.readyState === WebSocket.OPEN);
  }
  private hostSeat(): number | null {
    return this.meta?.hostId ? this.seatOf(this.meta.hostId) : null;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.allow(ws)) return;
    let m: ArenaClientMsg;
    try {
      m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const att = ws.deserializeAttachment() as Attachment;
    const seat = this.seatOf(att.playerId);
    if (m.t === 'ping') return this.send(ws, { t: 'pong' });
    if (m.t === 'dir' || m.t === 'in') return this.onGameMessage(seat, m, ws);
    if (m.t !== 'start' && m.t !== 'bot' && m.t !== 'again') return;
    if (att.playerId !== this.meta?.hostId) return this.send(ws, { t: 'error', code: 'not_host' });
    if (m.t === 'bot' && this.status === 'lobby') {
      if (m.op === 'add' && this.seats.length < this.maxSeats) {
        const level: ArenaLevel = ['easy', 'medium', 'hard'].includes(m.level) ? m.level : 'medium';
        const n = this.seats.filter((s) => s.bot).length;
        this.seats.push({ playerId: null, userId: null, name: `${BOT_NAMES[n % 8]}🤖`, bot: true, level, ipHash: '' });
      } else if (m.op === 'remove' && this.seats[m.seat]?.bot) this.seats.splice(m.seat, 1);
      await this.save();
      this.sendLobby();
    } else if (m.t === 'start' && this.status === 'lobby') {
      if (this.seats.length < this.minSeats) return this.send(ws, { t: 'error', code: 'need_two' });
      this.beginCountdown(ARENA_COUNTDOWN_MS);
    } else if (m.t === 'again' && this.status === 'ended') {
      this.seats = this.seats.filter((s) => s.bot || this.connected(s.playerId));
      this.status = 'lobby';
      this.resetGame();
      await this.save();
      this.sendLobby();
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.buckets.delete(ws);
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att && this.status === 'lobby' && this.meta?.kind === 'private' && !this.connected(att.playerId)) {
      const i = this.seatOf(att.playerId);
      if (i !== null) this.seats.splice(i, 1);
      if (this.meta.hostId === att.playerId) this.meta.hostId = this.seats.find((s) => !s.bot)?.playerId ?? null;
      await this.save();
    }
    this.sendLobby();
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? { tokens: this.bucket.burst, at: now };
    b.tokens = Math.min(this.bucket.burst, b.tokens + ((now - b.at) / 1000) * this.bucket.rate);
    b.at = now;
    this.buckets.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  protected beginCountdown(ms: number) {
    if (!this.meta) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.status = 'countdown';
    this.countdownAt = Date.now() + ms;
    this.createGame(seed);
    this.sendLobby();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) this.sendState(ws, att.playerId);
    }
    setTimeout(() => {
      if (this.status !== 'countdown') return;
      this.status = 'playing';
      this.sendLobby();
      this.startPlay();
    }, ms);
  }

  protected endMatch() {
    this.status = 'ended';
    this.sendLobby();
    void this.save();
  }

  async alarm() {
    if (this.status === 'playing' || this.status === 'countdown') {
      await this.ctx.storage.setAlarm(Date.now() + ARENA_ROOM_TTL_MS);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'expired');
    await this.ctx.storage.deleteAll();
    this.meta = null;
    this.seats = [];
  }

  protected send(ws: WebSocket, m: ArenaServerMsg) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* closed */
    }
  }
  protected broadcast(m: ArenaServerMsg) {
    const s = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(s);
      } catch {
        /* closed */
      }
    }
  }
  protected sendLobby() {
    if (!this.meta) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const msg: ArenaLobbyMsg = {
        t: 'lobby',
        game: this.meta.game,
        id: this.meta.id,
        kind: this.meta.kind,
        status: this.status,
        options: this.meta.options,
        hostSeat: this.hostSeat(),
        mySeat: this.seatOf(att.playerId),
        maxSeats: this.maxSeats,
        seats: this.seats.map((s, k) => ({ name: s.name, bot: s.bot, level: s.level, connected: s.bot || this.connected(s.playerId), isUser: !!s.userId, color: k, rating: s.rating })),
      };
      this.send(ws, msg);
    }
  }
}
