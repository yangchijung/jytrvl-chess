import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Kit, primFoot, primTriangles } from '../src/taxi/world/osm/landmarks';

describe('free-geometry landmark parts (Prim mesh)', () => {
  it('carries the triangles, colours, glow and a local bounding box, turned with the kit', () => {
    const k = new Kit('t', 100, 50, Math.PI / 2);
    const g = new THREE.BoxGeometry(4, 10, 2).translate(0, 5, 0);
    k.mesh(3, 0, 1, g, { color: '#FF0000', glow: 0.5 });
    const p = k.prims[0];
    expect(p.t).toBe('mesh');
    if (p.t !== 'mesh') return;
    expect(p.pos.length).toBe(36 * 3);
    expect(p.col.length).toBe(p.pos.length);
    expect(p.glow?.every((v) => v === 0.5)).toBe(true);
    expect(p.hx).toBeCloseTo(2);
    expect(p.hz).toBeCloseTo(1);
    expect(p.y0).toBeCloseTo(0);
    expect(p.y1).toBeCloseTo(10);
    // the kit is turned by 90°: local u = 3 lands at z + 3
    expect(p.x).toBeCloseTo(100);
    expect(p.z).toBeCloseTo(53);
    expect(primTriangles(p)).toBe(12);
    const f = primFoot(p);
    expect(f.y0).toBeCloseTo(1);
    expect(f.y1).toBeCloseTo(11);
  });
});
