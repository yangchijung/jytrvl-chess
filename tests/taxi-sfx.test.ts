import { describe, expect, it } from "vitest";
import { revs } from "../src/taxi/audio/sfx";

describe("engine revs through the gears", () => {
  const shifts = [28, 55, 85, 115];
  it("stays between 0.18 and 1 from standstill to beyond top speed", () => {
    for (let k = -10; k <= 220; k += 0.5) {
      const r = revs(k);
      expect(r).toBeGreaterThanOrEqual(0.18);
      expect(r).toBeLessThanOrEqual(1);
    }
    expect(revs(0)).toBeCloseTo(0.18);
    expect(revs(150)).toBe(1);
    expect(revs(200)).toBe(1);
  });
  it("climbs within each gear", () => {
    const edges = [0, ...shifts, 150];
    for (let g = 0; g < edges.length - 1; g++) {
      let prev = -1;
      for (let k = edges[g]; k < edges[g + 1]; k += 0.5) {
        const r = revs(k);
        expect(r).toBeGreaterThan(prev);
        prev = r;
      }
      // near the top of the gear the engine is close to the limiter
      expect(revs(edges[g + 1] - 0.01)).toBeGreaterThan(0.95);
    }
  });
  it("drops back at every shift", () => {
    for (const s of shifts) {
      expect(revs(s)).toBeLessThan(revs(s - 0.01) - 0.6);
      expect(revs(s)).toBeCloseTo(0.18);
    }
  });
});
