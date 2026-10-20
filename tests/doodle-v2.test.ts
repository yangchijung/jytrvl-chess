import { describe, expect, it } from 'vitest';
import { BASE_PAINTS, COLORS, RECIPES, blankSave, empty, mix, mixOutcome, partnersOf, pushFree, readSave, recipeOf, validSave } from '../shared/doodle/model';
import { SCENE_KEY, blankScene, pushScene, regionColors, validScene, FISH_REGIONS } from '../shared/doodle/scene';
import { V2_KEY, blankV2, fromV1, readV2, validV2, withWork, workOf, useRecent } from '../shared/doodle/v2';
import { KEY as V1_KEY } from '../src/doodle/storage';
import { DoodleStore } from '../src/doodle/v2store';

describe('Color Doodle V2 palette (CP01–CP03)', () => {
  it('CP01: 29 unique colours (5 base + 24 mixable), every result reachable from the base paints, 48 ordered inputs fixed', () => {
    expect(COLORS).toHaveLength(29);
    expect(new Set(COLORS.map((c) => c.id)).size).toBe(29);
    expect(new Set(COLORS.map((c) => c.hex.toUpperCase())).size).toBe(29);
    expect(BASE_PAINTS).toEqual(['red', 'yellow', 'blue', 'white', 'black']);
    expect(RECIPES).toHaveLength(24);
    expect(new Set(RECIPES.map((r) => r.output)).size).toBe(24);
    // reachability: repeatedly mix anything already reachable
    const have = new Set<string>(BASE_PAINTS);
    for (let changed = true; changed; ) {
      changed = false;
      for (const r of RECIPES) if (have.has(r.inputs[0]) && have.has(r.inputs[1]) && !have.has(r.output)) (have.add(r.output), (changed = true));
    }
    expect(have.size).toBe(29);
    // both orders of every recipe give the same, single answer
    let ordered = 0;
    for (const r of RECIPES)
      for (const [a, b] of [r.inputs, [r.inputs[1], r.inputs[0]]]) {
        expect(mix(a, b)?.output).toBe(r.output);
        ordered++;
      }
    expect(ordered).toBe(48);
    // the first release is unchanged
    expect(mix('red', 'yellow')?.id).toBe('mix_orange');
    expect(mix('yellow', 'blue')?.id).toBe('mix_green');
    expect(mix('blue', 'red')?.id).toBe('mix_purple');
    expect(mix('blue', 'white')?.id).toBe('tint_blue');
    expect(COLORS.find((c) => c.id === 'light_blue')?.hex).toBe('#91B9E6');
  });

  it('CP02: the chains from the spec, and results can be mixed again', () => {
    expect(mix('white', 'red')?.output).toBe('pink');
    expect(mix('red', 'white')?.output).toBe('pink');
    expect(mix('pink', 'white')?.output).toBe('pale_pink');
    expect(mix('orange', 'white')?.output).toBe('peach');
    expect(mix('orange', 'blue')?.output).toBe('brown');
    expect(mix('brown', 'white')?.output).toBe('tan');
    expect(mix('blue', 'black')?.output).toBe('dark_blue');
    expect(mix('black', 'white')?.output).toBe('gray');
    expect(recipeOf('pale_pink')?.inputs).toEqual(['pink', 'white']);
    // adding white makes it lighter (relative luminance goes up) for every tint recipe
    const lum = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, v, k) => a + v * [0.2126, 0.7152, 0.0722][k], 0);
    for (const r of RECIPES.filter((x) => x.inputs.includes('white'))) {
      const other = r.inputs[0] === 'white' ? r.inputs[1] : r.inputs[0];
      expect(lum(COLORS.find((c) => c.id === r.output)!.hex)).toBeGreaterThan(lum(COLORS.find((c) => c.id === other)!.hex));
    }
  });

  it('CP03: same colour stays itself, pairs outside the table invent nothing, partners are listed', () => {
    expect(mixOutcome('red', 'red')).toEqual({ kind: 'same', color: 'red' });
    expect(mixOutcome('red', 'green')).toEqual({ kind: 'none' });
    expect(mixOutcome('pink', 'black')).toEqual({ kind: 'none' });
    expect(partnersOf('red').sort()).toEqual(['blue', 'orange', 'purple', 'white', 'yellow']);
    expect(partnersOf('white')).toContain('pink');
    for (const c of COLORS) for (const p of partnersOf(c.id)) expect(mix(c.id, p)).not.toBeNull();
  });
});

/** A V1 save the first release could have written (free strokes, stamp grid, a task, the fish). */
function v1Data() {
  const main = { ...blankSave(), free: pushFree(empty(), { t: 'stroke', color: 'orange', size: 'm', pts: [[0.1, 0.2], [0.3, 0.4]] })!, grid: { ops: [{ t: 'cell' as const, i: 4, value: { color: 'light_blue', shape: 'square' as const } }], n: 1 }, done: ['DC-L01'], mixedColors: ['orange'], surface: 'grid' as const };
  const scene = { ...blankScene(), open: true, mixedOrange: true, done: true, fills: pushScene(empty(), { t: 'fill', region: 'body', color: 'orange' }) };
  return { main, scene };
}
function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v) };
}
const noLocks = () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

describe('Color Doodle V2 saving (CP07, CP08)', () => {
  it('CP07: the first V2 document imports the complete V1 save once; the V1 text is never changed', () => {
    noLocks();
    const { main, scene } = v1Data();
    expect(validSave(main) && validScene(scene)).toBe(true);
    const v1Text = JSON.stringify(main);
    const sceneText = JSON.stringify(scene);
    const st = mem({ [V1_KEY]: v1Text, [SCENE_KEY]: sceneText });
    const a = new DoodleStore(st);
    a.start();
    expect(a.v.origin).toBe('v1');
    expect(a.v.free).toEqual(main.free);
    expect(a.v.grid).toEqual(main.grid);
    expect(a.v.done).toEqual(['DC-L01']);
    expect(a.v.view).toBe('scene');
    expect(regionColors(workOf(a.v, 'fish').fills).body).toBe('orange');
    expect(workOf(a.v, 'fish').done).toBe(true);
    expect(st.m.get(V1_KEY)).toBe(v1Text);
    expect(st.m.get(SCENE_KEY)).toBe(sceneText);
    expect(readV2(() => st.m.get(V2_KEY) ?? null).kind).toBe('ok'); // written right away
    // new work in V2 (a V2-only colour), then an old cached tab changes V1: never imported again
    a.commit(useRecent(withWork(a.v, 'fish', { ...workOf(a.v, 'fish'), fills: pushScene(workOf(a.v, 'fish').fills, { t: 'fill', region: 'tail', color: 'pale_pink' }) }), 'pale_pink'));
    st.m.set(V1_KEY, JSON.stringify({ ...main, done: [] }));
    const b = new DoodleStore(st);
    expect(regionColors(workOf(b.v, 'fish').fills).tail).toBe('pale_pink');
    expect(b.v.done).toEqual(['DC-L01']);
    expect(b.imported).toBe(false);
  });

  it('V2 colours never go into the V1 format; V1 readers reject them; V2 accepts all 29', () => {
    const s = { ...blankSave(), mixedColors: ['pink'] };
    expect(validSave(s)).toBe(false);
    expect(readSave(() => JSON.stringify(s)).kind).toBe('broken');
    for (const c of COLORS) {
      for (const r of FISH_REGIONS) {
        const v = withWork(blankV2(), 'fish', { ...workOf(blankV2(), 'fish'), fills: pushScene(empty(), { t: 'fill', region: r, color: c.id }) });
        const back = readV2(() => JSON.stringify(v));
        expect(back.kind).toBe('ok');
        if (back.kind === 'ok') expect(regionColors(workOf(back.save, 'fish').fills)[r]).toBe(c.id);
      }
      expect(validV2({ ...blankV2(), free: pushFree(empty(), { t: 'stroke', color: c.id, size: 's', pts: [[0.5, 0.5]] }) })).toBe(true);
    }
    expect(validV2({ ...blankV2(), free: pushFree(empty(), { t: 'stroke', color: 'magenta', size: 's', pts: [[0.5, 0.5]] }) })).toBe(false);
    expect(validV2({ ...blankV2(), scenes: { fish: { ...workOf(blankV2(), 'fish'), fills: { ops: [{ t: 'fill', region: 'wing', color: 'red' }], n: 1 } } } })).toBe(false);
  });

  it('CP08: an unreadable or newer V2 document is kept aside, never re-imported from V1, never overwritten', () => {
    noLocks();
    const { main } = v1Data();
    for (const raw of ['{"schemaVersion":2', JSON.stringify({ schemaVersion: 3, future: true })]) {
      const st = mem({ [V1_KEY]: JSON.stringify(main), [V2_KEY]: raw });
      const a = new DoodleStore(st);
      expect(a.notice === 'broken' || a.notice === 'brokenFuture').toBe(true);
      expect(a.v.origin).toBe('new'); // a fresh page, not the old V1 import
      expect([...st.m.entries()].some(([k, v]) => k.startsWith(`${V2_KEY}.backup-`) && v === raw)).toBe(true);
      a.start();
      a.commit(blankV2());
      expect([...st.m.entries()].some(([k, v]) => k.startsWith(`${V2_KEY}.backup-`) && v === raw)).toBe(true);
    }
    // storage full: reported, not called saved; storage unavailable: nothing written
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    const f = new DoodleStore(full);
    f.start();
    f.commit(useRecent(f.v, 'pink'));
    expect(f.status).toBe('failed');
    const denied = new DoodleStore({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('no'); } });
    expect(denied.canSave).toBe(false);
  });

  it('CP08: two tabs — the second is view-only, taking over stops the first, nothing is overwritten by the old tab', async () => {
    const held = new Map<string, (e: Error) => void>();
    const request = (name: string, opts: { ifAvailable?: boolean; steal?: boolean }, cb: (l: unknown) => Promise<void> | void) =>
      new Promise((resolve, reject) => {
        if (held.has(name) && opts.ifAvailable) return Promise.resolve(cb(null)).then(resolve, reject);
        if (held.has(name) && opts.steal) held.get(name)!(Object.assign(new Error('stolen'), { name: 'AbortError' }));
        held.set(name, reject);
        Promise.resolve(cb({ name })).then(resolve, reject);
      });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request } } });
    const flush = async () => {
      for (let k = 0; k < 5; k++) await Promise.resolve();
    };
    const st = mem();
    const a = new DoodleStore(st);
    a.start();
    await flush();
    const b = new DoodleStore(st);
    b.start();
    await flush();
    expect([a.role, b.role]).toEqual(['writer', 'viewer']);
    a.commit(useRecent(a.v, 'pink'));
    expect(b.commit(useRecent(b.v, 'gray'))).toBe(false);
    expect(JSON.parse(st.m.get(V2_KEY)!).recent).toEqual(['pink']);
    b.takeOver();
    await flush();
    expect([a.role, b.role]).toEqual(['viewer', 'writer']);
    expect(b.v.recent).toEqual(['pink']);
    expect(a.commit(useRecent(a.v, 'tan'))).toBe(false);
    b.commit(useRecent(b.v, 'mint'));
    expect(JSON.parse(st.m.get(V2_KEY)!).recent).toEqual(['mint', 'pink']);
    noLocks();
  });

  it('fromV1 with nothing valid gives a fresh document', () => {
    expect(fromV1(null, null).origin).toBe('new');
    expect(validV2(fromV1(null, null))).toBe(true);
  });
});
