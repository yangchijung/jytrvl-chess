// Local Block Puzzle Battle: solo modes (classic, marathon, sprint, ultra), versus the computer and two
// players on one device. Solo games can be submitted as verified records: the server issues the seed
// and replays the recorded inputs.
import { BlocksGame, ACTIONS, TPS, W, rng, type Action, type BlocksMode, type InputRecord } from '../../shared/blocks/engine';
import { BlocksBot, type BlocksLevel } from '../../shared/blocks/ai';
import { api } from '../lib/api';
import { BlocksSession } from './session';

export type LocalBlocksMode = 'classic' | 'marathon' | 'sprint' | 'ultra' | 'ai' | 'local';

export interface LocalBlocksOptions {
  mode: LocalBlocksMode;
  names: string[];
  level: BlocksLevel;
  startLevel?: number;
  seed?: number;
  ranked?: boolean;
  countdownMs?: number;
}

export class LocalBlocks extends BlocksSession {
  readonly opts: LocalBlocksOptions;
  private bot: BlocksBot | null = null;
  private startAt = 0;
  private pausedAt = 0;
  private paused = false;
  private holes: () => number = Math.random;
  private inputs: InputRecord[] = [];
  private token: string | null = null;
  /** tutorial hook: adjust the fresh game after every (re)start */
  onRestart: ((s: LocalBlocks) => void) | null = null;
  private onVis = () => {
    if (document.hidden && this.status === 'playing') this.togglePause();
  };

  constructor(opts: LocalBlocksOptions) {
    super();
    this.opts = opts;
    void this.restart();
    document.addEventListener('visibilitychange', this.onVis);
  }

  get solo() {
    return this.opts.mode !== 'ai' && this.opts.mode !== 'local';
  }
  get rankable() {
    return this.solo && (this.opts.startLevel ?? 1) === 1;
  }

  async restart() {
    const o = this.opts;
    this.token = null;
    let seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
    if (o.ranked && this.rankable) {
      try {
        const r = await api<{ token: string | null; seed?: number }>('/solo/start', { method: 'POST', body: JSON.stringify({ game: 'blocks', mode: o.mode }) });
        if (r.token && r.seed !== undefined) {
          this.token = r.token;
          seed = r.seed;
        }
      } catch {
        /* offline: unranked */
      }
    }
    const mode: BlocksMode = this.solo ? (o.mode as BlocksMode) : 'versus';
    const mk = () => new BlocksGame({ seed, mode, startLevel: this.solo ? o.startLevel ?? 1 : 1 });
    this.players = [this.newPlayer(mk(), o.names[0] ?? 'P1', 0, 0)];
    this.bot = null;
    if (o.mode === 'ai') {
      this.players.push(this.newPlayer(mk(), o.names[1] ?? 'CPU', 2, -1));
      this.bot = new BlocksBot(o.level, rng(seed ^ 0x1234));
    } else if (o.mode === 'local') this.players.push(this.newPlayer(mk(), o.names[1] ?? 'P2', 2, 1));
    this.holes = rng(seed ^ 0x5bd1e995);
    this.inputs = [];
    this.end = null;
    this.paused = false;
    this.status = 'countdown';
    this.countdownEnd = performance.now() + (o.countdownMs ?? 2000);
    this.startAt = 0;
    this.onRestart?.(this);
    this.emit();
  }

  input(slot: number, a: Action) {
    if (this.status !== 'playing') return;
    const pi = this.players.findIndex((p) => p.slot === slot);
    const p = this.players[pi];
    if (!p || p.game.status !== 'playing') return;
    if (p.game.input(a) || a === 'SD0' || a === 'SD1') {
      if (this.solo) this.inputs.push([p.game.tick, ACTIONS.indexOf(a)]);
      this.flush(pi, performance.now());
      this.emit();
    }
  }

  canPause() {
    return true;
  }
  togglePause() {
    const now = performance.now();
    if (this.status === 'playing') {
      // release soft drop so it does not stay held while paused
      for (const p of this.players) if (p.slot >= 0 && p.game.softDrop) this.input(p.slot, 'SD0');
      this.paused = true;
      this.pausedAt = now;
      this.status = 'paused';
    } else if (this.status === 'paused') {
      this.paused = false;
      this.startAt += now - this.pausedAt;
      this.status = 'playing';
    }
    this.emit();
  }

  private flush(pi: number, now: number) {
    const p = this.players[pi];
    const events = p.game.drainEvents();
    this.absorb(p, pi, events, now);
    // versus: attacks go to the other board
    if (this.players.length === 2)
      for (const e of events) {
        if (e.type === 'clear' && e.info.attack > 0) {
          const o = this.players[1 - pi];
          if (o.game.status === 'playing') o.game.addGarbage(e.info.attack, Math.floor(this.holes() * W));
        }
      }
  }

  update(now: number) {
    if (this.paused) return;
    if (this.status === 'countdown') {
      if (now >= this.countdownEnd) {
        this.status = 'playing';
        this.startAt = now;
        this.emit();
      }
      return;
    }
    if (this.status !== 'playing') return;
    const target = Math.floor(((now - this.startAt) * TPS) / 1000);
    let changed = false;
    this.players.forEach((p, i) => {
      const g = p.game;
      let n = 0;
      while (g.status === 'playing' && g.tick < target && n++ < 30) {
        if (this.bot && i === 1) for (const a of this.bot.update(g)) g.input(a);
        g.step();
        this.flush(i, now);
        changed = true;
      }
      if (g.tick < target - 30) this.startAt = now - (g.tick * 1000) / TPS; // tab was throttled: don't fast-forward
    });
    this.checkEnd();
    if (changed) this.emit();
  }

  private checkEnd() {
    if (this.status === 'ended') return;
    const over = this.players.map((p) => p.game.status === 'over');
    if (this.solo) {
      if (!over[0]) return;
      const g = this.players[0].game;
      this.status = 'ended';
      this.end = { winner: null, reason: g.result ?? 'topout', solo: { score: g.score, lines: g.lines, seconds: g.seconds(), result: g.result ?? 'topout' }, record: this.localRecord(g) };
      if (this.token && this.rankable) void this.submit(g);
      this.emit();
      return;
    }
    if (!over.some(Boolean)) return;
    const alive = over.map((o, k) => (o ? -1 : k)).filter((k) => k >= 0);
    this.status = 'ended';
    this.end = { winner: alive.length === 1 ? alive[0] : null, reason: alive.length === 1 ? 'topout' : 'draw' };
    this.emit();
  }

  /** local personal best (any settings) */
  private localRecord(g: BlocksGame) {
    const key = `jychess.blocks.best.${this.opts.mode}`;
    const timed = this.opts.mode === 'sprint';
    const value = timed ? Math.round(g.seconds() * 1000) : g.score;
    const valid = !timed || g.result === 'goal';
    let prev = 0;
    try {
      prev = Number(localStorage.getItem(key) ?? 0);
      const better = valid && (prev === 0 || (timed ? value < prev : value > prev));
      if (better) localStorage.setItem(key, String(value));
      return timed ? { best: 0, bestMs: better ? value : prev || null, improved: better } : { best: Math.max(prev, value), improved: better };
    } catch {
      return null;
    }
  }

  localBest(): number {
    try {
      return Number(localStorage.getItem(`jychess.blocks.best.${this.opts.mode}`) ?? 0);
    } catch {
      return 0;
    }
  }

  private async submit(g: BlocksGame) {
    const token = this.token;
    this.token = null;
    try {
      const r = await api<{ ok: boolean; best?: { best_score: number; best_ms: number | null } }>('/solo/finish', {
        method: 'POST',
        body: JSON.stringify({ token, inputs: this.inputs, endTick: g.endTick || g.tick }),
      });
      if (r.ok && this.end) {
        this.end.saved = true;
        if (r.best) this.end.record = { best: r.best.best_score, bestMs: r.best.best_ms, improved: this.end.record?.improved ?? false };
      }
    } catch {
      if (this.end) this.end.saved = false;
    }
    this.emit();
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
