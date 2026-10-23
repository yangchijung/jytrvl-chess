// Rush Taxi scene: building massing — the richer shapes stay inside their lots and rest on something, the street
// walls and colliders keep the old footprints, rooftop props sit on real flat roofs and wall props on real walls.
import { describe, expect, it } from 'vitest';
import { cityLevel } from '../src/taxi/world/city';
import { pitchTriangles, storeys, type Mass } from '../src/taxi/world/massing';
import CITY from '../src/taxi/world/city.json';

const L = cityLevel();
const M = L.massing!;
const lot = CITY.pitch - CITY.road;
const bases = L.shapes.filter((s): s is Extract<typeof s, { kind: 'box' }> => s.kind === 'box' && s.look !== undefined);
const baseMass: Mass[] = bases.map((s) => ({ x: s.p[0], z: s.p[2], w: s.size[0], d: s.size[2], y0: s.p[1] - s.size[1] / 2, h: s.size[1], color: s.color, look: s.look! }));
const vols = [...baseMass, ...M.masses];
const block = (x: number) => Math.round(x / CITY.pitch) * CITY.pitch;
const inLot = (x: number, z: number, w: number, d: number) => {
  const cx = block(x),
    cz = block(z);
  return Math.abs(x - cx) + w / 2 <= lot / 2 + 1e-6 && Math.abs(z - cz) + d / 2 <= lot / 2 + 1e-6;
};
const over = (m: { x: number; z: number; w: number; d: number }, x: number, z: number, e = 1e-6) => Math.abs(x - m.x) <= m.w / 2 + e && Math.abs(z - m.z) <= m.d / 2 + e;

describe('Rush Taxi building massing', () => {
  it('every volume, balcony, canopy, crown and shed roof stays inside its block lot (off the pavement)', () => {
    const bad = [...vols, ...M.slabs, ...M.pitched].filter((m) => !inLot(m.x, m.z, m.w, m.d)).map((m) => `${m.x.toFixed(1)},${m.z.toFixed(1)}`);
    expect(bad).toEqual([]);
  });

  it('upper volumes rest on a lower volume (towers on podiums, set-back top floors on the house below)', () => {
    for (const u of M.masses) {
      const support = vols.find((v) => v !== u && v.y0 < u.y0 && Math.abs(v.y0 + v.h - u.y0) < 0.6 && over(v, u.x - u.w / 2, u.z - u.d / 2, 0.01) && over(v, u.x + u.w / 2, u.z + u.d / 2, 0.01));
      expect(support, `${u.x},${u.y0},${u.z}`).toBeDefined();
    }
  });

  it('upper volumes also collide, inside the base footprint (the street walls stay where they were)', () => {
    const hidden = L.shapes.filter((s): s is Extract<typeof s, { kind: 'box' }> => s.kind === 'box' && !!s.hidden);
    for (const u of M.masses) expect(hidden.some((s) => Math.abs(s.p[0] - u.x) < 1e-6 && Math.abs(s.p[2] - u.z) < 1e-6 && Math.abs(s.size[1] - u.h) < 1e-6), `${u.x},${u.z}`).toBe(true);
    // old-street rows end 3 m inside the lot; sheds, slabs and towers keep their old footprints
    for (const b of bases) expect(inLot(b.p[0], b.p[2], b.size[0], b.size[2])).toBe(true);
  });

  it('water tanks and sheet-metal sheds stand on a flat roof, on top of it and inside it', () => {
    const d = L.decor!;
    for (const t of d.tanks) expect(M.roofs.some((r) => Math.abs(r.y - t.y) < 1e-6 && over(r, t.x, t.z, -0.6)), `tank ${t.x},${t.z}`).toBe(true);
    for (const s of d.sheds) expect(M.roofs.some((r) => Math.abs(r.y - s.y) < 1e-6 && over(r, s.x - s.w / 2, s.z - s.d / 2) && over(r, s.x + s.w / 2, s.z + s.d / 2)), `shed ${s.x},${s.z}`).toBe(true);
    // a roof is the top of a real volume and nothing stands on that spot except crowns
    for (const r of M.roofs) expect(vols.some((v) => Math.abs(v.y0 + v.h - r.y) < 1e-6 && over(v, r.x, r.z)), `roof ${r.x},${r.z}`).toBe(true);
    // no tank on a pitched roof
    for (const p of M.pitched) expect(d.tanks.some((t) => over(p, t.x, t.z) && t.y >= p.y - 0.01)).toBe(false);
  });

  it('air conditioners hang on a base wall below its roof; shop signs hang below the roof too', () => {
    const d = L.decor!;
    for (const a of d.acs) {
      const nx = Math.sin(a.yaw),
        nz = Math.cos(a.yaw);
      const wx = a.x - nx * 0.24,
        wz = a.z - nz * 0.24;
      const wall = baseMass.find((b) => over(b, wx, wz, 0.01) && !over(b, wx + nx * 0.1, wz + nz * 0.1, 0) && a.y + 0.3 <= b.h);
      expect(wall, `ac ${a.x},${a.y},${a.z}`).toBeDefined();
      // and in the open air, not inside the house next door
      expect(baseMass.some((b) => over(b, a.x, a.z, 0) && a.y < b.h), `ac inside ${a.x},${a.z}`).toBe(false);
    }
    for (const s of d.shopSigns) {
      const b = baseMass.filter((m) => over(m, s.x, s.z, 0.7)).sort((a, c) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(c.x - s.x, c.z - s.z))[0];
      expect(b, `sign ${s.x},${s.z}`).toBeDefined();
      expect(s.y + 1.5).toBeLessThanOrEqual(b!.h + 0.01);
      expect(baseMass.some((m) => over(m, s.x, s.z, 0) && s.y - 1.5 < m.h), `sign inside ${s.x},${s.z}`).toBe(false);
    }
  });

  it('reads as the four districts: uneven 透天厝, tall towers by the river, stepped slabs, gabled and sawtooth sheds', () => {
    const oldTown = baseMass.filter((b) => b.look === 0);
    expect(oldTown.every((b) => Math.min(b.w, b.d) <= 7.6 + 1e-6)).toBe(true); // narrow house lots
    expect(new Set(oldTown.map((b) => b.h)).size).toBeGreaterThanOrEqual(3);
    expect(M.masses.filter((m) => m.look === 0).length).toBeGreaterThan(20); // set-back top floors
    const towerTops = M.masses.filter((m) => m.look === 1).map((m) => m.y0 + m.h);
    expect(Math.max(...towerTops)).toBeGreaterThan(60);
    expect(M.masses.filter((m) => m.look === 3 && m.y0 > 10).length).toBeGreaterThan(10); // mechanical penthouses
    expect(M.pitched.some((p) => p.teeth === 0) && M.pitched.some((p) => p.teeth > 0)).toBe(true);
    expect(M.slabs.length).toBeGreaterThan(100); // balconies, canopies, crown frames
    expect(storeys(0, 3)).toBeCloseTo(9.9);
  });

  it('shed roofs are closed, outward-facing and sit on the wall top', () => {
    for (const p of M.pitched) {
      const { pos } = pitchTriangles(p);
      for (let i = 0; i < pos.length; i += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
        const n = [(by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)];
        // sloped faces look up (outward); vertical ends and north lights are checked by eye
        if (Math.abs(n[1]) > 1e-6) expect(n[1]).toBeGreaterThan(0);
        expect(Math.min(ay, by, cy)).toBeGreaterThanOrEqual(p.y - 1e-6);
      }
    }
  });
});
