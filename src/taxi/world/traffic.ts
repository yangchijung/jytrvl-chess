// Rush Taxi — city traffic. Cars drive on the right-hand lane of the road graph (Taiwan drives on the right), turn
// at random at each crossing and slow down behind whatever is ahead of them, the taxi included. They are kinematic
// (they push, nothing pushes them) until the taxi runs into one: then it turns into a light dynamic body and gets
// knocked flying, and a few seconds later it comes back somewhere out of sight. Passing one closely at speed
// without touching is a near miss (a tip with a passenger aboard).
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { RoadGraph } from './level';

type R = typeof RAPIER_NS;
/** collision groups (membership << 16 | filter): the taxi is group 2; a knocked car stops colliding with it, so the
 * taxi drives on instead of bouncing off a car that is already flying away */
export const TAXI_GROUPS = (0x0002 << 16) | 0xffff;
const FLYING_GROUPS = (0x0004 << 16) | (0xffff & ~0x0002);
const LANE = 3.5;
const HALF = { x: 1.0, y: 0.75, z: 2.1 };
const CRUISE = 11; // m/s (about 40 km/h)
const TURN = 6;
const COLORS = ['#E53935', '#1E88E5', '#43A047', '#F5F5F5', '#8E24AA', '#FB8C00', '#546E7A', '#00897B', '#6D4C41'];

interface Piece {
  /** quadratic Bézier from a through c to b */
  a: THREE.Vector2;
  c: THREE.Vector2;
  b: THREE.Vector2;
  len: number;
  turn: boolean;
}
interface Npc {
  from: number;
  to: number;
  piece: Piece;
  s: number;
  speed: number;
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  flying: number; // seconds since knocked (0 = driving)
  near: number; // closest side gap while beside the taxi (0 = not beside)
  nearCool: number;
  pos: THREE.Vector2;
  yaw: number;
  color: THREE.Color;
}
export interface TaxiNow {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  kmh: number;
}
export type TrafficEvent = { t: 'hit'; speed: number } | { t: 'near' };

export class Traffic {
  cars: Npc[] = [];
  private adj: number[][];
  private seed: number;
  private bodyMesh: THREE.InstancedMesh;
  private cabinMesh: THREE.InstancedMesh;
  private tyreMesh: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();

  constructor(
    private RAPIER: R,
    private world: RAPIER_NS.World,
    scene: THREE.Scene,
    private graph: RoadGraph,
    count: number,
    seed = 7,
  ) {
    this.seed = seed;
    this.adj = graph.nodes.map(() => []);
    for (const [a, b] of graph.edges) this.adj[a].push(b), this.adj[b].push(a);
    const mat = (o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
    this.bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(HALF.x * 2, 0.9, HALF.z * 2), mat(), count);
    this.cabinMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.65, 2.1), mat({ color: '#4E6B87' }), count);
    this.tyreMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(HALF.x * 2 + 0.1, 0.55, HALF.z * 2 - 0.7), mat({ color: '#1E2228' }), count);
    this.bodyMesh.castShadow = this.cabinMesh.castShadow = true;
    scene.add(this.bodyMesh, this.cabinMesh, this.tyreMesh);
    const used = new Set<number>();
    for (let i = 0; i < count; i++) {
      // spread over the network: a different street for each car
      let e = Math.floor(this.rnd() * graph.edges.length);
      for (let k = 0; k < 50 && used.has(e); k++) e = Math.floor(this.rnd() * graph.edges.length);
      used.add(e);
      const [a, b] = this.rnd() < 0.5 ? graph.edges[e] : [graph.edges[e][1], graph.edges[e][0]];
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HALF.y + 0.1, 0));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z).setDensity(70).setRestitution(0.3).setFriction(0.5), body);
      const npc: Npc = { from: a, to: b, piece: this.straight(a, b), s: 0, speed: CRUISE, body, collider, flying: 0, near: 0, nearCool: 0, pos: new THREE.Vector2(), yaw: 0, color: new THREE.Color(COLORS[i % COLORS.length]) };
      npc.s = this.rnd() * npc.piece.len;
      this.pose(npc);
      body.setTranslation({ x: npc.pos.x, y: HALF.y + 0.1, z: npc.pos.y }, true);
      body.setRotation(rotY(npc.yaw), true);
      this.cars.push(npc);
    }
  }

  private rnd() {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private node(i: number) {
    const n = this.graph.nodes[i];
    return new THREE.Vector2(n.x, n.z);
  }
  /** lane end points of the street a → b: start after the crossing, on the right-hand side */
  private lane(a: number, b: number) {
    const A = this.node(a),
      B = this.node(b);
    const u = B.clone().sub(A).normalize();
    const right = new THREE.Vector2(-u.y, u.x); // right of travel (+x is a car's left when it faces +z)
    return { start: A.clone().addScaledVector(u, 9).addScaledVector(right, LANE), end: B.clone().addScaledVector(u, -9).addScaledVector(right, LANE), u, right };
  }
  private straight(a: number, b: number): Piece {
    const l = this.lane(a, b);
    return { a: l.start, b: l.end, c: l.start.clone().add(l.end).multiplyScalar(0.5), len: l.start.distanceTo(l.end), turn: false };
  }
  private turnPiece(a: number, b: number, c: number): Piece {
    const i = this.lane(a, b),
      o = this.lane(b, c);
    const B = this.node(b);
    let ctrl: THREE.Vector2;
    if (Math.abs(i.u.dot(o.u)) > 0.9) ctrl = i.end.clone().add(o.start).multiplyScalar(0.5);
    // a corner: where the two lanes meet
    else ctrl = B.clone().addScaledVector(i.right, LANE).addScaledVector(o.right, LANE);
    if (i.u.dot(o.u) < -0.9) ctrl = B.clone(); // a U-turn at a dead end
    const len = i.end.distanceTo(ctrl) + ctrl.distanceTo(o.start);
    return { a: i.end, c: ctrl, b: o.start, len: Math.max(1, len * 0.92), turn: true };
  }
  private at(p: Piece, s: number) {
    const t = Math.max(0, Math.min(1, s / p.len));
    const u = 1 - t;
    const pos = new THREE.Vector2(u * u * p.a.x + 2 * u * t * p.c.x + t * t * p.b.x, u * u * p.a.y + 2 * u * t * p.c.y + t * t * p.b.y);
    const tan = new THREE.Vector2(2 * u * (p.c.x - p.a.x) + 2 * t * (p.b.x - p.c.x), 2 * u * (p.c.y - p.a.y) + 2 * t * (p.b.y - p.c.y));
    return { pos, yaw: Math.atan2(tan.x, tan.y) };
  }
  private pose(n: Npc) {
    const { pos, yaw } = this.at(n.piece, n.s);
    n.pos.copy(pos);
    n.yaw = yaw;
  }
  private next(n: Npc) {
    if (n.piece.turn) {
      n.piece = this.straight(n.from, n.to);
      return;
    }
    const opts = this.adj[n.to].filter((m) => m !== n.from);
    const c = opts.length ? opts[Math.floor(this.rnd() * opts.length)] : n.from;
    n.piece = this.turnPiece(n.from, n.to, c);
    n.from = n.to;
    n.to = c;
  }
  /** handles that should not count as a crash (cars already knocked flying) */
  isFlying(handle: number) {
    return this.cars.some((c) => c.flying > 0 && c.collider.handle === handle);
  }
  isCar(handle: number) {
    return this.cars.some((c) => c.collider.handle === handle);
  }

  private respawn(n: Npc, taxi: TaxiNow) {
    this.world.removeCollider(n.collider, false);
    this.world.removeRigidBody(n.body);
    const far = this.graph.edges.filter(([a, b]) => [a, b].every((i) => Math.hypot(this.graph.nodes[i].x - taxi.x, this.graph.nodes[i].z - taxi.z) > 90));
    const [a, b] = far[Math.floor(this.rnd() * far.length)] ?? this.graph.edges[0];
    n.from = a;
    n.to = b;
    n.piece = this.straight(a, b);
    n.s = 0;
    n.speed = CRUISE;
    n.flying = 0;
    n.near = 0;
    this.pose(n);
    n.body = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(n.pos.x, HALF.y + 0.1, n.pos.y).setRotation(rotY(n.yaw)));
    n.collider = this.world.createCollider(this.RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z).setDensity(70).setRestitution(0.3).setFriction(0.5), n.body);
  }

  /** one fixed step, before the physics step */
  update(dt: number, taxi: TaxiNow): TrafficEvent[] {
    const ev: TrafficEvent[] = [];
    const taxiSpeed = Math.hypot(taxi.vx, taxi.vz);
    for (const n of this.cars) {
      if (n.flying > 0) {
        n.flying += dt;
        const t = n.body.translation();
        if (n.flying > 7 || (n.flying > 3 && Math.hypot(t.x - taxi.x, t.z - taxi.z) > 40) || t.y < -4) this.respawn(n, taxi);
        continue;
      }
      // the taxi in this car's frame: x to its left, z ahead
      const dx = taxi.x - n.pos.x,
        dz = taxi.z - n.pos.y;
      const s = Math.sin(n.yaw),
        c = Math.cos(n.yaw);
      const lz = dx * s + dz * c,
        lx = dx * c - dz * s;
      // the taxi's velocity relative to this car
      const rvx = taxi.vx - s * n.speed,
        rvz = taxi.vz - c * n.speed;
      const rel = Math.hypot(rvx, rvz);
      // about to touch (looking one step ahead at the closing speed): knock it flying; the taxi only loses a little
      // speed (the game applies that), a family game: nothing breaks
      const reach = rel * dt * 1.5 + 0.2;
      if (Math.abs(lx) < HALF.x + 1.0 + reach && Math.abs(lz) < HALF.z + 2.2 + reach && rel > 3) {
        n.body.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
        n.collider.setCollisionGroups(FLYING_GROUPS);
        const m = n.body.mass();
        const dir = new THREE.Vector2(rvx, rvz).normalize();
        n.body.setLinvel({ x: s * n.speed, y: 0, z: c * n.speed }, true);
        n.body.applyImpulse({ x: dir.x * m * Math.min(16, rel * 0.9), y: m * Math.min(9, 3 + rel * 0.35), z: dir.y * m * Math.min(16, rel * 0.9) }, true);
        n.body.applyTorqueImpulse({ x: (this.rnd() - 0.5) * m * 6, y: (this.rnd() - 0.5) * m * 8, z: (this.rnd() - 0.5) * m * 6 }, true);
        n.flying = dt;
        n.near = 0;
        ev.push({ t: 'hit', speed: rel });
        continue;
      }
      // near miss: alongside the taxi, close, while it passes at speed — counted once it has gone by untouched
      n.nearCool = Math.max(0, n.nearCool - dt);
      const beside = Math.abs(lz) < HALF.z + 2.6 && Math.abs(lx) < HALF.x + 3.2;
      if (beside && taxi.kmh > 45 && rel > 8) n.near = n.near ? Math.min(n.near, Math.abs(lx)) : Math.abs(lx);
      else if (n.near && (Math.abs(lz) > 7 || Math.abs(lx) > 6)) {
        if (n.nearCool === 0) {
          ev.push({ t: 'near' });
          n.nearCool = 3;
        }
        n.near = 0;
      }
      // slow down behind whatever is in front: the taxi or another car in the lane ahead
      let gap = 99;
      if (lz > 0 && Math.abs(lx) < 2.6) gap = lz - HALF.z * 2;
      for (const o of this.cars) {
        if (o === n || o.flying) continue;
        const ox = o.pos.x - n.pos.x,
          oz = o.pos.y - n.pos.y;
        const fz = ox * s + oz * c,
          fx = ox * c - oz * s;
        if (fz > 0 && fz < gap + HALF.z * 2 && Math.abs(fx) < 2.4 && Math.cos(o.yaw - n.yaw) > 0.3) gap = fz - HALF.z * 2;
      }
      const want = gap < 3 ? 0 : gap < 14 ? Math.min(n.piece.turn ? TURN : CRUISE, (gap - 3) * 1.1) : n.piece.turn ? TURN : CRUISE;
      n.speed += Math.max(-12 * dt, Math.min(4 * dt, want - n.speed));
      n.s += n.speed * dt;
      while (n.s >= n.piece.len) {
        n.s -= n.piece.len;
        this.next(n);
      }
      this.pose(n);
      n.body.setNextKinematicTranslation({ x: n.pos.x, y: HALF.y + 0.1, z: n.pos.y });
      n.body.setNextKinematicRotation(rotY(n.yaw));
    }
    void taxiSpeed;
    return ev;
  }

  draw() {
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const off = new THREE.Vector3();
    this.cars.forEach((n, i) => {
      const t = n.body.translation(),
        r = n.body.rotation();
      q.set(r.x, r.y, r.z, r.w);
      p.set(t.x, t.y, t.z);
      this.m4.compose(off.set(0, 0.05, 0).applyQuaternion(q).add(p), q, one);
      this.bodyMesh.setMatrixAt(i, this.m4);
      this.bodyMesh.setColorAt(i, n.color);
      this.m4.compose(off.set(0, 0.75, -0.2).applyQuaternion(q).add(p), q, one);
      this.cabinMesh.setMatrixAt(i, this.m4);
      this.m4.compose(off.set(0, -0.45, 0).applyQuaternion(q).add(p), q, one);
      this.tyreMesh.setMatrixAt(i, this.m4);
    });
    for (const m of [this.bodyMesh, this.cabinMesh, this.tyreMesh]) m.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
  }
}

function rotY(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
