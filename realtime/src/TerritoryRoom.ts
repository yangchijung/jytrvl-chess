// TerritoryRoom Durable Object — authoritative Territory Rush match (2–8 players, humans and bots).
// Clients only send steering input; positions, trails, captures, speed and results are computed here.
import { DurableObject } from 'cloudflare:workers';
import { TerritoryGame, TICK_MS, MAX_PLAYERS, mapSizeFor, rng, type Dir } from '../../shared/territory/engine';
import { botThink, newBotMemory, type BotLevel, type BotMemory } from '../../shared/territory/ai';
import {
  T_COUNTDOWN_MS,
  T_MIN_PLAYERS,
  T_PLAYER_FIELDS,
  T_ROOM_TTL_MS,
  type TClientMsg,
  type TLobbyMsg,
  type TRoomStatus,
  type TServerMsg,
} from './territoryProtocol';
import { recordTerritoryMatch } from './territoryPersist';
import type { Env } from './env';

export interface TSeat {
  playerId: string | null; // null = bot
  userId: string | null;
  name: string;
  bot: boolean;
  level?: BotLevel;
  ipHash: string;
}

export interface TRoomMeta {
  id: string;
  kind: 'private' | 'match';
  minutes: number;
  hostId: string | null;
  createdAt: number;
}

interface Attachment {
  playerId: string;
  userId: string | null;
  name: string;
  ipHash: string;
}

const BOT_NAMES = ['Nova', 'Pixel', 'Bolt', 'Mochi', 'Echo', 'Kiwi', 'Comet', 'Tofu'];

export class TerritoryRoom extends DurableObject<Env> {
  private meta: TRoomMeta | null = null;
  private seats: TSeat[] = [];
  private status: TRoomStatus = 'lobby';
  private game: TerritoryGame | null = null;
  private brains = new Map<number, { mem: BotMemory; rand: () => number; level: BotLevel }>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private countdownAt = 0;
  private buckets = new Map<WebSocket, { tokens: number; at: number }>();
  private endedAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<{ meta: TRoomMeta; seats: TSeat[] }>('room');
      if (saved) {
        this.meta = saved.meta;
        this.seats = saved.seats;
      }
    });
  }

  private async save() {
    if (this.meta) await this.ctx.storage.put('room', { meta: this.meta, seats: this.seats });
    await this.ctx.storage.setAlarm(Date.now() + T_ROOM_TTL_MS);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (this.meta) return Response.json({ error: 'exists' }, { status: 409 });
      const body = (await req.json()) as { meta: TRoomMeta; seats?: TSeat[] };
      this.meta = body.meta;
      this.seats = body.seats ?? [];
      await this.save();
      if (this.meta.kind === 'match') this.beginCountdown(4000);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/info') {
      if (!this.meta) return Response.json({ exists: false });
      return Response.json({ exists: true, status: this.status, players: this.seats.length, minutes: this.meta.minutes });
    }
    if (url.pathname === '/ws') return this.accept(req);
    return new Response('not found', { status: 404 });
  }

  private accept(req: Request): Response {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!this.meta) return new Response('room not found', { status: 404 });
    const att: Attachment = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: req.headers.get('x-jy-name') ?? 'Guest',
      ipHash: req.headers.get('x-jy-ip') ?? '',
    };
    if (!att.playerId) return new Response('no identity', { status: 400 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [att.playerId]);
    pair[1].serializeAttachment(att);
    // seat newcomers while in the lobby
    if (this.status === 'lobby' && this.seatOf(att.playerId) === null && this.seats.length < MAX_PLAYERS) {
      this.seats.push({ playerId: att.playerId, userId: att.userId, name: att.name, bot: false, ipHash: att.ipHash });
      if (!this.meta.hostId) this.meta.hostId = att.playerId;
      void this.save();
    }
    queueMicrotask(() => {
      this.sendLobby();
      if (this.game) this.sendSnapshot(pair[1], att.playerId);
    });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private seatOf(playerId: string): number | null {
    const i = this.seats.findIndex((s) => s.playerId === playerId);
    return i < 0 ? null : i;
  }

  private connected(playerId: string | null): boolean {
    if (!playerId) return false;
    return this.ctx.getWebSockets(playerId).some((w) => w.readyState === WebSocket.OPEN);
  }

  private hostSeat(): number | null {
    if (!this.meta?.hostId) return null;
    return this.seatOf(this.meta.hostId);
  }

  // ---------- messages ----------
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.allow(ws)) return;
    let m: TClientMsg;
    try {
      m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    const seat = this.seatOf(att.playerId);
    if (m.t === 'ping') return this.send(ws, { t: 'pong' });
    if (m.t === 'dir') {
      if (seat === null || !this.game || this.status !== 'playing' && this.status !== 'countdown') return;
      if (typeof m.d !== 'number' || m.d < 0 || m.d > 3) return;
      this.game.steer(seat, m.d as Dir);
      return;
    }
    const isHost = att.playerId === this.meta?.hostId;
    if (!isHost) return this.send(ws, { t: 'error', code: 'not_host' });
    if (m.t === 'bot' && this.status === 'lobby') {
      if (m.op === 'add' && this.seats.length < MAX_PLAYERS) {
        const level: BotLevel = ['easy', 'medium', 'hard'].includes(m.level) ? m.level : 'medium';
        const n = this.seats.filter((s) => s.bot).length;
        this.seats.push({ playerId: null, userId: null, name: `${BOT_NAMES[n % 8]}🤖`, bot: true, level, ipHash: '' });
      } else if (m.op === 'remove' && this.seats[m.seat]?.bot) this.seats.splice(m.seat, 1);
      await this.save();
      this.sendLobby();
    } else if (m.t === 'start' && this.status === 'lobby') {
      if (this.seats.length < T_MIN_PLAYERS) return this.send(ws, { t: 'error', code: 'need_two' });
      this.beginCountdown(T_COUNTDOWN_MS);
    } else if (m.t === 'again' && this.status === 'ended') {
      // keep connected humans and bots, drop humans who left
      this.seats = this.seats.filter((s) => s.bot || this.connected(s.playerId));
      this.status = 'lobby';
      this.game = null;
      await this.save();
      this.sendLobby();
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.buckets.delete(ws);
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att && this.status === 'lobby' && !this.connected(att.playerId)) {
      const i = this.seatOf(att.playerId);
      if (i !== null) this.seats.splice(i, 1);
      if (this.meta && this.meta.hostId === att.playerId) this.meta.hostId = this.seats.find((s) => !s.bot)?.playerId ?? null;
      await this.save();
    }
    this.sendLobby();
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? { tokens: 30, at: now };
    b.tokens = Math.min(30, b.tokens + ((now - b.at) / 1000) * 25);
    b.at = now;
    this.buckets.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  // ---------- game lifecycle ----------
  private beginCountdown(ms: number) {
    if (!this.meta) return;
    const n = this.seats.length;
    const size = mapSizeFor(n);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const g = new TerritoryGame({ width: size, height: size, durationTicks: Math.round((this.meta.minutes * 60000) / TICK_MS), seed });
    this.brains.clear();
    this.seats.forEach((s, k) => {
      g.addPlayer(s.playerId ?? `bot${k}`, s.name, s.bot);
      // bots, and humans while disconnected, are driven by a brain
      this.brains.set(k, { mem: newBotMemory(), rand: rng(seed + k * 7919), level: s.level ?? 'medium' });
    });
    g.start();
    this.game = g;
    this.status = 'countdown';
    this.countdownAt = Date.now() + ms;
    this.sendLobby();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) this.sendSnapshot(ws, att.playerId);
    }
    setTimeout(() => this.startLoop(), ms);
  }

  private startLoop() {
    if (!this.game || this.status !== 'countdown') return;
    this.status = 'playing';
    this.sendLobby();
    if (this.loop) clearInterval(this.loop);
    this.loop = setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    const g = this.game;
    if (!g || this.status !== 'playing') return;
    for (let k = 0; k < this.seats.length; k++) {
      const s = this.seats[k];
      const b = this.brains.get(k);
      if (!b || !g.players[k]?.alive) continue;
      if (s.bot) botThink(g, k, b.mem, b.level, b.rand);
      else if (!this.connected(s.playerId)) botThink(g, k, b.mem, 'medium', b.rand); // autopilot while disconnected
    }
    g.step();
    const pl: number[] = [];
    for (const p of g.players) pl.push(p.x, p.y, p.dir, p.alive ? 1 : 0, p.land, p.kills, p.bestLand);
    const oc: number[] = [];
    for (const c of g.ownerChanges) oc.push(c.i, c.v);
    const tc: number[] = [];
    for (const c of g.trailChanges) tc.push(c.i, c.v);
    this.broadcast({ t: 'tick', n: g.tick, pl, oc, tc, ev: g.events });
    if (g.result) void this.finish();
  }

  private async finish() {
    const g = this.game!;
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.status = 'ended';
    this.endedAt = Date.now();
    let recorded = false;
    try {
      recorded = await recordTerritoryMatch(this.env, this.meta!, this.seats, g);
    } catch (e) {
      console.error('[TerritoryRoom] record failed', e);
    }
    this.broadcast({ t: 'end', result: g.result!, recorded });
    this.sendLobby();
    await this.save();
  }

  async alarm() {
    // idle room cleanup
    if (this.status === 'playing' || this.status === 'countdown') {
      await this.ctx.storage.setAlarm(Date.now() + T_ROOM_TTL_MS);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'expired');
    await this.ctx.storage.deleteAll();
    this.meta = null;
    this.seats = [];
  }

  // ---------- output ----------
  private send(ws: WebSocket, m: TServerMsg) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* closed */
    }
  }

  private broadcast(m: TServerMsg) {
    const s = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(s);
      } catch {
        /* closed */
      }
    }
  }

  private sendSnapshot(ws: WebSocket, playerId: string) {
    if (!this.game) return;
    this.send(ws, {
      t: 'snap',
      status: this.status,
      snap: this.game.snapshot(),
      mySeat: this.seatOf(playerId),
      countdownMs: Math.max(0, this.countdownAt - Date.now()),
    });
  }

  private sendLobby() {
    if (!this.meta) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const msg: TLobbyMsg = {
        t: 'lobby',
        id: this.meta.id,
        kind: this.meta.kind,
        status: this.status,
        minutes: this.meta.minutes,
        hostSeat: this.hostSeat(),
        mySeat: this.seatOf(att.playerId),
        seats: this.seats.map((s, k) => ({ name: s.name, bot: s.bot, level: s.level, connected: s.bot || this.connected(s.playerId), isUser: !!s.userId, color: k })),
      };
      this.send(ws, msg);
    }
  }
}

export { T_PLAYER_FIELDS };
