// Classic 9×9 Sudoku: rules, candidates, solution counting and a logic solver with explainable steps.
// Difficulty is the lowest technique tier that solves a puzzle from its givens (difficultyVersion logic-1):
//   easy   = naked single, hidden single
//   medium = + locked candidates (pointing, claiming), naked pair
//   hard   = + hidden pair, X-Wing (rows and columns)
// Scanning order is fixed so traces are reproducible: techniques in the order above; units boxes → rows → columns;
// cells 0..80; digits 1..9.

export const RULES_VERSION = 'classic-1';
export const DIFFICULTY_VERSION = 'logic-1';
export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 81 cells, 0 = empty. Index = row * 9 + column (0-based). */
export type Grid = number[];

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Unit index: 0–8 boxes, 9–17 rows, 18–26 columns (scan order). */
export type UnitKind = 'box' | 'row' | 'column';
export const UNITS: number[][] = [];
for (let b = 0; b < 9; b++) {
  const r0 = Math.floor(b / 3) * 3,
    c0 = (b % 3) * 3;
  const u: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) u.push((r0 + r) * 9 + c0 + c);
  UNITS.push(u);
}
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
export const unitKind = (u: number): UnitKind => (u < 9 ? 'box' : u < 18 ? 'row' : 'column');
export const unitNumber = (u: number) => (u % 9) + 1;
export const rowUnit = (r: number) => 9 + r;
export const colUnit = (c: number) => 18 + c;
export const boxUnit = (b: number) => b;

export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const s = new Set<number>([...UNITS[boxUnit(boxOf(i))], ...UNITS[rowUnit(rowOf(i))], ...UNITS[colUnit(colOf(i))]]);
  s.delete(i);
  return [...s].sort((a, b) => a - b);
});

const ALL = 0b1111111110; // bits 1..9
export const bit = (d: number) => 1 << d;
export const digitsOf = (mask: number) => {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
};
export const popcount = (m: number) => {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};

export function parseGrid(s: string | number[]): Grid {
  if (Array.isArray(s)) return s.slice();
  return [...s].map((ch) => (ch === '.' ? 0 : Number(ch)));
}
export const gridToString = (g: Grid) => g.map((v) => String(v)).join('');

/** Indices of cells that repeat a digit within a row, column or box. */
export function conflicts(g: Grid): Set<number> {
  const out = new Set<number>();
  for (const u of UNITS) {
    const seen = new Map<number, number[]>();
    for (const i of u) if (g[i]) seen.set(g[i], [...(seen.get(g[i]) ?? []), i]);
    for (const cells of seen.values()) if (cells.length > 1) cells.forEach((c) => out.add(c));
  }
  return out;
}

/** Shape and rule check of a givens grid (does not check solvability). */
export function validGivens(g: unknown): g is Grid {
  return Array.isArray(g) && g.length === 81 && g.every((v) => Number.isInteger(v) && v >= 0 && v <= 9) && conflicts(g as Grid).size === 0;
}

/** Candidate masks from the digits present (filled cells get 0). */
export function candidates(g: Grid): number[] {
  const m = new Array<number>(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (g[i]) continue;
    let used = 0;
    for (const p of PEERS[i]) if (g[p]) used |= bit(g[p]);
    m[i] = ALL & ~used;
  }
  return m;
}

/** Counts solutions up to `limit` (backtracking with the most-constrained cell first). */
export function countSolutions(givens: Grid, limit = 2): { count: number; solution: Grid | null } {
  const g = givens.slice();
  if (conflicts(g).size) return { count: 0, solution: null };
  let count = 0;
  let solution: Grid | null = null;
  const rows = new Array(9).fill(0),
    cols = new Array(9).fill(0),
    boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++)
    if (g[i]) {
      rows[rowOf(i)] |= bit(g[i]);
      cols[colOf(i)] |= bit(g[i]);
      boxes[boxOf(i)] |= bit(g[i]);
    }
  const rec = (): boolean => {
    let best = -1,
      bestMask = 0,
      bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const n = popcount(m);
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (!solution) solution = g.slice();
      return count >= limit;
    }
    if (bestN === 0) return false;
    const r = rowOf(best),
      c = colOf(best),
      b = boxOf(best);
    for (let d = 1; d <= 9; d++) {
      if (!(bestMask & bit(d))) continue;
      g[best] = d;
      rows[r] |= bit(d);
      cols[c] |= bit(d);
      boxes[b] |= bit(d);
      if (rec()) return true;
      rows[r] &= ~bit(d);
      cols[c] &= ~bit(d);
      boxes[b] &= ~bit(d);
    }
    g[best] = 0;
    return false;
  };
  rec();
  return { count, solution };
}

// ---------- logic techniques ----------

export type Technique = 'nakedSingle' | 'hiddenSingle' | 'pointing' | 'claiming' | 'nakedPair' | 'hiddenPair' | 'xwingRow' | 'xwingColumn';
export const TIERS: Record<Difficulty, Technique[]> = {
  easy: ['nakedSingle', 'hiddenSingle'],
  medium: ['nakedSingle', 'hiddenSingle', 'pointing', 'claiming', 'nakedPair'],
  hard: ['nakedSingle', 'hiddenSingle', 'pointing', 'claiming', 'nakedPair', 'hiddenPair', 'xwingRow', 'xwingColumn'],
};

export interface Step {
  technique: Technique;
  /** placement (singles) */
  place?: { cell: number; digit: number };
  /** candidates proven impossible (elimination techniques) */
  eliminate: { cell: number; digit: number }[];
  /** the cells forming the pattern (evidence to highlight) */
  cells: number[];
  digits: number[];
  /** units involved: the unit scanned / source units of the pattern */
  units: number[];
  /** units the eliminations happen in (locked candidates target unit, X-Wing cross units) */
  targetUnits: number[];
}

const cellsWith = (cands: number[], unit: number[], d: number) => unit.filter((i) => cands[i] & bit(d));

/** Finds the first applicable step allowed by `tier`. `g` = digits placed, `cands` = current candidate masks. */
export function findStep(g: Grid, cands: number[], tier: Technique[]): Step | null {
  for (const t of tier) {
    const s = FINDERS[t](g, cands);
    if (s) return s;
  }
  return null;
}

const FINDERS: Record<Technique, (g: Grid, c: number[]) => Step | null> = {
  nakedSingle(g, c) {
    for (let i = 0; i < 81; i++)
      if (!g[i] && popcount(c[i]) === 1) {
        const d = digitsOf(c[i])[0];
        return { technique: 'nakedSingle', place: { cell: i, digit: d }, eliminate: [], cells: [i], digits: [d], units: [boxUnit(boxOf(i)), rowUnit(rowOf(i)), colUnit(colOf(i))], targetUnits: [] };
      }
    return null;
  },
  hiddenSingle(g, c) {
    for (let u = 0; u < 27; u++)
      for (let d = 1; d <= 9; d++) {
        if (UNITS[u].some((i) => g[i] === d)) continue;
        const at = cellsWith(c, UNITS[u], d).filter((i) => !g[i]);
        if (at.length === 1) return { technique: 'hiddenSingle', place: { cell: at[0], digit: d }, eliminate: [], cells: at, digits: [d], units: [u], targetUnits: [] };
      }
    return null;
  },
  pointing(g, c) {
    for (let b = 0; b < 9; b++)
      for (let d = 1; d <= 9; d++) {
        const at = cellsWith(c, UNITS[b], d).filter((i) => !g[i]);
        if (at.length < 2) continue;
        for (const [same, unitFor] of [
          [(i: number) => rowOf(i), rowUnit],
          [(i: number) => colOf(i), colUnit],
        ] as const) {
          if (at.every((i) => same(i) === same(at[0]))) {
            const tu = unitFor(same(at[0]));
            const el = UNITS[tu].filter((i) => !g[i] && boxOf(i) !== b && c[i] & bit(d)).map((cell) => ({ cell, digit: d }));
            if (el.length) return { technique: 'pointing', eliminate: el, cells: at, digits: [d], units: [b], targetUnits: [tu] };
          }
        }
      }
    return null;
  },
  claiming(g, c) {
    for (let u = 9; u < 27; u++)
      for (let d = 1; d <= 9; d++) {
        const at = cellsWith(c, UNITS[u], d).filter((i) => !g[i]);
        if (at.length < 2 || !at.every((i) => boxOf(i) === boxOf(at[0]))) continue;
        const b = boxOf(at[0]);
        const el = UNITS[b].filter((i) => !g[i] && !UNITS[u].includes(i) && c[i] & bit(d)).map((cell) => ({ cell, digit: d }));
        if (el.length) return { technique: 'claiming', eliminate: el, cells: at, digits: [d], units: [u], targetUnits: [b] };
      }
    return null;
  },
  nakedPair(g, c) {
    for (let u = 0; u < 27; u++) {
      const open = UNITS[u].filter((i) => !g[i]);
      for (let a = 0; a < open.length; a++)
        for (let b = a + 1; b < open.length; b++) {
          const m = c[open[a]];
          if (popcount(m) !== 2 || c[open[b]] !== m) continue;
          const ds = digitsOf(m);
          const el = open.filter((i) => i !== open[a] && i !== open[b]).flatMap((cell) => ds.filter((d) => c[cell] & bit(d)).map((digit) => ({ cell, digit })));
          if (el.length) return { technique: 'nakedPair', eliminate: el, cells: [open[a], open[b]], digits: ds, units: [u], targetUnits: [u] };
        }
    }
    return null;
  },
  hiddenPair(g, c) {
    for (let u = 0; u < 27; u++) {
      const pos = new Map<number, number[]>();
      for (let d = 1; d <= 9; d++) {
        if (UNITS[u].some((i) => g[i] === d)) continue;
        pos.set(d, cellsWith(c, UNITS[u], d).filter((i) => !g[i]));
      }
      for (let d1 = 1; d1 <= 9; d1++)
        for (let d2 = d1 + 1; d2 <= 9; d2++) {
          const p1 = pos.get(d1),
            p2 = pos.get(d2);
          if (!p1 || !p2 || p1.length !== 2 || p2.length !== 2 || p1[0] !== p2[0] || p1[1] !== p2[1]) continue;
          const keep = bit(d1) | bit(d2);
          const el = p1.flatMap((cell) => digitsOf(c[cell] & ~keep).map((digit) => ({ cell, digit })));
          if (el.length) return { technique: 'hiddenPair', eliminate: el, cells: p1, digits: [d1, d2], units: [u], targetUnits: [u] };
        }
    }
    return null;
  },
  xwingRow: (g, c) => xwing(g, c, 'row'),
  xwingColumn: (g, c) => xwing(g, c, 'column'),
};

function xwing(g: Grid, c: number[], base: 'row' | 'column'): Step | null {
  const baseUnit = base === 'row' ? rowUnit : colUnit;
  const crossUnit = base === 'row' ? colUnit : rowUnit;
  const crossOf = base === 'row' ? colOf : rowOf;
  for (let d = 1; d <= 9; d++) {
    const lines: { line: number; cross: number[] }[] = [];
    for (let l = 0; l < 9; l++) {
      const at = cellsWith(c, UNITS[baseUnit(l)], d).filter((i) => !g[i]);
      if (at.length === 2) lines.push({ line: l, cross: at.map(crossOf) });
    }
    for (let a = 0; a < lines.length; a++)
      for (let b = a + 1; b < lines.length; b++) {
        const A = lines[a],
          B = lines[b];
        if (A.cross[0] !== B.cross[0] || A.cross[1] !== B.cross[1]) continue;
        const pattern = [...UNITS[baseUnit(A.line)], ...UNITS[baseUnit(B.line)]].filter((i) => A.cross.includes(crossOf(i)));
        const el = A.cross.flatMap((x) => UNITS[crossUnit(x)].filter((i) => !g[i] && !pattern.includes(i) && c[i] & bit(d)).map((cell) => ({ cell, digit: d })));
        if (el.length)
          return {
            technique: base === 'row' ? 'xwingRow' : 'xwingColumn',
            eliminate: el,
            cells: pattern.sort((x, y) => x - y),
            digits: [d],
            units: [baseUnit(A.line), baseUnit(B.line)],
            targetUnits: A.cross.map(crossUnit),
          };
      }
  }
  return null;
}

/** Applies a step to (g, cands) in place. Placement also removes the digit from the peers' candidates. */
export function applyStep(g: Grid, cands: number[], s: Step) {
  if (s.place) {
    const { cell, digit } = s.place;
    g[cell] = digit;
    cands[cell] = 0;
    for (const p of PEERS[cell]) cands[p] &= ~bit(digit);
  }
  for (const e of s.eliminate) cands[e.cell] &= ~bit(e.digit);
}

export interface LogicResult {
  solved: boolean;
  grid: Grid;
  steps: Step[];
}

/** Solves with the techniques of one tier only. */
export function logicSolve(givens: Grid, level: Difficulty, maxSteps = 2000): LogicResult {
  const g = givens.slice();
  const cands = candidates(g);
  const steps: Step[] = [];
  const tier = TIERS[level];
  while (steps.length < maxSteps) {
    if (g.every((v) => v)) break;
    const s = findStep(g, cands, tier);
    if (!s) break;
    applyStep(g, cands, s);
    steps.push(s);
  }
  return { solved: g.every((v) => v) && conflicts(g).size === 0, grid: g, steps };
}

/** Lowest tier that solves the puzzle, or null when it needs more than the hard tier. */
export function grade(givens: Grid): Difficulty | null {
  for (const d of DIFFICULTIES) if (logicSolve(givens, d).solved) return d;
  return null;
}

export const techniqueCounts = (steps: Step[]) => {
  const out: Partial<Record<Technique, number>> = {};
  for (const s of steps) out[s.technique] = (out[s.technique] ?? 0) + 1;
  return out;
};

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
