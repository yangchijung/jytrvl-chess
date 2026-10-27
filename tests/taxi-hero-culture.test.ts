// Rush Taxi real-map city, culture slice: the detailed Cultural Center, Sanfeng Temple, old council, museum of
// history, city government centre and literature library. They exist as free geometry, stay on their own site
// (off the roads, off the water), keep to the slice's triangle budget, light up only in parts at night, and keep
// their colliders.
import { describe, expect, it } from 'vitest';
import { KAOHSIUNG as D } from '../src/taxi/world/osm/data';
import { HIGH, ROAD_GAP, Site, footSamples, inFoot, landmarkModels, pointInRing, primFoot, primTriangles, shapeFoot } from '../src/taxi/world/osm/landmarks';
import { Geo, roof, roofPt } from '../src/taxi/world/osm/hero/culture-geo';
import { swallowRoofGeo } from '../src/taxi/world/osm/hero/culture';

const IDS = ['culturalcenter', 'sanfeng', 'oldcouncil', 'historymuseum', 'cityhall', 'literature'];
const site = new Site(D);
const LM = landmarkModels(D);

/** the triangle normals of a geometry builder, and their centres */
function faces(G: Geo) {
  const out: { n: number[]; c: number[] }[] = [];
  for (let i = 0; i < G.pos.length; i += 9) {
    const p = G.pos.slice(i, i + 9);
    const u = [p[3] - p[0], p[4] - p[1], p[5] - p[2]],
      v = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
    out.push({ n: [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], c: [(p[0] + p[3] + p[6]) / 3, (p[1] + p[4] + p[7]) / 3, (p[2] + p[5] + p[8]) / 3] });
  }
  return out;
}

describe('Rush Taxi culture landmarks (detailed models)', () => {
  it('builds every culture model from free geometry, with no part removed by the checks', () => {
    for (const id of IDS) {
      const m = LM.models.get(id);
      expect(m, id).toBeDefined();
      expect(m!.prims.some((p) => p.t === 'mesh'), id).toBe(true);
      expect(LM.rejected.filter((r) => r.id === id), id).toEqual([]);
    }
  });

  it('keeps every part on its own site, off the roads and the water', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      const site0 = m.covers[0];
      for (const p of m.prims) {
        const f = primFoot(p);
        for (const [x, z] of footSamples(f, 1.5)) {
          expect(site.inWaterExact(x, z), `${id} on water`).toBe(false);
          if (f.y0 < HIGH) expect(site.roadGap(x, z), `${id} on a road`).toBeGreaterThanOrEqual(ROAD_GAP);
        }
        // the part's centre stands on the model's site
        expect(pointInRing(p.x, p.z, site0), `${id} part off its site`).toBe(true);
      }
    }
  });

  it('stays within the slice budget of 20k triangles', () => {
    let all = 0;
    for (const id of IDS) all += LM.models.get(id)!.prims.reduce((a, p) => a + primTriangles(p), 0);
    expect(all).toBeLessThanOrEqual(20000);
    // the big two carry the detail
    const t = (id: string) => LM.models.get(id)!.prims.reduce((a, p) => a + primTriangles(p), 0);
    expect(t('sanfeng')).toBeGreaterThan(4000);
    expect(t('culturalcenter')).toBeGreaterThan(3000);
  });

  it('keeps hidden collider boxes for the solid parts, inside the site', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      expect(m.shapes.length, id).toBeGreaterThanOrEqual(1);
      for (const s of m.shapes) {
        expect(s.kind).toBe('box');
        expect(s.kind === 'box' && s.hidden).toBe(true);
        const f = shapeFoot(s)!;
        expect(pointInRing(f.x, f.z, m.covers[0]), id).toBe(true);
      }
    }
  });

  it('lights windows, lanterns and light strings at night, never whole buildings', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      // by area: lit triangles against the whole surface
      let n = 0,
        lit = 0;
      for (const p of m.prims)
        if (p.t === 'mesh')
          for (let i = 0; i < p.pos.length; i += 9) {
            const q = p.pos.slice(i, i + 9);
            const u = [q[3] - q[0], q[4] - q[1], q[5] - q[2]],
              v = [q[6] - q[0], q[7] - q[1], q[8] - q[2]];
            const a = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
            n += a;
            if ((p.glow?.[i / 3] ?? 0) > 0) lit += a;
          }
      expect(lit, id).toBeGreaterThan(0);
      expect(lit / n, id).toBeLessThan(0.25);
    }
  });

  it('turns the swallowtail ridge up at both ends and splits it into tails beyond the roof', () => {
    const L = 12,
      W = 8,
      H = 3;
    const G = swallowRoofGeo(L, W, H);
    let midTop = -Infinity,
      endTop = -Infinity,
      tailZ = 0;
    for (let i = 0; i < G.pos.length; i += 3) {
      const [x, y, z] = [G.pos[i], G.pos[i + 1], G.pos[i + 2]];
      if (Math.abs(x) < 1) midTop = Math.max(midTop, y);
      if (Math.abs(x) > L / 2) {
        endTop = Math.max(endTop, y);
        tailZ = Math.max(tailZ, Math.abs(z));
      }
    }
    expect(endTop).toBeGreaterThan(midTop + 1);
    expect(tailZ).toBeGreaterThan(0.2); // the two tails spread apart
    // the slope itself is concave (curved), not a flat plane
    const o = { a: 6, b: 4, ra: 6, rb: 0, y0: 0, H: 3, color: '#000' };
    const mid = roofPt(o, 'f', 0.5, 0.5)[1];
    expect(mid).toBeLessThan((roofPt(o, 'f', 0, 0.5)[1] + roofPt(o, 'f', 1, 0.5)[1]) / 2 - 0.2);
  });

  it('winds every face of a closed part to face outwards', () => {
    const G = new Geo();
    G.box(0, 0, 0, 4, 3, 2, '#fff', { bottom: true });
    for (const f of faces(G)) expect(f.n[0] * f.c[0] + f.n[1] * (f.c[1] - 1.5) + f.n[2] * f.c[2]).toBeGreaterThan(0);
    const T = new Geo();
    T.cyl(0, 0, 0, 1, 2, 12, '#fff');
    for (const f of faces(T)) expect(f.n[0] * f.c[0] + f.n[1] * (f.c[1] - 1) + f.n[2] * f.c[2]).toBeGreaterThan(0);
    // roof tops face up and soffits face down
    const R = new Geo();
    roof(R, { a: 5, b: 3, ra: 2, rb: 0, y0: 0, H: 2, lift: 0.5, color: '#111', under: '#222' });
    const ups = faces(R).filter((f) => Math.abs(f.n[1]) > 0.3 * Math.hypot(f.n[0], f.n[1], f.n[2]));
    expect(ups.some((f) => f.n[1] > 0) && ups.some((f) => f.n[1] < 0)).toBe(true);
  });

  it('leaves the name boards readable (not inside a culture model)', () => {
    const feet = IDS.flatMap((id) => LM.models.get(id)!.prims.map(primFoot));
    for (const s of LM.signs) expect(feet.find((f) => f.y1 > s.y - 1 && f.y0 < s.y + 1 && inFoot(f, s.x, s.z, 0.2))).toBeUndefined();
  });
});
