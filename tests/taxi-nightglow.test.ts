import { describe, expect, it } from 'vitest';
import { sedanGeometry } from '../src/taxi/fx/taxiModel';

// the GLSL masks in CAR_LIGHT_GLOW, mirrored here: they must catch the sedan's lamps and nothing else on the car
const head = (r: number, g: number) => r >= 0.95 && g >= 0.85;
const tail = (r: number, g: number, b: number) => r >= 0.4 && g <= 0.06 && b <= 0.06;

describe('taxi night: traffic car lamps glow by colour', () => {
  it('only the head and tail lamps of the sedan match the glow masks', () => {
    const col = sedanGeometry().detail.getAttribute('color');
    const kinds = new Set<string>();
    let lit = 0;
    for (let i = 0; i < col.count; i++) {
      const r = col.getX(i),
        g = col.getY(i),
        b = col.getZ(i);
      const h = head(r, g),
        t = tail(r, g, b);
      expect(h && t).toBe(false);
      if (h || t) lit++;
      kinds.add(h ? 'head' : t ? 'tail' : 'none');
    }
    expect(kinds).toEqual(new Set(['head', 'tail', 'none']));
    // lamps are four small boxes (36 vertices each, non-indexed): nowhere near the whole car
    expect(lit).toBe(4 * 36);
  });
});
