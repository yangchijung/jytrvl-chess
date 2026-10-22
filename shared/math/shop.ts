// Math Island batch A — Coin Shop (零錢小商店), grades 1–2 (N-1-4 1, 5, 10, 50 and 100 dollars; N-2-5).
// A customer wants one thing; the child moves New Taiwan dollar coins from the purse onto the tray to pay the
// exact price, then presses "pay". The tray is the answer: too little / too much is told by how much, and the
// coins stay where the child put them. Every problem's purse can pay the price exactly. Pure and deterministic.
import { readWith, validBase, type Read } from './common';

export const COINS = [1, 5, 10, 50] as const;
export type Coin = (typeof COINS)[number];

export interface ShopProblem {
  id: string;
  /** what is bought (shown and spoken in Chinese) */
  item: string;
  price: number;
  /** the coins in the purse, smallest first */
  purse: Coin[];
}

const purse = (n1: number, n5: number, n10: number, n50 = 0): Coin[] => [...Array<Coin>(n1).fill(1), ...Array<Coin>(n5).fill(5), ...Array<Coin>(n10).fill(10), ...Array<Coin>(n50).fill(50)];

/** Five fixed problems: prices under 100, from 1s and 5s up to a 50 coin. */
export const SHOP_PROBLEMS: readonly ShopProblem[] = [
  { id: 'g1-shop-01', item: '鉛筆', price: 7, purse: purse(4, 1, 1) },
  { id: 'g1-shop-02', item: '橡皮擦', price: 12, purse: purse(3, 2, 1) },
  { id: 'g1-shop-03', item: '果汁', price: 25, purse: purse(2, 3, 2) },
  { id: 'g1-shop-04', item: '筆記本', price: 36, purse: purse(3, 2, 3) },
  { id: 'g1-shop-05', item: '彩色筆', price: 60, purse: purse(2, 2, 3, 1) },
];
/** where one coin is: -1 purse, 0 tray */
export const PURSE = -1;
export const TRAY = 0;

export interface ShopSave {
  schemaVersion: 1;
  game: 'shop';
  index: number;
  at: number[];
  solved: boolean;
  done: string[];
  voice: boolean;
}
export const SHOP_KEY = 'jy.math.shop.v1';

const fresh = (p: ShopProblem) => Array<number>(p.purse.length).fill(PURSE);
export const blankShop = (voice = true): ShopSave => ({ schemaVersion: 1, game: 'shop', index: 0, at: fresh(SHOP_PROBLEMS[0]), solved: false, done: [], voice });
export const finishedS = (s: ShopSave) => s.index >= SHOP_PROBLEMS.length;
export const problemOfS = (s: ShopSave): ShopProblem | null => SHOP_PROBLEMS[s.index] ?? null;

/** what is on the tray, added up coin by coin */
export function paid(s: ShopSave): number {
  const p = problemOfS(s);
  if (!p) return 0;
  let sum = 0;
  s.at.forEach((x, i) => {
    if (x === TRAY) sum += p.purse[i];
  });
  return sum;
}

export type SResult = 'moved' | 'same' | 'locked' | 'ignored' | 'empty' | 'short' | 'over' | 'right';

export function moveCoin(s: ShopSave, i: number, to: number): { s: ShopSave; r: SResult } {
  if (!problemOfS(s) || s.solved) return { s, r: 'locked' };
  if (!Number.isInteger(i) || i < 0 || i >= s.at.length || (to !== PURSE && to !== TRAY)) return { s, r: 'ignored' };
  if (s.at[i] === to) return { s, r: 'same' };
  const at = s.at.slice();
  at[i] = to;
  return { s: { ...s, at }, r: 'moved' };
}

/** Pay: the tray must hold exactly the price. `diff` is how much is missing (short) or extra (over). */
export function payShop(s: ShopSave): { s: ShopSave; r: SResult; diff: number } {
  const p = problemOfS(s);
  if (!p || s.solved) return { s, r: 'locked', diff: 0 };
  const v = paid(s);
  if (v === 0) return { s, r: 'empty', diff: p.price };
  if (v < p.price) return { s, r: 'short', diff: p.price - v };
  if (v > p.price) return { s, r: 'over', diff: v - p.price };
  return { s: { ...s, solved: true, done: s.done.includes(p.id) ? s.done : [...s.done, p.id] }, r: 'right', diff: 0 };
}

export function restartShop(s: ShopSave): ShopSave {
  const p = problemOfS(s);
  return p ? { ...s, at: fresh(p), solved: false, done: s.done.filter((d) => d !== p.id) } : s;
}
export function nextShop(s: ShopSave): ShopSave {
  if (!s.solved || finishedS(s)) return s;
  const index = s.index + 1;
  const p = SHOP_PROBLEMS[index];
  return { ...s, index, at: p ? fresh(p) : [], solved: false };
}
export const playAgainS = (s: ShopSave): ShopSave => blankShop(s.voice);

export function validShop(x: unknown): x is ShopSave {
  if (!validBase(x, 'shop', SHOP_PROBLEMS.length)) return false;
  if (!x.done.every((d) => SHOP_PROBLEMS.some((p) => p.id === d))) return false;
  const p = SHOP_PROBLEMS[x.index];
  if (!p) return true;
  if (x.at.length !== p.purse.length || !x.at.every((a) => a === PURSE || a === TRAY)) return false;
  if (x.solved && paid(x as ShopSave) !== p.price) return false;
  return true;
}
export const readShop = (get: () => string | null): Read<ShopSave> => readWith(get, validShop);
