// GameRoom Durable Object — the authoritative state of one online game.
// * Every move is validated with the shared rules engine; clients never decide results.
// * Banqi hidden pieces live only here; clients receive the public view until the game ends.
// * Uses the WebSocket Hibernation API, so idle rooms cost nothing.
import { DurableObject } from 'cloudflare:workers';
import { newRules, restoreRules, truncateState, type AnyState, type Rules } from '../../shared/games/registry';
import type { GameResult, Seat } from '../../shared/types';
import { ABANDON_MS, ROOM_TTL_MS, WAITING_TTL_MS, type ClientMsg, type RoomMeta, type RoomStateMsg, type SeatInfo, type ServerMsg } from './protocol';
import { recordFinishedGame } from './persist';
import type { Env } from './env';

interface Persisted {
  meta: RoomMeta;
  seats: [SeatInfo | null, SeatInfo | null];
  game: AnyState | null;
  clockMs: [number, number] | null;
  turnStartedAt: number | null;
  result: GameResult | null;
  offer: { kind: 'draw' | 'undo'; from: Seat } | null;
  away: { seat: Seat; since: number } | null;
  ratingChange: RoomStateMsg['room']['ratingChange'];
  endedAt: number | null;
  recorded: boolean;
}

interface Attachment {
  playerId: string;
  userId: string | null;
  name: string;
  rating: number | null;
  ipHash: string;
}

export class GameRoom extends DurableObject<Env> {
  private s: Persisted | null = null;
  private rules: Rules | null = null;
  private buckets = new Map<WebSocket, { tokens: number; at: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<Persisted>('room')) ?? null;
      if (this.s?.game) this.rules = restoreRules(this.s.game);
    });
  }

  private async persist() {
    if (!this.s) return;
    if (this.rules) this.s.game = this.rules.serialize();
    await this.ctx.storage.put('room', this.s);
    await this.scheduleAlarm();
  }

  // ---------- HTTP entry points (only reachable through service bindings) ----------
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') return this.init(await req.json());
    if (url.pathname === '/info') return Response.json(this.info());
    if (url.pathname === '/ws') return this.openSocket(req);
    return new Response('not found', { status: 404 });
  }

  private async init(body: { meta: RoomMeta; seats?: [SeatInfo | null, SeatInfo | null] }): Promise<Response> {
    if (this.s) return Response.json({ error: 'exists' }, { status: 409 });
    this.s = {
      meta: body.meta,
      seats: body.seats ?? [null, null],
      game: null,
      clockMs: null,
      turnStartedAt: null,
      result: null,
      offer: null,
      away: null,
      ratingChange: null,
      endedAt: null,
      recorded: false,
    };
    if (this.s.seats[0] && this.s.seats[1]) this.startGame();
    await this.persist();
    return Response.json({ ok: true });
  }

  private info() {
    if (!this.s) return { exists: false };
    return {
      exists: true,
      game: this.s.meta.game,
      rated: this.s.meta.rated,
      status: this.status(),
      seatsTaken: this.s.seats.filter(Boolean).length,
      time: this.s.meta.time,
    };
  }

  private status(): 'waiting' | 'playing' | 'ended' {
    if (!this.s) return 'waiting';
    if (this.s.result) return 'ended';
    return this.rules ? 'playing' : 'waiting';
  }

  private openSocket(req: Request): Response {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!this.s) return new Response('room not found', { status: 404 });
    const att: Attachment = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: req.headers.get('x-jy-name') ?? 'Guest',
      rating: req.headers.get('x-jy-rating') ? Number(req.headers.get('x-jy-rating')) : null,
      ipHash: req.headers.get('x-jy-ip') ?? '',
    };
    if (!att.playerId) return new Response('no identity', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [att.playerId]);
    server.serializeAttachment(att);
    this.seatPlayer(att);
    void this.persist().then(() => this.broadcast());
    return new Response(null, { status: 101, webSocket: client });
  }

  private seatOf(playerId: string): Seat | null {
    if (!this.s) return null;
    if (this.s.seats[0]?.playerId === playerId) return 0;
    if (this.s.seats[1]?.playerId === playerId) return 1;
    return null;
  }

  private seatPlayer(att: Attachment) {
    const s = this.s!;
    const existing = this.seatOf(att.playerId);
    if (existing !== null) {
      if (s.away?.seat === existing) s.away = null; // reconnected
      return;
    }
    if (this.rules || s.result) return; // spectator
    if (s.meta.rated && !att.userId) return; // rated rooms need signed-in players
    const info: SeatInfo = { playerId: att.playerId, userId: att.userId, name: att.name, rating: att.rating, ipHash: att.ipHash };
    let seat: Seat | null = null;
    if (!s.seats[0] && !s.seats[1]) {
      const isCreator = att.playerId === s.meta.creatorId;
      const pref = s.meta.creatorSeat;
      if (pref !== 'random') {
        // keep the creator's chosen side even if the guest arrives first
        const creatorSeat: Seat = pref === 'first' ? 0 : 1;
        seat = isCreator ? creatorSeat : creatorSeat === 0 ? 1 : 0;
      } else seat = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 0 : 1;
    } else if (!s.seats[0]) seat = 0;
    else if (!s.seats[1]) seat = 1;
    if (seat === null) return;
    s.seats[seat] = info;
    if (s.seats[0] && s.seats[1]) this.startGame();
  }

  private startGame() {
    const s = this.s!;
    this.rules = newRules(s.meta.game, { banqiPreset: s.meta.banqiPreset });
    const ms = s.meta.time.minutes > 0 ? s.meta.time.minutes * 60000 : null;
    s.clockMs = ms ? [ms, ms] : null;
    s.turnStartedAt = Date.now();
  }

  // ---------- WebSocket events ----------
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.allow(ws)) return this.send(ws, { t: 'error', code: 'rate_limited' });
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.send(ws, { t: 'error', code: 'bad_message' });
    }
    if (msg.t === 'ping') return this.send(ws, { t: 'pong' });
    const att = ws.deserializeAttachment() as Attachment;
    const seat = this.seatOf(att.playerId);
    if (seat === null) return this.send(ws, { t: 'error', code: 'spectator' });
    const err = this.handle(seat, msg);
    if (err) this.send(ws, { t: 'error', code: err });
    await this.persist();
    await this.afterChange();
    this.broadcast();
  }

  async webSocketClose(ws: WebSocket) {
    this.buckets.delete(ws);
    await this.onDisconnect(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.buckets.delete(ws);
    await this.onDisconnect(ws);
  }

  private async onDisconnect(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || !this.s) return;
    const seat = this.seatOf(att.playerId);
    const stillHere = this.ctx.getWebSockets(att.playerId).some((w) => w !== ws && w.readyState === WebSocket.OPEN);
    if (seat !== null && !stillHere && this.rules && !this.s.result) {
      this.s.away = { seat, since: Date.now() };
      await this.persist();
    }
    this.broadcast();
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? { tokens: 20, at: now };
    b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 8);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(ws, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(ws, b);
    return true;
  }

  // ---------- game logic ----------
  private handle(seat: Seat, msg: ClientMsg): string | null {
    const s = this.s!;
    const r = this.rules;
    if (!r) return 'not_started';
    if (s.result) return 'game_over';
    this.checkFlag();
    if (s.result) return 'game_over';
    switch (msg.t) {
      case 'move': {
        if (r.sideToMove() !== seat) return 'not_your_turn';
        if (msg.ply !== r.moveList().length) return 'stale';
        if (typeof msg.m !== 'string' || msg.m.length > 8) return 'illegal';
        const before = r.sideToMove();
        this.chargeClock(before, true);
        if (!r.play(msg.m)) {
          this.refundCharge();
          return 'illegal';
        }
        if (r.sideToMove() !== before) s.turnStartedAt = Date.now();
        s.offer = s.offer?.from === seat ? s.offer : null; // a move declines the opponent's offer
        if (s.offer?.kind === 'undo') s.offer = null;
        const res = r.result();
        if (res) this.finish(res);
        return null;
      }
      case 'resign':
        this.finish({ kind: 'win', winner: seat === 0 ? 1 : 0, reason: 'resign' });
        return null;
      case 'offer':
        if (msg.kind === 'undo' && (s.meta.rated || r.moveList().length === 0)) return 'undo_not_allowed';
        if (s.offer && s.offer.from !== seat) return 'offer_pending';
        s.offer = { kind: msg.kind, from: seat };
        return null;
      case 'respond': {
        if (!s.offer || s.offer.from === seat) return 'no_offer';
        const offer = s.offer;
        s.offer = null;
        if (!msg.accept) return null;
        if (offer.kind === 'draw') this.finish({ kind: 'draw', reason: 'agreement' });
        else this.takeBack(offer.from);
        return null;
      }
      case 'claim': {
        if (r.sideToMove() !== seat) return 'not_your_turn';
        const c = r.claimableDraw();
        if (!c) return 'claim_invalid';
        this.finish({ kind: 'draw', reason: c.reason });
        return null;
      }
    }
    return 'bad_message';
  }

  private lastCharge: { seat: Seat; ms: number; turnStartedAt: number | null } | null = null;

  /** Deducts the thinking time of `seat` (and adds the increment). */
  private chargeClock(seat: Seat, increment: boolean) {
    const s = this.s!;
    this.lastCharge = null;
    if (!s.clockMs || s.turnStartedAt === null) return;
    const used = Date.now() - s.turnStartedAt;
    this.lastCharge = { seat, ms: s.clockMs[seat], turnStartedAt: s.turnStartedAt };
    s.clockMs[seat] = Math.max(0, s.clockMs[seat] - used) + (increment ? s.meta.time.incrementSec * 1000 : 0);
  }

  private refundCharge() {
    if (!this.lastCharge || !this.s?.clockMs) return;
    this.s.clockMs[this.lastCharge.seat] = this.lastCharge.ms;
    this.s.turnStartedAt = this.lastCharge.turnStartedAt;
    this.lastCharge = null;
  }

  private remaining(): [number, number] | null {
    const s = this.s!;
    if (!s.clockMs) return null;
    const ms: [number, number] = [...s.clockMs];
    if (this.rules && !s.result && s.turnStartedAt !== null) ms[this.rules.sideToMove()] -= Date.now() - s.turnStartedAt;
    return [Math.max(0, ms[0]), Math.max(0, ms[1])];
  }

  private checkFlag() {
    const s = this.s!;
    if (!this.rules || s.result || !s.clockMs) return;
    const side = this.rules.sideToMove();
    const rem = this.remaining()!;
    if (rem[side] <= 0) {
      s.clockMs[side] = 0;
      this.finish(this.rules.timeoutResult(side));
    }
  }

  private takeBack(requester: Seat) {
    const r = this.rules!;
    const moves = r.moveList();
    const records = r.records();
    // remove the requester's last move and anything played after it
    let n = moves.length;
    while (n > 0 && records[n - 1].seat !== requester) n--;
    if (n === 0) return;
    n--;
    this.rules = restoreRules(truncateState(r.serialize(), n));
    this.s!.turnStartedAt = Date.now();
  }

  private finish(res: GameResult) {
    const s = this.s!;
    if (s.result) return;
    if (s.clockMs && this.rules && s.turnStartedAt !== null && res.reason !== 'timeout' && res.reason !== 'timeout_draw') {
      const side = this.rules.sideToMove();
      s.clockMs[side] = Math.max(0, s.clockMs[side] - (Date.now() - s.turnStartedAt));
    }
    s.result = res;
    s.offer = null;
    s.away = null;
    s.endedAt = Date.now();
    s.turnStartedAt = null;
  }

  private async afterChange() {
    const s = this.s!;
    if (s.result && !s.recorded && this.rules) {
      s.recorded = true;
      try {
        s.ratingChange = await recordFinishedGame(this.env, s.meta, s.seats, this.rules, s.result);
      } catch (e) {
        console.error('[GameRoom] record failed', e);
      }
      await this.persist();
    }
  }

  async alarm() {
    const s = this.s;
    if (!s) return;
    const now = Date.now();
    if (s.result && s.endedAt && now - s.endedAt > ROOM_TTL_MS) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'expired');
      await this.ctx.storage.deleteAll();
      this.s = null;
      this.rules = null;
      return;
    }
    if (!this.rules && now - s.meta.createdAt > WAITING_TTL_MS) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'expired');
      await this.ctx.storage.deleteAll();
      this.s = null;
      return;
    }
    this.checkFlag();
    if (!s.result && s.away && now - s.away.since >= ABANDON_MS) {
      const opp: Seat = s.away.seat === 0 ? 1 : 0;
      const oppHere = this.ctx.getWebSockets(s.seats[opp]?.playerId ?? '__').length > 0;
      if (oppHere) this.finish({ kind: 'win', winner: opp, reason: 'abandon' });
      else s.away.since = now; // both gone: keep waiting, room TTL cleans up
    }
    await this.afterChange();
    await this.persist();
    this.broadcast();
  }

  private async scheduleAlarm() {
    const s = this.s;
    if (!s) return;
    const times: number[] = [];
    if (s.result && s.endedAt) times.push(s.endedAt + ROOM_TTL_MS + 1000);
    else if (!this.rules) times.push(s.meta.createdAt + WAITING_TTL_MS + 1000);
    else {
      const rem = this.remaining();
      if (rem && s.turnStartedAt !== null) times.push(Date.now() + rem[this.rules.sideToMove()] + 50);
      if (s.away) times.push(s.away.since + ABANDON_MS + 50);
      times.push(Date.now() + ROOM_TTL_MS);
    }
    const t = Math.min(...times);
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || Math.abs(cur - t) > 20) await this.ctx.storage.setAlarm(t);
  }

  // ---------- output ----------
  private send(ws: WebSocket, m: ServerMsg) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* socket closed */
    }
  }

  private stateFor(playerId: string): RoomStateMsg {
    const s = this.s!;
    const r = this.rules;
    const connected = (seat: Seat) => {
      const p = s.seats[seat];
      return !!p && this.ctx.getWebSockets(p.playerId).some((w) => w.readyState === WebSocket.OPEN);
    };
    const seatPub = (i: Seat) => {
      const p = s.seats[i];
      return p ? { name: p.name, rating: p.rating, connected: connected(i), isUser: !!p.userId } : null;
    };
    const status = this.status();
    return {
      t: 'state',
      room: {
        id: s.meta.id,
        game: s.meta.game,
        rated: s.meta.rated,
        time: s.meta.time,
        status,
        seats: [seatPub(0), seatPub(1)],
        mySeat: this.seatOf(playerId),
        position: r ? r.position() : null,
        records: r ? r.records() : [],
        moves: r && s.meta.game !== 'banqi' ? r.moveList() : r ? r.moveList() : [],
        sideToMove: r ? r.sideToMove() : 0,
        result: s.result,
        clock: { ms: r ? this.remaining() : s.meta.time.minutes ? [s.meta.time.minutes * 60000, s.meta.time.minutes * 60000] : null, running: r && !s.result ? r.sideToMove() : null, serverNow: Date.now() },
        offer: s.offer,
        lastMove: r ? r.lastMove() : null,
        checkSquare: r ? r.checkSquare() : null,
        claimable: r && !s.result ? (r.claimableDraw()?.reason ?? null) : null,
        awaySeat: s.away?.seat ?? null,
        awayDeadline: s.away ? s.away.since + ABANDON_MS : null,
        ratingChange: s.ratingChange,
        final: s.result && r ? r.serialize() : null,
      },
    };
  }

  private broadcast() {
    if (!this.s) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) this.send(ws, this.stateFor(att.playerId));
    }
  }
}
