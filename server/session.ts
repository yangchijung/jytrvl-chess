import { cookie, parseCookies, randomId, sign, verify, sha256 } from './crypto';
import { ensureSchema } from './schema';

export interface Identity {
  kind: 'user' | 'guest';
  /** stable player id: "u:<userId>" or "g:<guestId>" */
  playerId: string;
  userId: string | null;
  nickname: string;
  ipHash: string;
  setCookie: string[];
}

export const SESSION_COOKIE = 'jy_sid';
export const GUEST_COOKIE = 'jy_gid';
export const SESSION_DAYS = 30;

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
}

export async function identify(req: Request, db: D1Database): Promise<Identity> {
  await ensureSchema(db);
  const c = parseCookies(req.headers.get('cookie'));
  const ipHash = (await sha256(`jy-ip:${clientIp(req)}`)).slice(0, 16);
  const setCookie: string[] = [];
  if (c[SESSION_COOKIE]) {
    const row = await db
      .prepare(
        `SELECT u.id, u.nickname, u.banned FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
      )
      .bind(await sha256(c[SESSION_COOKIE]), Date.now())
      .first<{ id: string; nickname: string; banned: number }>();
    if (row && !row.banned) return { kind: 'user', playerId: `u:${row.id}`, userId: row.id, nickname: row.nickname, ipHash, setCookie };
    setCookie.push(cookie(SESSION_COOKIE, '', { maxAge: 0 }));
  }
  let gid = (await verify(db, c[GUEST_COOKIE]))?.replace(/^g:/, '') ?? null;
  if (!gid) {
    gid = randomId(12);
    setCookie.push(cookie(GUEST_COOKIE, await sign(db, `g:${gid}`), { maxAge: 365 * 86400 }));
  }
  return { kind: 'guest', playerId: `g:${gid}`, userId: null, nickname: `Guest-${gid.slice(0, 4).toUpperCase()}`, ipHash, setCookie };
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomId(32);
  const now = Date.now();
  await db
    .prepare(`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86400000)
    .run();
  // housekeeping
  await db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now).run();
  return token;
}

export async function destroySession(req: Request, db: D1Database) {
  const c = parseCookies(req.headers.get('cookie'));
  if (c[SESSION_COOKIE]) await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(await sha256(c[SESSION_COOKIE])).run();
}

const NICK_RE = /^[\p{L}\p{N}_\- ]{2,20}$/u;
export function validNickname(s: unknown): s is string {
  return typeof s === 'string' && NICK_RE.test(s.trim()) && s.trim().length >= 2;
}
export function cleanGuestName(s: string | null, fallback: string): string {
  if (!s) return fallback;
  const t = s.trim().slice(0, 20);
  return validNickname(t) ? t : fallback;
}
