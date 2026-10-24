import { describe, expect, it } from 'vitest';
import { AUTO_START, DAY_SECONDS, PRESET_T, cycleT, isTimeSetting, lightingAt, lightingFor, mixHex, moodAt } from '../src/taxi/fx/timeOfDay';

const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

describe('taxi time of day', () => {
  it('day keeps the afternoon rig the city was balanced for', () => {
    const d = lightingFor('day');
    expect(d.sunColor).toBe('#FFEACB');
    expect(d.sunIntensity).toBeCloseTo(2.6);
    expect(d.fogColor).toBe('#E8E6DA');
    expect(d.skyZenith).toBe('#2F86DA');
    expect(d.lights).toBe(0);
    expect(d.exposure).toBe(1);
  });

  it('night has the city lights on, a dark sky and a weak moon', () => {
    const n = lightingFor('night');
    expect(n.lights).toBe(1);
    expect(n.sunIntensity).toBeLessThan(1);
    expect(lum(n.skyZenith)).toBeLessThan(30);
    expect(lum(n.fogColor)).toBeLessThan(lum(lightingFor('day').fogColor) / 3);
    expect(moodAt(PRESET_T.night)).toBe('night');
  });

  it('sunset: a low, warm sun (long shadows) and an orange-pink glow at the horizon', () => {
    const s = lightingFor('sunset');
    expect(s.sunDir[1]).toBeLessThan(0.3);
    expect(s.sunDir[0]).toBeLessThan(-0.8); // over the sea to the west
    const n = parseInt(s.sunColor.slice(1), 16);
    expect((n >> 16) & 255).toBeGreaterThan(((n & 255) * 3) / 2); // red well above blue
    const g = parseInt(s.skyGlow.slice(1), 16);
    expect((g >> 16) & 255).toBeGreaterThan(200);
    expect(s.lights).toBeGreaterThan(0);
    expect(s.lights).toBeLessThan(1);
    expect(moodAt(PRESET_T.sunset)).toBe('sunset');
  });

  it('interpolates smoothly between the keyframes', () => {
    const a = lightingAt(0.33),
      b = lightingAt(0.45),
      mid = lightingAt(0.39);
    expect(mid.sunIntensity).toBeLessThanOrEqual(Math.max(a.sunIntensity, b.sunIntensity) + 1e-9);
    expect(mid.sunIntensity).toBeGreaterThanOrEqual(Math.min(a.sunIntensity, b.sunIntensity) - 1e-9);
    expect(mid.hemiIntensity).toBeCloseTo((a.hemiIntensity + b.hemiIntensity) / 2, 5); // smoothstep is symmetric
    expect(mid.fogColor).toBe(mixHex(a.fogColor, b.fogColor, 0.5));
    // no jumps anywhere around the cycle
    let prev = lightingAt(0);
    for (let t = 0.002; t <= 1.0001; t += 0.002) {
      const c = lightingAt(t);
      expect(Math.abs(c.lights - prev.lights)).toBeLessThan(0.05);
      expect(Math.abs(c.sunIntensity - prev.sunIntensity)).toBeLessThan(0.1);
      expect(Math.abs(lum(c.skyZenith) - lum(prev.skyZenith))).toBeLessThan(6);
      prev = c;
    }
  });

  it('wraps: the end of the day is the start of the next', () => {
    expect(lightingAt(1)).toEqual(lightingAt(0));
    expect(lightingAt(1.7)).toEqual(lightingAt(0.7));
    expect(lightingAt(-0.3)).toEqual(lightingAt(0.7));
  });

  it('the sun direction is always a unit vector above a low angle', () => {
    for (let t = 0; t < 1; t += 0.01) {
      const d = lightingAt(t).sunDir;
      expect(Math.hypot(...d)).toBeCloseTo(1, 6);
      expect(d[1]).toBeGreaterThanOrEqual(0.149);
    }
  });

  it('auto runs one full day in six minutes, starting in the late afternoon', () => {
    expect(DAY_SECONDS).toBe(360);
    expect(cycleT('auto', 0)).toBeCloseTo(AUTO_START);
    expect(cycleT('auto', DAY_SECONDS)).toBeCloseTo(AUTO_START);
    expect(cycleT('auto', DAY_SECONDS / 2)).toBeCloseTo((AUTO_START + 0.5) % 1);
    expect(cycleT('night', 123)).toBe(PRESET_T.night);
    // within one auto day there is a sunset and a night with the lights on
    const moods = new Set(Array.from({ length: 360 }, (_, s) => moodAt(cycleT('auto', s))));
    expect(moods).toEqual(new Set(['day', 'sunset', 'night']));
  });

  it('recognises the stored settings only', () => {
    expect(isTimeSetting('night')).toBe(true);
    expect(isTimeSetting('auto')).toBe(true);
    expect(isTimeSetting('noon')).toBe(false);
    expect(isTimeSetting(3)).toBe(false);
  });
});
