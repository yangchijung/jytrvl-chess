import { describe, expect, it } from 'vitest';
import { buildingLook, decodeLook, encodeLook, lookSeed } from '../src/taxi/world/facade';

describe('taxi facade aLook encoding', () => {
  it('keeps the style in the integer part, even after a float32 round trip', () => {
    for (let s = 0; s <= 3; s++)
      for (const v of [0, 0.25, 0.5, 0.999999, 0.123]) {
        const f = Math.fround(encodeLook(s, v));
        expect(decodeLook(f).style).toBe(s);
        expect(decodeLook(f).variant).not.toBeNull();
        expect(decodeLook(f).variant!).toBeCloseTo(v - Math.floor(v), 3);
      }
  });

  it('reads plain integers (the old encoding) as a style with no variant', () => {
    for (let s = 0; s <= 3; s++) expect(decodeLook(s)).toEqual({ style: s, variant: null });
  });

  it('clamps the style and wraps the variant', () => {
    expect(decodeLook(encodeLook(9, 0.5)).style).toBe(3);
    expect(decodeLook(encodeLook(-2, 0.5)).style).toBe(0);
    expect(decodeLook(encodeLook(1, 1.25)).variant!).toBeCloseTo(0.25, 3);
  });

  it('gives neighbouring buildings different, stable seeds', () => {
    expect(lookSeed(10, 20)).toBe(lookSeed(10, 20));
    const seen = new Set<number>();
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) seen.add(Math.floor(lookSeed(x * 9, z * 9 + 3) * 20));
    expect(seen.size).toBeGreaterThan(15); // spread over the range, not clustered
    for (let i = 0; i < 50; i++) {
      const s = lookSeed(i * 7.3, -i * 3.1);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
    expect(decodeLook(buildingLook(2, 5, 5)).style).toBe(2);
  });
});
