// Rush Taxi: the block fill of the real-map city (src/taxi/world/osm/fill.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { KAOHSIUNG, type Poly } from '../src/taxi/world/osm/data';
import { fillBlocks, flatRing, mappedBoxes, obbInPoly, obbOverlap, pointInFlat, ringArea, segHitsObb, zoneOf, type FillResult, type Obb } from '../src/taxi/world/osm/fill';
import { osmLevel } from '../src/taxi/world/osm/level';
import type { Shape } from '../src/taxi/world/greybox';

type BoxShape = Extract<Shape, { kind: 'box' }>;
const sq = (x: number, z: number, h: number, ang = 0): Obb => ({
  x,
  z,
  hl: h,
  hw: h,
  c: Math.cos(ang),
  s: Math.sin(ang),
});
const toObb = (s: BoxShape): Obb => ({
  x: s.p[0],
  z: s.p[2],
  hl: s.size[0] / 2,
  hw: s.size[2] / 2,
  c: Math.cos(-(s.yaw ?? 0)),
  s: Math.sin(-(s.yaw ?? 0)),
});

describe('fill geometry helpers', () => {
  it('separates and overlaps oriented boxes', () => {
    expect(obbOverlap(sq(0, 0, 1), sq(1.5, 0, 1))).toBe(true);
    expect(obbOverlap(sq(0, 0, 1), sq(2.1, 0, 1))).toBe(false);
    // a diamond whose corner points at the square: clear at 2.5, touching at 2.3
    expect(obbOverlap(sq(0, 0, 1), sq(2.5, 0, 1, Math.PI / 4))).toBe(false);
    expect(obbOverlap(sq(0, 0, 1), sq(2.3, 0, 1, Math.PI / 4))).toBe(true);
  });
  it('clips segments against a box', () => {
    const b = sq(0, 0, 1);
    expect(segHitsObb(-3, 0, 3, 0, b)).toBe(true);
    expect(segHitsObb(-3, 2, 3, 2, b)).toBe(false);
    expect(segHitsObb(2, -3, 2, 3, b)).toBe(false);
    expect(segHitsObb(0.5, 0.5, 0.6, 0.6, b)).toBe(true);
  });
  it('keeps a box inside a polygon with a notch', () => {
    // an L-shaped block: the box in the arm fits, the box over the notch does not
    const L: Poly = [
      [
        [0, 0],
        [40, 0],
        [40, 20],
        [20, 20],
        [20, 40],
        [0, 40],
      ],
    ];
    expect(obbInPoly(sq(10, 10, 5), L)).toBe(true);
    expect(obbInPoly(sq(22, 22, 5), L)).toBe(false);
    expect(obbInPoly(sq(17, 17, 2), L)).toBe(true);
    expect(obbInPoly(sq(21, 19, 3), L)).toBe(false); // the notch corner pokes into it
    expect(pointInFlat(30, 30, flatRing(L[0]))).toBe(false);
  });
  it('zones by district and land use', () => {
    expect(zoneOf({ district: '鹽埕區' })).toBe('old');
    expect(zoneOf({ district: '三民區', use: 'residential' })).toBe('old');
    expect(zoneOf({ district: '新興區', use: 'residential' })).toBe('down');
    expect(zoneOf({ district: '苓雅區', use: 'retail' })).toBe('shop');
    expect(zoneOf({ district: '前鎮區' })).toBe('port');
    expect(zoneOf({ district: '前鎮區', use: 'residential' })).toBe('res');
    expect(zoneOf({ district: '新興區', use: 'industrial' })).toBe('port');
  });
});

describe('fill of central Kaohsiung', () => {
  let F: FillResult;
  /** every fill box standing on the ground (bases, interiors, podiums): what must stay off sidewalks, roads, water */
  let ground: Obb[];
  beforeAll(() => {
    F = fillBlocks(KAOHSIUNG);
    ground = F.shapes.filter((s): s is BoxShape => s.kind === 'box' && s.p[1] - s.size[1] / 2 < 3).map(toObb);
  });

  it('is deterministic', () => {
    const G = fillBlocks(KAOHSIUNG);
    expect(G.shapes.length).toBe(F.shapes.length);
    expect(G.shapes[1234]).toEqual(F.shapes[1234]);
    expect(G.decor.tanks.length).toBe(F.decor.tanks.length);
  });

  it('builds a real city: thousands of buildings, mostly street frontage', () => {
    const fronts = F.footprints.filter((f) => f.front).length;
    expect(F.footprints.length).toBeGreaterThan(8000);
    expect(fronts / F.footprints.length).toBeGreaterThan(0.6);
    // all four styles appear
    const looks = new Set(F.shapes.filter((s): s is BoxShape => s.kind === 'box' && s.look !== undefined).map((s) => Math.floor(s.look!)));
    expect([...looks].sort()).toEqual([0, 1, 2, 3]);
    // old town is narrow 透天厝 frontage: median lot width 4–7 m
    const old = F.footprints
      .filter((f) => f.front && zoneOf(KAOHSIUNG.blocks[f.block]) === 'old')
      .map((f) => f.b.hl * 2)
      .sort((a, b) => a - b);
    const med = old[old.length >> 1];
    expect(med).toBeGreaterThanOrEqual(4);
    expect(med).toBeLessThanOrEqual(7);
  });

  it('gives every non-park block of 300 m² or more at least one building', () => {
    const mapped = mappedBoxes(KAOHSIUNG);
    const has = new Set(F.footprints.map((f) => f.block));
    const missing: number[] = [];
    KAOHSIUNG.blocks.forEach((b, i) => {
      if (b.park || Math.abs(ringArea(b.poly[0])) < 300 || has.has(i)) return;
      const ring = flatRing(b.poly[0]);
      if (mapped.some((m) => pointInFlat(m.x, m.z, ring))) return;
      missing.push(i);
    });
    expect(missing).toEqual([]);
  });

  it('keeps every building off sidewalks, roads and water', () => {
    const S = KAOHSIUNG.surfaces;
    const polys: Poly[] = [...S.walk.map(([, p]) => p), ...S.road.map(([, p]) => p), ...KAOHSIUNG.water];
    // bounds per polygon, flat rings
    const P = polys.map((p) => {
      let x0 = Infinity,
        x1 = -Infinity,
        z0 = Infinity,
        z1 = -Infinity;
      for (const [x, z] of p[0]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      return { f: p.map(flatRing), x0, x1, z0, z1 };
    });
    const bad: Obb[] = [];
    // shrink a hair: a lot may touch the inner line of a sidewalk polygon to within rounding
    for (const g of ground) {
      const b = { ...g, hl: g.hl - 0.05, hw: g.hw - 0.05 };
      const R = b.hl + b.hw;
      for (const p of P) {
        if (b.x + R < p.x0 || b.x - R > p.x1 || b.z + R < p.z0 || b.z - R > p.z1) continue;
        const inside = (x: number, z: number) => pointInFlat(x, z, p.f[0]) && !p.f.slice(1).some((h) => pointInFlat(x, z, h));
        let hit = inside(b.x, b.z);
        for (const f of p.f) {
          if (hit) break;
          for (let i = 0, j = f.length - 2; i < f.length && !hit; j = i, i += 2) hit = segHitsObb(f[j], f[j + 1], f[i], f[i + 1], b);
        }
        if (hit) {
          bad.push(g);
          break;
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('never overlaps a mapped footprint or another fill building', () => {
    const all = [...mappedBoxes(KAOHSIUNG).map((b) => ({ b, mapped: true })), ...F.footprints.map((f) => ({ b: f.b, mapped: false }))];
    const cell = new Map<string, typeof all>();
    for (const it of all) {
      const k = `${Math.floor(it.b.x / 30)},${Math.floor(it.b.z / 30)}`;
      (cell.get(k) ?? cell.set(k, []).get(k)!).push(it);
    }
    let hits = 0;
    for (const f of F.footprints) {
      const i = Math.floor(f.b.x / 30),
        j = Math.floor(f.b.z / 30);
      for (let a = i - 2; a <= i + 2; a++)
        for (let c = j - 2; c <= j + 2; c++) for (const o of cell.get(`${a},${c}`) ?? []) if (o.b !== f.b && obbOverlap(f.b, { ...o.b, hl: o.b.hl - 0.01, hw: o.b.hw - 0.01 })) hits++;
    }
    expect(hits).toBe(0);
  });

  it('gives the street-frontage buildings colliders; only raised parts are drawn without one', () => {
    for (const s of F.shapes) {
      if (s.kind !== 'box') continue;
      const y0 = s.p[1] - s.size[1] / 2;
      if (y0 < 0.01) expect(s.nocollide).toBeFalsy();
      else expect(s.nocollide).toBe(true);
    }
  });

  it('feeds tanks, sheds, air conditioners and shop signs within the triangle caps', () => {
    expect(F.decor.tanks.length).toBeGreaterThan(300);
    expect(F.decor.tanks.length).toBeLessThanOrEqual(1200);
    expect(F.decor.shopSigns.length).toBeGreaterThan(300);
    expect(F.decor.shopSigns.length).toBeLessThanOrEqual(1500);
    expect(F.decor.acs.length).toBeGreaterThan(1000);
    expect(F.decor.sheds.length).toBeGreaterThan(300);
    // tanks stand on a roof: on top of some fill building's ground box
    const tops = F.shapes.filter((s): s is BoxShape => s.kind === 'box' && s.look !== undefined);
    const t = F.decor.tanks[17];
    expect(tops.some((s) => Math.abs(s.p[1] + s.size[1] / 2 - t.y) < 0.01 && obbOverlap(toObb(s), sq(t.x, t.z, 0.1)))).toBe(true);
  });

  it('is wired into the level: shapes, every decor list and the pitched roofs', () => {
    const L = osmLevel();
    expect(L.decor).not.toBeNull();
    for (const k of ['tanks', 'sheds', 'acs', 'shopSigns', 'scooters', 'lamps', 'signals', 'palms', 'curbs', 'boats'] as const) expect(Array.isArray(L.decor![k])).toBe(true);
    expect(L.decor!.tanks.length).toBe(F.decor.tanks.length);
    expect(L.massing?.pitched.length).toBe(F.pitched.length);
    expect(L.shapes.length).toBeGreaterThan(F.shapes.length);
  });
});
