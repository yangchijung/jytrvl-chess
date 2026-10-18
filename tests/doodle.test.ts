import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALT, KEY, MOVED, backupKey, loadSave } from '../src/doodle/storage';
import { COLORS, LESSONS, MAX_OPS, MAX_PTS, READ_MAX_PTS, RECIPES, blankSave, clearFree, freeFull, migrate, pushFree, pushGrid, readSave, splitPoints, canRedo, canUndo, empty, gridCells, isCorrectChoice, lessonStep, mix, newRun, push, redo, undo, validSave, visibleFree, type FreeOp, type GridOp } from '../shared/doodle/model';

const stroke = (color: 'red' | 'orange' = 'red'): Extract<FreeOp, { t: 'stroke' }> => ({ t: 'stroke', color, size: 'm', pts: [[0.1, 0.1], [0.2, 0.2]] });

describe('color doodle model', () => {
  it('uses the product JSON unchanged', () => {
    expect(JSON.parse(readFileSync('shared/doodle/lessons.json', 'utf8'))).toEqual(JSON.parse(readFileSync('docs/product/doodle-lessons-v1.json', 'utf8')));
    expect(LESSONS).toHaveLength(6);
  });

  it('DC02: the three mixes and the tint work in both orders; other pairs are unsupported (no invented colour)', () => {
    for (const r of RECIPES) {
      expect(mix(r.inputs[0], r.inputs[1])?.output).toBe(r.output);
      expect(mix(r.inputs[1], r.inputs[0])?.output).toBe(r.output);
    }
    expect(mix('red', 'yellow')?.output).toBe('orange');
    expect(mix('blue', 'yellow')?.output).toBe('green');
    expect(mix('red', 'blue')?.output).toBe('purple');
    expect(mix('white', 'blue')?.output).toBe('light_blue');
    expect(mix('red', 'red')).toBeNull();
    expect(mix('red', 'white')).toBeNull();
    expect(mix('orange', 'blue')).toBeNull();
    // every colour has a distinct non-colour marker
    expect(new Set(COLORS.map((c) => c.mark)).size).toBe(COLORS.length);
  });

  it('DC04: undo/redo per whole stroke; a new stroke drops the redo branch; clearing is undoable', () => {
    let h = empty<FreeOp>();
    h = push(h, stroke());
    h = push(h, stroke('orange'));
    expect(visibleFree(h)).toHaveLength(2);
    h = undo(h);
    expect(visibleFree(h)).toHaveLength(1);
    expect(canRedo(h)).toBe(true);
    h = push(h, stroke());
    expect(canRedo(h)).toBe(false);
    expect(h.ops).toHaveLength(2);
    h = push(h, { t: 'clear' });
    expect(visibleFree(h)).toHaveLength(0);
    h = undo(h);
    expect(visibleFree(h)).toHaveLength(2);
    h = redo(h);
    expect(visibleFree(h)).toHaveLength(0);
    let g = empty<GridOp>();
    g = push(g, { t: 'cell', i: 4, value: { color: 'purple', shape: 'circle' } });
    g = push(g, { t: 'clear' });
    expect(gridCells(g).every((c) => c === null)).toBe(true);
    g = undo(g);
    expect(gridCells(g)[4]).toEqual({ color: 'purple', shape: 'circle' });
    expect(canUndo(empty())).toBe(false);
  });

  it('DC03: lessons complete by mixing then making marks; a wrong guess never blocks; choices must be right to move on', () => {
    const [l1, , , l4, l5, l6] = LESSONS;
    let run = newRun(l1.id);
    expect(lessonStep(l1, run, 'easy')).toBe('mix'); // prediction optional in easy mode
    expect(lessonStep(l1, run, 'more')).toBe('predict');
    run = { ...run, guess: 'green' }; // wrong guess
    expect(lessonStep(l1, run, 'more')).toBe('mix');
    run = { ...run, mixed: ['mix_orange'] };
    expect(lessonStep(l1, run, 'easy')).toBe('apply');
    run = { ...run, marks: { red: 3 } };
    expect(lessonStep(l1, run, 'easy')).toBe('apply');
    run = { ...run, marks: { orange: 1 } };
    expect(lessonStep(l1, run, 'easy')).toBe('done');
    // L04 needs a mark in each blue
    let r4: ReturnType<typeof newRun> = { ...newRun(l4.id), mixed: ['tint_blue'], marks: { light_blue: 1 } };
    expect(lessonStep(l4, r4, 'easy')).toBe('apply');
    r4 = { ...r4, marks: { light_blue: 1, blue: 1 } };
    expect(lessonStep(l4, r4, 'easy')).toBe('done');
    // L05 warm pick, L06 opposite on the RYB wheel
    expect(isCorrectChoice(l5, 'orange')).toBe(true);
    expect(isCorrectChoice(l5, 'blue')).toBe(false);
    expect(lessonStep(l5, { ...newRun(l5.id), chosen: 'blue' }, 'more')).toBe('choose');
    expect(lessonStep(l5, { ...newRun(l5.id), chosen: 'orange', marks: { orange: 1, blue: 1 } }, 'more')).toBe('done');
    expect(lessonStep(l6, { ...newRun(l6.id), chosen: 'green' }, 'more')).toBe('choose');
    expect(lessonStep(l6, { ...newRun(l6.id), chosen: 'purple', marks: { yellow: 1 } }, 'more')).toBe('apply');
    expect(lessonStep(l6, { ...newRun(l6.id), chosen: 'purple', marks: { yellow: 1, purple: 2 } }, 'more')).toBe('done');
  });

  it('DC05: saves are checked strictly (broken or foreign data is rejected, never silently overwritten)', () => {
    const s = blankSave();
    s.free = push(s.free, stroke());
    s.done = ['DC-L01'];
    expect(validSave(JSON.parse(JSON.stringify(s)))).toBe(true);
    expect(validSave({ ...s, schemaVersion: 2 })).toBe(false);
    expect(validSave({ ...s, free: { ops: [{ t: 'stroke', color: 'pink', size: 'm', pts: [[0, 0]] }], n: 1 } })).toBe(false);
    expect(validSave({ ...s, free: { ops: [], n: 3 } })).toBe(false);
    expect(validSave({ ...s, done: ['X'] })).toBe(false);
    expect(validSave(null)).toBe(false);
  });

  const roundTrip = (x: unknown) => validSave(JSON.parse(JSON.stringify(x)));

  it('D4: what the app writes is what the reader accepts (2000/2001 ops, 2000/2001 points, compaction, full paper)', () => {
    expect(MAX_OPS).toBe(2000);
    const s = blankSave();
    for (let i = 0; i < MAX_OPS; i++) s.free = pushFree(s.free, stroke())!;
    expect(s.free.ops).toHaveLength(2000);
    expect(roundTrip(s)).toBe(true);
    // the 2001st op without a "new paper" to drop: refused (the paper is full), never written past the limit
    expect(pushFree(s.free, stroke())).toBeNull();
    expect(freeFull(s.free)).toBe(true);
    expect(roundTrip({ ...s, free: { ops: [...s.free.ops, stroke()], n: 2001 } })).toBe(false); // reader limit unchanged
    // a "new paper" still works on a full paper (not undoable then)
    expect(visibleFree(clearFree(s.free))).toHaveLength(0);
    expect(roundTrip({ ...s, free: clearFree(s.free) })).toBe(true);
    // with an applied clear inside, only the hidden part before it is dropped; the visible picture is unchanged
    let h = empty<FreeOp>();
    for (let i = 0; i < 1000; i++) h = pushFree(h, stroke())!;
    h = pushFree(h, { t: 'clear' })!;
    for (let i = 0; i < 999; i++) h = pushFree(h, stroke('orange'))!;
    expect(h.ops).toHaveLength(2000);
    const before = visibleFree(h);
    h = pushFree(h, stroke('orange'))!;
    expect(h.ops.length).toBeLessThanOrEqual(MAX_OPS);
    expect(visibleFree(h)).toEqual([...before, stroke('orange')]);
    expect(roundTrip({ ...blankSave(), free: h })).toBe(true);
    // stamp grid: compaction keeps the current cells exactly
    let g = empty<GridOp>();
    for (let i = 0; i < 2000; i++) g = pushGrid(g, { t: 'cell', i: i % 9, value: { color: i % 2 ? 'red' : 'blue', shape: 'circle' } });
    const cells = gridCells(g);
    g = pushGrid(g, { t: 'cell', i: 0, value: { color: 'green', shape: 'square' } });
    expect(g.ops.length).toBeLessThanOrEqual(MAX_OPS);
    expect(gridCells(g)).toEqual([{ color: 'green', shape: 'square' }, ...cells.slice(1)]);
    expect(roundTrip({ ...blankSave(), grid: g })).toBe(true);
    // points: the app writes at most 2000; the reader accepts what the first release accepted (≤ 4999), rejects 5000
    const pts = (n: number) => Array.from({ length: n }, (_, i) => [i % 2 ? 0.1 : 0.9, 0.5] as [number, number]);
    expect(MAX_PTS).toBe(2000);
    expect(roundTrip({ ...blankSave(), free: push(empty<FreeOp>(), { ...stroke(), pts: pts(2000) }) })).toBe(true);
    expect(READ_MAX_PTS).toBe(4999);
    expect(roundTrip({ ...blankSave(), free: push(empty<FreeOp>(), { ...stroke(), pts: pts(4999) }) })).toBe(true);
    expect(roundTrip({ ...blankSave(), free: push(empty<FreeOp>(), { ...stroke(), pts: pts(5000) }) })).toBe(false);
    for (const n of [4999, 5000]) {
      const parts = splitPoints(pts(n));
      expect(parts.every((p) => p.length <= MAX_PTS && p.length > 1)).toBe(true);
      parts.slice(1).forEach((p, k) => expect(p[0]).toEqual(parts[k][parts[k].length - 1])); // no gap
      expect(new Set(parts.flat().map((p) => p.join()))).toEqual(new Set(pts(n).map((p) => p.join())));
      let fh = empty<FreeOp>();
      for (const p of parts) fh = pushFree(fh, { ...stroke(), pts: p })!;
      expect(roundTrip({ ...blankSave(), free: fh })).toBe(true);
    }
  });

  const mem = (init: Record<string, string>, failBackup = false, failAll = false) => {
    const m = new Map(Object.entries(init));
    return {
      m,
      store: {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (failAll || (failBackup && k.includes('.backup-'))) throw new Error('QuotaExceededError');
          m.set(k, v);
        },
      },
    };
  };

  it('D3: unreadable, newer-version or uncopyable saves are never overwritten', () => {
    // invalid JSON: copied aside first, then a fresh page writes the main key
    let t = mem({ [KEY]: '{' });
    let r = loadSave(t.store);
    expect(r.notice).toBe('broken');
    expect(r.target).toBe(KEY);
    expect(t.m.get(backupKey('{'))).toBe('{');
    expect(r.oldRaw).toBe('{');
    expect(loadSave(t.store).target).toBe(KEY); // reloading does not pile up copies
    expect([...t.m.keys()].filter((k) => k.includes('.backup-'))).toHaveLength(1);
    // newer version: kept, not read
    const future = JSON.stringify({ schemaVersion: 3, art: 'sentinel' });
    t = mem({ [KEY]: future });
    r = loadSave(t.store);
    expect(r.notice).toBe('brokenFuture');
    expect(t.m.get(backupKey(future))).toBe(future);
    // copy fails: the main key is not a write target; the drawing goes to the alternate key
    t = mem({ [KEY]: future }, true);
    r = loadSave(t.store);
    expect(r.notice).toBe('brokenNoBackup');
    expect(r.target).toBe(ALT);
    expect(r.oldRaw).toBe(future);
    const next = { ...r.s, free: push(r.s.free, stroke()) };
    t.store.setItem(r.target!, JSON.stringify(next));
    expect(t.m.get(KEY)).toBe(future);
    // the next visit continues the alternate drawing and still protects the original
    r = loadSave(t.store);
    expect(r.target).toBe(ALT);
    expect(visibleFree(r.s.free)).toHaveLength(1);
    expect(t.m.get(KEY)).toBe(future);
    // nothing writable at all
    t = mem({ [KEY]: '{', [ALT]: '{' }, true);
    expect(loadSave(t.store)).toMatchObject({ notice: 'brokenNoSave', target: null });
    expect(loadSave({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} })).toMatchObject({ notice: 'noStorage', target: null });
    expect(readSave(() => null).kind).toBe('empty');
  });

  it('D1: the open paper and the task in progress are saved; older saves still load with every drawing', () => {
    const old = { schemaVersion: 1, free: push(empty<FreeOp>(), stroke()), grid: empty<GridOp>(), done: ['DC-L01'], level: 'easy', mixedColors: ['orange'] };
    expect(validSave(old)).toBe(true);
    const m = migrate(old as never);
    expect(m).toMatchObject({ surface: 'free', active: null, done: ['DC-L01'] });
    expect(visibleFree(m.free)).toHaveLength(1);
    const l4 = LESSONS[3];
    const s = { ...blankSave(), surface: 'grid' as const, active: { ...newRun(l4.id), mixed: ['tint_blue'], marks: { light_blue: 1 } } };
    const back = readSave(() => JSON.stringify(s));
    expect(back.kind).toBe('ok');
    if (back.kind !== 'ok') return;
    expect(back.save.surface).toBe('grid');
    expect(lessonStep(l4, back.save.active!, 'easy')).toBe('apply');
    expect(lessonStep(l4, { ...back.save.active!, marks: { ...back.save.active!.marks, blue: 1 } }, 'easy')).toBe('done');
    expect(validSave({ ...s, surface: 'wall' })).toBe(false);
    expect(validSave({ ...s, active: { ...s.active, lessonId: 'X' } })).toBe(false);
    expect(validSave({ ...s, active: { ...s.active, marks: { pink: 1 } } })).toBe(false);
  });

  it('D4-R1: saves the first release accepted (strokes of 2000/2001/4999 points) open unchanged, with undo/redo', () => {
    const pts = (n: number) => Array.from({ length: n }, (_, i) => [i / (n + 1), i % 2 ? 0.1 : 0.9] as [number, number]);
    for (const n of [2000, 2001, 4999]) {
      const ops = [{ ...stroke(), pts: pts(n) }, { ...stroke('orange'), size: 'l', erase: true, pts: pts(3) }];
      const raw = JSON.stringify({ schemaVersion: 1, free: { ops, n: 1 }, grid: empty(), done: ['DC-L01'], level: 'easy', mixedColors: ['orange'] });
      const t = mem({ [KEY]: raw });
      const r = loadSave(t.store);
      expect(r.notice).toBeNull();
      expect(r.target).toBe(KEY);
      expect(r.s.free).toEqual({ ops, n: 1 }); // same points, order, colour, size, eraser, redo branch
      expect(visibleFree(redo(r.s.free))).toHaveLength(2);
      expect([...t.m.keys()].some((k) => k.includes('.backup-'))).toBe(false);
    }
    const tooLong = JSON.stringify({ schemaVersion: 1, free: { ops: [{ ...stroke(), pts: pts(5000) }], n: 1 }, grid: empty(), done: [], level: 'easy', mixedColors: [] });
    expect(loadSave(mem({ [KEY]: tooLong }).store).notice).toBe('broken'); // never accepted before either; kept as a backup
  });

  it('D3-R1: a drawing kept in the alternate place is continued once the backup works again, and never replaces newer work', () => {
    const future = JSON.stringify({ schemaVersion: 3, art: 'sentinel' });
    const t = mem({ [KEY]: future }, true);
    const first = loadSave(t.store);
    expect(first.target).toBe(ALT);
    t.store.setItem(ALT, JSON.stringify({ ...first.s, free: push(first.s.free, stroke()) }));
    const altRaw = t.m.get(ALT)!;
    // backups work again: the old save is copied aside, the alternate drawing moves to the main key (read back)
    const t2 = { m: t.m, store: mem({}).store };
    t2.store.getItem = (k: string) => t.m.get(k) ?? null;
    t2.store.setItem = (k: string, v: string) => void t.m.set(k, v);
    const r = loadSave(t2.store);
    expect(r.notice).toBe('restored');
    expect(r.target).toBe(KEY);
    expect(visibleFree(r.s.free)).toHaveLength(1);
    expect(t.m.get(backupKey(future))).toBe(future);
    expect(t.m.get(ALT)).toBe(altRaw); // the alternate text is left untouched, only marked as moved
    expect(t.m.get(MOVED)).toBe(backupKey(altRaw));
    // a normal change is saved to the main key; reopening keeps it and the old alternate does not come back
    t2.store.setItem(KEY, JSON.stringify({ ...r.s, surface: 'grid', free: push(r.s.free, stroke('orange')) }));
    const again = loadSave(t2.store);
    expect(again.notice).toBeNull();
    expect(again.s.surface).toBe('grid');
    expect(visibleFree(again.s.free)).toHaveLength(2);
    // a valid main save next to an alternate that was never moved: the main save wins, the other is offered as a download
    const both = mem({ [KEY]: JSON.stringify({ ...blankSave(), free: push(empty<FreeOp>(), stroke('orange')) }), [ALT]: altRaw });
    const b = loadSave(both.store);
    expect(b.notice).toBe('altKept');
    expect(b.oldRaw).toBe(altRaw);
    expect((visibleFree(b.s.free)[0] as { color: string }).color).toBe('orange');
    expect(both.m.get(ALT)).toBe(altRaw);
    // nothing in the main key but an alternate drawing: it moves back to the main key
    const only = mem({ [ALT]: altRaw });
    const o = loadSave(only.store);
    expect(o.target).toBe(KEY);
    expect(visibleFree(o.s.free)).toHaveLength(1);
    expect(only.m.get(KEY)).toBe(JSON.stringify(o.s));
  });
});
