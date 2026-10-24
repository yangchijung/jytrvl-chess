// Rush Taxi — control settings kept per browser (localStorage `jy.taxi.settings`). Storage may be missing or throw
// (private windows, blocked site data): the game then plays with the defaults.
import type { Tilt } from './tilt';
import { isTimeSetting, type TimeSetting } from '../fx/timeOfDay';

export interface TaxiSettings {
  /** full throttle unless braking (for small children) */
  autoGas: boolean;
  /** steer by tilting the device */
  tilt: boolean;
  /** the calibrated "straight ahead" tilt, or null = device level */
  tiltCentre: Tilt | null;
  /** time of day: day, sunset, night, or auto (a slow day cycle) */
  time: TimeSetting;
}

export const SETTINGS_KEY = 'jy.taxi.settings';
export const DEFAULT_SETTINGS: TaxiSettings = { autoGas: false, tilt: false, tiltCentre: null, time: 'day' };

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function parseSettings(raw: string | null): TaxiSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const o = JSON.parse(raw) as Partial<TaxiSettings>;
    const c = o.tiltCentre as Tilt | null | undefined;
    return {
      autoGas: o.autoGas === true,
      tilt: o.tilt === true,
      tiltCentre: c && num(c.beta) && num(c.gamma) ? { beta: c.beta, gamma: c.gamma } : null,
      time: isTimeSetting(o.time) ? o.time : 'day',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(): TaxiSettings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: TaxiSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the setting lasts for this visit only */
  }
}
