// Rush Taxi hero models, harbour slice: Pier-2 (warehouses, art pieces), Pier-2 Tower, True Love Pier, Glory Pier,
// the Great Harbor Bridge, the Harbor Museum and Xinguang Pier. They exist as detailed free geometry, keep to their
// site (off the roads, off the water except the bridge, clear of the light rail), stay inside the slice's triangle
// budget, glow at night where it means something, and keep their colliders.
import { describe, expect, it } from 'vitest';
import { KAOHSIUNG as D } from '../src/taxi/world/osm/data';
import { HIGH, ROAD_GAP, Site, footSamples, landmarkModels, primFoot, primTriangles, shapeFoot } from '../src/taxi/world/osm/landmarks';
import { HARBOUR_IDS, RAIL_CLEAR, bridgeGeo, gloryPierGeo, lookoutGeo, lovePierGeo, museumGeo, railGap, warehouseGeo, xinguangGeo } from '../src/taxi/world/osm/hero/harbour';
import { Geo, outwardShare } from '../src/taxi/world/osm/hero/harbour-geo';

const site = new Site(D);
type V = [number, number, number];
/** the triangles of a writer with their unit normals (counter-clockwise front faces, as three.js draws them) */
function faces(g: Geo) {
  const out: { vs: V[]; n: V }[] = [];
  for (let i = 0; i < g.pos.length; i += 9) {
    const vs: V[] = [0, 1, 2].map((k) => [g.pos[i + k * 3], g.pos[i + k * 3 + 1], g.pos[i + k * 3 + 2]] as V);
    const a = [vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]],
      b = [vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]];
    const n: V = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const l = Math.hypot(...n) || 1;
    out.push({ vs, n: [n[0] / l, n[1] / l, n[2] / l] });
  }
  return out;
}
const LM = landmarkModels(D);
const ctx = { data: D, site, taken: [], spots: [] };

describe('Rush Taxi hero models: harbour', () => {
  it('builds every harbour landmark from detailed mesh parts', () => {
    for (const id of HARBOUR_IDS) {
      const m = LM.models.get(id);
      expect(m, id).toBeDefined();
      expect(m!.prims.some((p) => p.t === 'mesh'), id).toBe(true);
    }
    // Pier-2: the warehouse rows plus the robot and the containers
    const p2 = LM.models.get('pier2')!;
    expect(p2.prims.filter((p) => p.t === 'mesh').length).toBeGreaterThan(20);
    expect(LM.rejected.filter((r) => HARBOUR_IDS.includes(r.id))).toEqual([]);
  });

  it('stays on its site: nothing low on a road, nothing on the water but the bridge, clear of the light rail', () => {
    for (const id of HARBOUR_IDS) {
      const m = LM.models.get(id)!;
      for (const p of m.prims) {
        const f = primFoot(p);
        const pts = footSamples(f, 1.5);
        if (f.y0 < HIGH) for (const [x, z] of pts) expect(site.roadGap(x, z), `${id} road`).toBeGreaterThanOrEqual(ROAD_GAP);
        if (!m.overWater) for (const [x, z] of pts) expect(site.inWaterExact(x, z), `${id} water`).toBe(false);
        if (f.y0 < HIGH) for (const [x, z] of pts) expect(railGap(ctx, x, z), `${id} rail at ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThanOrEqual(RAIL_CLEAR);
      }
    }
    expect(LM.models.get('greatharbor')!.overWater).toBe(true);
  });

  it('stays inside the slice budget of 20k triangles', () => {
    const tris = HARBOUR_IDS.reduce((a, id) => a + LM.models.get(id)!.prims.reduce((b, p) => b + primTriangles(p), 0), 0);
    expect(tris).toBeLessThanOrEqual(20000);
    expect(tris).toBeGreaterThan(8000);
  });

  it('keeps simple colliders on the solid parts (the bridge is decor only)', () => {
    for (const id of HARBOUR_IDS) {
      const m = LM.models.get(id)!;
      if (id === 'greatharbor') expect(m.shapes.length).toBe(0);
      else expect(m.shapes.length, id).toBeGreaterThan(0);
      for (const s of m.shapes) expect(shapeFoot(s), id).not.toBeNull();
    }
    // a collider for every warehouse
    const p2 = LM.models.get('pier2')!;
    expect(p2.shapes.length).toBeGreaterThanOrEqual(p2.replaces.length);
  });

  it('lights windows, the bridge line and the canopy uplights at night, not whole walls', () => {
    for (const id of HARBOUR_IDS) {
      const m = LM.models.get(id)!;
      let lit = 0,
        all = 0;
      for (const p of m.prims)
        if (p.t === 'mesh') {
          all += p.pos.length / 3;
          lit += (p.glow ?? []).filter((g) => g > 0.3).length;
        }
      expect(lit, id).toBeGreaterThan(0);
      expect(lit / all, id).toBeLessThan(0.35);
    }
  });

  it('writes faces that look outwards', () => {
    const g = new Geo();
    g.box(-1, 1, 0, 2, -1, 1, '#FFFFFF', { skip: [] });
    expect(outwardShare(g, [0, 1, 0])).toBe(1);
    const t = new Geo();
    t.tube([0, 0, 0], [0, 4, 0], 1, 8, '#FFFFFF', { caps: true });
    expect(outwardShare(t, [0, 2, 0])).toBe(1);
    const e = new Geo();
    e.extrudeX([[-1, 0], [1, 0], [0, 1]], [-2, 0, 2], () => '#FFFFFF', { caps: '#FFFFFF' });
    expect(outwardShare(e, [0, 0.33, 0])).toBe(1);
    // a warehouse: everything on its walls (doors, windows, the painted code) faces out, and the roof faces up
    for (const roof of ['gable', 'saw', 'vault'] as const) {
      const w = warehouseGeo(30, 10, 8, '#C9A27A', roof, 1, 'C2', 1);
      const f = faces(w);
      const onWall = f.filter((t) => t.vs.every((p) => Math.abs(Math.abs(p[2]) - 5) < 0.07) && Math.abs(t.n[2]) > 0.9);
      expect(onWall.length, roof).toBeGreaterThan(20);
      for (const t of onWall) expect(Math.sign(t.n[2]), roof).toBe(Math.sign(t.vs[0][2]));
      const onEnd = f.filter((t) => t.vs.every((p) => Math.abs(Math.abs(p[0]) - 15) < 0.07) && Math.abs(t.n[0]) > 0.9);
      for (const t of onEnd) expect(Math.sign(t.n[0]), roof).toBe(Math.sign(t.vs[0][0]));
      const up = f.filter((t) => t.vs.every((p) => p[1] > 8.3)).map((t) => t.n[1]);
      expect(up.filter((y) => y > 0.1).length, roof).toBeGreaterThanOrEqual(up.filter((y) => y < -0.1).length);
    }
    const mu = faces(museumGeo(24, 14)).filter((t) => t.vs.every((p) => Math.abs(Math.abs(p[2]) - 6.73) < 0.015) && Math.abs(t.n[2]) > 0.9);
    expect(mu.length).toBeGreaterThan(8);
    for (const t of mu) expect(Math.sign(t.n[2])).toBe(Math.sign(t.vs[0][2]));
  });

  it('keeps each model part modest in size', () => {
    expect(lookoutGeo(7, 30).tris).toBeLessThan(900);
    expect(lovePierGeo(16, 9, 1).tris).toBeLessThan(1200);
    expect(gloryPierGeo(30, 14, -1).tris).toBeLessThan(1200);
    expect(bridgeGeo(60, -26.5, 1).tris).toBeLessThan(1600);
    expect(xinguangGeo(20, 10, 1).tris).toBeLessThan(900);
  });
});
