// Rush Taxi stage 5: tilt steering maths, auto gas in Input, and the saved control settings.
import { describe, expect, it } from 'vitest';
import { angleDiff, quarter, tiltSteer, TILT_DEAD, TILT_FULL, wheelAngle } from '../src/taxi/core/tilt';
import { Input } from '../src/taxi/core/input';
import { DEFAULT_SETTINGS, parseSettings } from '../src/taxi/core/settings';

const t = (beta: number, gamma: number) => ({ beta, gamma });

describe('tilt mapping', () => {
  it('normalises the screen angle to a quarter turn', () => {
    expect(quarter(0)).toBe(0);
    expect(quarter(-90)).toBe(270);
    expect(quarter(90)).toBe(90);
    expect(quarter(450)).toBe(90);
    expect(quarter(180)).toBe(180);
  });
  it('uses gamma in portrait and beta in landscape, with the sign of each orientation', () => {
    expect(wheelAngle(t(5, 12), 0)).toBe(12);
    expect(wheelAngle(t(5, 12), 180)).toBe(-12);
    expect(wheelAngle(t(15, 40), 90)).toBe(15);
    expect(wheelAngle(t(15, 40), 270)).toBe(-15);
    expect(wheelAngle(t(15, 40), -90)).toBe(-15);
  });
  it('steers right for a right tilt in all four orientations', () => {
    expect(tiltSteer(t(0, 15), 0)).toBeGreaterThan(0);
    expect(tiltSteer(t(0, -15), 180)).toBeGreaterThan(0);
    expect(tiltSteer(t(15, 45), 90)).toBeGreaterThan(0);
    expect(tiltSteer(t(-15, 45), 270)).toBeGreaterThan(0);
    // and left for the opposite
    expect(tiltSteer(t(-15, 45), 90)).toBeLessThan(0);
    expect(tiltSteer(t(15, 45), 270)).toBeLessThan(0);
  });
  it('has a dead zone around the centre', () => {
    expect(tiltSteer(t(TILT_DEAD - 0.5, 0), 90)).toBe(0);
    expect(tiltSteer(t(-TILT_DEAD, 0), 90)).toBe(0);
    expect(tiltSteer(t(TILT_DEAD + 1, 0), 90)).toBeGreaterThan(0);
    expect(tiltSteer(t(TILT_DEAD + 1, 0), 90)).toBeLessThan(0.1);
  });
  it('reaches full lock at about 28° and clamps beyond', () => {
    expect(TILT_FULL).toBeGreaterThanOrEqual(25);
    expect(TILT_FULL).toBeLessThanOrEqual(30);
    expect(tiltSteer(t(TILT_FULL, 0), 90)).toBeCloseTo(1);
    expect(tiltSteer(t(70, 0), 90)).toBe(1);
    expect(tiltSteer(t(-70, 0), 90)).toBe(-1);
    const half = tiltSteer(t((TILT_FULL + TILT_DEAD) / 2, 0), 90);
    expect(half).toBeCloseTo(0.5, 2);
  });
  it('measures from the calibrated centre', () => {
    const c = t(10, 30);
    expect(tiltSteer(t(10, 30), 90, c)).toBe(0);
    expect(tiltSteer(t(25, 30), 90, c)).toBeGreaterThan(0.4);
    expect(tiltSteer(t(0, 0), 0, c)).toBeLessThan(-0.9); // portrait: centre gamma 30, now 0 → left
  });
  it('folds the beta wrap-around and the flip past upright', () => {
    expect(angleDiff(179, -179)).toBeCloseTo(-2);
    expect(angleDiff(-179, 179)).toBeCloseTo(2);
    expect(angleDiff(170, 0)).toBeCloseTo(10); // past upright: 170 reads as 10
    expect(Math.abs(angleDiff(120, 0))).toBeLessThanOrEqual(90);
  });
  it('returns 0 for missing readings', () => {
    expect(tiltSteer(t(NaN, 0), 90)).toBe(0);
  });
});

/** a key target that the Input can listen on in node */
function keys() {
  const target = new EventTarget();
  const press = (code: string, type: 'keydown' | 'keyup' = 'keydown') => {
    const e = new Event(type) as Event & { code: string };
    e.code = code;
    target.dispatchEvent(e);
  };
  return { input: new Input(target as unknown as Window), press };
}

describe('Input: auto gas and tilt', () => {
  it('auto gas is off by default: no input, no throttle', () => {
    const { input } = keys();
    expect(input.autoGas).toBe(false);
    expect(input.read().throttle).toBe(0);
  });
  it('auto gas gives full throttle with no input, and lets go while braking', () => {
    const { input, press } = keys();
    input.autoGas = true;
    expect(input.read().throttle).toBe(1);
    press('KeyS');
    const c = input.read();
    expect(c.brake).toBe(1);
    expect(c.throttle).toBe(0);
    press('KeyS', 'keyup');
    expect(input.read().throttle).toBe(1);
    input.touch.brake = true;
    expect(input.read().throttle).toBe(0);
    input.touch.brake = false;
    input.autoGas = false;
    expect(input.read().throttle).toBe(0);
  });
  it('tilt steers; the touch stick overrides it while held; keys override both', () => {
    const { input, press } = keys();
    expect(input.read().steer).toBe(0);
    input.tilt = 0.6;
    expect(input.read().steer).toBe(0.6);
    input.touch.stick = true;
    input.touch.steer = -0.3;
    expect(input.read().steer).toBe(-0.3);
    input.touch.steer = 0; // finger resting in the middle: still straight, not tilt
    expect(input.read().steer).toBe(0);
    input.touch.stick = false;
    expect(input.read().steer).toBe(0.6);
    press('KeyA');
    expect(input.read().steer).toBe(-1);
    input.tilt = null;
    press('KeyA', 'keyup');
    expect(input.read().steer).toBe(0);
  });
  it('override (tests, replays) still wins over auto gas', () => {
    const { input } = keys();
    input.autoGas = true;
    input.override = { throttle: 0 };
    expect(input.read().throttle).toBe(0);
  });
});

describe('settings', () => {
  it('defaults: auto gas off, tilt off', () => {
    expect(DEFAULT_SETTINGS).toEqual({ autoGas: false, tilt: false, tiltCentre: null });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
  });
  it('reads saved values and drops bad ones', () => {
    expect(parseSettings(JSON.stringify({ autoGas: true, tilt: true, tiltCentre: { beta: 4, gamma: 30 } }))).toEqual({ autoGas: true, tilt: true, tiltCentre: { beta: 4, gamma: 30 } });
    expect(parseSettings(JSON.stringify({ autoGas: 'yes', tiltCentre: { beta: 'x' } }))).toEqual(DEFAULT_SETTINGS);
  });
});
