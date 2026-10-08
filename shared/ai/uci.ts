// Minimal UCI client usable with any transport (Web Worker in the browser, emscripten module in Node tests).
// Works with Stockfish 19 and Fairy-Stockfish (UCI_Variant=xiangqi).

export type Level = 'easy' | 'medium' | 'hard';

export interface SearchParams {
  skill?: number; // Stockfish "Skill Level" 0–20
  depth?: number;
  movetime?: number;
  multipv?: number;
}

/** Difficulty table. Easy additionally plays a random legal move with probability `randomRate`. */
export const LEVELS: Record<'chess' | 'xiangqi', Record<Level, SearchParams & { randomRate: number }>> = {
  chess: {
    easy: { skill: 0, depth: 2, randomRate: 0.3 },
    medium: { skill: 6, depth: 8, movetime: 400, randomRate: 0 },
    hard: { skill: 20, depth: 22, movetime: 1500, randomRate: 0 },
  },
  xiangqi: {
    easy: { skill: 0, depth: 2, randomRate: 0.3 },
    medium: { skill: 6, depth: 7, movetime: 400, randomRate: 0 },
    hard: { skill: 20, depth: 22, movetime: 1500, randomRate: 0 },
  },
};

export interface SearchLine {
  multipv: number;
  depth: number;
  /** centipawns from side-to-move perspective; mate scores mapped to ±(100000 - plies) */
  score: number;
  mate: number | null;
  pv: string[];
}

export interface SearchResult {
  bestmove: string;
  lines: SearchLine[];
}

export interface UciTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
}

export class UciClient {
  private listeners: ((l: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private ready = false;
  constructor(
    private t: UciTransport,
    private initCmds: string[] = [],
  ) {
    t.onLine((l) => this.listeners.forEach((f) => f(l)));
  }

  private waitFor(pred: (l: string) => boolean, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((f) => f !== fn);
        reject(new Error('engine timeout'));
      }, timeoutMs);
      const fn = (l: string) => {
        if (pred(l)) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((f) => f !== fn);
          resolve(l);
        }
      };
      this.listeners.push(fn);
    });
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.t.send('uci');
    await this.waitFor((l) => l === 'uciok');
    for (const c of this.initCmds) this.t.send(c);
    this.t.send('isready');
    await this.waitFor((l) => l === 'readyok');
    this.ready = true;
  }

  /** Serialised search: concurrent calls run one after another. */
  search(fen: string, p: SearchParams, moves: string[] = []): Promise<SearchResult> {
    const run = async () => {
      await this.init();
      this.t.send(`setoption name Skill Level value ${p.skill ?? 20}`);
      this.t.send(`setoption name MultiPV value ${p.multipv ?? 1}`);
      this.t.send('ucinewgame');
      this.t.send('isready');
      await this.waitFor((l) => l === 'readyok');
      this.t.send(`position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
      const lines = new Map<number, SearchLine>();
      const collect = (l: string) => {
        if (!l.startsWith('info ') || !l.includes(' pv ')) return;
        const parsed = parseInfo(l);
        if (parsed) lines.set(parsed.multipv, parsed);
      };
      this.listeners.push(collect);
      const go = ['go'];
      if (p.depth) go.push('depth', String(p.depth));
      if (p.movetime) go.push('movetime', String(p.movetime));
      this.t.send(go.join(' '));
      const bm = await this.waitFor((l) => l.startsWith('bestmove'), (p.movetime ?? 0) + 60000);
      this.listeners = this.listeners.filter((f) => f !== collect);
      const bestmove = bm.split(/\s+/)[1];
      return { bestmove, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) };
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  stop() {
    this.t.send('stop');
  }
}

export function parseInfo(l: string): SearchLine | null {
  const tok = l.split(/\s+/);
  const get = (k: string) => {
    const i = tok.indexOf(k);
    return i >= 0 ? tok[i + 1] : undefined;
  };
  const si = tok.indexOf('score');
  if (si < 0) return null;
  const kind = tok[si + 1];
  const val = Number(tok[si + 2]);
  const pvi = tok.indexOf('pv');
  const mate = kind === 'mate' ? val : null;
  const score = kind === 'mate' ? (val > 0 ? 100000 - val : -100000 - val) : val;
  return {
    multipv: Number(get('multipv') ?? 1),
    depth: Number(get('depth') ?? 0),
    score,
    mate,
    pv: pvi >= 0 ? tok.slice(pvi + 1) : [],
  };
}
