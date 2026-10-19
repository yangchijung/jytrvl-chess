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
  ok('D-01', 'opens straight to an empty paper, no account; indexed as an official game', /^index/.test(meta) && d.s.free.ops.length === 0 && d.tool === 'brush' && (await p.$eval('h1', (e) => e.textContent)).includes('色彩塗鴉樂'), meta);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const homeLinks = await p.$$eval('main a', (a) => a.map((x) => x.getAttribute('href')));
  await tap(p, '[data-testid=rules-doodle]');
  const learnOk = await p.waitForSelector('[data-testid=learn-doodle-start]', { timeout: 8000 }).then(() => p.evaluate(() => location.pathname === '/learn/doodle')).catch(() => false);
  await tap(p, '[data-testid=learn-doodle-start]');
  const startOk = await p.waitForSelector('[data-testid=paper]', { timeout: 8000 }).then(() => p.evaluate(() => location.pathname === '/doodle')).catch(() => false);
  ok('D-02', 'A3: eighth card on the home page (Play + How to play), tutorial page leads to the paper, in the sitemap, not blocked by robots.txt', homeLinks.includes('/doodle') && homeLinks.includes('/learn/doodle') && learnOk && startOk && /\/doodle</.test(sitemap) && !/doodle/.test(robots));
  await p.ctx.close();
}

// ---------------------------------------------------------------- D-03 new home card at the 400 % layout (A3)
{
  const res = [];
  for (const lang of ['', '/en']) {
    const p = await page(351, 154, { dpr: 8, desktop: true });
    await p.goto(`${BASE}${lang}/`, { waitUntil: 'networkidle0' });
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      await p.keyboard.press('Tab');
      hit = await p.evaluate(() => {
        const a = document.activeElement;
        const id = a?.dataset?.testid ?? '';
        if (id !== 'play-doodle' && id !== 'rules-doodle') return null;
        const r = a.getBoundingClientRect();
        const h = document.querySelector('.site-header').getBoundingClientRect();
        const sticky = getComputedStyle(document.querySelector('.site-header')).position === 'sticky';
        return { id, ok: r.top - 6 >= (sticky ? h.bottom : 0) && r.bottom + 6 <= innerHeight + 0.5 && r.left >= -1 && r.right <= innerWidth + 1, top: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
      if (hit && hit.id === 'play-doodle') {
        await p.keyboard.press('Tab');
        const r2 = await p.evaluate(() => {
          const a = document.activeElement;
          const r = a.getBoundingClientRect();
          return { id: a.dataset.testid, ok: r.top - 6 >= 0 && r.bottom + 6 <= innerHeight + 0.5 };
        });
        hit = { ...hit, next: r2 };
      }
    }
    res.push({ lang: lang || 'zh', ...hit });
    await p.ctx.close();
  }
  ok('D-03', 'A3 at 351×154 CSS px @ DPR 8 (layout of real 400 % zoom; native zoom not driven): Tab reaches 開始玩／玩法 of the doodle card, fully visible with the focus ring, zh/en', res.every((r) => r.id === 'play-doodle' && r.ok && r.next?.id === 'rules-doodle' && r.next.ok), JSON.stringify(res));
}

// ---------------------------------------------------------------- DC01/DC04 drawing, undo/redo, clear, language
{
  const p = await page();
  await go(p);
  await stroke(p);
  const s1 = await D(p);
  ok('DC01-a', 'mouse draws a whole stroke; saved locally only after the write succeeded', s1.s.free.n === 1 && s1.s.free.ops[0].t === 'stroke' && s1.s.free.ops[0].pts.length > 5 && s1.saveState === 'saved' && (await p.$eval('[data-testid=save-state]', (e) => e.innerText)).includes('已存好'), JSON.stringify({ n: s1.s.free.n, pts: s1.s.free.ops[0]?.pts?.length, save: s1.saveState }));
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
  await p.waitForSelector('[data-testid=stamp-grid]'); // the open paper is kept too (D1)
  const r = await D(p);
  await tap(p, '[data-testid=surface-free]');
  // rotate: the drawing is redrawn from its strokes, not cleared
  await p.setViewport({ width: 844, height: 390 });
  await sleep(300);
  const px = await p.evaluate(() => {
    const c = document.querySelector('[data-testid=paper]');
    const s = window.__doodle.s.free.ops[0].pts[3];
    const d = c.getContext('2d').getImageData(Math.round(s[0] * c.width), Math.round(s[1] * c.height), 1, 1).data;
    return [...d];
  });
  ok('DC05-a', 'reload keeps the drawing, the stamp grid (still open) and the hint level; rotating redraws the picture (pixel still red)', r.s.free.n === 1 && r.s.grid.n === 1 && r.s.level === 'more' && r.surface === 'grid' && px[3] > 200 && px[0] > 180 && px[2] < 100, JSON.stringify(px));
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

// ---------------------------------------------------------------- D1 resume after reload (2026-10-18 fix)
{
  const p = await page(360, 800);
  await go(p);
  await tap(p, '[data-testid=surface-grid]');
  await tap(p, '[data-testid=lesson-3]');
  await tap(p, '[data-testid=mix-go]');
  const before = await D(p);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=stamp-grid]');
  const after = await D(p);
  const pressed = await p.$eval('[data-testid=lesson-3]', (b) => b.getAttribute('aria-pressed'));
  ok('D1-a', 'grid → task 3 → mix → reload: still the grid, task 3 selected, at the “use the colour” step', before.step === 'apply' && after.surface === 'grid' && after.lesson === 'DC-L03' && after.step === 'apply' && pressed === 'true', `${after.surface} ${after.lesson} ${after.step} ${pressed}`);
  // task 4: make the first blue, reload, finish with the second blue
  await tap(p, '[data-testid=lesson-4]');
  await tap(p, '[data-testid=mix-go]');
  await tap(p, '[data-testid=mix-use]');
  await sleep(300);
  await p.keyboard.press('Enter');
  await sleep(100);
  const mid = await D(p);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=stamp-grid]');
  await sleep(150);
  const back = await D(p);
  await tap(p, '[data-testid=cell-5]');
  const end = await D(p);
  ok('D1-b', 'task 4: first blue stamped, reload, the task continues with the same marks; the second blue completes it', mid.run?.marks?.light_blue === 1 && back.lesson === 'DC-L04' && back.step === 'apply' && back.run.marks.light_blue === 1 && back.color === 'blue' && end.step === 'done' && end.s.done.includes('DC-L04'), `${JSON.stringify(mid.run?.marks)} ${back.step} ${back.color} ${end.step}`);
  // an old save without the new fields still opens with its drawing
  await p.evaluate(() => localStorage.setItem('jy.doodle.v1', JSON.stringify({ schemaVersion: 1, free: { ops: [{ t: 'stroke', color: 'red', size: 'm', pts: [[0.1, 0.1], [0.4, 0.4]] }], n: 1 }, grid: { ops: [], n: 0 }, done: ['DC-L01'], level: 'easy', mixedColors: [] })));
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const old = await D(p);
  ok('D1-c', 'a save from before this fix opens on the free paper with its stroke and completed task', old.surface === 'free' && old.s.free.n === 1 && old.s.done.join() === 'DC-L01' && !old.notice, JSON.stringify({ s: old.surface, n: old.s.free.n, notice: old.notice }));
  await p.ctx.close();
}

// ---------------------------------------------------------------- D2 after mixing, the result and the way back to the paper stay in reach
{
  const visible = (p, sel) => p.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), ok: r.top >= 0 && r.bottom <= innerHeight + 1 };
  });
  const fails = [];
  for (const [w, h, surf, opts] of [[360, 800, 'free', {}], [360, 800, 'grid', {}], [768, 1024, 'grid', {}], [1019, 700, 'free', { desktop: true }], [740, 360, 'free', { desktop: true, reduce: true }]]) {
    const p = await page(w, h, opts);
    await go(p);
    if (surf === 'grid') await tap(p, '[data-testid=surface-grid]');
    await tap(p, `[data-testid=lesson-${surf === 'grid' ? 3 : 1}]`);
    await tap(p, '[data-testid=mix-go]');
    await sleep(500);
    const res = await visible(p, '[data-testid=mix-result]');
    const use = await visible(p, '[data-testid=mix-use]');
    const label = await p.$eval('[data-testid=mix-use]', (b) => b.textContent.trim());
    const f1 = await p.evaluate(() => document.activeElement?.dataset.testid ?? document.activeElement?.tagName);
    // colour picks never move the page
    const y0 = await p.evaluate(() => scrollY);
    await p.$eval('[data-testid=swatch-yellow]', (b) => b.click());
    await sleep(300);
    const y1 = await p.evaluate(() => scrollY);
    // keyboard activation of the action
    await p.focus('[data-testid=mix-use]');
    await p.keyboard.press('Enter');
    await sleep(opts.reduce ? 80 : 700);
    const target = surf === 'grid' ? '[data-testid=stamp-grid]' : '[data-testid=paper]';
    const t = await p.$eval(target, (e) => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight };
    });
    const hint = await visible(p, '[data-testid=doodle-hint]');
    const f2 = await p.evaluate(() => document.activeElement?.dataset.testid ?? document.activeElement?.tagName);
    const d = await D(p);
    const want = surf === 'grid' ? '去蓋印章' : '用這色畫';
    // a short screen cannot show all of the paper: its top must be on screen and the focus on it
    const seen = t.top >= 0 && t.top < t.h * 0.6 && (t.bottom <= t.h + 1 || h < 500);
    const good = res.ok && use.ok && label === want && f1 === 'mix-go' && y0 === y1 && seen && (h < 500 || hint.ok) && (surf === 'grid' ? f2?.startsWith('cell-') : f2 === 'paper') && d.color === (surf === 'grid' ? 'purple' : 'orange');
    if (!good) fails.push(`${w}×${h} ${surf} res${JSON.stringify(res)} use${use.ok} "${label}" f1=${f1} y${y0}/${y1} t${JSON.stringify(t)} hint${hint.ok} f2=${f2} ${d.color}`);
    if (w === 360) await p.screenshot({ path: `${OUT}/doodle-after-mix-${surf}-360.png` });
    await p.ctx.close();
  }
  ok('D2', 'after mixing (360 free/grid, 768 grid, 1019 free, 740×360 short with reduced motion): result, colour name and “用這色畫／去蓋印章” stay visible; focus stays on the mix button, not BODY; colour picks do not scroll; the action brings the paper/grid and hint into view and focuses the paper / grid cell', fails.length === 0, fails.join(' ; '));
}

// ---------------------------------------------------------------- D3 unreadable save when the backup cannot be written
{
  const p = await page(1280, 900);
  const raw = '{"schemaVersion":7,"art":"sentinel"}';
  await p.evaluateOnNewDocument((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('jy.doodle.v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).includes('.backup-')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  }, raw);
  await go(p);
  const n1 = await D(p);
  await stroke(p);
  const st = await p.evaluate(() => ({ main: localStorage.getItem('jy.doodle.v1'), alt: localStorage.getItem('jy.doodle.v1.recovered'), notice: document.querySelector('[data-testid=save-notice]')?.textContent ?? '', dl: !!document.querySelector('[data-testid=download-old]'), save: window.__doodle.saveState }));
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const again = await D(p);
  const main2 = await p.evaluate(() => localStorage.getItem('jy.doodle.v1'));
  ok('D3', 'unreadable (newer-version) save + backup write fails: the original key is never overwritten, the drawing goes to a separate key and continues after reload, the page says so and offers “下載舊存檔”', n1.notice === 'brokenNoBackup' && n1.target === 'jy.doodle.v1.recovered' && st.main === raw && JSON.parse(st.alt).free.n === 1 && st.notice.includes('沒辦法另外備份') && st.dl && st.save === 'saved' && again.s.free.n === 1 && main2 === raw, JSON.stringify({ ...st, alt: !!st.alt }));
  await p.ctx.close();
}

// ---------------------------------------------------------------- D3-R1 / D4-R1 second recheck (2026-10-18)
{
  const p = await page(1280, 900);
  await go(p);
  const raw = '{"schemaVersion":7,"art":"sentinel"}';
  await p.evaluate((raw) => {
    localStorage.clear();
    localStorage.setItem('jy.doodle.v1', raw);
    const op = { t: 'stroke', color: 'blue', size: 'm', pts: [[0.1, 0.1], [0.5, 0.5]] };
    localStorage.setItem('jy.doodle.v1.recovered', JSON.stringify({ schemaVersion: 1, free: { ops: [op], n: 1 }, grid: { ops: [], n: 0 }, done: [], level: 'easy', mixedColors: [] }));
  }, raw);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const r1 = await p.evaluate(() => ({ notice: window.__doodle.notice, target: window.__doodle.target, n: window.__doodle.s.free.n, text: document.querySelector('[data-testid=save-notice]')?.textContent ?? '', mainOk: JSON.parse(localStorage.getItem('jy.doodle.v1')).free?.n, backup: Object.entries(localStorage).some(([k, v]) => k.startsWith('jy.doodle.v1.backup-') && v.includes('sentinel')) }));
  await tap(p, '[data-testid=surface-grid]');
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=stamp-grid]');
  const r2 = await D(p);
  ok('D3-R1', 'drawing kept in the alternate place + backup works again: the old save is copied aside, the drawing moves to the main key and opens; after a normal change and reload it is still there and the old alternate does not return', r1.notice === 'restored' && r1.target === 'jy.doodle.v1' && r1.n === 1 && r1.text.includes('接著畫') && r1.mainOk === 1 && r1.backup && r2.s.free.n === 1 && r2.surface === 'grid' && !r2.notice, JSON.stringify({ r1, n2: r2.s.free.n, notice2: r2.notice }));
  // first-release save with a 4999-point stroke opens unchanged
  await p.evaluate(() => {
    localStorage.clear();
    const pts = Array.from({ length: 4999 }, (_, i) => [i / 5000, i % 2 ? 0.1 : 0.9]);
    localStorage.setItem('jy.doodle.v1', JSON.stringify({ schemaVersion: 1, free: { ops: [{ t: 'stroke', color: 'red', size: 'm', pts }], n: 1 }, grid: { ops: [], n: 0 }, done: ['DC-L01'], level: 'easy', mixedColors: ['orange'] }));
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const L = await p.evaluate(() => ({ notice: window.__doodle.notice, n: window.__doodle.s.free.n, len: window.__doodle.s.free.ops[0]?.pts.length, done: window.__doodle.s.done.join() }));
  ok('D4-R1', 'a first-release save with one 4999-point stroke opens with no warning and the stroke unchanged', !L.notice && L.n === 1 && L.len === 4999 && L.done === 'DC-L01', JSON.stringify(L));
  await p.ctx.close();
}

// ---------------------------------------------------------------- D4 history and stroke limits are the same for writing and reading
{
  const p = await page(1280, 900);
  await go(p);
  await p.evaluate(() => {
    const op = { t: 'stroke', color: 'red', size: 'm', pts: [[0.1, 0.1], [0.2, 0.2]] };
    localStorage.setItem('jy.doodle.v1', JSON.stringify({ schemaVersion: 1, free: { ops: Array(2000).fill(op), n: 2000 }, grid: { ops: [], n: 0 }, done: [], level: 'easy', mixedColors: [] }));
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  await stroke(p, 0.5, 0.5, 0.2);
  const f = await p.evaluate(() => ({ n: window.__doodle.s.free.n, full: !!document.querySelector('[data-testid=paper-full]'), text: document.querySelector('[data-testid=paper-full]')?.textContent ?? '', stored: JSON.parse(localStorage.getItem('jy.doodle.v1')).free.ops.length, saved: document.querySelector('[data-testid=save-state]').innerText }));
  await tap(p, '[data-testid=tool-clear]');
  const body = await p.$eval('dialog[open] p', (e) => e.textContent);
  await tap(p, '[data-testid=clear-confirm]');
  const c = await p.evaluate(() => ({ n: window.__doodle.s.free.ops.length, full: !!document.querySelector('[data-testid=paper-full]') }));
  ok('D4-a', '2000 operations: one more stroke is not dropped silently or written past the limit — “畫紙滿了” is shown and nothing claims “已存好”; new paper still works and says it cannot be undone', f.n === 2000 && f.full && f.text.includes('畫紙滿了') && f.stored === 2000 && !f.saved.includes('已存好') && body.includes('不能復原') && !c.full && c.n <= 2000, JSON.stringify({ ...f, body, c }));
  // one stroke with more than 2000 points is saved as consecutive strokes the reader accepts
  const b = await box(p);
  await p.mouse.move(b.x + 10, b.y + 10);
  await p.mouse.down();
  for (let i = 0; i < 2300; i++) await p.mouse.move(b.x + 10 + (i % 2 ? 6 : 0) + (i % 300), b.y + 10 + Math.floor(i / 300) * 8);
  await p.mouse.up();
  await sleep(200);
  const L = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('jy.doodle.v1'));
    const strokes = s.free.ops.filter((o) => o.t === 'stroke');
    return { strokes: strokes.length, max: Math.max(...strokes.map((o) => o.pts.length)), total: strokes.reduce((a, o) => a + o.pts.length, 0), saved: window.__doodle.saveState };
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=paper]');
  const L2 = await D(p);
  ok('D4-b', 'a stroke of 2300+ points is stored as consecutive strokes of ≤ 2000 points; the save reads back after reload without a warning', L.strokes >= 2 && L.max <= 2000 && L.total > 2000 && L.saved === 'saved' && !L2.notice && L2.s.free.ops.filter((o) => o.t === 'stroke').length === L.strokes, JSON.stringify(L));
  await p.ctx.close();
}

// ---------------------------------------------------------------- B1 picture play: my fish (DP01–DP08 engineering checks)
{
  const p = await page(360, 800);
  await go(p);
  // keep a free-paper stroke to prove the old save is untouched
  await stroke(p, 0.2, 0.3, 0.3);
  await tap(p, '[data-testid=surface-fish]');
  await p.waitForSelector('[data-testid=fish]');
  const opened = await p.evaluate(() => ({ dialog: !!document.querySelector('dialog[open]'), view: window.__doodle.view, hint: document.querySelector('[data-testid=doodle-hint]').textContent, move: document.querySelector('[data-testid=fish-move]').disabled }));
  // tap the tail on the picture itself with the default red
  const tailBox = await p.$eval('[data-testid=fish-tail]', (e) => {
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width * 0.75, y: r.y + r.height / 2 };
  });
  await p.mouse.click(tailBox.x, tailBox.y);
  await sleep(100);
  const afterTap = await p.evaluate(() => ({ tail: document.querySelector('[data-testid=fish-tail]').dataset.color, move: document.querySelector('[data-testid=fish-move]').disabled, n: window.__doodle.scene.fills.n }));
  await tap(p, '[data-testid=fish-move]');
  const anim = await p.evaluate(() => document.getAnimations().length);
  await sleep(300);
  const afterMove = await p.evaluate(() => ({ n: window.__doodle.scene.fills.n, hint: document.querySelector('[data-testid=doodle-hint]').textContent, anims: document.getAnimations().filter((a) => a.playState === 'running').length }));
  ok('DP01', 'no account: 玩圖畫 opens the fish straight away (no dialog); tapping one region with any colour enables 動一下; one ~200 ms tail wag, not looping, not added to the undo history; free paper and the six tasks are still reachable', !opened.dialog && opened.view === 'fish' && opened.hint === '選個顏色，塗看看' && opened.move && afterTap.tail === 'red' && !afterTap.move && afterTap.n === 1 && anim >= 1 && afterMove.n === 1 && afterMove.anims === 0 && afterMove.hint.includes('擺了擺尾巴'), JSON.stringify({ opened, afterTap, anim, afterMove }));
  // DP02/DP03: try mixing → red + yellow → orange, result stays visible, “用這色畫” goes back to the body
  await tap(p, '[data-testid=fish-mix]');
  await sleep(400);
  const slots = await p.$$eval('[data-testid^=slot-]', (e) => e.map((x) => x.dataset.color));
  const focusMix = await p.evaluate(() => document.activeElement?.dataset.testid);
  await p.keyboard.press('Enter');
  await sleep(500);
  const res = await p.$eval('[data-testid=mix-result]', (e) => {
    const r = e.getBoundingClientRect();
    return { out: e.dataset.output, visible: r.top >= 0 && r.bottom <= innerHeight + 1, label: e.querySelector('[data-testid=mix-use]').textContent.trim() };
  });
  await p.focus('[data-testid=mix-use]');
  await p.keyboard.press('Enter');
  await sleep(700);
  const back = await p.evaluate(() => {
    const r = document.querySelector('[data-testid=fish]').getBoundingClientRect();
    return { focus: document.activeElement?.dataset.testid, color: window.__doodle.color, fishTop: Math.round(r.top), hint: document.querySelector('[data-testid=doodle-hint]').textContent };
  });
  await p.keyboard.press('Enter'); // keyboard fills the body with orange
  await sleep(150);
  const done = await p.evaluate(() => ({ body: document.querySelector('[data-testid=fish-body]').dataset.color, task: document.querySelector('[data-testid=fish-task]').dataset.done, say: document.querySelector('[data-testid=announce]').textContent, hint: document.querySelector('[data-testid=doodle-hint]').textContent, label: document.querySelector('[data-testid=region-body]').getAttribute('aria-label') }));
  ok('DP02/03', '試試混色 sets red + yellow and focuses 混一混; result orange with “用這色畫” visible at 360 px; the action returns focus to the body control; Enter colours the body orange; the task (mix_orange + orange on a region) completes and is announced; the control names its colour', slots.join() === 'red,yellow' && focusMix === 'mix-go' && res.out === 'orange' && res.visible && res.label === '用這色畫' && back.focus === 'region-body' && back.color === 'orange' && back.fishTop >= 0 && back.hint === '點身體來上色' && done.body === 'orange' && done.task === 'true' && done.say.includes('橙色用在小魚上了') && done.hint === '橙色用在小魚上了' && done.label === '身體：橙色', JSON.stringify({ slots, focusMix, res, back, done }));
  // DP04: recolour, undo/redo, PNG
  await tap(p, '[data-testid=swatch-blue]');
  await tap(p, '[data-testid=region-fin]');
  await tap(p, '[data-testid=tool-undo]');
  const u = await p.$eval('[data-testid=fish-fin]', (e) => e.dataset.color);
  await tap(p, '[data-testid=tool-redo]');
  const r = await p.$eval('[data-testid=fish-fin]', (e) => e.dataset.color);
  await p.evaluate(() => {
    window.__png = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => (window.__png.push(b), orig(b));
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = this.download;
    };
  });
  await tap(p, '[data-testid=fish-move]'); // export right after a wag: the picture must be the still pose
  await tap(p, '[data-testid=tool-export]');
  await sleep(600);
  const png = await p.evaluate(async () => {
    const blob = window.__png.at(-1);
    const img = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const at = (vx, vy) => [...x.getImageData(Math.round((vx / 400) * img.width), Math.round((vy / 300) * img.height), 1, 1).data].slice(0, 3).join();
    return { w: img.width, h: img.height, corner: at(4, 4), body: at(170, 170), tail: at(345, 150), fin: at(190, 50), name: window.__dl };
  });
  ok('DP04', 'recolour, undo and redo work per region; PNG 1600×1200 on white with the same colours in the same places (orange body, red tail, blue fin), no interface, still pose', u === '' && r === 'blue' && png.w === 1600 && png.h === 1200 && png.corner === '255,255,255' && png.body === '232,121,45' && png.tail === '214,64,52' && png.fin === '40,100,180' && /^color-doodle-\d{8}-\d{4}\.png$/.test(png.name), JSON.stringify({ u, r, png }));
  // DP05: reload, language switch, the old free-paper save untouched
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=fish]');
  const re = await D(p);
  await Promise.all([p.waitForFunction(() => location.pathname === '/en/doodle'), p.click('[data-testid=lang-switch]')]);
  await p.waitForSelector('[data-testid=fish]');
  const en = await p.evaluate(() => ({ view: window.__doodle.view, body: document.querySelector('[data-testid=fish-body]').dataset.color, label: document.querySelector('[data-testid=region-body]').getAttribute('aria-label'), move: document.querySelector('[data-testid=fish-move]').textContent.trim() }));
  const stored = await p.evaluate(() => ({ main: JSON.parse(localStorage.getItem('jy.doodle.v1')), scene: JSON.parse(localStorage.getItem('jy.doodle.scene.v1')) }));
  await tap(p, '[data-testid=surface-free]');
  const freeBack = await D(p);
  ok('DP05', 'reload and switching to English keep the fish, its colours and the finished task; the scene lives in its own key; the old free/grid save keeps its stroke and only free/grid in surface', re.view === 'fish' && re.scene.done && re.scene.fills.n >= 3 && en.view === 'fish' && en.body === 'orange' && en.label === 'Body: Orange' && en.move === 'Make it move' && stored.main.free.n === 1 && ['free', 'grid'].includes(stored.main.surface) && stored.scene.sceneId === 'fish' && freeBack.view === 'free' && freeBack.s.free.n === 1, JSON.stringify({ reView: re.view, en, mainSurface: stored.main.surface, mainN: stored.main.free.n, freeBack: freeBack.view }));
  await p.screenshot({ path: `${OUT}/doodle-fish-360.png`, fullPage: true });
  await p.ctx.close();
}
{
  // DP06: a newer-version scene save + backup write failure: never overwritten, drawing goes to the scene's alternate key
  const p = await page(1280, 900);
  const raw = '{"schemaVersion":5,"sceneId":"fish","art":"sentinel"}';
  await p.evaluateOnNewDocument((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('jy.doodle.scene.v1', raw);
      sessionStorage.setItem('seeded', '1');
    }
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).includes('.backup-')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  }, raw);
  await go(p);
  await tap(p, '[data-testid=surface-fish]');
  await tap(p, '[data-testid=region-body]');
  const st = await p.evaluate(() => ({ main: localStorage.getItem('jy.doodle.scene.v1'), alt: JSON.parse(localStorage.getItem('jy.doodle.scene.v1.recovered') ?? 'null'), notice: document.querySelector('[data-testid=scene-notice]')?.dataset.notice, dl: !!document.querySelector('[data-testid=scene-download-old]'), save: window.__doodle.sceneSaveState }));
  // storage full: the fish stays on screen, “not saved yet — save a picture” instead of “Saved”
  await p.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await tap(p, '[data-testid=region-tail]');
  const full = await p.evaluate(() => ({ text: document.querySelector('[data-testid=save-state]').innerText, tail: document.querySelector('[data-testid=fish-tail]').dataset.color }));
  ok('DP06', 'scene save from a newer version + backup failure: the original text is kept, the fish is saved to the scene alternate key with a notice and download; when storage is full the fish stays and “還沒存好” is shown with a picture download (never “已存好”)', st.main === raw && st.alt?.fills?.n === 1 && st.notice === 'brokenNoBackup' && st.dl && st.save === 'saved' && full.text.includes('還沒存好') && !full.text.includes('已存好') && full.tail === 'red', JSON.stringify({ ...st, alt: !!st.alt, full }));
  await p.ctx.close();
}
{
  // DP07/DP08: layouts, sizes, reduced motion
  const fails = [];
  for (const [w, h] of [[360, 800], [768, 1024], [1280, 900]])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const p = await page(w, h, { scheme, desktop: w >= 768 });
        await p.goto(`${BASE}${lang}/doodle`, { waitUntil: 'networkidle0' });
        await tap(p, '[data-testid=surface-fish]');
        await tap(p, '[data-testid=region-body]');
        const m = await p.evaluate(() => {
          const small = [...document.querySelectorAll('[data-testid=doodle] button')].filter((b) => b.offsetParent && (b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44)).map((b) => b.dataset.testid || b.textContent.slice(0, 8));
          return { over: document.documentElement.scrollWidth > innerWidth + 1, small, regions: document.querySelectorAll('[data-testid^=region-]').length, labelled: [...document.querySelectorAll('[data-testid^=region-]')].every((b) => /[:：]/.test(b.getAttribute('aria-label'))) };
        });
        if (m.over || m.small.length || m.regions !== 3 || !m.labelled) fails.push(`${w}${lang}${scheme} ${JSON.stringify(m)}`);
        if (w === 1280 && scheme === 'light') await p.screenshot({ path: `${OUT}/doodle-fish-1280-${lang ? 'en' : 'zh'}.png` });
        await p.ctx.close();
      }
  const r = await page(390, 844, { reduce: true });
  await go(r);
  await tap(r, '[data-testid=surface-fish]');
  await tap(r, '[data-testid=region-tail]');
  await tap(r, '[data-testid=fish-move]');
  const reducedAnims = await r.evaluate(() => document.getAnimations().length);
  const msg = await r.$eval('[data-testid=doodle-hint]', (e) => e.textContent);
  await r.ctx.close();
  ok('DP07/08', 'fish view at 360/768/1280 × zh/en × light/dark: no horizontal overflow, every control ≥ 44 px, three named region controls stating their colour; reduced motion: no tail animation, a visible “擺了擺尾巴” state instead', fails.length === 0 && reducedAnims === 0 && msg.includes('擺了擺尾巴'), fails.join(' ; ') + ` | reduced ${reducedAnims} ${msg}`);
}

ok('D-err', 'no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
