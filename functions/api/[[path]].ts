// JY Chess API (Cloudflare Pages Functions). Single router for /api/*.
import { identify, createSession, destroySession, validNickname, cleanGuestName, SESSION_COOKIE, SESSION_DAYS, type Identity } from '../../server/session';
import { cookie, parseCookies, randomId, sign, verify, sha256, b64url, isRoomCode, roomCode } from '../../server/crypto';
import { ensureSchema, logError } from '../../server/schema';
import { START_RATING } from '../../server/elo';
import { GAME_IDS, type GameId } from '../../shared/types';

interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  MATCH: DurableObjectNamespace;
  LIMITER: DurableObjectNamespace;
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
  for (const g of GAME_IDS) out[g] = { rating: START_RATING, games: 0, wins: 0, losses: 0, draws: 0 };
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
      return reply(json({ kind: 'user', id: me.playerId, nickname: me.nickname, createdAt: u?.created_at, ratings: await ratingsOf(env.DB, me.userId!) }));
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
