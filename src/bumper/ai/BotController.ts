// Crazy Bumper — a simple AI driver (P1): wander about, chase someone (the player a bit more often than the
// others) and bump them, sometimes with a dash, and turn back to the middle when pressed against the rail or
// stuck. P2 adds "chase the leader" and "grab boxes / stars" as more states with the same output.
import { ARENA } from '../entities/Arena';
import type { DriveInput } from '../entities/BumperCar';

export type BotState = 'wander' | 'chase' | 'escape';

export interface CarView {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}
export interface SelfView extends CarView {
  yaw: number;
  cooldown: number;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BOT = {
  /** start turning back when this close to the rail (car centre radius) */
  wallRadius: ARENA.radius - 4.5,
  /** "stuck": pushing but slower than this (u/s) for stuckTime seconds */
  stuckSpeed: 2.5,
  stuckTime: 0.6,
  escapeTime: 0.9,
  thrust: { wander: 0.7, chase: 0.9, escape: 1 },
  /** dash when facing the target this well and this close */
  dashAlign: 0.96,
  dashRange: 11,
} as const;

export class BotController {
  state: BotState = 'wander';
  private timer = 0;
  private stuck = 0;
  private goal = { x: 0, z: 0 };
  private targetId = -1;
  private rnd: () => number;

  constructor(
    seed: number,
    /** the id that gets chased more often (the player) */
    private prefer = 0,
  ) {
    this.rnd = mulberry32(seed);
    this.pickWander();
  }

  get target() {
    return this.state === 'chase' ? this.targetId : -1;
  }

  private pickWander() {
    const a = this.rnd() * Math.PI * 2,
      r = 4 + this.rnd() * 12;
    this.goal = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    this.state = 'wander';
    this.timer = 1.2 + this.rnd() * 1.8;
  }

  private pickChase(self: SelfView, others: CarView[]) {
    if (!others.length) return this.pickWander();
    // weights: the player ×2, nearer cars a little more
    const w = others.map((o) => (o.id === this.prefer ? 2 : 1) / (1 + Math.hypot(o.x - self.x, o.z - self.z) / 25));
    let r = this.rnd() * w.reduce((a, b) => a + b, 0);
    let pick = others[0];
    for (let i = 0; i < others.length; i++) {
      r -= w[i];
      if (r <= 0) {
        pick = others[i];
        break;
      }
    }
    this.targetId = pick.id;
    this.state = 'chase';
    this.timer = 2.2 + this.rnd() * 2.3;
  }

  private escape(self: SelfView) {
    // back towards the middle, with a random sideways offset so bots do not all meet in the centre
    const a = this.rnd() * Math.PI * 2;
    this.goal = { x: Math.cos(a) * 5 - self.x * 0.1, z: Math.sin(a) * 5 - self.z * 0.1 };
    this.state = 'escape';
    this.timer = BOT.escapeTime;
    this.stuck = 0;
  }

  /** one decision per fixed step */
  decide(self: SelfView, others: CarView[], dt: number): DriveInput {
    this.timer -= dt;
    const speed = Math.hypot(self.vx, self.vz);
    const r = Math.hypot(self.x, self.z);
    const fx = Math.sin(self.yaw),
      fz = Math.cos(self.yaw);
    // facing out towards the rail while close to it
    const outward = r > 0.01 ? (fx * self.x + fz * self.z) / r : 0;
    if (this.state !== 'escape') {
      this.stuck = speed < BOT.stuckSpeed ? this.stuck + dt : 0;
      if ((r > BOT.wallRadius && outward > 0.25) || this.stuck > BOT.stuckTime) this.escape(self);
    }
    if (this.timer <= 0) {
      if (this.state === 'chase' || this.state === 'escape') this.pickWander();
      else this.pickChase(self, others);
    }
    let gx = this.goal.x,
      gz = this.goal.z;
    if (this.state === 'chase') {
      const t = others.find((o) => o.id === this.targetId);
      if (!t) this.pickWander();
      else {
        gx = t.x + t.vx * 0.3;
        gz = t.z + t.vz * 0.3;
      }
    } else if (this.state === 'wander' && Math.hypot(gx - self.x, gz - self.z) < 3) {
      this.pickWander();
      gx = this.goal.x;
      gz = this.goal.z;
    }
    const dx = gx - self.x,
      dz = gz - self.z;
    const d = Math.hypot(dx, dz) || 1;
    const align = (dx * fx + dz * fz) / d;
    const dash = this.state === 'chase' && self.cooldown === 0 && align > BOT.dashAlign && d < BOT.dashRange && this.rnd() < 0.08;
    return { x: dx / d, z: dz / d, thrust: BOT.thrust[this.state], dash };
  }
}
