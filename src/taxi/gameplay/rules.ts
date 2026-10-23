// Rush Taxi — the arcade rules, pure and deterministic (seeded), driven one fixed step at a time by the game.
// 50 s on the clock. Passengers wait at the roadside with a coloured ring for how far they want to go (red near,
// yellow middle, green far — farther pays more). Stop in the circle at their feet to pick them up; drive to the
// destination before their own timer runs out: Speedy +5 s, Normal +2 s, Slow +0 s on the clock. Stunts with a
// passenger aboard (drifts, jumps, near misses) build a tip combo; hitting something breaks it. When the clock
// reaches 0 the run ends with total money, rides, best combo and a rank S/A/B/C/D.

export type Band = 'red' | 'yellow' | 'green';
export type Mode = 'arcade' | 'practice';
export interface Spot {
  id: string;
  x: number;
  z: number;
  /** where the person stands (the kerb beside the stop); defaults to the stop itself */
  cx?: number;
  cz?: number;
}
export interface Place extends Spot {
  name: { zh: string; en: string };
}
export interface Passenger {
  id: number;
  stop: Spot;
  dest: Place;
  band: Band;
  dist: number;
  fare: number;
  /** seconds allowed for the ride */
  limit: number;
}
export type Rating = 'speedy' | 'normal' | 'slow';

export const RULES = {
  startTime: 50,
  /** how close (m) and how slow (km/h), for how long (s), to pick up / drop off */
  pickRadius: 4,
  pickKmh: 12,
  pickHold: 0.35,
  dropRadius: 7,
  dropKmh: 18,
  dropHold: 0.25,
  /** distance bands (m) */
  nearMax: 140,
  midMax: 240,
  /** fare: base + per metre; time limit: distance / expected speed + slack */
  fareBase: 10,
  farePerM: 0.25,
  limitSpeed: 13,
  limitSlack: 6,
  /** rating thresholds (share of the limit still left) and clock bonus (s) */
  speedyLeft: 0.5,
  normalLeft: 0.2,
  bonus: { speedy: 5, normal: 2, slow: 0 } as Record<Rating, number>,
  /** tips: base per stunt, multiplier grows with the combo */
  tipBase: 2,
  tipStep: 0.25,
  /** a held drift counts as one stunt per this many seconds; a jump counts when airborne at least this long */
  driftStunt: 1,
  jumpStunt: 0.5,
  bigJump: 1.2,
  /** passengers waiting at once */
  waiting: 5,
  /** ranks by money */
  ranks: [
    ['S', 900],
    ['A', 600],
    ['B', 350],
    ['C', 150],
  ] as [string, number][],
};

export interface RunState {
  mode: Mode;
  phase: 'play' | 'over';
  time: number;
  money: number;
  rides: number;
  ratings: Record<Rating, number>;
  combo: number;
  bestCombo: number;
  tips: number;
  waiting: Passenger[];
  rider: (Passenger & { left: number }) | null;
  /** seconds spent stopped in a pickup / drop circle */
  hold: number;
  driftAcc: number;
  airAcc: number;
  seed: number;
  nextId: number;
  /** total time played (s) and when the first passenger boarded */
  clock: number;
  firstPickupAt: number | null;
}

export type RunEvent =
  | { t: 'pickup'; p: Passenger }
  | { t: 'drop'; p: Passenger; rating: Rating; bonus: number; fare: number }
  | { t: 'timeout'; p: Passenger }
  | { t: 'tip'; amount: number; combo: number; kind: 'drift' | 'jump' | 'near' }
  | { t: 'crash'; combo: number }
  | { t: 'over' };

/** small deterministic random numbers (mulberry32) */
function rnd(s: RunState) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const bandOf = (d: number): Band => (d < RULES.nearMax ? 'red' : d < RULES.midMax ? 'yellow' : 'green');
export const rankOf = (money: number) => RULES.ranks.find(([, m]) => money >= m)?.[0] ?? 'D';
export const tipFor = (combo: number) => Math.round(RULES.tipBase * (1 + combo * RULES.tipStep));

function makePassenger(s: RunState, stops: Spot[], places: Place[], avoid: { x: number; z: number }): Passenger | null {
  const busy = new Set([...s.waiting.map((p) => p.stop.id), ...(s.rider ? [s.rider.stop.id] : [])]);
  const free = stops.filter((st) => !busy.has(st.id) && dist(st, avoid) > 25);
  if (!free.length) return null;
  const stop = free[Math.floor(rnd(s) * free.length)];
  const far = places.filter((pl) => dist(pl, stop) > 60);
  const dest = far[Math.floor(rnd(s) * far.length)];
  const d = dist(stop, dest);
  return { id: s.nextId++, stop, dest, band: bandOf(d), dist: d, fare: Math.round(RULES.fareBase + d * RULES.farePerM), limit: Math.round(d / RULES.limitSpeed + RULES.limitSlack) };
}

export function newRun(mode: Mode, stops: Spot[], places: Place[], car: { x: number; z: number }, seed = 1): RunState {
  const s: RunState = { mode, phase: 'play', time: RULES.startTime, money: 0, rides: 0, ratings: { speedy: 0, normal: 0, slow: 0 }, combo: 0, bestCombo: 0, tips: 0, waiting: [], rider: null, hold: 0, driftAcc: 0, airAcc: 0, seed, nextId: 1, clock: 0, firstPickupAt: null };
  // the first passenger is close and in view, so a first-time player finds one quickly
  const near = [...stops].sort((a, b) => dist(a, car) - dist(b, car)).find((st) => dist(st, car) > 25);
  if (near) {
    const far = places.filter((pl) => dist(pl, near) > 60);
    const dest = far[Math.floor(rnd(s) * far.length)];
    const d = dist(near, dest);
    s.waiting.push({ id: s.nextId++, stop: near, dest, band: bandOf(d), dist: d, fare: Math.round(RULES.fareBase + d * RULES.farePerM), limit: Math.round(d / RULES.limitSpeed + RULES.limitSlack) });
  }
  while (s.waiting.length < RULES.waiting) {
    const p = makePassenger(s, stops, places, car);
    if (!p) break;
    s.waiting.push(p);
  }
  return s;
}

export interface CarNow {
  x: number;
  z: number;
  kmh: number;
  drifting: boolean;
  airborne: boolean;
  /** set on the step the car lands: how long it was in the air (s) */
  landedAfter: number;
  /** a hard hit this step (wall, building) */
  crash: boolean;
  /** a near miss this step (another car brushed past at speed) */
  nearMiss: boolean;
}

/** advance the run by dt; mutates and returns the state plus what happened (for sounds and pop-ups) */
export function tick(s: RunState, dt: number, car: CarNow, stops: Spot[], places: Place[]): RunEvent[] {
  const ev: RunEvent[] = [];
  if (s.phase === 'over') return ev;
  s.clock += dt;
  if (s.mode === 'arcade') {
    s.time = Math.max(0, s.time - dt);
    if (s.time <= 0) {
      s.phase = 'over';
      ev.push({ t: 'over' });
      return ev;
    }
  }
  // crashes break the combo
  if (car.crash && s.combo > 0) {
    ev.push({ t: 'crash', combo: s.combo });
    s.combo = 0;
  }
  // stunts while carrying a passenger
  if (s.rider) {
    const stunt = (kind: 'drift' | 'jump' | 'near', n = 1) => {
      for (let k = 0; k < n; k++) {
        const amount = tipFor(s.combo);
        s.combo++;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        s.tips += amount;
        s.money += amount;
        ev.push({ t: 'tip', amount, combo: s.combo, kind });
      }
    };
    if (car.drifting) {
      s.driftAcc += dt;
      if (s.driftAcc >= RULES.driftStunt) {
        s.driftAcc -= RULES.driftStunt;
        stunt('drift');
      }
    } else s.driftAcc = 0;
    if (car.landedAfter >= RULES.jumpStunt && !car.crash) stunt('jump', car.landedAfter >= RULES.bigJump ? 2 : 1);
    if (car.nearMiss) stunt('near');
    s.rider.left -= dt;
    // arrived?
    if (dist(car, s.rider.dest) < RULES.dropRadius && car.kmh < RULES.dropKmh) {
      s.hold += dt;
      if (s.hold >= RULES.dropHold) {
        const p = s.rider;
        const share = p.left / p.limit;
        const rating: Rating = share > RULES.speedyLeft ? 'speedy' : share > RULES.normalLeft ? 'normal' : 'slow';
        const bonus = RULES.bonus[rating];
        if (s.mode === 'arcade') s.time += bonus;
        s.money += p.fare;
        s.rides++;
        s.ratings[rating]++;
        s.rider = null;
        s.hold = 0;
        ev.push({ t: 'drop', p, rating, bonus, fare: p.fare });
      }
    } else if (s.rider.left <= 0) {
      ev.push({ t: 'timeout', p: s.rider });
      s.rider = null;
      s.hold = 0;
    } else s.hold = 0;
  } else {
    // pick up: stopped (slow) in someone's circle
    const here = s.waiting.find((p) => dist(car, p.stop) < RULES.pickRadius);
    if (here && car.kmh < RULES.pickKmh) {
      s.hold += dt;
      if (s.hold >= RULES.pickHold) {
        s.waiting = s.waiting.filter((p) => p !== here);
        s.rider = { ...here, left: here.limit };
        s.hold = 0;
        s.driftAcc = 0;
        if (s.firstPickupAt === null) s.firstPickupAt = s.clock;
        ev.push({ t: 'pickup', p: here });
      }
    } else s.hold = 0;
  }
  // keep enough people waiting
  while (s.waiting.length < RULES.waiting) {
    const p = makePassenger(s, stops, places, car);
    if (!p) break;
    s.waiting.push(p);
  }
  return ev;
}
