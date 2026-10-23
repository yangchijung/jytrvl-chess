// Rush Taxi stage 3: traffic stays in its lanes and keeps moving, a taxi hitting a car knocks it flying, passing
// one closely counts as a near miss, and people hop aside or sit down — never anything worse.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { cityLevel } from '../src/taxi/world/city';
import { buildPhysics } from '../src/taxi/world/build';
import { Traffic, type TaxiNow } from '../src/taxi/world/traffic';
import { People } from '../src/taxi/world/people';

const DT = 1 / 60;
const L = cityLevel();
beforeAll(async () => {
  await RAPIER.init();
});
function setup(count = 30) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  buildPhysics(RAPIER, world, L);
  const traffic = new Traffic(RAPIER, world, new THREE.Scene(), L.graph!, count);
  return { world, traffic };
}
const away: TaxiNow = { x: 9999, z: 9999, vx: 0, vz: 0, yaw: 0, kmh: 0 };
/** distance from a point to the nearest street centre line */
function offRoad(x: number, z: number) {
  let best = 1e9;
  for (const [a, b] of L.graph!.edges) {
    const A = L.graph!.nodes[a],
      B = L.graph!.nodes[b];
    const vx = B.x - A.x,
      vz = B.z - A.z;
    const t = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(A.x + vx * t - x, A.z + vz * t - z));
  }
  return best;
}

describe('Rush Taxi traffic and people (stage 3)', () => {
  it('cars drive the streets for two minutes: always on the road, moving, never piled on each other', () => {
    const { world, traffic } = setup();
    const start = traffic.cars.map((c) => c.pos.clone());
    let worstOff = 0,
      overlaps = 0;
    for (let k = 0; k < 120 * 60; k++) {
      traffic.update(DT, away);
      world.step();
      if (k % 30 === 0) {
        for (const c of traffic.cars) worstOff = Math.max(worstOff, offRoad(c.pos.x, c.pos.y));
        for (let i = 0; i < traffic.cars.length; i++)
          for (let j = i + 1; j < traffic.cars.length; j++) if (traffic.cars[i].pos.distanceTo(traffic.cars[j].pos) < 2.2) overlaps++;
      }
    }
    expect(worstOff).toBeLessThan(6.5); // inside the 7 m half-width of the road
    const moved = traffic.cars.filter((c, i) => c.pos.distanceTo(start[i]) > 30).length;
    expect(moved).toBeGreaterThan(traffic.cars.length * 0.8);
    expect(overlaps).toBeLessThan(20);
    expect(traffic.cars.every((c) => Math.abs(c.body.translation().y - 0.85) < 0.2)).toBe(true);
  });

  it('a taxi running into a car knocks it flying; it comes back on the road later', () => {
    const { world, traffic } = setup(1);
    const car = traffic.cars[0];
    // drive straight at its side at 60 km/h
    const v = 16.7;
    const s = Math.sin(car.yaw),
      c = Math.cos(car.yaw);
    const left = { x: c, z: -s };
    let taxi: TaxiNow = { x: car.pos.x + left.x * 12, z: car.pos.y + left.z * 12, vx: -left.x * v, vz: -left.z * v, yaw: 0, kmh: 60 };
    let hits = 0,
      maxY = 0;
    for (let k = 0; k < 60; k++) {
      for (const e of traffic.update(DT, taxi)) if (e.t === 'hit') hits++;
      world.step();
      // keep coming at its side (it drives on meanwhile)
      const d = 12 - v * DT * (k + 1);
      if (!car.flying) taxi = { ...taxi, x: car.pos.x + left.x * d, z: car.pos.y + left.z * d };
      else taxi = { ...taxi, x: taxi.x + taxi.vx * DT, z: taxi.z + taxi.vz * DT };
      maxY = Math.max(maxY, car.body.translation().y);
    }
    expect(hits).toBe(1);
    expect(maxY).toBeGreaterThan(2); // airborne
    for (let k = 0; k < 8 * 60; k++) {
      traffic.update(DT, { ...taxi, vx: 0, vz: 0, kmh: 0 });
      world.step();
    }
    expect(car.flying).toBe(0);
    expect(offRoad(car.pos.x, car.pos.y)).toBeLessThan(6.5);
  });

  it('overtaking a car closely at speed is one near miss; driving far from it is none', () => {
    const { world, traffic } = setup(1);
    const car = traffic.cars[0];
    // freeze the car's own motion for a clean pass: put the taxi on a parallel line 3 m to its left
    const s = Math.sin(car.yaw),
      c = Math.cos(car.yaw);
    const fwd = { x: s, z: c },
      left = { x: c, z: -s };
    const v = 25;
    let taxi: TaxiNow = { x: car.pos.x + left.x * 3.2 - fwd.x * 20, z: car.pos.y + left.z * 3.2 - fwd.z * 20, vx: fwd.x * v, vz: fwd.z * v, yaw: car.yaw, kmh: 90 };
    let near = 0,
      hits = 0;
    for (let k = 0; k < 120; k++) {
      // follow the car's lane sideways so the gap stays about 3 m
      const sx = Math.sin(car.yaw),
        cz = Math.cos(car.yaw);
      for (const e of traffic.update(DT, taxi)) e.t === 'near' ? near++ : hits++;
      world.step();
      const along = (taxi.x - car.pos.x) * sx + (taxi.z - car.pos.y) * cz + v * DT;
      taxi = { ...taxi, x: car.pos.x + sx * along + cz * 3.2, z: car.pos.y + cz * along - sx * 3.2, vx: sx * v, vz: cz * v };
    }
    expect(hits).toBe(0);
    expect(near).toBe(1);
  });

  it('people hop out of the way of a taxi; one brushed anyway sits down and gets up again', () => {
    const people = new People(new THREE.Scene(), [{ cx: 0, cz: 0, h: 20 }], 1);
    const p = people.list[0];
    p.speed = 0;
    people.update(DT, null);
    // a taxi coming straight at them at 40 km/h
    const v = 11;
    let taxi: TaxiNow = { x: p.x - 15, z: p.z, vx: v, vz: 0, yaw: Math.PI / 2, kmh: 40 };
    const ev: string[] = [];
    let closest = 99;
    for (let k = 0; k < 120; k++) {
      ev.push(...people.update(DT, taxi).map((e) => e.t));
      taxi = { ...taxi, x: taxi.x + v * DT };
      closest = Math.min(closest, Math.hypot(p.x - taxi.x, p.z - taxi.z));
    }
    expect(ev).toContain('hop');
    expect(ev).not.toContain('bump');
    expect(closest).toBeGreaterThan(1.9);
    // sneak up too close to hop: they sit down for a moment, then walk on
    const q = new People(new THREE.Scene(), [{ cx: 0, cz: 0, h: 20 }], 1);
    const r = q.list[0];
    q.update(DT, null);
    const bumped = q.update(DT, { x: r.x - 0.5, z: r.z, vx: 6, vz: 0, yaw: 0, kmh: 22 });
    expect(bumped.map((e) => e.t)).toEqual(['bump']);
    expect(r.sit).toBeGreaterThan(1);
    for (let k = 0; k < 120; k++) q.update(DT, away);
    expect(r.sit).toBe(0);
  });
});

describe('Rush Taxi city drive (stage 3)', () => {
  it('the canal jump: flat out from two blocks back clears the Love River and lands on the far bank', async () => {
    const { Car } = await import('../src/taxi/vehicle/car');
    const { TUNING } = await import('../src/taxi/vehicle/tuning');
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    buildPhysics(RAPIER, world, L);
    const car = new Car(RAPIER, world, { x: -90, y: 1, z: 150 }, Math.PI, { ...TUNING });
    const idle = { throttle: 0, brake: 0, steer: 0, drift: false, rush: false, reset: false, pause: false, dev: false };
    let minY = 9,
      overRiver = false,
      top = 0;
    for (let k = 0; k < 9 * 60; k++) {
      car.update({ ...idle, throttle: 1 }, DT);
      world.step();
      const t = car.body.translation();
      top = Math.max(top, car.kmh());
      if (Math.abs(t.z) < L.water!.z1) {
        overRiver = true;
        minY = Math.min(minY, t.y);
      }
      if (t.z < -60) break;
    }
    const t = car.body.translation();
    expect(overRiver).toBe(true);
    expect(minY).toBeGreaterThan(0); // never dipped into the river
    expect(t.z).toBeLessThan(-30); // on the south bank
    expect(t.y).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(100);
  });
});
