// Rush Taxi: near-field instancing picks exactly the items within the radius (src/taxi/world/nearfield.ts).
import { describe, expect, it } from 'vitest';
import { nearGrid, nearIndices } from '../src/taxi/world/nearfield';

describe('near-field selection', () => {
  it('returns the items within the radius, and only those', () => {
    const n = 2000;
    const xs = new Float32Array(n),
      zs = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      xs[k] = ((k * 7919) % 1000) - 500;
      zs[k] = ((k * 104729) % 1000) - 500;
    }
    const grid = nearGrid(xs, zs);
    for (const [x, z, r] of [
      [0, 0, 100],
      [-480, 300, 250],
      [10, -10, 0.5],
    ]) {
      const got = nearIndices(grid, xs, zs, x, z, r).sort((a, b) => a - b);
      const want = [...Array(n).keys()].filter((k) => Math.hypot(xs[k] - x, zs[k] - z) <= r);
      expect(got).toEqual(want);
    }
  });
});
