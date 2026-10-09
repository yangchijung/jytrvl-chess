// ArenaLobby Durable Object — public matchmaking queues for the arena games. One instance per pool:
//   snake         2–8 players: starts at 8, 10 s after the 2nd player, or 20 s for a lone player; bots fill to 4
//   blocks        1 v 1: pairs immediately; a lone player gets a Medium computer opponent after 20 s
//   blocks-ranked 1 v 1 for signed-in players: pairs the closest ratings, window widens while waiting; humans only
import { DurableObject } from 'cloudflare:workers';
import { roomCode } from '../../../server/crypto';
import type { Env } from '../env';
import type { ArenaMeta, ArenaSeat } from './ArenaRoom';
import { BOT_NAMES, type ArenaGameId, type ArenaKind, type ArenaServerMsg } from './protocol';

interface Waiter {
  playerId: string;
  userId: string | null;
  name: string;
  ipHash: string;
  rating: number;
  joinedAt: number;
}

interface PoolConfig {
  game: ArenaGameId;
  kind: ArenaKind;
  max: number;
  fillTo: number;
  waitMs: number;
  soloMs: number | null;
}
const POOLS: Record<string, PoolConfig> = {
  snake: { game: 'snake', kind: 'match', max: 8, fillTo: 4, waitMs: 10_000, soloMs: 20_000 },
  blocks: { game: 'blocks', kind: 'match', max: 2, fillTo: 2, waitMs: 0, soloMs: 20_000 },
  'blocks-ranked': { game: 'blocks', kind: 'ranked', max: 2, fillTo: 0, waitMs: 0, soloMs: null },
};

export class ArenaLobby extends DurableObject<Env> {
  private pool: string | null = null;

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pool = new URL(req.url).searchParams.get('pool') ?? '';
    if (!POOLS[pool]) return new Response('bad pool', { status: 400 });
    this.pool = pool;
    await this.ctx.storage.put('pool', pool);
    const w: Waiter = {
      playerId: req.headers.get('x-jy-player') ?? '',
      userId: req.headers.get('x-jy-user') || null,
      name: req.headers.get('x-jy-name') ?? 'Guest',
      ipHash: req.headers.get('x-jy-ip') ?? '',
      rating: Number(req.headers.get('x-jy-rating') || 1200),
      joinedAt: Date.now(),
    };
    if (!w.playerId) return new Response('no identity', { status: 400 });
    if (POOLS[pool].kind === 'ranked' && !w.userId) return new Response('login required', { status: 401 });
    for (const old of this.ctx.getWebSockets(w.playerId)) old.close(4000, 'replaced');
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [w.playerId]);
    pair[1].serializeAttachment(w);
    await this.evaluate();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (String(raw).includes('ping')) ws.send(JSON.stringify({ t: 'pong' } satisfies ArenaServerMsg));
  }
  async webSocketClose() {
    this.notify();
  }
  async alarm() {
    this.pool ??= (await this.ctx.storage.get<string>('pool')) ?? null;
    await this.evaluate();
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
        x.ws.send(JSON.stringify({ t: 'queue', waiting: q.length } satisfies ArenaServerMsg));
      } catch {
        /* closed */
      }
    }
  }

  private async evaluate() {
    const cfg = this.pool ? POOLS[this.pool] : null;
    if (!cfg) return;
    let q = this.queue();
    const now = Date.now();
    let nextAlarm = Infinity;
    // ---- 1 v 1 pools ----
    if (cfg.max === 2) {
      if (cfg.kind === 'ranked') {
        // pair the closest ratings; acceptable gap grows by 100 every 10 s of waiting
        const used = new Set<string>();
        for (const a of q) {
          if (used.has(a.w.playerId)) continue;
          const gapA = 150 + Math.floor((now - a.w.joinedAt) / 10_000) * 100;
          let best: (typeof q)[number] | null = null;
          for (const b of q) {
            if (b === a || used.has(b.w.playerId) || b.w.userId === a.w.userId) continue;
            const gap = Math.abs(a.w.rating - b.w.rating);
            const gapB = 150 + Math.floor((now - b.w.joinedAt) / 10_000) * 100;
            if (gap <= Math.max(gapA, gapB) && (!best || gap < Math.abs(a.w.rating - best.w.rating))) best = b;
          }
          if (best) {
            used.add(a.w.playerId).add(best.w.playerId);
            await this.launch(cfg, [a, best]);
          }
        }
        if (this.queue().length >= 2) nextAlarm = now + 5_000;
      } else {
        while (q.length >= 2) {
          await this.launch(cfg, q.slice(0, 2));
          q = q.slice(2);
        }
        if (q.length === 1 && cfg.soloMs !== null) {
          const due = q[0].w.joinedAt + cfg.soloMs;
          if (now >= due - 50) await this.launch(cfg, q);
          else nextAlarm = due;
        }
      }
    } else {
      // ---- multiplayer pool ----
      const due = q.length === 0 ? Infinity : Math.min(cfg.soloMs !== null ? q[0].w.joinedAt + cfg.soloMs : Infinity, q.length >= 2 ? q[1].w.joinedAt + cfg.waitMs : Infinity);
      if (q.length >= cfg.max || (q.length >= 1 && now >= due - 50)) {
        await this.launch(cfg, q.slice(0, cfg.max));
        const rest = this.queue();
        if (rest.length) nextAlarm = Math.min(rest[0].w.joinedAt + (cfg.soloMs ?? 60_000), now + 1000);
      } else if (q.length >= 1) nextAlarm = due;
    }
    if (nextAlarm < Infinity) {
      const cur = await this.ctx.storage.getAlarm();
      if (cur === null || cur > nextAlarm || cur < now) await this.ctx.storage.setAlarm(nextAlarm);
    }
    this.notify();
  }

  private async launch(cfg: PoolConfig, group: { ws: WebSocket; w: Waiter }[]) {
    const seats: ArenaSeat[] = group.map((x) => ({ playerId: x.w.playerId, userId: x.w.userId, name: x.w.name, bot: false, ipHash: x.w.ipHash, rating: cfg.kind === 'ranked' ? x.w.rating : undefined }));
    for (let k = 0; seats.length < cfg.fillTo; k++) seats.push({ playerId: null, userId: null, name: `${BOT_NAMES[k]}🤖`, bot: true, level: 'medium', ipHash: '' });
    const ns = cfg.game === 'snake' ? this.env.SROOMS : this.env.BROOMS;
    let room: string | null = null;
    for (let i = 0; i < 5 && !room; i++) {
      const id = roomCode();
      const meta: ArenaMeta = { id, game: cfg.game, kind: cfg.kind, options: { minutes: 3, map: cfg.game === 'snake' ? ['open', 'pillars', 'cross', 'rooms'][Math.floor(Math.random() * 4)] : undefined }, hostId: null, createdAt: Date.now() };
      const res = await ns.get(ns.idFromName(id)).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ meta, seats }) });
      if (res.ok) room = id;
    }
    if (!room) throw new Error('could not allocate room');
    for (const x of group) {
      x.ws.send(JSON.stringify({ t: 'matched', room } satisfies ArenaServerMsg));
      x.ws.close(1000, 'matched');
    }
  }
}
