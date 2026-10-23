// Crazy Bumper — the carnival arena (spec 5.1): a round floor of radius 25 m, a candy-stripe rail that bounces
// cars back (restitution 0.9) and three jelly pinball posts (restitution 1.35) that swell ×1.3 and go "咚!".
// buildArenaPhysics has no Three.js so the unit tests can use it; ArenaView draws it.
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { toonRamp } from '../vfx/materials';

type Rapier = typeof RAPIER_NS;

export const ARENA = {
  radius: 25,
  wallRestitution: 0.9,
  postRestitution: 1.35,
  postRadius: 1.6,
  postHeight: 2.6,
  /** posts sit between the centre and the rail, 120° apart */
  postRing: 12.5,
  postAngles: [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3],
  /** extra outward shove from a post on top of the bounce (u/s) */
  postKick: 6,
  wallSegments: 64,
  wallThick: 1.5,
} as const;

export const POST_COLORS = ['#FF5FA2', '#3EC6FF', '#FFC107'] as const;

export interface ArenaPhysics {
  walls: Set<number>;
  posts: { x: number; z: number; handle: number }[];
}

export function buildArenaPhysics(R: Rapier, world: RAPIER_NS.World): ArenaPhysics {
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const walls = new Set<number>();
  const n = ARENA.wallSegments;
  const rc = ARENA.radius + ARENA.wallThick / 2;
  const half = (Math.PI * rc) / n + 0.2; // a little overlap so no seam can catch a car
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // the segment's long side runs along the circle (its local z), so turn it to face the centre
    const yaw = a;
    const c = world.createCollider(
      R.ColliderDesc.cuboid(ARENA.wallThick / 2, 1.2, half)
        .setTranslation(Math.sin(a) * rc, 1.2, Math.cos(a) * rc)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setRestitution(ARENA.wallRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Min)
        .setFriction(0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min),
      fixed,
    );
    walls.add(c.handle);
  }
  const posts = ARENA.postAngles.map((a) => {
    const x = Math.cos(a) * ARENA.postRing,
      z = Math.sin(a) * ARENA.postRing;
    const c = world.createCollider(
      R.ColliderDesc.cylinder(ARENA.postHeight / 2, ARENA.postRadius)
        .setTranslation(x, ARENA.postHeight / 2, z)
        .setRestitution(ARENA.postRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
        .setFriction(0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min),
      fixed,
    );
    return { x, z, handle: c.handle };
  });
  return { walls, posts };
}

/** the floor: cream and light-blue wedges with two rings and a star in the middle (Canvas 2D, no image files) */
function floorTexture(size: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const c = size / 2;
  const wedges = 24;
  for (let i = 0; i < wedges; i++) {
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, c, (i / wedges) * Math.PI * 2, ((i + 1) / wedges) * Math.PI * 2);
    g.closePath();
    g.fillStyle = i % 2 ? '#FFFDF7' : '#D6ECFF';
    g.fill();
  }
  const ring = (r: number, w: number, color: string) => {
    g.beginPath();
    g.arc(c, c, r * c, 0, Math.PI * 2);
    g.lineWidth = w * c;
    g.strokeStyle = color;
    g.stroke();
  };
  ring(0.97, 0.05, '#FFFFFF');
  ring(0.97, 0.012, '#9CCBF0');
  ring(0.62, 0.02, '#FFFFFF');
  ring(0.3, 0.16, '#FFFDF7');
  ring(0.3, 0.012, '#9CCBF0');
  // a five-point star in the centre circle
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 0.08 : 0.19) * c;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#FFE36E';
  g.fill();
  g.lineWidth = size / 220;
  g.strokeStyle = '#F5B800';
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** red and white candy stripes running round the rail */
function stripeTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 32;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#F2304B';
  for (let k = -1; k < 2; k++) {
    g.beginPath();
    g.moveTo(k * 64, 32);
    g.lineTo(k * 64 + 32, 32);
    g.lineTo(k * 64 + 64, 0);
    g.lineTo(k * 64 + 32, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 1);
  return t;
}

export class ArenaView {
  readonly posts: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; pulse: number }[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, opts: { textureSize: number }) {
    const ramp = toonRamp();
    // ground outside the arena (a soft mint lawn) and the pink apron under the rail
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(140, 48), new THREE.MeshToonMaterial({ color: '#BFEFD0', gradientMap: ramp }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.03;
    lawn.receiveShadow = false;
    scene.add(lawn);
    const apron = new THREE.Mesh(new THREE.RingGeometry(ARENA.radius - 0.2, ARENA.radius + 4.5, 96, 1), new THREE.MeshToonMaterial({ color: '#FFD3E2', gradientMap: ramp }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.01;
    scene.add(apron);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA.radius, 96), new THREE.MeshToonMaterial({ map: floorTexture(opts.textureSize), gradientMap: ramp }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // the rail: one fat candy-stripe tube sitting on a white kerb
    const rail = new THREE.Mesh(new THREE.TorusGeometry(ARENA.radius + 0.75, 0.75, 10, 128), new THREE.MeshToonMaterial({ map: stripeTexture(), gradientMap: ramp }));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 0.85;
    scene.add(rail);
    const kerb = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.radius + 1.6, ARENA.radius + 1.6, 0.35, 96, 1, true), new THREE.MeshToonMaterial({ color: '#FFFFFF', gradientMap: ramp, side: THREE.DoubleSide }));
    kerb.position.y = 0.17;
    scene.add(kerb);

    // the three jelly pinball posts: glossy plastic, softly glowing
    const postGeo = new THREE.CylinderGeometry(ARENA.postRadius, ARENA.postRadius * 1.08, ARENA.postHeight, 32, 1);
    postGeo.translate(0, ARENA.postHeight / 2, 0);
    const capGeo = new THREE.SphereGeometry(ARENA.postRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1, 0.45, 1);
    capGeo.translate(0, ARENA.postHeight, 0);
    const bandGeo = new THREE.TorusGeometry(ARENA.postRadius * 1.06, 0.2, 8, 32);
    bandGeo.rotateX(Math.PI / 2);
    bandGeo.translate(0, ARENA.postHeight * 0.45, 0);
    const geo = mergeSimple([postGeo, capGeo, bandGeo]);
    ARENA.postAngles.forEach((a, i) => {
      const color = new THREE.Color(POST_COLORS[i]);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(a) * ARENA.postRing, 0, Math.sin(a) * ARENA.postRing);
      mesh.castShadow = true;
      scene.add(mesh);
      this.posts.push({ mesh, mat, pulse: 0 });
    });
  }

  /** a car hit post i: swell to 1.3× and flash */
  hitPost(i: number) {
    const p = this.posts[i];
    if (p) p.pulse = 1;
  }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.posts.length; i++) {
      const p = this.posts[i];
      p.pulse = Math.max(0, p.pulse - dt / 0.28);
      // a quick swell that eases back: 1 → 1.3 in 55 ms, back to 1 by 0.28 s
      const t = 1 - p.pulse;
      const k = p.pulse === 0 ? 0 : t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.8) ** 2;
      const s = 1 + 0.3 * k;
      p.mesh.scale.set(s, 1 + 0.12 * k, s);
      p.mat.emissiveIntensity = 0.35 + 1.1 * p.pulse + 0.06 * Math.sin(this.t * 2.2 + i * 2);
    }
  }
}

/** merge indexed geometries that share position/normal/uv (enough for our primitives) */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3),
    nor = new Float32Array(total * 3),
    uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
