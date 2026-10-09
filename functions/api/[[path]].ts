// JY Games API (Cloudflare Pages Functions). Single router for /api/*.
import { identify, createSession, destroySession, validNickname, cleanGuestName, SESSION_COOKIE, SESSION_DAYS, type Identity } from '../../server/session';
import { cookie, parseCookies, randomId, sign, verify, sha256, b64url, isRoomCode, roomCode } from '../../server/crypto';
import { ensureSchema, logError } from '../../server/schema';
import { START_RATING } from '../../server/elo';
import { GAME_IDS, type GameId } from '../../shared/types';
import { verifySnake, verifyBlocks, SNAKE_SOLO_MODES, BLOCKS_SOLO_MODES } from '../../shared/solo';

interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  MATCH: DurableObjectNamespace;
  LIMITER: DurableObjectNamespace;
  TROOMS: DurableObjectNamespace;
  TLOBBY: DurableObjectNamespace;
  SROOMS: DurableObjectNamespace;
  BROOMS: DurableObjectNamespace;
  ALOBBY: DurableObjectNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PUBLIC_ORIGIN?: string;
}

type Ctx = EventContext<Env, 'path', Record<string, unknown>>;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const err = (code: string, status: number) => json({ error: code }, status);

function withCookies(res: Response, cookies: string[]): Response {
  if (!cookies.length) return res;
  const r = new Response(res.body, res);
  for (const c of cookies) r.headers.append('set-cookie', c);
  return r;
}

async function limited(env: Env, req: Request, bucket: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const key = `${bucket}:${(await sha256(ip)).slice(0, 20)}`;
    const stub = env.LIMITER.get(env.LIMITER.idFromName(key));
    const r = await stub.fetch(`https://limiter/?limit=${limit}&window=${windowMs}`);
    const body = (await r.json()) as { ok: boolean };
    return !body.ok;
  } catch {
    return false; // fail open: never lock everyone out because the limiter is unavailable
  }
}

function origin(env: Env, req: Request): string {
  return env.PUBLIC_ORIGIN || new URL(req.url).origin;
}

function safeReturn(p: string | null): string {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.includes('\\')) return '/';
  return p.slice(0, 300);
}

async function ratingsOf(db: D1Database, userId: string) {
  const rows = await db.prepare(`SELECT game, rating, games, wins, losses, draws FROM ratings WHERE user_id = ?`).bind(userId).all<{
    game: GameId;
    rating: number;
    games: number;
    wins: number;
    losses: number;
    draws: number;
  }>();
  const out: Record<string, unknown> = {};
  for (const g of [...GAME_IDS, 'blocks']) out[g] = { rating: START_RATING, games: 0, wins: 0, losses: 0, draws: 0 };
  for (const r of rows.results) out[r.game] = { ...r, rating: Math.round(r.rating) };
  return out;
}

/** Forward a WebSocket upgrade to a Durable Object, attaching the verified identity. */
async function forwardWs(req: Request, stub: DurableObjectStub, me: Identity, extra: Record<string, string>, path: string, query = ''): Promise<Response> {
  if (req.headers.get('upgrade') !== 'websocket') return err('expected_websocket', 426);
  const headers = new Headers();
  headers.set('upgrade', 'websocket');
  headers.set('x-jy-player', me.playerId);
  headers.set('x-jy-user', me.userId ?? '');
  headers.set('x-jy-ip', me.ipHash);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return stub.fetch(`https://do${path}${query}`, { headers });
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const { request: req, env } = ctx;
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const route = `${req.method} /${parts.join('/')}`;
  try {
    if (!env.DB) return err('db_not_configured', 503);
    await ensureSchema(env.DB);

    // ---------- health ----------
    if (route === 'GET /health') {
      const t0 = Date.now();
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true, db_ms: Date.now() - t0, time: new Date().toISOString(), auth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });
    }

    // ---------- client error log ----------
    if (route === 'POST /log') {
      if (await limited(env, req, 'log', 30, 60000)) return err('rate_limited', 429);
      const body = (await req.json().catch(() => ({}))) as { message?: string; extra?: string; url?: string };
      await logError(env.DB, 'client', String(body.message ?? 'unknown'), body.extra, body.url);
      return json({ ok: true });
    }

    const me = await identify(req, env.DB);
    const reply = (res: Response) => withCookies(res, me.setCookie);

    // ---------- auth ----------
    if (route === 'GET /auth/google/start') {
      if (await limited(env, req, 'auth', 30, 600000)) return err('rate_limited', 429);
      if (!env.GOOGLE_CLIENT_ID) return err('auth_not_configured', 503);
      const state = randomId(16);
      const verifier = randomId(48);
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const ret = safeReturn(url.searchParams.get('return'));
      const signed = await sign(env.DB, JSON.stringify({ state, verifier, ret, at: Date.now() }));
      const redirect = `${origin(env, req)}/api/auth/google/callback`;
      const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      g.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      g.searchParams.set('redirect_uri', redirect);
      g.searchParams.set('response_type', 'code');
      g.searchParams.set('scope', 'openid email profile');
      g.searchParams.set('state', state);
      g.searchParams.set('code_challenge', challenge);
      g.searchParams.set('code_challenge_method', 'S256');
      g.searchParams.set('prompt', 'select_account');
      return withCookies(new Response(null, { status: 302, headers: { location: g.toString() } }), [
        ...me.setCookie,
        cookie('jy_oauth', signed, { maxAge: 600, path: '/api/auth' }),
      ]);
    }

    if (route === 'GET /auth/google/callback') {
      const fail = (code: string) =>
        withCookies(new Response(null, { status: 302, headers: { location: `/?auth_error=${code}` } }), [cookie('jy_oauth', '', { maxAge: 0, path: '/api/auth' })]);
      const raw = await verify(env.DB, parseCookies(req.headers.get('cookie')).jy_oauth);
      if (!raw) return fail('state');
      const st = JSON.parse(raw) as { state: string; verifier: string; ret: string; at: number };
      if (st.state !== url.searchParams.get('state') || Date.now() - st.at > 600000) return fail('state');
      const code = url.searchParams.get('code');
      if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('code');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${origin(env, req)}/api/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: st.verifier,
        }),
      });
      if (!tokenRes.ok) {
        await logError(env.DB, 'auth', 'token exchange failed', await tokenRes.text());
        return fail('token');
      }
      const tok = (await tokenRes.json()) as { id_token?: string };
      // The ID token comes straight from Google's token endpoint over TLS (OIDC Core §3.1.3.7):
      // we still validate issuer, audience and expiry.
      const claims = tok.id_token ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))) : null;
      if (
        !claims ||
        !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
        claims.aud !== env.GOOGLE_CLIENT_ID ||
        claims.exp * 1000 < Date.now() ||
        !claims.sub
      )
        return fail('claims');
      const sub = String(claims.sub);
      let user = await env.DB.prepare(`SELECT id, banned FROM users WHERE google_sub = ?`).bind(sub).first<{ id: string; banned: number }>();
      if (user?.banned) return fail('banned');
      if (!user) {
        const id = randomId(12);
        const base = String(claims.given_name ?? claims.name ?? 'Player').replace(/[^\p{L}\p{N}_\- ]/gu, '').slice(0, 14) || 'Player';
        const nickname = `${base}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 20);
        await env.DB.prepare(`INSERT INTO users (id, google_sub, email, nickname, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(id, sub, claims.email ?? null, nickname, Date.now(), Date.now())
          .run();
        user = { id, banned: 0 };
      } else {
        await env.DB.prepare(`UPDATE users SET last_seen = ?, email = ? WHERE id = ?`).bind(Date.now(), claims.email ?? null, user.id).run();
      }
      const token = await createSession(env.DB, user.id);
      return withCookies(new Response(null, { status: 302, headers: { location: st.ret } }), [
        cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 }),
        cookie('jy_oauth', '', { maxAge: 0, path: '/api/auth' }),
      ]);
    }

    if (route === 'POST /auth/logout') {
      await destroySession(req, env.DB);
      return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) });
    }

    // ---------- me ----------
    if (route === 'GET /me') {
      if (me.kind === 'guest') return reply(json({ kind: 'guest', id: me.playerId, nickname: me.nickname }));
      const u = await env.DB.prepare(`SELECT created_at FROM users WHERE id = ?`).bind(me.userId).first<{ created_at: number }>();
      const ts = await env.DB.prepare(`SELECT games, wins, kills, best_pct, best_score FROM territory_stats WHERE user_id = ?`).bind(me.userId).first();
      const arena = await env.DB.prepare(`SELECT game, games, wins, kills, best_score, best_len, lines, attack FROM arena_stats WHERE user_id = ?`).bind(me.userId).all();
      const solo = await env.DB.prepare(`SELECT game, mode, best_score, best_ms, lines, plays FROM solo_best WHERE user_id = ?`).bind(me.userId).all();
      return reply(
        json({
          kind: 'user',
          id: me.playerId,
          nickname: me.nickname,
          createdAt: u?.created_at,
          ratings: await ratingsOf(env.DB, me.userId!),
          territory: ts ?? { games: 0, wins: 0, kills: 0, best_pct: 0, best_score: 0 },
          arena: Object.fromEntries(arena.results.map((r) => [r.game as string, r])),
          solo: solo.results,
        }),
      );
    }

    if (route === 'PATCH /me') {
      if (me.kind !== 'user') return reply(err('login_required', 401));
      if (await limited(env, req, 'profile', 20, 600000)) return err('rate_limited', 429);
      const body = (await req.json().catch(() => ({}))) as { nickname?: string };
      if (!validNickname(body.nickname)) return err('invalid_nickname', 400);
      await env.DB.prepare(`UPDATE users SET nickname = ? WHERE id = ?`).bind(body.nickname.trim(), me.userId).run();
      return json({ ok: true });
    }

    if (route === 'DELETE /me') {
      if (me.kind !== 'user') return reply(err('login_required', 401));
      // Personal data removal: sessions, ratings, account; finished games keep only the nickname snapshot.
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(me.userId),
        env.DB.prepare(`DELETE FROM ratings WHERE user_id = ?`).bind(me.userId),
        env.DB.prepare(`DELETE FROM territory_stats WHERE user_id = ?`).bind(me.userId),
        env.DB.prepare(`DELETE FROM arena_stats WHERE user_id = ?`).bind(me.userId),
        env.DB.prepare(`DELETE FROM solo_best WHERE user_id = ?`).bind(me.userId),
        env.DB.prepare(`DELETE FROM solo_runs WHERE user_id = ?`).bind(me.userId),
        env.DB.prepare(`UPDATE games SET seat0_user = NULL, seat0_name = 'deleted' WHERE seat0_user = ?`).bind(me.userId),
        env.DB.prepare(`UPDATE games SET seat1_user = NULL, seat1_name = 'deleted' WHERE seat1_user = ?`).bind(me.userId),
        env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(me.userId),
      ]);
      return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) });
    }

    // ---------- rooms ----------
    if (route === 'POST /rooms') {
      if (await limited(env, req, 'room', 30, 600000)) return err('rate_limited', 429);
      const body = (await req.json().catch(() => ({}))) as {
        game?: GameId;
        minutes?: number;
        inc?: number;
        banqiPreset?: string;
        rated?: boolean;
        side?: 'first' | 'second' | 'random';
      };
      if (!body.game || !GAME_IDS.includes(body.game)) return err('bad_game', 400);
      const minutes = Math.max(0, Math.min(60, Math.floor(Number(body.minutes ?? 10))));
      const inc = Math.max(0, Math.min(60, Math.floor(Number(body.inc ?? 0))));
      const rated = !!body.rated && me.kind === 'user';
      const preset = rated ? 'taiwan' : ['taiwan', 'taiwan_chain', 'strict_rank'].includes(String(body.banqiPreset)) ? body.banqiPreset : 'taiwan';
      for (let i = 0; i < 5; i++) {
        const id = roomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
        const res = await stub.fetch('https://do/init', {
          method: 'POST',
          body: JSON.stringify({
            meta: {
              id,
              game: body.game,
              rated,
              time: { minutes, incrementSec: inc },
              banqiPreset: preset,
              createdAt: Date.now(),
              kind: 'private',
              creatorId: me.playerId,
              creatorSeat: ['first', 'second', 'random'].includes(String(body.side)) ? body.side : 'random',
            },
          }),
        });
        if (res.ok) return reply(json({ id }));
      }
      return err('room_alloc_failed', 500);
    }

    if (parts[0] === 'rooms' && parts[1]) {
      const id = parts[1].toUpperCase();
      if (!isRoomCode(id)) return err('bad_room', 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
      if (req.method === 'GET' && parts.length === 2) return reply(new Response((await stub.fetch('https://do/info')).body, { headers: { 'content-type': 'application/json' } }));
      if (req.method === 'GET' && parts[2] === 'ws') {
        if (await limited(env, req, 'ws', 120, 60000)) return err('rate_limited', 429);
        const info = (await (await stub.fetch('https://do/info')).json()) as { exists: boolean; game: GameId };
        if (!info.exists) return err('room_not_found', 404);
        let rating = '';
        const name = me.kind === 'user' ? me.nickname : cleanGuestName(url.searchParams.get('name'), me.nickname);
        if (me.userId) {
          const rr = await env.DB.prepare(`SELECT rating FROM ratings WHERE user_id = ? AND game = ?`).bind(me.userId, info.game).first<{ rating: number }>();
          rating = String(Math.round(rr?.rating ?? START_RATING));
        }
        return forwardWs(req, stub, me, { 'x-jy-name': name, 'x-jy-rating': rating }, '/ws');
      }
    }

    // ---------- matchmaking ----------
    if (route === 'GET /match/ws') {
      if (await limited(env, req, 'match', 60, 600000)) return err('rate_limited', 429);
      const game = url.searchParams.get('game') as GameId;
      if (!GAME_IDS.includes(game)) return err('bad_game', 400);
      const rated = url.searchParams.get('rated') === '1';
      if (rated && me.kind !== 'user') return reply(err('login_required', 401));
      const minutes = [3, 5, 10, 15].includes(Number(url.searchParams.get('minutes'))) ? Number(url.searchParams.get('minutes')) : 5;
      const inc = [0, 2, 3, 5, 10].includes(Number(url.searchParams.get('inc'))) ? Number(url.searchParams.get('inc')) : 3;
      let rating = '';
      if (me.userId) {
        const rr = await env.DB.prepare(`SELECT rating FROM ratings WHERE user_id = ? AND game = ?`).bind(me.userId, game).first<{ rating: number }>();
        rating = String(Math.round(rr?.rating ?? START_RATING));
      }
      const pool = `${game}|${rated ? 1 : 0}|${minutes}+${inc}`;
      const stub = env.MATCH.get(env.MATCH.idFromName(pool));
      const name = me.kind === 'user' ? me.nickname : cleanGuestName(url.searchParams.get('name'), me.nickname);
      return forwardWs(req, stub, me, { 'x-jy-name': name, 'x-jy-rating': rating }, '/ws', `?game=${game}&rated=${rated ? 1 : 0}&minutes=${minutes}&inc=${inc}`);
    }

    // ---------- Territory Rush ----------
    if (route === 'POST /territory/rooms') {
      if (await limited(env, req, 'troom', 30, 600000)) return err('rate_limited', 429);
      const body = (await req.json().catch(() => ({}))) as { minutes?: number };
      const minutes = [2, 3, 5].includes(Number(body.minutes)) ? Number(body.minutes) : 3;
      for (let i = 0; i < 5; i++) {
        const id = roomCode();
        const stub = env.TROOMS.get(env.TROOMS.idFromName(id));
        const res = await stub.fetch('https://do/init', {
          method: 'POST',
          body: JSON.stringify({ meta: { id, kind: 'private', minutes, hostId: me.playerId, createdAt: Date.now() } }),
        });
        if (res.ok) return reply(json({ id }));
      }
      return err('room_alloc_failed', 500);
    }
    if (parts[0] === 'territory' && parts[1] === 'rooms' && parts[2]) {
      const id = parts[2].toUpperCase();
      if (!isRoomCode(id)) return err('bad_room', 400);
      const stub = env.TROOMS.get(env.TROOMS.idFromName(id));
      if (req.method === 'GET' && parts.length === 3) return reply(new Response((await stub.fetch('https://do/info')).body, { headers: { 'content-type': 'application/json' } }));
      if (req.method === 'GET' && parts[3] === 'ws') {
        if (await limited(env, req, 'tws', 120, 60000)) return err('rate_limited', 429);
        const info = (await (await stub.fetch('https://do/info')).json()) as { exists: boolean };
        if (!info.exists) return err('room_not_found', 404);
        const name = me.kind === 'user' ? me.nickname : cleanGuestName(url.searchParams.get('name'), me.nickname);
        return forwardWs(req, stub, me, { 'x-jy-name': name }, '/ws');
      }
    }
    if (route === 'GET /territory/match/ws') {
      if (await limited(env, req, 'tmatch', 60, 600000)) return err('rate_limited', 429);
      const stub = env.TLOBBY.get(env.TLOBBY.idFromName('public'));
      const name = me.kind === 'user' ? me.nickname : cleanGuestName(url.searchParams.get('name'), me.nickname);
      return forwardWs(req, stub, me, { 'x-jy-name': name }, '/ws');
    }
    if (route === 'GET /territory/leaderboard') {
      const sort = ({ score: 'best_score', wins: 'wins', kills: 'kills', pct: 'best_pct' } as Record<string, string>)[url.searchParams.get('sort') ?? 'score'] ?? 'best_score';
      const rows = await env.DB.prepare(
        `SELECT u.nickname, t.games, t.wins, t.kills, t.best_pct, t.best_score FROM territory_stats t JOIN users u ON u.id = t.user_id
         WHERE t.games >= 3 AND u.banned = 0 ORDER BY t.${sort} DESC, t.best_score DESC LIMIT 100`,
      ).all();
      return json({ sort, rows: rows.results }, 200, { 'cache-control': 'public, max-age=60' });
    }


    // ---------- Snake Arena & Block Puzzle Battle ----------
    if (parts[0] === 'arena' && (parts[1] === 'snake' || parts[1] === 'blocks') && parts[2] === 'rooms') {
      const game = parts[1];
      const ns = game === 'snake' ? env.SROOMS : env.BROOMS;
      if (req.method === 'POST' && parts.length === 3) {
        if (await limited(env, req, 'aroom', 30, 600000)) return err('rate_limited', 429);
        const body = (await req.json().catch(() => ({}))) as { minutes?: number; map?: string };
        const minutes = [2, 3, 5].includes(Number(body.minutes)) ? Number(body.minutes) : 3;
        const map = ['open', 'pillars', 'cross', 'rooms'].includes(String(body.map)) ? String(body.map) : 'open';
        for (let i = 0; i < 5; i++) {
          const id = roomCode();
          const res = await ns.get(ns.idFromName(id)).fetch('https://do/init', {
            method: 'POST',
            body: JSON.stringify({ meta: { id, game, kind: 'private', options: { minutes, map: game === 'snake' ? map : undefined }, hostId: me.playerId, createdAt: Date.now() } }),
          });
          if (res.ok) return reply(json({ id }));
        }
        return err('room_alloc_failed', 500);
      }
      const id = (parts[3] ?? '').toUpperCase();
      if (!isRoomCode(id)) return err('bad_room', 400);
      const stub = ns.get(ns.idFromName(id));
      if (req.method === 'GET' && parts.length === 4) return reply(new Response((await stub.fetch('https://do/info')).body, { headers: { 'content-type': 'application/json' } }));
      if (req.method === 'GET' && parts[4] === 'ws') {
        if (await limited(env, req, 'aws', 120, 60000)) return err('rate_limited', 429);
        const info = (await (await stub.fetch('https://do/info')).json()) as { exists: boolean };
        if (!info.exists) return err('room_not_found', 404);
        const name = me.kind === 'user' ? me.nickname : cleanGuestName(url.searchParams.get('name'), me.nickname);
        return forwardWs(req, stub, me, { 'x-jy-name': name }, '/ws');
      }
    }
    if (route === 'GET /arena/match/ws') {
      if (await limited(env, req, 'amatch', 60, 600000)) return err('rate_limited', 429);
      const pool = url.searchParams.get('pool') ?? '';
      if (!['snake', 'blocks', 'blocks-ranked'].includes(pool)) return err('bad_pool', 400);
      if (pool === 'blocks-ranked' && me.kind !== 'user') return reply(err('login_required', 401));
      let rating = '';
      if (me.userId) {
        const rr = await env.DB.prepare(`SELECT rating FROM ratings WHERE user_id = ? AND game = 'blocks'`).bind(me.userId).first<{ rating: number }>();
        rating = String(Math.round(rr?.rating ?? START_RATING));
      }
      const stub = env.ALOBBY.get(env.ALOBBY.idFromName(pool));
      const name = me.kind === 'user' ? me.nickname : cleanGuestName(url.searchParams.get('name'), me.nickname);
      return forwardWs(req, stub, me, { 'x-jy-name': name, 'x-jy-rating': rating }, '/ws', `?pool=${pool}`);
    }
    if (parts[0] === 'arena' && (parts[1] === 'snake' || parts[1] === 'blocks') && parts[2] === 'leaderboard' && req.method === 'GET') {
      const game = parts[1];
      const board = url.searchParams.get('board') ?? 'online';
      const cache = { 'cache-control': 'public, max-age=60' };
      if (board === 'rating' && game === 'blocks') {
        const rows = await env.DB.prepare(
          `SELECT u.nickname, r.rating, r.games, r.wins, r.losses FROM ratings r JOIN users u ON u.id = r.user_id
           WHERE r.game = 'blocks' AND r.games >= 3 AND u.banned = 0 ORDER BY r.rating DESC LIMIT 100`,
        ).all();
        return json({ board, rows: rows.results.map((r) => ({ ...r, rating: Math.round(Number(r.rating)) })) }, 200, cache);
      }
      if (board === 'solo') {
        const mode = url.searchParams.get('mode') ?? '';
        const modes: readonly string[] = game === 'snake' ? SNAKE_SOLO_MODES : BLOCKS_SOLO_MODES;
        if (!modes.includes(mode)) return err('bad_mode', 400);
        const byTime = game === 'blocks' && mode === 'sprint';
        const rows = await env.DB.prepare(
          `SELECT u.nickname, s.best_score, s.best_ms, s.lines, s.plays FROM solo_best s JOIN users u ON u.id = s.user_id
           WHERE s.game = ? AND s.mode = ? AND u.banned = 0 ${byTime ? 'AND s.best_ms IS NOT NULL ORDER BY s.best_ms ASC' : 'ORDER BY s.best_score DESC'} LIMIT 100`,
        )
          .bind(game, mode)
          .all();
        return json({ board, mode, rows: rows.results }, 200, cache);
      }
      const col = ({ score: 'best_score', wins: 'wins', kills: 'kills', len: 'best_len', lines: 'lines', attack: 'attack' } as Record<string, string>)[url.searchParams.get('sort') ?? 'score'] ?? 'best_score';
      const rows = await env.DB.prepare(
        `SELECT u.nickname, a.games, a.wins, a.kills, a.best_score, a.best_len, a.lines, a.attack FROM arena_stats a JOIN users u ON u.id = a.user_id
         WHERE a.game = ? AND a.games >= 3 AND u.banned = 0 ORDER BY a.${col} DESC, a.best_score DESC LIMIT 100`,
      )
        .bind(game)
        .all();
      return json({ board, rows: rows.results }, 200, cache);
    }

    // ---------- verified solo records ----------
    if (route === 'POST /solo/start') {
      if (me.kind !== 'user') return reply(json({ token: null }));
      if (await limited(env, req, 'solo', 120, 600000)) return err('rate_limited', 429);
      const body = (await req.json().catch(() => ({}))) as { game?: string; mode?: string };
      const ok = (body.game === 'snake' && (SNAKE_SOLO_MODES as readonly string[]).includes(String(body.mode))) || (body.game === 'blocks' && (BLOCKS_SOLO_MODES as readonly string[]).includes(String(body.mode)));
      if (!ok) return err('bad_mode', 400);
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const token = await sign(env.DB, JSON.stringify({ id: randomId(12), uid: me.userId, g: body.game, m: body.mode, seed, t0: Date.now() }));
      return reply(json({ token, seed }));
    }
    if (route === 'POST /solo/finish') {
      if (me.kind !== 'user') return reply(err('login_required', 401));
      if (await limited(env, req, 'solofin', 120, 600000)) return err('rate_limited', 429);
      const raw = await req.text();
      if (raw.length > 3_000_000) return err('too_large', 413);
      const body = JSON.parse(raw) as { token?: string; inputs?: [number, number][]; endTick?: number };
      const payload = await verify(env.DB, body.token);
      if (!payload) return err('bad_token', 400);
      const t = JSON.parse(payload) as { id: string; uid: string; g: 'snake' | 'blocks'; m: string; seed: number; t0: number };
      if (t.uid !== me.userId) return err('bad_token', 400);
      const realMs = Date.now() - t.t0;
      if (realMs > 4 * 3600_000) return err('expired', 400);
      if (!Array.isArray(body.inputs) || body.inputs.length > 400_000 || !body.inputs.every((x) => Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]))) return err('bad_inputs', 400);
      let v;
      try {
        v = t.g === 'snake' ? verifySnake(t.m as never, t.seed, body.inputs) : verifyBlocks(t.m as never, t.seed, body.inputs, Number(body.endTick ?? 0));
      } catch (e) {
        return json({ ok: false, error: 'replay_failed', detail: String((e as Error).message) }, 422);
      }
      if (realMs < v.minRealMs) return json({ ok: false, error: 'too_fast' }, 422);
      const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO solo_runs (token_id, user_id, game, mode, score, ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(t.id, me.userId, t.g, t.m, v.score, v.ms, Date.now())
        .run();
      if (!inserted.meta.changes) return err('already_submitted', 409);
      const timed = t.g === 'blocks' && t.m === 'sprint';
      await env.DB.prepare(
        `INSERT INTO solo_best (user_id, game, mode, best_score, best_ms, lines, plays, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(user_id, game, mode) DO UPDATE SET plays = plays + 1, updated_at = excluded.updated_at,
         best_score = MAX(best_score, excluded.best_score),
         best_ms = CASE WHEN ?8 = 1 THEN MIN(COALESCE(best_ms, excluded.best_ms), excluded.best_ms) ELSE best_ms END,
         lines = MAX(lines, excluded.lines)`,
      )
        .bind(me.userId, t.g, t.m, v.score, timed ? v.ms : null, v.lines, Date.now(), timed ? 1 : 0)
        .run();
      const best = await env.DB.prepare(`SELECT best_score, best_ms FROM solo_best WHERE user_id = ? AND game = ? AND mode = ?`).bind(me.userId, t.g, t.m).first();
      return json({ ok: true, score: v.score, ms: v.ms, best });
    }

    // ---------- history ----------
    if (route === 'GET /history') {
      if (me.kind !== 'user') return reply(json({ games: [] }));
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30)));
      const rows = await env.DB.prepare(
        `SELECT id, game, rated, counted, seat0_user, seat0_name, seat1_user, seat1_name, result, winner, reason, rating_change, ended_at
         FROM games WHERE seat0_user = ?1 OR seat1_user = ?1 ORDER BY ended_at DESC LIMIT ?2`,
      )
        .bind(me.userId, limit)
        .all();
      return reply(json({ games: rows.results.map((g) => ({ ...g, mySeat: g.seat0_user === me.userId ? 0 : 1 })) }));
    }

    if (parts[0] === 'games' && parts[1] && req.method === 'GET') {
      const g = await env.DB.prepare(`SELECT * FROM games WHERE id = ?`).bind(parts[1]).first<Record<string, unknown>>();
      if (!g) return err('not_found', 404);
      if (me.kind !== 'user' || (g.seat0_user !== me.userId && g.seat1_user !== me.userId)) return reply(err('forbidden', 403));
      return reply(json({ ...g, state: JSON.parse(String(g.state)), mySeat: g.seat0_user === me.userId ? 0 : 1, seat0_player: undefined, seat1_player: undefined }));
    }

    // ---------- leaderboard ----------
    if (route === 'GET /leaderboard') {
      const game = url.searchParams.get('game') as GameId;
      if (!GAME_IDS.includes(game)) return err('bad_game', 400);
      const rows = await env.DB.prepare(
        `SELECT u.nickname, r.rating, r.games, r.wins, r.losses, r.draws FROM ratings r JOIN users u ON u.id = r.user_id
         WHERE r.game = ? AND r.games >= 5 AND u.banned = 0 ORDER BY r.rating DESC LIMIT 100`,
      )
        .bind(game)
        .all();
      return json({ game, rows: rows.results.map((r) => ({ ...r, rating: Math.round(Number(r.rating)) })) }, 200, { 'cache-control': 'public, max-age=60' });
    }

    return reply(err('not_found', 404));
  } catch (e) {
    await logError(env.DB, 'api', `${route}: ${String(e)}`, (e as Error)?.stack);
    return err('server_error', 500);
  }
};
