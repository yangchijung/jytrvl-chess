// Client-side model shared by local and online Territory Rush games (rendering, HUD, input).
import { TICK_MS, type Dir, type EndResult, type TerritoryEvent, TerritoryGame } from '../../shared/territory/engine';

export type TStatus = 'connecting' | 'lobby' | 'countdown' | 'playing' | 'ended';

export interface FeedItem {
  id: number;
  at: number;
  ev: TerritoryEvent;
}

export interface EndInfo {
  result: EndResult;
  /** stats saved to the account (online, signed-in) */
  saved?: boolean;
}

export abstract class TerritoryClient {
  game: TerritoryGame | null = null;
  status: TStatus = 'connecting';
  /** player indices controlled from this device (1 normally, 2 in local two-player) */
  me: number[] = [];
  tickMs = TICK_MS;
  lastTickAt = 0;
  countdownEnd = 0;
  /** previous head positions per player (x,y) for interpolation */
  prev = new Float32Array(16);
  /** time each cell was captured (ms, performance.now) for the capture animation */
  captureAt = new Float64Array(0);
  feed: FeedItem[] = [];
  end: EndInfo | null = null;
  /** head screen position of the followed player, written by the renderer (for mouse steering) */
  screenHead: { x: number; y: number; cell: number } | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private feedSeq = 0;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  protected emit() {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  abstract steer(slot: number, d: Dir): void;
  /** called every animation frame */
  abstract update(now: number): void;
  abstract dispose(): void;

  protected resetBuffers(g: TerritoryGame) {
    this.captureAt = new Float64Array(g.w * g.h);
    this.prev = new Float32Array(g.players.length * 2);
    g.players.forEach((p, k) => {
      this.prev[k * 2] = p.x;
      this.prev[k * 2 + 1] = p.y;
    });
  }

  /** Remember positions before applying a tick. */
  protected beforeTick(g: TerritoryGame) {
    if (this.prev.length < g.players.length * 2) this.prev = new Float32Array(g.players.length * 2);
    g.players.forEach((p, k) => {
      this.prev[k * 2] = p.x;
      this.prev[k * 2 + 1] = p.y;
    });
  }

  /** Record visual effects for owner changes and events after a tick. */
  protected afterTick(now: number, ownerChanged: number[], ownerValues: number[], events: TerritoryEvent[]) {
    for (let k = 0; k < ownerChanged.length; k++) if (ownerValues[k] >= 0) this.captureAt[ownerChanged[k]] = now;
    for (const ev of events) {
      if (ev.type === 'death' || (ev.type === 'capture' && (ev.cells ?? 0) >= 40 && this.me.includes(ev.player))) {
        this.feed.push({ id: ++this.feedSeq, at: now, ev });
      }
    }
    if (this.feed.length > 8) this.feed = this.feed.slice(-8);
    this.lastTickAt = now;
  }

  /** Interpolation factor between previous and current tick. */
  frac(now: number): number {
    if (this.status !== 'playing') return 1;
    return Math.max(0, Math.min(1, (now - this.lastTickAt) / this.tickMs));
  }

  remainingSec(): number | null {
    const g = this.game;
    if (!g || !g.cfg.durationTicks) return null;
    return Math.max(0, Math.ceil(((g.cfg.durationTicks - g.tick) * TICK_MS) / 1000));
  }
}
