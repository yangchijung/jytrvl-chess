// Fixed-window rate limiter. One instance per (bucket, client-ip-hash) key.
// Called through fetch (works from Pages Functions via a cross-script binding).
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

export class RateLimiter extends DurableObject<Env> {
  private windowStart = 0;
  private count = 0;

  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    const limit = Number(u.searchParams.get('limit') ?? 60);
    const windowMs = Number(u.searchParams.get('window') ?? 60000);
    const now = Date.now();
    if (now - this.windowStart >= windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count++;
    return Response.json({ ok: this.count <= limit, retryAfter: Math.ceil((this.windowStart + windowMs - now) / 1000) });
  }
}
