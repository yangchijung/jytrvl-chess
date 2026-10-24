// Rush Taxi — people on the pavements. They stroll around the blocks; when the taxi comes at them they hop out of
// the way, and if it still brushes one they only sit down with a bump and get back up. Nobody is ever hurt: they
// have no physics body at all (a family game). Drawn as three instanced meshes (legs, shirts, heads).
// On the real map the loops are the sidewalks round the blocks (polylines), and people live near the taxi only:
// someone it left far behind comes back on a sidewalk somewhere around it.
import * as THREE from 'three';
import type { Walk } from './level';
import type { TaxiNow } from './traffic';

const SHIRTS = ['#1E88E5', '#8E24AA', '#F4511E', '#00897B', '#FDD835', '#E91E63', '#3949AB', '#7CB342', '#FF7043'];
const SKIN = ['#F1C9A5', '#E0AC7E', '#C68B59', '#8D5A3B'];

interface Person {
  walk: Walk;
  s: number; // distance along the loop
  dir: 1 | -1;
  speed: number;
  /** extra offset from the walk line after hopping aside, eased back to 0 */
  ox: number;
  oz: number;
  hop: number; // seconds into a hop (0 = not hopping)
  hx: number;
  hz: number;
  sit: number; // seconds left sitting
  x: number;
  z: number;
  y: number;
  yaw: number;
  shirt: THREE.Color;
  skin: THREE.Color;
}
export type PeopleEvent = { t: 'hop' } | { t: 'bump' };

/** distances along a polyline loop (cached per walk) */
const CUM = new WeakMap<Walk, Float64Array>();
function loopCum(w: Walk) {
  let c = CUM.get(w);
  if (!c) {
    const P = w.loop!;
    c = new Float64Array(P.length + 1);
    for (let i = 0; i < P.length; i++) {
      const a = P[i],
        b = P[(i + 1) % P.length];
      c[i + 1] = c[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    CUM.set(w, c);
  }
  return c;
}
/** the length of a walk's loop */
export function loopLength(w: Walk) {
  return w.loop ? loopCum(w)[w.loop.length] : w.h * 8;
}
/** a point on the square loop of half size h around (cx, cz) (or on the polyline loop), and the walking direction there */
export function onLoop(w: Walk, s: number) {
  if (w.loop) {
    const c = loopCum(w),
      P = w.loop;
    const L = c[P.length] || 1;
    const d = ((s % L) + L) % L;
    let lo = 0,
      hi = P.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (c[m] <= d) lo = m;
      else hi = m - 1;
    }
    const a = P[lo],
      b = P[(lo + 1) % P.length];
    const seg = c[lo + 1] - c[lo] || 1;
    const t = (d - c[lo]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / seg, uz: (b[1] - a[1]) / seg };
  }
  const L = w.h * 8;
  let d = ((s % L) + L) % L;
  const side = Math.floor(d / (w.h * 2));
  d -= side * w.h * 2;
  const t = d - w.h;
  // sides: south (−z) going +x, east going +z, north going −x, west going −z
  if (side === 0) return { x: w.cx + t, z: w.cz - w.h, ux: 1, uz: 0 };
  if (side === 1) return { x: w.cx + w.h, z: w.cz + t, ux: 0, uz: 1 };
  if (side === 2) return { x: w.cx - t, z: w.cz + w.h, ux: -1, uz: 0 };
  return { x: w.cx - w.h, z: w.cz - t, ux: 0, uz: -1 };
}

export class People {
  list: Person[] = [];
  private legs: THREE.InstancedMesh;
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private seed: number;

  private walks: Walk[];
  /** the real map: people stay around the taxi (start around this point) */
  private local: boolean;

  constructor(scene: THREE.Scene, walks: Walk[], count: number, seed = 11, around?: { x: number; z: number }) {
    this.seed = seed;
    this.walks = walks;
    this.local = !!around;
    const mat = () => new THREE.MeshLambertMaterial({ flatShading: true });
    this.legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.8, 0.3).translate(0, 0.4, 0), new THREE.MeshLambertMaterial({ color: '#37474F', flatShading: true }), count);
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.72, 0.36).translate(0, 1.16, 0), mat(), count);
    this.head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.25, 1).translate(0, 1.78, 0), mat(), count);
    // the real map: no shadows (three draw calls fewer in the shadow pass, the budget for the big city)
    for (const m of [this.legs, this.body, this.head]) m.castShadow = !around;
    scene.add(this.legs, this.body, this.head);
    for (let i = 0; i < count && walks.length; i++) {
      const walk = walks[Math.floor(this.rnd() * walks.length)];
      this.list.push({ walk, s: this.rnd() * loopLength(walk), dir: this.rnd() < 0.5 ? 1 : -1, speed: 1 + this.rnd() * 0.7, ox: 0, oz: 0, hop: 0, hx: 0, hz: 0, sit: 0, x: 0, z: 0, y: 0, yaw: 0, shirt: new THREE.Color(SHIRTS[i % SHIRTS.length]), skin: new THREE.Color(SKIN[Math.floor(this.rnd() * SKIN.length)]) });
      if (around) this.place(this.list[i], around, 0, 140);
    }
    this.update(0, null);
  }
  private rnd() {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** put someone on a sidewalk loop that passes between rMin and rMax from c */
  private place(p: Person, c: { x: number; z: number }, rMin: number, rMax: number, taxi?: TaxiNow) {
    const near = this.walks.filter((w) => {
      const d = Math.hypot(w.cx - c.x, w.cz - c.z);
      return d < rMax + 120 && d > rMin - 200;
    });
    const pool = near.length ? near : this.walks;
    for (let k = 0; k < 16; k++) {
      const w = pool[Math.floor(this.rnd() * pool.length)];
      const s = this.rnd() * loopLength(w);
      const at = onLoop(w, s);
      const d = Math.hypot(at.x - c.x, at.z - c.z);
      if ((d < rMin || d > rMax) && k < 15) continue;
      // not popping up right in front of a moving taxi
      const sp = taxi ? Math.hypot(taxi.vx, taxi.vz) : 0;
      if (taxi && sp > 2 && ((at.x - c.x) * taxi.vx + (at.z - c.z) * taxi.vz) / (sp * d) > 0.6 && k < 12) continue;
      p.walk = w;
      p.s = s;
      p.ox = p.oz = p.hop = p.sit = p.y = 0;
      p.x = at.x;
      p.z = at.z;
      return;
    }
  }

  update(dt: number, taxi: TaxiNow | null): PeopleEvent[] {
    const ev: PeopleEvent[] = [];
    const sp = taxi ? Math.hypot(taxi.vx, taxi.vz) : 0;
    let moved = 0;
    for (const p of this.list) {
      // the real map: someone left far behind comes back on a sidewalk around the taxi (a few per step)
      if (this.local && taxi && moved < 3 && Math.hypot(p.x - taxi.x, p.z - taxi.z) > 160) {
        moved++;
        this.place(p, taxi, 55, 140, taxi);
      }
      if (p.sit > 0) {
        p.sit = Math.max(0, p.sit - dt);
        continue;
      }
      if (p.hop > 0) {
        p.hop += dt;
        const k = Math.min(1, p.hop / 0.45);
        p.ox += p.hx * dt / 0.45;
        p.oz += p.hz * dt / 0.45;
        p.y = Math.sin(k * Math.PI) * 0.9;
        if (k >= 1) (p.hop = 0), (p.y = 0);
      } else {
        p.s += p.dir * p.speed * dt;
        // drift back to the pavement line after a hop
        const back = Math.min(1, dt * 0.6);
        p.ox -= p.ox * back;
        p.oz -= p.oz * back;
      }
      const at = onLoop(p.walk, p.s);
      p.x = at.x + p.ox;
      p.z = at.z + p.oz;
      if (!p.hop) p.yaw = Math.atan2(at.ux * p.dir, at.uz * p.dir);
      if (!taxi || dt === 0) continue;
      const dx = p.x - taxi.x,
        dz = p.z - taxi.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.9 && sp > 1.5) {
        // brushed anyway: a soft bump onto the bottom, then up again
        p.sit = 1.6;
        p.hop = 0;
        p.y = 0;
        ev.push({ t: 'bump' });
        continue;
      }
      if (p.hop || sp < 2.5 || d > 14) continue;
      // will the taxi pass within 2.5 m in the next second? hop away from its path
      const ux = taxi.vx / sp,
        uz = taxi.vz / sp;
      const ahead = dx * ux + dz * uz;
      const side = dx * uz - dz * ux; // + = to the taxi's right
      if (ahead > 0 && ahead < sp * 1.1 + 3 && Math.abs(side) < 2.6) {
        const away = side >= 0 ? 1 : -1;
        p.hop = 1e-4;
        p.hx = uz * away * 3.2;
        p.hz = -ux * away * 3.2;
        p.yaw = Math.atan2(p.hx, p.hz);
        ev.push({ t: 'hop' });
      }
    }
    return ev;
  }

  draw() {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    this.list.forEach((p, i) => {
      const sitting = p.sit > 0;
      // sitting: lower, leaning back a little
      e.set(sitting ? -0.35 : 0, p.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      v.set(p.x, sitting ? -0.55 : p.y, p.z);
      m4.compose(v, q, sitting ? new THREE.Vector3(1, 0.7, 1) : one);
      this.legs.setMatrixAt(i, m4);
      m4.compose(v, q, one);
      this.body.setMatrixAt(i, m4);
      this.head.setMatrixAt(i, m4);
      this.body.setColorAt(i, p.shirt);
      this.head.setColorAt(i, p.skin);
    });
    for (const m of [this.legs, this.body, this.head]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
