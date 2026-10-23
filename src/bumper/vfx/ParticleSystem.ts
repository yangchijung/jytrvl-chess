// Crazy Bumper — every particle in one InstancedMesh (one draw call): impact sparks, the rainbow dash trail,
// antenna sparks and the result-screen confetti. P2 star bursts reuse burst() with their own colours.
import * as THREE from 'three';

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  spin: number;
  rx: number;
  ry: number;
  g: number;
  drag: number;
  flutter: number;
  color: THREE.Color;
}

export interface BurstOpts {
  count: number;
  speed: number;
  up?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  colors: readonly string[];
  /** spread around a direction instead of all round (x, z) */
  dir?: { x: number; z: number };
  flutter?: number;
}

const SPARKS = ['#FFF59D', '#FFD600', '#FFFFFF', '#FF9100'] as const;
const CONFETTI = ['#FF4081', '#00E5FF', '#76FF03', '#FFD600', '#FF6D00', '#B98CFF', '#FFFFFF'] as const;

export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private free: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private hue = 0;

  constructor(
    scene: THREE.Scene,
    private max = 320,
  ) {
    const geo = new THREE.BoxGeometry(1, 1, 0.35);
    const mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#FFFFFF'));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get alive() {
    return this.ps.length;
  }

  private spawn(): P | null {
    if (this.ps.length >= this.max) return null;
    const p = this.free.pop() ?? ({ color: new THREE.Color() } as P);
    this.ps.push(p);
    return p;
  }

  burst(at: { x: number; y: number; z: number }, o: BurstOpts) {
    for (let i = 0; i < o.count; i++) {
      const p = this.spawn();
      if (!p) return;
      let a = Math.random() * Math.PI * 2;
      if (o.dir) a = Math.atan2(o.dir.x, o.dir.z) + (Math.random() - 0.5) * 1.6;
      const sp = o.speed * (0.45 + Math.random() * 0.75);
      p.x = at.x;
      p.y = at.y;
      p.z = at.z;
      p.vx = Math.sin(a) * sp;
      p.vz = Math.cos(a) * sp;
      p.vy = (o.up ?? o.speed * 0.6) * (0.4 + Math.random());
      p.max = p.life = (o.life ?? 0.45) * (0.7 + Math.random() * 0.6);
      p.size = (o.size ?? 0.22) * (0.7 + Math.random() * 0.6);
      p.spin = (Math.random() - 0.5) * 16;
      p.rx = Math.random() * 6;
      p.ry = Math.random() * 6;
      p.g = o.gravity ?? 18;
      p.drag = o.drag ?? 1.5;
      p.flutter = o.flutter ?? 0;
      p.color.set(o.colors[(Math.random() * o.colors.length) | 0]);
    }
  }

  sparks(at: { x: number; y: number; z: number }, strength: number, dir?: { x: number; z: number }) {
    this.burst(at, { count: Math.round(6 + Math.min(18, strength)), speed: 5 + strength * 0.5, up: 4 + strength * 0.25, life: 0.42, size: 0.2, colors: SPARKS, dir });
  }

  /** one puff of the rainbow trail behind a dashing car */
  trail(at: { x: number; y: number; z: number }) {
    const p = this.spawn();
    if (!p) return;
    this.hue = (this.hue + 0.07) % 1;
    p.x = at.x + (Math.random() - 0.5) * 0.5;
    p.y = at.y + (Math.random() - 0.5) * 0.3;
    p.z = at.z + (Math.random() - 0.5) * 0.5;
    p.vx = p.vz = 0;
    p.vy = 0.6;
    p.max = p.life = 0.5;
    p.size = 0.55;
    p.spin = 2;
    p.rx = p.ry = 0;
    p.g = 0;
    p.drag = 0;
    p.flutter = 0;
    p.color.setHSL(this.hue, 1, 0.6);
  }

  confetti(at: { x: number; y: number; z: number }, count: number) {
    this.burst({ x: at.x, y: at.y + 6, z: at.z }, { count, speed: 7, up: 7, life: 3.2, size: 0.32, gravity: 3.2, drag: 1.1, colors: CONFETTI, flutter: 1 });
  }

  clear() {
    this.free.push(...this.ps);
    this.ps.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0 || p.y < -0.5) {
        this.ps[i] = this.ps[this.ps.length - 1];
        this.ps.pop();
        this.free.push(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.g * dt;
      if (p.flutter) {
        p.vx += Math.sin(p.life * 7 + p.rx) * p.flutter * dt * 4;
        p.vz += Math.cos(p.life * 6 + p.ry) * p.flutter * dt * 4;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05 && p.g > 0) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
      const fade = p.flutter ? Math.min(1, p.life / 0.4) : p.life / p.max;
      const sz = p.size * (p.flutter ? 1 : 0.35 + 0.65 * fade);
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sz, p.flutter ? sz * 0.6 : sz, sz));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
