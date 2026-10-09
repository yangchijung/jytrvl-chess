// Online Block Puzzle Battle client.
// Your own board is predicted locally (inputs apply instantly) and reconciled with the authoritative
// BlocksRoom: each server state for your seat is taken as the truth, your not-yet-acknowledged inputs
// are re-applied on top (rollback), and the result replaces the local prediction. Opponent boards are
// shown exactly as the server reports them.
import { BlocksGame, ACTIONS, TPS, type Action, type BlocksSnapshot } from '../../shared/blocks/engine';
import type { ArenaServerMsg } from '../../realtime/src/arena/protocol';
import { ArenaSocket } from '../arena/socket';
import { BlocksSession, type BPlayer } from './session';

interface Pending {
  s: number;
  k: number;
  a: Action;
}

export class OnlineBlocks extends BlocksSession {
  readonly sock: ArenaSocket;
  mySeat: number | null = null;
  recorded = false;
  /** performance.now() at server tick 0 */
  private clock0 = 0;
  private seq = 0;
  private pending: Pending[] = [];
  /** number of rollbacks that changed the prediction (diagnostics / tests) */
  corrections = 0;

  constructor(path: string, name: string) {
    super();
    this.sock = new ArenaSocket(
      path,
      name,
      (m) => this.onMessage(m),
      () => this.emit(),
    );
  }

  private me(): BPlayer | null {
    return this.mySeat !== null ? this.players[this.mySeat] ?? null : null;
  }

  private onMessage(m: ArenaServerMsg) {
    const now = performance.now();
    switch (m.t) {
      case 'lobby':
        if (m.status === 'lobby') {
          this.status = 'lobby';
          this.players = [];
          this.end = null;
        } else if (m.status === 'playing' && this.status === 'countdown') this.status = 'playing';
        this.mySeat = m.mySeat;
        m.seats.forEach((s, k) => {
          const p = this.players[k];
          if (p) {
            p.connected = s.connected;
            p.rating = s.rating;
          }
        });
        break;
      case 'bstart': {
        this.mySeat = m.mySeat;
        const names = this.sock.lobby?.seats ?? [];
        this.players = m.snaps.map((s, k) => {
          const p = this.newPlayer(BlocksGame.fromSnapshot(s), names[k]?.name ?? `P${k + 1}`, k === 0 ? 0 : 2, k === m.mySeat ? 0 : -1);
          p.rating = names[k]?.rating;
          return p;
        });
        this.pending = [];
        this.seq = 0;
        // align the local clock with the server (half the round trip as latency estimate)
        const latency = this.sock.rtt / 2;
        if (m.status === 'countdown') {
          this.status = 'countdown';
          this.countdownEnd = now + m.countdownMs - latency;
          this.clock0 = this.countdownEnd;
        } else {
          this.status = m.status === 'ended' ? 'ended' : 'playing';
          this.clock0 = now - ((m.serverTick * 1000) / TPS + latency);
        }
        break;
      }
      case 'bstate': {
        const p = this.players[m.seat];
        if (!p) return;
        if (m.seat === this.mySeat && this.status !== 'ended') this.reconcile(p, m.snap, m.ack, now);
        else {
          const before = p.game;
          p.game = BlocksGame.fromSnapshot(m.snap);
          // animations for opponents: detect line clears / garbage from counters
          if (p.game.lines > before.lines) {
            p.flashAt = now;
            p.popup = { info: { lines: p.game.lines - before.lines, tspin: 'none', b2b: false, combo: Math.max(0, p.game.combo), perfect: false, points: p.game.score - before.score, attack: 0 }, at: now };
          }
          if (p.game.stats.garbageReceived > before.stats.garbageReceived) p.garbageAt = now;
        }
        break;
      }
      case 'end':
        this.status = 'ended';
        this.end = { winner: m.winner, reason: m.reason, ratingChange: m.ratingChange ?? null, saved: m.recorded };
        this.recorded = m.recorded;
        break;
      default:
        return;
    }
    this.emit();
  }

  /** rollback: server state + unacknowledged inputs, fast-forwarded to the local tick */
  private reconcile(p: BPlayer, snap: BlocksSnapshot, ack: number, now: number) {
    this.pending = this.pending.filter((x) => x.s > ack);
    const g = BlocksGame.fromSnapshot(snap);
    for (const x of this.pending) {
      g.advanceTo(Math.max(g.tick, x.k));
      if (g.status !== 'playing') break;
      g.input(x.a);
    }
    g.advanceTo(p.game.tick);
    g.drainEvents();
    if (g.hash() !== p.game.hash() || g.pendingGarbageLines() !== p.game.pendingGarbageLines() || g.status !== p.game.status) {
      // the server state differs from our prediction (e.g. garbage arrived): adopt it
      if (g.stats.garbageReceived > p.game.stats.garbageReceived) p.garbageAt = now;
      p.game = g;
      this.corrections++;
    }
  }

  private localTick(now: number) {
    return Math.max(0, Math.floor(((now - this.clock0) * TPS) / 1000));
  }

  input(slot: number, a: Action) {
    if (this.status !== 'playing' || slot !== 0) return;
    const p = this.me();
    if (!p || p.game.status !== 'playing') return;
    const g = p.game;
    if (!(g.input(a) || a === 'SD0' || a === 'SD1')) return;
    const x: Pending = { s: ++this.seq, k: g.tick, a };
    this.pending.push(x);
    this.sock.send({ t: 'in', s: x.s, k: x.k, a: ACTIONS.indexOf(a) });
    this.absorb(p, this.mySeat!, g.drainEvents(), performance.now());
    this.emit();
  }

  update(now: number) {
    if (this.status === 'countdown' && now >= this.countdownEnd) {
      this.status = 'playing';
      this.emit();
    }
    if (this.status !== 'playing') return;
    const p = this.me();
    if (!p || p.game.status !== 'playing') return;
    const target = this.localTick(now);
    const g = p.game;
    if (g.tick >= target) return;
    let n = 0;
    while (g.tick < target && g.status === 'playing' && n++ < 30) {
      g.step();
      this.absorb(p, this.mySeat!, g.drainEvents(), now);
    }
    this.emit();
  }

  dispose() {
    this.sock.dispose();
  }
}
