// Color Doodle — preview acceptance (Issue #7, DOODLE_COLOR_LAB_V1 DC01–DC10, automatable parts).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node doodle-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/doodle';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 900) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const errors = [];
async function page(w = 1280, h = 900, opts = {}) {
  const ctx = opts.ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500 && !opts.desktop, hasTouch: w < 500 && !opts.desktop, deviceScaleFactor: opts.dpr ?? 1 });
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
  await p.waitForSelector('[data-testid=paper]');
};
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 8000 });
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(60);
};
const D = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__doodle)));
const box = (p) => p.$eval('[data-testid=paper]', (e) => {
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
async function stroke(p, fx = 0.2, fy = 0.3, len = 0.3) {
  const b = await box(p);
  await p.mouse.move(b.x + b.w * fx, b.y + b.h * fy);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.w * (fx + (len * i) / 12), b.y + b.h * (fy + 0.05 * Math.sin(i / 2)));
  await p.mouse.up();
  await sleep(80);
}
async function click(p, fx, fy) {
  const b = await box(p);
  await p.mouse.click(b.x + b.w * fx, b.y + b.h * fy);
  await sleep(80);
}
const opsLen = async (p) => (await D(p)).s.free.n;

// ---------------------------------------------------------------- D-01 basics
{
  const p = await page();
  await go(p);
  const meta = await p.$eval('meta[name=robots]', (e) => e.content);
  const d = await D(p);
  ok('D-01', 'opens straight to an empty paper, no account; noindex', /noindex/.test(meta) && d.s.free.ops.length === 0 && d.tool === 'brush' && (await p.$eval('h1', (e) => e.textContent)).includes('色彩塗鴉樂'), meta);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok('D-02', 'not on the home catalogue; robots.txt disallows /doodle', (await p.$$eval('a[href$="/doodle"]', (a) => a.length)) === 0 && /Disallow: \/doodle\n/.test(robots) && /Disallow: \/en\/doodle\n/.test(robots));
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC01/DC04 drawing, undo/redo, clear, language
{
  const p = await page();
  await go(p);
  await stroke(p);
  const s1 = await D(p);
  ok('DC01-a', 'mouse draws a whole stroke; saved locally only after the write succeeded', s1.s.free.n === 1 && s1.s.free.ops[0].t === 'stroke' && s1.s.free.ops[0].pts.length > 5 && s1.saveState === 'saved' && (await p.$eval('[data-testid=save-state]', (e) => e.innerText)).includes('已存好'));
  await Promise.all([p.waitForFunction(() => location.pathname === '/en/doodle'), p.click('[data-testid=lang-switch]')]);
  await p.waitForSelector('[data-testid=paper]');
  ok('DC01-b', 'switching language keeps the drawing', (await opsLen(p)) === 1 && (await p.$eval('h1', (e) => e.textContent)).includes('Color Doodle'));
  await stroke(p, 0.2, 0.6);
  await tap(p, '[data-testid=tool-undo]');
  const u = await D(p);
  await tap(p, '[data-testid=tool-redo]');
  const r = await D(p);
  await tap(p, '[data-testid=tool-undo]');
  await stroke(p, 0.5, 0.7, 0.1);
  const branch = await D(p);
  const redoDisabled = await p.$eval('[data-testid=tool-redo]', (b) => b.disabled);
  ok('DC04-a', 'undo/redo work per whole stroke; a new stroke drops the redo branch', u.s.free.n === 1 && r.s.free.n === 2 && branch.s.free.ops.length === 2 && redoDisabled);
  await tap(p, '[data-testid=tool-clear]');
  await sleep(150);
  const focusCancel = await p.evaluate(() => document.activeElement?.dataset.testid);
  await tap(p, '[data-testid=clear-cancel]');
  const kept = (await D(p)).s.free.n;
  await tap(p, '[data-testid=tool-clear]');
  await tap(p, '[data-testid=clear-confirm]');
  const cleared = await p.evaluate(() => window.__doodle.s.free.ops.at(-1).t);
  await tap(p, '[data-testid=tool-undo]');
  const restored = await p.evaluate(() => window.__doodle.s.free.n);
  ok('DC04-b', 'new paper asks first (focus on “keep drawing”); cancel keeps; confirm clears; undo brings it back', focusCancel === 'clear-cancel' && kept === 2 && cleared === 'clear' && restored === 2, `${focusCancel} ${kept} ${cleared} ${restored}`);
  // keyboard undo
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyZ');
  await p.keyboard.up('Control');
  ok('DC04-c', 'Ctrl+Z undoes from the keyboard', (await opsLen(p)) === 1);
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC08 touch, pointercancel, second finger, page scroll
{
  const p = await page(390, 844);
  await go(p);
  const b = await box(p);
  await p.touchscreen.touchStart(b.x + b.w * 0.2, b.y + b.h * 0.3);
  for (let i = 1; i <= 8; i++) await p.touchscreen.touchMove(b.x + b.w * (0.2 + i * 0.05), b.y + b.h * 0.4);
  await p.touchscreen.touchEnd();
  await sleep(100);
  const afterTouch = await opsLen(p);
  // a cancelled touch leaves nothing behind
  const cdp = await p.createCDPSession();
  const pt = (x, y, id = 1) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(b.x + b.w * 0.3, b.y + b.h * 0.6)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(b.x + b.w * 0.5, b.y + b.h * 0.65)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await sleep(100);
  const afterCancel = await opsLen(p);
  // second finger during a stroke is ignored (one stroke only)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(b.x + b.w * 0.2, b.y + b.h * 0.8, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(b.x + b.w * 0.2, b.y + b.h * 0.8, 1), pt(b.x + b.w * 0.7, b.y + b.h * 0.2, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(b.x + b.w * 0.4, b.y + b.h * 0.8, 1), pt(b.x + b.w * 0.8, b.y + b.h * 0.3, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  const afterTwo = await opsLen(p);
  const ta = await p.evaluate(() => ({ paper: getComputedStyle(document.querySelector('[data-testid=paper]')).touchAction, body: getComputedStyle(document.body).touchAction }));
  ok('DC08', 'touch draws; pointercancel leaves no line; a second finger does not add a stroke; only the paper blocks page scrolling', afterTouch === 1 && afterCancel === 1 && afterTwo === 2 && ta.paper === 'none' && ta.body !== 'none', `${afterTouch}/${afterCancel}/${afterTwo} ${JSON.stringify(ta)}`);
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC02 mixing
{
  const p = await page();
  await go(p);
  await tap(p, '[data-testid=panel-mix]');
  const res = [];
  for (const [a, b, want] of [['red', 'yellow', 'orange'], ['yellow', 'red', 'orange'], ['yellow', 'blue', 'green'], ['blue', 'yellow', 'green'], ['blue', 'red', 'purple'], ['red', 'blue', 'purple'], ['blue', 'white', 'light_blue'], ['white', 'blue', 'light_blue'], ['red', 'white', ''], ['yellow', 'yellow', '']]) {
    await tap(p, '[data-testid=mix-reset]');
    await tap(p, `[data-testid=mixpick-${a}]`);
    await tap(p, `[data-testid=mixpick-${b}]`);
    await tap(p, '[data-testid=mix-go]');
    const out = await p.$eval('[data-testid=mix-result]', (e) => e.dataset.output);
    const slotsKept = await p.$$eval('[data-testid^=slot-]', (s) => s.map((x) => x.dataset.color).join('+'));
    res.push(out === want && slotsKept === `${a}+${b}`);
  }
  const say = await p.$eval('[data-testid=announce]', (e) => e.textContent);
  const unsupported = await p.$eval('[data-testid=mix-result]', (e) => e.innerText);
  const palette = await p.$$eval('[data-testid^=swatch-]', (s) => s.map((x) => x.dataset.testid.replace('swatch-', '')));
  ok('DC02', 'red+yellow→orange, yellow+blue→green, blue+red→purple, blue+white→light blue in both orders; other pairs keep both inputs and say “not available” (no invented colour); results join the palette', res.every(Boolean) && unsupported.includes('這組還不能混') && ['orange', 'green', 'purple', 'light_blue'].every((c) => palette.includes(c)), `${res} | ${say}`);
  await tap(p, '[data-testid=mix-reset]');
  await tap(p, '[data-testid=mixpick-red]');
  await tap(p, '[data-testid=mixpick-yellow]');
  await tap(p, '[data-testid=mix-go]');
  const announce = await p.$eval('[data-testid=announce]', (e) => [e.getAttribute('role'), e.getAttribute('aria-live'), e.textContent]);
  await tap(p, '[data-testid=mix-use]');
  ok('DC02-b', 'one polite announcement “紅色加黃色，變成橙色。”; “use this colour” selects it for drawing', announce[0] === 'status' && announce[1] === 'polite' && announce[2] === '紅色加黃色，變成橙色。' && (await D(p)).color === 'orange', announce.join(' | '));
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC03 six tasks
{
  const p = await page();
  await go(p);
  const steps = [];
  // L1 easy: mix (guess optional), then one orange mark
  await tap(p, '[data-testid=lesson-1]');
  steps.push((await D(p)).step);
  await tap(p, '[data-testid=mix-go]');
  steps.push((await D(p)).step, (await D(p)).color);
  await stroke(p, 0.1, 0.2, 0.15);
  steps.push((await D(p)).step);
  const success1 = await p.$eval('[data-testid=lesson-success]', (e) => e.textContent).catch(() => '');
  // L2: wrong guess first is allowed; feedback; then mix and draw
  await tap(p, '[data-testid=lesson-next]');
  await tap(p, '[data-testid=choice-purple]');
  const fb = await p.$eval('[data-testid=lesson-card]', (e) => e.innerText);
  await tap(p, '[data-testid=mix-go]');
  await stroke(p, 0.1, 0.4, 0.15);
  const l2 = (await D(p)).step;
  // L3: complete with a stamp
  await tap(p, '[data-testid=lesson-next]');
  await tap(p, '[data-testid=mix-go]');
  await tap(p, '[data-testid=tool-stamp]');
  await click(p, 0.7, 0.3);
  const l3 = (await D(p)).step;
  // L4: retry and skip are always there; needs a mark in each blue
  await tap(p, '[data-testid=lesson-next]');
  await tap(p, '[data-testid=lesson-retry]');
  const afterRetry = (await D(p)).step;
  await tap(p, '[data-testid=mix-go]');
  await tap(p, '[data-testid=tool-brush]');
  await click(p, 0.8, 0.6);
  const l4a = (await D(p)).step;
  await tap(p, '[data-testid=swatch-light_blue]');
  await click(p, 0.85, 0.7);
  const l4 = (await D(p)).step;
  const done = (await D(p)).s.done;
  ok('DC03-easy', 'easy tasks 1–4: mix → use → mark completes; a wrong guess is fine; stamps count; retry resets; L4 needs both blues', steps.join() === 'mix,apply,orange,done' && success1.includes('紅加黃，變成橙') && fb.includes('看看混色結果') && l2 === 'done' && l3 === 'done' && afterRetry === 'mix' && l4a === 'apply' && l4 === 'done' && done.length === 4, `${steps} | ${l2} ${l3} ${afterRetry} ${l4a} ${l4} | ${done}`);
  await p.screenshot({ path: `${OUT}/doodle-tasks-done.png`, fullPage: true });
  // "more" level: predict step, tasks 5 and 6
  await tap(p, '[data-testid=level-more]');
  await tap(p, '[data-testid=lesson-1]');
  const predict = (await D(p)).step;
  await tap(p, '[data-testid=lesson-5]');
  await tap(p, '[data-testid=choice-blue]');
  const wrong5 = [(await D(p)).step, await p.$eval('[data-testid=lesson-card]', (e) => e.innerText)];
  await tap(p, '[data-testid=choice-orange]');
  const l5a = (await D(p)).step;
  await tap(p, '[data-testid=tool-brush]');
  await tap(p, '[data-testid=all-colours]');
  await tap(p, '[data-testid=swatch-orange]');
  await stroke(p, 0.1, 0.8, 0.1);
  await tap(p, '[data-testid=swatch-blue]');
  await stroke(p, 0.3, 0.8, 0.1);
  const l5 = (await D(p)).step;
  await tap(p, '[data-testid=lesson-next]');
  const wheel = !!(await p.$('[data-testid=wheel]'));
  await tap(p, '[data-testid=choice-green]');
  const wrong6 = (await D(p)).step;
  await tap(p, '[data-testid=choice-purple]');
  await tap(p, '[data-testid=swatch-yellow]');
  await stroke(p, 0.5, 0.85, 0.1);
  await tap(p, '[data-testid=swatch-purple]');
  await stroke(p, 0.7, 0.85, 0.1);
  const l6 = (await D(p)).step;
  await tap(p, '[data-testid=lesson-why]');
  const why = await p.$eval('[data-testid=why-text]', (e) => e.textContent);
  ok('DC03-more', '“try more”: prediction step first; task 5 needs the warm pick (wrong pick says “look again”), task 6 shows the RYB wheel and needs purple; “why” explains the paint model', predict === 'predict' && wrong5[0] === 'choose' && wrong5[1].includes('再想想') && l5a === 'apply' && l5 === 'done' && wheel && wrong6 === 'choose' && l6 === 'done' && why.includes('這裡模擬顏料'), `${predict} ${wrong5[0]} ${l5a} ${l5} ${wheel} ${wrong6} ${l6}`);
  // skip
  await tap(p, '[data-testid=lesson-2]');
  await tap(p, '[data-testid=lesson-skip]');
  ok('DC03-skip', 'skip moves to the next task without penalty', (await D(p)).lesson === 'DC-L03');
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC09 (keyboard part): stamp grid completes a task
{
  const p = await page();
  await go(p);
  await tap(p, '[data-testid=surface-grid]');
  await p.focus('[data-testid=lesson-3]');
  await p.keyboard.press('Enter');
  await p.focus('[data-testid=mix-go]');
  await p.keyboard.press('Enter');
  await sleep(80);
  const color = (await D(p)).color;
  await p.focus('[data-testid=cell-0]');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowDown');
  const focused = await p.evaluate(() => document.activeElement.dataset.testid);
  await p.keyboard.press('Enter');
  await sleep(80);
  const cell = await p.$eval('[data-testid=cell-4]', (e) => [e.dataset.content, e.getAttribute('aria-label')]);
  const say = await p.$eval('[data-testid=announce]', (e) => e.textContent);
  const step = (await D(p)).step;
  const tabs = await p.$$eval('[data-testid^=cell-]', (c) => c.map((x) => x.tabIndex).filter((t) => t === 0).length);
  ok('DC09-keyboard', 'keyboard only: start task 3, mix, arrow to the centre cell, Enter stamps purple; cell name and announcement give row/column/content; task done; one tab stop in the grid', color === 'purple' && focused === 'cell-4' && cell[0] === 'purple-circle' && cell[1].includes('第2列，第2格：紫色圓形') && say.includes('第2列，第2格：紫色圓形。') && say.includes('藍加紅，變成紫') && step === 'done' && tabs === 1, `${color} ${focused} ${cell} | ${say} | ${step}`);
  await p.screenshot({ path: `${OUT}/doodle-grid-keyboard.png`, fullPage: true });
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC05 saving, reload, rotation, broken / full storage
{
  const ctx = await browser.createBrowserContext();
  const p = await page(390, 844, { ctx, desktop: true });
  await go(p);
  await stroke(p, 0.2, 0.3, 0.5);
  await tap(p, '[data-testid=surface-grid]');
  await tap(p, '[data-testid=cell-2]');
  await tap(p, '[data-testid=level-more]');
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const r = await D(p);
  // rotate: the drawing is redrawn from its strokes, not cleared
  await p.setViewport({ width: 844, height: 390 });
  await sleep(300);
  const px = await p.evaluate(() => {
    const c = document.querySelector('[data-testid=paper]');
    const s = window.__doodle.s.free.ops[0].pts[3];
    const d = c.getContext('2d').getImageData(Math.round(s[0] * c.width), Math.round(s[1] * c.height), 1, 1).data;
    return [...d];
  });
  ok('DC05-a', 'reload keeps the drawing, the stamp grid and the hint level; rotating redraws the picture (pixel still red)', r.s.free.n === 1 && r.s.grid.n === 1 && r.s.level === 'more' && px[3] > 200 && px[0] > 180 && px[2] < 100, JSON.stringify(px));
  // broken save: kept aside, fresh paper, clear message
  await p.evaluate(() => localStorage.setItem('jy.doodle.v1', '{"schemaVersion":1,"free":{"ops":[{"t":"stroke","color":"pink"}],"n":1}}'));
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const broken = await p.evaluate(() => ({ alert: document.querySelector('[role=alert]')?.textContent ?? '', backup: Object.keys(localStorage).some((k) => k.startsWith('jy.doodle.v1.backup-')), n: window.__doodle.s.free.n }));
  ok('DC05-b', 'an unreadable save is kept as a backup, not overwritten; the page explains and starts a fresh paper', broken.alert.includes('舊的存檔讀不出來') && broken.backup && broken.n === 0, JSON.stringify(broken));
  // storage full: the picture stays and a download is offered
  await p.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await stroke(p, 0.4, 0.5, 0.2);
  const full = await p.evaluate(() => ({ text: document.querySelector('[data-testid=save-state]').innerText, n: window.__doodle.s.free.n }));
  ok('DC05-c', 'when storage is full the drawing stays on screen and “not saved yet — download” is shown', full.text.includes('還沒存好') && full.n === 1, JSON.stringify(full));
  await ctx.close();
}

// ---------------------------------------------------------------- DC06 PNG export
{
  const p = await page();
  await go(p);
  await stroke(p, 0.2, 0.3, 0.5);
  const requests = [];
  p.on('request', (r) => requests.push(r.url()));
  await p.evaluate(() => {
    window.__png = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => (window.__png.push(b), orig(b));
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = this.download;
    };
  });
  await tap(p, '[data-testid=tool-export]');
  await sleep(500);
  const check = () =>
    p.evaluate(async () => {
      const blob = window.__png.at(-1);
      const img = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const s = window.__doodle.s.free.ops[0]?.pts[4];
      const at = (fx, fy) => [...x.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), 1, 1).data];
      return { w: img.width, h: img.height, type: blob.type, corner: at(0.01, 0.01), stroke: s ? at(s[0], s[1]) : null, name: window.__dl };
    });
  const free = await check();
  await tap(p, '[data-testid=surface-grid]');
  await tap(p, '[data-testid=cell-4]');
  await tap(p, '[data-testid=tool-export]');
  await sleep(500);
  const grid = await check();
  const sent = requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'));
  ok('DC06', 'PNG export matches the paper (white background, the stroke colour at the stroke) and the stamp grid; dated file name; no network request sends the picture', free.w === 1600 && free.h === 1200 && free.type === 'image/png' && free.corner.join() === '255,255,255,255' && free.stroke[0] > 180 && free.stroke[2] < 100 && /^color-doodle-\d{8}-\d{4}\.png$/.test(free.name) && grid.w === 1200 && sent.length === 0, `${JSON.stringify(free)} | grid ${grid.w} | sent ${sent.length}`);
  await p.ctx.close();
}

// ---------------------------------------------------------------- DC07 layouts + DC10 reduced motion
{
  const fails = [];
  for (const [w, h] of [[360, 800], [768, 1024], [1280, 900]])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const p = await page(w, h, { scheme });
        await go(p, lang);
        await tap(p, '[data-testid=lesson-1]');
        const m = await p.evaluate(() => {
          const over = document.documentElement.scrollWidth > innerWidth + 1;
          const btns = [...document.querySelectorAll('[data-testid=doodle] button')].filter((b) => b.getBoundingClientRect().width);
          const small = btns.filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width < 44 || r.height < 44;
          }).map((b) => b.dataset.testid || b.textContent.slice(0, 8));
          const tools = ['tool-brush', 'tool-eraser', 'tool-stamp', 'tool-undo'].map((t) => document.querySelector(`[data-testid=${t}]`).getBoundingClientRect()).filter((r) => r.width < 48 || r.height < 48).length;
          const paperBg = getComputedStyle(document.querySelector('[data-testid=paper]')).backgroundColor;
          return { over, small, tools, paperBg };
        });
        if (m.over || m.small.length || m.tools || m.paperBg !== 'rgb(255, 255, 255)') fails.push(`${w}${lang}${scheme} ${JSON.stringify(m)}`);
        if (w !== 768) await p.screenshot({ path: `${OUT}/doodle-${w}-${lang ? 'en' : 'zh'}-${scheme}.png`, fullPage: true });
        await p.ctx.close();
      }
  ok('DC07-layout', '360/768/1280 × zh/en × light/dark: no horizontal overflow, controls ≥ 44 px, main tools ≥ 48 px, paper stays white in dark mode', fails.length === 0, fails.join(' ; '));
  // 400 % zoom layout (351×154 CSS px at DPR 8): tab through the doodle controls; none under the header or off-screen
  const p = await page(351, 154, { dpr: 8, desktop: true });
  await go(p);
  let bad = null;
  for (let i = 0; i < 45 && !bad; i++) {
    await p.keyboard.press('Tab');
    bad = await p.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body || getComputedStyle(a).position === 'fixed') return null;
      const r = a.getBoundingClientRect();
      if (!r.width) return null;
      const h = document.querySelector('.site-header');
      const sticky = getComputedStyle(h).position === 'sticky';
      const under = sticky && !h.contains(a) && r.top - 6 < h.getBoundingClientRect().bottom;
      return under || r.bottom + 6 > innerHeight + 0.5 || r.left < -1 || r.right > innerWidth + 1 ? `${a.dataset.testid || a.textContent.slice(0, 10)} ${Math.round(r.top)}-${Math.round(r.bottom)}` : null;
    });
  }
  const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok('DC07-zoom', '351×154 CSS px @ DPR 8 (the layout of real 400 % zoom; native zoom itself not driven): 45 Tab stops all fully visible, no horizontal overflow', !bad && !over, bad ?? '');
  await p.ctx.close();
  const r = await page(1280, 900, { reduce: true });
  await go(r);
  await tap(r, '[data-testid=lesson-1]');
  await tap(r, '[data-testid=mix-go]');
  await stroke(r);
  const anims = await r.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  const marks = await r.$$eval('[data-testid^=swatch-] svg', (s) => s.length);
  ok('DC10', 'reduced motion: no running animations after a task; every swatch has a shape marker, name and pressed state', anims === 0 && marks >= 4 && (await r.$$eval('[data-testid^=swatch-]', (s) => s.every((x) => x.hasAttribute('aria-pressed') && x.getAttribute('aria-label')))), `${anims} ${marks}`);
  await r.ctx.close();
}

ok('D-err', 'no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
