// Client-side model shared by local and online Snake Arena games (rendering, HUD, input).
import { SnakeGame, type Dir, type SnakeEvent, type SnakeResult } from '../../shared/snake/engine';

export type SStatus = 'connecting' | 'lobby' | 'countdown' | 'playing' | 'paused' | 'ended';

export interface SFeedItem {
  id: number;
  at: number;
  ev: SnakeEvent;
}

export interface SEndInfo {
  result: SnakeResult;
  saved?: boolean;
  /** verified personal record info (solo, signed in) */
  record?: { best: number; bestMs?: number | null; improved: boolean } | null;
}

export abstract class SnakeClient {
  game: SnakeGame | null = null;
  status: SStatus = 'connecting';
  /** snake indices controlled from this device */
  me: number[] = [];
  stepMs = 100;
  lastStepAt = 0;
  countdownEnd = 0;
  /** tail cell removed by the last step per snake (for smooth tail retraction), -1 if none */
  prevTail: number[] = [];
  /** head cell before the last step per snake */
  prevHead: number[] = [];
  /** time each cell was eaten (food pop animation) */
  popAt = new Map<number, number>();
  feed: SFeedItem[] = [];
  end: SEndInfo | null = null;
  /** colour index per snake (custom colours) */
  colors: number[] = [];
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
  abstract update(now: number): void;
  abstract dispose(): void;
  /** local games only */
  canPause(): boolean {
    return false;
  }
  togglePause() {}

  protected beforeStep(g: SnakeGame) {
    this.prevHead = g.snakes.map((s) => s.body[0] ?? -1);
    this.prevTail = g.snakes.map((s) => s.body[s.body.length - 1] ?? -1);
  }

  protected afterStep(now: number, events: SnakeEvent[]) {
    for (const ev of events) {
      if (ev.type === 'eat') this.popAt.set(ev.cell, now);
      if (ev.type === 'death' || (ev.type === 'eat' && ev.gold)) this.feed.push({ id: ++this.feedSeq, at: now, ev });
    }
    if (this.feed.length > 8) this.feed = this.feed.slice(-8);
    this.lastStepAt = now;
  }

  frac(now: number): number {
    if (this.status !== 'playing') return 1;
    return Math.max(0, Math.min(1, (now - this.lastStepAt) / this.stepMs));
  }

  remainingSec(): number | null {
    const g = this.game;
    if (!g || !g.cfg.durationSteps) return null;
    return Math.max(0, Math.ceil(((g.cfg.durationSteps - g.tick) * this.stepMs) / 1000));
  }
}
