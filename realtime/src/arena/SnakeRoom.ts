// SnakeRoom Durable Object — authoritative Snake Arena match (2–8 snakes, humans and bots).
// Clients only send turn input; movement, food, collisions and results are computed here at a fixed rate.
import { SnakeGame, SPEEDS, MAPS, MAX_SNAKES, arenaSizeFor, rng, type Dir, type SnakeMap } from '../../../shared/snake/engine';
import { snakeThink, newSnakeMemory, type SnakeBotMemory } from '../../../shared/snake/ai';
import { ArenaRoom } from './ArenaRoom';
import type { ArenaClientMsg, ArenaLevel } from './protocol';
import { recordArenaMatch } from './persist';

export const SNAKE_STEP_MS = Math.round(1000 / SPEEDS.normal);

export class SnakeRoom extends ArenaRoom {
  readonly maxSeats = MAX_SNAKES;
  readonly minSeats = 2;
  protected readonly bucket = { burst: 20, rate: 20 };
  private game: SnakeGame | null = null;
  private brains = new Map<number, { mem: SnakeBotMemory; rand: () => number; level: ArenaLevel }>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastFood = new Map<number, number>();

  protected hasGame() {
    return !!this.game;
  }

  protected createGame(seed: number) {
    const n = this.seats.length;
    const size = arenaSizeFor(n);
    const map = (MAPS as string[]).includes(this.meta!.options.map ?? '') ? (this.meta!.options.map as SnakeMap) : 'open';
    const g = new SnakeGame({ width: size, height: size, seed, mode: 'versus', map, walls: true, durationSteps: Math.round((this.meta!.options.minutes * 60000) / SNAKE_STEP_MS) });
    this.brains.clear();
    this.seats.forEach((s, k) => {
      g.addSnake(s.playerId ?? `bot${k}`, s.name, s.bot);
      this.brains.set(k, { mem: newSnakeMemory(), rand: rng(seed + k * 7919), level: s.level ?? 'medium' });
    });
    g.start();
    this.game = g;
    this.lastFood = new Map(g.food);
  }

  protected resetGame() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.game = null;
  }

  protected sendState(ws: WebSocket, playerId: string) {
    if (!this.game) return;
    this.send(ws, { t: 'ssnap', status: this.status, snap: this.game.snapshot(), mySeat: this.seatOf(playerId), countdownMs: Math.max(0, this.countdownAt - Date.now()) });
  }

  protected onGameMessage(seat: number | null, m: ArenaClientMsg) {
    if (m.t !== 'dir' || seat === null || !this.game) return;
    if (this.status !== 'playing' && this.status !== 'countdown') return;
    if (typeof m.d !== 'number' || !Number.isInteger(m.d) || m.d < 0 || m.d > 3) return;
    this.game.steer(seat, m.d as Dir);
  }

  protected startPlay() {
    if (this.loop) clearInterval(this.loop);
    this.loop = setInterval(() => this.step(), SNAKE_STEP_MS);
  }

  private step() {
    const g = this.game;
    if (!g || this.status !== 'playing') return;
    for (let k = 0; k < this.seats.length; k++) {
      const s = this.seats[k];
      const b = this.brains.get(k);
      if (!b || !g.snakes[k]?.alive) continue;
      if (s.bot) snakeThink(g, k, b.mem, b.level, b.rand);
      else if (!this.connected(s.playerId)) snakeThink(g, k, b.mem, 'medium', b.rand); // autopilot while disconnected
    }
    g.step();
    const sn: number[] = [];
    for (const s of g.snakes) sn.push(s.alive ? 1 : 0, s.body[0] ?? -1, s.body.length, s.dir, s.score, s.kills);
    const fa: number[] = [];
    const fr: number[] = [];
    for (const [c, v] of g.food) if (this.lastFood.get(c) !== v) fa.push(c, v);
    for (const c of this.lastFood.keys()) if (!g.food.has(c)) fr.push(c);
    this.lastFood = new Map(g.food);
    this.broadcast({ t: 'sstep', n: g.tick, sn, fa, fr, ev: g.events });
    if (g.result) void this.finish();
  }

  private async finish() {
    const g = this.game!;
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    let recorded = false;
    try {
      recorded = await recordArenaMatch(this.env, this.meta!, this.seats, {
        winner: g.result!.winner,
        reason: g.result!.reason,
        ranking: g.result!.ranking,
        steps: g.tick,
        minSteps: 150,
        knockout: g.result!.reason === 'last_standing',
        players: g.snakes.map((s) => ({ score: s.score, kills: s.kills, len: s.maxLen, lines: 0, attack: 0 })),
      });
    } catch (e) {
      console.error('[SnakeRoom] record failed', e);
    }
    const r = g.result!;
    this.broadcast({ t: 'end', winner: r.winner, reason: r.reason, ranking: r.ranking, recorded, result: r });
    this.endMatch();
  }
}
