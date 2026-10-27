import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HIGH, ROAD_GAP, Site, TOWER85_SCALE, footSamples, landmarkModels, primFoot, primTriangles, shapeFoot } from '../src/taxi/world/osm/landmarks';
import { KAOHSIUNG } from '../src/taxi/world/osm/data';
import { Geo, chamfer, facade, ngon, orient, pavilion } from '../src/taxi/world/osm/hero/skyline';

const LM = landmarkModels();
const site = new Site(KAOHSIUNG);
const IDS = ['tower85', 'musiccenter', 'csc'];
const tris = (id: string) => LM.models.get(id)!.prims.reduce((a, p) => a + primTriangles(p), 0);

/** no wall triangle faces back towards the part's vertical axis (window reveals may face sideways) */
function facesOut(g: Geo) {
  let bad = 0;
  for (let i = 0; i < g.pos.length; i += 9) {
    const a = new THREE.Vector3().fromArray(g.pos, i),
      b = new THREE.Vector3().fromArray(g.pos, i + 3),
      c = new THREE.Vector3().fromArray(g.pos, i + 6);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.length() < 1e-9) continue;
    const m = a.clone().add(b).add(c).divideScalar(3);
    const out = new THREE.Vector3(m.x, 0, m.z);
    if (Math.abs(n.y) > 0.99 * n.length()) continue; // caps: checked separately
    if (n.normalize().dot(out.normalize()) < -0.5) bad++;
  }
  return bad;
}

describe('skyline hero models', () => {
  it('builds all three as detailed free-geometry models', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      expect(m, id).toBeTruthy();
      expect(m.prims.some((p) => p.t === 'mesh'), id).toBe(true);
      expect(tris(id), id).toBeGreaterThan(2000);
    }
    // the coral pavilions on Glory Pier: a cluster of hexagon parts
    const coral = LM.models.get('musiccenter')!.prims.filter((p) => p.t === 'mesh' && p.y1 < 25);
    expect(coral.length).toBeGreaterThan(15);
  });

  it('keeps the 85 Sky Tower at 0.6 of 347 m with two separate legs and the spire on top', () => {
    const t = LM.models.get('tower85')!;
    const top = Math.max(...t.prims.map((p) => primFoot(p).y1));
    expect(top).toBeCloseTo(347 * TOWER85_SCALE, 0);
    const legs = t.prims.filter((p) => primFoot(p).y1 - primFoot(p).y0 > 50 && primFoot(p).y0 < 20);
    expect(legs.length).toBe(2);
    const [a, b] = legs.map(primFoot);
    // the open gap between the legs
    expect(Math.hypot(a.x - b.x, a.z - b.z) - a.hx - b.hx).toBeGreaterThan(10);
    // the legs end at about the 35th floor (150 m real)
    expect(a.y1).toBeCloseTo(150 * TOWER85_SCALE, 0);
  });

  it('draws CSC at about 135 m and the Music Center towers at their two heights', () => {
    const csc = Math.max(...LM.models.get('csc')!.prims.map((p) => primFoot(p).y1));
    expect(csc).toBeGreaterThan(128);
    expect(csc).toBeLessThan(145);
    const towers = LM.models.get('musiccenter')!.prims.filter((p) => p.t === 'mesh' && p.y0 > 5).map((p) => primFoot(p).y1).sort((x, y) => y - x);
    expect(towers.length).toBe(2);
    expect(towers[0]).toBeGreaterThan(60);
    expect(towers[1]).toBeGreaterThan(40);
    expect(towers[1]).toBeLessThan(towers[0] - 12);
  });

  it('stays on its site: nothing low within a road, nothing on the water', () => {
    expect(LM.rejected.filter((r) => IDS.includes(r.id))).toEqual([]);
    for (const id of IDS)
      for (const p of LM.models.get(id)!.prims) {
        const f = primFoot(p);
        const pts = footSamples(f, 1.5);
        if (f.y0 < HIGH) expect(pts.every(([x, z]) => site.roadGap(x, z) >= ROAD_GAP), id).toBe(true);
        expect(pts.every(([x, z]) => site.onLand(x, z)), id).toBe(true);
      }
  });

  it('stays within the slice triangle budget (25k for the three)', () => {
    const sum = IDS.reduce((a, id) => a + tris(id), 0);
    expect(sum).toBeLessThanOrEqual(25000);
  });

  it('keeps colliders for the solid parts', () => {
    for (const id of IDS) {
      const m = LM.models.get(id)!;
      const ground = m.shapes.map(shapeFoot).filter((f) => f && f.y0 < 1);
      expect(ground.length, id).toBeGreaterThanOrEqual(id === 'tower85' ? 1 : 3);
    }
    // the tower's podium collider covers the whole footprint
    const t = LM.models.get('tower85')!;
    const pod = shapeFoot(t.shapes[0])!;
    expect(pod.hx * pod.hz).toBeGreaterThan(500);
  });

  it('winds walls outwards and lights only windows and LED lines', () => {
    const g = new Geo();
    facade(g, chamfer(10, 6, 2), null, 0, 30, { wall: '#CCCCCC', glass: '#336677', lit: '#99BBAA', floor: 5, glassFrac: 0.6, seed: 3 });
    expect(facesOut(g)).toBe(0);
    // caps face up
    for (let i = 0; i < g.pos.length; i += 9) {
      const a = new THREE.Vector3().fromArray(g.pos, i),
        b = new THREE.Vector3().fromArray(g.pos, i + 3),
        c = new THREE.Vector3().fromArray(g.pos, i + 6);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      if (Math.abs(n.y) > 0.99 * n.length() && a.y > 29) expect(n.y).toBeGreaterThan(0);
    }
    const lit = g.glow.filter((v) => v > 0).length / g.glow.length;
    expect(lit).toBeGreaterThan(0.05);
    expect(lit).toBeLessThan(0.5);
    const p = new Geo();
    pavilion(p, 5.7, 9, 2, -1, 42);
    expect(facesOut(p)).toBe(0);
    expect(orient(ngon(6, 3)).length).toBe(6);
  });
});
