// Rush Taxi real-map city: the landmark models. Every listed landmark gets a model; the models stand on the land,
// keep off the roads (only high parts such as gate lintels may span a street), stay inside the triangle budget, and
// leave the name boards, the passenger kerbs and the park trees clear.
import { describe, expect, it } from 'vitest';
import { KAOHSIUNG as D } from '../src/taxi/world/osm/data';
import { osmLevel } from '../src/taxi/world/osm/level';
import {
  HIGH, ROAD_GAP, Site, TOWER85_SCALE, fitRect, footSamples, formosaJunction, inFoot, landmarkModels, primFoot, primTriangles, rectOfRing, shapeFoot,
} from '../src/taxi/world/osm/landmarks';

const site = new Site(D);
const LM = landmarkModels(D);
const level = osmLevel(D);

describe('Rush Taxi OSM landmarks', () => {
  it('builds a model for every listed landmark, plus the Dome of Light at the Formosa Boulevard roundabout', () => {
    for (const l of D.landmarks) {
      const m = LM.models.get(l.id);
      expect(m, l.id).toBeDefined();
      // a detailed hero model may be a few free-geometry parts
      expect(m!.prims.length >= 3 || m!.prims.some((p) => p.t === 'mesh'), l.id).toBe(true);
    }
    const dome = LM.models.get('formosa')!;
    const j = formosaJunction(D)!;
    expect(dome.prims.length).toBeGreaterThan(3);
    expect(Math.hypot(dome.prims[0].x - j[0], dome.prims[0].z - j[1])).toBeLessThan(45);
    // the final checks barely had to remove anything
    expect(LM.rejected.length).toBeLessThan(6);
  });

  it('puts each model at its real place (within its fitted footprint of the mapped point)', () => {
    for (const l of D.landmarks) {
      if (['liuhe', 'nanhua', 'guanghua', 'centralpark', 'lovepier'].includes(l.id)) continue; // street rows, park and quay pieces
      const m = LM.models.get(l.id)!;
      const xs = m.prims.map((p) => p.x),
        zs = m.prims.map((p) => p.z);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
        cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const reach = l.id === 'pier2' ? 220 : l.id === 'musiccenter' ? 120 : 70;
      expect(Math.hypot(cx - l.x, cz - l.z), l.id).toBeLessThan(reach);
    }
  });

  it('keeps every model on the land (only the harbour bridge stands over the water)', () => {
    for (const [id, m] of LM.models) {
      if (m.overWater) continue;
      for (const p of m.prims) for (const [x, z] of footSamples(primFoot(p), 2)) expect(site.inWaterExact(x, z), `${id} ${p.t} at ${x.toFixed(0)},${z.toFixed(0)}`).toBe(false);
    }
    expect(LM.models.get('greatharbor')!.overWater).toBe(true);
    expect(LM.models.get('greatharbor')!.shapes.length).toBe(0); // decor only
  });

  it('never blocks a road: nothing low within the road width of a centre line (arches and the canopy are high above it)', () => {
    let high = 0;
    for (const [id, m] of LM.models) {
      for (const p of m.prims) {
        const f = primFoot(p);
        if (f.y0 >= HIGH) {
          high++;
          continue;
        }
        for (const [x, z] of footSamples(f, 1.5)) expect(site.roadGap(x, z), `${id} ${p.t}`).toBeGreaterThanOrEqual(ROAD_GAP);
      }
      for (const s of m.shapes) {
        const f = shapeFoot(s)!;
        for (const [x, z] of footSamples(f, 1.5)) expect(site.roadGap(x, z), `${id} collider`).toBeGreaterThanOrEqual(ROAD_GAP);
      }
    }
    expect(high).toBeGreaterThan(0); // the gate lintels and the station canopy span streets
  });

  it('measures the road gap the same way as a plain search over every road', () => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const x = -1200 + ((i * 7919) % 2400),
        z = -1400 + ((i * 104729) % 2800);
      let best = Infinity;
      for (const r of D.roads)
        for (let k = 0; k < r.pts.length - 1; k++) {
          const [ax, az] = r.pts[k];
          const [bx, bz] = r.pts[k + 1];
          const vx = bx - ax,
            vz = bz - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
          best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t) - r.w / 2);
        }
      if (best < 10) {
        n++;
        expect(site.roadGap(x, z)).toBeCloseTo(best, 5);
      } else expect(site.roadGap(x, z)).toBeGreaterThanOrEqual(10);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('night markets: gate lintels span the street high up, posts and stalls stay on the pavement, the road stays drivable', () => {
    const m = LM.models.get('liuhe')!;
    const lintels = m.prims.filter((p) => p.t === 'box' && primFoot(p).y0 >= HIGH && primFoot(p).y0 < 7);
    expect(lintels.length).toBeGreaterThanOrEqual(2);
    // a lintel crosses the carriageway
    expect(lintels.some((p) => footSamples(primFoot(p), 1).some(([x, z]) => site.roadGap(x, z) < 0))).toBe(true);
    expect(m.shapes.length).toBeGreaterThan(20); // stalls and posts collide
    expect(m.signs.length).toBeGreaterThanOrEqual(2); // the market's name on the gates
  });

  it('draws the 85 Sky Tower at 0.6 of its real 347 m, with two legs below the join', () => {
    const t = LM.models.get('tower85')!;
    const top = Math.max(...t.prims.map((p) => primFoot(p).y1));
    expect(top).toBeCloseTo(347 * TOWER85_SCALE, 0);
    const legs = t.prims.filter((p) => ((p.t === 'box' && p.sy > 50) || (p.t === 'mesh' && p.y1 - p.y0 > 50)) && primFoot(p).y0 < 20);
    expect(legs.length).toBe(2);
  });

  it('stays inside its triangle budget', () => {
    // the whole landmark set: the remaining box models plus the detailed hero models (each slice also has its own
    // budget in tests/taxi-hero-*.test.ts: skyline 25k; harbour, transit, culture 20k each)
    const tris = LM.prims.reduce((a, p) => a + primTriangles(p), 0);
    expect(tris).toBeLessThan(110000);
  });

  it('replaces the mapped boxes it covers, in the level', () => {
    expect(LM.drop.size).toBeGreaterThan(20);
    const ids = new Set(level.shapes.map((s) => s.id));
    for (const i of LM.drop) expect(ids.has(`b${i}`)).toBe(false);
    // the 85 Sky Tower's own mapped box is gone
    const i85 = D.buildings.findIndex((b) => b.name === '高雄八五大樓');
    expect(LM.drop.has(i85)).toBe(true);
    expect(level.prims.length).toBeGreaterThan(LM.prims.length * 0.9);
  });

  it('leaves the name boards, the passenger kerbs and the trees clear of the models', () => {
    const feet = level.prims.map(primFoot);
    for (const s of level.signs) {
      const inside = feet.find((f) => f.y1 > s.y - 1.1 && f.y0 < s.y + 1.1 && inFoot(f, s.x, s.z, 0.2));
      expect(inside, `board ${s.id}`).toBeUndefined();
    }
    // the level's own landmark colliders (built with the kerbs kept free)
    const cols = level.shapes.filter((s) => s.kind !== 'wedge' && s.hidden && !/^w[nswe]$/.test(s.id)).map((s) => shapeFoot(s)!).filter((f) => f && f.y0 < 2);
    expect(cols.length).toBeGreaterThan(100);
    for (const p of [...level.places, ...level.stops]) {
      const x = p.cx ?? p.x,
        z = p.cz ?? p.z;
      expect(cols.find((f) => inFoot(f, x, z, 0.3)), `kerb ${p.id}`).toBeUndefined();
      expect(cols.find((f) => inFoot(f, p.x, p.z, 0.3)), `stop ${p.id}`).toBeUndefined();
    }
    for (const t of level.trees) expect(cols.find((f) => inFoot(f, t.x, t.z, 0.2))).toBeUndefined();
  });

  it('fits a footprint off the road and onto the land by shrinking the side that is in the way', () => {
    const lm = D.landmarks.find((l) => l.id === 'sanfeng')!;
    const r = rectOfRing(lm.poly!);
    const f = fitRect(site, r, 4.2)!;
    expect(f).not.toBeNull();
    expect(f.L * f.W).toBeLessThanOrEqual(r.L * r.W);
    for (const [x, z] of footSamples({ x: f.cx, z: f.cz, hx: f.L / 2, hz: f.W / 2, ang: f.ang, y0: 0, y1: 1 }, 2)) expect(site.roadGap(x, z)).toBeGreaterThanOrEqual(4.2 - 0.5);
  });
});
