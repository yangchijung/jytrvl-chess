// Rush Taxi real-map city: the transit slice's detailed models (hero/transit.ts) — Kaohsiung Station's canopy, the old
// station, Sankuaicuo and Gushan stations, the Formosa Boulevard entrances and the Exhibition Center. They exist, stay
// inside their sites (off the roads at street level, off the water), keep to the slice's triangle budget, and collide.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KAOHSIUNG as D } from '../src/taxi/world/osm/data';
import {
  HIGH, ROAD_GAP, Site, footSamples, formosaJunction, landmarkModels, pointInRing, primFoot, primTriangles, rectOfRing, rectRing, shapeFoot,
} from '../src/taxi/world/osm/landmarks';
import { Geo, canopyGeo, irimoya, pavilion } from '../src/taxi/world/osm/hero/transit';

const site = new Site(D);
const LM = landmarkModels(D);
const IDS = ['mainstation', 'oldstation', 'sankuaicuo', 'gushanstation', 'exhibition', 'formosa'];

/** every triangle's normal against the direction from `inside` to its centre */
function outward(pos: ArrayLike<number>, inside: [number, number, number], below = Infinity) {
  let bad = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.set(pos[i], pos[i + 1], pos[i + 2]);
    b.set(pos[i + 3], pos[i + 4], pos[i + 5]);
    c.set(pos[i + 6], pos[i + 7], pos[i + 8]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const m = a.clone().add(b).add(c).divideScalar(3);
    if (m.y > below) continue;
    m.sub(new THREE.Vector3(...inside));
    if (n.dot(m) < 0) bad++;
  }
  return bad;
}

describe('Rush Taxi hero models: transit', () => {
  it('builds every transit model with detailed free geometry', () => {
    for (const id of IDS) {
      const m = LM.models.get(id);
      expect(m, id).toBeDefined();
      expect(m!.prims.some((p) => p.t === 'mesh'), id).toBe(true);
    }
    expect(LM.rejected.filter((r) => IDS.includes(r.id))).toEqual([]);
  });

  it('stays inside its sites: off the roads at street level, on the land, within the ground it covers', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      const sites = m.covers.map((c) => rectRing(rectOfRing(c), 2.5));
      for (const p of m.prims) {
        const f = primFoot(p);
        const pts = footSamples(f, 1.5);
        if (f.y0 < HIGH) for (const [x, z] of pts) expect(site.roadGap(x, z), `${id} ${p.t}`).toBeGreaterThanOrEqual(ROAD_GAP);
        for (const [x, z] of pts) expect(site.inWaterExact(x, z), `${id} ${p.t} on the water`).toBe(false);
        expect(sites.some((r) => pointInRing(p.x, p.z, r)), `${id} ${p.t} at ${p.x.toFixed(1)},${p.z.toFixed(1)} outside its site`).toBe(true);
      }
    }
  });

  it('keeps to the slice budget of 20k triangles', () => {
    const tris = IDS.reduce((a, id) => a + LM.models.get(id)!.prims.reduce((b, p) => b + primTriangles(p), 0), 0);
    expect(tris).toBeLessThanOrEqual(20000);
    expect(tris).toBeGreaterThan(8000); // detailed, not the old primitive stacks
  });

  it('gives the solid parts colliders, off the roads', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      expect(m.shapes.length, id).toBeGreaterThan(0);
      for (const s of m.shapes) for (const [x, z] of footSamples(shapeFoot(s)!, 1.5)) expect(site.roadGap(x, z), `${id} collider`).toBeGreaterThanOrEqual(ROAD_GAP);
    }
    // the canopy's columns and the four entrance pavilions
    expect(LM.models.get('mainstation')!.shapes.filter((s) => s.kind === 'cyl').length).toBeGreaterThanOrEqual(4);
    expect(LM.models.get('formosa')!.shapes.length).toBe(4);
  });

  it('Kaohsiung Station: a vast low canopy floating high over the plaza, dipping into funnels onto its columns', () => {
    const m = LM.models.get('mainstation')!;
    const canopy = m.prims.find((p) => p.t === 'mesh' && p.hx > 40)!;
    expect(canopy).toBeDefined();
    const f = primFoot(canopy);
    expect(f.y0).toBeGreaterThanOrEqual(HIGH); // the funnels' undersides clear the streets
    expect(f.y1).toBeLessThan(20); // low
    expect(m.prims.filter((p) => p.t === 'cyl').length).toBeGreaterThanOrEqual(4);
  });

  it('Formosa Boulevard: four glass entrances on the junction corners (the mapped "Prayer" plots), facing it', () => {
    const m = LM.models.get('formosa')!;
    const j = formosaJunction(D)!;
    const pav = m.prims.filter((p) => p.t === 'mesh');
    expect(pav.length).toBe(4);
    const quads = new Set<string>();
    for (const p of pav) {
      expect(Math.hypot(p.x - j[0], p.z - j[1])).toBeLessThan(45);
      quads.add(`${Math.sign(p.x - j[0])},${Math.sign(p.z - j[1])}`);
    }
    expect(quads.size).toBe(4);
    const prayer = D.buildings.map((b, i) => ({ b, i })).filter(({ b }) => b.name === '祈禱');
    for (const { i } of prayer) expect(LM.drop.has(i)).toBe(true);
    // the dome's colours glow through at night
    expect(pav.every((p) => p.t === 'mesh' && p.glow!.some((g) => g > 0.3))).toBe(true);
  });

  it('lights windows, signs and the clock at night, never whole buildings', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      let lit = 0,
        all = 0;
      for (const p of m.prims) {
        if (p.t !== 'mesh') continue;
        const n = p.pos.length / 3;
        all += n;
        if (p.glow) lit += p.glow.filter((g) => g > 0.05).length;
      }
      expect(lit / all, id).toBeLessThan(0.35);
    }
    expect(LM.models.get('oldstation')!.prims.some((p) => p.t === 'mesh' && !!p.glow?.some((g) => g >= 0.5))).toBe(true); // the clock face
  });

  it('turns every face of the free geometry to the outside', () => {
    const g = new Geo();
    g.box(0, 0, 0, 2, 3, 4, '#FFFFFF');
    expect(outward(g.pos, [0, 1.5, 0])).toBe(0);
    // (the ridge tiles on top are boxes of their own)
    const roof = irimoya(12, 8, 5);
    expect(outward(roof.pos, [0, 0.8, 0], 5 - 0.7)).toBe(0);
    const pv = pavilion(0, 13, 8);
    expect(outward(pv.pos, [-1.2, 0.1, 0])).toBe(0);
    // the canopy: tops face up, undersides down
    const c = canopyGeo(100, 60, [{ u: 10, v: 5 }]);
    let up = 0,
      down = 0;
    const p = c.pos;
    for (let i = 0; i < p.length; i += 9) {
      const n = new THREE.Vector3(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]).cross(new THREE.Vector3(p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]));
      if (n.y > 1e-6) up++;
      else if (n.y < -1e-6) down++;
    }
    expect(up).toBe(down);
    expect(up).toBe(44 * 30 * 2);
  });
});
