// Crazy Bumper (/bumper) — P1 entry: builds the arena and four bumper cars (the child's pick + three AI cars),
// runs physics on the fixed step, turns contacts into impacts (sparks, squash, shake, boing, posts that go "咚!"),
// keeps the round clock, and publishes window.__GAME_STATS__ for the Playwright check (spec section 8).
import * as THREE from 'three';
import { Engine, STEP } from './core/Engine';
import { InputManager, type ScreenInput } from './core/InputManager';
import type { AudioSynth } from './core/AudioSynth';
import { CameraController } from './core/CameraController';
import { BumperCar, CAR, NO_INPUT, wrapAngle, type DriveInput } from './entities/BumperCar';
import { CarModel } from './entities/CarModel';
import { ARENA, ArenaView, buildArenaPhysics } from './entities/Arena';
import { lineUp, type AnimalId, type CarId } from './entities/roster';
import { BotController, type CarView } from './ai/BotController';
import { RULES, ScoreManager, type Body, type Impact, type Phase, type RoundEvent } from './rules/ScoreManager';
import { ParticleSystem } from './vfx/ParticleSystem';
import { PowerUpManager } from './entities/PowerUpManager';
import { StarDropManager } from './entities/StarDropManager';

export interface GameStats {
  phase: Phase;
  fps: number;
  avgFps: number;
  frameCount: number;
  playerPosition: { x: number; y: number; z: number };
  playerScore: number;
  totalCollisions: number;
  dashCount: number;
  activePowerUp: string | null;
  consoleErrors: string[];
}

export interface HudState {
  phase: Phase;
  timeLeft: number;
  roundLength: number;
  score: number;
  /** dash cooldown left, 0..1 (0 = ready) */
  cooldown: number;
  trophies: 1 | 2 | 3;
  /** a star just landed (for the score pop) */
  starPulse: number;
}

export interface Pick {
  animal: AnimalId;
  car: CarId;
}

export interface BumperGame {
  input: InputManager;
  /** begin a round (from the title or the result screen) */
  start(): void;
  /** back to the title screen with the cars bumping by themselves */
  toTitle(): void;
  setPick(p: Pick): void;
  setPaused(p: boolean): void;
  resize(): void;
  hud(): HudState;
  /** test hook: run `seconds` of game time right now with this input (rendering one frame after) */
  ff(seconds: number, input?: Partial<ScreenInput>): void;
  info(): { drawCalls: number; triangles: number; pixelRatio: number; software: boolean; particles: number };
  cars: BumperCar[];
  bots: (BotController | null)[];
  scores: ScoreManager;
  /** for profiling and tests */
  engine: Engine;
  camera: CameraController;
  dispose(): void;
}

export interface StartOpts {
  pick: Pick;
  roundSeconds?: number;
  lowPower?: boolean;
  /** 1 normal, lower for prefers-reduced-motion (no shake, smaller wobble) */
  motion?: number;
  audio: AudioSynth;
  stats: GameStats;
  onPhase?: (p: Phase) => void;
  onStar?: (total: number) => void;
}

/** start spots: the player nearest the camera, everyone facing the middle */
const SPAWN_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const spawnOf = (i: number) => {
  const a = SPAWN_ANGLES[i];
  const x = Math.cos(a) * 8,
    z = Math.sin(a) * 8;
  return { p: { x, z }, yaw: Math.atan2(-x, -z) };
};

export async function startBumper(canvas: HTMLCanvasElement, opts: StartOpts): Promise<BumperGame> {
  const engine = await Engine.create(canvas, { lowPower: !!opts.lowPower });
  const { scene, world, R } = engine;
  const q = engine.quality;
  const motion = opts.motion ?? 1;
  const audio = opts.audio;
  const stats = opts.stats;

  const arenaPhys = buildArenaPhysics(R, world);
  const arena = new ArenaView(scene, { textureSize: q.floorTexture });
  const fx = new ParticleSystem(scene, q.particles);
  const camera = new CameraController(engine.resize());
  camera.motion = motion < 1 ? 0 : 1;
  const scores = new ScoreManager(opts.roundSeconds);
  const powerUps = new PowerUpManager(4);
  const starDrops = new StarDropManager();
  const input = new InputManager();

  // ---------- cars ----------
  const cars: BumperCar[] = [];
  const bodies = new Map<number, Body>();
  for (let i = 0; i < 4; i++) {
    const s = spawnOf(i);
    const c = new BumperCar(R, world, s.p, s.yaw);
    cars.push(c);
    bodies.set(c.collider.handle, { kind: 'car', i });
  }
  for (const h of arenaPhys.walls) bodies.set(h, { kind: 'wall' });
  arenaPhys.posts.forEach((p, i) => bodies.set(p.handle, { kind: 'post', i }));
  // bot 0 drives the player's car on the title screen only
  const bots = cars.map((_, i) => new BotController(1000 + i * 7919, 0));
  const titleBot = new BotController(4242, 1);

  let models: CarModel[] = [];
  const buildModels = (pick: Pick) => {
    for (const m of models) {
      scene.remove(m.root);
      m.dispose();
    }
    models = lineUp(pick).map(({ car, animal }) => {
      const m = new CarModel(car, animal, { headShadow: !q.software });
      scene.add(m.root);
      return m;
    });
  };
  buildModels(opts.pick);

  // interpolation snapshots and per-frame acceleration (for the wobbles)
  const prev = cars.map(() => ({ x: 0, z: 0, yaw: 0 }));
  const cur = cars.map(() => ({ x: 0, z: 0, yaw: 0 }));
  const snap = (o: (typeof cur)[number], c: BumperCar) => {
    const t = c.body.translation();
    o.x = t.x;
    o.z = t.z;
    o.yaw = c.yaw();
  };
  const snapAll = () => cars.forEach((c, i) => (snap(cur[i], c), Object.assign(prev[i], cur[i])));
  snapAll();
  const accel = cars.map(() => ({ vx: 0, vz: 0, fwd: 0, side: 0 }));
  const dashFx: number[] = [];

  let phase: Phase = 'title';
  let resultT = 0;
  let starPulse = 0;
  let forced: ScreenInput | null = null;
  const views = (skip: number): CarView[] =>
    cars.flatMap((c, j) => {
      if (j === skip) return [];
      const t = c.body.translation(),
        v = c.body.linvel();
      return [{ id: j, x: t.x, z: t.z, vx: v.x, vz: v.z }];
    });

  const driveFor = (i: number): DriveInput => {
    if (phase === 'result') return NO_INPUT;
    if (i === 0 && phase === 'playing') {
      const s = forced ?? input.read();
      const w = camera.screenToWorld(s.x, s.y);
      return { x: w.x, z: w.z, thrust: s.thrust, dash: s.dash };
    }
    const c = cars[i];
    const t = c.body.translation(),
      v = c.body.linvel();
    const bot = i === 0 ? titleBot : bots[i];
    return bot.decide({ id: i, x: t.x, z: t.z, vx: v.x, vz: v.z, yaw: c.yaw(), cooldown: c.cooldown }, views(i), STEP);
  };

  const onRound = (ev: RoundEvent[]) => {
    for (const e of ev) {
      if (e.t === 'second' && e.left > 0 && e.left <= RULES.beepFrom) audio.beep(false);
      else if (e.t === 'star') {
        starPulse = 1;
        audio.blip(e.total % 7);
        fx.burst({ x: e.x, y: 1.6, z: e.z }, { count: 10, speed: 6, up: 6, life: 0.6, size: 0.3, colors: ['#FFD600', '#FFF59D', '#FFFFFF'] });
        opts.onStar?.(e.total);
      } else if (e.t === 'end') {
        audio.beep(true);
        enterResult();
      }
    }
  };

  const impact = (h1: number, h2: number) => {
    const a = bodies.get(h1),
      b = bodies.get(h2);
    if (!a || !b) return;
    // order so a car comes first
    const [A, B] = a.kind === 'car' ? [a, b] : [b, a];
    if (A.kind !== 'car') return;
    const ca = cars[A.i];
    const pa = ca.body.translation();
    let nx = 0,
      nz = 0,
      pushA = 0,
      pushB = 0;
    let cx = pa.x,
      cz = pa.z;
    if (B.kind === 'car') {
      const cb = cars[B.i];
      const pb = cb.body.translation();
      const d = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1;
      nx = (pb.x - pa.x) / d;
      nz = (pb.z - pa.z) / d;
      pushA = ca.before.x * nx + ca.before.z * nz;
      pushB = -(cb.before.x * nx + cb.before.z * nz);
      cx = (pa.x + pb.x) / 2;
      cz = (pa.z + pb.z) / 2;
    } else if (B.kind === 'post') {
      const p = arenaPhys.posts[B.i];
      const d = Math.hypot(p.x - pa.x, p.z - pa.z) || 1;
      nx = (p.x - pa.x) / d;
      nz = (p.z - pa.z) / d;
      pushA = ca.before.x * nx + ca.before.z * nz;
      cx = pa.x + nx * CAR.ringRadius;
      cz = pa.z + nz * CAR.ringRadius;
    } else {
      const d = Math.hypot(pa.x, pa.z) || 1;
      nx = pa.x / d;
      nz = pa.z / d;
      pushA = ca.before.x * nx + ca.before.z * nz;
      cx = pa.x + nx * CAR.ringRadius;
      cz = pa.z + nz * CAR.ringRadius;
    }
    const speed = pushA + pushB;
    if (speed < 1) return; // grazing
    const imp: Impact = { a: A, b: B, speed, pushA, pushB, x: cx, z: cz };
    if (!scores.isNew(imp)) return;
    onRound(scores.collision(imp));
    // effects
    const playerIn = A.i === 0 || (B.kind === 'car' && B.i === 0);
    ca.hit(speed);
    models[A.i]?.impact(nx, nz, speed, ca.yaw(), motion);
    if (B.kind === 'car') {
      cars[B.i].hit(speed);
      models[B.i]?.impact(-nx, -nz, speed, cars[B.i].yaw(), motion);
    }
    if (B.kind === 'post') {
      ca.kick(-nx * ARENA.postKick, -nz * ARENA.postKick);
      arena.hitPost(B.i);
      audio.dong();
    }
    const p0 = cars[0].body.translation();
    const near = playerIn ? 1 : Math.max(0.25, 1 - Math.hypot(cx - p0.x, cz - p0.z) / 40);
    audio.boing(speed * near);
    if (speed > 3) fx.sparks({ x: cx, y: 0.6, z: cz }, speed * (B.kind === 'wall' ? 0.6 : 1), B.kind === 'wall' ? { x: -nx, z: -nz } : undefined);
    if (playerIn && phase === 'playing') camera.shake(Math.min(0.75, speed / 28 + (B.kind === 'post' ? 0.2 : 0)));
  };

  const step = (dt: number) => {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.update(driveFor(i), dt)) {
        dashFx.push(i);
        scores.dash(i);
        if (i === 0 || phase === 'title') audio.whoosh();
      }
    }
    powerUps.update(dt, cars.map((c) => c.pos()));
    for (const e of starDrops.update(dt, cars.map((c) => ({ ...c.pos(), magnet: false })))) scores.onStarEvent(e);
    cars.forEach((c, i) => Object.assign(prev[i], cur[i]));
    world.step(engine.events);
    engine.events.drainCollisionEvents((h1, h2, started) => {
      if (started) impact(h1, h2);
    });
    cars.forEach((c, i) => snap(cur[i], c));
    onRound(scores.tick(dt));
  };

  const enterResult = () => {
    phase = 'result';
    resultT = 0;
    camera.mode = 'result';
    input.enabled = false;
    audio.fanfare();
    void audio.setMusic('results');
    stats.phase = 'result';
    opts.onPhase?.('result');
  };

  const tmpP = new THREE.Vector3();
  const tmpL = new THREE.Vector3();
  const tip = new THREE.Vector3();
  let lastTrail = 0;
  const draw = (alpha: number, dt: number) => {
    // result: slow motion that settles into a freeze; the camera, particles and HUD keep real time
    if (phase === 'result') {
      resultT += dt;
      engine.timeScale = resultT < 1.6 ? 0.22 * (1 - resultT / 1.6) : 0;
      if (resultT - dt < 0.25 && resultT >= 0.25) fx.confetti(tmpP.set(cur[0].x, 0, cur[0].z), Math.round(q.particles * 0.45));
      if (resultT - dt < 1.1 && resultT >= 1.1) fx.confetti(tmpP.set(cur[0].x, 0, cur[0].z), Math.round(q.particles * 0.35));
    }
    const simDt = dt * engine.timeScale;
    lastTrail += simDt;
    const trailNow = lastTrail > 1 / 40;
    if (trailNow) lastTrail = 0;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i],
        m = models[i];
      if (!m) continue;
      const a = prev[i],
        b = cur[i];
      const x = a.x + (b.x - a.x) * alpha,
        z = a.z + (b.z - a.z) * alpha;
      const yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * alpha;
      m.root.position.set(x, CAR.rideY, z);
      m.root.rotation.y = yaw;
      // acceleration in the car's frame, smoothed (fixed steps make the raw value jumpy)
      const v = c.body.linvel();
      const ac = accel[i];
      if (simDt > 0) {
        const ax = (v.x - ac.vx) / simDt,
          az = (v.z - ac.vz) / simDt;
        const fx_ = Math.sin(yaw),
          fz_ = Math.cos(yaw);
        const k = 1 - Math.exp(-simDt / 0.08);
        ac.fwd += (Math.max(-80, Math.min(80, ax * fx_ + az * fz_)) - ac.fwd) * k;
        ac.side += (Math.max(-80, Math.min(80, ax * fz_ - az * fx_)) - ac.side) * k;
      }
      ac.vx = v.x;
      ac.vz = v.z;
      m.animate({ accFwd: ac.fwd, accSide: ac.side, dashing: c.dashing > 0, cooldown: c.cooldown, dt: simDt, motion: motion < 1 ? 0.5 : 1 });
      if (c.dashing > 0 && trailNow) {
        const fwx = Math.sin(yaw),
          fwz = Math.cos(yaw);
        fx.trail({ x: x - fwx * 1.5, y: 0.55, z: z - fwz * 1.5 });
      }
    }
    while (dashFx.length) {
      const i = dashFx.pop()!;
      const m = models[i];
      if (!m) continue;
      m.dash();
      m.root.updateMatrixWorld();
      tip.copy(m.tipLocal).applyMatrix4(m.root.matrixWorld);
      fx.burst(tip, { count: 10, speed: 4, up: 3, life: 0.35, size: 0.16, colors: ['#FFFFFF', '#FFF59D', '#FFD600'] });
    }
    arena.update(simDt);
    fx.update(phase === 'result' ? dt : simDt);
    starPulse = Math.max(0, starPulse - dt * 3);
    const p0 = models[0]?.root.position ?? tmpP.set(0, 0, 0);
    const v0 = cars[0].body.linvel();
    tmpL.set(v0.x, 0, v0.z);
    camera.heading = cur[0].yaw;
    camera.update(tmpP.set(p0.x, 0, p0.z), tmpL, dt);
    engine.render(camera.cam);
    // stats for the test hook
    const c = engine.counters;
    stats.fps = c.fps;
    stats.avgFps = c.avgFps;
    stats.frameCount = c.frameCount;
    const t0 = cars[0].body.translation();
    stats.playerPosition.x = t0.x;
    stats.playerPosition.y = t0.y;
    stats.playerPosition.z = t0.z;
    stats.playerScore = scores.scores[0];
    stats.totalCollisions = scores.totalCollisions;
    stats.dashCount = scores.dashCount;
    stats.activePowerUp = powerUps.activeFor(0);
  };

  const resetCars = () => {
    cars.forEach((c, i) => {
      const s = spawnOf(i);
      c.reset(s.p, s.yaw);
    });
    snapAll();
    fx.clear();
    powerUps.clear();
    starDrops.clear();
  };

  engine.start(step, draw);
  stats.phase = 'title';
  void audio.setMusic('title');

  const game: BumperGame = {
    input,
    cars,
    bots,
    scores,
    engine,
    camera,
    start() {
      resetCars();
      scores.start();
      phase = 'playing';
      engine.timeScale = 1;
      engine.paused = false;
      input.enabled = true;
      camera.mode = 'follow';
      camera.snap(new THREE.Vector3(cur[0].x, 0, cur[0].z));
      engine.resetAverage();
      stats.phase = 'playing';
      void audio.setMusic('play');
      opts.onPhase?.('playing');
    },
    toTitle() {
      phase = 'title';
      scores.toTitle();
      engine.timeScale = 1;
      engine.paused = false;
      input.enabled = true;
      camera.mode = 'title';
      fx.clear();
      stats.phase = 'title';
      void audio.setMusic('title');
      opts.onPhase?.('title');
    },
    setPick(p) {
      buildModels(p);
    },
    setPaused(p) {
      engine.paused = p;
    },
    resize() {
      camera.setAspect(engine.resize());
    },
    hud: () => ({
      phase,
      timeLeft: scores.timeLeft,
      roundLength: scores.roundLength,
      score: scores.scores[0],
      cooldown: cars[0].cooldown / CAR.dashCooldown,
      trophies: scores.trophies(),
      starPulse,
    }),
    ff(seconds, inp) {
      forced = { x: 0, y: 0, thrust: 0, dash: false, ...inp };
      const n = Math.max(1, Math.round((seconds * engine.timeScale) / STEP));
      for (let k = 0; k < n; k++) {
        step(STEP);
        if (forced) forced.dash = false;
      }
      forced = null;
      draw(1, seconds);
    },
    info: () => ({ drawCalls: engine.renderer.info.render.calls, triangles: engine.renderer.info.render.triangles, pixelRatio: engine.pixelRatio, software: q.software, particles: fx.alive }),
    dispose() {
      input.dispose();
      for (const m of models) m.dispose();
      engine.dispose();
    },
  };
  return game;
}
