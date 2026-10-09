// Local Territory Rush: solo vs computer, two players on one device, and the tutorial sandbox.
import { TerritoryGame, TICK_MS, mapSizeFor, rng, type Dir } from '../../shared/territory/engine';
import { botThink, newBotMemory, type BotLevel, type BotMemory } from '../../shared/territory/ai';
import { TerritoryClient } from './client';

export interface LocalTerritoryOptions {
  humans: { name: string }[];
  bots: number;
  level: BotLevel;
  durationMin: number;
  seed?: number;
  /** custom map size (tutorial) */
  size?: number;
  countdownMs?: number;
}

export class LocalTerritory extends TerritoryClient {
  readonly opts: LocalTerritoryOptions;
  private bots: { idx: number; mem: BotMemory; rand: () => number; level: BotLevel }[] = [];
  private paused = false;
  /** hook used by the tutorial to script the board before each step */
  beforeStep: ((g: TerritoryGame) => void) | null = null;
  onStep: ((g: TerritoryGame) => void) | null = null;
  private onVis = () => {
    this.paused = document.hidden;
    if (!this.paused) this.lastTickAt = performance.now();
  };

  constructor(opts: LocalTerritoryOptions) {
    super();
    this.opts = opts;
    this.restart();
    document.addEventListener('visibilitychange', this.onVis);
  }

  restart() {
    const o = this.opts;
    const n = o.humans.length + o.bots;
    const size = o.size ?? mapSizeFor(n);
    const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
    const g = new TerritoryGame({ width: size, height: size, durationTicks: Math.round((o.durationMin * 60000) / TICK_MS), seed });
    o.humans.forEach((h, k) => g.addPlayer(`h${k}`, h.name, false));
    const r = rng(seed ^ 0xabcdef);
    this.bots = [];
    for (let k = 0; k < o.bots; k++) {
      const p = g.addPlayer(`b${k}`, botName(k), true);
      this.bots.push({ idx: p.idx, mem: newBotMemory(), rand: rng(Math.floor(r() * 2 ** 31)), level: o.level });
    }
    g.start();
    this.game = g;
    this.me = o.humans.map((_, k) => k);
    this.end = null;
    this.feed = [];
    this.resetBuffers(g);
    this.status = 'countdown';
    this.countdownEnd = performance.now() + (o.countdownMs ?? 2500);
    this.emit();
  }

  steer(slot: number, d: Dir) {
    const idx = this.me[slot];
    if (idx === undefined || !this.game || this.status === 'ended') return;
    this.game.steer(idx, d);
  }

  update(now: number) {
    const g = this.game;
    if (!g || this.paused) return;
    if (this.status === 'countdown') {
      if (now >= this.countdownEnd) {
        this.status = 'playing';
        this.lastTickAt = now;
        this.emit();
      }
      return;
    }
    if (this.status !== 'playing') return;
    let steps = 0;
    while (now - this.lastTickAt >= TICK_MS && steps < 5) {
      this.stepOnce(this.lastTickAt + TICK_MS);
      steps++;
      if (this.status !== 'playing') break;
    }
    if (steps === 5) this.lastTickAt = now; // fell far behind (tab throttled): don't fast-forward
  }

  private stepOnce(at: number) {
    const g = this.game!;
    for (const b of this.bots) botThink(g, b.idx, b.mem, b.level, b.rand);
    this.beforeStep?.(g);
    this.beforeTick(g);
    g.step();
    this.afterTick(
      at,
      g.ownerChanges.map((c) => c.i),
      g.ownerChanges.map((c) => c.v),
      g.events,
    );
    this.onStep?.(g);
    const humansAlive = this.me.filter((i) => g.players[i].alive);
    if (g.result) {
      this.status = 'ended';
      this.end = { result: g.result };
    } else if (this.me.length === 1 && humansAlive.length === 0) {
      // solo: the game ends for you when you are knocked out
      const alive = g.players.filter((p) => p.alive).sort((a, b) => b.land - a.land);
      const dead = g.players.filter((p) => !p.alive).sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0));
      this.status = 'ended';
      this.end = { result: { winner: null, reason: 'last_standing', ranking: [...alive, ...dead].map((p) => p.idx) } };
    }
    this.emit();
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVis);
  }
}

const BOT_NAMES = ['Nova', 'Pixel', 'Bolt', 'Mochi', 'Echo', 'Kiwi', 'Comet', 'Tofu'];
export function botName(k: number) {
  return `${BOT_NAMES[k % BOT_NAMES.length]}🤖`;
}
