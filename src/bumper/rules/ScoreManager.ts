// Crazy Bumper — round rules. P1: the 60 s round clock (?round= shortens it), collision and dash counters, and a
// simple star per hard bump the player lands on an AI car (spec 7.1 rule 1, without stars on the floor yet).
// P2 hooks: onStarEvent() receives StarDropManager results; combo, crown and the "lose at most 2" floor go here.
import type { StarEvent } from '../entities/StarDropManager';

export type Phase = 'title' | 'playing' | 'result';
export type Body = { kind: 'car'; i: number } | { kind: 'post'; i: number } | { kind: 'wall' };

export type RoundEvent =
  | { t: 'second'; left: number }
  | { t: 'end' }
  | { t: 'star'; car: number; total: number; x: number; z: number };

export const RULES = {
  roundSeconds: 60,
  /** last seconds that beep and make the clock jump */
  hurry: 10,
  beepFrom: 5,
  /** closing speed (u/s) for a bump to earn a star */
  starSpeed: 5,
  /** the same two things touching again within this time is the same collision */
  pairGap: 0.35,
  /** trophy stars on the result screen: 1 for everyone, 2 and 3 for more stars */
  trophy2: 5,
  trophy3: 12,
} as const;

export interface Impact {
  a: Body;
  b: Body;
  /** closing speed along the line between them (u/s) */
  speed: number;
  /** how fast each car was moving towards the other just before (u/s); the faster one is the bumper */
  pushA: number;
  pushB: number;
  x: number;
  z: number;
}

const key = (b: Body) => (b.kind === 'wall' ? 'w' : `${b.kind[0]}${b.i}`);

export class ScoreManager {
  phase: Phase = 'title';
  roundLength: number = RULES.roundSeconds;
  timeLeft: number = RULES.roundSeconds;
  totalCollisions = 0;
  dashCount = 0;
  scores = [0, 0, 0, 0];
  private clock = 0;
  private lastSecond = 0;
  private pairs = new Map<string, number>();

  constructor(roundLength?: number) {
    if (roundLength && roundLength > 0) this.roundLength = roundLength;
    this.timeLeft = this.roundLength;
  }

  start() {
    this.phase = 'playing';
    this.timeLeft = this.roundLength;
    this.lastSecond = Math.ceil(this.roundLength);
    this.totalCollisions = 0;
    this.dashCount = 0;
    this.scores = this.scores.map(() => 0);
    this.pairs.clear();
  }

  toTitle() {
    this.phase = 'title';
    this.timeLeft = this.roundLength;
  }

  /** advance the round clock by one fixed step */
  tick(dt: number): RoundEvent[] {
    this.clock += dt;
    if (this.phase !== 'playing') return [];
    const ev: RoundEvent[] = [];
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const s = Math.ceil(this.timeLeft);
    if (s < this.lastSecond) {
      this.lastSecond = s;
      ev.push({ t: 'second', left: s });
    }
    if (this.timeLeft === 0) {
      this.phase = 'result';
      ev.push({ t: 'end' });
    }
    return ev;
  }

  /** returns false when this pair is still in the same collision (no new count, no new sound) */
  isNew(imp: Impact): boolean {
    const k = [key(imp.a), key(imp.b)].sort().join('|');
    const at = this.pairs.get(k);
    if (at !== undefined && this.clock - at < RULES.pairGap) return false;
    this.pairs.set(k, this.clock);
    return true;
  }

  /** a new impact involving the player during the round counts; a hard bump on an AI car earns a star */
  collision(imp: Impact, player = 0): RoundEvent[] {
    if (this.phase !== 'playing') return [];
    const involves = (b: Body) => b.kind === 'car' && b.i === player;
    if (!involves(imp.a) && !involves(imp.b)) return [];
    this.totalCollisions++;
    if (imp.a.kind === 'car' && imp.b.kind === 'car' && imp.speed >= RULES.starSpeed) {
      const meIsA = imp.a.i === player;
      const mine = meIsA ? imp.pushA : imp.pushB;
      const theirs = meIsA ? imp.pushB : imp.pushA;
      if (mine >= theirs) {
        this.scores[player]++;
        return [{ t: 'star', car: player, total: this.scores[player], x: imp.x, z: imp.z }];
      }
    }
    return [];
  }

  dash(car: number, player = 0) {
    if (this.phase === 'playing' && car === player) this.dashCount++;
  }

  /** P2: stars picked up from the floor, stolen, lost (never below 0) */
  onStarEvent(e: StarEvent) {
    this.scores[e.car] = Math.max(0, this.scores[e.car] + e.delta);
  }

  trophies(score = this.scores[0]): 1 | 2 | 3 {
    return score >= RULES.trophy3 ? 3 : score >= RULES.trophy2 ? 2 : 1;
  }
}
