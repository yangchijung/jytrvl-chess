import { describe, expect, it } from 'vitest';
import { CLOCK_PROBLEMS, blankClock, checkClock, hourAngle, isPM, minuteAngle, nextClock, nudge, readClock, sayTime, turnTo, validClock, type ClockSave } from '../shared/math/clock';
import { GARDEN_PROBLEMS, answerGarden, blankGarden, choicesOfG, nextGarden, plant, sizeTo, validGarden, waysOf, type GardenSave } from '../shared/math/garden';
import { FROG_PROBLEMS, blankFrog, checkFrog, jumpsTo, landing, nudgePick, pickAt, ticksOf, validFrog, type FrogSave } from '../shared/math/frog';
import { existsSync, readFileSync } from 'node:fs';
import { CLIPS, VOICE } from '../src/math/audio';

describe('Clock Repair (N-1-6, N-2-13)', () => {
  it('grade 1 problems are whole or half hours with 30-minute steps; grade 2 adds 5- and 1-minute steps; no seconds', () => {
    for (const p of CLOCK_PROBLEMS) {
      expect(p.goal % p.step).toBe(0);
      expect(p.start % p.step).toBe(0);
      if (p.step === 30) expect([0, 30]).toContain(p.goal % 60);
    }
    expect(CLOCK_PROBLEMS.map((p) => sayTime(p.goal, p.step === 30))).toEqual(['上午 8 點', '下午 1 點半', '上午 9 點 15 分', '下午 4 點 50 分', '上午 10 點 37 分']);
    // problem 2 crosses noon, so 上午 turns into 下午 while turning
    expect(isPM(CLOCK_PROBLEMS[1].start)).toBe(false);
    expect(isPM(CLOCK_PROBLEMS[1].goal)).toBe(true);
  });

  it('the hour hand follows the minute hand like gears: at 4:50 it is 5/6 of the way from 4 to 5', () => {
    const m = 16 * 60 + 50;
    expect(minuteAngle(m)).toBe(300);
    expect(hourAngle(m)).toBeCloseTo(4 * 30 + 25, 6); // 145°: past 4 (120°), not yet 5 (150°)
    expect(hourAngle(12 * 60)).toBe(0);
    expect(sayTime(0)).toBe('上午 12 點');
    expect(sayTime(12 * 60)).toBe('下午 12 點');
  });

  it('turning several times round and back again is exact, snapped to the step', () => {
    let s: ClockSave = blankClock(); // 上午 6 點, step 30
    s = turnTo(s, s.minutes, 2 * 60 + 11); // two turns and a bit
    expect(s.minutes).toBe(8 * 60);
    s = turnTo(s, s.minutes, -8 * 60 - 20); // back past midnight
    // 8:00 − 8:20 = −0:20, which rounds to the nearest half hour (−0:30) and wraps to 23:30 the day before
    expect(sayTime(s.minutes)).toBe('下午 11 點半');
  });

  it('“done” checks the time; the right face at the wrong half of the day is told apart', () => {
    let s: ClockSave = { ...blankClock(), index: 1, minutes: 11 * 60 }; // goal 下午 1 點半
    s = { ...s, minutes: 1 * 60 + 30 };
    expect(checkClock(s).r).toBe('wrongPart');
    s = { ...s, minutes: 13 * 60 };
    expect(checkClock(s).r).toBe('wrong');
    s = nudge(s, 1);
    const r = checkClock(s);
    expect(r.r).toBe('right');
    expect(validClock(r.s)).toBe(true);
    expect(nextClock(r.s).minutes).toBe(CLOCK_PROBLEMS[2].start);
  });

  it('saves: a solved save that is not at the goal is refused', () => {
    expect(validClock({ ...blankClock(), solved: true })).toBe(false);
    expect(validClock({ ...blankClock(), minutes: 1440 })).toBe(false);
    expect(readClock(() => JSON.stringify(blankClock())).kind).toBe('ok');
  });
});

describe('Multiplication Garden (N-2-6, N-2-7, R-2-3)', () => {
  /** count the flowers one by one in the rectangle (independent of rows × cols) */
  const count = (rows: number, cols: number) => {
    let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) n++;
    return n;
  };
  it('every rectangle fits the 8 × 8 bed; totals stay in the 10 × 10 facts', () => {
    for (const p of GARDEN_PROBLEMS) {
      if (p.kind === 'make') {
        expect(p.cols).toBeLessThanOrEqual(8);
        expect(p.rows).toBeLessThanOrEqual(8);
        expect(count(p.rows, p.cols)).toBeLessThanOrEqual(100);
        if (p.split) expect(count(p.rows, p.split) + count(p.rows, p.cols - p.split)).toBe(count(p.rows, p.cols));
      } else expect(waysOf(p.total).length).toBeGreaterThanOrEqual(p.need);
    }
    expect(waysOf(12)).toEqual(['2x6', '3x4', '4x3', '6x2']);
  });

  it('3 rows of 4 is accepted only as that rectangle, then the total 12 is picked', () => {
    let s: GardenSave = blankGarden();
    expect(plant(s).r).toBe('notYet');
    s = sizeTo(s, 4, 3).s; // 4 rows of 3: the wrong way round for this task
    expect(plant(s).r).toBe('shape');
    s = sizeTo(s, 3, 4).s;
    const pl = plant(s);
    expect(pl.r).toBe('found');
    s = pl.s;
    expect(choicesOfG(GARDEN_PROBLEMS[0], 0).filter((n) => n === count(3, 4))).toHaveLength(1);
    expect(answerGarden(s, 11).r).toBe('wrong');
    const r = answerGarden(s, 12);
    expect(r.r).toBe('right');
    expect(validGarden(r.s)).toBe(true);
  });

  it('12 in equal rows: two different arrangements; the same one twice and unequal ones do not count', () => {
    let s: GardenSave = { ...blankGarden(), index: 2 };
    s = sizeTo(s, 2, 5).s;
    expect(plant(s).r).toBe('notEqual');
    s = sizeTo(s, 3, 4).s;
    const a = plant(s);
    expect(a.r).toBe('found');
    s = sizeTo(a.s, 3, 4).s;
    expect(plant(s).r).toBe('again');
    s = sizeTo(s, 4, 3).s; // turned round counts as a different arrangement
    const b = plant(s);
    expect(b.r).toBe('right');
    expect(b.s.found).toEqual(['4x3', '3x4']);
    expect(validGarden(b.s)).toBe(true);
    expect(nextGarden(b.s).index).toBe(3);
  });

  it('saves: planted with the wrong rectangle is refused', () => {
    expect(validGarden({ ...blankGarden(), planted: true, rows: 2, cols: 2 })).toBe(false);
  });
});

describe('Number-Line Frog (N-3-11)', () => {
  /** hop one jump at a time (independent of start + jump × times) */
  const hop = (start: number, jump: number, times: number) => {
    let v = start;
    for (let k = 0; k < times; k++) v += jump;
    return v;
  };
  it('every line starts at 0, the landing is on a mark, never below 0 or past the end', () => {
    for (const p of FROG_PROBLEMS) {
      const v = hop(p.start, p.jump, p.times);
      expect(landing(p)).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(p.max);
      expect(v % p.tick).toBe(0);
      expect(ticksOf(p)[0]).toBe(0);
      expect(p.labels).toContain(0);
      // every point passed on the way is on the line too
      for (let k = 0; k <= p.times; k++) expect(hop(p.start, p.jump, k)).toBeGreaterThanOrEqual(0);
    }
    expect(FROG_PROBLEMS.map(landing)).toEqual([11, 6, 70, 800, 60]);
  });

  it('taps snap to the nearest mark; ‹ › move one mark', () => {
    let s: FrogSave = { ...blankFrog(), index: 2 }; // marks of 10
    s = pickAt(s, 64);
    expect(s.pick).toBe(60);
    s = nudgePick(s, 1);
    expect(s.pick).toBe(70);
    expect(pickAt(s, -50).pick).toBe(0);
    expect(pickAt(s, 999).pick).toBe(100);
  });

  it('a wrong mark says how many jumps it takes (the “counted the marks” slip), or why it cannot be reached', () => {
    const p = FROG_PROBLEMS[0]; // 3, +2 × 4 → 11
    let s: FrogSave = blankFrog();
    expect(checkFrog(s).r).toBe('noPick');
    s = pickAt(s, 13);
    expect(checkFrog(s)).toMatchObject({ r: 'jumps', jumps: 5 });
    s = pickAt(s, 12);
    expect(checkFrog(s).r).toBe('notOnPath');
    s = pickAt(s, 1);
    expect(checkFrog(s).r).toBe('otherWay');
    s = pickAt(s, 3);
    expect(checkFrog(s).r).toBe('start');
    expect(jumpsTo(p, 11)).toBe(4);
    s = pickAt(s, 11);
    const r = checkFrog(s);
    expect(r.r).toBe('right');
    expect(validFrog(r.s)).toBe(true);
  });

  it('saves: a mark that is not on a tick is refused', () => {
    expect(validFrog({ ...blankFrog(), index: 2, pick: 65 })).toBe(false);
  });
});

describe('batch B spoken prompts', () => {
  it('every clip the pages play has text', () => {
    const ids = [
      ...CLOCK_PROBLEMS.flatMap((p) => [`clock_task_${p.id.slice(-2)}`, `clock_right_${p.id.slice(-2)}`]),
      'clock_wrong',
      'clock_wrong_part',
      'clock_done',
      ...GARDEN_PROBLEMS.flatMap((p) => [`garden_task_${p.id.slice(-2)}`, `garden_right_${p.id.slice(-2)}`]),
      ...['shape', 'not_equal', 'again', 'found', 'ask', 'not_planted', 'wrong', 'done'].map((k) => `garden_${k}`),
      ...FROG_PROBLEMS.flatMap((p) => [`frog_task_${p.id.slice(-2)}`, `frog_right_${p.id.slice(-2)}`]),
      ...['no_pick', 'start', 'other_way', 'not_on_path', 'jumps', 'done'].map((k) => `frog_${k}`),
    ];
    for (const id of ids) expect(CLIPS[id], id).toBeTruthy();
    expect(CLIPS.garden_right_05).toBe('7 乘以 4，可以拆成 5 乘以 4 和 2 乘以 4，20 加 8，一共 28 朵。');
    expect(CLIPS.clock_right_04).toBe('對了，下午 4 點 50 分。');
  });
});

describe('batch B audio files (Azure, made by James 2026-10-22)', () => {
  it('every clock/garden/frog clip has its mp3 and the reviewed manifest has the same text and voice', () => {
    const dir = `public/math/audio/${VOICE.locale}/v${VOICE.version}`;
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { id: string; text: string; voice: string }[];
    const ids = Object.keys(CLIPS).filter((id) => /^(clock|garden|frog)_/.test(id));
    expect(ids.length).toBe(47);
    for (const id of ids) {
      expect(existsSync(`${dir}/${id}.mp3`), id).toBe(true);
      const m = manifest.find((x) => x.id === id);
      expect(m?.text, id).toBe(CLIPS[id]);
      expect(m?.voice).toBe(VOICE.voice);
    }
  });
});

