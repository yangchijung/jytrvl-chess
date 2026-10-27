// Rush Taxi street slice: the ordinary buildings read as Kaohsiung streets (src/taxi/world/osm/fill.ts street data,
// facade.ts face codes, the rooftop kit), without new colliders on the sidewalks and within the triangle budget.
import { beforeAll, describe, expect, it } from 'vitest';
import { KAOHSIUNG } from '../src/taxi/world/osm/data';
import { ARCADE_DEPTH, arcadeChance, fillBlocks, finishFor, zoneOf, type FillResult } from '../src/taxi/world/osm/fill';
import { faceCode, faceDir, FINISH_BRICK, FINISH_CREAM, FINISH_MOSAIC, TYPE_APARTMENT, TYPE_LUXURY, TYPE_WALKUP } from '../src/taxi/world/facade';
import { osmLevel } from '../src/taxi/world/osm/level';
import { surfaceTests } from '../src/taxi/world/osm/walks';
import type { Shape } from '../src/taxi/world/greybox';
import type { Level } from '../src/taxi/world/level';

type BoxShape = Extract<Shape, { kind: 'box' }>;

/** distance from a point to the nearest road kerb (centre line minus half the width) */
function kerbDist(x: number, z: number) {
  let best = Infinity;
  for (const r of KAOHSIUNG.roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      if (Math.min(ax, bx) > x + 40 || Math.max(ax, bx) < x - 40 || Math.min(az, bz) > z + 40 || Math.max(az, bz) < z - 40) continue;
      const vx = bx - ax,
        vz = bz - az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t) - r.w / 2);
    }
  }
  return best;
}

/** the midpoint of face `code` of a box and its outward direction */
function faceMid(s: BoxShape, code: number) {
  const [dx, dz] = faceDir(code, s.yaw ?? 0);
  const half = Math.abs(code) === 1 ? s.size[2] / 2 : s.size[0] / 2;
  return { x: s.p[0] + dx * half, z: s.p[2] + dz * half, dx, dz };
}

describe('face codes', () => {
  it('maps a world direction to the box face and back', () => {
    for (const ang of [0, 0.4, 1.2, 2.5, -0.9]) {
      const c = Math.cos(ang),
        s = Math.sin(ang);
      const yaw = -Math.atan2(s, c);
      // local +z is (−s, c), local +x is (c, s)
      expect(faceCode(c, s, -s, c)).toBe(1);
      expect(faceCode(c, s, s, -c)).toBe(-1);
      expect(faceCode(c, s, c, s)).toBe(2);
      expect(faceCode(c, s, -c, -s)).toBe(-2);
      for (const code of [1, -1, 2, -2]) {
        const [fx, fz] = faceDir(code, yaw);
        expect(faceCode(c, s, fx, fz)).toBe(code);
      }
    }
  });
  it('picks finishes by district and arcades by street', () => {
    const old = Array.from({ length: 400 }, (_, i) => finishFor('old', i / 400));
    const res = Array.from({ length: 400 }, (_, i) => finishFor('res', i / 400));
    const share = (a: number[], f: number) => a.filter((x) => x === f).length / a.length;
    // old town: 二丁掛 cream and brick red; the apartment districts: white mosaic
    expect(share(old, FINISH_CREAM) + share(old, FINISH_BRICK)).toBeGreaterThan(0.5);
    expect(share(res, FINISH_MOSAIC)).toBeGreaterThan(share(old, FINISH_MOSAIC) * 3);
    expect(arcadeChance('port', 5)).toBe(0);
    expect(arcadeChance('old', 3)).toBeGreaterThan(arcadeChance('old', 1));
    expect(arcadeChance('shop', 1)).toBeGreaterThan(0.8);
  });
});

describe('street buildings of central Kaohsiung', () => {
  let F: FillResult;
  let L: Level;
  let boxes: BoxShape[];
  beforeAll(() => {
    F = fillBlocks(KAOHSIUNG);
    L = osmLevel();
    boxes = L.shapes.filter((s): s is BoxShape => s.kind === 'box');
  }, 180000);

  it('is deterministic, street data included', () => {
    const G = fillBlocks(KAOHSIUNG);
    const st = (r: FillResult) => r.shapes.map((s) => (s.kind === 'box' ? (s.st ?? []).join(',') : '')).join(';');
    expect(st(G)).toBe(st(F));
    expect(G.decor.sheds).toEqual(F.decor.sheds);
    expect(G.decor.shopSigns).toEqual(F.decor.shopSigns);
  }, 120000);

  it('gives arcades to thousands of street fronts, and the district building types appear', () => {
    const fill = F.shapes.filter((s): s is BoxShape => s.kind === 'box');
    const arcs = fill.filter((s) => s.st && s.st[1] > 0);
    expect(arcs.length).toBeGreaterThan(2500);
    const types = new Set(fill.map((s) => s.st?.[3]));
    for (const t of [TYPE_WALKUP, TYPE_APARTMENT, TYPE_LUXURY]) expect(types.has(t)).toBe(true);
    // the old town's street fronts mostly have arcades
    const oldFront = F.footprints.filter((f) => f.front && zoneOf(KAOHSIUNG.blocks[f.block]) === 'old');
    const oldArc = fill.filter((s) => s.st && s.st[1] > 0 && oldFront.some((f) => Math.abs(f.b.x - s.p[0]) < 0.01 && Math.abs(f.b.z - s.p[2]) < 0.01));
    expect(oldArc.length / oldFront.length).toBeGreaterThan(0.4);
    // mapped houses get them too
    expect(boxes.filter((s) => /^b\d+$/.test(s.id) && s.st && s.st[1] > 0).length).toBeGreaterThan(50);
  });

  it('puts arcades only on ground boxes whose front faces a road, with a sane depth', () => {
    const arcs = boxes.filter((s) => s.st && s.st[1] > 0);
    const bad: string[] = [];
    for (const s of arcs) {
      const [code, depth] = s.st!;
      const y0 = s.p[1] - s.size[1] / 2;
      const across = Math.abs(code) === 1 ? s.size[2] : s.size[0];
      if (y0 > 0.01 || s.nocollide || s.look === undefined || Math.floor(s.look) > 2) bad.push(`${s.id} not a ground building`);
      if (depth < ARCADE_DEPTH[0] * 0.5 || depth > ARCADE_DEPTH[1] + 1e-9 || depth > across * 0.4 + 1e-9) bad.push(`${s.id} depth ${depth}`);
      // the front face is near a kerb, nearer than the opposite face (or right on the kerb of the bigger road, for a
      // building between two streets)
      const f = faceMid(s, code),
        b = faceMid(s, -code);
      const df = kerbDist(f.x + f.dx, f.z + f.dz),
        db = kerbDist(b.x + b.dx, b.z + b.dz);
      if (df > 16 || (df >= db && df > 8)) bad.push(`${s.id} front ${df.toFixed(1)} back ${db.toFixed(1)}`);
      if (bad.length > 5) break;
    }
    expect(bad).toEqual([]);
  }, 120000);

  it('puts nothing over the sidewalk or the road below 3 m', () => {
    const surf = surfaceTests(KAOHSIUNG);
    const over = (x: number, z: number) => surf.onWalk(x, z) || surf.onRoad(x, z);
    const bad: string[] = [];
    const d = L.decor!;
    for (const s of d.shopSigns) {
      // the board is 0.9 m wide (out from the wall) and 3 m tall, centred at y
      const ex = Math.cos(s.yaw) * 0.45,
        ez = -Math.sin(s.yaw) * 0.45;
      if (s.y - 1.5 < 3 && [0, 1, -1].some((k) => over(s.x + ex * k, s.z + ez * k))) bad.push(`sign ${s.x},${s.z} at ${s.y}`);
      expect(s.y - 1.5).toBeGreaterThanOrEqual(3);
    }
    for (const a of d.acs) if (a.y - 0.3 < 3 && over(a.x, a.z)) bad.push(`ac ${a.x},${a.z}`);
    for (const t of d.tanks) if (t.y < 3) bad.push(`tank at ${t.y}`);
    for (const s of d.sheds) if (s.y < 3) bad.push(`roof part at ${s.y}`);
    // drawn-only boxes (balconies, canopies, upper floors): over the pavement only above 3 m
    for (const s of boxes) if (s.nocollide && s.p[1] - s.size[1] / 2 < 3 && over(s.p[0], s.p[2])) bad.push(`${s.id} low over the pavement`);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('keeps colliders as they were: an arcade building is one solid box, the rooftop kit is drawn only', () => {
    const fill = F.shapes.filter((s): s is BoxShape => s.kind === 'box');
    for (const s of fill) if (s.st && s.st[1] > 0) expect(s.nocollide).toBeFalsy();
    // the kit is decor, not shapes: no shape is a stair tower, cage, panel or mast
    expect(F.decor.sheds.filter((s) => s.kind).length).toBeGreaterThan(3000);
    // every kit part stands on a roof: at or above some building top near it
    const tops = boxes.filter((s) => s.look !== undefined);
    const part = F.decor.sheds.filter((s) => s.kind === 'stair')[100];
    expect(tops.some((s) => Math.abs(s.p[1] + s.size[1] / 2 - part.y) < 0.01 && Math.hypot(s.p[0] - part.x, s.p[2] - part.z) < Math.hypot(s.size[0], s.size[2]) / 2)).toBe(true);
  });

  it('stays within the triangle budget near the camera', () => {
    // what the street detail costs where the camera is: roof boxes 10 triangles (near field, 300 m), tanks 76 (300 m),
    // air conditioners 22 (200 m), shop signs 16 (merged per 460 m square, drawn to 480 m from its centre)
    const d = L.decor!;
    const probes: [number, number][] = [
      [L.spawn.p.x, L.spawn.p.z],
      [-870, -470], // 鹽埕
      [-130, -600], // 前金
      [300, -700], // 新興
      [800, -500], // 苓雅
    ];
    const near = <T extends { x: number; z: number }>(a: T[], x: number, z: number, r: number) => a.filter((p) => Math.hypot(p.x - x, p.z - z) < r).length;
    for (const [x, z] of probes) {
      const cost = near(d.sheds, x, z, 300) * 10 + near(d.tanks, x, z, 300) * 76 + near(d.acs, x, z, 200) * 22 + near(d.shopSigns, x, z, 480) * 16;
      // the old detail (12-triangle sheds, 144-triangle tanks, 1,400 signs) peaked at 20.9k (鹽埕); the street slice
      // may add at most 12k of it here (and the scene as measured in the browser stays within +20k)
      expect(cost).toBeLessThan(33000);
    }
  });
});
