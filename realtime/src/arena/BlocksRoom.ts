// BlocksRoom Durable Object — authoritative Block Puzzle Battle match (2 players, or 1 player vs a
// server-side computer when public matchmaking finds nobody).
//
// Every player's game runs here from the shared seed. Clients send their inputs tagged with the client
// tick and a sequence number; the server applies them in order, never earlier than the game's current
// tick and never far ahead of the server clock. Gravity is forced by the server clock (players cannot
// stall their own game by withholding inputs for more than LAG_TICKS). Garbage is decided here.
import { BlocksGame, ACTIONS, TPS, W, rng } from '../../../shared/blocks/engine';
import { BlocksBot, type BlocksLevel } from '../../../shared/blocks/ai';
import { ArenaRoom } from './ArenaRoom';
import type { ArenaClientMsg } from './protocol';
import { recordArenaMatchFull } from './persist';

const LOOP_MS = 50;
const BROADCAST_EVERY = 2; // loops (≈ 10 Hz)
export const LAG_TICKS = 30; // 0.5 s
const AHEAD_TICKS = 6;
const MAX_TICKS = 10 * 60 * TPS; // safety cap: 10 minutes
const FORFEIT_MS = 30_000;

export class BlocksRoom extends ArenaRoom {
  readonly maxSeats = 2;
  readonly minSeats = 2;
  // generous enough for fast players (≈ 25 actions/s sustained)
  protected readonly bucket = { burst: 60, rate: 30 };
  private games: BlocksGame[] = [];
  private bots = new Map<number, BlocksBot>();
  private acks: number[] = [];
  private seed = 0;
  private playStart = 0;
  private loop: ReturnType<typeof setInterval> | null = null;
  private loops = 0;
  private holes: () => number = Math.random;
  private dirty: boolean[] = [];
  private awaySince: (number | null)[] = [];
  private finished = false;

  protected hasGame() {
    return this.games.length > 0;
  }

  private serverTick() {
    if (this.status !== 'playing') return 0;
    return Math.floor(((Date.now() - this.playStart) * TPS) / 1000);
  }

  protected createGame(seed: number) {
    this.seed = seed;
    this.games = this.seats.map(() => new BlocksGame({ seed, mode: 'versus' }));
    this.acks = this.seats.map(() => 0);
    this.dirty = this.seats.map(() => true);
    this.awaySince = this.seats.map(() => null);
    this.bots.clear();
    this.seats.forEach((s, k) => {
      if (s.bot) this.bots.set(k, new BlocksBot((s.level ?? 'medium') as BlocksLevel, rng(seed + k * 7919)));
    });
    this.holes = rng(seed ^ 0x5bd1e995);
    this.finished = false;
  }

  protected resetGame() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.games = [];
  }

  protected sendState(ws: WebSocket, playerId: string) {
    if (!this.games.length) return;
    this.send(ws, {
      t: 'bstart',
      status: this.status,
      seed: this.seed,
      mySeat: this.seatOf(playerId),
      countdownMs: Math.max(0, this.countdownAt - Date.now()),
      serverTick: this.serverTick(),
      snaps: this.games.map((g) => g.snapshot()),
    });
    this.games.forEach((g, k) => this.send(ws, { t: 'bstate', seat: k, ack: this.acks[k], snap: g.snapshot() }));
  }

  protected onGameMessage(seat: number | null, m: ArenaClientMsg) {
    if (m.t !== 'in' || seat === null || this.status !== 'playing' || this.finished) return;
    const g = this.games[seat];
    if (!g || g.status !== 'playing') return;
    if (!Number.isInteger(m.s) || !Number.isInteger(m.k) || !Number.isInteger(m.a)) return;
    if (m.s <= this.acks[seat]) return; // duplicate / replay
    const action = ACTIONS[m.a];
    if (!action) return;
    this.acks[seat] = m.s;
    const k = Math.max(g.tick, Math.min(m.k, this.serverTick() + AHEAD_TICKS));
    g.advanceTo(k);
    this.collect(seat);
    if (g.status === 'playing') g.input(action);
    this.collect(seat);
    this.dirty[seat] = true;
    this.checkEnd();
  }

  /** route attacks produced by `seat` to the opponent(s) */
  private collect(seat: number) {
    const g = this.games[seat];
    for (const e of g.drainEvents()) {
      if (e.type === 'clear' && e.info.attack > 0) {
        const hole = Math.floor(this.holes() * W);
        this.games.forEach((o, k) => {
          if (k !== seat && o.status === 'playing') {
            o.addGarbage(e.info.attack, hole);
            this.dirty[k] = true;
          }
        });
      }
      if (e.type === 'lock' || e.type === 'garbage_in' || e.type === 'end') this.dirty[seat] = true;
    }
  }

  protected startPlay() {
    this.playStart = Date.now();
    if (this.loop) clearInterval(this.loop);
    this.loop = setInterval(() => this.tick(), LOOP_MS);
  }

  private tick() {
    if (this.status !== 'playing' || this.finished) return;
    const now = this.serverTick();
    this.games.forEach((g, k) => {
      if (g.status !== 'playing') return;
      const bot = this.bots.get(k);
      if (bot) {
        while (g.tick < now && g.status === 'playing') {
          for (const a of bot.update(g)) g.input(a);
          g.step();
          this.collect(k);
        }
        this.dirty[k] = true;
        return;
      }
      const before = g.tick;
      g.advanceTo(now - LAG_TICKS);
      if (g.tick !== before) this.collect(k);
      // disconnected for too long → forfeit
      const s = this.seats[k];
      if (!this.connected(s.playerId)) {
        this.awaySince[k] ??= Date.now();
        if (Date.now() - this.awaySince[k]! > FORFEIT_MS) {
          g.status = 'over';
          g.result = 'topout';
          this.dirty[k] = true;
        }
      } else this.awaySince[k] = null;
    });
    this.loops++;
    if (this.loops % BROADCAST_EVERY === 0) {
      this.games.forEach((g, k) => {
        if (!this.dirty[k] && this.loops % 10 !== 0) return;
        this.dirty[k] = false;
        this.broadcast({ t: 'bstate', seat: k, ack: this.acks[k], snap: g.snapshot() });
      });
    }
    if (now >= MAX_TICKS) {
      // safety cap: the player who sent more garbage wins
      const [a, b] = this.games;
      a.status = b.status = 'over';
      a.result = b.result = 'time';
      return this.finish(a.stats.attack === b.stats.attack ? null : a.stats.attack > b.stats.attack ? 0 : 1, 'time');
    }
    this.checkEnd();
  }

  private checkEnd() {
    if (this.finished) return;
    const over = this.games.map((g) => g.status === 'over');
    if (!over.some(Boolean)) return;
    const alive = over.map((o, k) => (o ? -1 : k)).filter((k) => k >= 0);
    void this.finish(alive.length === 1 ? alive[0] : null, alive.length === 1 ? 'topout' : 'draw');
  }

  private async finish(winner: number | null, reason: string) {
    if (this.finished) return;
    this.finished = true;
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.games.forEach((g, k) => this.broadcast({ t: 'bstate', seat: k, ack: this.acks[k], snap: g.snapshot() }));
    const ticks = Math.max(...this.games.map((g) => g.tick));
    const ranking = winner === null ? [0, 1] : [winner, 1 - winner];
    let res = { recorded: false, ratingChange: null as { old: number; new: number }[] | null };
    try {
      res = await recordArenaMatchFull(this.env, this.meta!, this.seats, {
        winner,
        reason,
        ranking,
        steps: ticks,
        minSteps: 20 * TPS,
        knockout: ticks >= 10 * TPS && reason === 'topout',
        players: this.games.map((g) => ({ score: g.score, kills: 0, len: 0, lines: g.lines, attack: g.stats.attack })),
      });
    } catch (e) {
      console.error('[BlocksRoom] record failed', e);
    }
    this.broadcast({ t: 'end', winner, reason, ranking, recorded: res.recorded, ratingChange: res.ratingChange });
    this.endMatch();
  }
}
