// Rush Taxi — boots Rapier (WASM) and Three.js, builds the level (the city, or the grey-box test ground with
// ?track=test), runs physics on a fixed 1/60 s step with an accumulator and draws with interpolation between the
// last two steps. Traffic and people move on the same fixed step.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Input, type Controls } from './core/input';
import { Car, HALF } from './vehicle/car';
import { TUNING, type Tuning } from './vehicle/tuning';
import { ChaseCam } from './fx/camera';
import { OCC_CAR_LIFT, sightCheck, updateOcclusion } from './fx/occlusion';
import { buildTaxi } from './fx/taxiModel';
import { Effects } from './fx/effects';
import type { EngineState, SfxEvent } from './audio/sfx';
import { carById, driverById, tuningFor } from './vehicle/roster';
import { createPost, type Post } from './fx/post';
import { FrameBudget, detectQuality, pickQuality, pixelRatioFor, stepDown, type Quality, type QualityPref } from './fx/quality';
import { newRun, tick, type Mode, type RunEvent, type RunState } from './gameplay/rules';
import { RunView } from './gameplay/view';
import { testLevel, type Level } from './world/level';
import { cityLevel } from './world/city';
import { osmLevel } from './world/osm/level';
import { buildPhysics, buildScene } from './world/build';
import { drawSky } from './world/decor';
import { TAXI_GROUPS, Traffic, type TaxiNow } from './world/traffic';
import { People } from './world/people';
import { cycleT, lightingAt, type Lighting, type TimeSetting } from './fx/timeOfDay';
import { headlightBeams, uNight } from './fx/nightGlow';
import { bindEnvironment, setSurfaceQuality, setWet } from './fx/surfaces';
import { createEnvironment } from './fx/envLight';
import { WaterMirror } from './fx/waterMirror';

export const STEP = 1 / 60;
// the sky, fog, sun and fill come from fx/timeOfDay.ts (day = a clear subtropical afternoon, sunset, night)
const PALETTE = { sky: '#9BD3F2', asphalt: '#3A3F47', taxi: '#FFC72C', ink: '#23303F', tyre: '#1E2228', glass: '#5C7A99' };

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
  /** the main scene's draw calls and triangles; `post` = the composer's own full-screen passes, counted apart */
  stats(): { drawCalls: number; triangles: number; post: { calls: number; triangles: number } };
  /** the quality tier in use, the player's choice, and the post passes that ran in the last frame */
  quality(): { tier: Quality; pref: QualityPref; adaptive: boolean; composer: boolean; passes: string[]; pixelRatio: number; antialias: boolean; steps: Quality[] };
  /** the pause menu's 畫質 choice (applied at once; the canvas's MSAA stays as it was created) */
  setQuality(pref: QualityPref): void;
  /** test hook: the cab's colour on screen with and without the colour grade (display values 0..255) */
  cabColour(): { at: [number, number]; plain: number[]; graded: number[] } | null;
  /** test hook: is anything opaque between the camera and the taxi, or a board right in front of the lens? */
  sight(): ReturnType<typeof sightCheck>;
  /** start an arcade run (50 s) or free practice; null ends it (free driving) */
  startRun(mode: Mode | null, seed?: number): void;
  run(): RunState | null;
  setPaused(p: boolean): void;
  /** choose the cab and the driver (the car's handling and look change) */
  setCar(carId: string, driverId: string): void;
  /** the menu: a slow aerial orbit of the city instead of the chase camera */
  setMenu(on: boolean): void;
  /** time of day: 白天 / 黃昏 / 夜晚 fixed, or 自動 (one day in six minutes of play) */
  setTime(s: TimeSetting): void;
  /** read-only (tests): the current setting, the point of the day cycle and how far the city lights are on */
  timeOfDay(): { setting: TimeSetting; t: number; lights: number };
  /** re-render the environment map (reflections) from the current sky, lights and fog; call after changing them */
  refreshEnvironment(): void;
  /** how wet the streets are, 0 (dry, the default) … 1: darker asphalt, puddles that reflect the sky */
  setWet(v: number): void;
  /** read-only, for the minimap: where the car is, which way it points (yaw) and which way the camera looks (view) */
  pose(): { x: number; z: number; yaw: number; view: number };
  level: Level;
  traffic: Traffic | null;
  people: People | null;
}

/** what the game needs from the sound system (it is created on the page, after the first tap) */
export interface GameAudio {
  engine(s: EngineState | null): void;
  effect(e: SfxEvent, strength?: number): void;
}

export async function startGame(canvas: HTMLCanvasElement, onHud: (h: HudState) => void, opts: { lowPower?: boolean; quality?: QualityPref; lang?: 'zh' | 'en'; track?: 'city' | 'grid' | 'test'; onEvent?: (e: RunEvent) => void; onPause?: (paused: boolean) => void; audio?: GameAudio } = {}): Promise<Game> {
  await RAPIER.init();
  // the real-map Kaohsiung is the city; ?track=grid keeps the stage 3 hand-made grid city, ?track=test the test ground
  const level = opts.track === 'test' ? testLevel() : opts.track === 'grid' ? cityLevel() : osmLevel();
  const SPAWN = level.spawn;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  // ---------- renderer and scene ----------
  // the quality tier (fx/quality.ts): the canvas MSAA is fixed when the context is made, so it follows the first
  // tier: on for mid (tablets: cheaper than an FXAA pass on tile GPUs) and high (SMAA does the scene, MSAA only the
  // final blit), off for low
  const search = typeof location === 'undefined' ? '' : location.search;
  let pref: QualityPref = opts.quality ?? 'auto';
  const first = pickQuality(pref, detectQuality(null, !!opts.lowPower), search);
  const antialias = first.tier !== 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
  let pick = pickQuality(pref, detectQuality(renderer, !!opts.lowPower), search);
  renderer.setPixelRatio(pixelRatioFor(pick.tier, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // no tone mapping on purpose: ACES and AgX shift the taxi yellow towards orange, and the neutral curve's toe
  // crushes the asphalt and the shadows to near black; the lights below are balanced so sunlit faces just reach
  // their base colour (taxi yellow stays #FFC72C) and shade stays readable
  renderer.toneMapping = THREE.NoToneMapping;
  // materials and reflections follow the quality tier (fx/surfaces.ts says what each tier gets)
  const quality = pick.tier;
  setSurfaceQuality(quality);
  const scene = new THREE.Scene();
  const city = level.id === 'city';
  const bg = new THREE.Color(PALETTE.sky);
  scene.background = bg;
  // light haze only: by day it starts past the next few blocks and ends just inside the camera's far plane
  // (900 m), so the skyline stays readable from the menu and the edge of the world still melts into the horizon
  const fog = city ? new THREE.Fog('#E8E6DA', 260, 860) : new THREE.Fog(PALETTE.sky, 160, 420);
  scene.fog = fog;
  const sky = city ? drawSky(scene, '#E8E6DA', '#2F86DA', '#F7E3BC') : null;
  // a sky fill and a ground bounce, kept lower than the sun so shaded sides read darker than lit ones
  const hemi = new THREE.HemisphereLight('#CFE8FF', '#8C7B5E', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFEACB', 2.6);
  const sunDir = new THREE.Vector3(-0.52, 0.78, 0.34).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -18;
  sc.right = sc.top = 18;
  sc.near = 1;
  sc.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.position.copy(sunDir); // (moved with the car every frame; the direction is what the environment map needs)
  scene.add(sun, sun.target);
  const chase = new ChaseCam(canvas.clientWidth / Math.max(1, canvas.clientHeight));
  scene.add(chase.cam); // the speed streaks ride on the camera
  const fx = new Effects(scene, chase.cam);
  // post-processing per tier (fx/post.ts): GTAO, bloom, grade and SMAA on desktops; none on tablets and phones
  let post: Post = createPost(renderer, scene, chase.cam, pick.tier);
  const budget = new FrameBudget();
  const steps: Quality[] = [];
  const camLast = new THREE.Vector3();
  let camSpeed = 0;
  renderer.info.autoReset = false;
  let hitCool = 0;
  let pendingHit = 0;
  let puffT = 0;

  // ---------- the level: colliders and the drawn world ----------
  const { soft, dynamics } = buildPhysics(RAPIER, world, level);
  const { props, faded, waters, update: updateWorld } = buildScene(scene, level, opts.lang ?? 'zh');
  // reflections: an environment map from the sky for the materials that reflect (mid, high), a real mirror on the
  // water (high)
  const env = quality === 'low' ? null : createEnvironment(renderer, scene, sky, quality === 'high' ? 128 : 64);
  env?.refresh();
  bindEnvironment(env?.texture ?? null); // the texture object stays the same across refreshes
  const mirror = quality === 'high' && waters.length ? new WaterMirror(waters, level.water?.y ?? waters[0].position.y) : null;
  let worldClock = 0;
  const cones = dynamics.map((d, i) => ({ b: d.b, mesh: props[i] }));

  // ---------- the car ----------
  const tuning: Tuning = { ...TUNING };
  const car = new Car(RAPIER, world, SPAWN.p, SPAWN.yaw, tuning);
  car.collider.setCollisionGroups(TAXI_GROUPS);
  const view = new RunView(scene, opts.lang ?? 'zh');
  // the real map: traffic on its lanes and people on its sidewalks, both kept around the taxi
  const traffic = level.graph ? new Traffic(RAPIER, world, scene, level.graph, opts.lowPower ? 22 : 30, 7, level.roadnet ? { net: level.roadnet, around: SPAWN.p } : undefined) : null;
  const people = level.walks.length ? new People(scene, level.walks, opts.lowPower ? 50 : 80, 11, level.osm ? SPAWN.p : undefined) : null;
  /** the last spot where the car stood on flat ground, to come back to after a splash in the river */
  const safe = { p: { ...SPAWN.p }, yaw: SPAWN.yaw, t: 0 };
  let wet = 0;
  const events = new RAPIER.EventQueue(true);
  let run: RunState | null = null;
  let landSeen = 0;
  let taxi = buildTaxi(tuning.wheelRadius);
  let carGroup = taxi.group;
  scene.add(carGroup);
  let wheels = taxi.wheels;
  for (const w of wheels) scene.add(w);
  let landBump = 0;
  let rushSeen = 0;
  let menu = false;
  let orbit = 0;
  // ---------- time of day ----------
  let tod: TimeSetting = 'day';
  let todClock = 0; // seconds of auto time
  let todT = -1;
  const beams = headlightBeams(-2.05);
  scene.add(beams);
  const applyLight = (L: Lighting) => {
    sunDir.set(...L.sunDir);
    sun.color.set(L.sunColor);
    sun.intensity = L.sunIntensity * L.exposure;
    hemi.color.set(L.hemiSky);
    hemi.groundColor.set(L.hemiGround);
    hemi.intensity = L.hemiIntensity * L.exposure;
    uNight.value = L.lights;
    if (!city) return;
    fog.color.set(L.fogColor);
    fog.near = L.fogNear;
    fog.far = L.fogFar;
    bg.set(L.skyHorizon);
    sky?.recolour({ horizon: L.skyHorizon, glow: L.skyGlow, zenith: L.skyZenith, pale: L.skyPale, cloud: L.cloudColor, cloudEmissive: L.cloudEmissive });
  };
  /** re-light only when the cycle has moved enough to see (auto moves ~0.0003 per second) */
  const updateTime = (dt: number) => {
    if (tod === 'auto') todClock += dt;
    const t = cycleT(tod, todClock);
    if (Math.abs(t - todT) < 0.0004) return;
    todT = t;
    applyLight(lightingAt(t));
    // reflections follow the sky: re-capture the environment map when the light has changed visibly
    if (env && Math.abs(t - envT) > 0.01) {
      envT = t;
      env.refresh();
    }
  };
  let envT = -1;
  updateTime(0);

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

  const poseDir = new THREE.Vector3();
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
          opts.audio?.effect('hit', e.speed / 15);
          // the car flies off; the taxi keeps most of its speed
          const v = car.body.linvel();
          car.body.setLinvel({ x: v.x * 0.8, y: v.y, z: v.z * 0.8 }, true);
        } else {
          nearMiss = true;
          opts.audio?.effect('near');
        }
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
    hitCool = Math.max(0, hitCool - STEP);
    if (crash && hitCool === 0) {
      pendingHit = Math.max(pendingHit, 6 + car.kmh() / 6);
      hitCool = 0.35;
    }
    snap(cur);
    if (run && run.phase === 'play') {
      const landed = car.ev.landings !== landSeen;
      landSeen = car.ev.landings;
      const t = car.body.translation();
      const ev = tick(run, STEP, { x: t.x, z: t.z, kmh: car.kmh(), drifting: car.drifting, airborne: car.airborne, landedAfter: landed ? car.ev.lastAir : 0, crash, nearMiss }, level.stops, level.places);
      for (const e of ev) {
        if (e.t === 'pickup' || e.t === 'drop') fx.coinBurst(cur.p, e.t === 'drop' ? 16 : 8);
        opts.onEvent?.(e);
      }
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
    worldClock += dt;
    updateWorld(traffic ? traffic.time : worldClock, dt);
    for (const c of cones) {
      const t = c.b.translation(),
        r = c.b.rotation();
      c.mesh.position.set(t.x, t.y, t.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (car.ev.landings !== landings) {
      landings = car.ev.landings;
      chase.bump(Math.min(0.5, car.ev.lastLanding / 25));
      landBump = Math.min(1, car.ev.lastLanding / 8);
      if (car.ev.lastLanding > 3) fx.dust(p, car.ev.lastLanding);
      if (car.ev.lastLanding > 2) opts.audio?.effect('land', car.ev.lastLanding / 8);
    }
    // tyre smoke and marks from the rear wheels: drifting, hard braking, wheelspin
    {
      const v = car.body.linvel();
      const vel = new THREE.Vector3(v.x, v.y, v.z);
      const down = car.wheelsDown() >= 2 && !car.airborne;
      const hardBrake = lastControls.brake > 0.5 && car.speed() > 8;
      const spin = lastControls.throttle > 0.5 && car.kmh() < 22 && (car.rushLeft > 0 || car.kmh() > 2);
      const smoking = down && (car.drifting || hardBrake || spin);
      puffT += dt;
      for (const i of [2, 3]) {
        const at = wheels[i].position.clone().setY(Math.max(0.15, wheels[i].position.y - tuning.wheelRadius + 0.15));
        if (smoking && puffT > 0.035) fx.puff(at, vel, car.drifting);
        fx.mark(i - 2, down && (car.drifting || hardBrake) ? at : null);
      }
      if (puffT > 0.035) puffT = 0;
      if (pendingHit) {
        const f = car.forward();
        fx.hit(p.clone().add(new THREE.Vector3(f.x * 2.1, 0.5, f.z * 2.1)), new THREE.Vector3(-f.x, 0, -f.z), pendingHit);
        opts.audio?.effect('crash', pendingHit / 20);
        pendingHit = 0;
      }
      fx.update(dt, car.kmh());
      if (car.ev.rush !== rushSeen) {
        rushSeen = car.ev.rush;
        opts.audio?.effect('rush');
      }
      opts.audio?.engine(menu ? null : { kmh: car.kmh(), throttle: lastControls.throttle, skid: car.drifting ? 1 : hardBrake ? 0.8 : spin ? 0.5 : 0, airborne: car.airborne });
    }
    landBump = Math.max(0, landBump - dt * 2.5);
    taxi.animate({ steer: lastControls.steer, throttle: lastControls.throttle, braking: lastControls.brake > 0.5 && car.speed() > 1, airborne: car.airborne, bump: landBump, dt });
    const lv = car.body.linvel();
    chase.update(
      { pos: p, fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), vel: new THREE.Vector3(lv.x, lv.y, lv.z), kmh: car.kmh(), drifting: car.drifting, steer: lastControls.steer, airborne: car.airborne },
      dt,
      occlude,
    );
    // the shadow box (36 m square) is centred a little ahead of the car, where the chase camera looks
    const ahead = new THREE.Vector3(0, 0, 6).applyQuaternion(q);
    sun.target.position.set(p.x + ahead.x, p.y, p.z + ahead.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 45);
    updateTime(dt);
    // the taxi's beams on the road, at night only (flat on the ground under the car; off in the air)
    beams.visible = uNight.value > 0.02 && !car.airborne;
    if (beams.visible) {
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      beams.position.set(p.x, p.y - 0.53, p.z); // the body rides about 0.6 m above the road
      beams.rotation.set(0, Math.atan2(f.x, f.z), 0);
    }
    view.update(run, p, performance.now() / 1000);
    if (menu) {
      // the menu's background: a slow aerial orbit over the Love River (radius and height keep the draw calls in the
      // tablet budget: 290 m / 150 m saw the whole grid city, 165 calls and 377k triangles)
      // real-map city: round the Love River mouth (Music Center, True Love Pier, Pier-2, the harbour), with the 85
      // tower on the skyline; mostly water and low sheds there, so it stays in budget
      orbit += dt * 0.045;
      const [ox, oz, or, oh] = level.osm ? [-560, -60, 170, 120] : [0, 0, 130, 170];
      chase.cam.position.set(ox + Math.cos(orbit) * or, oh, oz + Math.sin(orbit) * or);
      chase.cam.lookAt(ox, 10, oz);
      if (Math.abs(chase.cam.fov - 55) > 0.1) {
        chase.cam.fov = 55;
        chase.cam.updateProjectionMatrix();
      }
    }
    // test hook (screenshots of the landmarks): a fixed camera [x, y, z, look-at x, y, z]
    const peek = (globalThis as { __taxiPeek?: number[] }).__taxiPeek;
    if (peek) (chase.cam.position.set(peek[0], peek[1], peek[2]), chase.cam.lookAt(peek[3], peek[4], peek[5]));
    // boards and landmark parts between the lens and the cab dither away (off for the menu's orbit)
    updateOcclusion(chase.cam.position, p.clone().setY(p.y + OCC_CAR_LIFT), !menu);
    sky?.position.set(chase.cam.position.x, 0, chase.cam.position.z);
    mirror?.update(renderer, scene, chase.cam); // before the counters reset: X-13 measures the main scene
    renderer.info.reset();
    // depth of field only on the menu orbit and the results, never while driving
    if (dt > 0) camSpeed += (chase.cam.position.distanceTo(camLast) / dt - camSpeed) * Math.min(1, dt * 4);
    camLast.copy(chase.cam.position);
    const still = menu || run?.phase === 'over';
    post.render(dt, { dof: still, focus: menu ? chase.cam.position.length() : chase.cam.position.distanceTo(p), camSpeed: menu ? camSpeed : 0 });
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
    const rawMs = now - last;
    const dt = Math.min(0.1, rawMs / 1000);
    last = now;
    frames++;
    if (now - fpsT > 500) {
      fps = Math.round((frames * 1000) / (now - fpsT));
      frames = 0;
      fpsT = now;
    }
    const read = input.read();
    // on the menu and in the garage the parked cab ignores the keys and the touch controls
    const c: Controls = menu ? { ...read, throttle: 0, brake: 0, steer: 0, drift: false, rush: false, reset: false } : read;
    if (c.pause && run?.phase !== 'over' && !menu) {
      paused = !paused;
      opts.onPause?.(paused);
    }
    if (paused) return;
    // 自動: a 5 s average over 20 ms per frame steps the tier down once (never back up)
    if (pick.adaptive && budget.sample(rawMs)) {
      const down = stepDown(pick.tier);
      if (down) {
        steps.push(down);
        applyTier(down, true);
      }
    }
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
    post.setSize(w, h);
    mirror?.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    chase.cam.aspect = w / Math.max(1, h);
    chase.cam.updateProjectionMatrix();
    fx.resize(h * renderer.getPixelRatio(), chase.cam.fov);
  };
  resize();
  function applyTier(t: Quality, adaptive: boolean) {
    pick = { tier: t, adaptive };
    renderer.setPixelRatio(pixelRatioFor(t, window.devicePixelRatio));
    post.dispose();
    post = createPost(renderer, scene, chase.cam, t);
    budget.reset();
    resize();
  }
  const pixel = (x: number, y: number) => {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0], px[1], px[2]];
  };

  return {
    input,
    car,
    tuning,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      input.dispose();
      post.dispose();
      mirror?.dispose();
      bindEnvironment(null);
      env?.dispose();
      setWet(0);
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
    sight: () => sightCheck(scene, chase.cam, carGroup, faded),
    stats: () => ({ drawCalls: post.scene.calls, triangles: post.scene.triangles, post: { ...post.post } }),
    quality: () => ({ tier: post.tier, pref, adaptive: pick.adaptive, composer: !!post.composer, passes: post.passes(), pixelRatio: renderer.getPixelRatio(), antialias, steps: [...steps] }),
    setQuality(p) {
      pref = p;
      const next = pickQuality(p, detectQuality(renderer, !!opts.lowPower), search);
      if (next.tier !== post.tier) applyTier(next.tier, next.adaptive);
      else pick = next;
    },
    cabColour() {
      // the cab's body on screen: of a small grid around the projected car centre, the most taxi-yellow pixel of the
      // ungraded frame, then the same pixel with the grade on
      const c = carGroup.position.clone().setY(carGroup.position.y + 0.45).project(chase.cam);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const cx = Math.round(((c.x + 1) / 2) * size.x),
        cy = Math.round(((c.y + 1) / 2) * size.y);
      if (cx < 8 || cy < 8 || cx > size.x - 8 || cy > size.y - 8) return null;
      const frameNow = () => {
        renderer.info.reset();
        post.render(STEP, { dof: false, focus: 10, camSpeed: 0 });
      };
      post.setGrade(false);
      frameNow();
      // the cab's body is mostly below and around that point (the rear window sits right on it): read a block
      const bx = Math.max(0, cx - 60),
        by = Math.max(0, cy - 70),
        bw = Math.min(size.x - bx, 121),
        bh = Math.min(size.y - by, 85);
      const gl = renderer.getContext();
      const block = new Uint8Array(bw * bh * 4);
      gl.readPixels(bx, by, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, block);
      let best: [number, number] = [cx, cy],
        score = -Infinity;
      for (let k = 0; k < bw * bh; k++) {
        const s = -Math.hypot(block[k * 4] - 255, block[k * 4 + 1] - 199, block[k * 4 + 2] - 44);
        if (s > score) (score = s), (best = [bx + (k % bw), by + Math.floor(k / bw)]);
      }
      const plain = pixel(...best);
      post.setGrade(true);
      frameNow();
      return { at: best, plain, graded: pixel(...best) };
    },
    refreshEnvironment: () => env?.refresh(),
    setWet,
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
    pose() {
      const t = car.body.translation(),
        f = car.forward();
      chase.cam.getWorldDirection(poseDir);
      return { x: t.x, z: t.z, yaw: Math.atan2(f.x, f.z), view: Math.atan2(poseDir.x, poseDir.z) };
    },
    level,
    traffic,
    people,
    setPaused(p) {
      paused = p;
      last = performance.now();
      if (p) opts.audio?.engine(null);
    },
    setCar(carId, driverId) {
      const spec = carById(carId);
      Object.assign(tuning, tuningFor(spec));
      car.applyTuning();
      scene.remove(carGroup);
      for (const w of wheels) scene.remove(w);
      // free the old cab's GPU buffers (geometry, materials, the sign textures)
      const seen = new Set<unknown>();
      for (const o of [carGroup, ...wheels])
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (!seen.has(mesh.geometry)) seen.add(mesh.geometry), mesh.geometry.dispose();
          for (const mt of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (seen.has(mt)) continue;
            seen.add(mt);
            (mt as THREE.MeshBasicMaterial).map?.dispose();
            mt.dispose();
          }
        });
      taxi = buildTaxi(tuning.wheelRadius, spec.look, driverById(driverId).look);
      carGroup = taxi.group;
      wheels = taxi.wheels;
      scene.add(carGroup);
      for (const w of wheels) scene.add(w);
    },
    setTime(s) {
      if (s === tod) return;
      tod = s;
      todT = -1;
      updateTime(0);
    },
    timeOfDay: () => ({ setting: tod, t: cycleT(tod, todClock), lights: uNight.value }),
    setMenu(on) {
      menu = on;
      if (!on) chase.snap();
      else opts.audio?.engine(null);
    },
  };
}
