// Rush Taxi — what the rules look like in the world: people waiting with a coloured ring over their heads (red
// near, yellow middle, green far) and a circle at their feet to stop in; while carrying someone, a green light
// column, a ground ring and a name sign at the destination, and a faint dashed guide line on the road.
import * as THREE from 'three';
import type { Band, Passenger, RunState } from './rules';
import { RULES } from './rules';

export const BAND_COLOR: Record<Band, string> = { red: '#E53935', yellow: '#FDD835', green: '#43A047' };
const SHIRTS = ['#1E88E5', '#8E24AA', '#F4511E', '#00897B', '#6D4C41', '#3949AB'];

function figure(seed: number) {
  const g = new THREE.Group();
  const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.3), mat('#37474F'));
  legs.position.y = 0.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.38), mat(SHIRTS[seed % SHIRTS.length]));
  body.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat('#F1C9A5'));
  head.position.y = 1.8;
  for (const m of [legs, body, head]) m.castShadow = true;
  g.add(legs, body, head);
  return g;
}

function sign(text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#23303F';
  x.beginPath();
  x.roundRect(4, 4, 504, 120, 24);
  x.fill();
  x.fillStyle = '#FFFFFF';
  x.font = 'bold 64px "Noto Sans TC", "PingFang TC", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(8, 2, 1);
  s.renderOrder = 10;
  return s;
}

export class RunView {
  private waiting = new Map<number, { g: THREE.Group; ring: THREE.Mesh; circle: THREE.Mesh }>();
  private dest: { id: number; g: THREE.Group } | null = null;
  private guide: THREE.Line;
  private guidePts = new Float32Array(6);
  private lang: 'zh' | 'en';

  constructor(
    private scene: THREE.Scene,
    lang: 'zh' | 'en',
  ) {
    this.lang = lang;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.guidePts, 3));
    this.guide = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#7CFC8A', dashSize: 2, gapSize: 2, transparent: true, opacity: 0.55 }));
    this.guide.visible = false;
    this.guide.frustumCulled = false;
    scene.add(this.guide);
  }

  private addWaiting(p: Passenger) {
    const g = new THREE.Group();
    g.position.set(p.stop.x, 0, p.stop.z);
    const fig = figure(p.id);
    g.add(fig);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: BAND_COLOR[p.band] }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.6;
    const circle = new THREE.Mesh(new THREE.RingGeometry(RULES.pickRadius - 0.5, RULES.pickRadius, 40), new THREE.MeshBasicMaterial({ color: BAND_COLOR[p.band], transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.04;
    g.add(ring, circle);
    this.scene.add(g);
    this.waiting.set(p.id, { g, ring, circle });
  }
  private dispose(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((m) => {
      if (m instanceof THREE.Mesh || m instanceof THREE.Sprite || m instanceof THREE.Line) {
        m.geometry?.dispose();
        const mt = m.material as THREE.Material & { map?: THREE.Texture };
        mt.map?.dispose();
        mt.dispose();
      }
    });
  }

  update(s: RunState | null, car: THREE.Vector3, time: number) {
    const keep = new Set(s?.waiting.map((p) => p.id) ?? []);
    for (const [id, v] of this.waiting)
      if (!keep.has(id)) {
        this.dispose(v.g);
        this.waiting.delete(id);
      }
    for (const p of s?.waiting ?? []) if (!this.waiting.has(p.id)) this.addWaiting(p);
    for (const v of this.waiting.values()) {
      v.ring.position.y = 2.6 + Math.sin(time * 3 + v.g.position.x) * 0.12;
      v.ring.rotation.z = time * 1.5;
    }
    // destination marker while carrying someone
    const r = s?.rider ?? null;
    if (this.dest && (!r || r.id !== this.dest.id)) {
      this.dispose(this.dest.g);
      this.dest = null;
    }
    if (r && !this.dest) {
      const g = new THREE.Group();
      g.position.set(r.dest.x, 0, r.dest.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(RULES.dropRadius * 0.55, RULES.dropRadius * 0.55, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#43A047', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 30;
      const ring = new THREE.Mesh(new THREE.RingGeometry(RULES.dropRadius - 0.8, RULES.dropRadius, 48), new THREE.MeshBasicMaterial({ color: '#43A047', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const label = sign(r.dest.name[this.lang]);
      label.position.y = 9;
      g.add(beam, ring, label);
      this.scene.add(g);
      this.dest = { id: r.id, g };
    }
    if (r) {
      const p = this.guidePts;
      p[0] = car.x;
      p[1] = 0.12;
      p[2] = car.z;
      p[3] = r.dest.x;
      p[4] = 0.12;
      p[5] = r.dest.z;
      this.guide.geometry.attributes.position.needsUpdate = true;
      this.guide.computeLineDistances();
      this.guide.visible = true;
    } else this.guide.visible = false;
  }

  clear() {
    for (const v of this.waiting.values()) this.dispose(v.g);
    this.waiting.clear();
    if (this.dest) this.dispose(this.dest.g);
    this.dest = null;
    this.guide.visible = false;
  }
}
