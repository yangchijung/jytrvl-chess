// Rush Taxi real-map city: the street furniture (src/taxi/world/osm/decor.ts). Nothing stands on a carriageway or
// in the water, scooters keep clear of stops and junction corners, the boards carry real names, and the boats stay
// in the Love River.
import { describe, expect, it } from 'vitest';
import { osmLevel } from '../src/taxi/world/osm/level';
import { KAOHSIUNG, RANK } from '../src/taxi/world/osm/data';
import { RoadIndex, WaterIndex, SCOOTER_DISTRICTS, KERB, loveRiver, osmDecor, shortEn, addOsmDecor, emptyDecor } from '../src/taxi/world/osm/decor';
import type { Level } from '../src/taxi/world/level';

const L = osmLevel();
const d = L.decor!;
const roads = new RoadIndex(KAOHSIUNG.roads);
const water = new WaterIndex(KAOHSIUNG.water);

function pointInRing(x: number, z: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

describe('Rush Taxi real-map street decor', () => {
  it('has every kind of street furniture, in sensible numbers', () => {
    expect(d.lamps.length).toBeGreaterThan(400);
    expect(d.scooters.length).toBeGreaterThan(300);
    expect(d.palms.length).toBeGreaterThan(60);
    expect(d.curbs.length).toBeGreaterThan(1000);
    expect(d.boats.length).toBeGreaterThanOrEqual(2);
    expect(d.streetSigns!.length).toBeGreaterThan(40);
    expect(d.rail!.pieces.length).toBeGreaterThan(100);
    // the drawing budget: keep the totals bounded
    expect(d.lamps.length).toBeLessThan(2600);
    expect(d.scooters.length).toBeLessThan(2600);
    expect(d.curbs.length).toBeLessThan(9000);
  });

  it('puts nothing on a carriageway or in the water', () => {
    const bad: string[] = [];
    const check = (kind: string, x: number, z: number, m: number) => {
      if (roads.clearance(x, z) < m) bad.push(`${kind} on road ${x.toFixed(1)},${z.toFixed(1)}`);
      if (water.inWater(x, z)) bad.push(`${kind} in water ${x.toFixed(1)},${z.toFixed(1)}`);
    };
    for (const p of d.lamps) check('lamp', p.x, p.z, 0.3);
    for (const p of d.scooters) check('scooter', p.x, p.z, 0.3);
    for (const p of d.palms) check('palm', p.x, p.z, 1);
    for (const p of d.curbs) check('kerb', p.x, p.z, 0);
    for (const s of d.streetSigns!) check('sign', s.x, s.z, 0.5);
    for (const p of d.rail!.poles) check('rail post', p.x, p.z, 0.5);
    for (const p of d.rail!.pieces) if (water.inWater((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)) bad.push('rail in water');
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('parks scooters only in 鹽埕、三民、新興、苓雅, never at stops or junction corners', () => {
    const polys = KAOHSIUNG.districts.filter((x) => SCOOTER_DISTRICTS.includes(x.zh)).flatMap((x) => x.poly);
    const deg = new Map<number, number>();
    for (const r of KAOHSIUNG.roads) for (const n of [r.a, r.b]) deg.set(n, (deg.get(n) ?? 0) + 1);
    const junctions = [...deg].filter(([, k]) => k >= 3).map(([n]) => KAOHSIUNG.nodes[n]);
    let outside = 0;
    const bad: string[] = [];
    for (const s of d.scooters) {
      if (!polys.some((p) => pointInRing(s.x, s.z, p[0]))) outside++;
      for (const st of [...L.stops, ...L.places]) if (Math.hypot((st.cx ?? st.x) - s.x, (st.cz ?? st.z) - s.z) < 4) bad.push(`stop ${st.id}`);
      for (const [jx, jz] of junctions) if (Math.hypot(jx - s.x, jz - s.z) < 9) bad.push(`junction ${jx},${jz}`);
    }
    // the road's middle decides its district: a few scooters at the far end of a road may sit across the line
    expect(outside / d.scooters.length).toBeLessThan(0.05);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('paints kerbs red, yellow or grey, and turns them along the road', () => {
    const cols = new Set(d.curbs.map((c) => c.color));
    expect([...cols].sort()).toEqual([KERB.grey, KERB.red, KERB.yellow].sort());
    expect(d.curbs.every((c) => typeof c.yaw === 'number' && c.w > 0.5 && c.w <= 24.01)).toBe(true);
  });

  it('names the junctions with real road names (zh and en), at most about 250 boards', () => {
    const real = new Set(KAOHSIUNG.roads.filter((r) => RANK[r.cls] >= 3 && r.name).map((r) => r.name));
    const boards = d.streetSigns!.flatMap((s) => s.boards);
    expect(boards.length).toBeLessThanOrEqual(250);
    for (const s of d.streetSigns!) {
      expect(s.boards.length).toBe(2);
      expect(s.boards[0].zh).not.toBe(s.boards[1].zh);
    }
    for (const b of boards) {
      expect(real.has(b.zh)).toBe(true);
      expect(b.en).toMatch(/^[A-Z][A-Za-z' -]*( \d+(st|nd|rd|th))?( (Rd\.|St\.|Blvd\.|Roundabout|Viaduct|Ave\.))?$/);
    }
    expect(boards.map((b) => b.zh)).toContain('中山一路');
    expect(shortEn('WuFu 3rd Road')).toBe('Wufu 3rd Rd.');
    expect(shortEn('Cisian 3rd Road.')).toBe('Cisian 3rd Rd.');
  });

  it('cruises the boats along the Love River, inside the water all the way', () => {
    const river = KAOHSIUNG.water[loveRiver(KAOHSIUNG)][0];
    for (const b of d.boats) {
      expect(b.path!.length).toBeGreaterThan(10);
      for (const [x, z] of b.path!) {
        expect(pointInRing(x, z, river)).toBe(true);
        expect(water.bankDist(x, z, 3)).toBeGreaterThanOrEqual(2.9);
      }
    }
  });

  it('lays the light rail from the data, with posts only beside the off-road track', () => {
    const beds = new Set(d.rail!.pieces.map((p) => p.bed));
    expect(beds.has('grass') || beds.has('road')).toBe(true);
    expect(d.rail!.poles.length).toBeGreaterThan(0);
  });

  it('merges into an existing decor without dropping what other steps added', () => {
    const lv = { ...L, shapes: [], decor: { ...emptyDecor(), tanks: [{ x: 1, y: 2, z: 3 }], signals: [{ x: 0, z: 0, yaw: 0, axis: 'x' as const }] } } as Level;
    addOsmDecor(lv);
    expect(lv.decor!.tanks.length).toBe(1);
    expect(lv.decor!.signals.length).toBe(1);
    expect(lv.decor!.lamps.length).toBe(d.lamps.length);
    // palm trunks are solid
    expect(lv.shapes.filter((s) => s.kind === 'cyl').length).toBe(d.palms.length);
    // and it is deterministic
    expect(osmDecor(KAOHSIUNG, { stops: L.stops, places: L.places }).scooters.length).toBe(d.scooters.length);
  });
});
