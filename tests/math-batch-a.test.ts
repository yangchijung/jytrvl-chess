import { describe, expect, it } from 'vitest';
import { CAR, PLATFORM, TRAIN_PROBLEMS, answerTrain, blankTrain, cars, choicesOfT, moveRider, nextTrain, readTrain, restartTrain, validTrain, type TrainSave } from '../shared/math/train';
import { COINS, PURSE, SHOP_PROBLEMS, TRAY, blankShop, moveCoin, nextShop, paid, payShop, readShop, validShop, type ShopSave } from '../shared/math/shop';
import { BALANCE_PROBLEMS, BIN, PAN, SUPPLY, blankBalance, checkBalance, equation, moveBlock, nextBalance, readBalance, unknownOf, validBalance, weights, type BalanceSave } from '../shared/math/balance';
import { existsSync, readFileSync } from 'node:fs';
import { CLIPS, VOICE } from '../src/math/audio';

/** count on one by one: an independent check that does not use the program's addition of a and b */
const countOn = (a: number, b: number) => {
  let n = a;
  for (let k = 0; k < b; k++) n++;
  return n;
};

describe('Make-Ten Train (N-1-3)', () => {
  it('five fixed single-digit problems: one exact ten, the rest cross ten with sums ≤ 18', () => {
    expect(TRAIN_PROBLEMS.map((p) => `${p.a}+${p.b}`)).toEqual(['7+3', '8+5', '9+4', '7+6', '8+8']);
    expect(countOn(TRAIN_PROBLEMS[0].a, TRAIN_PROBLEMS[0].b)).toBe(10);
    for (const p of TRAIN_PROBLEMS) {
      expect(p.a).toBeGreaterThanOrEqual(1);
      expect(p.a).toBeLessThanOrEqual(9);
      expect(p.b).toBeLessThanOrEqual(9);
      expect(countOn(p.a, p.b)).toBeLessThanOrEqual(18);
    }
  });

  it('three different choices, exactly one is the counted total', () => {
    TRAIN_PROBLEMS.forEach((p, i) => {
      const c = choicesOfT(p, i);
      expect(new Set(c).size).toBe(3);
      expect(c.filter((n) => n === countOn(p.a, p.b))).toHaveLength(1);
    });
  });

  it('car 2 opens only when car 1 is full; car 1 refuses an 11th rider', () => {
    let s = blankTrain();
    s = { ...s, index: 1, at: Array(5).fill(PLATFORM) }; // 8 + 5
    expect(moveRider(s, 0, 1).r).toBe('fillFirst');
    s = moveRider(s, 0, 0).s;
    s = moveRider(s, 1, 0).s;
    expect(cars(s)).toEqual([CAR, 0]);
    expect(moveRider(s, 2, 0).r).toBe('full');
    s = moveRider(s, 2, 1).s;
    // a rider cannot leave car 1 while car 2 has riders (it would leave a gap before ten)
    expect(moveRider(s, 0, PLATFORM).r).toBe('fillFirst');
    expect(validTrain(s)).toBe(true);
  });

  it('the total is accepted only when everyone has boarded; then 13 = 10 + 3', () => {
    let s: TrainSave = { ...blankTrain(), index: 1, at: Array(5).fill(PLATFORM) };
    expect(answerTrain(s, 13).r).toBe('notAll');
    s = [0, 0, 1, 1, 1].reduce((acc, to, i) => moveRider(acc, i, to).s, s);
    expect(cars(s)).toEqual([10, 3]);
    expect(answerTrain(s, 12).r).toBe('wrong');
    const r = answerTrain(s, 13);
    expect(r.r).toBe('right');
    expect(nextTrain(r.s).index).toBe(2);
    expect(restartTrain(s).at.every((x) => x === PLATFORM)).toBe(true);
  });

  it('saves: a hand-edited save with riders in car 2 before car 1 is full is refused', () => {
    expect(validTrain(blankTrain())).toBe(true);
    const bad = { ...blankTrain(), index: 1, at: [1, PLATFORM, PLATFORM, PLATFORM, PLATFORM] };
    expect(validTrain(bad)).toBe(false);
    expect(readTrain(() => '{').kind).toBe('broken');
    expect(readTrain(() => null).kind).toBe('empty');
    expect(readTrain(() => JSON.stringify(blankTrain())).kind).toBe('ok');
  });
});

describe('Coin Shop (N-1-4, N-2-5)', () => {
  /** every way to pay from the purse, by brute force (independent of paid()) */
  const exactWays = (purse: number[], price: number) => {
    let ways = 0;
    for (let m = 0; m < 1 << purse.length; m++) {
      let v = 0;
      purse.forEach((c, i) => m & (1 << i) && (v += c));
      if (v === price) ways++;
    }
    return ways;
  };
  it('five problems under 100 dollars, only Taiwan coins, and each purse can pay the price exactly', () => {
    expect(SHOP_PROBLEMS.map((p) => p.price)).toEqual([7, 12, 25, 36, 60]);
    for (const p of SHOP_PROBLEMS) {
      expect(p.purse.every((c) => (COINS as readonly number[]).includes(c))).toBe(true);
      expect(p.price).toBeLessThan(100);
      expect(exactWays(p.purse, p.price)).toBeGreaterThan(0);
      // the whole purse is more than the price, so the child has to choose
      expect(p.purse.reduce((a, c) => a + c, 0)).toBeGreaterThan(p.price);
    }
  });

  it('too little and too much say by how much; the coins stay on the tray', () => {
    let s: ShopSave = blankShop(); // 7: purse 1,1,1,1,5,10
    expect(payShop(s).r).toBe('empty');
    s = moveCoin(s, 4, TRAY).s; // 5
    expect(payShop(s)).toMatchObject({ r: 'short', diff: 2 });
    s = moveCoin(s, 5, TRAY).s; // 15
    const over = payShop(s);
    expect(over).toMatchObject({ r: 'over', diff: 8 });
    expect(over.s.at).toEqual(s.at);
    s = moveCoin(s, 5, PURSE).s;
    s = moveCoin(moveCoin(s, 0, TRAY).s, 1, TRAY).s; // 5 + 1 + 1
    expect(paid(s)).toBe(7);
    const r = payShop(s);
    expect(r.r).toBe('right');
    expect(validShop(r.s)).toBe(true);
    expect(nextShop(r.s).index).toBe(1);
  });

  it('saves: a solved save whose tray is not the price is refused', () => {
    expect(validShop({ ...blankShop(), solved: true })).toBe(false);
    expect(readShop(() => JSON.stringify(blankShop())).kind).toBe('ok');
  });
});

describe('Balance Scale (R-1-1)', () => {
  it('the box is not always after "="; every unknown is a whole number the supply can make', () => {
    expect(BALANCE_PROBLEMS.map((p) => equation(p, false))).toEqual(['5 + 3 = □', '□ = 4 + 2', '5 + 3 = □ + 2', '6 + 4 = 7 + □', '□ + 5 = 9 + 3']);
    expect(BALANCE_PROBLEMS.filter((p) => p.left.includes('x')).length).toBeGreaterThanOrEqual(2);
    for (const p of BALANCE_PROBLEMS) {
      const u = unknownOf(p);
      expect(Number.isInteger(u) && u >= 1 && u <= SUPPLY).toBe(true);
      // independent check: put u blocks in the box and count both sides one by one
      const side = (t: (number | 'x')[]) => t.reduce<number>((n, x) => countOn(n, x === 'x' ? u : x), 0);
      expect(side(p.left)).toBe(side(p.right));
    }
    expect(BALANCE_PROBLEMS.map((p) => equation(p, true))).toEqual(['5 + 3 = 8', '6 = 4 + 2', '5 + 3 = 6 + 2', '6 + 4 = 7 + 3', '7 + 5 = 9 + 3']);
  });

  it('heavier side is told until level; level is accepted', () => {
    let s: BalanceSave = { ...blankBalance(), index: 2 }; // 5 + 3 = □ + 2
    expect(checkBalance(s).r).toBe('leftHeavy');
    for (let i = 0; i < 7; i++) s = moveBlock(s, i, PAN).s;
    expect(weights(s)).toEqual({ left: 8, right: 9 });
    expect(checkBalance(s).r).toBe('rightHeavy');
    s = moveBlock(s, 6, BIN).s;
    const r = checkBalance(s);
    expect(r.r).toBe('right');
    expect(validBalance(r.s)).toBe(true);
    expect(nextBalance(r.s).at.every((a) => a === BIN)).toBe(true);
  });

  it('saves: solved with the wrong number of blocks is refused', () => {
    expect(validBalance({ ...blankBalance(), solved: true })).toBe(false);
    expect(readBalance(() => JSON.stringify(blankBalance())).kind).toBe('ok');
  });
});

describe('batch A spoken prompts', () => {
  it('every clip the pages play has text', () => {
    const ids = [
      ...['task', 'ask', 'full', 'fill_first', 'not_all', 'again', 'where', 'done'].map((k) => `train_${k}`),
      ...TRAIN_PROBLEMS.map((p) => `train_right_${p.id.slice(-2)}`),
      ...['empty', 'short', 'over', 'where', 'done'].map((k) => `shop_${k}`),
      ...SHOP_PROBLEMS.flatMap((p) => [`shop_task_${p.id.slice(-2)}`, `shop_right_${p.id.slice(-2)}`]),
      ...['task', 'not_level', 'where', 'done'].map((k) => `balance_${k}`),
      ...BALANCE_PROBLEMS.map((p) => `balance_right_${p.id.slice(-2)}`),
    ];
    for (const id of ids) expect(CLIPS[id], id).toBeTruthy();
    expect(CLIPS.train_right_02).toBe('8 加 5，先湊成 10，再多 3，一共 13 人。');
    expect(CLIPS.balance_right_03).toBe('5 加 3 等於 6 加 2，兩邊一樣重。');
  });
});

describe('batch A audio files (Azure, made by James 2026-10-22)', () => {
  it('every train/shop/balance clip has its mp3 and the reviewed manifest has the same text and voice', () => {
    const dir = `public/math/audio/${VOICE.locale}/v${VOICE.version}`;
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { id: string; text: string; voice: string; file: string }[];
    const ids = Object.keys(CLIPS).filter((id) => /^(train|shop|balance)_/.test(id));
    expect(ids.length).toBe(37);
    for (const id of ids) {
      expect(existsSync(`${dir}/${id}.mp3`), id).toBe(true);
      const m = manifest.find((x) => x.id === id);
      expect(m?.text, id).toBe(CLIPS[id]);
      expect(m?.voice).toBe(VOICE.voice);
    }
  });
});

describe('pre-reader prompts audio (Azure, made by James 2026-10-22)', () => {
  it('menu, counting 1–10 and the number-card prompt all have their mp3 and the same text in the manifest', () => {
    const dir = `public/math/audio/${VOICE.locale}/v${VOICE.version}`;
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { id: string; text: string }[];
    const ids = Object.keys(CLIPS).filter((id) => /^(menu_|n_\d|apple_card$)/.test(id));
    expect(ids.length).toBe(20);
    for (const id of ids) {
      expect(existsSync(`${dir}/${id}.mp3`), id).toBe(true);
      expect(manifest.find((x) => x.id === id)?.text, id).toBe(CLIPS[id]);
    }
  });
});

