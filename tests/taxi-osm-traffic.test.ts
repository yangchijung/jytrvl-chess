// Rush Taxi real map: the lane network (one-way streets, lanes by width, turns, traffic lights), traffic driving it
// for a minute without running red lights, passengers waiting on sidewalks, and people walking the sidewalks.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { KAOHSIUNG, type OsmCityData, type OsmRoad, type XZ } from '../src/taxi/world/osm/data';
import { buildRoadNet, chooseTurn, laneCount, laneOffsets, offsetLine, phaseLight, subLine, lineLength } from '../src/taxi/world/osm/roadnet';
import { growRing, ringArea, sidewalkLoops, surfaceTests } from '../src/taxi/world/osm/walks';
import { osmLevel, nearestRoad } from '../src/taxi/world/osm/level';
import { Traffic, type TaxiNow } from '../src/taxi/world/traffic';
import { People, onLoop } from '../src/taxi/world/people';

const DT = 1 / 60;
beforeAll(async () => {
  await RAPIER.init();
});

/** a small made-up map: a crossing of two main roads (0), a side street crossing (1) and a one-way street */
function toyMap(): OsmCityData {
  const nodes: XZ[] = [
    [0, 0], // 0 main crossing
    [-100, 0], [100, 0], [0, -100], [0, 100], // 1-4
    [100, 100], // 5 side street crossing (residential × residential)
    [200, 100], [100, 200], // 6, 7
  ];
  const road = (a: number, b: number, cls: OsmRoad['cls'], w: number, oneway = false): OsmRoad => ({ a, b, cls, w, pts: [nodes[a], nodes[b]], ...(oneway ? { oneway: 1 as const } : {}) });
  const roads = [
    road(1, 0, 'primary', 14), road(0, 2, 'primary', 14),
    road(3, 0, 'secondary', 10), road(0, 4, 'secondary', 10),
    road(4, 5, 'residential', 6), road(2, 5, 'residential', 6, true), road(5, 6, 'residential', 6), road(5, 7, 'residential', 6),
  ];
  return { nodes, roads } as unknown as OsmCityData;
}

describe('Rush Taxi real-map road network', () => {
  it('lanes by width: two-way roads use the right half, one-way roads the whole width', () => {
    expect(laneCount(14, false)).toBe(2);
    expect(laneOffsets(14, false)).toEqual([1.75, 5.25]);
    expect(laneCount(6, false)).toBe(1);
    expect(laneOffsets(7, true)).toEqual([-1.75, 1.75]);
    expect(laneCount(4.3, true)).toBe(1);
  });

  it('polyline helpers: offset to the right of travel, cut a piece out', () => {
    // heading east (+x); with z south, the right is +z
    expect(offsetLine([[0, 0], [10, 0]], 2)).toEqual([[0, 2], [10, 2]]);
    const cut = subLine([[0, 0], [10, 0], [10, 10]], 5, 15);
    expect(cut[0]).toEqual([5, 0]);
    expect(cut[cut.length - 1]).toEqual([10, 5]);
    expect(lineLength(cut)).toBeCloseTo(10);
  });

  it('one-way streets only run a → b; two-way lanes keep to the right; turns join lane ends smoothly', () => {
    const data = toyMap();
    const net = buildRoadNet(data);
    const ow = net.lanes.filter((l) => l.road === 5);
    expect(ow.length).toBe(laneCount(6, true));
    expect(ow.every((l) => l.fwd && l.from === 2 && l.to === 5)).toBe(true);
    for (const l of net.lanes) {
      const r = data.roads[l.road];
      const [a, b] = l.fwd ? [r.pts[0], r.pts[1]] : [r.pts[1], r.pts[0]];
      const ux = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]),
        uz = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = l.pts[0];
      const side = (m[0] - a[0]) * -uz + (m[1] - a[1]) * ux; // + = right of travel
      if (!r.oneway) expect(side).toBeGreaterThan(0);
      expect(Math.abs(side)).toBeLessThan(r.w / 2);
      for (const t of l.out) {
        expect(Math.hypot(t.pts[0][0] - l.pts[l.pts.length - 1][0], t.pts[0][1] - l.pts[l.pts.length - 1][1])).toBeLessThan(1e-6);
        const next = net.lanes[t.lane];
        expect(next.from).toBe(l.to);
        expect(Math.hypot(t.pts[t.pts.length - 1][0] - next.pts[0][0], t.pts[t.pts.length - 1][1] - next.pts[0][1])).toBeLessThan(1e-6);
      }
    }
    // nobody drives into the one-way street from its far end
    expect(net.lanes.some((l) => l.out.some((t) => net.lanes[t.lane].road === 5 && net.lanes[t.lane].from === 5))).toBe(false);
  });

  it('at a crossing, straight on and the bigger road are the likely choices; U-turns only at dead ends', () => {
    const net = buildRoadNet(toyMap());
    const eastbound = net.lanes.find((l) => l.road === 0 && l.fwd && l.k === 0)!;
    const ws = eastbound.out.map((t) => ({ w: t.w, a: t.angle }));
    const straight = ws.find((t) => Math.abs(t.a) < 0.2)!;
    expect(ws.length).toBe(3);
    for (const t of ws) expect(straight.w).toBeGreaterThanOrEqual(t.w);
    let ahead = 0;
    for (let i = 0; i < 200; i++) if (Math.abs(chooseTurn(net, eastbound.id, (i + 0.5) / 200)!.angle) < 0.2) ahead++;
    expect(ahead).toBeGreaterThan(100);
    const dead = net.lanes.find((l) => l.to === 1)!;
    expect(dead.out.length).toBe(1);
    expect(net.lanes[dead.out[0].lane].road).toBe(dead.road);
  });

  it('traffic lights where two main streets meet, none on side streets; opposite approaches share a phase', () => {
    const net = buildRoadNet(toyMap());
    expect(net.group[0]).toBeGreaterThanOrEqual(0);
    expect(net.group[5]).toBe(-1);
    const into = net.lanes.filter((l) => l.to === 0);
    expect(into.every((l) => l.signal)).toBe(true);
    const ph = (road: number) => into.find((l) => l.road === road)!.signal!.phase;
    expect(ph(0)).toBe(ph(1));
    expect(ph(2)).toBe(ph(3));
    expect(ph(0)).not.toBe(ph(2));
    expect(net.lanes.filter((l) => l.to === 5).every((l) => l.yieldAt && !l.signal)).toBe(true);
    // the two phases never show green together
    for (let t = 0; t < 20; t += 0.25) expect(phaseLight(0, t) === 'green' && phaseLight(1, t) === 'green').toBe(false);
    // one head per approach, on the far side, to the right of the drivers it faces
    expect(net.heads.length).toBe(4);
    for (const h of net.heads) {
      const ux = -Math.sin(h.yaw),
        uz = -Math.cos(h.yaw); // the approaching traffic's direction
      const along = h.x * ux + h.z * uz;
      const right = h.x * -uz + h.z * ux;
      expect(along).toBeGreaterThan(4);
      expect(right).toBeGreaterThan(5);
    }
  });

  it('the Kaohsiung network: every road has lanes, one-way roads one way, junction groups with signal heads', () => {
    const net = osmLevel().roadnet!;
    const data = KAOHSIUNG;
    for (const l of net.lanes) if (data.roads[l.road].oneway) expect(l.fwd).toBe(true);
    expect(new Set(net.lanes.map((l) => l.road)).size).toBeGreaterThan(data.roads.length * 0.98);
    expect(net.lanes.filter((l) => !l.out.length).length).toBeLessThan(net.lanes.length * 0.02);
    const groups = new Set(net.group.filter((g) => g >= 0));
    expect(groups.size).toBeGreaterThan(50);
    expect(net.heads.length).toBeGreaterThan(groups.size * 2);
    // the heads stand off the asphalt
    const surf = surfaceTests(data);
    const off = net.heads.filter((h) => !surf.onRoad(h.x, h.z)).length;
    expect(off).toBeGreaterThan(net.heads.length * 0.85);
  });
});

describe('Rush Taxi real-map traffic', () => {
  const L = osmLevel();
  function setup(count = 30) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    const traffic = new Traffic(RAPIER, world, new THREE.Scene(), L.graph!, count, 7, { net: L.roadnet!, around: L.spawn.p });
    return { world, traffic };
  }

  it('drives the lanes for a minute: on the road, moving, not piled up, stopping at red lights', () => {
    const { world, traffic } = setup();
    const taxi: TaxiNow = { x: L.spawn.p.x, z: L.spawn.p.z, vx: 0, vz: 0, yaw: 0, kmh: 0 };
    const start = traffic.cars.map((c) => c.pos.clone());
    const net = L.roadnet!;
    let worst = 0,
      overlaps = 0,
      reds = 0,
      greens = 0;
    const last = traffic.cars.map((c) => c.piece);
    for (let k = 0; k < 60 * 60; k++) {
      traffic.update(DT, taxi);
      world.step();
      traffic.cars.forEach((c, i) => {
        // leaving a signalled lane into the junction: the light must not be red
        const was = last[i];
        if (was !== c.piece && !was.turn && c.piece.turn) {
          const sig = net.lanes[was.lane!].signal;
          if (sig) phaseLight(sig.phase, traffic.time + sig.t0) === 'red' ? reds++ : greens++;
        }
        last[i] = c.piece;
      });
      if (k % 30 === 0) {
        for (const c of traffic.cars) {
          const hit = nearestRoad(L.osm!, c.pos.x, c.pos.y)!;
          worst = Math.max(worst, hit.d - hit.road.w / 2);
        }
        for (let i = 0; i < traffic.cars.length; i++) for (let j = i + 1; j < traffic.cars.length; j++) if (traffic.cars[i].pos.distanceTo(traffic.cars[j].pos) < 2.2) overlaps++;
      }
    }
    expect(worst).toBeLessThan(2.5); // inside the asphalt, or only cutting a corner through a junction
    const moved = traffic.cars.filter((c, i) => c.pos.distanceTo(start[i]) > 30).length;
    expect(moved).toBeGreaterThan(traffic.cars.length * 0.6);
    expect(overlaps).toBeLessThan(25);
    expect(greens).toBeGreaterThan(5);
    // (a car that went on yellow but was held up by the one in front may clear the line just after it turns red)
    expect(reds).toBeLessThanOrEqual(Math.max(3, greens * 0.05));
    // more of them on the main roads
    const main = traffic.cars.filter((c) => net.lanes[c.piece.lane!].rank >= 3).length;
    expect(main).toBeGreaterThan(traffic.cars.length * 0.4);
  });

  it('keeps its cars around the taxi: drive far away and they come along', () => {
    const { world, traffic } = setup(22);
    const far = L.places.find((p) => Math.hypot(p.x - L.spawn.p.x, p.z - L.spawn.p.z) > 900)!;
    const taxi: TaxiNow = { x: far.x, z: far.z, vx: 0, vz: 0, yaw: 0, kmh: 0 };
    for (let k = 0; k < 10 * 60; k++) {
      traffic.update(DT, taxi);
      world.step();
    }
    const near = traffic.cars.filter((c) => Math.hypot(c.pos.x - taxi.x, c.pos.y - taxi.z) < 240).length;
    expect(near).toBe(traffic.cars.length);
  });

  it('a taxi running into a car knocks it flying; it comes back on a street near the taxi', () => {
    const { world, traffic } = setup(1);
    const car = traffic.cars[0];
    const v = 16.7;
    const s = Math.sin(car.yaw),
      c = Math.cos(car.yaw);
    const left = { x: c, z: -s };
    let taxi: TaxiNow = { x: car.pos.x + left.x * 12, z: car.pos.y + left.z * 12, vx: -left.x * v, vz: -left.z * v, yaw: 0, kmh: 60 };
    let hits = 0;
    for (let k = 0; k < 60; k++) {
      for (const e of traffic.update(DT, taxi)) if (e.t === 'hit') hits++;
      world.step();
      const d = 12 - v * DT * (k + 1);
      if (!car.flying) taxi = { ...taxi, x: car.pos.x + left.x * d, z: car.pos.y + left.z * d };
      else taxi = { ...taxi, x: taxi.x + taxi.vx * DT, z: taxi.z + taxi.vz * DT };
    }
    expect(hits).toBe(1);
    for (let k = 0; k < 8 * 60; k++) {
      traffic.update(DT, { ...taxi, vx: 0, vz: 0, kmh: 0 });
      world.step();
    }
    expect(car.flying).toBe(0);
    const hit = nearestRoad(L.osm!, car.pos.x, car.pos.y)!;
    expect(hit.d).toBeLessThan(hit.road.w / 2);
    expect(Math.hypot(car.pos.x - taxi.x, car.pos.y - taxi.z)).toBeLessThan(220);
  });
});

describe('Rush Taxi real-map sidewalks', () => {
  const L = osmLevel();
  const surf = surfaceTests(KAOHSIUNG);

  it('passengers wait on a sidewalk: never in a junction, on the asphalt or over the water', () => {
    expect(L.stops.length).toBeGreaterThan(1500);
    for (const s of L.stops) {
      expect(surf.onWalk(s.cx!, s.cz!)).toBe(true);
      expect(surf.onRoad(s.cx!, s.cz!)).toBe(false);
      expect(surf.onLand(s.cx!, s.cz!)).toBe(true);
      // the taxi's pick-up point is on the road beside it
      expect(Math.hypot(s.x - s.cx!, s.z - s.cz!)).toBeLessThan(6);
    }
    expect(L.places.filter((p) => surf.onWalk(p.cx!, p.cz!)).length).toBeGreaterThanOrEqual(L.places.length - 2);
  });

  it('sidewalk loops: block outlines pushed out onto the sidewalk', () => {
    const sq: XZ[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const g = growRing(sq, 1);
    expect(Math.abs(ringArea(g))).toBeCloseTo(144);
    expect(Math.abs(ringArea(growRing([...sq].reverse(), 1)))).toBeCloseTo(144);
    const loops = sidewalkLoops(KAOHSIUNG);
    expect(loops.length).toBeGreaterThan(500);
    let n = 0,
      on = 0;
    for (const l of loops) for (const [x, z] of l.loop) n++, surf.onWalk(x, z) && on++;
    expect(on / n).toBeGreaterThan(0.9);
    expect(L.walks.length).toBe(loops.length);
  });

  it('people walk the sidewalk loops around the taxi and follow it across the map', () => {
    const people = new People(new THREE.Scene(), L.walks, 50, 11, L.spawn.p);
    expect(people.list.every((p) => Math.hypot(p.x - L.spawn.p.x, p.z - L.spawn.p.z) < 150)).toBe(true);
    for (let k = 0; k < 120; k++) people.update(DT, null);
    let on = 0;
    for (const p of people.list) if (surf.onWalk(p.x, p.z)) on++;
    expect(on).toBeGreaterThan(people.list.length * 0.85);
    const far = L.places.find((p) => Math.hypot(p.x - L.spawn.p.x, p.z - L.spawn.p.z) > 900)!;
    const taxi: TaxiNow = { x: far.x, z: far.z, vx: 0, vz: 0, yaw: 0, kmh: 0 };
    for (let k = 0; k < 60; k++) people.update(DT, taxi);
    expect(people.list.every((p) => Math.hypot(p.x - taxi.x, p.z - taxi.z) < 170)).toBe(true);
    // a polyline loop goes all the way round
    const w = L.walks[0];
    const a = onLoop(w, 0),
      b = onLoop(w, 1e-3);
    expect(Math.hypot(a.x - w.loop![0][0], a.z - w.loop![0][1])).toBeLessThan(1e-6);
    expect(Math.hypot(b.ux, b.uz)).toBeCloseTo(1);
  });
});

describe('Rush Taxi real-map squeezed carriageways', () => {
  it('a one-way road overlapping a parallel road gives up its shared edge', async () => {
    const { overlaps, bandOffsets } = await import('../src/taxi/world/osm/roadnet');
    // two one-way roads 5 m apart (each 7.6 m wide): heading +x, the second lies to the right (+z)
    const data = { nodes: [], roads: [
      { a: 0, b: 1, cls: 'primary', w: 7.6, oneway: 1, pts: [[0, 0], [100, 0]] },
      { a: 2, b: 3, cls: 'primary', w: 7.6, oneway: 1, pts: [[100, 5], [0, 5]] },
    ] } as unknown as OsmCityData;
    const o = overlaps(data);
    expect(o[0][0]).toBe(0);
    expect(o[0][1]).toBeGreaterThan(2);
    expect(o[1][1]).toBeGreaterThan(2); // for the other one (heading −x) the first road is on its right too
    const offs = bandOffsets(7.6, o[0]);
    expect(Math.max(...offs)).toBeLessThan(5 - 1.2 - Math.max(...bandOffsets(7.6, o[1])) + 5); // sanity
    // lanes of the two roads stay at least a car width apart
    const a = offs.map((x) => x),
      b = bandOffsets(7.6, o[1]).map((x) => 5 - x);
    for (const x of a) for (const y of b) expect(Math.abs(x - y)).toBeGreaterThan(2.2);
  });
});
