// Crazy Bumper — P2 placeholder: stars knocked out of a car by a dash / giant hit (spec 7.1 rules 2, 4, 5),
// bouncing on the floor for 8 s and picked up by any car, magnet pull (15 m). P1 only fixes the interface so the
// game loop and ScoreManager already have the calls in place; the P1 implementation does nothing.

/** a change to one car's star count (+ pick-up, − knocked out; ScoreManager keeps it at 0 or above) */
export interface StarEvent {
  car: number;
  delta: number;
  x: number;
  z: number;
}

export interface StarDropConfig {
  /** stars knocked out by a dash or giant hit */
  heavyHit: number;
  /** extra stars when the crowned leader is hit */
  crownBonus: number;
  /** most stars a car can lose in one hit */
  maxLoss: number;
  /** how long a dropped star stays on the floor (s) */
  floorLife: number;
  magnetRadius: number;
}

export const STAR_DROP: StarDropConfig = { heavyHit: 3, crownBonus: 2, maxLoss: 2, floorLife: 8, magnetRadius: 15 };

export interface CarPos {
  x: number;
  z: number;
  /** star magnet active (P2 power-up) */
  magnet: boolean;
}

export class StarDropManager {
  readonly config = STAR_DROP;
  /** stars currently lying on the floor */
  get count(): number {
    return 0;
  }
  /** a heavy hit on `victim` at (x, z): P2 drops stars and returns the loss for the victim */
  knockOut(_victim: number, _x: number, _z: number, _crowned: boolean): StarEvent[] {
    return [];
  }
  /** one fixed step: stars bounce, fade and get collected; P2 returns the pick-ups */
  update(_dt: number, _cars: CarPos[]): StarEvent[] {
    return [];
  }
  clear(): void {}
}
