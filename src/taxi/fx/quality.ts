// Rush Taxi: one shared rendering quality tier. Phones get 'low', tablets 'mid', desktops 'high'; `?q=low|mid|high`
// in the URL overrides it. (Shared API: `type Quality` and `detectQuality(renderer, isTouch)`.)
import type * as THREE from 'three';

export type Quality = 'low' | 'mid' | 'high';

const TIERS: readonly Quality[] = ['low', 'mid', 'high'];

/** the tier named by a `?q=` value, or null when it names none */
export function parseQuality(v: string | null | undefined): Quality | null {
  const s = (v ?? '').trim().toLowerCase();
  return (TIERS as readonly string[]).includes(s) ? (s as Quality) : null;
}

/** phones (a touch screen whose short side is under 600 px) 'low', other touch screens 'mid', the rest 'high' */
export function qualityFor(isTouch: boolean, shortSide: number): Quality {
  if (!isTouch) return 'high';
  return shortSide < 600 ? 'low' : 'mid';
}

export function detectQuality(renderer: THREE.WebGLRenderer | null, isTouch: boolean): Quality {
  void renderer;
  const fromUrl = typeof location !== 'undefined' ? parseQuality(new URLSearchParams(location.search).get('q')) : null;
  if (fromUrl) return fromUrl;
  const short = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 1080;
  return qualityFor(isTouch, short);
}
