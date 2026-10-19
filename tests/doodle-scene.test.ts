import { describe, expect, it } from 'vitest';
import { MAX_OPS, blankSave, empty, push, redo, undo } from '../shared/doodle/model';
import { SCENE_KEY, anyFilled, blankScene, pushScene, readScene, regionColors, taskMet, validScene, type SceneOp, type SceneSave } from '../shared/doodle/scene';
import { KEY, backupKey, loadKeyed, loadSave } from '../src/doodle/storage';

const cfg = { key: SCENE_KEY, read: readScene, blank: blankScene };
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
const fill = (region: 'body' | 'tail' | 'fin', color: 'red' | 'orange' | 'blue' | null): SceneOp => ({ t: 'fill', region, color });

describe('picture play: my fish (B1)', () => {
  it('DP01/DP04: regions fill with any colour, recolour, undo/redo and "new picture" are undoable', () => {
    let h = empty<SceneOp>();
    expect(anyFilled(h)).toBe(false);
    h = pushScene(h, fill('tail', 'blue')); // one region is enough to move the fish
    expect(anyFilled(h)).toBe(true);
    h = pushScene(h, fill('body', 'red'));
    h = pushScene(h, fill('body', 'orange'));
    expect(regionColors(h)).toEqual({ body: 'orange', tail: 'blue', fin: null });
    h = undo(h);
    expect(regionColors(h).body).toBe('red');
    h = redo(h);
    h = pushScene(h, { t: 'clear' });
    expect(anyFilled(h)).toBe(false);
    expect(regionColors(undo(h))).toEqual({ body: 'orange', tail: 'blue', fin: null });
    h = pushScene(undo(h), fill('fin', null)); // eraser empties a region
    expect(regionColors(h).fin).toBeNull();
  });

  it('DP02: the task needs orange mixed here and orange on at least one region; other colours are kept, not judged', () => {
    const s = (mixedOrange: boolean, ops: SceneOp[]) => ({ mixedOrange, fills: ops.reduce((h, o) => pushScene(h, o), empty<SceneOp>()) });
    expect(taskMet(s(false, [fill('body', 'orange')]))).toBe(false); // orange from the palette alone
    expect(taskMet(s(true, [fill('body', 'blue')]))).toBe(false);
    expect(taskMet(s(true, [fill('body', 'blue'), fill('fin', 'orange')]))).toBe(true);
    expect(regionColors(s(true, [fill('body', 'blue'), fill('fin', 'orange')]).fills).body).toBe('blue');
  });

  it('D4 rule for scenes: history never exceeds MAX_OPS; folding keeps the picture', () => {
    let h = empty<SceneOp>();
    for (let i = 0; i < MAX_OPS; i++) h = pushScene(h, fill(i % 2 ? 'body' : 'tail', i % 3 ? 'red' : 'blue'));
    const before = regionColors(h);
    h = pushScene(h, fill('fin', 'orange'));
    expect(h.ops.length).toBeLessThanOrEqual(MAX_OPS);
    expect(regionColors(h)).toEqual({ ...before, fin: 'orange' });
    expect(validScene({ ...blankScene(), fills: h })).toBe(true);
  });

  it('DP05: the scene has its own versioned save; it never touches the old free/grid save', () => {
    const sc: SceneSave = { ...blankScene(), open: true, mixedOrange: true, fills: pushScene(empty(), fill('body', 'orange')) };
    expect(readScene(() => JSON.stringify(sc))).toEqual({ kind: 'ok', save: sc });
    expect(validScene({ ...sc, sceneId: 'cat' })).toBe(false);
    expect(validScene({ ...sc, schemaVersion: 2 })).toBe(false);
    expect(validScene({ ...sc, fills: { ops: [{ t: 'fill', region: 'wing', color: 'red' }], n: 1 } })).toBe(false);
    expect(validScene({ ...sc, fills: { ops: [{ t: 'fill', region: 'body', color: 'pink' }], n: 1 } })).toBe(false);
    const old = JSON.stringify({ ...blankSave(), free: push(empty(), { t: 'stroke', color: 'red', size: 'm', pts: [[0.1, 0.1], [0.2, 0.2]] }) });
    const t = mem({ [KEY]: old, [SCENE_KEY]: JSON.stringify(sc) });
    const main = loadSave(t.store);
    const scene = loadKeyed(cfg, t.store);
    expect(main.notice).toBeNull();
    expect(main.s.surface).toBe('free'); // the scene value never goes into the old surface field
    expect(scene.s).toEqual(sc);
    expect(scene.target).toBe(SCENE_KEY);
    expect(t.m.get(KEY)).toBe(old);
    // nothing stored yet: a blank fish, saved under the scene key
    expect(loadKeyed(cfg, mem({}).store)).toMatchObject({ target: SCENE_KEY, notice: null, s: blankScene() });
  });

  it('DP06: broken or newer scene saves are backed up first; when the backup fails the original is never overwritten', () => {
    const future = JSON.stringify({ schemaVersion: 4, sceneId: 'fish' });
    let t = mem({ [SCENE_KEY]: future });
    let r = loadKeyed(cfg, t.store);
    expect(r.notice).toBe('brokenFuture');
    expect(t.m.get(backupKey(future, SCENE_KEY))).toBe(future);
    expect(r.target).toBe(SCENE_KEY);
    t = mem({ [SCENE_KEY]: '{' }, true);
    r = loadKeyed(cfg, t.store);
    expect(r.notice).toBe('brokenNoBackup');
    expect(r.target).toBe(`${SCENE_KEY}.recovered`);
    t.store.setItem(r.target!, JSON.stringify({ ...blankScene(), fills: pushScene(empty(), fill('tail', 'red')) }));
    expect(t.m.get(SCENE_KEY)).toBe('{');
    const again = loadKeyed(cfg, t.store);
    expect(regionColors(again.s.fills).tail).toBe('red');
    expect(t.m.get(SCENE_KEY)).toBe('{');
    expect(loadKeyed(cfg, mem({ [SCENE_KEY]: '{', [`${SCENE_KEY}.recovered`]: '{' }, true).store)).toMatchObject({ target: null, notice: 'brokenNoSave' });
    expect(loadKeyed(cfg, { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} })).toMatchObject({ target: null, notice: 'noStorage' });
  });
});
