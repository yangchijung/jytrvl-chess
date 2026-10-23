import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { skyColour } from '../src/taxi/world/decor';

const H = '#E8E6DA', G = '#F7E3BC', Z = '#2F86DA';
const hex = (c: THREE.Color) => '#' + c.getHexString().toUpperCase();

describe('taxi sky dome colours', () => {
  it('matches the fog colour at and below eye level, so the ground melts into the sky', () => {
    expect(hex(skyColour(0, H, G, Z))).toBe(H);
    expect(hex(skyColour(-0.5, H, G, Z))).toBe(H);
  });
  it('has the warm glow just above the horizon and the deep blue overhead', () => {
    expect(hex(skyColour(0.03, H, G, Z))).toBe(G);
    expect(hex(skyColour(1, H, G, Z))).toBe(Z);
  });
  it('gets bluer (less red, not less blue) all the way up', () => {
    let prev = skyColour(0.03, H, G, Z);
    for (let y = 0.06; y <= 1; y += 0.03) {
      const c = skyColour(y, H, G, Z);
      expect(c.r).toBeLessThanOrEqual(prev.r + 1e-6);
      expect(c.b - c.r).toBeGreaterThanOrEqual(prev.b - prev.r - 1e-6);
      prev = c;
    }
  });
});
