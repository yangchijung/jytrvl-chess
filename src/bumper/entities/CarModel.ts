// Crazy Bumper — the toy look of a bumper car (spec 4.2): a rubber ring that squashes on impact and springs back
// within 100 ms, a rounded tub whose shape depends on the car, a big-headed animal driver whose head bobs when
// the car speeds up or gets hit, and a springy rear antenna with a glowing ball that flares on a dash.
// Five draw calls per car (ring, body, head, antenna, shadow-free); everything else is merged.
import * as THREE from 'three';
import type { AnimalSpec, CarSpec } from './roster';
import { Parts, toon } from '../vfx/materials';

const SEG = 20;
const sphere = (r: number, w = SEG, h = 12) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, s = SEG) => new THREE.CylinderGeometry(rt, rb, h, s);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 16);

const DARK = '#2B2F3A';
const WHITE = '#FFFFFF';

/** the tub, hood, seat, fins and torso (one mesh) */
function bodyGeometry(car: CarSpec, animal: AnimalSpec): THREE.BufferGeometry {
  const p = new Parts();
  const b = car.body,
    t = car.trim;
  // chassis plate inside the ring
  p.add(cyl(1.28, 1.28, 0.22, 28), DARK, { p: [0, -0.12, 0] });
  switch (car.shell) {
    case 'round':
      p.add(cyl(1.12, 1.2, 0.55, 28), b, { p: [0, 0.22, 0] });
      p.add(sphere(0.95, 24, 12), b, { p: [0, 0.5, 0.42], s: [1.05, 0.55, 0.75] });
      break;
    case 'bubble':
      p.add(cyl(1.1, 1.22, 0.6, 28), b, { p: [0, 0.24, 0] });
      p.add(sphere(0.9, 24, 12), b, { p: [0, 0.62, 0.5], s: [1.1, 0.75, 0.75] });
      p.add(sphere(0.22), WHITE, { p: [0.42, 0.98, 0.62] }); // a shiny bubble highlight on the hood
      break;
    case 'rocket':
      p.add(cyl(1.0, 1.15, 0.55, 28), b, { p: [0, 0.22, -0.05], s: [1, 1, 1.15] });
      p.add(cone(0.62, 1.2), b, { p: [0, 0.5, 1.0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.75] });
      p.add(cyl(0.64, 0.64, 0.14, 24), t, { p: [0, 0.5, 0.42], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.75] });
      break;
    case 'boxy':
      p.add(box(2.05, 0.6, 2.2), b, { p: [0, 0.24, 0] });
      p.add(box(1.75, 0.38, 0.85), b, { p: [0, 0.68, 0.62] });
      p.add(box(2.1, 0.12, 0.2), t, { p: [0, 0.5, 1.12] }); // front grille stripe
      break;
    case 'teardrop':
      p.add(sphere(1.15, 24, 12), b, { p: [0, 0.28, 0.05], s: [1, 0.48, 1.12] });
      p.add(sphere(0.8, 24, 12), b, { p: [0, 0.55, 0.62], s: [0.95, 0.6, 0.85] });
      break;
    case 'racer':
      p.add(cyl(1.08, 1.18, 0.42, 28), b, { p: [0, 0.16, 0] });
      p.add(box(1.3, 0.3, 1.2), b, { p: [0, 0.42, 0.7], r: [-0.22, 0, 0] });
      p.add(box(0.26, 0.32, 1.25), WHITE, { p: [0, 0.48, 0.7], r: [-0.22, 0, 0] }); // racing stripe
      break;
  }
  // headlights (front) and a seat back in the trim colour
  p.pair(sphere(0.13, 12, 8), '#FFF8C4', { p: [0.48, 0.48, 1.08] });
  p.add(capsule(0.28, 0.9), t, { p: [0, 0.78, -0.62], r: [0, 0, Math.PI / 2] });
  // steering wheel
  p.add(new THREE.TorusGeometry(0.22, 0.05, 6, 16), DARK, { p: [0, 0.92, 0.32], r: [-0.9, 0, 0] });
  p.add(cyl(0.04, 0.04, 0.4, 6), DARK, { p: [0, 0.78, 0.42], r: [-0.9, 0, 0] });
  // fins and wings
  switch (car.fins) {
    case 'tail':
      p.add(box(0.12, 0.7, 0.6), t, { p: [0, 0.75, -1.02], r: [0.35, 0, 0] });
      break;
    case 'side':
      p.pair(box(0.5, 0.1, 0.55), t, { p: [1.15, 0.45, -0.55], r: [0, 0, -0.35] });
      break;
    case 'twin':
      p.pair(box(0.1, 0.5, 0.45), t, { p: [0.65, 0.7, -0.95], r: [0.3, 0, 0.15] });
      break;
    case 'spoiler':
      p.pair(box(0.08, 0.4, 0.12), DARK, { p: [0.55, 0.65, -1.0] });
      p.add(box(1.7, 0.1, 0.45), t, { p: [0, 0.88, -1.02], r: [-0.12, 0, 0] });
      break;
    case 'none':
      break;
  }
  // the driver's body (the head is its own mesh so it can bob)
  p.add(sphere(0.42, 16, 10), animal.fur, { p: [0, 0.82, -0.18], s: [1, 0.9, 0.85] });
  p.add(sphere(0.3, 14, 8), animal.face, { p: [0, 0.8, 0.0], s: [0.9, 0.85, 0.6] });
  p.pair(capsule(0.1, 0.35), animal.fur, { p: [0.3, 0.9, 0.18], r: [-1.1, 0, 0.25] });
  return p.build();
}

/** the Q-version animal head, origin at the neck */
function headGeometry(a: AnimalSpec): THREE.BufferGeometry {
  const p = new Parts();
  const eyes = (y: number, z: number, x = 0.18) => {
    p.pair(sphere(0.075, 10, 8), DARK, { p: [x, y, z] });
    p.pair(sphere(0.026, 6, 4), WHITE, { p: [x - 0.025, y + 0.03, z + 0.06] });
  };
  if (a.id === 'penguin') {
    p.add(sphere(0.5), a.fur, { p: [0, 0.42, 0] });
    p.add(sphere(0.4), a.face, { p: [0, 0.38, 0.17], s: [1, 0.9, 0.8] });
    p.add(cone(0.12, 0.3), a.nose, { p: [0, 0.34, 0.56], r: [Math.PI / 2, 0, 0] });
    p.add(cone(0.06, 0.2), a.ear, { p: [0, 0.98, 0], r: [0.3, 0, 0] });
    eyes(0.5, 0.42, 0.16);
    p.pair(sphere(0.07, 10, 6), '#FFB3C7', { p: [0.3, 0.3, 0.36], s: [1, 0.6, 0.4] });
    return p.build();
  }
  p.add(sphere(0.5), a.fur, { p: [0, 0.42, 0] });
  if (a.id !== 'frog') p.add(sphere(0.23, 14, 10), a.face, { p: [0, 0.3, 0.38], s: [1.15, 0.8, 0.7] });
  else p.add(sphere(0.42, 18, 10), a.face, { p: [0, 0.28, 0.12], s: [1.05, 0.55, 0.95] });
  switch (a.ears) {
    case 'round':
      p.pair(sphere(0.17, 12, 8), a.fur, { p: [0.36, 0.82, -0.02] });
      p.pair(sphere(0.09, 10, 6), a.ear, { p: [0.36, 0.82, 0.08], s: [1, 1, 0.5] });
      break;
    case 'panda':
      p.pair(sphere(0.17, 12, 8), a.ear, { p: [0.36, 0.82, -0.02] });
      p.pair(sphere(0.12, 12, 8), a.ear, { p: [0.18, 0.5, 0.38], r: [0, 0, 0.6], s: [0.8, 1.15, 0.5] });
      break;
    case 'long':
      p.pair(capsule(0.11, 0.55), a.fur, { p: [0.17, 1.12, -0.05], r: [0, 0, -0.14] });
      p.pair(capsule(0.06, 0.45), a.ear, { p: [0.17, 1.12, 0.03], r: [0, 0, -0.14] });
      break;
    case 'pointy':
      p.pair(cone(0.17, 0.34), a.fur, { p: [0.29, 0.86, 0], r: [0, 0, -0.35] });
      p.pair(cone(0.09, 0.2), a.ear, { p: [0.28, 0.84, 0.06], r: [0, 0, -0.35] });
      break;
    case 'none':
      // frog: big eyes on top of the head
      p.pair(sphere(0.18, 14, 10), a.fur, { p: [0.22, 0.82, 0.12] });
      p.pair(sphere(0.13, 12, 8), WHITE, { p: [0.22, 0.85, 0.22] });
      p.pair(sphere(0.07, 10, 6), DARK, { p: [0.22, 0.86, 0.33] });
      break;
    case 'tuft':
      break;
  }
  if (a.id !== 'frog') {
    eyes(0.52, 0.42);
    p.add(sphere(0.07, 10, 6), a.nose, { p: [0, 0.38, 0.56], s: [1.3, 0.9, 0.8] });
  } else {
    p.add(new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI), a.nose, { p: [0, 0.3, 0.52], r: [0, 0, Math.PI] });
  }
  if (a.id === 'cat') {
    p.pair(box(0.2, 0.015, 0.015), DARK, { p: [0.28, 0.32, 0.5], r: [0, 0, 0.15] });
  }
  p.pair(sphere(0.07, 10, 6), '#FF9EB5', { p: [0.3, 0.3, 0.38], s: [1, 0.6, 0.4] });
  return p.build();
}

/** rod + glowing ball, one mesh: the ball's UVs read the white half of the emissive map, the rod the black half */
function antennaGeometry(car: CarSpec): { geo: THREE.BufferGeometry; tip: number } {
  const p = new Parts();
  const h = car.antenna === 'tall' ? 2.1 : 1.6;
  p.add(cyl(0.035, 0.05, h, 8), '#E9EDF2', { p: [0, h / 2, 0] }, [0.25, 0.5]);
  if (car.antenna === 'curly') p.add(new THREE.TorusGeometry(0.12, 0.03, 6, 14), '#E9EDF2', { p: [0, h * 0.55, 0], r: [Math.PI / 2, 0, 0] }, [0.25, 0.5]);
  p.add(sphere(0.17, 14, 10), car.ring, { p: [0, h + 0.1, 0] }, [0.75, 0.5]);
  p.add(cyl(0.12, 0.12, 0.08, 10), DARK, { p: [0, 0.04, 0] }, [0.25, 0.5]);
  return { geo: p.build(), tip: h + 0.1 };
}

let emissiveMask: THREE.DataTexture | null = null;
function mask() {
  if (emissiveMask) return emissiveMask;
  emissiveMask = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
  emissiveMask.minFilter = emissiveMask.magFilter = THREE.NearestFilter;
  emissiveMask.needsUpdate = true;
  return emissiveMask;
}

/** a damped spring for the wobbles (x'' = -k x - c x' + f) */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private c: number,
  ) {}
  step(target: number, dt: number) {
    const a = -this.k * (this.x - target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export interface CarAnim {
  /** acceleration in the car's frame: forward (+) and to the left (+) */
  accFwd: number;
  accSide: number;
  dashing: boolean;
  /** 0 when the dash is ready, 1 just after one */
  cooldown: number;
  dt: number;
  /** wobble strength (reduced motion: smaller) */
  motion: number;
}

export class CarModel {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private squashPivot = new THREE.Group();
  private ring: THREE.Mesh;
  private body: THREE.Mesh;
  private head: THREE.Group;
  private antenna: THREE.Group;
  private antennaMat: THREE.MeshToonMaterial;
  readonly tipLocal: THREE.Vector3;
  private pitch = new Spring(110, 8);
  private roll = new Spring(110, 8);
  private headZ = new Spring(160, 7);
  private headP = new Spring(140, 6);
  private antX = new Spring(90, 4);
  private antZ = new Spring(90, 4);
  private squashT = 1;
  private squashA = 0;
  private glow = 0;
  private time = Math.random() * 10;

  constructor(car: CarSpec, animal: AnimalSpec) {
    const vc = (p: THREE.MeshToonMaterialParameters = {}) => toon({ vertexColors: true, ...p });
    const ringGeo = new THREE.TorusGeometry(1.28, 0.3, 10, 32);
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.scale(1, 1.05, 1);
    this.ring = new THREE.Mesh(ringGeo, toon({ color: car.ring }));
    this.ring.castShadow = true;
    this.squashPivot.add(this.ring);
    this.body = new THREE.Mesh(bodyGeometry(car, animal), vc());
    this.body.castShadow = true;
    this.head = new THREE.Group();
    const headMesh = new THREE.Mesh(headGeometry(animal), vc());
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.head.position.set(0, 1.12, -0.18);
    const ant = antennaGeometry(car);
    this.antennaMat = vc({ emissive: new THREE.Color(car.ring).lerp(new THREE.Color('#FFFFFF'), 0.35), emissiveMap: mask(), emissiveIntensity: 0.6 });
    this.antenna = new THREE.Group();
    this.antenna.add(new THREE.Mesh(ant.geo, this.antennaMat));
    this.antenna.position.set(0, 0.5, -1.05);
    this.tipLocal = new THREE.Vector3(0, 0.5 + ant.tip, -1.05);
    this.tilt.add(this.squashPivot, this.body, this.head, this.antenna);
    this.root.add(this.tilt);
  }

  /** an impact from world direction (dx, dz) relative to the car centre, strength in u/s */
  impact(dx: number, dz: number, strength: number, yaw: number, motion: number) {
    const a = Math.atan2(dx, dz) - yaw; // the hit direction in the car's frame
    this.squashPivot.rotation.y = a;
    this.squashT = 0;
    this.squashA = Math.min(1, strength / 14);
    const s = Math.min(1.5, strength / 10) * motion;
    // tilt away from the hit, the head and antenna whip
    this.pitch.v -= Math.cos(a) * 3.2 * s;
    this.roll.v += Math.sin(a) * 3.2 * s;
    this.headZ.v -= Math.cos(a) * 2.6 * s;
    this.headP.v -= Math.cos(a) * 9 * s;
    this.antX.v += Math.cos(a) * 9 * s;
    this.antZ.v -= Math.sin(a) * 9 * s;
  }

  /** a dash: the antenna ball flares and the whole car leans back */
  dash() {
    this.glow = 1;
    this.pitch.v -= 1.5;
    this.antX.v += 6;
  }

  animate(s: CarAnim) {
    const dt = Math.min(s.dt, 1 / 20);
    this.time += dt;
    const m = s.motion;
    const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));
    this.tilt.rotation.x = this.pitch.step(clamp(-s.accFwd * 0.006 * m, 0.14), dt);
    this.tilt.rotation.z = this.roll.step(clamp(-s.accSide * 0.008 * m, 0.16), dt);
    // never shown upside down: the visual tilt is capped well short of a roll
    this.tilt.rotation.x = clamp(this.tilt.rotation.x, 0.35);
    this.tilt.rotation.z = clamp(this.tilt.rotation.z, 0.35);
    const hz = this.headZ.step(clamp(-s.accFwd * 0.004, 0.12) * m, dt);
    const hp = this.headP.step(clamp(-s.accFwd * 0.012, 0.3) * m, dt);
    this.head.position.z = -0.18 + clamp(hz, 0.25);
    this.head.position.y = 1.12 + Math.sin(this.time * 7) * 0.015 * m;
    this.head.rotation.x = clamp(hp, 0.5);
    this.antenna.rotation.x = clamp(this.antX.step(clamp(-s.accFwd * 0.01, 0.3) * m, dt), 0.7);
    this.antenna.rotation.z = clamp(this.antZ.step(clamp(s.accSide * 0.01, 0.3) * m, dt), 0.7);
    // ring squash & stretch: squeezed along the hit, wider across it, springing back within ~100 ms
    this.squashT += dt;
    const sq = this.squashA * Math.exp(-this.squashT / 0.026) * Math.cos((this.squashT / 0.1) * Math.PI * 2);
    this.ring.scale.set(1 + 0.12 * sq, 1 - 0.08 * sq, 1 - 0.28 * sq);
    this.ring.rotation.y = 0;
    this.squashPivot.updateMatrix();
    // the ring is a torus round the vertical axis: squash in the pivot frame (pivot faces the hit along +z)
    this.body.scale.set(1 + 0.04 * sq, 1 - 0.06 * sq, 1 + 0.04 * sq);
    this.glow = Math.max(0, this.glow - dt * 1.6);
    const ready = s.cooldown <= 0 ? 0.25 * (0.5 + 0.5 * Math.sin(this.time * 4)) : 0;
    this.antennaMat.emissiveIntensity = 0.55 + ready + (s.dashing ? 2.2 : 0) + this.glow * 2.5;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
