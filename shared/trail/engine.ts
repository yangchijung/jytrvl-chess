// Try Again Trail — rules engine. Pure, deterministic, open rules (no randomness, no hidden information).
// Two explorers race on a public trail map: collect the three badges, then reach camp.
// Each turn: +2 energy (plus at most 1 saved from last turn). Stepping to a neighbour costs 1, mud costs 2.
// An apple gives +2 energy the first time each explorer steps on it. Explorers never block each other.
// Fairness: if the first player of a round finishes, the other still gets that round's turn; both finishing
// in the same round is a tie. The first player alternates between games.

export type Badge = 'forest' | 'mountain' | 'lake';
export const BADGES: Badge[] = ['forest', 'mountain', 'lake'];
export type Kind = 'start' | 'camp' | 'plain' | 'mud' | 'apple' | 'badge';
export interface TrailNode {
  id: number;
  x: number; // 0..100
  y: number; // 0..64
  kind: Kind;
  badge?: Badge;
}
export interface TrailMap {
  id: string;
  name: { zh: string; en: string };
  nodes: TrailNode[];
  edges: [number, number][];
}

export const GAIN = 2;
export const SAVE_MAX = 1;
export const APPLE = 2;

export type Action = { t: 'move'; to: number } | { t: 'end' };
export interface Explorer {
  at: number;
  energy: number;
  badges: Badge[];
  apples: number[]; // apple node ids already used by this explorer
  doneRound: number | null; // round in which this explorer reached camp with all badges
}
export interface Game {
  map: TrailMap;
  first: 0 | 1; // who moves first in every round
  players: [Explorer, Explorer];
  turn: 0 | 1;
  round: number; // 1-based
  status: 'playing' | 'over';
  winner: 0 | 1 | 'tie' | null;
  /** index into the action log where the current turn started */
  turnStart: number;
  log: Action[];
}

export const startNode = (m: TrailMap) => m.nodes.find((n) => n.kind === 'start')!.id;
export const campNode = (m: TrailMap) => m.nodes.find((n) => n.kind === 'camp')!.id;
export const neighbours = (m: TrailMap, id: number): number[] =>
  m.edges.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])).sort((a, b) => a - b);
export const cost = (m: TrailMap, to: number) => (m.nodes[to].kind === 'mud' ? 2 : 1);

export function newGame(map: TrailMap, first: 0 | 1): Game {
  const s = startNode(map);
  const p = (): Explorer => ({ at: s, energy: 0, badges: [], apples: [], doneRound: null });
  const g: Game = { map, first, players: [p(), p()], turn: first, round: 1, status: 'playing', winner: null, turnStart: 0, log: [] };
  g.players[first] = { ...g.players[first], energy: GAIN };
  return g;
}

/** Moves the current explorer may make now. */
export function legalMoves(g: Game): number[] {
  if (g.status !== 'playing') return [];
  const me = g.players[g.turn];
  return neighbours(g.map, me.at).filter((n) => cost(g.map, n) <= me.energy);
}

const finished = (m: TrailMap, e: Explorer) => e.at === campNode(m) && e.badges.length === BADGES.length;

function arrive(m: TrailMap, e: Explorer, to: number): Explorer {
  const n = m.nodes[to];
  let r: Explorer = { ...e, at: to, energy: e.energy - cost(m, to) };
  if (n.kind === 'badge' && n.badge && !r.badges.includes(n.badge)) r = { ...r, badges: [...r.badges, n.badge] };
  if (n.kind === 'apple' && !r.apples.includes(to)) r = { ...r, apples: [...r.apples, to], energy: r.energy + APPLE };
  return r;
}

/** Applies one action; returns a new game (throws on an illegal action). */
export function apply(g: Game, a: Action): Game {
  if (g.status !== 'playing') throw new Error('game over');
  const players = [...g.players] as [Explorer, Explorer];
  let me = players[g.turn];
  const log = [...g.log, a];
  if (a.t === 'move') {
    if (!legalMoves(g).includes(a.to)) throw new Error('illegal move');
    me = arrive(g.map, me, a.to);
    if (finished(g.map, me)) me = { ...me, doneRound: g.round };
    players[g.turn] = me;
    const next = { ...g, players, log };
    // reaching camp or running out of energy ends the turn automatically
    if (me.doneRound !== null || legalMovesFor(g.map, me).length === 0) return endTurn(next);
    return next;
  }
  return endTurn({ ...g, players, log });
}

function legalMovesFor(m: TrailMap, e: Explorer) {
  return neighbours(m, e.at).filter((n) => cost(m, n) <= e.energy);
}

function endTurn(g: Game): Game {
  const players = [...g.players] as [Explorer, Explorer];
  players[g.turn] = { ...players[g.turn], energy: Math.min(SAVE_MAX, players[g.turn].energy) };
  const second = (1 - g.first) as 0 | 1;
  const lastOfRound = g.turn === second;
  const [a, b] = [players[g.first], players[second]];
  // decide the result at the end of each round (or as soon as the second player finishes)
  if (lastOfRound && (a.doneRound !== null || b.doneRound !== null)) {
    const winner = a.doneRound !== null && b.doneRound !== null ? 'tie' : a.doneRound !== null ? g.first : second;
    return { ...g, players, status: 'over', winner, turnStart: g.log.length };
  }
  const turn = (1 - g.turn) as 0 | 1;
  const round = lastOfRound ? g.round + 1 : g.round;
  players[turn] = { ...players[turn], energy: players[turn].energy + GAIN };
  return { ...g, players, turn, round, turnStart: g.log.length };
}

/** Rebuilds a game from its action log (saves and replays store only the log). Stops at the first illegal action. */
export function replay(map: TrailMap, first: 0 | 1, log: Action[]): Game {
  let g = newGame(map, first);
  for (const a of log) {
    try {
      g = apply(g, a);
    } catch {
      break;
    }
  }
  return g;
}

/** Undo the moves made so far in the current turn. */
export function undoTurn(g: Game): Game {
  return replay(g.map, g.first, g.log.slice(0, g.turnStart));
}

// ---------------------------------------------------------------- planning (shared by the AI and the review)

interface Pstate {
  at: number;
  energy: number;
  badges: number; // bitmask
  apples: number; // bitmask over apple node ids
}
const bit = (b: Badge) => 1 << BADGES.indexOf(b);
const toP = (e: Explorer): Pstate => ({ at: e.at, energy: e.energy, badges: e.badges.reduce((s, b) => s | bit(b), 0), apples: e.apples.reduce((s, a) => s | (1 << a), 0) });
const ALL = (1 << BADGES.length) - 1;

/** All end-of-turn outcomes reachable this turn: map key → { state, path, done } (shortest path kept). */
function turnOutcomes(m: TrailMap, s: Pstate) {
  const camp = campNode(m);
  const out = new Map<string, { s: Pstate; path: number[]; done: boolean }>();
  const seen = new Set<string>();
  const k = (p: Pstate) => `${p.at},${p.energy},${p.badges},${p.apples}`;
  const stack: { s: Pstate; path: number[] }[] = [{ s, path: [] }];
  while (stack.length) {
    const { s: c, path } = stack.pop()!;
    const kk = k(c);
    if (seen.has(kk)) continue;
    seen.add(kk);
    const done = c.at === camp && c.badges === ALL && path.length > 0;
    const prev = out.get(kk);
    if (!prev || path.length < prev.path.length) out.set(kk, { s: c, path, done });
    if (done) continue;
    for (const n of neighbours(m, c.at)) {
      const cst = cost(m, n);
      if (cst > c.energy) continue;
      const node = m.nodes[n];
      let ns: Pstate = { ...c, at: n, energy: c.energy - cst };
      if (node.kind === 'badge' && node.badge) ns = { ...ns, badges: ns.badges | bit(node.badge) };
      if (node.kind === 'apple' && !(ns.apples & (1 << n))) ns = { ...ns, apples: ns.apples | (1 << n), energy: ns.energy + APPLE };
      stack.push({ s: ns, path: [...path, n] });
    }
  }
  return [...out.values()];
}

const memo = new WeakMap<TrailMap, Map<string, number>>();
/** Fewest turns (including the current one) to finish from a turn-start state. */
function turnsToFinish(m: TrailMap, s: Pstate): number {
  let cache = memo.get(m);
  if (!cache) memo.set(m, (cache = new Map()));
  const key = `${s.at},${s.energy},${s.badges},${s.apples}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  // breadth-first over turns
  let frontier = [s];
  const seen = new Set([key]);
  for (let t = 1; t <= 40; t++) {
    const next: Pstate[] = [];
    for (const f of frontier) {
      for (const o of turnOutcomes(m, f)) {
        if (o.done) {
          cache.set(key, t);
          return t;
        }
        const ns = { ...o.s, energy: Math.min(SAVE_MAX, o.s.energy) + GAIN };
        const nk = `${ns.at},${ns.energy},${ns.badges},${ns.apples}`;
        if (seen.has(nk)) continue;
        seen.add(nk);
        next.push(ns);
      }
    }
    frontier = next;
  }
  cache.set(key, Infinity);
  return Infinity;
}

/** Fewest turns this explorer still needs, counting the current turn (0 when already finished). */
export function turnsLeft(m: TrailMap, e: Explorer): number {
  if (e.doneRound !== null) return 0;
  return turnsToFinish(m, toP(e));
}

/** Best plan for this turn: the path that finishes soonest (ties: more steps of progress, then more saved energy, then lower ids). */
export function bestPlan(m: TrailMap, e: Explorer): { path: number[]; turns: number } {
  let best: { path: number[]; turns: number; save: number } | null = null;
  for (const o of turnOutcomes(m, toP(e))) {
    const turns = o.done ? 1 : 1 + turnsToFinish(m, { ...o.s, energy: Math.min(SAVE_MAX, o.s.energy) + GAIN });
    const save = o.done ? 9 : Math.min(SAVE_MAX, o.s.energy);
    const steps = o.path.length;
    const better =
      !best ||
      turns < best.turns ||
      (turns === best.turns && (steps > best.path.length || (steps === best.path.length && (save > best.save || (save === best.save && o.path.join() < best.path.join())))));
    if (better) best = { path: o.path, turns, save };
  }
  return best ? { path: best.path, turns: best.turns } : { path: [], turns: Infinity };
}

/** Normal computer: plans the fastest route but does not plan detours for apples (it still eats one it walks over). */
const noApple = new WeakMap<TrailMap, TrailMap>();
export function normalPlan(m: TrailMap, e: Explorer): number[] {
  let plain = noApple.get(m);
  if (!plain) noApple.set(m, (plain = { ...m, nodes: m.nodes.map((n) => (n.kind === 'apple' ? { ...n, kind: 'plain' as Kind } : n)) }));
  const path: number[] = [];
  let cur = e;
  for (const step of bestPlan(plain, { ...e, apples: [] }).path) {
    if (cost(m, step) > cur.energy) break;
    path.push(step);
    cur = arrive(m, cur, step);
    if (finished(m, cur)) break;
  }
  return path;
}

/** Easy computer: heads for the nearest thing it still needs by number of steps, ignoring mud cost and apples. */
export function easyPlan(m: TrailMap, e: Explorer): number[] {
  const path: number[] = [];
  let cur = { ...e };
  for (let guard = 0; guard < 20; guard++) {
    const need = cur.badges.length === BADGES.length ? [campNode(m)] : m.nodes.filter((n) => n.kind === 'badge' && n.badge && !cur.badges.includes(n.badge)).map((n) => n.id);
    const step = firstStepToward(m, cur.at, need);
    if (step === null || cost(m, step) > cur.energy) break;
    path.push(step);
    cur = arrive(m, cur, step);
    if (finished(m, cur)) break;
  }
  return path;
}

function firstStepToward(m: TrailMap, from: number, targets: number[]): number | null {
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (targets.includes(c) && c !== from) {
      let s = c;
      while (prev.get(s) !== from) s = prev.get(s)!;
      return s;
    }
    for (const n of neighbours(m, c)) if (!prev.has(n)) (prev.set(n, c), q.push(n));
  }
  return null;
}

/** Turn-by-turn review of one player: for each of their turns, how many turns the chosen route cost compared with the best. */
export interface TurnReview {
  logStart: number; // log index where the turn started
  logEnd: number; // log index after the turn's last action
  round: number;
  path: number[];
  before: number; // best turns-left at turn start
  after: number; // turns-left actually achieved (1 + left after this turn, or 1 if finished)
  better: number[]; // best path from this turn start
}
export function reviewTurns(map: TrailMap, first: 0 | 1, log: Action[], who: 0 | 1): TurnReview[] {
  const out: TurnReview[] = [];
  let g = newGame(map, first);
  const open = (g: Game, at: number) => ({ start: at, mine: g.turn === who, round: g.round, before: g.turn === who ? turnsLeft(map, g.players[who]) : 0, better: g.turn === who ? bestPlan(map, g.players[who]).path : [], path: [] as number[] });
  let cur = open(g, 0);
  for (let i = 0; i < log.length && g.status === 'playing'; i++) {
    const a = log[i];
    try {
      g = apply(g, a);
    } catch {
      break;
    }
    if (a.t === 'move') cur.path.push(a.to);
    if (g.turnStart === i + 1 || g.status === 'over') {
      if (cur.mine) {
        const me = g.players[who];
        out.push({ logStart: cur.start, logEnd: i + 1, round: cur.round, path: cur.path, before: cur.before, after: me.doneRound !== null ? 1 : 1 + turnsToFinish(map, { ...toP(me), energy: me.energy + GAIN }), better: cur.better });
      }
      if (g.status === 'playing') cur = open(g, i + 1);
    }
  }
  return out;
}

/** The first turn that cost the most extra turns, or null when every turn was already the best. */
export function turningPoint(reviews: TurnReview[]): TurnReview | null {
  let best: TurnReview | null = null;
  for (const r of reviews) if (r.after - r.before > 0 && (!best || r.after - r.before > best.after - best.before)) best = r;
  return best;
}

/** Shape check for authored maps. */
export function validMap(x: unknown): x is TrailMap {
  const m = x as TrailMap;
  if (!m || typeof m.id !== 'string' || !Array.isArray(m.nodes) || !Array.isArray(m.edges) || m.nodes.length < 4 || m.nodes.length > 30) return false;
  if (!m.nodes.every((n, i) => n.id === i && n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 64)) return false;
  if (m.nodes.filter((n) => n.kind === 'start').length !== 1 || m.nodes.filter((n) => n.kind === 'camp').length !== 1) return false;
  if (!BADGES.every((b) => m.nodes.some((n) => n.kind === 'badge' && n.badge === b))) return false;
  if (!m.edges.every(([a, b]) => a !== b && m.nodes[a] && m.nodes[b])) return false;
  // connected
  const seen = new Set([0]);
  const q = [0];
  while (q.length) for (const n of neighbours(m, q.shift()!)) if (!seen.has(n)) (seen.add(n), q.push(n));
  return seen.size === m.nodes.length;
}
