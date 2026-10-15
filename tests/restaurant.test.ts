import { describe, expect, it } from 'vitest';
import { CUSTOMERS, DISHES, ITEMS, dishCost, type DishId, type ItemId } from '../shared/restaurant/data';
import { apply, available, buyRows, inventoryValue, maxAlone, needs, newGame, separateVsCombined, suitable, validState, type Action, type State } from '../shared/restaurant/engine';

let n = 0;
const id = () => `a${++n}`;
type Op = Action extends infer A ? (A extends { id: string } ? Omit<A, 'id'> : never) : never;
function run(s: State, ...ops: Op[]): State {
  for (const op of ops) {
    const r = apply(s, { ...op, id: id() } as Action);
    if (r.error) throw new Error(`${op.t}: ${r.error}`);
    s = r.s;
  }
  return s;
}
const tryOp = (s: State, op: Op) => apply(s, { ...op, id: id() } as Action);
const suggested = (s: State) => Object.fromEntries(buyRows(s).map((r) => [r.item, r.suggested])) as Record<ItemId, number>;
const cost = (packs: Partial<Record<ItemId, number>>) => Object.entries(packs).reduce((v, [i, p]) => v + (p ?? 0) * ITEMS[i as ItemId].packPrice, 0);
const lot = (item: ItemId, qty: number, boughtDay = 1, lastDay: number | null = 7) => ({ item, qty, unitCost: ITEMS[item].packPrice / ITEMS[item].packSize, boughtDay, lastDay });

/** default day: buy suggested, make 3+3 in two batches, serve the six fixed customers with their favourite */
function baseline(sell = [true, true, true, true, true, true]) {
  let s = run(newGame(), { t: 'toBuy' });
  s = run(s, { t: 'purchase', packs: suggested(s) });
  s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 2 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 2 }, { t: 'openService' });
  for (const o of [0, 1, 2]) s = run(s, { t: 'serve', order: o, dish: sell[o] ? (o % 2 === 0 ? 'tomato_egg_rice' : 'vegetable_egg_rice') : null });
  s = run(s, { t: 'endBatch' }, { t: 'prepare', dish: 'tomato_egg_rice', qty: 1 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 }, { t: 'openService' });
  return s;
}

describe('recipes', () => {
  it('per-serving variable cost 19 / 20 / 21 and default prices', () => {
    expect([dishCost('tomato_egg_rice'), dishCost('vegetable_egg_rice'), dishCost('cheese_egg_toast')]).toEqual([19, 20, 21]);
    expect([DISHES.tomato_egg_rice.price, DISHES.vegetable_egg_rice.price, DISHES.cheese_egg_toast.price]).toEqual([32, 35, 30]);
  });
});

describe('RT01–RT14', () => {
  it('RT01 two rice dishes ×3, no stock: needs summed first, purchase 117', () => {
    const s = run(newGame(), { t: 'toBuy' });
    const nd = needs(s);
    expect([nd.rice, nd.egg, nd.tomato, nd.vegetable, nd.packaging, nd.bread, nd.cheese]).toEqual([6, 6, 3, 3, 6, 0, 0]);
    const p = suggested(s);
    expect(p).toMatchObject({ rice: 1, egg: 1, tomato: 1, vegetable: 1, packaging: 6, bread: 0, cheese: 0 });
    expect(cost(p)).toBe(117);
    expect(separateVsCombined(s)).toMatchObject({ separate: 201, combined: 117, extraValue: 84, extra: { rice: 6, egg: 6 } });
  });
  it('RT02 with rice 6 and eggs 2 in stock: no rice, one egg pack, 81; 2 eggs left after six servings', () => {
    let s = run(newGame({ lots: [lot('rice', 6), lot('egg', 2, 1, 3)] }), { t: 'toBuy' });
    const r = buyRows(s).find((x) => x.item === 'egg')!;
    expect(r).toMatchObject({ need: 6, have: 2, short: 4, suggested: 1 });
    expect(suggested(s).rice).toBe(0);
    expect(cost(suggested(s))).toBe(81);
    s = run(s, { t: 'purchase', packs: suggested(s) });
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 3 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 }, { t: 'openService' });
    for (const o of [0, 1, 2]) s = run(s, { t: 'serve', order: o, dish: o % 2 === 0 ? 'tomato_egg_rice' : 'vegetable_egg_rice' });
    s = run(s, { t: 'endBatch' }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 2 });
    expect(available(s).egg).toBe(2);
    expect(available(s).rice).toBe(0);
    // existing stock keeps its own cost (not free): the first servings used the stocked rice at 6 each
    expect(s.servings.filter((x) => x.dish === 'vegetable_egg_rice').every((x) => x.cost === 20)).toBe(true);
  });
  it('RT03 only 5 eggs: one short overall; the same eggs are not counted for each dish', () => {
    let s = run(newGame({ lots: [lot('rice', 6), lot('egg', 5, 1, 3), lot('tomato', 3, 1, 2), lot('vegetable', 3, 1, 1), lot('packaging', 6, 1, null)] }), { t: 'toBuy' });
    const egg = buyRows(s).find((r) => r.item === 'egg')!;
    expect(egg).toMatchObject({ need: 6, have: 5, short: 1, usedBy: ['tomato_egg_rice', 'vegetable_egg_rice'] });
    expect(maxAlone({ ...s, phase: 'prep' }, 'tomato_egg_rice')).toBe(3); // each dish alone could do 3 …
    s = run(s, { t: 'purchase', packs: {} });
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 3 }, { t: 'openService' });
    for (const o of [0, 1, 2]) s = run(s, { t: 'serve', order: o, dish: o === 1 ? null : 'tomato_egg_rice' });
    s = run(s, { t: 'endBatch' });
    // … but together only 5: two fried rice left, the third fails
    s = run(s, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 2 });
    expect(tryOp(s, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 }).error).toBe('missing');
  });
  it('RT04 preparing one tomato egg rice: each ingredient and packaging −1, serving +1 at cost 19, no cash change', () => {
    let s = run(newGame(), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: suggested(s) });
    const before = { ...available(s) },
      cash = s.cash;
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 1 });
    const after = available(s);
    for (const i of ['rice', 'egg', 'tomato', 'packaging'] as ItemId[]) expect(after[i]).toBe(before[i] - 1);
    expect(after.vegetable).toBe(before.vegetable);
    expect(s.servings).toHaveLength(1);
    expect(s.servings[0].cost).toBe(19);
    expect(s.cash).toBe(cash);
  });
  it('RT05 missing egg / packaging or full batch: the whole preparation is refused and nothing changes', () => {
    let s = run(newGame({ lots: [lot('rice', 6), lot('egg', 6, 1, 3), lot('tomato', 3, 1, 2), lot('vegetable', 3, 1, 1), lot('packaging', 1, 1, null)] }), { t: 'toBuy' }, { t: 'purchase', packs: {} });
    const r1 = tryOp(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 2 }); // only one box
    expect(r1.error).toBe('missing');
    expect(r1.s).toBe(s);
    s = run(newGame(), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: { ...suggested(s), packaging: 8 } });
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 3 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 });
    const r2 = tryOp(s, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 });
    expect(r2.error).toBe('batch_capacity');
    expect(r2.s.lots).toEqual(s.lots);
    expect(r2.s.servings).toEqual(s.servings);
    expect(r2.s.cash).toBe(s.cash);
  });
  it('RT06 changing the menu / cancelling planned servings recomputes needs; stock stays; servings are not undone', () => {
    let s = run(newGame(), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: suggested(s) });
    s = run(s, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 });
    const stock = available(s),
      cash = s.cash;
    s = run(s, { t: 'setPlan', dish: 'tomato_egg_rice', n: 0 });
    expect(needs(s).tomato).toBe(0);
    expect(needs(s).rice).toBe(2); // remaining fried rice only
    s = run(s, { t: 'setMenu', dish: 'vegetable_egg_rice', on: false });
    expect(needs(s).rice).toBe(0);
    expect(available(s)).toEqual(stock);
    expect(s.servings).toHaveLength(1);
    expect(s.cash).toBe(cash);
  });
  it('RT07 baseline all six sold: revenue 201, cost 117, result 34, cash 534; decoration → 414', () => {
    let s = baseline();
    for (const o of [3, 4, 5]) s = run(s, { t: 'serve', order: o, dish: o % 2 === 0 ? 'tomato_egg_rice' : 'vegetable_egg_rice' });
    s = run(s, { t: 'endBatch' });
    const r = s.results[0];
    expect(r).toMatchObject({ revenue: 201, cogs: 117, wasteCooked: 0, wasteRaw: 0, fixed: 50, result: 34, cashClose: 534, purchases: 117 });
    s = run(s, { t: 'decor', buy: true });
    expect(s.cash).toBe(414);
  });
  it('RT08 six made, two tomato + three fried rice sold: 169 / 98 / waste 19 / result 2 / cash 502', () => {
    // scenario: the fifth guest only wants toast today, so one tomato rice stays unsold
    const customers = CUSTOMERS.map((c, i) => (i === 4 ? { likes: 'cheese_egg_toast' as DishId, alsoAccepts: null, budget: 40 } : c));
    let s = run(newGame({ customers }), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: suggested(s) });
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 2 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 2 }, { t: 'openService' });
    for (const o of [0, 1, 2]) s = run(s, { t: 'serve', order: o, dish: o % 2 === 0 ? 'tomato_egg_rice' : 'vegetable_egg_rice' });
    s = run(s, { t: 'endBatch' }, { t: 'prepare', dish: 'tomato_egg_rice', qty: 1 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 }, { t: 'openService' });
    expect(tryOp(s, { t: 'serve', order: 4, dish: 'tomato_egg_rice' }).error).toBe('not_accepted');
    s = run(s, { t: 'serve', order: 3, dish: 'vegetable_egg_rice' }, { t: 'serve', order: 4, dish: null }, { t: 'serve', order: 5, dish: 'vegetable_egg_rice' }, { t: 'endBatch' });
    expect(s.results[0]).toMatchObject({ revenue: 169, cogs: 98, wasteCooked: 19, wasteRaw: 0, result: 2, cashClose: 502, wastedServings: 1 });
  });
  it('RT09 duplicate purchase 201, all sold, leftovers unexpired: leftover 84, cash 450, result still 34', () => {
    let s = run(newGame(), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: { rice: 2, egg: 2, tomato: 1, vegetable: 1, packaging: 6 } });
    expect(s.purchases).toBe(201);
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 2 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 2 }, { t: 'openService' });
    for (const o of [0, 1, 2]) s = run(s, { t: 'serve', order: o, dish: o % 2 === 0 ? 'tomato_egg_rice' : 'vegetable_egg_rice' });
    s = run(s, { t: 'endBatch' }, { t: 'prepare', dish: 'tomato_egg_rice', qty: 1 }, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 }, { t: 'openService' });
    for (const o of [3, 4, 5]) s = run(s, { t: 'serve', order: o, dish: o % 2 === 0 ? 'tomato_egg_rice' : 'vegetable_egg_rice' });
    s = run(s, { t: 'endBatch' });
    expect(s.results[0]).toMatchObject({ result: 34, cashClose: 450, inventoryValue: 84, wasteRaw: 0 });
    expect(inventoryValue(s)).toBe(84);
  });
  it('RT10 two lots with different last days: earliest used first; written off only after its last day closes', () => {
    // day 1: old eggs last day 1 (2 eggs) and new eggs last day 3
    let s = run(newGame({ lots: [lot('egg', 6, 1, 3), lot('egg', 2, 0, 1), lot('rice', 12), lot('tomato', 3, 1, 2), lot('packaging', 10, 1, null)], plan: { tomato_egg_rice: 1 } }), { t: 'toBuy' }, { t: 'purchase', packs: {} });
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 1 });
    const eggs = s.lots.filter((l) => l.item === 'egg');
    expect(eggs.find((l) => l.lastDay === 1)!.qty).toBe(1); // used from the earlier lot
    expect(eggs.find((l) => l.lastDay === 3)!.qty).toBe(6);
    s = run(s, { t: 'openService' });
    s = run(s, { t: 'serve', order: 0, dish: 'tomato_egg_rice' }, { t: 'serve', order: 1, dish: null }, { t: 'serve', order: 2, dish: null }, { t: 'endBatch' }, { t: 'openService' });
    for (const o of [3, 4, 5]) s = run(s, { t: 'serve', order: o, dish: null });
    s = run(s, { t: 'endBatch' });
    expect(s.results[0].wasteRaw).toBe(8 + 3 * 1 * 0); // the one remaining old egg (8)
    s = run(s, { t: 'decor', buy: false }, { t: 'nextDay' });
    expect(available(s).egg).toBe(6); // old lot gone; new lot usable on day 2
  });
  it('RT11 only toast on sale: customers 3 and 6 have no match; nobody is processed twice', () => {
    let s = run(newGame({ plan: { cheese_egg_toast: 4 } }), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: suggested(s) });
    s = run(s, { t: 'prepare', dish: 'cheese_egg_toast', qty: 3 }, { t: 'openService' });
    expect(suitable(s, 2)).toEqual([]);
    expect(tryOp(s, { t: 'serve', order: 2, dish: 'cheese_egg_toast' }).error).toBe('not_accepted');
    s = run(s, { t: 'serve', order: 0, dish: 'cheese_egg_toast' });
    expect(tryOp(s, { t: 'serve', order: 0, dish: 'cheese_egg_toast' }).error).toBe('handled');
    s = run(s, { t: 'serve', order: 1, dish: 'cheese_egg_toast' }, { t: 'serve', order: 2, dish: null });
    expect(s.orders[2]).toEqual({ status: 'no_match' });
    expect(s.revenue).toBe(60);
    expect(s.cash).toBe(500 - s.purchases + 60);
  });
  it('RT12 refresh after purchase / prepare / sale restores the same state; replayed actions apply once', () => {
    let s = run(newGame(), { t: 'toBuy' });
    const buy: Action = { id: 'buy-1', t: 'purchase', packs: suggested(s) };
    s = apply(s, buy).s;
    let re = JSON.parse(JSON.stringify(s)) as State;
    expect(validState(re)).toBe(true);
    const dup = apply(re, buy);
    expect(dup.duplicate).toBe(true);
    expect(dup.s.cash).toBe(500 - 117);
    const prep: Action = { id: 'prep-1', t: 'prepare', dish: 'tomato_egg_rice', qty: 2 };
    re = apply(re, prep).s;
    re = JSON.parse(JSON.stringify(re));
    re = apply(re, prep).s; // resent after reload
    expect(re.servings).toHaveLength(2);
    expect(re.madeToday).toBe(2);
    re = apply(re, { id: 'open-1', t: 'openService' }).s;
    const sale: Action = { id: 'sale-1', t: 'serve', order: 0, dish: 'tomato_egg_rice' };
    re = apply(re, sale).s;
    re = apply(JSON.parse(JSON.stringify(re)), sale).s;
    expect(re.revenue).toBe(32);
    expect(re.cash).toBe(500 - 117 + 32);
    expect(re.servings).toHaveLength(1);
  });
  it('RT13 baseline minus fried rice plus toast: needs re-summed, toast and cheese added, cancelled plan dropped', () => {
    let s = run(newGame(), { t: 'setMenu', dish: 'vegetable_egg_rice', on: false }, { t: 'setMenu', dish: 'cheese_egg_toast', on: true }, { t: 'setPlan', dish: 'cheese_egg_toast', n: 3 });
    const nd = needs(s);
    expect(nd).toMatchObject({ rice: 3, egg: 6, tomato: 3, vegetable: 0, bread: 3, cheese: 3, packaging: 6 });
    s = run(s, { t: 'toBuy' });
    expect(suggested(s)).toMatchObject({ rice: 1, egg: 1, tomato: 1, vegetable: 0, bread: 1, cheese: 1, packaging: 6 });
  });
  it('RT14 only 50 cash (fixed fee reserved): plan viewable and shrinkable; purchase refused with no partial charge', () => {
    let s = run(newGame({ cash: 50 }), { t: 'toBuy' });
    const r = tryOp(s, { t: 'purchase', packs: suggested(s) });
    expect(r.error).toBe('cash');
    expect(r.s.cash).toBe(50);
    expect(r.s.lots).toHaveLength(0);
    s = run(s, { t: 'toPlan' }, { t: 'setPlan', dish: 'tomato_egg_rice', n: 1 });
    expect(needs(s).tomato).toBe(1);
    // 130 cash: 117 would leave 13 < fixed 50 → refused
    const t = run(newGame({ cash: 130 }), { t: 'toBuy' });
    expect(tryOp(t, { t: 'purchase', packs: suggested(t) }).error).toBe('cash');
    expect(run(newGame({ cash: 167 }), { t: 'toBuy' }, { t: 'purchase', packs: { rice: 1, egg: 1, tomato: 1, vegetable: 1, packaging: 6 } }).cash).toBe(50);
  });
});

describe('capacity and rules', () => {
  it('day capacity 8 is not restored by waste; empty menu cannot open', () => {
    expect(tryOp(run(newGame({ menu: [], plan: {} })), { t: 'toBuy' }).error).toBe('empty_menu');
    let s = run(newGame({ plan: { tomato_egg_rice: 8 } }), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: { ...suggested(s), packaging: 10 } });
    s = run(s, { t: 'prepare', dish: 'tomato_egg_rice', qty: 4 }, { t: 'openService' });
    for (const o of [0, 1, 2]) s = run(s, { t: 'serve', order: o, dish: o === 1 ? null : 'tomato_egg_rice' });
    s = run(s, { t: 'endBatch' }, { t: 'prepare', dish: 'tomato_egg_rice', qty: 4 });
    expect(s.madeToday).toBe(8);
    expect(tryOp({ ...s, madeThisBatch: 0 }, { t: 'prepare', dish: 'tomato_egg_rice', qty: 1 }).error).toBe('day_capacity');
  });
  it('a customer cannot be given a dish they do not accept, even when their dish is sold out', () => {
    let s = run(newGame({ menu: ['tomato_egg_rice', 'vegetable_egg_rice'], plan: { tomato_egg_rice: 1, vegetable_egg_rice: 1 } }), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: suggested(s) });
    s = run(s, { t: 'prepare', dish: 'vegetable_egg_rice', qty: 1 }, { t: 'openService' });
    expect(tryOp(s, { t: 'serve', order: 0, dish: 'vegetable_egg_rice' }).error).toBe('not_accepted');
  });
  it('dish IDs cover the spec', () => {
    expect(Object.keys(DISHES).sort()).toEqual(['cheese_egg_toast', 'tomato_egg_rice', 'vegetable_egg_rice'] as DishId[]);
  });
});

describe('saved state validation (V2-08)', () => {
  it('accepts a real saved day and rejects damaged structures', () => {
    let s = run(newGame(), { t: 'toBuy' });
    s = run(s, { t: 'purchase', packs: suggested(s) });
    expect(validState(JSON.parse(JSON.stringify(s)))).toBe(true);
    const bad = (patch: Record<string, unknown>) => validState({ ...JSON.parse(JSON.stringify(s)), ...patch });
    expect(bad({ cash: -1 })).toBe(false);
    expect(bad({ phase: 'nope' })).toBe(false);
    expect(bad({ menu: ['pizza'] })).toBe(false);
    expect(bad({ lots: [{ id: 'x', item: 'egg', qty: 'many', unitCost: 8, boughtDay: 1, lastDay: 3 }] })).toBe(false);
    expect(bad({ orders: [] })).toBe(false);
    expect(bad({ plan: { tomato_egg_rice: 99, vegetable_egg_rice: 0, cheese_egg_toast: 0 } })).toBe(false);
    expect(validState(null)).toBe(false);
  });
});
