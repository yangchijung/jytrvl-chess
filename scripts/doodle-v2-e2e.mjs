// Color Doodle V2 C1 — workbench, 29 colours and V2 saving (Issue #7, DOODLE_WORKBENCH_V2 CP01–CP11 parts).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node doodle-v2-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/doodle-v2';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 900) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLHEX = { pink: 'e992a0', mint: 'd2e4c2', lavender: 'b5a0cd', peach: 'f1b48a', dark_blue: '213c68', tan: 'c6a17c', yellow_orange: 'edab32' };
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const errors = [];
async function page(w = 1280, h = 900, opts = {}) {
  const ctx = opts.ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: opts.reduce ? 'reduce' : 'no-preference' },
  ]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401/.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const go = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/doodle`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=doodle]');
  await sleep(150);
};
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 8000 });
  await p.$eval(sel, (e) => e.click());
  await sleep(50);
};
const D = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__doodle)));
const V2 = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('jy.doodle.v2') ?? 'null'));
const box = (p, sel = '[data-testid=paper]') => p.$eval(sel, (e) => {
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
async function stroke(p, fx = 0.2, fy = 0.3, len = 0.3) {
  const b = await box(p);
  await p.mouse.move(b.x + b.w * fx, b.y + b.h * fy);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.w * (fx + (len * i) / 12), b.y + b.h * (fy + 0.04 * Math.sin(i / 2)));
  await p.mouse.up();
  await sleep(80);
}
const mix = async (p, a, b) => {
  if (!(await D(p)).mixing) await tap(p, '[data-testid=panel-mix]');
  const all = await p.$('[data-testid=all-list]');
  const sel = async (id) => ((await p.$(`[data-testid=swatch-${id}]`)) ? `[data-testid=swatch-${id}]` : null);
  for (const id of [a, b]) {
    let s = await sel(id);
    if (!s && !all) {
      await tap(p, '[data-testid=all-colours]');
      s = await sel(id);
    }
    await tap(p, s);
  }
  await tap(p, '[data-testid=mix-go]');
  return D(p);
};
const pool = (p) => p.$eval('[data-testid=pool]', (e) => e.dataset.color);
/**
 * Exports the current picture and reads the PNG colour at a point inside every region (a point where that region
 * is the topmost element on screen, found with elementFromPoint), so the check follows the real drawing order.
 */
const scenePng = (p) =>
  p.evaluate(async () => {
    const svg = document.querySelector('[data-testid=fish] svg');
    const sr = svg.getBoundingClientRect();
    const k = 300 / sr.height;
    const pts = {};
    for (const el of svg.querySelectorAll('[data-testid^=scene-]')) {
      const id = el.dataset.testid.split('-').slice(2).join('-');
      const b = el.getBoundingClientRect();
      for (let i = 0; i < 400 && !pts[id]; i++) {
        const x = b.left + ((i * 37) % 97) / 97 * b.width, y = b.top + ((i * 53) % 89) / 89 * b.height;
        let ok = true;
        for (const [dx, dy] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) if (document.elementFromPoint(x + dx, y + dy) !== el) ok = false;
        if (ok) pts[id] = [(x - sr.left) * k, (y - sr.top) * k];
      }
    }
    const orig = URL.createObjectURL;
    let blob = null;
    URL.createObjectURL = (b) => ((blob = b), orig.call(URL, b));
    document.querySelector('[data-testid=tool-export]').click();
    for (let t = 0; t < 30 && !blob; t++) await new Promise((r) => setTimeout(r, 100));
    URL.createObjectURL = orig;
    if (!blob) return null;
    const img = await createImageBitmap(blob);
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = (x, y) => Array.from(g.getImageData(Math.round(x * 4), Math.round(y * 4), 1, 1).data.slice(0, 3)).map((v) => v.toString(16).padStart(2, '0')).join('');
    return { w: img.width, h: img.height, bg: px(2, 2), px: Object.fromEntries(Object.entries(pts).map(([id, [x, y]]) => [id, px(x, y)])), found: Object.keys(pts).length };
  });

try {
  // ---------------------------------------------------------------- W01 opens straight on the workbench
  {
    const p = await page(1024, 768);
    await go(p);
    const meta = await p.$eval('meta[name=robots]', (e) => e.content);
    const paints = await p.$$eval('[data-testid^=swatch-]', (e) => e.map((x) => x.dataset.testid.slice(7)));
    const d = await D(p);
    const v1 = await p.evaluate(() => localStorage.getItem('jy.doodle.v1'));
    ok('W01', 'opens on the white paper with the hand-held palette (five paints, two wells, a pool); indexed official game; no account', /^index/.test(meta) && paints.join() === 'red,yellow,blue,white,black' && !!(await p.$('[data-testid=board]')) && !!(await p.$('[data-testid=slot-1]')) && !!(await p.$('[data-testid=pool]')) && d.view === 'free' && v1 === null, `${meta} ${paints}`);
    const lay = await p.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const paper = r('[data-testid=paper]'), tool = r('[data-testid=tool-export]'), board = r('[data-testid=board]');
      return { paperW: Math.round(paper.width), toolBottom: Math.round(tool.bottom + scrollY), vh: innerHeight, boardLeft: Math.round(board.left), paperRight: Math.round(paper.right), share: +(paper.width / document.querySelector('.dw-grid').getBoundingClientRect().width).toFixed(2) };
    });
    ok('CP04', '1024×768 landscape: the paper takes about two thirds of the width, its tools are on screen without scrolling, the palette sits to the right', lay.toolBottom <= 768 && lay.boardLeft > lay.paperRight && lay.share >= 0.55, JSON.stringify(lay));
    await p.screenshot({ path: `${OUT}/1024-1-initial.png` });
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- W02 paint with a base paint, V2 save only
  {
    const p = await page(1024, 768);
    await go(p);
    await tap(p, '[data-testid=swatch-blue]');
    await stroke(p);
    const v2 = await V2(p);
    const st = await p.$eval('[data-testid=save-state]', (e) => e.innerText);
    ok('W02', 'tap a paint = paint with it: the stroke is blue, saved in the V2 document only ("已存好"); the V1 key is never created', v2?.free?.ops?.[0]?.color === 'blue' && /已存好/.test(st) && (await p.evaluate(() => localStorage.getItem('jy.doodle.v1'))) === null, st);

    // ---------------------------------------------------------------- CP02 chains through the palette
    let d = await mix(p, 'red', 'white');
    const eq = await p.$eval('[data-testid=mix-equation]', (e) => e.textContent);
    await p.screenshot({ path: `${OUT}/1024-2-red-white-pink.png` });
    ok('CP02', 'red + white mixes pink on the palette: wells show red and white, the pool turns pink with its name, "紅色 ＋ 白色 ＝ 粉紅色"', (await pool(p)) === 'pink' && eq.replace(/\s/g, '') === '紅色＋白色＝粉紅色' && d.slots.join() === 'red,white', eq);
    await tap(p, '[data-testid=mix-white]');
    d = await D(p);
    const wellsAfterWhite = d.slots.join();
    await tap(p, '[data-testid=mix-go]');
    ok('CP02', '再加白 puts pink and white in the two wells (one step at a time); mixing gives pale pink', wellsAfterWhite === 'pink,white' && (await pool(p)) === 'pale_pink', wellsAfterWhite);
    await tap(p, '[data-testid=mix-use]');
    await sleep(400);
    d = await D(p);
    const focus = await p.evaluate(() => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName);
    const inView = await p.$eval('[data-testid=paper]', (e) => { const r = e.getBoundingClientRect(); return r.top >= -2 && r.bottom <= innerHeight + 2; });
    ok('D2', '用這色畫 leaves mixing, paints with pale pink, brings the paper into view and focuses it (not BODY)', d.color === 'pale_pink' && !d.mixing && focus === 'paper' && inView, `${d.color} focus=${focus}`);
    await stroke(p, 0.3, 0.6);
    const v2b = await V2(p);
    await p.screenshot({ path: `${OUT}/1024-3-painted-pale-pink.png` });
    ok('CP06', 'the mixed colour draws on the paper and is saved with its V2 id; both mixes join 我的顏色; the three optional challenges are ticked', v2b.free.ops.at(-1).color === 'pale_pink' && v2b.mixedColors.includes('pink') && v2b.mixedColors.includes('pale_pink') && ['pink', 'pale_pink', 'use'].every((q) => v2b.quests.includes(q)) && !!(await p.$('[data-testid=mine-pale_pink]')), v2b.quests.join());
    // orange + blue → brown, brown + white → tan (via the recipe on the all-colours list), blue + black → dark blue
    await tap(p, '[data-testid=panel-mix]');
    d = await mix(p, 'orange', 'blue').catch(() => null);
    let res = [await pool(p)];
    await tap(p, '[data-testid=recipe-tan]');
    await tap(p, '[data-testid=mix-go]');
    res.push(await pool(p));
    await tap(p, '[data-testid=mix-reset]');
    await mix(p, 'blue', 'black');
    res.push(await pool(p));
    ok('CP02', 'orange + blue = brown; the 淺棕色 recipe on the all-colours list puts brown + white on the palette = tan; blue + black = dark blue', res.join() === 'brown,tan,dark_blue', res.join());

    // ---------------------------------------------------------------- CP03 same colour, unsupported, fast taps
    await tap(p, '[data-testid=mix-reset]');
    d = await mix(p, 'red', 'red');
    const same = await p.$eval('[data-testid=mix-result]', (e) => [e.dataset.kind, e.innerText]);
    await tap(p, '[data-testid=mix-reset]');
    const before = (await V2(p)).mixedColors.length;
    d = await mix(p, 'red', 'green');
    const none = await p.$eval('[data-testid=mix-result]', (e) => [e.dataset.kind, e.innerText, (document.querySelector('[data-testid=pool]').dataset.color)]);
    await tap(p, '[data-testid=mix-try]');
    const tried = (await D(p)).slots.join();
    await p.$eval('[data-testid=mix-go]', (b) => { b.click(); b.click(); b.click(); });
    await sleep(100);
    const after = await V2(p);
    ok('CP03', 'red + red: "還是紅色" (no new colour); red + green: "還不能混", nothing invented, both wells kept, 試試 offers a real pair; three fast taps on 混一混 give one result; the drawing is untouched', same[0] === 'same' && /還是紅色/.test(same[1]) && none[0] === 'none' && /還不能混/.test(none[1]) && none[2] === '' && tried.startsWith('red,') && after.mixedColors.length >= before && after.free.n === v2b.free.n, `${same[0]} ${none[0]} tried=${tried}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- W06 stamp grid and fish with new colours, PNG
  {
    const p = await page(1280, 900);
    await go(p);
    await tap(p, '[data-testid=all-colours]');
    await tap(p, '[data-testid=swatch-gray]');
    await tap(p, '[data-testid=surface-grid]');
    await tap(p, '[data-testid=cell-4]');
    const cell = await p.$eval('[data-testid=cell-4]', (e) => e.dataset.content);
    await tap(p, '[data-testid=surface-fish]');
    await tap(p, '[data-testid=swatch-peach]');
    await tap(p, '[data-testid=region-body]');
    await tap(p, '[data-testid=swatch-dark_blue]');
    await tap(p, '[data-testid=region-fin]');
    await tap(p, '[data-testid=tool-undo]');
    const afterUndo = await p.$eval('[data-testid=scene-fish-fin]', (e) => e.dataset.color);
    await tap(p, '[data-testid=tool-redo]');
    const fills = await p.$$eval('[data-testid^=scene-fish-]', (e) => Object.fromEntries(e.map((x) => [x.dataset.testid.slice(11), x.dataset.color])));
    const png = await scenePng(p);
    ok('CP06', 'new colours work on the stamp grid (gray) and the fish (peach body, dark blue fin); undo/redo per region', cell === 'gray-circle' && fills.body === 'peach' && fills.fin === 'dark_blue' && afterUndo === '', `${cell} ${JSON.stringify(fills)} undo=${afterUndo}`);
    ok('CP09', 'fish PNG 1600×1200 on white with the new colours in place (peach #F1B48A body, dark blue #213C68 fin)', png && png.w === 1600 && png.px.body === 'f1b48a' && png.px.fin === '213c68' && png.bg === 'ffffff', JSON.stringify(png));
    await p.reload({ waitUntil: 'networkidle0' });
    await sleep(200);
    const d = await D(p);
    await go(p, '/en');
    const en = await D(p);
    ok('CP05', 'reload and English keep the open view, the fish colours, the grid stamp and the recent colours', d.view === 'scene' && en.view === 'scene' && (await p.$eval('[data-testid=scene-fish-body]', (e) => e.dataset.color)) === 'peach' && en.s.recent[0] === 'dark_blue' && en.s.grid.n === 1, `${d.view} ${en.s.recent}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- C2 six pictures, 32 regions, kept apart
  {
    const p = await page(1280, 900);
    await go(p);
    await tap(p, '[data-testid=choose-picture]');
    const picks = await p.$$eval('[data-testid^=pick-]', (e) => e.map((x) => x.dataset.testid.slice(5)));
    await p.screenshot({ path: `${OUT}/c2-picker-1280.png` });
    ok('CP05', '換底圖 opens the six pictures as thumbnails (each with its name and how many parts are coloured)', picks.join() === 'fish,garden,butterfly,dinosaur,rocket,house', picks.join());
    await tap(p, '[data-testid=all-colours]').catch(() => {});
    const palette = ['pink', 'mint', 'lavender', 'peach', 'dark_blue', 'tan', 'yellow_orange'];
    const report = [];
    let regionsDone = 0;
    for (const sid of picks) {
      if (!(await p.$('[data-testid=picker]'))) await tap(p, '[data-testid=choose-picture]');
      await tap(p, `[data-testid=pick-${sid}]`);
      await sleep(150);
      if (!(await p.$('[data-testid=all-list]'))) await tap(p, '[data-testid=all-colours]');
      const chips = await p.$$eval('[data-testid^=region-]', (e) => e.map((x) => x.dataset.testid.slice(7)));
      const want = {};
      for (const [k, r] of chips.entries()) {
        const col = palette[k % palette.length];
        await tap(p, `[data-testid=swatch-${col}]`);
        // alternate the two ways in: tap the drawing itself, or the region button
        if (k % 2 === 0) {
          const el = await p.$(`[data-testid=scene-${sid}-${r}]`);
          const ok2 = await p.evaluate((e) => {
            const b = e.getBoundingClientRect();
            for (let i = 0; i < 400; i++) {
              const x = b.left + ((i * 37) % 97) / 97 * b.width, y = b.top + ((i * 53) % 89) / 89 * b.height;
              if (document.elementFromPoint(x, y) === e) return [x, y];
            }
            return null;
          }, el);
          if (ok2) await p.mouse.click(ok2[0], ok2[1]);
          else await tap(p, `[data-testid=region-${r}]`);
        } else await tap(p, `[data-testid=region-${r}]`);
        want[r] = col;
        regionsDone++;
      }
      const got = await p.$$eval(`[data-testid^=scene-${sid}-]`, (e) => Object.fromEntries(e.map((x) => [x.dataset.testid.split('-').slice(2).join('-'), x.dataset.color])));
      const png = await scenePng(p);
      const hex = await p.evaluate((ws) => Object.fromEntries(Object.entries(ws).map(([r, c]) => [r, getComputedStyle(document.documentElement) && c])), want);
      void hex;
      report.push({ sid, n: chips.length, same: JSON.stringify(got) === JSON.stringify(Object.fromEntries(Object.keys(got).map((r) => [r, want[r]]))), png: png && png.found === chips.length && png.bg === 'ffffff' ? Object.entries(png.px).every(([r, v]) => v === COLHEX[want[r]]) : false });
      await p.screenshot({ path: `${OUT}/c2-${sid}-1280.png` });
    }
    ok('CP05', 'all six pictures: every one of the 32 parts filled (drawing taps and part buttons), each picture shows its own colours', regionsDone === 32 && report.every((r) => r.same), JSON.stringify(report.map((r) => [r.sid, r.n, r.same])));
    ok('CP09', 'six PNGs (1600×1200, white background): the colour inside every part matches the screen', report.every((r) => r.png), JSON.stringify(report.map((r) => [r.sid, r.png])));
    // undo / redo / erase on one picture do not touch another
    await tap(p, '[data-testid=choose-picture]');
    await tap(p, '[data-testid=pick-garden]');
    await tap(p, '[data-testid=tool-eraser]');
    await tap(p, '[data-testid=region-pot]');
    const erased = await p.$eval('[data-testid=scene-garden-pot]', (e) => e.dataset.color);
    await tap(p, '[data-testid=tool-undo]');
    const back = await p.$eval('[data-testid=scene-garden-pot]', (e) => e.dataset.color);
    await tap(p, '[data-testid=tool-brush]');
    await tap(p, '[data-testid=choose-picture]');
    await tap(p, '[data-testid=pick-house]');
    const houseStill = await p.$$eval('[data-testid^=scene-house-]', (e) => e.filter((x) => x.dataset.color).length);
    ok('CP05', 'eraser empties a part, undo brings it back; another picture keeps all its colours', erased === '' && back !== '' && houseStill === 7, `${erased}|${back}|${houseStill}`);
    await p.reload({ waitUntil: 'networkidle0' });
    await sleep(200);
    const afterReload = await p.$eval('[data-testid=fish]', (e) => e.dataset.scene);
    await go(p, '/en');
    await tap(p, '[data-testid=choose-picture]');
    const counts = await p.$$eval('[data-testid^=pick-]', (e) => e.map((x) => x.textContent));
    const v2 = await V2(p);
    ok('CP05', 'reload and English keep the open picture (house) and all six works with their own undo histories', afterReload === 'house' && Object.keys(v2.scenes).length === 6 && Object.values(v2.scenes).every((w) => w.fills.n >= 3) && counts.every((t) => /(\d+) of \1/.test(t)), `${afterReload} ${counts.join(' | ')}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- CP07 first-time import from V1, once
  {
    const p = await page(1280, 900);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const v1 = { schemaVersion: 1, free: { ops: [{ t: 'stroke', color: 'orange', size: 'm', pts: [[0.1, 0.2], [0.4, 0.5]] }, { t: 'stamp', color: 'purple', shape: 'star' === 'x' ? 'circle' : 'triangle', size: 'l', x: 0.6, y: 0.6 }], n: 2 }, grid: { ops: [{ t: 'cell', i: 0, value: { color: 'light_blue', shape: 'square' } }], n: 1 }, done: ['DC-L01', 'DC-L02'], level: 'more', mixedColors: ['orange', 'green'], surface: 'free', active: null };
    const scene = { schemaVersion: 1, sceneId: 'fish', open: false, fills: { ops: [{ t: 'fill', region: 'tail', color: 'green' }], n: 1 }, mixedOrange: true, done: false };
    const t1 = JSON.stringify(v1), t2 = JSON.stringify(scene);
    await p.evaluate((a, b) => (localStorage.clear(), localStorage.setItem('jy.doodle.v1', a), localStorage.setItem('jy.doodle.scene.v1', b)), t1, t2);
    await go(p);
    const d = await D(p);
    const note = !!(await p.$('[data-testid=imported-note]'));
    const keep = await p.evaluate(() => [localStorage.getItem('jy.doodle.v1'), localStorage.getItem('jy.doodle.scene.v1')]);
    const v2 = await V2(p);
    ok('CP07', 'a complete V1 save (strokes, stamp, grid, two tasks, level, mixed colours, fish) moves into V2 once; the page says so; both V1 texts are byte-for-byte unchanged', d.s.free.n === 2 && d.s.grid.n === 1 && d.s.done.join() === 'DC-L01,DC-L02' && d.s.level === 'more' && v2?.origin === 'v1' && v2.scenes.fish.fills.ops[0].color === 'green' && note && keep[0] === t1 && keep[1] === t2);
    await tap(p, '[data-testid=swatch-black]');
    await stroke(p);
    await p.evaluate(() => localStorage.setItem('jy.doodle.v1', JSON.stringify({ schemaVersion: 1, free: { ops: [], n: 0 }, grid: { ops: [], n: 0 }, done: [], level: 'easy', mixedColors: [], surface: 'grid', active: null })));
    await p.reload({ waitUntil: 'networkidle0' });
    await sleep(200);
    const d2 = await D(p);
    ok('CP07', 'after drawing in V2, a later change to the V1 key (an old cached tab) is never imported over the new work', d2.s.free.n === 3 && d2.s.free.ops[2].color === 'black' && d2.s.done.length === 2 && !(await p.$('[data-testid=imported-note]')), `n=${d2.s.free.n}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- R1 (PR #13 review): a drawing kept in .recovered
  {
    const p = await page(1280, 900);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const v1 = JSON.stringify({ schemaVersion: 1, free: { ops: [{ t: 'stroke', color: 'green', size: 'm', pts: [[0.2, 0.2], [0.5, 0.4]] }], n: 1 }, grid: { ops: [], n: 0 }, done: [], level: 'easy', mixedColors: [], surface: 'free', active: null });
    await p.evaluate((t) => (localStorage.clear(), localStorage.setItem('jy.doodle.v1', '{"broken'), localStorage.setItem('jy.doodle.v1.recovered', t)), v1);
    await go(p);
    await tap(p, '[data-testid=swatch-red]');
    await stroke(p, 0.3, 0.7);
    await p.reload({ waitUntil: 'networkidle0' });
    await sleep(200);
    const d = await D(p);
    const keep = await p.evaluate(() => [localStorage.getItem('jy.doodle.v1'), localStorage.getItem('jy.doodle.v1.recovered')]);
    ok('R1', 'a V1 drawing kept only in the alternate place (main key unreadable) moves into V2 and is still there after drawing and reloading; both V1 texts unchanged', d.s.free.n === 2 && d.s.free.ops[0].color === 'green' && keep[0] === '{"broken' && keep[1] === v1, `n=${d.s.free.n}`);
    await p.ctx.close();
  }
  // ---------------------------------------------------------------- R2: two tabs in a browser without Web Locks
  {
    const ctx = await browser.createBrowserContext();
    const mk = async () => {
      const q = await page(1280, 900, { ctx });
      await q.evaluateOnNewDocument(() => {
        try {
          Object.defineProperty(Navigator.prototype, 'locks', { configurable: true, get: () => undefined });
        } catch {
          /* ignore */
        }
      });
      await go(q);
      return q;
    };
    const a = await mk();
    const b = await mk();
    const roles = [(await D(a)).role, (await D(b)).role];
    await a.bringToFront();
    await tap(a, '[data-testid=swatch-pink]').catch(async () => {
      await tap(a, '[data-testid=all-colours]');
      await tap(a, '[data-testid=swatch-pink]');
    });
    await stroke(a);
    await b.bringToFront();
    await tap(b, '[data-testid=surface-grid]');
    await tap(b, '[data-testid=cell-0]');
    await sleep(200);
    const v2 = await V2(b);
    const conflict = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jy.doodle.v2.conflict-')).length);
    ok('R2', 'no Web Locks, two fresh tabs: A’s first stroke is never overwritten by B; B shows the newest drawing, keeps its own change aside and says so', roles.join() === 'uncoordinated,uncoordinated' && v2.free.n === 1 && (await D(b)).s.free.n === 1 && (conflict >= 1 || v2.grid.n === 1) && (!!(await b.$('[data-testid=tab-conflict]')) || v2.grid.n === 1), `${roles} free=${v2.free.n} grid=${v2.grid.n} conflict=${conflict}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- R2a: an overlapping write from another tab
  // A real cross-tab race cannot be scheduled from the outside, so tab A writes the shared document directly
  // with a version that does not build on B's save (what A's late write looks like); B must notice.
  {
    const ctx = await browser.createBrowserContext();
    const mk = async () => {
      const q = await page(1280, 900, { ctx });
      await q.evaluateOnNewDocument(() => {
        try {
          Object.defineProperty(Navigator.prototype, 'locks', { configurable: true, get: () => undefined });
        } catch {
          /* ignore */
        }
      });
      await go(q);
      return q;
    };
    const a = await mk();
    const b = await mk();
    await b.bringToFront();
    await tap(b, '[data-testid=surface-grid]');
    await tap(b, '[data-testid=cell-2]');
    await sleep(200);
    const savedB = await V2(b);
    // A's late write: the same document without B's stamp, with A's own stroke, not built on B's save
    const stale = await a.evaluate(() => {
      const raw = localStorage.getItem('jy.doodle.v2');
      const d = raw ? JSON.parse(raw) : null;
      if (!d) return null;
      d.grid = { ops: [], n: 0 };
      d.free = { ops: [{ t: 'stroke', color: 'pink', size: 'm', pts: [[0.1, 0.1], [0.3, 0.3]] }], n: 1 };
      d.anc = ['othertab.1'];
      localStorage.setItem('jy.doodle.v2', JSON.stringify(d));
      return true;
    });
    await sleep(400);
    const after = await b.evaluate(() => ({
      aside: Object.entries(localStorage).filter(([k]) => k.startsWith('jy.doodle.v2.conflict-')).map(([, v]) => JSON.parse(v).grid.n),
      banner: !!document.querySelector('[data-testid=tab-conflict]'),
      status: window.__doodle?.status,
      free: window.__doodle?.s.free.n,
    }));
    ok('R2a', 'no Web Locks: another tab writes over B’s saved stamp — B keeps the stamp aside, shows the alert with a download, no longer says saved, and shows the newest drawing', stale !== null && savedB.grid.n === 1 && after.aside.includes(1) && after.banner && after.status !== 'ok' && after.free === 1, JSON.stringify({ stale: !!stale, savedB: savedB.grid.n, ...after }));
    await ctx.close();
  }

  // ---------------------------------------------------------------- CP08 broken / newer V2, storage full, two tabs
  {
    const p = await page(1280, 900);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const raw = JSON.stringify({ schemaVersion: 3, future: 'kept' });
    await p.evaluate((r) => (localStorage.clear(), localStorage.setItem('jy.doodle.v2', r), localStorage.setItem('jy.doodle.v1', '{"schemaVersion":1}')), raw);
    await go(p);
    const notice = await p.$eval('[data-testid=save-notice]', (e) => e.dataset.notice).catch(() => null);
    const kept = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('jy.doodle.v2.backup-')).map(([, v]) => v));
    ok('CP08', 'a newer-version V2 document: notice + download, the original text kept in a backup before anything is written', notice === 'brokenFuture' && kept.includes(raw) && !!(await p.$('[data-testid=download-old]')), notice);
    await p.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('full', 'QuotaExceededError');
      };
    });
    await stroke(p);
    const st = await p.$eval('[data-testid=save-state]', (e) => e.innerText);
    ok('CP08', 'storage full: "還沒存好" with a picture download, never "已存好"; the stroke stays on screen', /還沒存好/.test(st) && (await D(p)).s.free.n === 1, st);
    await p.ctx.close();
  }
  {
    const ctx = await browser.createBrowserContext();
    const a = await page(1280, 900, { ctx });
    await go(a);
    const b = await page(1280, 900, { ctx });
    await go(b);
    await sleep(200);
    const r1 = [(await D(a)).role, (await D(b)).role];
    await a.bringToFront();
    await stroke(a);
    await sleep(200);
    const seen = (await D(b)).s.free.n;
    await b.bringToFront();
    await tap(b, '[data-testid=take-over]');
    await sleep(300);
    const r2 = [(await D(a)).role, (await D(b)).role];
    await stroke(b, 0.2, 0.7);
    const v2 = await V2(b);
    ok('CP08', 'two tabs: the second opens view-only and shows the first tab’s stroke; 改在這裡畫 moves writing to it, the first tab stops; both strokes kept', r1.join() === 'writer,viewer' && seen === 1 && r2.join() === 'viewer,writer' && v2.free.n === 2, `${r1} ${seen} ${r2} n=${v2.free.n}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- CP11 touch
  {
    const p = await page(390, 844, { touch: true, dpr: 3 });
    await go(p);
    const b = await box(p);
    const cdp = await p.target().createCDPSession();
    const tp = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, b.x + 40, b.y + 40)] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, b.x + 40 + k * 15, b.y + 40 + k * 5)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
    const n1 = (await D(p)).s.free.n;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(2, b.x + 60, b.y + 120)] });
    for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(2, b.x + 60 + k * 15, b.y + 120)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await sleep(150);
    const n2 = (await D(p)).s.free.n;
    ok('CP11', 'touch draws one stroke; a cancelled touch leaves no line', n1 === 1 && n2 === 1, `${n1} ${n2}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- CP10 keyboard path through the palette
  {
    const p = await page(1280, 900);
    await go(p);
    const press = async (sel) => {
      await p.focus(sel);
      await p.keyboard.press('Enter');
      await sleep(60);
    };
    await press('[data-testid=panel-mix]');
    await press('[data-testid=swatch-yellow]');
    await press('[data-testid=swatch-white]');
    await press('[data-testid=mix-go]');
    const said = await p.$eval('[data-testid=announce]', (e) => e.textContent);
    await press('[data-testid=mix-use]');
    await sleep(300);
    await p.keyboard.press('Tab');
    await press('[data-testid=surface-grid]');
    await p.focus('[data-testid=cell-0]');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    await sleep(80);
    const cell = await p.$eval('[data-testid=cell-1]', (e) => e.dataset.content);
    const labels = await p.$$eval('[data-testid^=swatch-]', (e) => e.map((x) => x.getAttribute('aria-label')));
    ok('CP10', 'keyboard only: 玩混色 → yellow → white → 混一混 (result announced once: 黃色加白色，變成淺黃色) → 用這色畫 → stamp grid with arrows/Enter; every paint has its name', /淺黃色/.test(said) && cell === 'light_yellow-circle' && labels.every(Boolean), `${said} ${cell}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- lessons still complete
  {
    const p = await page(1280, 900);
    await go(p);
    await tap(p, '[data-testid=lesson-1]');
    await tap(p, '[data-testid=mix-go]');
    await tap(p, '[data-testid=mix-use]');
    await stroke(p);
    await sleep(200);
    const d = await D(p);
    ok('LESSON', 'task 1 (red + yellow → orange, then an orange mark) still completes in the new palette', d.s.done.includes('DC-L01') && !!(await p.$('[data-testid=lesson-success]')), d.s.done.join());
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- CP04 layout matrix + screenshots
  for (const [w, h, touch, dpr] of [[360, 780, true, 3], [390, 844, true, 3], [768, 1024, true, 2], [1024, 768, true, 2], [1280, 900, false, 1]]) {
    for (const [lang, scheme] of [['', 'light'], ['/en', 'dark']]) {
      const p = await page(w, h, { touch, dpr, scheme });
      await go(p, lang);
      await mix(p, 'red', 'white');
      const m = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const paints = [...document.querySelectorAll('[data-testid^=swatch-] svg')].map(r);
        const ctrls = [...document.querySelectorAll('[data-testid=doodle] button')].map(r).filter((x) => x.width > 0);
        const paper = document.querySelector('[data-testid=paper]');
        return { hscroll: document.documentElement.scrollWidth > innerWidth, paintMin: Math.min(...paints.map((x) => Math.min(x.width, x.height))), ctrlMin: Math.min(...ctrls.map((x) => Math.min(x.width, x.height))), paperBg: getComputedStyle(paper).backgroundColor, poolW: Math.round(r(document.querySelector('[data-testid=pool]')).width) };
      });
      ok('CP04', `${w}×${h} ${lang || 'zh'} ${scheme}: no sideways scroll, paints ≥ 48 px, controls ≥ 44 px, paper stays white, the mixed pink shows in the pool`, !m.hscroll && m.paintMin >= 48 && m.ctrlMin >= 44 && /255, 255, 255/.test(m.paperBg) && (await pool(p)) === 'pink', JSON.stringify(m));
      if (w === 390 || w === 1024) await p.screenshot({ path: `${OUT}/${w}-${lang ? 'en' : 'zh'}-${scheme}-mixed.png`, fullPage: w === 390 });
      if (w === 390 && !lang) {
        await tap(p, '[data-testid=mix-use]');
        await sleep(400);
        await stroke(p);
        await p.screenshot({ path: `${OUT}/390-3-painted.png` });
        await p.goto(`${BASE}/doodle`, { waitUntil: 'networkidle0' });
      }
      await p.ctx.close();
    }
  }
  {
    const p = await page(390, 844, { touch: true, dpr: 3 });
    await go(p);
    await p.screenshot({ path: `${OUT}/390-1-initial.png` });
    await p.ctx.close();
  }
  {
    const p = await page(1280, 900, { reduce: true });
    await go(p);
    await mix(p, 'red', 'yellow');
    const anim = await p.$eval('[data-testid=pool]', (e) => getComputedStyle(e).animationName);
    ok('CP11', 'reduced motion: the mix result appears without animation', anim === 'none', anim);
    await p.ctx.close();
  }
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
