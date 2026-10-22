// Rush Taxi — stage 1 grey box. Boots Rapier (WASM) and Three.js, builds the test ground, runs physics on a fixed
// 1/60 s step with an accumulator and draws with interpolation between the last two steps.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Input, type Controls } from './core/input';
import { Car, HALF } from './vehicle/car';
import { TUNING, type Tuning } from './vehicle/tuning';
import { ChaseCam } from './fx/camera';
import { GROUND, greybox, wedgePoints, type Shape } from './world/greybox';
import { newRun, tick, type Mode, type RunEvent, type RunState } from './gameplay/rules';
import { PLACES, STOPS } from './gameplay/places';
import { RunView } from './gameplay/view';

export const STEP = 1 / 60;
const PALETTE = { sky: '#8FD0F5', asphalt: '#3A3F47', taxi: '#FFC72C', ink: '#23303F', tyre: '#1E2228', glass: '#5C7A99' };

export interface HudState {
  kmh: number;
  drifting: boolean;
  airborne: boolean;
  rush: boolean;
  fps: number;
  events: Car['ev'];
  run: RunState | null;
  /** where the guide arrow points, relative to the camera (deg, 0 = straight ahead, + = right), and how far (m) */
  arrow: { deg: number; dist: number; to: 'dest' | 'pickup' } | null;
}

export interface Game {
  dispose(): void;
  input: Input;
  car: Car;
  tuning: Tuning;
  resize(): void;
  /** put the car somewhere (tests, and later the "reset" button); the camera jumps with it */
  place(p: { x: number; y: number; z: number }, yaw: number): void;
  /** test hook: run the simulation for `seconds` of game time right now (rendering one frame after) */
  ff(seconds: number, c?: Partial<Controls>): void;
  stats(): { drawCalls: number; triangles: number };
  /** start an arcade run (50 s) or free practice; null ends it (free driving) */
  startRun(mode: Mode | null, seed?: number): void;
  run(): RunState | null;
  setPaused(p: boolean): void;
}

export const SPAWN = { p: { x: 0, y: 1.0, z: -60 }, yaw: 0 };

export async function startGame(canvas: HTMLCanvasElement, onHud: (h: HudState) => void, opts: { lowPower?: boolean; lang?: 'zh' | 'en'; onEvent?: (e: RunEvent) => void; onPause?: (paused: boolean) => void } = {}): Promise<Game> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  // ---------- renderer and scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lowPower ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 160, 420);
  scene.add(new THREE.HemisphereLight('#EAF6FF', '#6B6F5A', 1.6));
  const sun = new THREE.DirectionalLight('#FFF4DC', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -18;
  sc.right = sc.top = 18;
  sc.near = 1;
  sc.far = 80;
  scene.add(sun, sun.target);
  const chase = new ChaseCam(canvas.clientWidth / Math.max(1, canvas.clientHeight));

  // ground: asphalt with a light grid so speed reads well
  const groundCol = world.createCollider(RAPIER.ColliderDesc.cuboid(GROUND / 2, 0.5, GROUND / 2).setTranslation(0, -0.5, 0).setFriction(1));
  /** hits on these never count as a crash (the ground, knock-over props) */
  const soft = new Set<number>([groundCol.handle]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(GROUND, GROUND / 10, '#5A616B', '#4A5059');
  (grid.position.y = 0.02), scene.add(grid);

  // ---------- the test ground: static boxes in one instanced mesh, wedges, dynamic cones ----------
  const shapes = greybox();
  const statics = shapes.filter((s): s is Extract<Shape, { kind: 'box' }> => s.kind === 'box' && !s.dynamic);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ flatShading: true }), statics.length);
  const m4 = new THREE.Matrix4();
  statics.forEach((s, i) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw ?? 0);
    m4.compose(new THREE.Vector3(...s.p), q, new THREE.Vector3(...s.size));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, new THREE.Color(s.color));
    world.createCollider(RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2).setTranslation(...s.p).setRotation({ x: 0, y: Math.sin((s.yaw ?? 0) / 2), z: 0, w: Math.cos((s.yaw ?? 0) / 2) }).setRestitution(0.2).setFriction(0.4));
  });
  scene.add(inst);
  for (const s of shapes) {
    if (s.kind !== 'wedge') continue;
    const pts = wedgePoints(s.size);
    const flat = new Float32Array(pts.flat());
    const rot = { x: 0, y: Math.sin((s.yaw ?? 0) / 2), z: 0, w: Math.cos((s.yaw ?? 0) / 2) };
    const desc = RAPIER.ColliderDesc.convexHull(flat);
    if (desc) world.createCollider(desc.setTranslation(...s.p).setRotation(rot).setFriction(1));
    const g = new THREE.BufferGeometry();
    // two sides, slope, back, bottom omitted (never seen)
    const tri = [0, 2, 4, 1, 5, 3, 0, 4, 5, 0, 5, 1, 2, 3, 5, 2, 5, 4];
    const pos: number[] = [];
    for (const i of tri) pos.push(...pts[i]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: s.color, flatShading: true, side: THREE.DoubleSide }));
    mesh.position.set(...s.p);
    mesh.rotation.y = s.yaw ?? 0;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const cones = shapes
    .filter((s): s is Extract<Shape, { kind: 'box' }> => s.kind === 'box' && !!s.dynamic)
    .map((s) => {
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...s.p));
      soft.add(world.createCollider(RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2).setDensity(40).setRestitution(0.3), b).handle);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s.size), new THREE.MeshLambertMaterial({ color: s.color }));
      mesh.castShadow = true;
      scene.add(mesh);
      return { b, mesh };
    });

  // ---------- the car ----------
  const tuning: Tuning = { ...TUNING };
  const car = new Car(RAPIER, world, SPAWN.p, SPAWN.yaw, tuning);
  const view = new RunView(scene, opts.lang ?? 'zh');
  const events = new RAPIER.EventQueue(true);
  let run: RunState | null = null;
  let landSeen = 0;
  const carGroup = new THREE.Group();
  const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(HALF.x * 2, HALF.y * 2, HALF.z * 2), mat(PALETTE.taxi));
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.0), mat(PALETTE.glass));
  cabin.position.set(0, HALF.y + 0.3, -0.25);
  const roofSign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.3), mat('#FFFFFF'));
  roofSign.position.set(0, HALF.y + 0.72, -0.2);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(HALF.x * 2 + 0.02, 0.12, HALF.z * 2 - 0.4), mat(PALETTE.ink));
  stripe.position.y = 0.05;
  for (const m of [bodyMesh, cabin, roofSign]) m.castShadow = true;
  carGroup.add(bodyMesh, cabin, roofSign, stripe);
  scene.add(carGroup);
  const wheelGeo = new THREE.CylinderGeometry(tuning.wheelRadius, tuning.wheelRadius, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [0, 1, 2, 3].map(() => {
    const w = new THREE.Mesh(wheelGeo, mat(PALETTE.tyre));
    w.castShadow = true;
    scene.add(w);
    return w;
  });

  // ---------- loop: fixed step + interpolation ----------
  const input = new Input();
  const prev = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const cur = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const snap = (o: typeof cur) => {
    const t = car.body.translation(),
      r = car.body.rotation();
    o.p.set(t.x, t.y, t.z);
    o.q.set(r.x, r.y, r.z, r.w);
  };
  snap(cur);
  prev.p.copy(cur.p);
  prev.q.copy(cur.q);
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let paused = false;
  let landings = 0;
  let frames = 0,
    fpsT = last,
    fps = 60;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const occlude = (from: THREE.Vector3, to: THREE.Vector3) => {
    const d = to.clone().sub(from);
    const len = d.length();
    d.normalize();
    ray.origin = { x: from.x, y: from.y, z: from.z };
    ray.dir = { x: d.x, y: d.y, z: d.z };
    const hit = world.castRay(ray, len, true, undefined, undefined, car.collider, car.body);
    return hit ? hit.timeOfImpact : len;
  };

  const step = (c: Controls) => {
    prev.p.copy(cur.p);
    prev.q.copy(cur.q);
    car.update(c, STEP);
    world.step(events);
    let crash = false;
    events.drainContactForceEvents((e) => {
      const a = e.collider1(),
        b = e.collider2();
      const other = a === car.collider.handle ? b : b === car.collider.handle ? a : -1;
      if (other >= 0 && !soft.has(other)) crash = true;
    });
    snap(cur);
    if (run && run.phase === 'play') {
      const landed = car.ev.landings !== landSeen;
      landSeen = car.ev.landings;
      const t = car.body.translation();
      const ev = tick(run, STEP, { x: t.x, z: t.z, kmh: car.kmh(), drifting: car.drifting, airborne: car.airborne, landedAfter: landed ? car.ev.lastAir : 0, crash, nearMiss: false }, STOPS, PLACES);
      for (const e of ev) opts.onEvent?.(e);
    }
  };
  const draw = (alpha: number, dt: number) => {
    const p = prev.p.clone().lerp(cur.p, alpha);
    const q = prev.q.clone().slerp(cur.q, alpha);
    carGroup.position.copy(p);
    carGroup.quaternion.copy(q);
    for (let i = 0; i < 4; i++) {
      const cp = car.vehicle.wheelChassisConnectionPointCs(i);
      const len = car.vehicle.wheelSuspensionLength(i) ?? tuning.suspRest;
      if (!cp) continue;
      const w = wheels[i];
      // the wheel centre sits below its connection point (car space) by the current suspension length
      w.position.set(cp.x, cp.y - len, cp.z).applyQuaternion(q).add(p);
      w.quaternion.copy(q);
      w.rotateY(i < 2 ? car.steer : 0);
      w.rotateX(car.vehicle.wheelRotation(i) ?? 0);
    }
    for (const c of cones) {
      const t = c.b.translation(),
        r = c.b.rotation();
      c.mesh.position.set(t.x, t.y, t.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (car.ev.landings !== landings) {
      landings = car.ev.landings;
      chase.bump(Math.min(0.5, car.ev.lastLanding / 25));
    }
    const lv = car.body.linvel();
    chase.update(
      { pos: p, fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), vel: new THREE.Vector3(lv.x, lv.y, lv.z), kmh: car.kmh(), drifting: car.drifting, steer: lastControls.steer, airborne: car.airborne },
      dt,
      occlude,
    );
    sun.position.set(p.x + 20, p.y + 40, p.z + 10);
    sun.target.position.copy(p);
    view.update(run, p, performance.now() / 1000);
    renderer.render(scene, chase.cam);
    // the guide arrow: to the destination while carrying, otherwise to the nearest waiting passenger
    let arrow: HudState['arrow'] = null;
    if (run && run.phase === 'play') {
      const tgt = run.rider ? run.rider.dest : [...run.waiting].sort((a, b) => Math.hypot(a.stop.x - p.x, a.stop.z - p.z) - Math.hypot(b.stop.x - p.x, b.stop.z - p.z))[0]?.stop;
      if (tgt) {
        const cf = new THREE.Vector3();
        chase.cam.getWorldDirection(cf);
        const camYaw = Math.atan2(cf.x, cf.z);
        const toYaw = Math.atan2(tgt.x - p.x, tgt.z - p.z);
        // + = to the right of where the camera looks (yaw grows towards +x, which is screen-left)
        const d = -Math.atan2(Math.sin(toYaw - camYaw), Math.cos(toYaw - camYaw));
        arrow = { deg: (d * 180) / Math.PI, dist: Math.hypot(tgt.x - p.x, tgt.z - p.z), to: run.rider ? 'dest' : 'pickup' };
      }
    }
    onHud({ kmh: car.kmh(), drifting: car.drifting, airborne: car.airborne, rush: car.rushLeft > 0, fps, events: car.ev, run, arrow });
  };
  let lastControls: Controls = { throttle: 0, brake: 0, steer: 0, drift: false, rush: false, reset: false, pause: false, dev: false };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frames++;
    if (now - fpsT > 500) {
      fps = Math.round((frames * 1000) / (now - fpsT));
      frames = 0;
      fpsT = now;
    }
    const c = input.read();
    if (c.pause && run?.phase !== 'over') {
      paused = !paused;
      opts.onPause?.(paused);
    }
    if (paused) return;
    lastControls = c;
    acc += dt;
    let n = 0;
    // the first step of a frame gets this frame's edge presses; later steps the held state only
    while (acc >= STEP && n < 6) {
      step(n === 0 ? c : { ...c, rush: false, reset: false });
      acc -= STEP;
      n++;
    }
    if (n === 6) acc = 0; // too slow to keep up: drop time rather than spiral
    draw(acc / STEP, dt);
  };
  raf = requestAnimationFrame(frame);

  const resize = () => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    chase.cam.aspect = w / Math.max(1, h);
    chase.cam.updateProjectionMatrix();
  };
  resize();

  return {
    input,
    car,
    tuning,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      input.dispose();
      renderer.dispose();
      world.free();
    },
    place(pos, yaw) {
      car.reset(pos, yaw);
      snap(cur);
      prev.p.copy(cur.p);
      prev.q.copy(cur.q);
      chase.snap();
    },
    ff(seconds, c) {
      const ctl: Controls = { throttle: 0, brake: 0, steer: 0, drift: false, rush: false, reset: false, pause: false, dev: false, ...c };
      const n = Math.round(seconds / STEP);
      for (let k = 0; k < n; k++) step(k === 0 ? ctl : { ...ctl, rush: false, reset: false });
      lastControls = ctl;
      prev.p.copy(cur.p);
      prev.q.copy(cur.q);
      draw(1, Math.max(STEP, Math.min(1, seconds))); // a longer camera step so it catches up after a jump in time
    },
    stats: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    startRun(mode, seed) {
      view.clear();
      car.reset(SPAWN.p, SPAWN.yaw);
      snap(cur);
      prev.p.copy(cur.p);
      prev.q.copy(cur.q);
      chase.snap();
      landSeen = car.ev.landings;
      run = mode ? newRun(mode, STOPS, PLACES, { x: SPAWN.p.x, z: SPAWN.p.z }, seed ?? (Date.now() & 0x7fffffff)) : null;
      paused = false;
      acc = 0;
    },
    run: () => run,
    setPaused(p) {
      paused = p;
      last = performance.now();
    },
  };
}
