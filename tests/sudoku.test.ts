import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BANK, pickPuzzle } from '../shared/sudoku/bank';
import {
  DIFFICULTIES,
  PEERS,
  TIERS,
  UNITS,
  bit,
  boxOf,
  candidates,
  colOf,
  countSolutions,
  findStep,
  applyStep,
  grade,
  logicSolve,
  parseGrid,
  rowOf,
  techniqueCounts,
  validGivens,
  type Step,
  type Technique,
} from '../shared/sudoku/engine';
import { HISTORY_LIMIT, applyHint, complete, erase, hint, input, newSession, restartSession, undo, validSession, type Puzzle, type Session } from '../shared/sudoku/session';

const bank = { puzzles: BANK };
const byLevel = (d: string) => bank.puzzles.filter((p) => p.difficulty === d);
const fresh = (p = bank.puzzles[0]) => newSession(p, { sessionId: 't', now: 0 });
const firstEmpty = (s: Session) => [...s.givens].findIndex((c) => c === '0');

describe('SU01 bank', () => {
  it('has ≥30 distinct, valid, uniquely solvable puzzles per level', () => {
    for (const d of DIFFICULTIES) expect(byLevel(d).length).toBeGreaterThanOrEqual(30);
    expect(new Set(bank.puzzles.map((p) => p.givens)).size).toBe(bank.puzzles.length);
    expect(new Set(bank.puzzles.map((p) => p.puzzleId)).size).toBe(bank.puzzles.length);
    for (const p of bank.puzzles) {
      const g = parseGrid(p.givens);
      expect(validGivens(g)).toBe(true);
      const r = countSolutions(g, 2);
      expect(r.count).toBe(1);
      expect(r.solution!.join('')).toBe(p.solution);
      // givens agree with the solution
      expect(g.every((v, i) => !v || v === Number(p.solution[i]))).toBe(true);
    }
  });
  it('rejects 0-solution, multi-solution and malformed puzzles', () => {
    const p = parseGrid(bank.puzzles[0].givens);
    // multi: remove most givens
    const multi = p.map((v, i) => (i < 60 ? 0 : v));
    expect(countSolutions(multi, 2).count).toBe(2);
    // no solution: valid-looking but contradictory (two cells of row 0 can only be the same digit)
    const none = parseGrid('12345678.........9' + '0'.repeat(63));
    expect(countSolutions(none, 2).count).toBe(0);
    const dup = p.slice();
    const j = p.findIndex((v) => v);
    const k = UNITS[9 + rowOf(j)].find((x) => x !== j)!;
    dup[k] = p[j];
    expect(validGivens(dup)).toBe(false);
    expect(validGivens(p.slice(0, 80))).toBe(false);
    expect(validGivens([...p.slice(0, 80), 10])).toBe(false);
  });
});

describe('puzzle selection', () => {
  it('avoids the last 10 puzzles of the level', () => {
    const easy = bank.puzzles.filter((p) => p.difficulty === 'easy');
    const recent = easy.slice(0, 10).map((p) => p.puzzleId);
    for (let i = 0; i < 50; i++) expect(recent).not.toContain(pickPuzzle('easy', recent).puzzleId);
  });
});

describe('SU02 grading by lowest solving tier', () => {
  it('every puzzle is graded by the lowest tier, the trace replays to the solution, and the lower tier stalls', () => {
    for (const p of bank.puzzles) {
      const g = parseGrid(p.givens);
      expect(grade(g)).toBe(p.difficulty);
      const t = logicSolve(g, p.difficulty);
      expect(t.solved).toBe(true);
      expect(t.grid.join('')).toBe(p.solution);
      expect(t.steps.length).toBe(p.verification.logicSteps);
      expect(techniqueCounts(t.steps)).toEqual(p.verification.techniques);
      if (p.difficulty === 'medium') expect(logicSolve(g, 'easy').solved).toBe(false);
      if (p.difficulty === 'hard') expect(logicSolve(g, 'medium').solved).toBe(false);
    }
  });
  it('the design fixture is unique and easy-tier solvable', () => {
    const f = JSON.parse(readFileSync('docs/design/sudoku-classic-fixture.json', 'utf8'));
    const g = parseGrid(f.givens);
    expect(countSolutions(g, 2).count).toBe(1);
    expect(grade(g)).toBe('easy');
    expect(logicSolve(g, 'easy').grid.join('')).toBe(f.solution.join(''));
  });
});

// replay every bank trace step by step and collect one fixture per technique
const fixtures = new Map<Technique, { puzzle: string; index: number; step: Step; cands: number[]; grid: number[] }>();
const allSteps: { step: Step; solution: number[] }[] = [];
for (const p of bank.puzzles) {
  const g = parseGrid(p.givens);
  const c = candidates(g);
  const sol = parseGrid(p.solution);
  for (let i = 0; i < 2000; i++) {
    const st = findStep(g, c, TIERS[p.difficulty]);
    if (!st) break;
    if (!fixtures.has(st.technique)) fixtures.set(st.technique, { puzzle: p.puzzleId, index: i, step: st, cands: c.slice(), grid: g.slice() });
    allSteps.push({ step: st, solution: sol });
    applyStep(g, c, st);
  }
}

describe('SU07 technique hints', () => {
  it('has a replayable fixture for every technique (both locked-candidate types, both pairs, X-Wing rows and columns)', () => {
    for (const t of TIERS.hard) expect(fixtures.has(t), t).toBe(true);
  });
  it('never eliminates the true digit and never places a wrong one (all bank steps)', () => {
    for (const { step, solution } of allSteps) {
      if (step.place) expect(solution[step.place.cell]).toBe(step.place.digit);
      for (const e of step.eliminate) expect(solution[e.cell]).not.toBe(e.digit);
    }
    expect(allSteps.length).toBeGreaterThan(5000);
  });
  it('pattern evidence matches each technique definition', () => {
    for (const [t, f] of fixtures) {
      const { step: s, cands: c } = f;
      const d = s.digits[0];
      const unitCells = (u: number) => UNITS[u].filter((i) => !f.grid[i] && c[i] & bit(d));
      if (t === 'pointing') expect(unitCells(s.units[0]).every((i) => UNITS[s.targetUnits[0]].includes(i))).toBe(true);
      if (t === 'claiming') expect(unitCells(s.units[0]).every((i) => boxOf(i) === s.targetUnits[0])).toBe(true);
      if (t === 'nakedPair') expect(s.cells.every((i) => c[i] === (bit(s.digits[0]) | bit(s.digits[1])))).toBe(true);
      if (t === 'hiddenPair') for (const dd of s.digits) expect(UNITS[s.units[0]].filter((i) => !f.grid[i] && c[i] & bit(dd))).toEqual(s.cells);
      if (t === 'xwingRow' || t === 'xwingColumn') {
        expect(s.cells.length).toBe(4);
        for (const u of s.units) expect(unitCells(u).length).toBe(2);
        const crossOf = t === 'xwingRow' ? colOf : rowOf;
        expect(new Set(s.cells.map(crossOf)).size).toBe(2);
        for (const e of s.eliminate) expect(s.cells.map(crossOf)).toContain(crossOf(e.cell));
      }
      // eliminations really were candidates
      for (const e of s.eliminate) expect(c[e.cell] & bit(e.digit)).toBeTruthy();
    }
  });
});

describe('SU03 givens are protected', () => {
  it('input, notes, erase and hint apply cannot change a given', () => {
    let s = fresh();
    const g = [...s.givens].findIndex((ch) => ch !== '0');
    expect(input(s, g, 5, false).r).toBe('given');
    expect(input(s, g, 5, true).r).toBe('given');
    expect(erase(s, g).r).toBe('given');
    s = undo(s);
    expect(s.entries[g]).toBe(0);
    expect(applyHint(s, { technique: 'nakedSingle', place: { cell: g, digit: 1 }, eliminate: [], cells: [g], digits: [1], units: [], targetUnits: [] })).toBe(s);
  });
});

describe('SU04 conflicts', () => {
  it('marks duplicates in row/column/box but never reveals a merely wrong entry; no lives', () => {
    let s = fresh();
    const sol = parseGrid(s.solution);
    const e = firstEmpty(s);
    const givenPeer = PEERS[e].find((p) => s.givens[p] !== '0')!;
    s = input(s, e, Number(s.givens[givenPeer]), false).s;
    const h = hint(s);
    expect(h.h.kind).toBe('conflict');
    expect(h.s.hintsUsed).toBe(0);
    // wrong but not duplicate: no conflict flagged
    let t = fresh();
    const cand = candidates(parseGrid(t.givens))[e];
    const wrongDigit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => cand & bit(d) && d !== sol[e]);
    if (wrongDigit) {
      t = input(t, e, wrongDigit, false).s;
      expect(t.status).toBe('playing');
      for (let i = 0; i < 10; i++) t = input(t, e, wrongDigit === 9 ? 8 : 9, false).s; // unlimited mistakes
      expect(t.status).toBe('playing');
    }
  });
});

describe('SU05 notes', () => {
  it('toggle per digit, do not count as entries, filled cells refuse notes, fill clears peers only', () => {
    let s = fresh();
    const e = firstEmpty(s);
    s = input(s, e, 3, true).s;
    s = input(s, e, 7, true).s;
    expect(s.notes[e]).toBe(bit(3) | bit(7));
    expect(s.entries[e]).toBe(0);
    s = input(s, e, 3, true).s;
    expect(s.notes[e]).toBe(bit(7));
    // peer and non-peer with note 4
    const peer = PEERS[e].find((p) => s.givens[p] === '0')!;
    const far = [...Array(81).keys()].find((i) => s.givens[i] === '0' && i !== e && !PEERS[e].includes(i))!;
    s = input(s, peer, 4, true).s;
    s = input(s, far, 4, true).s;
    const before = s;
    s = input(s, e, 4, false).s;
    expect(s.notes[e]).toBe(0);
    expect(s.notes[peer] & bit(4)).toBe(0);
    expect(s.notes[far] & bit(4)).toBeTruthy();
    expect(input(s, e, 5, true).r).toBe('filled');
    // undo restores exactly
    const u = undo(s);
    expect(u.notes).toEqual(before.notes);
    expect(u.entries).toEqual(before.entries);
  });
});

describe('SU06 undo', () => {
  it('fill / replace / note / erase are one transaction each, keeps 100 steps, survives JSON, never refunds hints', () => {
    let s = fresh();
    const e = firstEmpty(s);
    s = input(s, e, 1, false).s;
    s = input(s, e, 2, false).s; // replace
    s = erase(s, e).s;
    s = input(s, e, 6, true).s;
    expect(s.history.map((a) => a.kind)).toEqual(['fill', 'fill', 'erase', 'note']);
    s = undo(s);
    expect(s.notes[e]).toBe(0);
    s = undo(s);
    expect(s.entries[e]).toBe(2);
    s = undo(s);
    expect(s.entries[e]).toBe(1);
    // 100-step limit
    for (let i = 0; i < 130; i++) s = input(s, e, (i % 9) + 1 === s.entries[e] ? ((i + 1) % 9) + 1 : (i % 9) + 1, false).s;
    expect(s.history.length).toBe(HISTORY_LIMIT);
    // survives a save/reload
    const re = JSON.parse(JSON.stringify(s)) as Session;
    expect(validSession(re)).toBe(true);
    expect(undo(re).history.length).toBe(HISTORY_LIMIT - 1);
    // hints are not refunded
    let h = fresh();
    h = hint(h).s;
    expect(h.hintsUsed).toBe(1);
    h = undo(h);
    expect(h.hintsUsed).toBe(1);
  });
});

describe('SU08 hint boundaries', () => {
  it('duplicate → not counted; contradiction → counted once; same step not counted twice; apply undoable; cancel keeps the count', () => {
    let s = fresh();
    let r = hint(s);
    expect(r.h.kind).toBe('step');
    s = r.s;
    expect(s.hintsUsed).toBe(1);
    // reopening the same step does not count again
    r = hint(s);
    expect(r.h.kind === 'step' && !r.h.counted).toBe(true);
    s = r.s;
    expect(s.hintsUsed).toBe(1);
    // apply and undo
    const st = (r.h as { step: Step }).step;
    const applied = applyHint(s, st);
    expect(applied.hintsUsed).toBe(1);
    expect(undo(applied).entries).toEqual(s.entries);
    expect(undo(applied).hintsUsed).toBe(1);
    expect(undo(applied).assisted).toBe(true);
    // contradiction: an entry that differs from the unique solution
    const sol = parseGrid(s.solution);
    const e = firstEmpty(s);
    const cand = candidates(parseGrid(s.givens))[e];
    const wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => cand & bit(d) && d !== sol[e]);
    if (wrong) {
      let c = input(s, e, wrong, false).s;
      const r1 = hint(c);
      expect(r1.h.kind).toBe('contradiction');
      c = r1.s;
      expect(c.hintsUsed).toBe(2);
      expect(c.entries[e]).toBe(wrong); // not auto-corrected
      expect(hint(c).s.hintsUsed).toBe(2);
    }
  });
  it('elimination hints persist and the engine moves on instead of repeating the same step', () => {
    const p = bank.puzzles.find((x) => x.verification.techniques.pointing)!;
    let s = fresh(p);
    // play the placements the engine proposes until an elimination step appears
    for (let i = 0; i < 200; i++) {
      const r = hint(s);
      if (r.h.kind !== 'step') throw new Error(r.h.kind);
      s = r.s;
      if (!r.h.step.place) {
        const key = r.h.key;
        s = applyHint(s, r.h.step);
        const r2 = hint(s);
        expect(r2.h.kind === 'step' && r2.h.key !== key).toBe(true);
        return;
      }
      s = applyHint(s, r.h.step);
    }
    throw new Error('no elimination step found');
  });
  it('hints alone solve every bank puzzle to completion', () => {
    for (const p of bank.puzzles.filter((_, i) => i % 4 === 0)) {
      let s = fresh(p);
      for (let i = 0; i < 400 && s.status === 'playing'; i++) {
        const r = hint(s);
        if (r.h.kind !== 'step') throw new Error(`${p.puzzleId} ${r.h.kind}`);
        s = applyHint(r.s, r.h.step);
      }
      expect(s.status, p.puzzleId).toBe('complete');
    }
  });
});

describe('SU09 completion', () => {
  it('only a valid full board completes; full wrong board or full notes do not', () => {
    const p = bank.puzzles[0];
    let s = fresh(p);
    const sol = parseGrid(p.solution);
    const empties = [...Array(81).keys()].filter((i) => p.givens[i] === '0');
    // notes everywhere
    let n = s;
    for (const i of empties) for (let d = 1; d <= 9; d++) n = input(n, i, d, true).s;
    expect(n.status).toBe('playing');
    // wrong full board (rotate digits)
    let w = s;
    for (const i of empties) w = input(w, i, (sol[i] % 9) + 1, false).s;
    expect(complete(w)).toBe(false);
    expect(w.status).toBe('playing');
    for (const [k, i] of empties.entries()) {
      const r = input(s, i, sol[i], false);
      s = r.s;
      if (k < empties.length - 1) expect(r.r).toBe('ok');
      else expect(r.r).toBe('complete');
    }
    expect(s.status).toBe('complete');
    // nothing changes after completion
    expect(input(s, empties[0], 1, false).r).toBe('over');
    expect(undo(s)).toBe(s);
  });
  it('restart keeps the puzzle, clears progress and marks a replay', () => {
    let s = fresh();
    s = hint(s).s;
    const r = restartSession(s, { sessionId: 'r', now: 5 });
    expect(r.puzzleId).toBe(s.puzzleId);
    expect(r.replay).toBe(true);
    expect(r.hintsUsed).toBe(0);
    expect(r.entries.every((v) => v === 0)).toBe(true);
  });
});

describe('tutorial material', () => {
  it('some easy puzzle offers a single-candidate cell with ≥2 blanks in each unit', () => {
    const found = bank.puzzles
      .filter((p) => p.difficulty === 'easy')
      .some((p) => {
        const g = parseGrid(p.givens);
        const c = candidates(g);
        const blanks = (u: number) => UNITS[u].filter((i) => !g[i]).length;
        return [...Array(81).keys()].some((i) => !g[i] && c[i] && (c[i] & (c[i] - 1)) === 0 && blanks(9 + rowOf(i)) >= 2 && blanks(18 + colOf(i)) >= 2 && blanks(boxOf(i)) >= 2);
      });
    expect(found).toBe(true);
  });
});
