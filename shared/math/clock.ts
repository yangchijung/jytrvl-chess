// Math Island batch B — Clock Repair (時鐘修理站), grades 1–2 (N-1-6 everyday time words, whole and half hours;
// N-2-13 hours and minutes, no seconds). The child turns only the minute hand; the hour hand follows like real
// gears (360° of the minute hand = 30° of the hour hand), and passing 12 o'clock switches 上午 ↔ 下午. So the
// child sees that at 3:50 the hour hand is almost at 4 but not yet. Pure and deterministic.
import { readWith, type Read } from './common';

export const DAY = 24 * 60;

export interface ClockProblem {
  id: string;
  /** what the task card says (spoken too) */
  task: string;
  /** minutes since midnight to set */
  goal: number;
  /** where the clock starts, minutes since midnight */
  start: number;
  /** the minute hand snaps to multiples of this (30 for grade 1, 5 then 1 for grade 2) */
  step: 30 | 5 | 1;
}

const t = (h: number, m: number) => h * 60 + m;
/** Five fixed problems: whole hour, half hour across noon (下午), five-minute steps, the 4:50 trap, one-minute steps. */
export const CLOCK_PROBLEMS: readonly ClockProblem[] = [
  { id: 'g1-clock-01', task: '上午 8 點上學，請把時鐘撥到上午 8 點。', goal: t(8, 0), start: t(6, 0), step: 30 },
  { id: 'g1-clock-02', task: '下午 1 點半上才藝課，請把時鐘撥到下午 1 點半。', goal: t(13, 30), start: t(11, 0), step: 30 },
  { id: 'g1-clock-03', task: '上午 9 點 15 分下課，請把時鐘撥到上午 9 點 15 分。', goal: t(9, 15), start: t(8, 0), step: 5 },
  { id: 'g1-clock-04', task: '下午 4 點 50 分回到家，請把時鐘撥到下午 4 點 50 分。', goal: t(16, 50), start: t(14, 0), step: 5 },
  { id: 'g1-clock-05', task: '上午 10 點 37 分吃點心，請把時鐘撥到上午 10 點 37 分。', goal: t(10, 37), start: t(10, 0), step: 1 },
];

export interface ClockSave {
  schemaVersion: 1;
  game: 'clock';
  index: number;
  /** the clock's time, minutes since midnight (0..1439) */
  minutes: number;
  solved: boolean;
  done: string[];
  voice: boolean;
}
export const CLOCK_KEY = 'jy.math.clock.v1';

export const norm = (m: number) => ((Math.round(m) % DAY) + DAY) % DAY;
export const blankClock = (voice = true): ClockSave => ({ schemaVersion: 1, game: 'clock', index: 0, minutes: CLOCK_PROBLEMS[0].start, solved: false, done: [], voice });
export const finishedC = (s: ClockSave) => s.index >= CLOCK_PROBLEMS.length;
export const problemOfC = (s: ClockSave): ClockProblem | null => CLOCK_PROBLEMS[s.index] ?? null;

/** hand angles in degrees, clockwise from 12 */
export const minuteAngle = (m: number) => (norm(m) % 60) * 6;
export const hourAngle = (m: number) => ((norm(m) % 720) / 720) * 360;
export const isPM = (m: number) => norm(m) >= 720;

/** How the time is said: 上午 8 點、下午 3 點半、上午 9 點 15 分 (12-hour clock, 12 not 0). */
export function sayTime(m: number, half = true): string {
  const n = norm(m);
  const h = Math.floor(n / 60) % 12 || 12;
  const min = n % 60;
  const part = isPM(n) ? '下午' : '上午';
  if (min === 0) return `${part} ${h} 點`;
  if (min === 30 && half) return `${part} ${h} 點半`;
  return `${part} ${h} 點 ${min} 分`;
}

/**
 * Turning the minute hand by `delta` minutes (any sign) from the time the drag started. Snaps to the problem's
 * step. The hour and 上午/下午 follow from the total, so turning back across 12 goes back an hour correctly.
 */
export function turnTo(s: ClockSave, from: number, delta: number): ClockSave {
  const p = problemOfC(s);
  if (!p || s.solved || !Number.isFinite(delta) || !Number.isFinite(from)) return s;
  const raw = from + delta;
  const snapped = Math.round(raw / p.step) * p.step;
  const minutes = norm(snapped);
  return minutes === s.minutes ? s : { ...s, minutes };
}
/** Keyboard / buttons: one step (or one hour) forward or back. */
export const nudge = (s: ClockSave, steps: number, hour = false): ClockSave => {
  const p = problemOfC(s);
  if (!p) return s;
  const base = Math.round(s.minutes / p.step) * p.step;
  return turnTo(s, base, hour ? steps * 60 : steps * p.step);
};

export type CResult = 'locked' | 'wrongPart' | 'wrong' | 'right';
export function checkClock(s: ClockSave): { s: ClockSave; r: CResult } {
  const p = problemOfC(s);
  if (!p || s.solved) return { s, r: 'locked' };
  if (norm(s.minutes) !== p.goal) {
    // the face is right but it is the other half of the day (e.g. 上午 3 點半 for 下午 3 點半)
    if (norm(s.minutes) % 720 === p.goal % 720) return { s, r: 'wrongPart' };
    return { s, r: 'wrong' };
  }
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right' };
}

export function restartClock(s: ClockSave): ClockSave {
  const p = problemOfC(s);
  return p ? { ...s, minutes: p.start, solved: false, done: s.done.filter((d) => d !== p.id) } : s;
}
export function nextClock(s: ClockSave): ClockSave {
  if (!s.solved || finishedC(s)) return s;
  const index = s.index + 1;
  const p = CLOCK_PROBLEMS[index];
  return { ...s, index, minutes: p ? p.start : 0, solved: false };
}
export const playAgainC = (s: ClockSave): ClockSave => blankClock(s.voice);

export function validClock(x: unknown): x is ClockSave {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== 1 || s.game !== 'clock' || typeof s.solved !== 'boolean' || typeof s.voice !== 'boolean') return false;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) > CLOCK_PROBLEMS.length) return false;
  if (!Number.isInteger(s.minutes) || (s.minutes as number) < 0 || (s.minutes as number) >= DAY) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => CLOCK_PROBLEMS.some((p) => p.id === d)) || new Set(s.done).size !== s.done.length) return false;
  const p = CLOCK_PROBLEMS[s.index as number];
  if (!p) return s.solved === false;
  if (s.solved && s.minutes !== p.goal) return false;
  return true;
}
export const readClock = (get: () => string | null): Read<ClockSave> => readWith(get, validClock);
