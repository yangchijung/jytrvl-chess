// Planet Rescue Crew — rules engine. Pure and deterministic.
// Three roles each hold a different piece of the puzzle:
//   navigator 🧭 — what each route is like (open / long road / shortcut / broken bridge / rockfall)
//   engineer 🔧 — what the base needs
//   supplier 📦 — what is in the storeroom, how much the rover carries, which items are heavy
// The team writes a plan (trips: route + cargo) on a shared board, then runs it. Failures report a
// chain of events ("no plank, so the bridge could not be fixed"), never who is to blame.

export type Item = 'battery' | 'panel' | 'cable' | 'plank' | 'water';
export const ITEMS: Item[] = ['battery', 'panel', 'cable', 'plank', 'water'];
export const HEAVY: Item[] = ['battery'];
export type RouteKind = 'open' | 'long' | 'shortcut' | 'bridge' | 'rocks';
export type RouteId = 'red' | 'yellow' | 'blue';
export const ROUTE_IDS: RouteId[] = ['red', 'yellow', 'blue'];
export type Role = 'navigator' | 'engineer' | 'supplier';
export const ROLES: Role[] = ['navigator', 'engineer', 'supplier'];

export interface Mission {
  id: string;
  name: { zh: string; en: string };
  time: number; // time units available; a trip takes 1 (long road: 2)
  capacity: number; // items per trip
  storage: Partial<Record<Item, number>>;
  needs: Partial<Record<Item, number>>;
  routes: Record<RouteId, RouteKind>;
}
export interface Trip {
  route: RouteId | null;
  cargo: Item[];
}
export type Ev =
  | { t: 'depart'; trip: number; route: RouteId }
  | { t: 'fix_bridge'; trip: number }
  | { t: 'deliver'; trip: number; items: Item[] }
  // problems (the run stops at the first one)
  | { t: 'no_route'; trip: number }
  | { t: 'empty'; trip: number }
  | { t: 'out_of_time'; trip: number; used: number; time: number }
  | { t: 'over_capacity'; trip: number; load: number; capacity: number }
  | { t: 'not_in_storage'; trip: number; item: Item; have: number }
  | { t: 'blocked'; trip: number; route: RouteId }
  | { t: 'no_heavy'; trip: number; route: RouteId; item: Item }
  | { t: 'bridge_broken'; trip: number; route: RouteId }
  | { t: 'missing'; items: Partial<Record<Item, number>> };
export const PROBLEMS: Ev['t'][] = ['no_route', 'empty', 'out_of_time', 'over_capacity', 'not_in_storage', 'blocked', 'no_heavy', 'bridge_broken', 'missing'];

export interface RunResult {
  events: Ev[];
  ok: boolean;
  delivered: Partial<Record<Item, number>>;
  /** the event that stopped the mission (or the final "missing" check) */
  problem: Ev | null;
}

const count = (xs: Item[], i: Item) => xs.filter((x) => x === i).length;

export function run(m: Mission, plan: Trip[]): RunResult {
  const events: Ev[] = [];
  const taken: Partial<Record<Item, number>> = {};
  const delivered: Partial<Record<Item, number>> = {};
  let used = 0;
  let bridgeFixed = false;
  const stop = (e: Ev): RunResult => (events.push(e), { events, ok: false, delivered, problem: e });
  const trips = plan.filter((t) => t.route || t.cargo.length);
  for (let k = 0; k < trips.length; k++) {
    const tr = trips[k];
    if (!tr.route) return stop({ t: 'no_route', trip: k });
    if (!tr.cargo.length) return stop({ t: 'empty', trip: k });
    const kind = m.routes[tr.route];
    const dur = kind === 'long' ? 2 : 1;
    if (used + dur > m.time) return stop({ t: 'out_of_time', trip: k, used: used + dur, time: m.time });
    if (tr.cargo.length > m.capacity) return stop({ t: 'over_capacity', trip: k, load: tr.cargo.length, capacity: m.capacity });
    for (const i of ITEMS) {
      const want = (taken[i] ?? 0) + count(tr.cargo, i);
      if (want > (m.storage[i] ?? 0)) return stop({ t: 'not_in_storage', trip: k, item: i, have: m.storage[i] ?? 0 });
    }
    for (const i of tr.cargo) taken[i] = (taken[i] ?? 0) + 1;
    events.push({ t: 'depart', trip: k, route: tr.route });
    if (kind === 'rocks') return stop({ t: 'blocked', trip: k, route: tr.route });
    if (kind === 'shortcut') {
      const heavy = tr.cargo.find((i) => HEAVY.includes(i));
      if (heavy) return stop({ t: 'no_heavy', trip: k, route: tr.route, item: heavy });
    }
    let cargo = [...tr.cargo];
    if (kind === 'bridge' && !bridgeFixed) {
      const p = cargo.indexOf('plank');
      if (p < 0) return stop({ t: 'bridge_broken', trip: k, route: tr.route });
      cargo.splice(p, 1);
      bridgeFixed = true;
      events.push({ t: 'fix_bridge', trip: k });
    }
    used += dur;
    for (const i of cargo) delivered[i] = (delivered[i] ?? 0) + 1;
    if (cargo.length) events.push({ t: 'deliver', trip: k, items: cargo });
  }
  const missing: Partial<Record<Item, number>> = {};
  for (const i of ITEMS) {
    const lack = (m.needs[i] ?? 0) - (delivered[i] ?? 0);
    if (lack > 0) missing[i] = lack;
  }
  if (Object.keys(missing).length) return stop({ t: 'missing', items: missing });
  return { events, ok: true, delivered, problem: null };
}

/** Every plan that works within the mission's time (used by tests and to check authored missions). */
export function solutions(m: Mission, limit = 5): Trip[][] {
  const out: Trip[][] = [];
  const loads: Item[][] = [];
  const build = (start: number, cur: Item[]) => {
    if (cur.length) loads.push([...cur]);
    if (cur.length === m.capacity) return;
    for (let i = start; i < ITEMS.length; i++) build(i, [...cur, ITEMS[i]]);
  };
  build(0, []);
  const rec = (plan: Trip[], used: number) => {
    if (out.length >= limit) return;
    if (plan.length && run(m, plan).ok) {
      out.push(plan);
      return;
    }
    for (const r of ROUTE_IDS) {
      const dur = m.routes[r] === 'long' ? 2 : 1;
      if (used + dur > m.time) continue;
      for (const c of loads) {
        const next = [...plan, { route: r, cargo: c }];
        const res = run(m, next);
        if (res.problem && res.problem.t !== 'missing') continue;
        rec(next, used + dur);
        if (out.length >= limit) return;
      }
    }
  };
  rec([], 0);
  return out;
}

export function validMission(x: unknown): x is Mission {
  const m = x as Mission;
  if (!m || typeof m.id !== 'string' || !Number.isInteger(m.time) || !Number.isInteger(m.capacity) || m.time < 1 || m.time > 4 || m.capacity < 1 || m.capacity > 4) return false;
  if (!m.routes || !ROUTE_IDS.every((r) => ['open', 'long', 'shortcut', 'bridge', 'rocks'].includes(m.routes[r]))) return false;
  const counts = (o: unknown) => !!o && Object.entries(o as object).every(([k, v]) => ITEMS.includes(k as Item) && Number.isInteger(v) && v >= 0 && v <= 6);
  return counts(m.storage) && counts(m.needs) && Object.values(m.needs).some((v) => (v ?? 0) > 0);
}
