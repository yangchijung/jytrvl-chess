// Crazy Bumper — round rules (spec 7). The 60 s round clock (?round= shortens it), collision and dash counters,
// and the star rules, kept free of rendering so they are unit-tested:
//  1. an active bump on another car above the speed threshold: +1 star for the bumper (flies to the scoreboard)
//  2. a dash or giant bump knocks 3 big stars out of the victim onto the floor (anyone can collect them)
//  3. combo: bumping different cars within 3 s shows ⭐x2! / ⭐x3! and pays extra: x2 +1 star, x3 +2 stars (James 2026-10-23)
//  4. the car with the most stars wears the crown; bumping the crowned car knocks out 2 extra stars
//  5. a victim loses at most 2 stars per hit and never goes below 0
//  A shielded car is never knocked out; the shield takes the hit (3 hits or 6 s).
import { STAR_DROP, type StarEvent } from '../entities/StarDropManager';

export type Phase = 'title' | 'playing' | 'result';
export type Body = { kind: 'car'; i: number } | { kind: 'post'; i: number } | { kind: 'wall' };

export type RoundEvent =
  | { t: 'second'; left: number }
  | { t: 'end' }
  /** +1 star for `car` (an active bump or a pick-up) */
  | { t: 'star'; car: number; total: number; x: number; z: number; pickup?: boolean }
  /** `victim` loses `loss` stars and `drop` big stars fly out onto the floor */
  | { t: 'knock'; victim: number; attacker: number; drop: number; loss: number; heavy: boolean; x: number; z: number }
  /** the attacker's bump hit a shield: no score; the shield bounces the attacker off */
  | { t: 'shield'; victim: number; attacker: number; x: number; z: number }
  | { t: 'combo'; car: number; n: number; bonus: number; total: number }
  | { t: 'crown'; car: number };

export const RULES = {
  roundSeconds: 60,
  /** last seconds where the clock jumps and the music speeds up */
  hurry: 10,
  beepFrom: 5,
  /** closing speed (u/s) for a bump to score */
  starSpeed: 5,
  /** the same two things touching again within this time is the same collision */
  pairGap: 0.35,
  comboWindow: 3,
  heavyDrop: STAR_DROP.heavyHit,
  crownBonus: STAR_DROP.crownBonus,
  maxLoss: STAR_DROP.maxLoss,
  /** trophy stars on the result screen: 1 for everyone, 2 and 3 for more stars */
  trophy2: 6,
  trophy3: 14,
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

/** what each car is doing at the moment of a hit */
export interface HitContext {
  dashing: readonly boolean[];
  giant: readonly boolean[];
  shielded: readonly boolean[];
}
const NONE: HitContext = { dashing: [], giant: [], shielded: [] };

const key = (b: Body) => (b.kind === 'wall' ? 'w' : `${b.kind[0]}${b.i}`);

export class ScoreManager {
  phase: Phase = 'title';
  roundLength: number = RULES.roundSeconds;
  timeLeft: number = RULES.roundSeconds;
  totalCollisions = 0;
  dashCount = 0;
  scores = [0, 0, 0, 0];
  /** the crowned car (-1 = nobody has a star yet) */
  crown = -1;
  private clock = 0;
  private lastSecond = 0;
  private pairs = new Map<string, number>();
  private comboHits: { victim: number; t: number }[] = [];
  private comboShown = 1;

  constructor(
    roundLength?: number,
    private player = 0,
  ) {
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
    this.crown = -1;
    this.pairs.clear();
    this.comboHits = [];
    this.comboShown = 1;
  }

  toTitle() {
    this.phase = 'title';
    this.timeLeft = this.roundLength;
    this.crown = -1;
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

  /** a new impact during the round */
  collision(imp: Impact, ctx: HitContext = NONE): RoundEvent[] {
    if (this.phase !== 'playing') return [];
    const isPlayer = (b: Body) => b.kind === 'car' && b.i === this.player;
    if (isPlayer(imp.a) || isPlayer(imp.b)) this.totalCollisions++;
    if (imp.a.kind !== 'car' || imp.b.kind !== 'car' || imp.speed < RULES.starSpeed) return [];
    const aBumps = imp.pushA >= imp.pushB;
    const attacker = aBumps ? imp.a.i : imp.b.i;
    const victim = aBumps ? imp.b.i : imp.a.i;
    const ev: RoundEvent[] = [];
    if (ctx.shielded[victim]) {
      ev.push({ t: 'shield', victim, attacker, x: imp.x, z: imp.z });
      return ev;
    }
    this.scores[attacker]++;
    ev.push({ t: 'star', car: attacker, total: this.scores[attacker], x: imp.x, z: imp.z });
    if (attacker === this.player) {
      const c = this.combo(victim);
      if (c && c.t === 'combo') {
        // the combo pays: one extra star at x2, two at x3
        this.scores[attacker] += c.bonus;
        c.total = this.scores[attacker];
        ev.push(c);
      }
    }
    const heavy = !!(ctx.dashing[attacker] || ctx.giant[attacker]);
    const crowned = victim === this.crown;
    const drop = (heavy ? RULES.heavyDrop : 0) + (crowned ? RULES.crownBonus : 0);
    if (drop > 0) {
      const loss = Math.min(RULES.maxLoss, this.scores[victim]);
      this.scores[victim] -= loss;
      ev.push({ t: 'knock', victim, attacker, drop, loss, heavy, x: imp.x, z: imp.z });
    }
    this.updateCrown(ev);
    return ev;
  }

  /** bumping different cars within the combo window: x2, then x3 */
  private combo(victim: number): RoundEvent | null {
    const now = this.clock;
    this.comboHits = this.comboHits.filter((h) => now - h.t <= RULES.comboWindow);
    if (!this.comboHits.length) this.comboShown = 1;
    this.comboHits.push({ victim, t: now });
    const n = new Set(this.comboHits.map((h) => h.victim)).size;
    if (n > this.comboShown) {
      this.comboShown = n;
      if (n >= 3) this.comboHits = [];
      return { t: 'combo', car: this.player, n, bonus: n - 1, total: 0 };
    }
    return null;
  }

  private updateCrown(ev: RoundEvent[]) {
    const max = Math.max(...this.scores);
    let next = this.crown;
    if (max <= 0) next = -1;
    else if (this.crown < 0 || this.scores[this.crown] < max) next = this.scores.indexOf(max);
    if (next !== this.crown) {
      this.crown = next;
      if (next >= 0) ev.push({ t: 'crown', car: next });
    }
  }

  dash(car: number) {
    if (this.phase === 'playing' && car === this.player) this.dashCount++;
  }

  /** stars picked up from the floor (and any other change), never below 0 */
  onStarEvent(e: StarEvent): RoundEvent[] {
    if (this.phase !== 'playing') return [];
    this.scores[e.car] = Math.max(0, this.scores[e.car] + e.delta);
    const ev: RoundEvent[] = [];
    if (e.delta > 0) ev.push({ t: 'star', car: e.car, total: this.scores[e.car], x: e.x, z: e.z, pickup: true });
    this.updateCrown(ev);
    return ev;
  }

  trophies(score = this.scores[this.player]): 1 | 2 | 3 {
    return score >= RULES.trophy3 ? 3 : score >= RULES.trophy2 ? 2 : 1;
  }
}
