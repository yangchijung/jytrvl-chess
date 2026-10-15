// Little Restaurant Owner — one-day prototype data (docs/product/RESTAURANT_MENU_INVENTORY_V1.md).
// Game coins and game-balance shelf lives; not real prices or food-safety guidance.

export type ItemId = 'rice' | 'egg' | 'tomato' | 'vegetable' | 'bread' | 'cheese' | 'packaging';
export type DishId = 'tomato_egg_rice' | 'vegetable_egg_rice' | 'cheese_egg_toast';

export interface Item {
  id: ItemId;
  packSize: number;
  packPrice: number;
  /** usable business days including the purchase day; null = never expires */
  shelfDays: number | null;
  name: { zh: string; en: string };
  unit: { zh: string; en: string };
  icon: string;
}

export const ITEMS: Record<ItemId, Item> = {
  rice: { id: 'rice', packSize: 6, packPrice: 36, shelfDays: 7, name: { zh: '米', en: 'Rice' }, unit: { zh: '份', en: 'portions' }, icon: '🍚' },
  egg: { id: 'egg', packSize: 6, packPrice: 48, shelfDays: 3, name: { zh: '蛋', en: 'Eggs' }, unit: { zh: '顆', en: 'eggs' }, icon: '🥚' },
  tomato: { id: 'tomato', packSize: 3, packPrice: 9, shelfDays: 2, name: { zh: '番茄', en: 'Tomato' }, unit: { zh: '份', en: 'portions' }, icon: '🍅' },
  vegetable: { id: 'vegetable', packSize: 3, packPrice: 12, shelfDays: 1, name: { zh: '蔬菜', en: 'Vegetables' }, unit: { zh: '份', en: 'portions' }, icon: '🥬' },
  bread: { id: 'bread', packSize: 4, packPrice: 20, shelfDays: 2, name: { zh: '吐司', en: 'Toast bread' }, unit: { zh: '份', en: 'portions' }, icon: '🍞' },
  cheese: { id: 'cheese', packSize: 4, packPrice: 24, shelfDays: 3, name: { zh: '起司', en: 'Cheese' }, unit: { zh: '份', en: 'portions' }, icon: '🧀' },
  packaging: { id: 'packaging', packSize: 1, packPrice: 2, shelfDays: null, name: { zh: '包裝', en: 'Packaging' }, unit: { zh: '個', en: 'boxes' }, icon: '🥡' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const unitCost = (i: ItemId) => ITEMS[i].packPrice / ITEMS[i].packSize;

export interface Dish {
  id: DishId;
  recipe: Partial<Record<ItemId, number>>;
  price: number;
  name: { zh: string; en: string };
  icon: string;
}

export const DISHES: Record<DishId, Dish> = {
  tomato_egg_rice: { id: 'tomato_egg_rice', recipe: { rice: 1, egg: 1, tomato: 1, packaging: 1 }, price: 32, name: { zh: '番茄蛋飯', en: 'Tomato egg rice' }, icon: '🍛' },
  vegetable_egg_rice: { id: 'vegetable_egg_rice', recipe: { rice: 1, egg: 1, vegetable: 1, packaging: 1 }, price: 35, name: { zh: '蔬菜蛋炒飯', en: 'Vegetable egg fried rice' }, icon: '🍳' },
  cheese_egg_toast: { id: 'cheese_egg_toast', recipe: { bread: 1, egg: 1, cheese: 1, packaging: 1 }, price: 30, name: { zh: '起司蛋吐司', en: 'Cheese egg toast' }, icon: '🥪' },
};
export const DISH_IDS = Object.keys(DISHES) as DishId[];
/** variable cost per serving at list unit costs (19 / 20 / 21) */
export const dishCost = (d: DishId) => Object.entries(DISHES[d].recipe).reduce((s, [i, q]) => s + unitCost(i as ItemId) * (q ?? 0), 0);

export interface Customer {
  likes: DishId;
  alsoAccepts: DishId | null;
  budget: number;
}
/** Fixed tutorial customers; 1–3 first batch, 4–6 second batch. */
export const CUSTOMERS: Customer[] = [
  { likes: 'tomato_egg_rice', alsoAccepts: 'cheese_egg_toast', budget: 40 },
  { likes: 'vegetable_egg_rice', alsoAccepts: 'cheese_egg_toast', budget: 40 },
  { likes: 'tomato_egg_rice', alsoAccepts: null, budget: 40 },
  { likes: 'vegetable_egg_rice', alsoAccepts: 'cheese_egg_toast', budget: 40 },
  { likes: 'tomato_egg_rice', alsoAccepts: 'cheese_egg_toast', budget: 40 },
  { likes: 'vegetable_egg_rice', alsoAccepts: null, budget: 40 },
];
export const BATCH_ORDERS = [
  [0, 1, 2],
  [3, 4, 5],
];

export const START_CASH = 500;
export const FIXED_FEE = 50;
export const DAY_CAPACITY = 8;
export const BATCH_CAPACITY = 4;
export const DECOR = { id: 'plant', price: 120, name: { zh: '盆栽（純裝飾）', en: 'Potted plant (decoration only)' }, icon: '🪴' };
export const DEFAULT_PLAN: Partial<Record<DishId, number>> = { tomato_egg_rice: 3, vegetable_egg_rice: 3 };
