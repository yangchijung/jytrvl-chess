import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISHES, type DishId } from '../shared/restaurant/data';
import { allocate, apply, available, buyRows, cookable, newGame, newGuided, packsCost, panItems, separateVsCombined, validState, type Action, type State } from '../shared/restaurant/engine';

let n = 0;
type Op = Action extends infer A ? (A extends { id: string } ? Omit<A, 'id'> : never) : never;
const act = (s: State, a: Op) => apply(s, { id: `t${n++}`, ...a } as Action);
const ok = (s: State, a: Op) => {
  const r = act(s, a);
  expect(r.error).toBeUndefined();
  return r.s;
};
const buyAll = (s: State) => {
  s = ok(s, { t: 'toBuy' });
  const packs = Object.fromEntries(buyRows(s).map((r) => [r.item, r.suggested]));
  return { s: ok(s, { t: 'purchase', packs }), cost: packsCost(packs) };
};
/** Plays a whole guided day: each guest gets an accepted dish cooked on demand (first choice first). */
function playDay(start: State) {
  let s = start;
  for (let guard = 0; s.phase === 'serve' && guard < 50; guard++) {
    const o = [0, 1, 2, 3, 4, 5].find((k) => s.orders[k].status === 'pending' && (k < 3 ? s.batch === 1 : s.batch === 2))!;
    const c = s.customers[o];
    const want = [c.likes, c.alsoAccepts].find((d) => d && s.menu.includes(d) && s.servings.some((x) => x.dish === d)) ?? null;
    if (want) {
      s = ok(s, { t: 'serve', order: o, dish: want });
      continue;
    }
    const can = cookable(s, o);
    if (can.length) s = ok(s, { t: 'cook', dish: can[0], items: panItems(can[0]) });
    else s = ok(s, { t: 'serve', order: o, dish: null });
  }
  return s;
}

describe('restaurant V3 guided play', () => {
  const cases = JSON.parse(readFileSync('docs/product/restaurant-v3-cases.json', 'utf8')).cases as { id: string; menu: DishId[]; plan: Record<DishId, number>; expected: Record<string, number> }[];

  it('R3-01/R3-04: portions are worked out from the six guests and the menu; the product cases give the same numbers', () => {
    for (const c of cases) {
      let s = newGuided({ menu: c.menu });
      expect(s.plan).toEqual(c.plan);
      const b = buyAll(s);
      expect(b.cost).toBe(c.expected.purchase);
      s = playDay(b.s);
      expect(s.phase).toBe('closed');
      const r = s.results[0];
      expect({ sold: r.soldCount, revenue: r.revenue, cogs: r.cogs, waste: r.wasteCooked + r.wasteRaw, result: r.result, cashClose: r.cashClose }).toEqual({
        sold: c.expected.sold,
        revenue: c.expected.revenue,
        cogs: c.expected.cogs,
        waste: c.expected.waste,
        result: c.expected.result,
        cashClose: c.expected.cashClose,
      });
      expect(r.inventoryValue).toBe(c.expected.inventoryValue);
      if (c.expected.cashAfterPlant) expect(ok(s, { t: 'decor', buy: true }).cash).toBe(c.expected.cashAfterPlant);
    }
  });

  it('R3-01: menu holds 1–2 dishes; a third asks first; removing a dish recomputes the plan; nothing is typed', () => {
    let s = newGuided();
    expect(s.menu).toEqual(['tomato_egg_rice', 'vegetable_egg_rice']);
    expect(act(s, { t: 'gMenu', dish: 'cheese_egg_toast', on: true }).error).toBe('menu_limit');
    s = ok(s, { t: 'gMenu', dish: 'vegetable_egg_rice', on: false });
    expect(s.plan).toEqual({ tomato_egg_rice: 3, vegetable_egg_rice: 0, cheese_egg_toast: 0 });
    s = ok(s, { t: 'gMenu', dish: 'cheese_egg_toast', on: true });
    expect(s.plan).toEqual({ tomato_egg_rice: 3, vegetable_egg_rice: 0, cheese_egg_toast: 2 });
    expect(act(s, { t: 'setPlan', dish: 'tomato_egg_rice', n: 5 }).error).toBe('wrong_mode'); // classic-only controls
    expect(allocate(s.customers, [])).toEqual({ tomato_egg_rice: 0, vegetable_egg_rice: 0, cheese_egg_toast: 0 });
  });

  it('R3-03: the two rice dishes share one box of eggs (6 → 5 → 4); buying together 117 vs separately 201', () => {
    let s = newGuided();
    expect(separateVsCombined(s)).toMatchObject({ separate: 201, combined: 117 });
    s = buyAll(s).s;
    expect(s.phase).toBe('serve'); // guided: straight to the first guest
    expect(available(s).egg).toBe(6);
    s = ok(s, { t: 'cook', dish: 'tomato_egg_rice', items: ['tomato', 'egg', 'rice'] }); // any order
    expect(available(s).egg).toBe(5);
    s = ok(s, { t: 'cook', dish: 'vegetable_egg_rice', items: ['rice', 'egg', 'vegetable'] });
    expect(available(s).egg).toBe(4);
    expect(s.lots.filter((l) => l.item === 'egg')).toHaveLength(1);
  });

  it('R3-02: wrong ingredients and missing stock are refused whole; a wrong dish is not paid and stays on the plate', () => {
    let s = buyAll(newGuided({ menu: ['tomato_egg_rice'] })).s;
    expect(act(s, { t: 'cook', dish: 'tomato_egg_rice', items: ['rice', 'egg'] }).error).toBe('wrong_items');
    expect(act(s, { t: 'cook', dish: 'tomato_egg_rice', items: ['rice', 'egg', 'vegetable'] }).error).toBe('wrong_items');
    expect(act(s, { t: 'cook', dish: 'tomato_egg_rice', items: ['rice', 'egg', 'egg'] }).error).toBe('wrong_items');
    expect(act(s, { t: 'cook', dish: 'vegetable_egg_rice', items: ['rice', 'egg', 'vegetable'] }).error).toBe('not_on_menu');
    // run the tomatoes out (3 bought), then a 4th cook is refused without using any rice or egg
    for (let k = 0; k < 3; k++) s = ok(s, { t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    const before = available(s);
    expect(before.tomato).toBe(0);
    expect(act(s, { t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') }).error).toBe('missing');
    expect(available(s)).toEqual(before);
    // guest 2 (wants vegetable rice or toast, neither listed): no match allowed only because nothing acceptable can be cooked
    s = ok(s, { t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(act(s, { t: 'serve', order: 1, dish: 'tomato_egg_rice' }).error).toBe('not_accepted');
    expect(s.servings).toHaveLength(2); // the dish stays for a later guest
    s = ok(s, { t: 'serve', order: 1, dish: null });
    expect(s.orders[1]).toEqual({ status: 'no_match' });
  });

  it('R3-02: "not available today" is refused while an acceptable dish can still be cooked', () => {
    const s = buyAll(newGuided()).s;
    expect(act(s, { t: 'serve', order: 0, dish: null }).error).toBe('has_match');
  });

  it('R3-05: resent actions never charge, cook or sell twice; groups advance only when every guest is handled', () => {
    let s = newGuided();
    s = ok(s, { t: 'toBuy' });
    const packs = Object.fromEntries(buyRows(s).map((r) => [r.item, r.suggested]));
    const p1 = apply(s, { id: 'buy-1', t: 'purchase', packs });
    expect(apply(p1.s, { id: 'buy-1', t: 'purchase', packs }).duplicate).toBe(true);
    s = p1.s;
    const c1 = apply(s, { id: 'cook-1', t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    expect(apply(c1.s, { id: 'cook-1', t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') }).duplicate).toBe(true);
    s = c1.s;
    const v1 = apply(s, { id: 'serve-1', t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    const again = apply(v1.s, { id: 'serve-1', t: 'serve', order: 0, dish: 'tomato_egg_rice' });
    expect(again.duplicate).toBe(true);
    expect(again.s.cash).toBe(v1.s.cash);
    s = v1.s;
    expect(act(s, { t: 'serve', order: 3, dish: null }).error).toBe('bad_order'); // guests 4–6 wait for 1–3
    expect(act(s, { t: 'endBatch' }).error).toBe('wrong_mode');
    s = ok(s, { t: 'cook', dish: 'vegetable_egg_rice', items: panItems('vegetable_egg_rice') });
    s = ok(s, { t: 'serve', order: 1, dish: 'vegetable_egg_rice' });
    expect(s.batch).toBe(1);
    s = ok(s, { t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') });
    s = ok(s, { t: 'serve', order: 2, dish: 'tomato_egg_rice' });
    expect(s.batch).toBe(2);
    expect(s.madeThisBatch).toBe(0);
  });

  it('classic saves stay valid; guided state is saved and checked the same way', () => {
    expect(validState(JSON.parse(JSON.stringify(newGame())))).toBe(true);
    expect(validState(JSON.parse(JSON.stringify(newGuided())))).toBe(true);
    expect(validState({ ...newGuided(), mode: 'speedy' })).toBe(false);
    expect(act(newGame(), { t: 'cook', dish: 'tomato_egg_rice', items: panItems('tomato_egg_rice') }).error).toBe('wrong_mode');
    expect(DISHES.tomato_egg_rice.recipe.packaging).toBe(1); // the box is costed even though the child does not place it
  });
});
