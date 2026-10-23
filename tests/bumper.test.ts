// Crazy Bumper P1: physics feel, no-flip, bot wall escape and the round clock, checked without a renderer.
import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { BumperCar, CAR, NO_INPUT, type DriveInput } from '../src/bumper/entities/BumperCar';
import { ARENA, buildArenaPhysics } from '../src/bumper/entities/Arena';
import { BOT, BotController } from '../src/bumper/ai/BotController';
import { RULES, ScoreManager } from '../src/bumper/rules/ScoreManager';
import { lineUp, loadPick, CARS, ANIMALS } from '../src/bumper/entities/roster';
import { stickThrust } from '../src/bumper/core/InputManager';

const DT = 1 / 60;
beforeAll(async () => {
  await RAPIER.init();
});

function setup(arena = false) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const phys = arena ? buildArenaPhysics(RAPIER, world) : null;
  const events = new RAPIER.EventQueue(true);
  return { world, phys, events };
}

const run = (world: RAPIER.World, sec: number, each: () => void, events?: RAPIER.EventQueue) => {
  for (let k = 0; k < Math.round(sec / DT); k++) {
    each();
    world.step(events);
  }
};
const drive = (x: number, z: number, thrust = 1, dash = false): DriveInput => ({ x, z, thrust, dash });

describe('Crazy Bumper car physics (spec 5.2)', () => {
  it('uses the spec numbers: 150 kg, damping 1.2 / 3.5, ring restitution 1.15, friction 0.3, centre of mass 0.5 m down', () => {
    const { world } = setup();
    const car = new BumperCar(RAPIER, world, { x: 0, z: 0 }, 0);
    world.step(); // Rapier computes mass properties on the first step
    expect(car.body.mass()).toBeCloseTo(150, 3);
    expect(car.body.linearDamping()).toBeCloseTo(1.2, 5);
    expect(car.body.angularDamping()).toBeCloseTo(3.5, 5);
    expect(car.collider.restitution()).toBeCloseTo(1.15, 5);
    expect(car.collider.friction()).toBeCloseTo(0.3, 5);
    const com = car.body.localCom();
    expect(com.y).toBeCloseTo(CAR.comY, 3);
    expect(CAR.topSpeed).toBe(28);
  });

  it('reaches about 28 u/s flat out, quickly (high-torque start), and no faster without a dash', () => {
    const { world } = setup();
    const car = new BumperCar(RAPIER, world, { x: 0, z: -400 }, 0);
    let t10 = -1;
    let t = 0;
    run(world, 6, () => {
      car.update(drive(0, 1), DT);
      t += DT;
      if (t10 < 0 && car.speed() >= 10) t10 = t;
    });
    expect(car.speed()).toBeGreaterThan(26.5);
    expect(car.speed()).toBeLessThan(29.5);
    expect(t10).toBeGreaterThan(0);
    expect(t10).toBeLessThan(0.5);
  });

  it('dash: a forward impulse of 15 u/s, then a 2.5 s cooldown', () => {
    const { world } = setup();
    const car = new BumperCar(RAPIER, world, { x: 0, z: 0 }, 0);
    world.step(); // mass properties exist after the first step
    expect(car.update(drive(0, 1, 0, true), DT)).toBe(true);
    world.step();
    expect(car.body.linvel().z).toBeGreaterThan(14);
    expect(car.update(drive(0, 1, 0, true), DT)).toBe(false); // cooling down
    run(world, CAR.dashCooldown, () => car.update(NO_INPUT, DT));
    expect(car.cooldown).toBe(0);
    expect(car.update(drive(0, 1, 0, true), DT)).toBe(true);
    expect(car.dashCount).toBe(2);
  });

  it('turns to face the stick direction', () => {
    const { world } = setup();
    const car = new BumperCar(RAPIER, world, { x: 0, z: 0 }, 0);
    run(world, 1, () => car.update(drive(1, 0), DT)); // ask for +x
    expect(Math.abs(car.yaw() - Math.PI / 2)).toBeLessThan(0.15);
  });

  it('never flips: hard hits and twisting impulses leave it upright at ride height', () => {
    const { world } = setup(true);
    const a = new BumperCar(RAPIER, world, { x: -6, z: 0 }, Math.PI / 2);
    const b = new BumperCar(RAPIER, world, { x: 6, z: 0 }, -Math.PI / 2);
    a.update(drive(1, 0, 1, true), DT);
    b.update(drive(-1, 0, 1, true), DT);
    for (const c of [a, b]) {
      c.body.applyTorqueImpulse({ x: 4000, y: 300, z: -4000 }, true);
      c.body.applyImpulse({ x: 0, y: 3000, z: 0 }, true);
    }
    run(world, 3, () => {
      a.update(drive(1, 0.2), DT);
      b.update(drive(-1, -0.2), DT);
    });
    for (const c of [a, b]) {
      const r = c.body.rotation();
      expect(Math.abs(r.x)).toBeLessThan(1e-4);
      expect(Math.abs(r.z)).toBeLessThan(1e-4);
      expect(c.body.translation().y).toBeCloseTo(CAR.rideY, 4);
    }
  });

  it('two cars bounce apart (restitution above 1 with damping) and report a collision', () => {
    const { world, events } = setup();
    const a = new BumperCar(RAPIER, world, { x: -2, z: 0 }, Math.PI / 2);
    const b = new BumperCar(RAPIER, world, { x: 2, z: 0 }, -Math.PI / 2);
    world.step();
    a.body.setLinvel({ x: 12, y: 0, z: 0 }, true);
    let hits = 0;
    let bMax = 0;
    for (let k = 0; k < 60; k++) {
      world.step(events);
      bMax = Math.max(bMax, b.body.linvel().x);
      events.drainCollisionEvents((_h1, _h2, started) => {
        if (started) hits++;
      });
    }
    expect(hits).toBeGreaterThanOrEqual(1);
    // a stopped: the moving car hands its speed over and more (ring 1.15)
    expect(bMax).toBeGreaterThan(9);
    expect(a.body.linvel().x).toBeLessThan(1);
  });

  it('the rail keeps cars in and bounces them back; a post bounces harder than the rail', () => {
    const { world, phys } = setup(true);
    const wall = new BumperCar(RAPIER, world, { x: 0, z: -18 }, Math.PI);
    wall.body.setLinvel({ x: 0, y: 0, z: -25 }, true);
    let minZ = 0;
    run(world, 1.2, () => (minZ = Math.min(minZ, wall.body.translation().z)));
    expect(minZ).toBeGreaterThan(-(ARENA.radius - CAR.ringRadius) - 0.3);
    expect(wall.body.linvel().z).toBeGreaterThan(0); // came back

    const p = phys!.posts[0];
    const { world: w2 } = setup(true);
    const towardsPost = new BumperCar(RAPIER, w2, { x: p.x, z: p.z - 6 }, 0);
    towardsPost.body.setLinvel({ x: 0, y: 0, z: 15 }, true);
    let out = 0;
    for (let k = 0; k < 40; k++) {
      w2.step();
      out = Math.min(out, towardsPost.body.linvel().z);
    }
    // restitution 1.35 (Max rule) beats the rail's 0.9: it comes off faster than it went in, before damping
    expect(-out).toBeGreaterThan(9);
  });
});

describe('Crazy Bumper bots', () => {
  it('turns back from the rail (escape) instead of pushing into it', () => {
    const bot = new BotController(7);
    // close to the rail, facing out (+z at z = 22)
    const self = { id: 1, x: 0, z: 22, vx: 0, vz: 2, yaw: 0, cooldown: 0 };
    const out = bot.decide(self, [{ id: 0, x: 0, z: 0, vx: 0, vz: 0 }], DT);
    expect(bot.state).toBe('escape');
    expect(out.z).toBeLessThan(0); // inwards
    expect(out.thrust).toBe(BOT.thrust.escape);
  });

  it('gets unstuck: pressed against something without moving, it escapes', () => {
    const bot = new BotController(9);
    const self = { id: 1, x: 5, z: 5, vx: 0, vz: 0, yaw: 1, cooldown: 0 };
    let state = bot.state;
    for (let k = 0; k < Math.ceil((BOT.stuckTime + 0.1) / DT); k++) {
      bot.decide(self, [], DT);
      if (bot.state === 'escape') state = 'escape';
    }
    expect(state).toBe('escape');
  });

  it('in a real arena, a bot driving at the rail comes away from it within 2 s', () => {
    const { world } = setup(true);
    const car = new BumperCar(RAPIER, world, { x: 0, z: 19 }, 0);
    const bot = new BotController(3);
    let maxR = 0,
      endR = 0;
    run(world, 2.5, () => {
      const t = car.body.translation(),
        v = car.body.linvel();
      const inp = bot.decide({ id: 1, x: t.x, z: t.z, vx: v.x, vz: v.z, yaw: car.yaw(), cooldown: car.cooldown }, [], DT);
      car.update(inp, DT);
      endR = Math.hypot(t.x, t.z);
      maxR = Math.max(maxR, endR);
    });
    expect(maxR).toBeLessThan(ARENA.radius);
    expect(endR).toBeLessThan(20);
  });

  it('three bots and the player bump into each other in 20 s', () => {
    const { world, events } = setup(true);
    const cars = [0, 1, 2, 3].map((i) => new BumperCar(RAPIER, world, { x: Math.cos(i * 1.57) * 8, z: Math.sin(i * 1.57) * 8 }, 0));
    const bots = cars.map((_, i) => new BotController(100 + i));
    const handles = new Map(cars.map((c, i) => [c.collider.handle, i]));
    let carHits = 0;
    run(
      world,
      20,
      () => {
        cars.forEach((c, i) => {
          const t = c.body.translation(),
            v = c.body.linvel();
          const others = cars.filter((_, j) => j !== i).map((o) => ({ id: cars.indexOf(o), x: o.body.translation().x, z: o.body.translation().z, vx: o.body.linvel().x, vz: o.body.linvel().z }));
          c.update(bots[i].decide({ id: i, x: t.x, z: t.z, vx: v.x, vz: v.z, yaw: c.yaw(), cooldown: c.cooldown }, others, DT), DT);
        });
        events.drainCollisionEvents((a, b, s) => {
          if (s && handles.has(a) && handles.has(b)) carHits++;
        });
      },
      events,
    );
    expect(carHits).toBeGreaterThanOrEqual(3);
  });
});

describe('Crazy Bumper round rules', () => {
  it('a 60 s round ends after 60 s, beeps the last seconds, never goes below 0', () => {
    const s = new ScoreManager();
    s.start();
    const seconds: number[] = [];
    let ended = 0;
    for (let k = 0; k < 61 * 60; k++)
      for (const e of s.tick(DT)) {
        if (e.t === 'second') seconds.push(e.left);
        if (e.t === 'end') ended = k * DT;
      }
    expect(ended).toBeGreaterThan(59.9);
    expect(ended).toBeLessThan(60.1);
    expect(seconds.slice(-RULES.beepFrom - 1)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(s.timeLeft).toBe(0);
    expect(s.phase).toBe('result');
  });

  it('?round=12 shortens the round', () => {
    const s = new ScoreManager(12);
    s.start();
    let k = 0;
    while (s.phase === 'playing' && k < 2000) (s.tick(DT), k++);
    expect(k * DT).toBeCloseTo(12, 1);
  });

  it('counts player impacts once per contact, stars only for the bumper', () => {
    const s = new ScoreManager();
    s.start();
    const hit = { a: { kind: 'car' as const, i: 0 }, b: { kind: 'car' as const, i: 2 }, speed: 12, pushA: 10, pushB: 2, x: 0, z: 0 };
    expect(s.isNew(hit)).toBe(true);
    expect(s.collision(hit)).toEqual([{ t: 'star', car: 0, total: 1, x: 0, z: 0 }]);
    expect(s.isNew(hit)).toBe(false); // same contact
    const bumped = { ...hit, pushA: 1, pushB: 11 };
    s.tick(1);
    expect(s.isNew(bumped)).toBe(true);
    expect(s.collision(bumped)).toEqual([]); // got bumped: counts, no star
    expect(s.collision({ ...hit, a: { kind: 'car', i: 1 } })).toEqual([]); // AI vs AI: not the player's
    expect(s.totalCollisions).toBe(2);
    expect(s.trophies(0)).toBe(1);
    expect(s.trophies(RULES.trophy2)).toBe(2);
    expect(s.trophies(RULES.trophy3)).toBe(3);
  });
});

describe('Crazy Bumper choices', () => {
  it('six animals, six cars; the AI never copies the player and uses the spec colours first', () => {
    expect(ANIMALS).toHaveLength(6);
    expect(CARS).toHaveLength(6);
    const def = lineUp({ animal: 'bear', car: 'lemon' });
    expect(def.map((x) => x.car.body)).toEqual(['#FFD600', '#FF4081', '#00E5FF', '#76FF03']);
    expect(def[0].car.ring).toBe('#FF6D00');
    const pink = lineUp({ animal: 'rabbit', car: 'bubblegum' });
    expect(new Set(pink.map((x) => x.car.id)).size).toBe(4);
    expect(new Set(pink.map((x) => x.animal.id)).size).toBe(4);
  });

  it('remembering the last choice survives blocked storage', () => {
    expect(loadPick()).toEqual({ animal: 'bear', car: 'lemon' }); // no localStorage in node: the default
  });

  it('stick: dead zone, then full push before the rim', () => {
    expect(stickThrust(0.05)).toBe(0);
    expect(stickThrust(0.72)).toBe(1);
    expect(stickThrust(0.4)).toBeGreaterThan(0.3);
  });
});
