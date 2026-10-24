// Rush Taxi: the one shared rendering quality tier. Every effect that costs GPU time asks for the tier here.
//   low  = phones: no post-processing at all, pixel ratio capped at 1.5
//   mid  = tablets: MSAA from the canvas, a cheap fake contact shade baked into the world shaders, no composer
//   high = desktops: GTAO, SMAA, bloom, a light vignette and colour grade, depth of field on the menu and results
// `?q=low|mid|high` in the URL overrides everything (tests use it). The pause menu's 畫質 control (自動 / 流暢 / 標準 /
// 精緻) stores the player's choice per browser; 自動 detects the tier and may step it down once frames get slow.

export type Quality = 'low' | 'mid' | 'high';
/** what the player picked in the pause menu; 'auto' = detect, and let the frame budget step it down */
export type QualityPref = 'auto' | Quality;

export const QUALITIES: readonly Quality[] = ['low', 'mid', 'high'];
export const QUALITY_PREFS: readonly QualityPref[] = ['auto', 'low', 'mid', 'high'];
export const QUALITY_KEY = 'jy.taxi.quality';

const isQuality = (v: unknown): v is Quality => v === 'low' || v === 'mid' || v === 'high';

/** `?q=…` from a location.search string, or null */
export function qualityFromUrl(search: string): Quality | null {
  try {
    const q = new URLSearchParams(search).get('q');
    return isQuality(q) ? q : null;
  } catch {
    return null;
  }
}

/** the parts of the page the detection looks at (injectable for the tests) */
export interface QualityEnv {
  search: string;
  /** the screen's shorter side in CSS px */
  shortSide: number;
}

const defaultEnv = (): QualityEnv => ({
  search: typeof location === 'undefined' ? '' : location.search,
  shortSide: typeof screen === 'undefined' ? 1080 : Math.min(screen.width, screen.height),
});

/** a renderer, or just enough of one: a WebGL1-only context gets 'low' (no float targets worth using) */
type RendererLike = { capabilities?: { isWebGL2?: boolean } } | null | undefined;

/** phones (touch, short side under 600 px) 'low', tablets 'mid', desktops 'high'; `?q=` overrides */
export function detectQuality(renderer: RendererLike, isTouch: boolean, env: QualityEnv = defaultEnv()): Quality {
  const forced = qualityFromUrl(env.search);
  if (forced) return forced;
  if (renderer?.capabilities && renderer.capabilities.isWebGL2 === false) return 'low';
  if (!isTouch) return 'high';
  return env.shortSide < 600 ? 'low' : 'mid';
}

/**
 * The tier to draw with: the URL wins, then the player's choice, then detection. `adaptive` = the frame budget may
 * step it down (only for 自動 without a URL override: an explicit choice is respected, and tests stay deterministic).
 */
export function pickQuality(pref: QualityPref, detected: Quality, search = ''): { tier: Quality; adaptive: boolean } {
  const forced = qualityFromUrl(search);
  if (forced) return { tier: forced, adaptive: false };
  if (pref !== 'auto') return { tier: pref, adaptive: false };
  return { tier: detected, adaptive: true };
}

/** one tier cheaper, or null at the bottom */
export function stepDown(q: Quality): Quality | null {
  return q === 'high' ? 'mid' : q === 'mid' ? 'low' : null;
}

/** the canvas pixel ratio for a tier: high min(dpr, 2), mid and low min(dpr, 1.5) */
export function pixelRatioFor(q: Quality, dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(d, q === 'high' ? 2 : 1.5);
}

/**
 * The runtime budget: frame times are summed over windows of 5 s of drawn time (paused time does not count). When a
 * window's average is over 20 ms the tier should step down one; never up. The first 2 s after a start or a change
 * are skipped (shader compiles), and single frames over 250 ms (a stall, a tab switch) are ignored.
 */
export class FrameBudget {
  private sum = 0;
  private n = 0;
  private warm = 0;
  constructor(
    readonly limitMs = 20,
    readonly windowMs = 5000,
    readonly warmupMs = 2000,
  ) {}
  /** feed one frame's duration; true = this window was too slow, step down now */
  sample(dtMs: number): boolean {
    if (!(dtMs > 0) || dtMs > 250) return false;
    if (this.warm < this.warmupMs) {
      this.warm += dtMs;
      return false;
    }
    this.sum += dtMs;
    this.n++;
    if (this.sum < this.windowMs) return false;
    const slow = this.sum / this.n > this.limitMs;
    this.sum = 0;
    this.n = 0;
    if (slow) this.warm = 0;
    return slow;
  }
  /** after a tier change: wait out the warm-up again */
  reset() {
    this.sum = this.n = this.warm = 0;
  }
}

export function parseQualityPref(raw: string | null): QualityPref {
  return raw === 'auto' || isQuality(raw) ? raw : 'auto';
}

/** the stored choice; storage may be missing or throw (private windows): then 自動 */
export function loadQualityPref(): QualityPref {
  try {
    return parseQualityPref(localStorage.getItem(QUALITY_KEY));
  } catch {
    return 'auto';
  }
}

export function saveQualityPref(p: QualityPref) {
  try {
    localStorage.setItem(QUALITY_KEY, p);
  } catch {
    /* storage blocked: the choice lasts for this visit only */
  }
}

/** the tier named by a `?q=` value, or null when it names none (same as qualityFromUrl, for a bare value) */
export function parseQuality(v: string | null | undefined): Quality | null {
  const s = (v ?? '').trim().toLowerCase();
  return (QUALITIES as readonly string[]).includes(s) ? (s as Quality) : null;
}

/** phones (a touch screen whose short side is under 600 px) 'low', other touch screens 'mid', the rest 'high' */
export function qualityFor(isTouch: boolean, shortSide: number): Quality {
  if (!isTouch) return 'high';
  return shortSide < 600 ? 'low' : 'mid';
}
