// Crazy Bumper — gift boxes and the three zero-text power-ups (spec 6). A spinning, colour-cycling gift box
// appears every 6 s at a random free spot (at most 2 on the floor); touching it gives one of:
//   giant  — grows to 1.6× in 0.3 s, 350 kg, knock-back ×2.2, gold glow, lower engine, 7 s
//   shield — four spring balls circle the car, ring restitution 1.6, attackers fly off, 6 s or 3 hits
//   magnet — a U magnet over the antenna and blue ripples, pulls floor stars within 15 m, 8 s
// One at a time: a new one replaces the old. The rules here are plain data; PowerUpView draws the boxes.
import * as THREE from 'three';
import { ARENA } from './Arena';
import { glossy } from '../vfx/materials';

export type PowerUpKind = 'giant' | 'shield' | 'magnet';

export const POWER_UPS = {
  giant: { kind: 'giant', duration: 7, scale: 1.6, growTime: 0.3, mass: 350, knockback: 2.2 },
  shield: { kind: 'shield', duration: 6, restitution: 1.6, hits: 3, kick: 18 },
  magnet: { kind: 'magnet', duration: 8, radius: 15 },
} as const;
export const KINDS: readonly PowerUpKind[] = ['giant', 'shield', 'magnet'];

export const BOXES = { every: 6, first: 3, maxOnFloor: 2, pickRadius: 2.4, spawnRadius: 19, clearance: 4 } as const;

/** what a car currently has (one at a time; a new one replaces the old) */
export interface ActivePowerUp {
  kind: PowerUpKind;
  left: number;
  /** shield: hits it can still take */
  hits: number;
  /** time since it started (for the grow animation) */
  age: number;
}

export interface PowerUpEvent {
  t: 'spawn' | 'pickup' | 'expire';
  car?: number;
  kind?: PowerUpKind;
  x: number;
  z: number;
}

export interface Box {
  id: number;
  x: number;
  z: number;
  age: number;
}

export class PowerUpManager {
  readonly active: (ActivePowerUp | null)[];
  readonly boxes: Box[] = [];
  private spawnT: number = BOXES.every - BOXES.first;
  private nextId = 1;
  private rnd: () => number;

  constructor(cars: number, rnd: () => number = Math.random) {
    this.active = Array.from({ length: cars }, () => null);
    this.rnd = rnd;
  }

  /** give a power-up straight away (pick-ups and tests) */
  give(car: number, kind: PowerUpKind) {
    const spec = POWER_UPS[kind];
    this.active[car] = { kind, left: spec.duration, hits: kind === 'shield' ? POWER_UPS.shield.hits : 0, age: 0 };
  }

  /** a shield took a hit; returns true when that used it up */
  shieldHit(car: number): boolean {
    const a = this.active[car];
    if (!a || a.kind !== 'shield') return false;
    a.hits--;
    if (a.hits <= 0) {
      this.active[car] = null;
      return true;
    }
    return false;
  }

  private freeSpot(cars: { x: number; z: number }[], posts: { x: number; z: number }[]): { x: number; z: number } | null {
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rnd() * Math.PI * 2,
        r = Math.sqrt(this.rnd()) * BOXES.spawnRadius;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      const near = (o: { x: number; z: number }, d: number) => Math.hypot(o.x - p.x, o.z - p.z) < d;
      if (posts.some((o) => near(o, ARENA.postRadius + BOXES.clearance)) || cars.some((o) => near(o, BOXES.clearance + 1)) || this.boxes.some((o) => near(o, 6))) continue;
      return p;
    }
    return null;
  }

  /** one fixed step: spawn boxes, pick-ups, count effects down */
  update(dt: number, cars: { x: number; z: number }[], posts: { x: number; z: number }[] = []): PowerUpEvent[] {
    const ev: PowerUpEvent[] = [];
    this.spawnT += dt;
    if (this.spawnT >= BOXES.every) {
      this.spawnT -= BOXES.every;
      if (this.boxes.length < BOXES.maxOnFloor) {
        const p = this.freeSpot(cars, posts);
        if (p) {
          this.boxes.push({ id: this.nextId++, x: p.x, z: p.z, age: 0 });
          ev.push({ t: 'spawn', x: p.x, z: p.z });
        }
      }
    }
    for (const b of this.boxes) b.age += dt;
    this.active.forEach((a, i) => {
      if (!a) return;
      a.left -= dt;
      a.age += dt;
      if (a.left <= 0) {
        this.active[i] = null;
        ev.push({ t: 'expire', car: i, kind: a.kind, x: cars[i]?.x ?? 0, z: cars[i]?.z ?? 0 });
      }
    });
    for (let k = this.boxes.length - 1; k >= 0; k--) {
      const b = this.boxes[k];
      if (b.age < 0.4) continue; // let it appear first
      const i = cars.findIndex((c) => Math.hypot(c.x - b.x, c.z - b.z) < BOXES.pickRadius);
      if (i < 0) continue;
      const kind = KINDS[Math.floor(this.rnd() * KINDS.length) % KINDS.length];
      this.give(i, kind);
      this.boxes.splice(k, 1);
      ev.push({ t: 'pickup', car: i, kind, x: b.x, z: b.z });
    }
    return ev;
  }

  /** the player's power-up for window.__GAME_STATS__.activePowerUp */
  activeFor(car: number): PowerUpKind | null {
    return this.active[car]?.kind ?? null;
  }
  has(car: number, kind: PowerUpKind): boolean {
    return this.active[car]?.kind === kind;
  }

  /** giant size right now: grows over 0.3 s, shrinks back over the last 0.3 s */
  scaleOf(car: number): number {
    const a = this.active[car];
    if (!a || a.kind !== 'giant') return 1;
    const g = POWER_UPS.giant;
    const k = Math.min(1, a.age / g.growTime, a.left / g.growTime);
    const e = k * k * (3 - 2 * k);
    return 1 + (g.scale - 1) * e;
  }

  clear(): void {
    this.active.fill(null);
    this.boxes.length = 0;
    this.spawnT = BOXES.every - BOXES.first;
  }
}

/** spinning gift boxes with a ribbon and a bow; the box colour cycles (glossy plastic, spec 4.1) */
export class PowerUpView {
  private slots: { g: THREE.Group; body: THREE.MeshStandardMaterial }[] = [];
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5, 1, 1, 1);
    const ribbon = new THREE.Group();
    const rib = glossy('#FFFFFF');
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(1.56, 1.56, 0.34), rib);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.56, 1.56), rib);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 16), rib);
    bow.position.y = 0.95;
    const bow2 = bow.clone();
    bow.rotation.y = Math.PI / 4;
    bow2.rotation.y = -Math.PI / 4;
    ribbon.add(r1, r2, bow, bow2);
    // merge the ribbon parts into one mesh (one draw call per box for the ribbon)
    ribbon.updateMatrixWorld(true);
    const geos: THREE.BufferGeometry[] = [];
    ribbon.traverse((o) => {
      if (o instanceof THREE.Mesh) geos.push((o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld));
    });
    const ribGeo = mergeNonIndexed(geos);
    for (let i = 0; i < BOXES.maxOnFloor; i++) {
      const g = new THREE.Group();
      const body = glossy('#FF4081', { emissive: '#FF4081', emissiveIntensity: 0.25 });
      const b = new THREE.Mesh(boxGeo, body);
      b.castShadow = true;
      const r = new THREE.Mesh(ribGeo, rib);
      g.add(b, r);
      g.visible = false;
      scene.add(g);
      this.slots.push({ g, body });
    }
  }

  update(boxes: readonly Box[], time: number) {
    this.slots.forEach((s, i) => {
      const b = boxes[i];
      s.g.visible = !!b;
      if (!b) return;
      const pop = Math.min(1, b.age / 0.3);
      const sc = pop * pop * (3 - 2 * pop);
      s.g.position.set(b.x, 1.3 + Math.sin(time * 3 + b.id) * 0.18, b.z);
      s.g.rotation.set(0.25, time * 1.6 + b.id, 0.15);
      s.g.scale.setScalar(Math.max(0.001, sc));
      this.c.setHSL((time * 0.25 + b.id * 0.31) % 1, 0.9, 0.58);
      s.body.color.copy(this.c);
      s.body.emissive.copy(this.c);
    });
  }
}

function mergeNonIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3),
    nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
