// Little Restaurant Owner — one-day rules core. Pure, serialisable, and idempotent: every action carries an id,
// and an id that was already applied is ignored, so a refresh / resend never charges, consumes or sells twice.
import { BATCH_CAPACITY, BATCH_ORDERS, CUSTOMERS, type Customer, DAY_CAPACITY, DECOR, DEFAULT_PLAN, DISHES, DISH_IDS, FIXED_FEE, ITEMS, ITEM_IDS, START_CASH, type DishId, type ItemId } from './data';

export const STATE_VERSION = 1;

export interface Lot {
  id: string;
  item: ItemId;
  qty: number;
  unitCost: number;
  boughtDay: number;
  /** last business day the lot may be used (inclusive); null = never expires */
  lastDay: number | null;
}
export interface Serving {
  id: string;
  dish: DishId;
  cost: number;
  day: number;
  batch: number;
}
export type OrderStatus = { status: 'pending' } | { status: 'sold'; dish: DishId; price: number; cost: number } | { status: 'no_match' };
export interface LedgerEntry {
  id: string;
  day: number;
  kind: 'purchase' | 'sale' | 'fixed' | 'decor';
  amount: number; // cash change (+ in, − out)
}
export interface DayResult {
  day: number;
  revenue: number;
  cogs: number;
  wasteCooked: number;
  wasteRaw: number;
  fixed: number;
  result: number;
  cashOpen: number;
  cashClose: number;
  purchases: number;
  soldCount: number;
  wastedServings: number;
  inventoryValue: number;
  decor: number;
}

export type Phase = 'plan' | 'buy' | 'prep' | 'serve' | 'closed' | 'done';

export interface State {
  version: number;
  /** V3 guided play (one guest at a time, cook on demand); absent = classic V2 day */
  mode?: 'guided';
  day: number;
  phase: Phase;
  batch: 1 | 2;
  cash: number;
  cashOpen: number;
  /** today's customers (fixed tutorial set unless a scenario says otherwise) */
  customers: Customer[];
  menu: DishId[];
  /** servings still planned (not yet prepared) per dish */
  plan: Record<DishId, number>;
  lots: Lot[];
  servings: Serving[];
  madeToday: number;
  madeThisBatch: number;
  orders: OrderStatus[];
  revenue: number;
  cogs: number;
  purchases: number;
  ledger: LedgerEntry[];
  results: DayResult[];
  decor: string[];
  applied: string[];
  seq: number;
}

export type Action =
  | { id: string; t: 'setMenu'; dish: DishId; on: boolean }
  | { id: string; t: 'setPlan'; dish: DishId; n: number }
  | { id: string; t: 'toBuy' }
  | { id: string; t: 'toPlan' }
  | { id: string; t: 'purchase'; packs: Partial<Record<ItemId, number>> }
  | { id: string; t: 'prepare'; dish: DishId; qty: number }
  | { id: string; t: 'openService' }
  | { id: string; t: 'serve'; order: number; dish: DishId | null }
  | { id: string; t: 'endBatch' }
  | { id: string; t: 'decor'; buy: boolean }
  | { id: string; t: 'nextDay' }
  // V3 guided (docs/product/RESTAURANT_PLAYFUL_V3.md §3, §6)
  | { id: string; t: 'gMenu'; dish: DishId; on: boolean }
  | { id: string; t: 'cook'; dish: DishId; items: ItemId[] };

export type ErrorCode =
  | 'wrong_phase'
  | 'empty_menu'
  | 'not_on_menu'
  | 'bad_qty'
  | 'cash'
  | 'batch_capacity'
  | 'day_capacity'
  | 'missing'
  | 'not_ready'
  | 'not_accepted'
  | 'over_budget'
  | 'has_match'
  | 'handled'
  | 'orders_pending'
  | 'bad_order'
  | 'menu_limit'
  | 'wrong_items'
  | 'wrong_mode';

export interface Initial {
  cash?: number;
  lots?: Omit<Lot, 'id'>[];
  menu?: DishId[];
  plan?: Partial<Record<DishId, number>>;
  day?: number;
  customers?: Customer[];
}

const zeroPlan = (): Record<DishId, number> => ({ tomato_egg_rice: 0, vegetable_egg_rice: 0, cheese_egg_toast: 0 });

export function newGame(init: Initial = {}): State {
  const plan = { ...zeroPlan(), ...(init.plan ?? DEFAULT_PLAN) };
  const menu = init.menu ?? DISH_IDS.filter((d) => plan[d] > 0);
  const cash = init.cash ?? START_CASH;
  return {
    version: STATE_VERSION,
    day: init.day ?? 1,
    phase: 'plan',
    batch: 1,
    cash,
    cashOpen: cash,
    customers: init.customers ?? CUSTOMERS,
    menu,
    plan,
    lots: (init.lots ?? []).map((l, k) => ({ ...l, id: `init-${k}` })),
    servings: [],
    madeToday: 0,
    madeThisBatch: 0,
    orders: (init.customers ?? CUSTOMERS).map(() => ({ status: 'pending' })),
    revenue: 0,
    cogs: 0,
    purchases: 0,
    ledger: [],
    results: [],
    decor: [],
    applied: [],
    seq: 0,
  };
}

/** Guided menus hold one or two dishes (picked on picture cards). */
export const GUIDED_MENU_MAX = 2;
export const GUIDED_DEFAULT_MENU: DishId[] = ['tomato_egg_rice', 'vegetable_egg_rice'];

/**
 * "Portions worked out for you": each fixed guest takes the listed affordable first choice, else the listed
 * affordable alternative, else nothing; the counts are summed per dish (purchase then rounds up per pack).
 */
export function allocate(customers: Customer[], menu: DishId[]): Record<DishId, number> {
  const plan = zeroPlan();
  for (const c of customers) {
    const ok = (d: DishId | null): d is DishId => !!d && menu.includes(d) && DISHES[d].price <= c.budget;
    const d = ok(c.likes) ? c.likes : ok(c.alsoAccepts) ? c.alsoAccepts : null;
    if (d) plan[d]++;
  }
  return plan;
}

/** A new guided (V3) day: the two rice dishes are pre-picked and portions are worked out from the guests. */
export function newGuided(init: Initial = {}): State {
  const customers = init.customers ?? CUSTOMERS;
  const menu = init.menu ?? GUIDED_DEFAULT_MENU;
  return { ...newGame({ ...init, menu, plan: allocate(customers, menu) }), mode: 'guided', menu };
}

/** Ingredients the child places in the pan for one serving (packaging is added by the shop, still costed). */
export const panItems = (d: DishId): ItemId[] => (Object.keys(DISHES[d].recipe) as ItemId[]).filter((i) => i !== 'packaging');

// ---------- derived values ----------

/** Raw stock usable today (not expired), per item. */
export function available(s: State): Record<ItemId, number> {
  const a = Object.fromEntries(ITEM_IDS.map((i) => [i, 0])) as Record<ItemId, number>;
  for (const l of s.lots) if (l.lastDay === null || l.lastDay >= s.day) a[l.item] += l.qty;
  return a;
}

/** Total raw needs of all planned (not yet prepared) servings on the menu — summed before any purchase. */
export function needs(s: State): Record<ItemId, number> {
  const n = Object.fromEntries(ITEM_IDS.map((i) => [i, 0])) as Record<ItemId, number>;
  for (const d of s.menu) for (const [i, q] of Object.entries(DISHES[d].recipe)) n[i as ItemId] += (q ?? 0) * s.plan[d];
  return n;
}

export interface BuyRow {
  item: ItemId;
  need: number;
  have: number;
  short: number;
  packSize: number;
  suggested: number;
  /** dishes on the plan that use this item */
  usedBy: DishId[];
}
export function buyRows(s: State): BuyRow[] {
  const n = needs(s),
    a = available(s);
  return ITEM_IDS.map((item) => {
    const short = Math.max(0, n[item] - a[item]);
    return {
      item,
      need: n[item],
      have: a[item],
      short,
      packSize: ITEMS[item].packSize,
      suggested: Math.ceil(short / ITEMS[item].packSize),
      usedBy: s.menu.filter((d) => s.plan[d] > 0 && (DISHES[d].recipe[item] ?? 0) > 0),
    };
  });
}

export const packsCost = (packs: Partial<Record<ItemId, number>>) => ITEM_IDS.reduce((sum, i) => sum + Math.max(0, Math.floor(packs[i] ?? 0)) * ITEMS[i].packPrice, 0);

/** Teaching contrast: buying whole packs separately for each dish (ignores stock), vs combined. */
export function separateVsCombined(s: State) {
  let separate = 0;
  const extra: Partial<Record<ItemId, number>> = {};
  for (const d of s.menu) {
    if (!s.plan[d]) continue;
    for (const [i, q] of Object.entries(DISHES[d].recipe)) {
      const need = (q ?? 0) * s.plan[d];
      separate += Math.ceil(need / ITEMS[i as ItemId].packSize) * ITEMS[i as ItemId].packPrice;
    }
  }
  const n = needs(s);
  let combined = 0;
  for (const i of ITEM_IDS) combined += Math.ceil(n[i] / ITEMS[i].packSize) * ITEMS[i].packPrice;
  for (const i of ITEM_IDS) {
    let sepUnits = 0;
    for (const d of s.menu) if (s.plan[d]) sepUnits += Math.ceil(((DISHES[d].recipe[i] ?? 0) * s.plan[d]) / ITEMS[i].packSize) * ITEMS[i].packSize;
    const combUnits = Math.ceil(n[i] / ITEMS[i].packSize) * ITEMS[i].packSize;
    if (sepUnits > combUnits) extra[i] = sepUnits - combUnits;
  }
  const extraValue = Object.entries(extra).reduce((v, [i, q]) => v + (q ?? 0) * (ITEMS[i as ItemId].packPrice / ITEMS[i as ItemId].packSize), 0);
  return { separate, combined, extra, extraValue };
}

/** How many of one dish could be made alone right now (raw stock + capacity). Not additive across dishes. */
export function maxAlone(s: State, d: DishId): number {
  const a = available(s);
  let m = Math.min(BATCH_CAPACITY - s.madeThisBatch, DAY_CAPACITY - s.madeToday);
  for (const [i, q] of Object.entries(DISHES[d].recipe)) m = Math.min(m, Math.floor(a[i as ItemId] / (q ?? 1)));
  return Math.max(0, m);
}

export const readyCount = (s: State, d: DishId) => s.servings.filter((x) => x.dish === d).length;
export const inventoryValue = (s: State) => s.lots.filter((l) => l.lastDay === null || l.lastDay >= s.day).reduce((v, l) => v + l.qty * l.unitCost, 0);
export const currentOrders = (s: State) => BATCH_ORDERS[s.batch - 1];

/** Accepted dishes for this guest that can still be cooked now (menu, budget, stock, capacity). */
export function cookable(s: State, order: number): DishId[] {
  const c = s.customers[order];
  return [c.likes, c.alsoAccepts].filter((d): d is DishId => !!d && s.menu.includes(d) && DISHES[d].price <= c.budget && maxAlone(s, d) > 0);
}

/** Dishes this customer could be served now (ready, on the menu, accepted, within budget). */
export function suitable(s: State, order: number): DishId[] {
  const c = s.customers[order];
  return [c.likes, c.alsoAccepts].filter((d): d is DishId => !!d && s.menu.includes(d) && readyCount(s, d) > 0 && DISHES[d].price <= c.budget);
}

// ---------- reducer ----------

export interface Outcome {
  s: State;
  error?: ErrorCode;
  /** true when the action id had already been applied (nothing changed) */
  duplicate?: boolean;
}

export function apply(s: State, a: Action): Outcome {
  if (s.applied.includes(a.id)) return { s, duplicate: true };
  const r = reduce(s, a);
  if (r.error) return { s, error: r.error };
  const next = r.s;
  return { s: { ...next, applied: [...next.applied, a.id].slice(-500), seq: next.seq + 1 } };
}

function reduce(s: State, a: Action): { s: State; error?: ErrorCode } {
  const err = (e: ErrorCode) => ({ s, error: e });
  const editable = s.phase === 'plan' || s.phase === 'buy' || s.phase === 'prep';
  switch (a.t) {
    case 'setMenu': {
      if (s.mode === 'guided') return err('wrong_mode');
      if (!editable) return err('wrong_phase');
      const menu = a.on ? (s.menu.includes(a.dish) ? s.menu : DISH_IDS.filter((d) => d === a.dish || s.menu.includes(d))) : s.menu.filter((d) => d !== a.dish);
      const plan = a.on ? s.plan : { ...s.plan, [a.dish]: 0 };
      return { s: { ...s, menu, plan } };
    }
    case 'setPlan': {
      if (s.mode === 'guided') return err('wrong_mode');
      if (!editable) return err('wrong_phase');
      if (!Number.isInteger(a.n) || a.n < 0 || a.n > DAY_CAPACITY) return err('bad_qty');
      if (a.n > 0 && !s.menu.includes(a.dish)) return err('not_on_menu');
      return { s: { ...s, plan: { ...s.plan, [a.dish]: a.n } } };
    }
    case 'toBuy':
      if (s.phase !== 'plan') return err('wrong_phase');
      if (!s.menu.length) return err('empty_menu');
      return { s: { ...s, phase: 'buy' } };
    case 'toPlan':
      if (s.phase !== 'buy') return err('wrong_phase');
      return { s: { ...s, phase: 'plan' } };
    case 'purchase': {
      if (s.phase !== 'buy') return err('wrong_phase');
      if (!s.menu.length) return err('empty_menu');
      const packs = Object.fromEntries(ITEM_IDS.map((i) => [i, Math.floor(a.packs[i] ?? 0)])) as Record<ItemId, number>;
      if (ITEM_IDS.some((i) => packs[i] < 0 || packs[i] > 50)) return err('bad_qty');
      const total = packsCost(packs);
      // today's fixed fee stays reserved; cash never goes negative and nothing is partly charged
      if (total > s.cash - FIXED_FEE) return err('cash');
      const lots = [...s.lots];
      for (const i of ITEM_IDS)
        if (packs[i] > 0) {
          const it = ITEMS[i];
          lots.push({ id: `${a.id}-${i}`, item: i, qty: packs[i] * it.packSize, unitCost: it.packPrice / it.packSize, boughtDay: s.day, lastDay: it.shelfDays === null ? null : s.day + it.shelfDays - 1 });
        }
      const ledger = total ? [...s.ledger, { id: a.id, day: s.day, kind: 'purchase' as const, amount: -total }] : s.ledger;
      // guided play opens the shop straight away: the first guest is at the counter and cooking happens per order
      return { s: { ...s, phase: s.mode === 'guided' ? 'serve' : 'prep', batch: 1, madeThisBatch: 0, cash: s.cash - total, purchases: s.purchases + total, lots, ledger } };
    }
    case 'prepare': {
      if (s.mode === 'guided') return err('wrong_mode');
      if (s.phase !== 'prep') return err('wrong_phase');
      if (!s.menu.includes(a.dish)) return err('not_on_menu');
      if (!Number.isInteger(a.qty) || a.qty < 1) return err('bad_qty');
      if (s.madeThisBatch + a.qty > BATCH_CAPACITY) return err('batch_capacity');
      if (s.madeToday + a.qty > DAY_CAPACITY) return err('day_capacity');
      // check everything first; only then consume (all-or-nothing)
      const avail = available(s);
      for (const [i, q] of Object.entries(DISHES[a.dish].recipe)) if (avail[i as ItemId] < (q ?? 0) * a.qty) return err('missing');
      return { s: consume(s, a.dish, a.qty, a.id) };
    }
    case 'cook': {
      // guided: cook one serving while guests are being served; same recipe, stock and cost as classic prep
      if (s.mode !== 'guided') return err('wrong_mode');
      if (s.phase !== 'serve') return err('wrong_phase');
      if (!s.menu.includes(a.dish)) return err('not_on_menu');
      const want = panItems(a.dish);
      const got = [...new Set(a.items)];
      if (got.length !== a.items.length || got.length !== want.length || !want.every((i) => got.includes(i))) return err('wrong_items');
      if (s.madeThisBatch + 1 > BATCH_CAPACITY) return err('batch_capacity');
      if (s.madeToday + 1 > DAY_CAPACITY) return err('day_capacity');
      const avail = available(s);
      for (const [i, q] of Object.entries(DISHES[a.dish].recipe)) if (avail[i as ItemId] < (q ?? 0)) return err('missing');
      return { s: consume(s, a.dish, 1, a.id) };
    }
    case 'gMenu': {
      if (s.mode !== 'guided') return err('wrong_mode');
      if (s.phase !== 'plan') return err('wrong_phase');
      const on = s.menu.includes(a.dish);
      if (a.on === on) return { s };
      if (a.on && s.menu.length >= GUIDED_MENU_MAX) return err('menu_limit');
      const menu = a.on ? DISH_IDS.filter((d) => d === a.dish || s.menu.includes(d)) : s.menu.filter((d) => d !== a.dish);
      return { s: { ...s, menu, plan: allocate(s.customers, menu) } };
    }
    case 'openService':
      if (s.mode === 'guided') return err('wrong_mode');
      if (s.phase !== 'prep') return err('wrong_phase');
      return { s: { ...s, phase: 'serve' } };
    case 'serve': {
      if (s.phase !== 'serve') return err('wrong_phase');
      if (!currentOrders(s).includes(a.order)) return err('bad_order');
      if (s.orders[a.order].status !== 'pending') return err('handled');
      const c = s.customers[a.order];
      const orders = [...s.orders];
      if (a.dish === null) {
        if (suitable(s, a.order).length) return err('has_match');
        // guided: "Not available today" only when nothing acceptable can still be cooked
        if (s.mode === 'guided' && cookable(s, a.order).length) return err('has_match');
        orders[a.order] = { status: 'no_match' };
        return { s: advance({ ...s, orders }, a.id) };
      }
      if (!s.menu.includes(a.dish)) return err('not_on_menu');
      if (a.dish !== c.likes && a.dish !== c.alsoAccepts) return err('not_accepted');
      if (DISHES[a.dish].price > c.budget) return err('over_budget');
      const idx = s.servings.findIndex((x) => x.dish === a.dish);
      if (idx < 0) return err('not_ready');
      const sv = s.servings[idx];
      const price = DISHES[a.dish].price;
      orders[a.order] = { status: 'sold', dish: a.dish, price, cost: sv.cost };
      return {
        s: advance({
          ...s,
          orders,
          servings: s.servings.filter((_, k) => k !== idx),
          cash: s.cash + price,
          revenue: s.revenue + price,
          cogs: s.cogs + sv.cost,
          ledger: [...s.ledger, { id: a.id, day: s.day, kind: 'sale', amount: price }],
        }, a.id),
      };
    }
    case 'endBatch': {
      if (s.mode === 'guided') return err('wrong_mode');
      if (s.phase !== 'serve') return err('wrong_phase');
      if (currentOrders(s).some((o) => s.orders[o].status === 'pending')) return err('orders_pending');
      if (s.batch === 1) return { s: { ...s, phase: 'prep', batch: 2, madeThisBatch: 0 } };
      return { s: close(s, a.id) };
    }
    case 'decor': {
      if (s.phase !== 'closed') return err('wrong_phase');
      if (!a.buy) return { s: { ...s, phase: 'done' } };
      if (s.cash < DECOR.price) return err('cash');
      const results = s.results.map((r) => (r.day === s.day ? { ...r, decor: DECOR.price } : r));
      return { s: { ...s, phase: 'done', cash: s.cash - DECOR.price, decor: [...s.decor, DECOR.id], results, ledger: [...s.ledger, { id: a.id, day: s.day, kind: 'decor', amount: -DECOR.price }] } };
    }
    case 'nextDay': {
      if (s.phase !== 'done') return err('wrong_phase');
      return {
        s: {
          ...s,
          day: s.day + 1,
          phase: 'plan',
          batch: 1,
          cashOpen: s.cash,
          madeToday: 0,
          madeThisBatch: 0,
          orders: s.customers.map(() => ({ status: 'pending' as const })),
          revenue: 0,
          cogs: 0,
          purchases: 0,
          plan: zeroPlan(),
        },
      };
    }
  }
}

/** Uses one serving's ingredients (first-expiring usable lot first, never-expiring last, then oldest). */
function consume(s: State, dish: DishId, qty: number, id: string): State {
  const lots = s.lots.map((l) => ({ ...l }));
  const servings = [...s.servings];
  for (let k = 0; k < qty; k++) {
    let cost = 0;
    for (const [i, q] of Object.entries(DISHES[dish].recipe)) {
      let left = q ?? 0;
      const usable = lots
        .filter((l) => l.item === i && l.qty > 0 && (l.lastDay === null || l.lastDay >= s.day))
        .sort((x, y) => (x.lastDay ?? Infinity) - (y.lastDay ?? Infinity) || x.boughtDay - y.boughtDay);
      for (const l of usable) {
        if (!left) break;
        const take = Math.min(left, l.qty);
        l.qty -= take;
        left -= take;
        cost += take * l.unitCost;
      }
    }
    servings.push({ id: `${id}-${k}`, dish, cost, day: s.day, batch: s.batch });
  }
  return {
    ...s,
    lots: lots.filter((l) => l.qty > 0),
    servings,
    madeToday: s.madeToday + qty,
    madeThisBatch: s.madeThisBatch + qty,
    plan: { ...s.plan, [dish]: Math.max(0, s.plan[dish] - qty) },
  };
}

/**
 * Guided play moves on by itself once every guest of the current group is handled (sold or "not today"):
 * guests 1–3 → 4–6 (a fresh cooking capacity of 4) → closing. Never driven by animation time.
 */
function advance(s: State, id: string): State {
  if (s.mode !== 'guided') return s;
  if (currentOrders(s).some((o) => s.orders[o].status === 'pending')) return s;
  if (s.batch === 1) return { ...s, batch: 2, madeThisBatch: 0 };
  return close(s, `${id}-close`);
}

/** Closing: unsold cooked servings and raw lots past their last day are written off; fixed fee is paid. */
function close(s: State, id: string): State {
  const wasteCooked = s.servings.filter((x) => x.day <= s.day).reduce((v, x) => v + x.cost, 0);
  const wastedServings = s.servings.length;
  const expired = s.lots.filter((l) => l.lastDay !== null && l.lastDay <= s.day);
  const wasteRaw = expired.reduce((v, l) => v + l.qty * l.unitCost, 0);
  const lots = s.lots.filter((l) => !(l.lastDay !== null && l.lastDay <= s.day));
  const cash = s.cash - FIXED_FEE;
  const result = s.revenue - s.cogs - wasteCooked - wasteRaw - FIXED_FEE;
  const r: DayResult = {
    day: s.day,
    revenue: s.revenue,
    cogs: s.cogs,
    wasteCooked,
    wasteRaw,
    fixed: FIXED_FEE,
    result,
    cashOpen: s.cashOpen,
    cashClose: cash,
    purchases: s.purchases,
    soldCount: s.orders.filter((o) => o.status === 'sold').length,
    wastedServings,
    inventoryValue: lots.reduce((v, l) => v + l.qty * l.unitCost, 0),
    decor: 0,
  };
  return { ...s, phase: 'closed', servings: [], lots, cash, results: [...s.results, r], ledger: [...s.ledger, { id, day: s.day, kind: 'fixed', amount: -FIXED_FEE }] };
}

/** Full structural check of a saved state (anything off → treated as unreadable, never half-loaded). */
export function validState(x: unknown): x is State {
  const s = x as State;
  const num = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;
  const int = (v: unknown, min = 0, max = Infinity) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  const dish = (d: unknown) => DISH_IDS.includes(d as DishId);
  const item = (i: unknown) => ITEM_IDS.includes(i as ItemId);
  try {
    return (
      !!s &&
      s.version === STATE_VERSION &&
      (s.mode === undefined || s.mode === 'guided') &&
      int(s.day, 1) &&
      ['plan', 'buy', 'prep', 'serve', 'closed', 'done'].includes(s.phase) &&
      (s.batch === 1 || s.batch === 2) &&
      num(s.cash) &&
      num(s.cashOpen) &&
      Array.isArray(s.menu) &&
      s.menu.every(dish) &&
      new Set(s.menu).size === s.menu.length &&
      !!s.plan &&
      DISH_IDS.every((d) => int(s.plan[d], 0, DAY_CAPACITY)) &&
      Array.isArray(s.lots) &&
      s.lots.every((l) => typeof l.id === 'string' && item(l.item) && int(l.qty, 1) && num(l.unitCost) && int(l.boughtDay) && (l.lastDay === null || int(l.lastDay))) &&
      Array.isArray(s.servings) &&
      s.servings.every((v) => typeof v.id === 'string' && dish(v.dish) && num(v.cost) && int(v.day, 1)) &&
      int(s.madeToday, 0, DAY_CAPACITY) &&
      int(s.madeThisBatch, 0, BATCH_CAPACITY) &&
      Array.isArray(s.customers) &&
      s.customers.length === BATCH_ORDERS.flat().length &&
      s.customers.every((c) => dish(c.likes) && (c.alsoAccepts === null || dish(c.alsoAccepts)) && num(c.budget)) &&
      Array.isArray(s.orders) &&
      s.orders.length === s.customers.length &&
      s.orders.every((o) => o.status === 'pending' || o.status === 'no_match' || (o.status === 'sold' && dish(o.dish) && num(o.price) && num(o.cost))) &&
      num(s.revenue) &&
      num(s.cogs) &&
      num(s.purchases) &&
      Array.isArray(s.ledger) &&
      Array.isArray(s.results) &&
      Array.isArray(s.decor) &&
      Array.isArray(s.applied) &&
      s.applied.every((a) => typeof a === 'string') &&
      int(s.seq)
    );
  } catch {
    return false;
  }
}
