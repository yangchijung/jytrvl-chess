import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FrameBudget, QUALITY_KEY, detectQuality, loadQualityPref, parseQualityPref, pickQuality, pixelRatioFor, qualityFromUrl, saveQualityPref, stepDown } from '../src/taxi/fx/quality';
import { GRADE, TAXI_YELLOW, dofAperture, gradeColour, vignetteAt } from '../src/taxi/fx/grade';
import { AO_BASE, AO_EDGE, FAKE_AO, addFakeAO, baseShade, edgeShade, setFakeAO } from '../src/taxi/fx/fakeAO';
import { addOcclusionFade } from '../src/taxi/fx/occlusion';

const env = (search = '', shortSide = 1080) => ({ search, shortSide });

describe('quality tiers', () => {
  it('phones low, tablets mid, desktops high', () => {
    expect(detectQuality(null, true, env('', 390))).toBe('low');
    expect(detectQuality(null, true, env('', 820))).toBe('mid');
    expect(detectQuality(null, false, env('', 1080))).toBe('high');
    expect(detectQuality(null, false, env('', 390))).toBe('high'); // a narrow desktop window is still a desktop
  });
  it('?q= overrides detection; junk is ignored', () => {
    expect(detectQuality(null, true, env('?q=high', 390))).toBe('high');
    expect(detectQuality(null, false, env('?track=test&q=low'))).toBe('low');
    expect(detectQuality(null, false, env('?q=ultra'))).toBe('high');
    expect(qualityFromUrl('?q=mid')).toBe('mid');
    expect(qualityFromUrl('')).toBeNull();
  });
  it('a WebGL1-only renderer gets low, WebGL2 keeps the device tier', () => {
    expect(detectQuality({ capabilities: { isWebGL2: false } }, false, env())).toBe('low');
    expect(detectQuality({ capabilities: { isWebGL2: true } }, true, env('', 820))).toBe('mid');
  });
  it('URL beats the stored choice beats detection; only 自動 adapts', () => {
    expect(pickQuality('auto', 'mid')).toEqual({ tier: 'mid', adaptive: true });
    expect(pickQuality('high', 'mid')).toEqual({ tier: 'high', adaptive: false });
    expect(pickQuality('high', 'mid', '?q=low')).toEqual({ tier: 'low', adaptive: false });
    expect(pickQuality('auto', 'high', '?q=high')).toEqual({ tier: 'high', adaptive: false });
  });
  it('steps down one at a time, never below low', () => {
    expect(stepDown('high')).toBe('mid');
    expect(stepDown('mid')).toBe('low');
    expect(stepDown('low')).toBeNull();
  });
  it('pixel ratio per tier: high up to 2, mid and low up to 1.5', () => {
    expect(pixelRatioFor('high', 3)).toBe(2);
    expect(pixelRatioFor('mid', 2)).toBe(1.5);
    expect(pixelRatioFor('low', 3)).toBe(1.5);
    expect(pixelRatioFor('high', 1)).toBe(1);
    expect(pixelRatioFor('mid', NaN)).toBe(1);
  });
});

describe('frame budget', () => {
  const feed = (b: FrameBudget, ms: number, seconds: number) => {
    let hits = 0;
    for (let t = 0; t < seconds * 1000; t += ms) if (b.sample(ms)) hits++;
    return hits;
  };
  it('a steady 16 ms never steps down', () => {
    expect(feed(new FrameBudget(), 16, 60)).toBe(0);
  });
  it('a 5 s average over 20 ms steps down once per window, after the warm-up', () => {
    const b = new FrameBudget();
    expect(feed(b, 25, 6.9)).toBe(0); // 2 s warm-up + 4.9 s: the first window is not full yet
    expect(feed(b, 25, 0.2)).toBe(1);
  });
  it('short spikes inside a good window do not count; stalls over 250 ms are ignored', () => {
    const b = new FrameBudget();
    feed(b, 16, 2);
    let hits = 0;
    for (let k = 0; k < 300; k++) if (b.sample(k % 30 === 0 ? 60 : 16)) hits++;
    expect(b.sample(5000)).toBe(false);
    expect(hits).toBe(0);
  });
  it('after a step the warm-up starts again', () => {
    const b = new FrameBudget();
    expect(feed(b, 30, 7.1)).toBe(1);
    expect(feed(b, 30, 1.9)).toBe(0);
  });
});

describe('stored choice', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('parses only the four values, else 自動', () => {
    expect(parseQualityPref('mid')).toBe('mid');
    expect(parseQualityPref('auto')).toBe('auto');
    expect(parseQualityPref(null)).toBe('auto');
    expect(parseQualityPref('ultra')).toBe('auto');
  });
  it('round-trips through localStorage, and survives storage that throws', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
    saveQualityPref('high');
    expect(mem.get(QUALITY_KEY)).toBe('high');
    expect(loadQualityPref()).toBe('high');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadQualityPref()).toBe('auto');
    expect(() => saveQualityPref('low')).not.toThrow();
  });
});

describe('colour grade', () => {
  const to255 = (c: number[]) => c.map((v) => Math.round(v * 255));
  it('keeps the taxi yellow #FFC72C (and sunlit or shaded versions of it) within 2/255', () => {
    for (const k of [1, 0.92, 0.8]) {
      const c = TAXI_YELLOW.map((v) => v * k) as [number, number, number];
      const g = gradeColour(c);
      for (let i = 0; i < 3; i++) expect(Math.abs(g[i] - c[i]) * 255).toBeLessThanOrEqual(2);
    }
  });
  it('adds contrast to the rest of the image: dark asphalt gets darker, bright walls brighter', () => {
    const asphalt = [0.23, 0.25, 0.28] as [number, number, number];
    const wall = [0.82, 0.8, 0.76] as [number, number, number];
    const ga = gradeColour(asphalt),
      gw = gradeColour(wall);
    expect(ga[2]).toBeLessThan(asphalt[2]);
    expect(gw[0]).toBeGreaterThan(wall[0]);
    // warm shade: red stays above blue in a grey shadow
    const grey = gradeColour([0.2, 0.2, 0.2]);
    expect(grey[0]).toBeGreaterThan(grey[2]);
  });
  it('stays in range and leaves black and white alone', () => {
    expect(to255(gradeColour([0, 0, 0]))).toEqual([0, 0, 0].map((_, i) => Math.round(Math.max(0, GRADE.shadowTint[i]) * 255)));
    expect(to255(gradeColour([1, 1, 1]))).toEqual([255, 255, 255]);
  });
  it('vignette: the middle untouched, the corners at most 16 % darker', () => {
    expect(vignetteAt(0.5, 0.5, 1.44)).toBe(1);
    expect(vignetteAt(0.5, 0.35, 1.44)).toBe(1);
    expect(vignetteAt(0, 0, 1.44)).toBeCloseTo(1 - GRADE.vignette, 5);
  });
  it('depth of field grows with camera speed and is capped', () => {
    expect(dofAperture(0)).toBeLessThan(dofAperture(13));
    expect(dofAperture(30)).toBe(dofAperture(500));
    expect(dofAperture(NaN)).toBe(dofAperture(0));
  });
});

describe('fake contact shade (mid)', () => {
  it('darkens the foot of a wall and the rim of a lot, nothing past their reach', () => {
    expect(baseShade(0)).toBeCloseTo(AO_BASE.dark, 5);
    expect(baseShade(AO_BASE.height)).toBe(1);
    expect(baseShade(1)).toBeGreaterThan(AO_BASE.dark);
    expect(edgeShade(0)).toBeCloseTo(AO_EDGE.dark, 5);
    expect(edgeShade(5)).toBe(1);
  });
  it('chains onto existing shader edits and keeps distinct program keys', () => {
    const shader = () => ({
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
    });
    const a = new THREE.MeshLambertMaterial();
    a.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n// facade');
    };
    addOcclusionFade(addFakeAO(a, 'base'));
    const sh = shader();
    a.onBeforeCompile(sh as never, null as never);
    expect(sh.fragmentShader).toContain('// facade');
    expect(sh.fragmentShader).toContain('uFakeAO');
    expect(sh.fragmentShader.indexOf('uFakeAO > 0.5')).toBeGreaterThan(sh.fragmentShader.indexOf('// facade'));
    expect(sh.vertexShader).toContain('vAoY');
    expect(sh.uniforms.uFakeAO).toBe(FAKE_AO.uFakeAO);
    const b = addFakeAO(new THREE.MeshLambertMaterial(), 'edge');
    expect(b.customProgramCacheKey()).not.toBe(a.customProgramCacheKey());
    setFakeAO(true);
    expect(FAKE_AO.uFakeAO.value).toBe(1);
    setFakeAO(false);
    expect(FAKE_AO.uFakeAO.value).toBe(0);
  });
});
