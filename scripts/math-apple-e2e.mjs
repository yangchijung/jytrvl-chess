// Math Island M0-A — Apple Basket browser checks (Issue #9, spec MA01–MA06 parts; desktop Chromium only).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node math-apple-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/math-apple';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 900) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 400)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const errors = [];
const requests = [];
async function page(w = 1280, h = 900, opts = {}, ctx) {
  ctx = ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: opts.reduce ? 'reduce' : 'no-preference' },
  ]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|NotSupportedError|no supported source/i.test(m.text()) && errors.push(m.text()));
  p.on('request', (r) => requests.push(r.url()));
  p.ctx = ctx;
  return p;
}
const APPLE = '/math/g1/apple';
const open = async (p, path = APPLE, lang = '') => {
  await p.goto(`${BASE}${lang}${path}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector(path === APPLE ? '[data-testid=mi-apple]' : '[data-testid=mi-island]');
};
const at = (p) => p.$$eval('[data-testid^=mi-apple-]', (els) => els.map((e) => [Number(e.dataset.testid.slice(9)), e.dataset.at]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('jy.math.apple.v1') ?? 'null'));
const rect = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width, h: r.height }; });
const scrollInto = (p, sel) => p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
async function mouseDrag(p, i, tx, ty) {
  const a = await rect(p, `[data-testid=mi-apple-${i}]`);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.mouse.move(a.x + (tx - a.x) / 2, a.y + (ty - a.y) / 2, { steps: 4 });
  await p.mouse.move(tx, ty, { steps: 4 });
  await p.mouse.up();
  await sleep(250);
}
async function toBasket(p, i) {
  await scrollInto(p, '[data-testid=mi-zone-basket]');
  const b = await rect(p, '[data-testid=mi-zone-basket]');
  await mouseDrag(p, i, b.x, b.y);
}
async function solveCurrent(p) {
  const n = (await at(p)).length;
  for (let i = 0; i < n; i++) if ((await at(p))[i] !== 'basket') { await p.click(`[data-testid=mi-apple-${i}]`); await p.click('[data-testid=mi-to-basket]'); }
  const btns = await p.$$eval('[data-testid^=mi-answer-]', (els) => els.map((e) => Number(e.textContent)));
  const total = n; // count of apples on the page, not taken from the program
  if (!btns.includes(total)) throw new Error('no right answer button');
  await p.click(`[data-testid=mi-answer-${total}]`);
  await p.waitForSelector('[data-testid=mi-next]');
}

try {
  // ---------- MA01 routes ----------
  {
    const p = await page();
    for (const [lang, path] of [['', '/math'], ['', APPLE], ['/en', '/math'], ['/en', APPLE]]) {
      await open(p, path, lang);
      await p.reload({ waitUntil: 'networkidle0' });
      const robots = await p.$eval('meta[name=robots]', (m) => m.content).catch(() => 'missing');
      ok('MA01', `${lang || 'zh'} ${path} opens directly and after reload, indexable (public since the release PR)`, (await p.$(path === APPLE ? '[data-testid=mi-apple]' : '[data-testid=mi-island]')) && /^index/.test(robots), robots);
    }
    await open(p, '/math');
    await p.click('[data-testid=mi-start-apple]');
    await p.waitForSelector('[data-testid=mi-apple]');
    await p.click('[data-testid=mi-back]');
    await p.waitForSelector('[data-testid=mi-island]');
    ok('MA01', 'island → game → back to island', true);
    const robotsTxt = await (await fetch(`${BASE}/robots.txt`)).text();
    ok('MA01', 'robots.txt no longer blocks /math or /en/math; sitemap lists them', !/Disallow: \/(en\/)?math/.test(robotsTxt) && /\/math<\/loc>/.test(await (await fetch(`${BASE}/sitemap.xml`)).text()));
    await p.goto(`${BASE}/math/g1/nothing`, { waitUntil: 'networkidle0' });
    ok('MA01', 'unknown /math path shows the site 404 page', /找不到|not found|404/i.test(await p.$eval('main', (m) => m.textContent)));
    await p.ctx.close();
  }

  // ---------- MA02 actions ----------
  {
    const p = await page(1280, 1000);
    await open(p);
    await toBasket(p, 0);
    let a = await at(p);
    ok('MA02', 'mouse drag puts an apple in the basket (saved)', a[0] === 'basket' && (await state(p)).at[0] === 'basket', a.join());
    // far away: back to its place, nothing saved
    const a1 = await rect(p, '[data-testid=mi-apple-1]');
    await mouseDrag(p, 1, a1.x, a1.y + 600);
    ok('MA02', 'dropping far from any target returns the apple to where it was', (await at(p))[1] === 'pile' && (await state(p)).at[1] === 'pile');
    // 47 / 48 / 49 px from the basket's left edge (object centre)
    const res = [];
    for (const [d, i] of [[49, 1], [48, 2], [47, 3]]) {
      await scrollInto(p, '[data-testid=mi-zone-basket]');
      const b = await rect(p, '[data-testid=mi-zone-basket]');
      const pa = await rect(p, '[data-testid=mi-zone-pile-a]');
      const pb = await rect(p, '[data-testid=mi-zone-pile-b]');
      // straight below the basket (nothing else to drop on there); the piles are further away
      void pa, pb;
      await mouseDrag(p, i, b.x, b.bottom + d);
      res.push([d, (await at(p))[i]]);
    }
    ok('MA02', '47 and 48 px snap into the basket, 49 px does not', res[0][1] !== 'basket' && res[1][1] === 'basket' && res[2][1] === 'basket', JSON.stringify(res));
    // tap then tap, and keyboard, use the same action
    await p.click('[data-testid=mi-restart]');
    await p.click('[data-testid=mi-apple-4]');
    await p.click('[data-testid=mi-zone-basket]', { offset: { x: 10, y: 10 } });
    a = await at(p);
    ok('MA02', 'tap an apple, then tap the basket', a[4] === 'basket', a.join());
    // James 2026-10-21: anywhere in the basket counts — tapping an apple already in the basket also puts the held one in
    await p.click('[data-testid=mi-apple-6]');
    await p.click('[data-testid=mi-apple-4]');
    a = await at(p);
    ok('MA02', 'holding an apple, tapping an apple that is already in the basket puts the held apple in too (no empty spot needed)', a[6] === 'basket' && a[4] === 'basket' && !(await p.$('[data-testid^=mi-apple-][aria-pressed=true]')), a.join());
    // dragging by the apple's edge: the finger is just inside the basket, the apple's centre is still outside
    {
      await scrollInto(p, '[data-testid=mi-zone-basket]');
      const b = await rect(p, '[data-testid=mi-zone-basket]');
      const ap = await rect(p, '[data-testid=mi-apple-5]');
      const gx = ap.right - 4, gy = ap.y; // grab near the right edge
      await p.mouse.move(gx, gy);
      await p.mouse.down();
      await p.mouse.move((gx + b.left) / 2, (gy + b.bottom - 20) / 2, { steps: 4 });
      await p.mouse.move(b.left + 3, b.bottom - 20, { steps: 4 });
      await p.mouse.up();
      await sleep(250);
      ok('MA02', 'holding the apple by its edge: the finger just inside the basket is enough', (await at(p))[5] === 'basket', (await at(p)).join());
      // back to the state the next checks expect: only apple 4 in the basket
      await p.click('[data-testid=mi-restart]');
      await p.click('[data-testid=mi-apple-4]');
      await p.click('[data-testid=mi-zone-basket]', { offset: { x: 10, y: 10 } });
    }
    await p.focus('[data-testid=mi-apple-5]');
    await p.keyboard.press('Enter');
    await p.waitForSelector('[data-testid=mi-to-basket]');
    await p.focus('[data-testid=mi-to-basket]');
    await p.keyboard.press('Enter');
    a = await at(p);
    ok('MA02', 'keyboard: Enter on an apple, then Enter on 放進籃子', a[5] === 'basket', a.join());
    await p.focus('[data-testid=mi-apple-5]');
    await p.keyboard.press(' ');
    await p.focus('[data-testid=mi-to-pile]');
    await p.keyboard.press('Enter');
    ok('MA02', 'keyboard: take an apple back', (await at(p))[5] === 'pile');
    // repeated taps never double: click 放進籃子 twice quickly
    await p.click('[data-testid=mi-apple-6]');
    await p.$eval('[data-testid=mi-to-basket]', (b) => { b.click(); b.click(); });
    const s = await state(p);
    ok('MA02', 'double tap on 放進籃子 moves one apple once; still 7 apples', s.at.length === 7 && s.at.filter((x) => x === 'basket').length === 2 && (await at(p)).length === 7, s.at.join());
    await p.ctx.close();
  }

  // ---------- touch: second finger, cancel ----------
  {
    const p = await page(390, 844, { touch: true, dpr: 3 });
    await open(p);
    const cdp = await p.target().createCDPSession();
    const tp = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
    await p.$eval('[data-testid=mi-stage]', (e) => e.scrollIntoView({ block: 'start' }));
    await sleep(100);
    const a0 = await rect(p, '[data-testid=mi-apple-0]');
    const a3 = await rect(p, '[data-testid=mi-apple-3]');
    const b = await rect(p, '[data-testid=mi-zone-basket]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, a0.x, a0.y)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, a0.x + 10, a0.y + 20)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, a0.x + 10, a0.y + 20), tp(2, a3.x, a3.y)] });
    for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, a0.x + 10, a0.y + 20 + k * 2), tp(2, a3.x + ((b.x - a3.x) * k) / 6, a3.y + ((b.y - a3.y) * k) / 6)] });
    // lift the first finger (only the second stays), then the second
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(2, b.x, b.y)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    let a = await at(p);
    ok('MA02', 'a second finger never takes or moves an apple', a[3] === 'pile' && a.filter((x) => x === 'basket').length === 0, a.join());
    // first finger drags into the basket
    const a1 = await rect(p, '[data-testid=mi-apple-1]');
    const bb = await rect(p, '[data-testid=mi-zone-basket]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(3, a1.x, a1.y)] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(3, a1.x + ((bb.x - a1.x) * k) / 8, a1.y + ((bb.y - a1.y) * k) / 8)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    ok('MA02', 'touch drag into the basket (DPR 3, 390 px)', (await at(p))[1] === 'basket');
    // cancelled mid-drag: back to the last committed place, not counted
    const a2 = await rect(p, '[data-testid=mi-apple-2]');
    const bc = await rect(p, '[data-testid=mi-zone-basket]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(4, a2.x, a2.y)] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(4, a2.x + ((bc.x - a2.x) * k) / 8, a2.y + ((bc.y - a2.y) * k) / 8)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await sleep(300);
    a = await at(p);
    const tf = await p.$eval('[data-testid=mi-apple-2]', (e) => e.style.transform);
    ok('MA02', 'touch cancel returns the apple, nothing saved', a[2] === 'pile' && ((await state(p))?.at?.[2] ?? 'pile') === 'pile' && !tf, `${a.join()} transform=${tf}`);
    // rotation (resize) during a drag also cancels
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(5, a2.x, a2.y)] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(5, a2.x + ((bc.x - a2.x) * k) / 8, a2.y + ((bc.y - a2.y) * k) / 8)] });
    await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await sleep(200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    ok('MA02', 'rotating the screen during a drag cancels it (no move)', (await at(p))[2] === 'pile');
    await p.ctx.close();
  }

  // ---------- MA03 maths ----------
  {
    const p = await page(1280, 1000);
    await open(p);
    await p.click('[data-testid=mi-answer-7]');
    await p.screenshot({ path: `${OUT}/not-ready-1280.png`, fullPage: true });
    let msg = await p.$eval('[data-testid=mi-msg]', (e) => [e.dataset.kind, e.textContent]);
    ok('MA03', 'MR01: answering 7 with no apple moved is not accepted (neutral hint)', msg[0] === 'hint' && /先把兩堆/.test(msg[1]) && (await p.$('[data-testid=mi-next]')) === null, msg.join(' '));
    for (const i of [0, 1, 2, 3, 4, 5]) { await p.click(`[data-testid=mi-apple-${i}]`); await p.click('[data-testid=mi-to-basket]'); }
    await p.click('[data-testid=mi-answer-7]');
    ok('MA03', 'one apple still out: 7 is still not accepted', (await p.$('[data-testid=mi-next]')) === null);
    await p.click('[data-testid=mi-apple-6]');
    await p.click('[data-testid=mi-to-basket]');
    const task = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await p.screenshot({ path: `${OUT}/all-in-basket-1280.png`, fullPage: true });
    await p.click('[data-testid=mi-answer-6]');
    msg = await p.$eval('[data-testid=mi-msg]', (e) => [e.dataset.kind, e.textContent]);
    ok('MA03', 'wrong number: "再數一次看看", apples stay in the basket', /再數一次/.test(msg[1]) && (await at(p)).every((x) => x === 'basket') && task === '一共有幾顆？', `${task} | ${msg.join(' ')}`);
    await p.click('[data-testid=mi-answer-7]');
    await p.waitForSelector('[data-testid=mi-next]');
    msg = await p.$eval('[data-testid=mi-msg]', (e) => e.textContent);
    const eq = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await p.screenshot({ path: `${OUT}/right-1280.png`, fullPage: true });
    ok('MA03', 'right: "3 加 4，一共 7 顆。" and 3 + 4 = 7; next appears only now', /3 加 4，一共 7 顆/.test(msg) && eq === '3 + 4 = 7', `${eq} | ${msg}`);
    // next twice quickly advances one problem
    await p.$eval('[data-testid=mi-next]', (b) => { b.click(); b.click(); });
    await sleep(100);
    ok('MA03', 'double tap on 下一題 advances exactly one problem', (await p.$eval('[data-testid=mi-apple]', (e) => e.dataset.index)) === '1');
    const seen = ['3+4'];
    for (let k = 1; k < 5; k++) {
      const n = (await at(p)).length;
      await solveCurrent(p);
      seen.push(`${(await p.$eval('[data-testid=mi-task]', (e) => e.textContent)).replace(/\s/g, '')}:${n}`);
      if (k < 4) await p.click('[data-testid=mi-next]');
    }
    await p.click('[data-testid=mi-next]');
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('MA03', 'all five fixed problems in order, then the finished screen', seen.slice(1).join() === '2+3=5:5,4+1=5:5,1+2=3:3,4+4=8:8', seen.join());
    await p.screenshot({ path: `${OUT}/finished-1280.png` });
    await p.reload({ waitUntil: 'networkidle0' });
    ok('MA04', 'finished state survives a reload', !!(await p.$('[data-testid=mi-finished]')));
    await open(p, '/math');
    ok('MA04', 'island offers "play again" after all five', /再玩一次/.test(await p.$eval('[data-testid=mi-start-apple]', (e) => e.textContent)));
    await p.ctx.close();
  }

  // ---------- MA04 saving ----------
  {
    const p = await page(1280, 1000);
    await open(p);
    await p.click('[data-testid=mi-apple-0]');
    await p.click('[data-testid=mi-to-basket]');
    await p.reload({ waitUntil: 'networkidle0' });
    ok('MA04', 'half-done problem survives a reload', (await at(p))[0] === 'basket');
    await solveCurrent(p);
    await p.reload({ waitUntil: 'networkidle0' });
    ok('MA04', 'solved problem survives a reload (next still offered)', !!(await p.$('[data-testid=mi-next]')));
    await open(p, '/math');
    ok('MA04', 'island: continue at problem 1 (solved, not yet moved on)', /接著玩/.test(await p.$eval('[data-testid=mi-start-apple]', (e) => e.textContent)));
    // unreadable save: kept aside, starts over, says so
    await p.evaluate(() => localStorage.setItem('jy.math.apple.v1', '{"schemaVersion":1,"game":"apple"'));
    await open(p);
    const keys = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jy.math.apple.v1')));
    const kept = await p.evaluate((ks) => ks.map((k) => localStorage.getItem(k)), keys);
    ok('MA04', 'unreadable save: notice shown, original text kept in a backup key', !!(await p.$('[data-testid=mi-notice-broken]')) && kept.includes('{"schemaVersion":1,"game":"apple"'), keys.join());
    // a write that fails is reported, play continues
    await p.evaluate(() => { localStorage.clear(); Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await p.click('[data-testid=mi-restart]');
    await p.click('[data-testid=mi-apple-1]');
    await p.click('[data-testid=mi-to-basket]');
    ok('MA04', 'storage full: "沒有存好" shown, the apple still moved', !!(await p.$('[data-testid=mi-save-failed]')) && (await at(p))[1] === 'basket');
    await p.ctx.close();
  }

  // ---------- multi-tab single writer ----------
  {
    const ctx = await browser.createBrowserContext();
    const a = await page(1280, 1000, {}, ctx);
    await open(a);
    await sleep(200);
    const b = await page(1280, 1000, {}, ctx);
    await open(b);
    await sleep(300);
    const roles1 = [await a.$eval('[data-testid=mi-apple]', (e) => e.dataset.role), await b.$eval('[data-testid=mi-apple]', (e) => e.dataset.role)];
    ok('MA04', 'second tab opens view-only with 改在這裡玩', roles1.join() === 'writer,viewer' && !!(await b.$('[data-testid=mi-take-over]')), roles1.join());
    await a.bringToFront();
    await a.click('[data-testid=mi-apple-0]');
    await a.click('[data-testid=mi-to-basket]');
    await sleep(300);
    ok('MA04', 'view-only tab shows the other tab’s move (re-read from storage)', (await at(b))[0] === 'basket');
    await b.bringToFront();
    await b.click('[data-testid=mi-take-over]');
    await sleep(400);
    const roles2 = [await a.$eval('[data-testid=mi-apple]', (e) => e.dataset.role), await b.$eval('[data-testid=mi-apple]', (e) => e.dataset.role)];
    await b.click('[data-testid=mi-apple-1]');
    await b.click('[data-testid=mi-to-basket]');
    const s = await state(b);
    ok('MA04', 'take over: the first tab stops writing, the second continues from the saved progress', roles2.join() === 'viewer,writer' && s.at[0] === 'basket' && s.at[1] === 'basket', `${roles2.join()} ${s.at.join()}`);
    await ctx.close();
  }

  // ---------- MA05 sound ----------
  {
    // every clip in the code exists as a real mp3 file and matches the reviewed manifest
    const p = await page(1280, 1000);
    await open(p, '/math');
    const files = await p.evaluate(async () => {
      const m = await (await fetch('/math/audio/zh-TW/v1/manifest.json')).json();
      const out = [];
      // the manifest is shared with Packing Factory (23 clips); this game owns the apple_* clips
      for (const c of m.filter((x) => x.id.startsWith('apple_'))) {
        const r = await fetch(`/math/audio/zh-TW/v1/${c.file}`);
        const b = await r.arrayBuffer();
        out.push([c.id, r.status, r.headers.get('content-type'), b.byteLength, new Uint8Array(b)[0]]);
      }
      return out;
    });
    ok('MA05', 'all 11 clips are served as real mp3 files (200, audio/mpeg, MPEG frame)', files.length === 11 && files.every(([, st, ct, n, b0]) => st === 200 && /audio\/mpeg/.test(ct) && n > 8000 && b0 === 0xff), JSON.stringify(files.slice(0, 2)));
    await p.click('[data-testid=mi-start-apple]');
    await p.waitForSelector('[data-testid=mi-apple]');
    await sleep(600);
    const audioReq = requests.filter((u) => u.includes('/math/audio/'));
    ok('MA05', 'after 開始玩 the first prompt is played from the pre-made file (sound on by default)', audioReq.some((u) => /v1\/apple_task\.mp3/.test(u)), audioReq.slice(-2).join(' '));
    await p.click('[data-testid=mi-voice]');
    const pressed = await p.$eval('[data-testid=mi-voice]', (e) => e.getAttribute('aria-pressed'));
    await p.reload({ waitUntil: 'networkidle0' });
    const after = await p.$eval('[data-testid=mi-voice]', (e) => e.getAttribute('aria-pressed'));
    ok('MA05', 'sound can be turned off and stays off after reload', pressed === 'false' && after === 'false');
    const tts = requests.filter((u) => /tts|speech|cognitiveservices|azure/i.test(u));
    ok('MA05', 'no speech-service request while playing', tts.length === 0, tts.join());
    await p.ctx.close();
  }
  {
    // a clip that cannot be loaded: a short note, the game keeps working
    const p = await page(1280, 1000);
    await p.setRequestInterception(true);
    p.on('request', (r) => (r.url().includes('/math/audio/') ? r.abort() : r.continue()));
    await open(p);
    await p.click('[data-testid=mi-listen]');
    await sleep(800);
    const missing = !!(await p.$('[data-testid=mi-audio-missing]'));
    await p.click('[data-testid=mi-apple-0]');
    await p.click('[data-testid=mi-to-basket]');
    ok('MA05', 'missing sound file: a note, and the game still plays', missing && (await at(p))[0] === 'basket');
    await p.ctx.close();
  }

  // ---------- MA06 layout ----------
  for (const [w, h, touch, dpr] of [[768, 1024, true, 2], [1024, 768, true, 2], [390, 844, true, 3], [1280, 900, false, 1]]) {
    for (const [lang, scheme] of [['', 'light'], ['/en', 'dark']]) {
      const p = await page(w, h, { touch, dpr, scheme });
      await open(p, APPLE, lang);
      const m = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const apples = [...document.querySelectorAll('[data-testid^=mi-apple-]')].map(r);
        const zones = ['pile-a', 'pile-b', 'basket'].map((z) => r(document.querySelector(`[data-testid=mi-zone-${z}]`)));
        const over = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const btns = [...document.querySelectorAll('[data-testid=mi-apple] button, [data-testid=mi-apple] a')].map(r).filter((x) => x.width > 0);
        return {
          hscroll: document.documentElement.scrollWidth > window.innerWidth,
          applesInside: apples.every((a) => a.left >= 0 && a.right <= window.innerWidth),
          appleMin: Math.min(...apples.map((a) => Math.min(a.width, a.height))),
          overlap: over(zones[0], zones[2]) || over(zones[1], zones[2]) || over(zones[0], zones[1]),
          minBtn: Math.min(...btns.map((b) => Math.min(b.width, b.height))),
          count: apples.length,
        };
      });
      ok('MA06', `${w}×${h} ${lang || 'zh'} ${scheme}: all 7 apples visible, no overlap, no sideways scroll, targets ≥ 56/64 px`, !m.hscroll && m.applesInside && !m.overlap && m.appleMin >= 64 && m.minBtn >= 56 && m.count === 7, JSON.stringify(m));
      await p.screenshot({ path: `${OUT}/apple-${w}x${h}-${lang ? 'en' : 'zh'}-${scheme}.png`, fullPage: true });
      if (w === 768 && !lang) {
        await p.evaluate(() => (document.documentElement.style.fontSize = '200%'));
        await sleep(200);
        const t = await p.evaluate(() => ({ hscroll: document.documentElement.scrollWidth > window.innerWidth }));
        ok('MA06', '768 px with text at 200%: no sideways scroll', !t.hscroll, JSON.stringify(t));
        await p.screenshot({ path: `${OUT}/apple-768-text200.png`, fullPage: true });
      }
      await p.ctx.close();
    }
  }
  {
    const p = await page(1280, 900);
    await open(p, '/math');
    await p.screenshot({ path: `${OUT}/island-1280.png`, fullPage: true });
    await p.ctx.close();
    const q = await page(390, 844, { touch: true, dpr: 3, scheme: 'dark' });
    await open(q, '/math');
    await q.screenshot({ path: `${OUT}/island-390-dark.png`, fullPage: true });
    const hs = await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ok('MA06', 'island 390 px dark: no sideways scroll', !hs);
    await q.ctx.close();
  }
  {
    const p = await page(1280, 900, { reduce: true });
    await open(p);
    const tr = await p.$eval('[data-testid=mi-apple-0]', (e) => getComputedStyle(e).transitionDuration);
    ok('MA06', 'reduced motion: apples move without transition', /^0s/.test(tr), tr);
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
