// Rush Taxi stage 3: the city data — every street is clear, every destination and stop is on a street, the
// traffic graph is one connected network, and there are enough original landmarks.
import { describe, expect, it } from 'vitest';
import { cityLevel } from '../src/taxi/world/city';
import type { Shape } from '../src/taxi/world/level';

const L = cityLevel();

/** is (x, z) inside a shape's footprint (with a margin)? wedges (ramps) are meant to be driven on */
function inside(s: Shape, x: number, z: number, m = 0) {
  if (s.kind === 'box') {
    if (s.p[1] + s.size[1] / 2 < 0.05) return false; // flat decks
    return Math.abs(x - s.p[0]) < s.size[0] / 2 + m && Math.abs(z - s.p[2]) < s.size[2] / 2 + m;
  }
  if (s.kind === 'cyl') return s.p[1] - s.h / 2 < 2 && Math.hypot(x - s.p[0], z - s.p[2]) < s.r + m;
  // a ball's footprint at car height (about 1 m up)
  if (s.kind === 'ball') return Math.abs(s.p[1] - 1) < s.r && Math.hypot(x - s.p[0], z - s.p[2]) < Math.sqrt(s.r * s.r - (s.p[1] - 1) ** 2) + m;
  return false;
}
const solid = L.shapes.filter((s) => s.kind !== 'wedge' && !(s.kind === 'box' && s.size[1] <= 0.7 && s.p[1] < 0));
const blocked = (x: number, z: number, m = 0) => solid.find((s) => inside(s, x, z, m));

describe('Rush Taxi city (stage 3)', () => {
  it('has at least 30 named destinations (Kaohsiung public places by their real names, shops by our own), each with a name board', () => {
    expect(L.places.length).toBeGreaterThanOrEqual(30);
    expect(new Set(L.places.map((p) => p.id)).size).toBe(L.places.length);
    expect(L.signs.filter((x) => !x.decor).length).toBe(L.places.length);
    for (const p of L.places) expect(p.name.zh.length).toBeGreaterThan(0);
    // nothing borrowed from the game this is inspired by
    const all = JSON.stringify(L.places).toLowerCase();
    for (const w of ['crazy', 'sega', 'kfc', 'pizza hut']) expect(all).not.toContain(w);
  });

  it('every lane of every street is clear of buildings, landmarks, trees and railings', () => {
    const hits: string[] = [];
    for (const [a, b] of L.graph!.edges) {
      const A = L.graph!.nodes[a],
        B = L.graph!.nodes[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const ux = (B.x - A.x) / len,
        uz = (B.z - A.z) / len;
      for (let s = 0; s <= len; s += 2)
        for (const off of [-3.5, 3.5]) {
          const x = A.x + ux * s - uz * off,
            z = A.z + uz * s + ux * off;
          const t = blocked(x, z, 1.2);
          if (t) hits.push(`${x.toFixed(0)},${z.toFixed(0)} ${t.id}`);
        }
    }
    for (const t of L.trees)
      for (const [a, b] of L.graph!.edges) {
        const A = L.graph!.nodes[a],
          B = L.graph!.nodes[b];
        const onX = A.z === B.z;
        const along = onX ? t.x >= Math.min(A.x, B.x) && t.x <= Math.max(A.x, B.x) : t.z >= Math.min(A.z, B.z) && t.z <= Math.max(A.z, B.z);
        if (along && Math.abs(onX ? t.z - A.z : t.x - A.x) < 7.5) hits.push(`tree ${t.x.toFixed(0)},${t.z.toFixed(0)}`);
      }
    expect(hits.slice(0, 10)).toEqual([]);
  });

  it('stops and drop-off points lie on a street, clear of anything solid; people stand on the kerb', () => {
    const onStreet = (x: number, z: number) => L.graph!.edges.some(([a, b]) => {
      const A = L.graph!.nodes[a],
        B = L.graph!.nodes[b];
      if (A.z === B.z) return Math.abs(z - A.z) <= 6 && x >= Math.min(A.x, B.x) - 7 && x <= Math.max(A.x, B.x) + 7;
      return Math.abs(x - A.x) <= 6 && z >= Math.min(A.z, B.z) - 7 && z <= Math.max(A.z, B.z) + 7;
    });
    expect(L.stops.length).toBeGreaterThan(200);
    for (const s of L.stops) {
      expect(onStreet(s.x, s.z), s.id).toBe(true);
      expect(blocked(s.x, s.z, 1.5), s.id).toBeUndefined();
      expect(blocked(s.cx!, s.cz!, 0.3), `${s.id} kerb`).toBeUndefined();
      expect(Math.abs(s.cz!)).toBeGreaterThan(L.water!.z1); // nobody stands in the river
    }
    for (const p of L.places) {
      expect(onStreet(p.x, p.z), p.id).toBe(true);
      expect(blocked(p.x, p.z, 1.5), p.id).toBeUndefined();
    }
    expect(onStreet(L.spawn.p.x, L.spawn.p.z)).toBe(true);
    expect(blocked(L.spawn.p.x, L.spawn.p.z, 2)).toBeUndefined();
  });

  it('the traffic graph is one connected network that crosses the river on the four bridges', () => {
    const { nodes, edges } = L.graph!;
    const adj = nodes.map(() => [] as number[]);
    for (const [a, b] of edges) adj[a].push(b), adj[b].push(a);
    const seen = new Set([0]);
    const q = [0];
    while (q.length) for (const m of adj[q.pop()!]) if (!seen.has(m)) seen.add(m), q.push(m);
    const used = nodes.map((_, i) => i).filter((i) => adj[i].length);
    expect(used.every((i) => seen.has(i))).toBe(true);
    const crossings = edges.filter(([a, b]) => Math.sign(nodes[a].z) !== Math.sign(nodes[b].z));
    expect(crossings.map(([a]) => nodes[a].x).sort((x, y) => x - y)).toEqual([-270, -150, 30, 210]);
  });

  it('four districts, parks, a stunt park and the two canal jumps are all there', () => {
    expect(L.lots.filter((l) => l.color === '#7CB342').length).toBeGreaterThanOrEqual(6);
    expect(L.shapes.filter((s) => s.kind === 'wedge').length).toBe(7);
    expect(L.walks.length).toBeGreaterThan(100);
    expect(L.trees.length).toBeGreaterThan(50);
  });
  it('street furniture stays on the pavement: scooters, lamps, traffic lights and palms are off the carriageway', () => {
    const d = L.decor!;
    const onRoad = (x: number, z: number, m: number) =>
      L.graph!.edges.some(([a, b]) => {
        const A = L.graph!.nodes[a],
          B = L.graph!.nodes[b];
        const vx = B.x - A.x,
          vz = B.z - A.z;
        const t = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / (vx * vx + vz * vz)));
        return Math.hypot(A.x + vx * t - x, A.z + vz * t - z) < 7 - m;
      });
    const bad = [
      ...d.scooters.filter((s) => onRoad(s.x + Math.sin(s.yaw) * 0.8, s.z + Math.cos(s.yaw) * 0.8, 0)).map((s) => `scooter ${s.x},${s.z}`),
      ...d.lamps.filter((s) => onRoad(s.x, s.z, 0)).map((s) => `lamp ${s.x},${s.z}`),
      ...d.signals.filter((s) => onRoad(s.x, s.z, 0)).map((s) => `signal ${s.x},${s.z}`),
      ...d.palms.filter((s) => onRoad(s.x, s.z, 0)).map((s) => `palm ${s.x},${s.z}`),
    ];
    expect(bad.slice(0, 8)).toEqual([]);
    // enough of the Taiwanese street scene to read as one
    expect(d.scooters.length).toBeGreaterThan(500);
    expect(d.shopSigns.length).toBeGreaterThan(200);
    expect(d.tanks.length).toBeGreaterThan(100);
    expect(d.signals.length).toBeGreaterThan(300);
    // no scooter parked where a passenger stands
    for (const st of L.stops) expect(d.scooters.some((s) => Math.hypot(s.x - st.cx!, s.z - st.cz!) < 1.2), st.id).toBe(false);
  });
});
