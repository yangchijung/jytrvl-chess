// Browser-side engine coordinator. All engine work happens in Web Workers.
//   chess   → Stockfish 19 lite (single-threaded WASM, no special headers needed)
//   xiangqi → Fairy-Stockfish (multi-threaded WASM, needs cross-origin isolation) with a built-in fallback
//   banqi   → JY Chess determinization AI (ai.worker.ts) — sees only public information
import { UciClient, type SearchResult, type Level } from '../../shared/ai/uci';
import { chooseEngineMove } from '../../shared/ai/choose';
import type { BanqiView } from '../../shared/games/banqi/rules';
import type { Seat } from '../../shared/types';

function workerTransport(w: Worker) {
  const subs: ((l: string) => void)[] = [];
  w.onmessage = (e) => {
    const lines = String(e.data).split('\n');
    for (const l of lines) if (l) subs.forEach((f) => f(l));
  };
  return { send: (c: string) => w.postMessage(c), onLine: (cb: (l: string) => void) => subs.push(cb) };
}

let sfClient: Promise<UciClient | null> | null = null;
export function stockfish(): Promise<UciClient | null> {
  sfClient ??= (async () => {
    try {
      const w = new Worker('/engines/stockfish-19-lite-single.js');
      const c = new UciClient(workerTransport(w));
      await c.init();
      return c;
    } catch (e) {
      console.warn('[JY] stockfish unavailable', e);
      return null;
    }
  })();
  return sfClient;
}

let fsfClient: Promise<UciClient | null> | null = null;
export function fairyStockfish(): Promise<UciClient | null> {
  fsfClient ??= (async () => {
    if (!self.crossOriginIsolated) return null;
    try {
      const w = new Worker('/engines/fsf-host.js');
      const t = workerTransport(w);
      const failed = new Promise<null>((resolve) => t.onLine((l) => l.startsWith('jy:error') && resolve(null)));
      const c = new UciClient(t, ['setoption name UCI_Variant value xiangqi']);
      const ok = await Promise.race([c.init().then(() => c), failed, new Promise<null>((r) => setTimeout(() => r(null), 20000))]);
      if (!ok) w.terminate();
      return ok;
    } catch (e) {
      console.warn('[JY] fairy-stockfish unavailable', e);
      return null;
    }
  })();
  return fsfClient;
}

let aiWorker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (m: string) => void; reject: (e: Error) => void }>();
function worker(): Worker {
  if (!aiWorker) {
    aiWorker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    aiWorker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error));
      else w.resolve(e.data.move);
    };
  }
  return aiWorker;
}
function ask(msg: Record<string, unknown>): Promise<string> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker().postMessage({ ...msg, id });
  });
}

export async function aiMove(
  game: 'chess' | 'xiangqi',
  fen: string,
  legal: string[],
  level: Level,
): Promise<string> {
  if (game === 'chess') return chooseEngineMove('chess', fen, legal, level, await stockfish());
  const fsf = await fairyStockfish();
  if (fsf) return chooseEngineMove('xiangqi', fen, legal, level, fsf);
  return ask({ kind: 'xqlite', fen, legal, level });
}

export function banqiAiMove(view: BanqiView, seat: Seat, level: Level): Promise<string> {
  return ask({ kind: 'banqi', view, seat, level });
}

/** Full-strength analysis for the coach (hint, blunder check, review). */
export async function analyse(game: 'chess' | 'xiangqi', fen: string, movetime = 600, multipv = 1): Promise<SearchResult | null> {
  const c = game === 'chess' ? await stockfish() : await fairyStockfish();
  if (!c) return null;
  return c.search(fen, { skill: 20, movetime, depth: 30, multipv });
}

export function engineInfo(game: 'chess' | 'xiangqi' | 'banqi'): string {
  if (game === 'chess') return 'Stockfish 19 (lite)';
  if (game === 'xiangqi') return self.crossOriginIsolated ? 'Fairy-Stockfish' : 'JY built-in';
  return 'JY Banqi AI';
}
