// Small crypto helpers on WebCrypto (available in Workers, Pages Functions and Node 20+).
import { ensureSchema } from './schema';

const enc = new TextEncoder();

export function randomId(bytes = 16): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}

export function b64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function roomCode(len = 6): string {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ROOM_ALPHABET[x % ROOM_ALPHABET.length]).join('');
}
export function isRoomCode(s: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(s);
}

let keyCache: Promise<CryptoKey> | null = null;

/** Signing key. Generated once and stored in D1 (`config.session_key`) — no manual secret setup needed. */
export function signingKey(db: D1Database): Promise<CryptoKey> {
  keyCache ??= (async () => {
    await ensureSchema(db);
    let row = await db.prepare(`SELECT value FROM config WHERE key = 'session_key'`).first<{ value: string }>();
    if (!row) {
      const fresh = randomId(32);
      await db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('session_key', ?)`).bind(fresh).run();
      row = await db.prepare(`SELECT value FROM config WHERE key = 'session_key'`).first<{ value: string }>();
    }
    return crypto.subtle.importKey('raw', b64urlDecode(row!.value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  })().catch((e) => {
    keyCache = null;
    throw e;
  });
  return keyCache;
}

export async function sign(db: D1Database, payload: string): Promise<string> {
  const key = await signingKey(db);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${b64url(enc.encode(payload))}.${b64url(sig)}`;
}

export async function verify(db: D1Database, token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [p, s] = token.split('.');
  if (!p || !s) return null;
  try {
    const key = await signingKey(db);
    const payload = b64urlDecode(p);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(s), payload);
    return ok ? new TextDecoder().decode(payload) : null;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name: string, value: string, opts: { maxAge?: number; path?: string; httpOnly?: boolean } = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? '/'}`, 'Secure', 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}
