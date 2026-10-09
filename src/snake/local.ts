// Local Snake Arena: solo modes (classic, survival, time attack), versus the computer, two players on
// one device, and the tutorial sandbox. Solo games on the standard settings can be submitted as
// verified records (the server replays the recorded inputs from its own seed).
import { SnakeGame, stepsPerSecond, arenaSizeFor, rng, type Dir, type SnakeMap, type SnakeMode, type SpeedName } from '../../shared/snake/engine';
import { snakeThink, newSnakeMemory, type SnakeBotMemory, type SnakeLevel } from '../../shared/snake/ai';
import { snakeSoloConfig, SNAKE_STANDARD, TIMEATTACK_SECONDS } from '../../shared/solo';
import { api } from '../lib/api';
import { SnakeClient } from './client';

export interface LocalSnakeOptions {
  mode: SnakeMode;
  humans: { name: string; color: number }[];
  bots: number;
  level: SnakeLevel;
  speed: SpeedName;
  map: SnakeMap;
  walls: boolean;
  /** versus length in minutes (0 = no limit) */
  minutes: number;
  size?: number;
  seed?: number;
  countdownMs?: number;
  /** request a server seed and submit a verified record (solo, standard settings, signed in) */
  ranked?: boolean;
}

export const SNAKE_BOT_NAMES = ['Nova', 'Pixel', 'Bolt', 'Mochi', 'Echo', 'Kiwi', 'Comet', 'Tofu'];

export class LocalSnake extends SnakeClient {
  readonly opts: LocalSnakeOptions;
  private bots: { idx: number; mem: SnakeBotMemory; rand: () => number }[] = [];
  private paused = false;
  private hidden = false;
  private inputs: [number, number][] = [];
  private token: string | null = null;
  private startedAt = 0;
  beforeStepHook: ((g: SnakeGame) => void) | null = null;
  onStep: ((g: SnakeGame) => void) | null = null;
  private onVis = () => {
    this.hidden = document.hidden;
    if (this.hidden && this.status === 'playing' && this.canPause()) this.togglePause();
  };

  constructor(opts: LocalSnakeOptions) {
    super();
    this.opts = opts;
    void this.restart();
    document.addEventListener('visibilitychange', this.onVis);
  }

  /** standard-settings solo game eligible for the verified leaderboard */
  get isRankable() {
    const o = this.opts;
    return o.mode !== 'versus' && o.humans.length === 1 && o.bots === 0 && o.map === SNAKE_STANDARD.map && o.walls === SNAKE_STANDARD.walls && o.speed === SNAKE_STANDARD.speed && !o.size;
  }

  async restart() {
    const o = this.opts;
    this.token = null;
    let seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
    if (o.ranked && this.isRankable) {
      try {
        const r = await api<{ token: string | null; seed?: number }>('/solo/start', { method: 'POST', body: JSON.stringify({ game: 'snake', mode: o.mode }) });
        if (r.token && r.seed !== undefined) {
          this.token = r.token;
          seed = r.seed;
        }
      } catch {
        /* offline: play unranked */
      }
    }
    const n = o.humans.length + o.bots;
    let g: SnakeGame;
    if (this.token) g = new SnakeGame(snakeSoloConfig(o.mode, seed));
    else {
      const size = o.size ?? (o.mode === 'versus' ? arenaSizeFor(n) : SNAKE_STANDARD.size);
      const durationSteps = o.mode === 'timeattack' ? TIMEATTACK_SECONDS * stepsPerSecond(o.mode, o.speed, 0) : o.mode === 'versus' && o.minutes ? Math.round(o.minutes * 60 * stepsPerSecond('versus', o.speed, 0)) : 0;
      g = new SnakeGame({ width: size, height: size, seed, mode: o.mode, map: o.map, walls: o.mode === 'versus' ? true : o.walls, durationSteps });
    }
    o.humans.forEach((h, k) => g.addSnake(`h${k}`, h.name, false, h.color));
    const r = rng(seed ^ 0xabcdef);
    this.bots = [];
    const used = new Set(o.humans.map((h) => h.color));
    let ci = 0;
    for (let k = 0; k < o.bots; k++) {
      while (used.has(ci)) ci++;
      used.add(ci);
      const s = g.addSnake(`b${k}`, `${SNAKE_BOT_NAMES[k % 8]}🤖`, true, ci % 8);
      this.bots.push({ idx: s.idx, mem: newSnakeMemory(), rand: rng(Math.floor(r() * 2 ** 31)) });
    }
    g.start();
    this.game = g;
    this.colors = g.snakes.map((s) => s.color);
    this.me = o.humans.map((_, k) => k);
    this.end = null;
    this.feed = [];
    this.inputs = [];
    this.popAt.clear();
    this.prevHead = g.snakes.map((s) => s.body[0]);
    this.prevTail = g.snakes.map(() => -1);
    this.paused = false;
    this.status = 'countdown';
    this.countdownEnd = performance.now() + (o.countdownMs ?? 2500);
    this.stepMs = 1000 / stepsPerSecond(o.mode, o.speed, 0);
    this.emit();
  }

  steer(slot: number, d: Dir) {
    const idx = this.me[slot];
    const g = this.game;
    if (idx === undefined || !g || this.status === 'ended' || this.paused) return;
    if (g.steer(idx, d) && this.me.length === 1) this.inputs.push([g.tick, d]);
  }

  canPause() {
    return this.opts.mode !== 'versus' || this.opts.humans.length > 0;
  }
  togglePause() {
    if (this.status === 'playing') {
      this.paused = true;
      this.status = 'paused';
    } else if (this.status === 'paused') {
      this.paused = false;
      this.status = 'countdown';
      this.countdownEnd = performance.now() + 1200;
    }
    this.emit();
  }

  update(now: number) {
    const g = this.game;
    if (!g || this.paused || this.hidden) return;
    if (this.status === 'countdown') {
      if (now >= this.countdownEnd) {
        this.status = 'playing';
        this.lastStepAt = now;
        if (!this.startedAt) this.startedAt = Date.now();
        this.emit();
      }
      return;
    }
    if (this.status !== 'playing') return;
    let n = 0;
    while (now - this.lastStepAt >= this.stepMs && n < 4) {
      this.stepOnce(this.lastStepAt + this.stepMs);
      n++;
      if (this.status !== 'playing') break;
    }
    if (n === 4) this.lastStepAt = now;
  }

  private stepOnce(at: number) {
    const g = this.game!;
    for (const b of this.bots) snakeThink(g, b.idx, b.mem, this.opts.level, b.rand);
    this.beforeStepHook?.(g);
    this.beforeStep(g);
    g.step();
    this.afterStep(at, g.events);
    this.onStep?.(g);
    const me0 = g.snakes[this.me[0]];
    this.stepMs = 1000 / stepsPerSecond(this.opts.mode, this.opts.speed, me0?.foods ?? 0);
    const humansAlive = this.me.filter((i) => g.snakes[i].alive);
    if (g.result) this.finish(g.result);
    else if (this.opts.mode === 'versus' && this.me.length === 1 && humansAlive.length === 0) {
      const alive = g.snakes.filter((s) => s.alive).sort((a, b) => b.body.length - a.body.length);
      const dead = g.snakes.filter((s) => !s.alive).sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0));
      this.finish({ winner: null, reason: 'last_standing', ranking: [...alive, ...dead].map((s) => s.idx) });
    }
    this.emit();
  }

  private finish(result: NonNullable<SnakeGame['result']>) {
    this.status = 'ended';
    this.end = { result, record: null };
    const g = this.game!;
    // local personal best (all players, any settings)
    if (this.opts.mode !== 'versus' && this.me.length === 1) {
      const key = `jychess.snake.best.${this.opts.mode}.${this.isRankable ? 'std' : 'custom'}`;
      const score = g.snakes[0].score;
      let prev = 0;
      try {
        prev = Number(localStorage.getItem(key) ?? 0);
        if (score > prev) localStorage.setItem(key, String(score));
      } catch {
        /* storage unavailable */
      }
      this.end.record = { best: Math.max(prev, score), improved: score > prev };
      if (this.token) void this.submit();
    }
  }

  private async submit() {
    const token = this.token;
    this.token = null;
    try {
      const r = await api<{ ok: boolean; best?: { best_score: number } }>('/solo/finish', { method: 'POST', body: JSON.stringify({ token, inputs: this.inputs }) });
      if (r.ok && this.end) {
        this.end.saved = true;
        if (r.best) this.end.record = { best: r.best.best_score, improved: this.end.record?.improved ?? false };
        this.emit();
      }
    } catch {
      if (this.end) {
        this.end.saved = false;
        this.emit();
      }
    }
  }

  /** local best for display */
  localBest(): number {
    try {
      return Number(localStorage.getItem(`jychess.snake.best.${this.opts.mode}.${this.isRankable ? 'std' : 'custom'}`) ?? 0);
    } catch {
      return 0;
    }
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
