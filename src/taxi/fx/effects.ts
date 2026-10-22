// Rush Taxi — feedback effects, each one telling the player something happened: tyre smoke and black tyre marks
// while drifting or braking hard, a puff of dust on landing, sparks on a crash, a burst of coins when a passenger
// gets in or pays, and streaks past the camera above 100 km/h (speed). Pooled, a handful of draw calls in total.
import * as THREE from 'three';

const V = new THREE.Vector3();

/** soft round particles (smoke, dust) or bright additive ones (sparks) */
class Particles {
  points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private alpha: Float32Array;
  private col: Float32Array;
  private next = 0;
  constructor(
    private n: number,
    additive: boolean,
    private gravity: number,
    private drag: number,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.5, -mv.z); vA = aAlpha; vC = aColor; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main() { vec2 p = gl_PointCoord - 0.5; float d = dot(p, p) * 4.0; if (d > 1.0) discard; gl_FragColor = vec4(vC, vA * (1.0 - d)); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }
  setScale(s: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, o: { life: number; size: number; grow: number; color: THREE.Color; spread?: number }) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const sp = o.spread ?? 0;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x + (Math.random() - 0.5) * sp, v.y + Math.random() * sp * 0.5, v.z + (Math.random() - 0.5) * sp], i * 3);
    this.life[i] = o.life;
    this.max[i] = o.life;
    this.size[i] = o.size;
    this.grow[i] = o.grow;
    this.col.set([o.color.r, o.color.g, o.color.b], i * 3);
  }
  update(dt: number) {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = this.life[i] / this.max[i];
      this.vel[i * 3 + 1] -= this.gravity * dt;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= k;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.max(0, t) * 0.75;
    }
    const g = this.points.geometry;
    for (const n of ['position', 'aSize', 'aAlpha', 'aColor']) g.getAttribute(n).needsUpdate = true;
  }
}

export class Effects {
  private smoke = new Particles(220, false, -0.6, 1.6);
  private sparks = new Particles(90, true, 9, 0.8);
  private marks: THREE.InstancedMesh;
  private markNext = 0;
  private lastMark: (THREE.Vector3 | null)[] = [null, null];
  private coins: THREE.InstancedMesh;
  private coinState: { p: THREE.Vector3; v: THREE.Vector3; life: number; spin: number }[] = [];
  private lines: THREE.InstancedMesh;
  private lineState: { a: number; r: number; z: number; len: number }[] = [];
  private lineMat: THREE.MeshBasicMaterial;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.smoke.points, this.sparks.points);
    // tyre marks: dark quads on the road, the oldest replaced first
    const MARKS = 700;
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#15171A', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MARKS);
    for (let i = 0; i < MARKS; i++) this.marks.setMatrixAt(i, this.hidden);
    this.marks.frustumCulled = false;
    scene.add(this.marks);
    // coins
    const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14).rotateX(Math.PI / 2);
    this.coins = new THREE.InstancedMesh(coinGeo, new THREE.MeshLambertMaterial({ color: '#FFC72C', emissive: '#7A5A00' }), 32);
    for (let i = 0; i < 32; i++) {
      this.coins.setMatrixAt(i, this.hidden);
      this.coinState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, spin: 0 });
    }
    this.coins.frustumCulled = false;
    scene.add(this.coins);
    // speed streaks, in camera space
    this.lineMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.02, 1), this.lineMat, 36);
    for (let i = 0; i < 36; i++) this.lineState.push({ a: Math.random() * Math.PI * 2, r: 1.6 + Math.random() * 1.8, z: -4 - Math.random() * 26, len: 2 + Math.random() * 3 });
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    camera.add(this.lines);
  }

  /** the point-size scale follows the canvas height so particles look the same on every screen */
  resize(heightPx: number, fovDeg: number) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.smoke.setScale(s);
    this.sparks.setScale(s);
  }

  /** tyre smoke at a rear wheel (drifting, hard braking, wheelspin) */
  puff(p: THREE.Vector3, carVel: THREE.Vector3, heavy = false) {
    this.smoke.emit(p, V.copy(carVel).multiplyScalar(0.25).setY(0.6), { life: heavy ? 1.3 : 0.9, size: 0.6, grow: heavy ? 2.4 : 1.6, color: new THREE.Color('#E6E8EA'), spread: 1.4 });
  }
  /** a ring of dust where the car lands */
  dust(p: THREE.Vector3, strength: number) {
    const n = Math.min(26, 8 + Math.round(strength * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.smoke.emit(V.set(p.x, 0.25, p.z), new THREE.Vector3(Math.cos(a) * 4, 0.8, Math.sin(a) * 4), { life: 1.1, size: 0.9, grow: 2.2, color: new THREE.Color('#CDB892'), spread: 1 });
    }
  }
  /** sparks flying off a hit */
  hit(p: THREE.Vector3, dir: THREE.Vector3, strength: number) {
    const n = Math.min(40, 10 + Math.round(strength));
    for (let i = 0; i < n; i++) this.sparks.emit(p, new THREE.Vector3(dir.x * 4, 2.5, dir.z * 4), { life: 0.45 + Math.random() * 0.3, size: 0.14, grow: -0.1, color: new THREE.Color(i % 3 ? '#FFB300' : '#FFF3C4'), spread: 9 });
  }
  /** coins bursting out of the taxi */
  coinBurst(p: THREE.Vector3, n: number) {
    let k = 0;
    for (const c of this.coinState) {
      if (c.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      c.p.set(p.x, p.y + 1.4, p.z);
      c.v.set(Math.cos(a) * (1.5 + Math.random() * 2), 5 + Math.random() * 3, Math.sin(a) * (1.5 + Math.random() * 2));
      c.life = 1.1;
      c.spin = Math.random() * 6;
      if (++k >= n) break;
    }
  }
  /** a tyre mark segment under a rear wheel (index 0 / 1); null when the wheel stops marking */
  mark(i: number, p: THREE.Vector3 | null) {
    const last = this.lastMark[i];
    if (!p) {
      this.lastMark[i] = null;
      return;
    }
    if (!last) {
      this.lastMark[i] = p.clone();
      return;
    }
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    if (d < 0.35) return;
    const mid = V.set((p.x + last.x) / 2, 0.06, (p.z + last.z) / 2);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.x - last.x, p.z - last.z));
    this.m4.compose(mid, this.q, new THREE.Vector3(0.24, 1, d + 0.05));
    this.marks.setMatrixAt(this.markNext, this.m4);
    this.markNext = (this.markNext + 1) % this.marks.count;
    this.marks.instanceMatrix.needsUpdate = true;
    last.copy(p);
  }

  update(dt: number, kmh: number) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    // coins: fly, spin, fall, shrink away
    let any = false;
    this.coinState.forEach((c, i) => {
      if (c.life <= 0) return;
      any = true;
      c.life -= dt;
      c.v.y -= 14 * dt;
      c.p.addScaledVector(c.v, dt);
      c.spin += dt * 14;
      const s = c.life > 0 ? Math.min(1, c.life * 3) : 0;
      this.m4.compose(c.p, this.q.setFromEuler(new THREE.Euler(0, c.spin, 0)), new THREE.Vector3(s, s, s));
      this.coins.setMatrixAt(i, c.life > 0 ? this.m4 : this.hidden);
    });
    if (any) this.coins.instanceMatrix.needsUpdate = true;
    // speed streaks: only above 100 km/h, stronger towards top speed
    const k = Math.max(0, Math.min(1, (kmh - 100) / 40));
    this.lineMat.opacity = k * 0.4;
    this.lines.visible = k > 0;
    if (k > 0) {
      this.lineState.forEach((l, i) => {
        l.z += dt * (30 + kmh * 0.25);
        if (l.z > -1) {
          l.z = -26 - Math.random() * 6;
          l.a = Math.random() * Math.PI * 2;
        }
        this.m4.compose(V.set(Math.cos(l.a) * l.r * 1.6, Math.sin(l.a) * l.r, l.z), this.q.identity(), new THREE.Vector3(1, 1, l.len));
        this.lines.setMatrixAt(i, this.m4);
      });
      this.lines.instanceMatrix.needsUpdate = true;
    }
  }
}
