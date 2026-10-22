// Rush Taxi — boots Rapier (WASM) and Three.js, builds the level (the city, or the grey-box test ground with
// ?track=test), runs physics on a fixed 1/60 s step with an accumulator and draws with interpolation between the
// last two steps. Traffic and people move on the same fixed step.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Input, type Controls } from './core/input';
import { Car, HALF } from './vehicle/car';
import { TUNING, type Tuning } from './vehicle/tuning';
import { ChaseCam } from './fx/camera';
import { newRun, tick, type Mode, type RunEvent, type RunState } from './gameplay/rules';
import { RunView } from './gameplay/view';
import { testLevel, type Level } from './world/level';
import { cityLevel } from './world/city';
import { buildPhysics, buildScene } from './world/build';
import { TAXI_GROUPS, Traffic, type TaxiNow } from './world/traffic';
import { People } from './world/people';

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
  level: Level;
  traffic: Traffic | null;
  people: People | null;
}

export async function startGame(canvas: HTMLCanvasElement, onHud: (h: HudState) => void, opts: { lowPower?: boolean; lang?: 'zh' | 'en'; track?: 'city' | 'test'; onEvent?: (e: RunEvent) => void; onPause?: (paused: boolean) => void } = {}): Promise<Game> {
  await RAPIER.init();
  const level = opts.track === 'test' ? testLevel() : cityLevel();
  const SPAWN = level.spawn;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  // ---------- renderer and scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lowPower ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = level.id === 'city' ? new THREE.Fog(PALETTE.sky, 190, 560) : new THREE.Fog(PALETTE.sky, 160, 420);
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

  // ---------- the level: colliders and the drawn world ----------
  const { soft, dynamics } = buildPhysics(RAPIER, world, level);
  const { props } = buildScene(scene, level, opts.lang ?? 'zh');
  const cones = dynamics.map((d, i) => ({ b: d.b, mesh: props[i] }));

  // ---------- the car ----------
  const tuning: Tuning = { ...TUNING };
  const car = new Car(RAPIER, world, SPAWN.p, SPAWN.yaw, tuning);
  car.collider.setCollisionGroups(TAXI_GROUPS);
  const view = new RunView(scene, opts.lang ?? 'zh');
  const traffic = level.graph ? new Traffic(RAPIER, world, scene, level.graph, opts.lowPower ? 22 : 30) : null;
  const people = level.walks.length ? new People(scene, level.walks, opts.lowPower ? 50 : 80) : null;
  /** the last spot where the car stood on flat ground, to come back to after a splash in the river */
  const safe = { p: { ...SPAWN.p }, yaw: SPAWN.yaw, t: 0 };
  let wet = 0;
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

  const taxiNow = (): TaxiNow => {
    const t = car.body.translation(),
      v = car.body.linvel(),
      f = car.forward();
    return { x: t.x, z: t.z, vx: v.x, vz: v.z, yaw: Math.atan2(f.x, f.z), kmh: car.kmh() };
  };
  const step = (c: Controls) => {
    prev.p.copy(cur.p);
    prev.q.copy(cur.q);
    car.update(c, STEP);
    let crash = false;
    let nearMiss = false;
    const tx = taxiNow();
    if (traffic)
      for (const e of traffic.update(STEP, tx)) {
        if (e.t === 'hit') {
          crash = true;
          chase.bump(Math.min(0.4, e.speed / 40));
          // the car flies off; the taxi keeps most of its speed
          const v = car.body.linvel();
          car.body.setLinvel({ x: v.x * 0.8, y: v.y, z: v.z * 0.8 }, true);
        } else nearMiss = true;
      }
    people?.update(STEP, tx);
    world.step(events);
    events.drainContactForceEvents((e) => {
      const a = e.collider1(),
        b = e.collider2();
      const other = a === car.collider.handle ? b : b === car.collider.handle ? a : -1;
      // cars count through the traffic's own hit check (once per car, not again while it flies)
      if (other >= 0 && !soft.has(other) && !traffic?.isCar(other)) crash = true;
    });
    // fell in the river: back to the last flat spot after a moment
    const pos = car.body.translation();
    if (level.water && pos.y < level.water.y - 0.4) {
      wet += STEP;
      if (wet > 0.6) {
        wet = 0;
        car.reset(safe.p, safe.yaw);
        snap(cur);
        prev.p.copy(cur.p);
        prev.q.copy(cur.q);
        chase.snap();
      }
    } else {
      wet = 0;
      safe.t += STEP;
      if (safe.t > 0.5 && car.wheelsDown() >= 3 && Math.abs(pos.y - 0.6) < 0.5 && car.kmh() < 160) {
        const f = car.forward();
        safe.t = 0;
        safe.p = { x: pos.x, y: 1, z: pos.z };
        safe.yaw = Math.atan2(f.x, f.z);
      }
    }
    snap(cur);
    if (run && run.phase === 'play') {
      const landed = car.ev.landings !== landSeen;
      landSeen = car.ev.landings;
      const t = car.body.translation();
      const ev = tick(run, STEP, { x: t.x, z: t.z, kmh: car.kmh(), drifting: car.drifting, airborne: car.airborne, landedAfter: landed ? car.ev.lastAir : 0, crash, nearMiss }, level.stops, level.places);
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
    traffic?.draw();
    people?.draw();
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
      run = mode ? newRun(mode, level.stops, level.places, { x: SPAWN.p.x, z: SPAWN.p.z }, seed ?? (Date.now() & 0x7fffffff)) : null;
      safe.p = { ...SPAWN.p };
      safe.yaw = SPAWN.yaw;
      paused = false;
      acc = 0;
    },
    run: () => run,
    level,
    traffic,
    people,
    setPaused(p) {
      paused = p;
      last = performance.now();
    },
  };
}
