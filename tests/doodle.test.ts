import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLORS, LESSONS, RECIPES, blankSave, canRedo, canUndo, empty, gridCells, isCorrectChoice, lessonStep, mix, newRun, push, redo, undo, validSave, visibleFree, type FreeOp, type GridOp } from '../shared/doodle/model';

const stroke = (color: 'red' | 'orange' = 'red'): FreeOp => ({ t: 'stroke', color, size: 'm', pts: [[0.1, 0.1], [0.2, 0.2]] });

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
});
