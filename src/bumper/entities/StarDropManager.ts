// Crazy Bumper — big stars on the floor (spec 7.1 rules 2, 4, 6.3): a dash or giant hit (and any hit on the
// crowned car) knocks stars out of the victim; they fly out, bounce and blink on the floor for 8 s, and any car
// that drives over one collects it (+1). A car with the star magnet pulls in every floor star within 15 m.
// The rules are plain data (unit-tested); StarView draws them as one instanced mesh.
import * as THREE from 'three';
import { ARENA } from './Arena';
import { glossy } from '../vfx/materials';

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
  /** a car collects a star this close to its centre */
  pickRadius: number;
  /** a new star cannot be collected for this long (it is still flying out) */
  pickDelay: number;
  magnetSpeed: number;
  max: number;
}

export const STAR_DROP: StarDropConfig = { heavyHit: 3, crownBonus: 2, maxLoss: 2, floorLife: 8, magnetRadius: 15, pickRadius: 2.1, pickDelay: 0.45, magnetSpeed: 24, max: 40 };

export interface CarPos {
  x: number;
  z: number;
  /** star magnet active */
  magnet: boolean;
}

export interface FloorStar {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  spin: number;
  /** pulled by this car's magnet (-1 = none) */
  pulled: number;
}

export class StarDropManager {
  readonly config = STAR_DROP;
  readonly stars: FloorStar[] = [];
  private rnd: () => number;

  constructor(rnd: () => number = Math.random) {
    this.rnd = rnd;
  }

  /** stars currently lying on the floor */
  get count(): number {
    return this.stars.length;
  }

  /** throw `n` stars out of a car at (x, z) */
  drop(n: number, x: number, z: number) {
    for (let i = 0; i < n && this.stars.length < this.config.max; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 4 + this.rnd() * 4;
      this.stars.push({ x, y: 1.6, z, vx: Math.cos(a) * sp, vy: 6 + this.rnd() * 3, vz: Math.sin(a) * sp, age: 0, spin: this.rnd() * 6, pulled: -1 });
    }
  }

  /** one fixed step: stars bounce, fade out after floorLife, get pulled by magnets and collected */
  update(dt: number, cars: CarPos[]): StarEvent[] {
    const c = this.config;
    const ev: StarEvent[] = [];
    const lim = ARENA.radius - 1;
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.age += dt;
      s.spin += dt * 3;
      if (s.age > c.floorLife) {
        this.stars.splice(i, 1);
        continue;
      }
      // the nearest magnet in range pulls the star
      s.pulled = -1;
      let best = c.magnetRadius;
      cars.forEach((car, j) => {
        if (!car.magnet) return;
        const d = Math.hypot(car.x - s.x, car.z - s.z);
        if (d < best) {
          best = d;
          s.pulled = j;
        }
      });
      if (s.pulled >= 0 && s.age > c.pickDelay * 0.5) {
        const car = cars[s.pulled];
        const d = Math.hypot(car.x - s.x, car.z - s.z) || 1;
        s.vx = ((car.x - s.x) / d) * c.magnetSpeed;
        s.vz = ((car.z - s.z) / d) * c.magnetSpeed;
        s.vy = (1.2 - s.y) * 6;
      } else {
        s.vy -= 22 * dt;
        const k = Math.exp(-1.6 * dt);
        s.vx *= k;
        s.vz *= k;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.6) {
        s.y = 0.6;
        s.vy = Math.abs(s.vy) > 1.5 ? -s.vy * 0.55 : 0;
      }
      const r = Math.hypot(s.x, s.z);
      if (r > lim) {
        s.x *= lim / r;
        s.z *= lim / r;
        const nx = s.x / r,
          nz = s.z / r;
        const vn = s.vx * nx + s.vz * nz;
        if (vn > 0) {
          s.vx -= 1.8 * vn * nx;
          s.vz -= 1.8 * vn * nz;
        }
      }
      if (s.age < c.pickDelay) continue;
      for (let j = 0; j < cars.length; j++) {
        if (Math.hypot(cars[j].x - s.x, cars[j].z - s.z) < c.pickRadius) {
          ev.push({ car: j, delta: 1, x: s.x, z: s.z });
          this.stars.splice(i, 1);
          break;
        }
      }
    }
    return ev;
  }

  clear(): void {
    this.stars.length = 0;
  }
}

/** a chunky five-point star, extruded */
export function starGeometry(outer = 0.75, inner = 0.36, depth = 0.28): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** the floor stars: glossy gold, spinning; they blink in their last 2 seconds */
export class StarView {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, max = STAR_DROP.max) {
    this.mesh = new THREE.InstancedMesh(starGeometry(), glossy('#FFC400', { emissive: '#FF9F00', emissiveIntensity: 0.35 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(stars: readonly FloorStar[], time: number) {
    let n = 0;
    for (const st of stars) {
      const left = STAR_DROP.floorLife - st.age;
      const blinkOff = left < 2 && Math.floor(time * 8) % 2 === 0;
      const sc = blinkOff ? 0.001 : Math.min(1, 0.4 + st.age * 3);
      this.e.set(0, st.spin, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(st.x, st.y + Math.sin(time * 4 + st.spin) * 0.08, st.z), this.q, this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
