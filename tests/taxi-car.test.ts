// Rush Taxi stage 1: the car's feel, checked in the physics alone (fixed 1/60 s steps, no rendering).
import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Car } from '../src/taxi/vehicle/car';
import { TUNING } from '../src/taxi/vehicle/tuning';
import type { Controls } from '../src/taxi/core/input';
import { greybox, wedgePoints } from '../src/taxi/world/greybox';

const DT = 1 / 60;
const idle: Controls = { throttle: 0, brake: 0, steer: 0, drift: false, rush: false, reset: false, pause: false, dev: false };

beforeAll(async () => {
  await RAPIER.init();
});

function setup(withCity = false, spawn = { x: 0, y: 1.2, z: -60 }, yaw = 0) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(withCity ? 200 : 2000, 0.5, withCity ? 200 : 2000).setTranslation(0, -0.5, 0).setFriction(1)); // open ground is big enough for the top-speed run
  if (withCity)
    for (const s of greybox()) {
      const rot = { x: 0, y: Math.sin((s.yaw ?? 0) / 2), z: 0, w: Math.cos((s.yaw ?? 0) / 2) };
      if (s.kind === 'box' && !s.dynamic) world.createCollider(RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2).setTranslation(...s.p).setRotation(rot).setRestitution(0.2).setFriction(0.4));
      if (s.kind === 'wedge') world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(wedgePoints(s.size).flat()))!.setTranslation(...s.p).setRotation(rot).setFriction(1));
    }
  const car = new Car(RAPIER, world, spawn, yaw, { ...TUNING });
  const run = (sec: number, c: Partial<Controls> = {}, each?: () => void) => {
    const n = Math.round(sec / DT);
    for (let k = 0; k < n; k++) {
      car.update({ ...idle, ...c, rush: k === 0 && !!c.rush, reset: k === 0 && !!c.reset }, DT);
      world.step();
      each?.();
    }
  };
  run(1); // settle on the wheels
  return { world, car, run };
}

describe('Rush Taxi car feel (stage 1)', () => {
  it('settles on four wheels and accelerates quickly to about 140 km/h, not beyond', () => {
    const { car, run } = setup();
    expect(car.wheelsDown()).toBe(4);
    run(3, { throttle: 1 });
    const at3 = car.kmh();
    run(12, { throttle: 1 });
    expect(at3).toBeGreaterThan(70); // 0 → 70+ km/h in 3 s: arcade quick
    expect(car.kmh()).toBeGreaterThan(125);
    expect(car.kmh()).toBeLessThan(150);
  });

  it('rush start: let go of the gas and press it again while stopped gives an instant push; a plain start does not', () => {
    const a = setup();
    a.run(0.2, { throttle: 1 });
    a.run(0.1); // let go
    a.run(0.05, { throttle: 1 }); // and press again within the window
    const rushed = a.car.kmh();
    const b = setup();
    b.run(0.35, { throttle: 1 });
    expect(a.car.ev.rush).toBe(1);
    expect(b.car.ev.rush).toBe(0);
    expect(rushed).toBeGreaterThan(b.car.kmh() + 15);
    // the rush key does the same from slow speed
    const c = setup();
    c.run(0.1, { rush: true, throttle: 1 });
    expect(c.car.ev.rush).toBe(1);
  });

  it('drift: holding the drift key at speed lets the tail slide (much larger angle between nose and travel) and turns faster', () => {
    const angleOf = (car: Car) => {
      const f = car.forward(),
        v = car.body.linvel();
      return (Math.acos((f.x * v.x + f.z * v.z) / (Math.hypot(f.x, f.z) * Math.hypot(v.x, v.z))) * 180) / Math.PI;
    };
    const grip = setup();
    grip.run(4, { throttle: 1 });
    let gripMax = 0;
    grip.run(1.2, { throttle: 1, steer: 1 }, () => (gripMax = Math.max(gripMax, angleOf(grip.car))));
    const slide = setup();
    slide.run(4, { throttle: 1 });
    const entry = slide.car.kmh();
    let slideMax = 0;
    slide.run(1.2, { throttle: 1, steer: 1, drift: true }, () => (slideMax = Math.max(slideMax, angleOf(slide.car))));
    expect(slide.car.ev.driftTime).toBeGreaterThan(1);
    expect(slideMax).toBeGreaterThan(18);
    expect(slideMax).toBeGreaterThan(gripMax * 2);
    expect(slide.car.wheelsDown()).toBeGreaterThanOrEqual(2); // still on its wheels
    const flat = Math.hypot(slide.car.body.linvel().x, slide.car.body.linvel().z) * 3.6;
    expect(flat).toBeGreaterThan(entry * 0.75); // a drift keeps most of the speed along the path (arcade)
  });

  it('the brake-then-gas flick at speed also starts a drift', () => {
    const { car, run } = setup();
    run(4, { throttle: 1 });
    run(0.15, { brake: 1 });
    run(0.3, { throttle: 1, steer: 1 });
    expect(car.drifting || car.ev.driftTime > 0).toBe(true);
  });

  it('the big jump: off the ramp the car flies, lands upright on the landing slope and drives on', () => {
    // lined up with the jump ramp (x = -40), far enough back to reach speed
    const { car, run } = setup(true, { x: -40, y: 1.2, z: -85 });
    run(6, { throttle: 1 });
    expect(car.ev.longestAir).toBeGreaterThan(0.8);
    expect(car.ev.landings).toBeGreaterThanOrEqual(1);
    run(1.5, { throttle: 1 });
    expect(car.up().y).toBeGreaterThan(0.9); // upright
    expect(car.body.translation().z).toBeGreaterThan(30); // past the landing slope
  });

  it('self-righting: on its side for a second puts it back on its wheels', () => {
    const { car, run } = setup();
    car.body.setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) }, true); // 90° roll
    run(2);
    expect(car.ev.flips).toBe(1);
    run(1);
    expect(car.up().y).toBeGreaterThan(0.95);
  });

  it('walls: driving into a wall slows and bounces the car, it never goes through or gets stuck', () => {
    // the long rub wall is at x = 45; start west of it facing +x
    const { car, run } = setup(true, { x: 20, y: 1.2, z: 0 }, Math.PI / 2);
    run(2.5, { throttle: 1 });
    expect(car.body.translation().x).toBeLessThan(45);
    run(1, { brake: 1 });
    const x0 = car.body.translation().x;
    run(1.5, { throttle: 1, steer: 1 }); // turn away and drive off again
    expect(car.kmh()).toBeGreaterThan(10);
    expect(car.body.translation().x).toBeLessThan(x0); // moving away from the wall
    expect(car.up().y).toBeGreaterThan(0.8);
  });
});
