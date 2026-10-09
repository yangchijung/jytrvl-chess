// Client-side session model for Block Puzzle Battle (local and online share rendering and input).
import { BlocksGame, type Action, type BlocksEvent, type ClearInfo } from '../../shared/blocks/engine';

export type BStatus = 'connecting' | 'lobby' | 'countdown' | 'playing' | 'paused' | 'ended';

export interface BPlayer {
  game: BlocksGame;
  name: string;
  color: number;
  /** controlled from this device (keymap slot), or -1 */
  slot: number;
  /** rows being cleared (for the flash animation) and when */
  flashRows: number[];
  flashAt: number;
  /** last clear popup */
  popup: { info: ClearInfo; at: number } | null;
  garbageAt: number;
  connected?: boolean;
  rating?: number;
}

export interface BEnd {
  winner: number | null;
  reason: string;
  /** solo results */
  solo?: { score: number; lines: number; seconds: number; result: string };
  record?: { best: number; bestMs?: number | null; improved: boolean } | null;
  saved?: boolean;
  ratingChange?: { old: number; new: number }[] | null;
}

export abstract class BlocksSession {
  players: BPlayer[] = [];
  status: BStatus = 'connecting';
  countdownEnd = 0;
  end: BEnd | null = null;
  version = 0;
  /** events for sounds (consumed by the UI) */
  sounds: { kind: 'drop' | 'clear' | 'big' | 'hold' | 'garbage' | 'level'; at: number; player: number }[] = [];
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  protected emit() {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  /** apply a control action for the player bound to `slot` */
  abstract input(slot: number, a: Action): void;
  abstract update(now: number): void;
  abstract dispose(): void;
  canPause() {
    return false;
  }
  togglePause() {}

  protected newPlayer(game: BlocksGame, name: string, color: number, slot: number): BPlayer {
    return { game, name, color, slot, flashRows: [], flashAt: 0, popup: null, garbageAt: 0 };
  }

  /** turn engine events into animations / sounds */
  protected absorb(p: BPlayer, idx: number, events: BlocksEvent[], now: number) {
    for (const e of events) {
      if (e.type === 'lock') this.sounds.push({ kind: 'drop', at: now, player: idx });
      if (e.type === 'clear') {
        p.flashRows = e.rows;
        p.flashAt = now;
        p.popup = { info: e.info, at: now };
        this.sounds.push({ kind: e.info.lines >= 4 || e.info.tspin !== 'none' || e.info.perfect ? 'big' : 'clear', at: now, player: idx });
      }
      if (e.type === 'hold') this.sounds.push({ kind: 'hold', at: now, player: idx });
      if (e.type === 'garbage_in') {
        p.garbageAt = now;
        this.sounds.push({ kind: 'garbage', at: now, player: idx });
      }
      if (e.type === 'level') this.sounds.push({ kind: 'level', at: now, player: idx });
    }
    if (this.sounds.length > 20) this.sounds = this.sounds.slice(-20);
  }
}
