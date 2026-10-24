// Rush Taxi — city traffic. Cars drive on the right-hand lane of the road graph (Taiwan drives on the right), turn
// at random at each crossing and slow down behind whatever is ahead of them, the taxi included.
// On the real map (a RoadNet, ./osm/roadnet.ts) they follow the lanes of the real streets instead: one-way streets
// one way only, a lane picked by the road's width, smooth curves through junctions with a liking for straight on
// and for bigger roads, more cars on the main roads, real traffic lights, and giving way at busy side-street
// crossings. There the cars live near the taxi only: one that falls far behind comes back somewhere around it. They are kinematic
// (they push, nothing pushes them) until the taxi runs into one: then it turns into a light dynamic body and gets
// knocked flying, and a few seconds later it comes back somewhere out of sight. Passing one closely at speed
// without touching is a near miss (a tip with a passenger aboard).
import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { RoadGraph } from './level';
import { sedanGeometry } from '../fx/taxiModel';
import { chooseTurn, laneDensity, phaseLight, type RoadNet } from './osm/roadnet';

type R = typeof RAPIER_NS;
/** collision groups (membership << 16 | filter): the taxi is group 2; a knocked car stops colliding with it, so the
 * taxi drives on instead of bouncing off a car that is already flying away */
export const TAXI_GROUPS = (0x0002 << 16) | 0xffff;
const FLYING_GROUPS = (0x0004 << 16) | (0xffff & ~0x0002);
const LANE = 3.5;
/** traffic lights, shared by every crossing (a 20 s cycle): streets along x go first, then those along z */
export function lightFor(axis: 'x' | 'z', t: number): 'green' | 'yellow' | 'red' {
  return phaseLight(axis === 'x' ? 0 : 1, t);
}
const HALF = { x: 1.0, y: 0.75, z: 2.1 };
const CRUISE = 11; // m/s (about 40 km/h)
const TURN = 6;
const COLORS = ['#E53935', '#1E88E5', '#43A047', '#F5F5F5', '#8E24AA', '#FB8C00', '#546E7A', '#00897B', '#6D4C41'];

interface Piece {
  /** quadratic Bézier from a through c to b (grid city); on the real map a and b are the polyline's ends */
  a: THREE.Vector2;
  c: THREE.Vector2;
  b: THREE.Vector2;
  len: number;
  turn: boolean;
  /** real map: the polyline (x, z pairs) and the distance at each point */
  pts?: Float32Array;
  cum?: Float32Array;
  /** real map: the lane (a lane piece), or the lane it leads into (a turn) */
  lane?: number;
  /** real map: which piece this is (cars on the same piece queue behind each other) */
  key?: number;
  /** real map, turns: the junction node, and the road the car came from */
  node?: number;
  from?: number;
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
  /** real map: the pieces ahead, the current one first */
  route?: Piece[];
  /** real map: seconds spent giving way at the current junction */
  wait?: number;
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
  /** the traffic clock (s): the lights follow it */
  time = 0;
  private adj: number[][];
  private seed: number;
  private bodyMesh: THREE.InstancedMesh;
  private cabinMesh: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private net: RoadNet | null;
  private mids: [number, number][] = [];
  private pieces = new Map<number, Piece>();

  constructor(
    private RAPIER: R,
    private world: RAPIER_NS.World,
    scene: THREE.Scene,
    private graph: RoadGraph,
    count: number,
    seed = 7,
    /** the real map: drive its lanes instead of the graph, spawning around `around` */
    real?: { net: RoadNet; around: { x: number; z: number } },
  ) {
    this.seed = seed;
    this.net = real?.net ?? null;
    if (this.net) this.mids = this.net.lanes.map((l) => l.pts[Math.floor(l.pts.length / 2)]);
    this.adj = graph.nodes.map(() => []);
    for (const [a, b] of graph.edges) this.adj[a].push(b), this.adj[b].push(a);
    const mat = (o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
    // sedans: the paint takes each car's colour, glass, bumpers, lights and wheels keep theirs
    const geo = sedanGeometry();
    this.bodyMesh = new THREE.InstancedMesh(geo.paint, mat({ vertexColors: true }), count);
    this.cabinMesh = new THREE.InstancedMesh(geo.detail, mat({ vertexColors: true }), count);
    this.bodyMesh.castShadow = this.cabinMesh.castShadow = true;
    // the cars move all over the map: a bounding sphere computed once would hide them later
    this.bodyMesh.frustumCulled = this.cabinMesh.frustumCulled = false;
    scene.add(this.bodyMesh, this.cabinMesh);
    const used = new Set<number>();
    for (let i = 0; i < count && this.net; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HALF.y + 0.1, 0));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z).setDensity(70).setRestitution(0.3).setFriction(0.5), body);
      const npc: Npc = { from: 0, to: 0, piece: null as unknown as Piece, s: 0, speed: CRUISE, body, collider, flying: 0, near: 0, nearCool: 0, pos: new THREE.Vector2(), yaw: 0, color: new THREE.Color(COLORS[i % COLORS.length]) };
      this.cars.push(npc);
      this.place(npc, real!.around, 12, 200, null);
    }
    for (let i = 0; i < count && !this.net; i++) {
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
    if (p.pts) {
      const pos = polyAt(p, s);
      // heading from a short chord, so the car turns smoothly over the polyline's corners
      const f = polyAt(p, Math.min(p.len, s + 1.5)),
        b = polyAt(p, Math.max(0, s - 1.5));
      return { pos, yaw: Math.atan2(f.x - b.x, f.y - b.y) };
    }
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
  // ---------- the real map ----------
  private lanePiece(id: number): Piece {
    let p = this.pieces.get(id * 2);
    if (!p) {
      const l = this.net!.lanes[id];
      p = polyPiece(l.pts, false, id * 2);
      p.lane = id;
      this.pieces.set(id * 2, p);
    }
    return p;
  }
  private turnPieceOf(fromLane: number, ti: number): Piece {
    const key = -1 - (fromLane * 16 + ti);
    let p = this.pieces.get(key);
    if (!p) {
      const l = this.net!.lanes[fromLane];
      const t = l.out[ti];
      p = polyPiece(t.pts, true, key);
      p.lane = t.lane;
      p.node = l.to;
      p.from = l.road;
      this.pieces.set(key, p);
    }
    return p;
  }
  /** make sure the route reaches far enough ahead (for the lights) */
  private plan(n: Npc) {
    const r = n.route!;
    let ahead = -n.s;
    for (const p of r) ahead += p.len;
    while (ahead < 70 && r.length < 14) {
      const last = r[r.length - 1];
      let next: Piece;
      if (last.turn) next = this.lanePiece(last.lane!);
      else {
        const t = chooseTurn(this.net!, last.lane!, this.rnd());
        if (!t) break; // a dead end
        next = this.turnPieceOf(last.lane!, this.net!.lanes[last.lane!].out.indexOf(t));
      }
      r.push(next);
      ahead += next.len;
    }
  }
  /** put a car on a lane somewhere between rMin and rMax from `c` (busier roads more often), clear of other cars */
  private place(n: Npc, c: { x: number; z: number }, rMin: number, rMax: number, ahead: { x: number; z: number } | null): void {
    const net = this.net!;
    const cand: number[] = [];
    const wsum: number[] = [];
    let sum = 0;
    net.lanes.forEach((l, i) => {
      const [x, z] = this.mids[i];
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < rMin || d > rMax || !l.out.length || l.len < 4) return;
      let w = laneDensity(l.rank) * l.len;
      // out of sight: not right in front of the taxi
      if (ahead && ((x - c.x) * ahead.x + (z - c.z) * ahead.z) / d > 0.5 && d < 200) w *= 0.15;
      sum += w;
      cand.push(i);
      wsum.push(sum);
    });
    if (!cand.length && rMax < 1e9) return this.place(n, c, 0, 1e9, null);
    for (let tries = 0; tries < 12; tries++) {
      const x = this.rnd() * sum;
      let lo = 0;
      while (lo < wsum.length - 1 && wsum[lo] < x) lo++;
      const id = cand[lo] ?? 0;
      const piece = this.lanePiece(id);
      // not right at a stop line (it could not stop in time)
      const s = this.rnd() * Math.max(0, piece.len - 14);
      const p = polyAt(piece, s);
      if (tries < 11 && this.cars.some((o) => o !== n && o.route && o.pos.distanceTo(p) < 10)) continue;
      n.route = [piece];
      n.piece = piece;
      n.s = s;
      n.wait = 0;
      n.speed = CRUISE * 0.6;
      this.plan(n);
      this.pose(n);
      n.body.setTranslation({ x: n.pos.x, y: HALF.y + 0.1, z: n.pos.y }, true);
      n.body.setRotation(rotY(n.yaw), true);
      n.body.setNextKinematicTranslation({ x: n.pos.x, y: HALF.y + 0.1, z: n.pos.y });
      n.body.setNextKinematicRotation(rotY(n.yaw));
      return;
    }
  }
  /** the speed the lights and give-way rules allow (real map) */
  private realLimit(n: Npc, want: number, busy: Map<number, number[]>, dt: number) {
    const net = this.net!;
    let dist = -n.s;
    let waiting = false;
    for (const p of n.route!) {
      dist += p.len;
      if (dist > 60) break;
      if (p.turn) continue;
      const lane = net.lanes[p.lane!];
      const left = dist;
      const stop = left < 2.8 ? 0 : (left - 2.6) * 0.9;
      if (lane.signal) {
        const light = phaseLight(lane.signal.phase, this.time + lane.signal.t0);
        if (light === 'red' || (light === 'yellow' && left > 7)) want = Math.min(want, stop);
      } else if (lane.yieldAt && left < 14) {
        // give way while another car is crossing this junction from another road; never for long
        const inside = busy.get(lane.to);
        if (inside && inside.some((r) => r !== lane.road) && (n.wait ?? 0) < 3) {
          want = Math.min(want, stop);
          if (left < 4) waiting = true;
        }
      }
      // only the nearest junction with a light or a give-way counts
      if (lane.signal || lane.yieldAt) break;
    }
    n.wait = waiting ? (n.wait ?? 0) + dt : n.piece.turn ? 0 : n.wait;
    return want;
  }
  /** a car the taxi left far behind (or knocked away) comes back on a street somewhere around the taxi */
  private recycle(n: Npc, taxi: TaxiNow, rMin = 75) {
    const sp = Math.hypot(taxi.vx, taxi.vz);
    const ahead = sp > 1 ? { x: taxi.vx / sp, z: taxi.vz / sp } : { x: Math.sin(taxi.yaw), z: Math.cos(taxi.yaw) };
    this.place(n, taxi, rMin, 200, ahead);
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
    if (this.net) {
      n.flying = 0;
      n.near = 0;
      n.body = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HALF.y + 0.1, 0));
      n.collider = this.world.createCollider(this.RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z).setDensity(70).setRestitution(0.3).setFriction(0.5), n.body);
      this.recycle(n, taxi, 90);
      return;
    }
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
    this.time += dt;
    // real map: who is inside each junction right now (the road they came from), for giving way
    const busy = new Map<number, number[]>();
    let recycled = 0;
    if (this.net)
      for (const n of this.cars) {
        if (n.flying || !n.piece.turn) continue;
        const l = busy.get(n.piece.node!);
        if (l) l.push(n.piece.from!);
        else busy.set(n.piece.node!, [n.piece.from!]);
      }
    for (const n of this.cars) {
      if (n.flying > 0) {
        n.flying += dt;
        const t = n.body.translation();
        if (n.flying > 7 || (n.flying > 3 && Math.hypot(t.x - taxi.x, t.z - taxi.z) > 40) || t.y < -4) this.respawn(n, taxi);
        continue;
      }
      // real map: only the streets around the taxi have cars
      if (this.net && recycled < 2 && Math.hypot(n.pos.x - taxi.x, n.pos.y - taxi.z) > 230) {
        recycled++;
        this.recycle(n, taxi);
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
        // on the same piece only the car behind waits (no two cars waiting for each other)
        if (this.net ? o.piece.key === n.piece.key : o.from === n.from && o.to === n.to && o.piece.turn === n.piece.turn) if (o.s <= n.s) continue;
        // real map: two cars crossing the same junction on different curves — the one further through goes first
        if (this.net && n.piece.turn && o.piece.turn && o.piece.node === n.piece.node && o.piece.key !== n.piece.key && o.s / o.piece.len <= n.s / n.piece.len) continue;
        const ox = o.pos.x - n.pos.x,
          oz = o.pos.y - n.pos.y;
        // real map: two cars from different pieces already nose to nose would wait for each other forever; one goes
        if (this.net && o.piece.key !== n.piece.key && ox * ox + oz * oz < 20 && this.cars.indexOf(n) < this.cars.indexOf(o)) continue;
        const fz = ox * s + oz * c,
          fx = ox * c - oz * s;
        if (fz > 0 && fz < gap + HALF.z * 2 && Math.abs(fx) < 2.4 && Math.cos(o.yaw - n.yaw) > 0.3) gap = fz - HALF.z * 2;
      }
      let want = gap < 3 ? 0 : gap < 14 ? Math.min(n.piece.turn ? TURN : CRUISE, (gap - 3) * 1.1) : n.piece.turn ? TURN : CRUISE;
      // red light ahead (crossings with three or more streets): stop at the stop line; on yellow, go if too close
      if (this.net) want = this.realLimit(n, want, busy, dt);
      else if (!n.piece.turn && this.adj[n.to].length >= 3) {
        const A = this.graph.nodes[n.from],
          B = this.graph.nodes[n.to];
        const light = lightFor(Math.abs(B.x - A.x) > Math.abs(B.z - A.z) ? 'x' : 'z', this.time);
        const left = n.piece.len - n.s;
        if (light === 'red' || (light === 'yellow' && left > 7)) want = Math.min(want, left < 2.8 ? 0 : (left - 2.6) * 0.9);
      }
      n.speed += Math.max(-12 * dt, Math.min(4 * dt, want - n.speed));
      n.s += n.speed * dt;
      let stuck = false;
      while (n.s >= n.piece.len) {
        if (!this.net) {
          n.s -= n.piece.len;
          this.next(n);
          continue;
        }
        // real map: on to the next piece of the route; a dead end on a one-way street sends the car elsewhere
        if (n.route!.length < 2) this.plan(n);
        if (n.route!.length < 2) {
          stuck = true;
          break;
        }
        n.s -= n.piece.len;
        n.route!.shift();
        n.piece = n.route![0];
        this.plan(n);
      }
      if (stuck) {
        this.recycle(n, taxi);
        continue;
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
      this.m4.compose(off.set(0, 0.2, 0).applyQuaternion(q).add(p), q, one);
      this.bodyMesh.setMatrixAt(i, this.m4);
      this.bodyMesh.setColorAt(i, n.color);
      this.cabinMesh.setMatrixAt(i, this.m4);
    });
    for (const m of [this.bodyMesh, this.cabinMesh]) m.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
  }
}

/** a polyline piece (real map) */
function polyPiece(pts: [number, number][], turn: boolean, key: number): Piece {
  const P = new Float32Array(pts.length * 2);
  const C = new Float32Array(pts.length);
  pts.forEach(([x, z], i) => {
    P[i * 2] = x;
    P[i * 2 + 1] = z;
    if (i) C[i] = C[i - 1] + Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
  });
  const len = Math.max(0.05, C[pts.length - 1]);
  const a = new THREE.Vector2(pts[0][0], pts[0][1]),
    b = new THREE.Vector2(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  return { a, b, c: a.clone().add(b).multiplyScalar(0.5), len, turn, pts: P, cum: C, key };
}
function polyAt(p: Piece, s: number) {
  const C = p.cum!,
    P = p.pts!;
  const n = C.length;
  if (s <= 0) return new THREE.Vector2(P[0], P[1]);
  let i = 1;
  while (i < n - 1 && C[i] < s) i++;
  const L = C[i] - C[i - 1];
  const t = L > 0 ? Math.min(1, (s - C[i - 1]) / L) : 1;
  return new THREE.Vector2(P[i * 2 - 2] + (P[i * 2] - P[i * 2 - 2]) * t, P[i * 2 - 1] + (P[i * 2 + 1] - P[i * 2 - 1]) * t);
}

function rotY(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
