import type { GameId } from '../../shared/types';

export interface Me {
  kind: 'user' | 'guest';
  id: string;
  nickname: string;
  ratings?: Record<GameId, { rating: number; games: number; wins: number; losses: number; draws: number }> & { blocks?: { rating: number; games: number; wins: number; losses: number; draws: number } };
  territory?: { games: number; wins: number; kills: number; best_pct: number; best_score: number };
  arena?: Partial<Record<'snake' | 'blocks', { games: number; wins: number; kills: number; best_score: number; best_len: number; lines: number; attack: number }>>;
  solo?: { game: 'snake' | 'blocks'; mode: string; best_score: number; best_ms: number | null; lines: number; plays: number }[];
  createdAt?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? 'generic');
  return body as T;
}

/** Report client errors to the server log (rate limited server-side). */
export function reportError(message: string, extra?: unknown) {
  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: String(message).slice(0, 500), extra: JSON.stringify(extra ?? null).slice(0, 2000), url: location.pathname }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
