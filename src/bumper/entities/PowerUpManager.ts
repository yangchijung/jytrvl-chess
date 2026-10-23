// Crazy Bumper — P2 placeholder: gift boxes every 6 s (at most 2 on the floor) and the three zero-text
// power-ups (spec 6). P1 fixes the interface and the numbers; the P1 implementation never spawns anything and
// every car keeps the base physics (BumperCar's CAR constants).

export type PowerUpKind = 'giant' | 'shield' | 'magnet';

export interface PowerUpSpec {
  kind: PowerUpKind;
  /** seconds the effect lasts */
  duration: number;
}

export const POWER_UPS: Record<PowerUpKind, PowerUpSpec & Record<string, number | string>> = {
  /** grows to 1.6× in 0.3 s, mass 350 kg, knock-back ×2.2 */
  giant: { kind: 'giant', duration: 7, scale: 1.6, growTime: 0.3, mass: 350, knockback: 2.2 },
  /** four spinning spring balls, ring restitution 1.6, blocks 3 hits */
  shield: { kind: 'shield', duration: 6, restitution: 1.6, hits: 3 },
  /** pulls floor stars within 15 m */
  magnet: { kind: 'magnet', duration: 8, radius: 15 },
};

export const BOXES = { every: 6, maxOnFloor: 2 } as const;

/** what a car currently has (one at a time; a new one replaces the old) */
export interface ActivePowerUp {
  kind: PowerUpKind;
  left: number;
}

export interface PowerUpEvent {
  t: 'spawn' | 'pickup' | 'expire';
  car?: number;
  kind?: PowerUpKind;
  x: number;
  z: number;
}

export class PowerUpManager {
  readonly active: (ActivePowerUp | null)[];
  constructor(cars: number) {
    this.active = Array.from({ length: cars }, () => null);
  }
  /** one fixed step; P2 spawns boxes, detects pick-ups and counts down effects */
  update(_dt: number, _cars: { x: number; z: number }[]): PowerUpEvent[] {
    return [];
  }
  /** the player's power-up for window.__GAME_STATS__.activePowerUp */
  activeFor(car: number): PowerUpKind | null {
    return this.active[car]?.kind ?? null;
  }
  clear(): void {
    this.active.fill(null);
  }
}
