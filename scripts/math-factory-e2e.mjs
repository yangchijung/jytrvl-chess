// Math Island M0-B — Packing Factory browser checks (Issue #9, spec MA01–MA06 parts; desktop Chromium only).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node math-factory-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/math-factory';
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
async function page(w = 1280, h = 1000, opts = {}, ctx) {
  ctx = ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme ?? 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|NotSupportedError|no supported source/i.test(m.text()) && errors.push(m.text()));
  p.on('request', (r) => requests.push(r.url()));
  p.ctx = ctx;
  return p;
}
const F = '/math/g3/factory';
const open = async (p, path = F, lang = '') => {
  await p.goto(`${BASE}${lang}${path}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector(path === F ? '[data-testid=mi-factory]' : path === '/math' ? '[data-testid=mi-island]' : '[data-testid=mi-apple]');
};
const at = (p) => p.$$eval('[data-testid^=mi-item-]', (els) => els.map((e) => [Number(e.dataset.testid.slice(8)), Number(e.dataset.at)]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
const counts = (arr) => arr.reduce((c, a) => (a >= 0 ? ((c[a] = (c[a] ?? 0) + 1), c) : c), []);
const state = (p, key = 'jy.math.factory.v1') => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const rect = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
// tap-then-tap through the buttons' own click (keyboard-equivalent activation; avoids smooth-scroll offsets)
const put = async (p, i, box) => {
  await p.$eval(`[data-testid=mi-item-${i}]`, (e) => e.click());
  await p.waitForSelector('[data-testid=mi-held]');
  await p.$eval(box < 0 ? '[data-testid=mi-to-belt]' : `[data-testid=mi-to-box-${box}]`, (e) => e.click());
};
const tap = (p, sel) => p.$eval(sel, (e) => e.click());
const msg = (p) => p.$eval('[data-testid=mi-msg]', (e) => [e.dataset.kind, e.textContent]).catch(() => [null, '']);
async function shareEvenly(p) {
  const a = await at(p);
  const boxes = await p.$$eval('[data-testid^=mi-zone-box-]', (e) => e.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== i % boxes) await put(p, i, i % boxes);
  return { n: a.length, boxes };
}

try {
  // ---------- MA01 routes ----------
  {
    const p = await page();
    for (const lang of ['', '/en']) {
      await open(p, F, lang);
      await p.reload({ waitUntil: 'networkidle0' });
      const robots = await p.$eval('meta[name=robots]', (m) => m.content).catch(() => 'missing');
      ok('MA01', `${lang || 'zh'} ${F} opens directly and after reload, indexable`, /^index/.test(robots) && (await at(p)).length === 12, robots);
    }
    await open(p, '/math');
    const links = await p.$$eval('[data-testid^=mi-start-]', (e) => e.map((x) => x.dataset.testid));
    ok('MA01', 'island shows exactly the two playable games', links.join() === 'mi-start-apple,mi-start-factory', links.join());
    await p.click('[data-testid=mi-start-factory]');
    await p.waitForSelector('[data-testid=mi-factory]');
    await sleep(500);
    const files = await p.evaluate(async () => {
      const m = await (await fetch('/math/audio/zh-TW/v1/manifest.json')).json();
      const out = [];
      for (const c of m.filter((x) => x.id.startsWith('factory_'))) {
        const r = await fetch(`/math/audio/zh-TW/v1/${c.file}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        out.push([c.id, r.status, r.headers.get('content-type'), buf.byteLength, buf[0]]);
      }
      return out;
    });
    ok('MA05', 'all 12 factory clips are served as real mp3 files', files.length === 12 && files.every(([, st, ct, n, b0]) => st === 200 && /audio\/mpeg/.test(ct) && n > 8000 && b0 === 0xff), JSON.stringify(files.slice(0, 2)));
    ok('MA05', 'after 開始玩 the factory prompt is requested from a pre-made file (sound on by default)', requests.some((u) => /v1\/factory_task\.mp3/.test(u)));
    await p.click('[data-testid=mi-back]');
    await p.waitForSelector('[data-testid=mi-island]');
    ok('MA01', 'factory → back to island', true);
    await p.ctx.close();
  }

  // ---------- MA02 actions ----------
  {
    const p = await page(1280, 1100);
    await open(p);
    const it = await rect(p, '[data-testid=mi-item-0]');
    const b1 = await rect(p, '[data-testid=mi-zone-box-1]');
    await p.mouse.move(it.x, it.y);
    await p.mouse.down();
    await p.mouse.move((it.x + b1.x) / 2, (it.y + b1.y) / 2, { steps: 4 });
    await p.mouse.move(b1.x, b1.y, { steps: 4 });
    await p.mouse.up();
    await sleep(250);
    ok('MA02', 'mouse drag puts a cookie into box 2 (saved)', (await at(p))[0] === 1 && (await state(p)).at[0] === 1);
    // box to box by drag
    const it0 = await rect(p, '[data-testid=mi-item-0]');
    const b2 = await rect(p, '[data-testid=mi-zone-box-2]');
    await p.mouse.move(it0.x, it0.y);
    await p.mouse.down();
    await p.mouse.move(b2.x, b2.y, { steps: 6 });
    await p.mouse.up();
    await sleep(250);
    ok('MA02', 'a cookie can be dragged from one box to another', (await at(p))[0] === 2);
    await put(p, 1, 0);
    ok('MA02', 'tap a cookie, then 放進第 1 盒', (await at(p))[1] === 0);
    await p.click('[data-testid=mi-item-2]');
    await p.click('[data-testid=mi-zone-box-1]', { offset: { x: 12, y: 12 } });
    ok('MA02', 'tap a cookie, then tap the box itself', (await at(p))[2] === 1);
    await p.focus('[data-testid=mi-item-3]');
    await p.keyboard.press('Enter');
    await p.focus('[data-testid=mi-to-box-2]');
    await p.keyboard.press('Enter');
    ok('MA02', 'keyboard: Enter on a cookie, Enter on 放進第 3 盒', (await at(p))[3] === 2);
    await put(p, 3, -1);
    ok('MA02', 'a cookie can go back to the conveyor', (await at(p))[3] === -1);
    await p.click('[data-testid=mi-item-4]');
    await p.$eval('[data-testid=mi-to-box-0]', (b) => { b.click(); b.click(); });
    const s = await state(p);
    ok('MA02', 'double tap on a box button moves one cookie once; still 12 cookies', s.at.length === 12 && s.at.filter((x) => x === 0).length === 2 && (await at(p)).length === 12, s.at.join());
    await p.ctx.close();
  }

  // ---------- MA03 maths ----------
  {
    const p = await page(1280, 1100);
    await open(p);
    await tap(p, '[data-testid=mi-answer-4]');
    let m = await msg(p);
    ok('MA03', 'nothing shared yet: 4 is not accepted ("還有沒分完的")', m[0] === 'hint' && /沒分完/.test(m[1]) && !(await p.$('[data-testid=mi-next]')), m.join(' '));
    const plan = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2];
    for (let i = 0; i < 12; i++) await put(p, i, plan[i]);
    const c = counts(await at(p));
    await p.screenshot({ path: `${OUT}/543-1280.png`, fullPage: true });
    const verdicts = [];
    for (const n of await p.$$eval('[data-testid^=mi-answer-]', (e) => e.map((x) => Number(x.textContent)))) {
      await tap(p, `[data-testid=mi-answer-${n}]`);
      verdicts.push((await msg(p))[1]);
    }
    ok('MA03', '12 shared as 5 / 4 / 3: no answer is accepted, "每盒要一樣多"', c.join() === '5,4,3' && verdicts.every((v) => /一樣多/.test(v)) && !(await p.$('[data-testid=mi-next]')), `${c.join()} | ${verdicts.join(' / ')}`);
    await put(p, 0, 2);
    await put(p, 11, -1);
    await tap(p, '[data-testid=mi-answer-4]');
    m = await msg(p);
    ok('MA03', '4 / 4 / 3 with one back on the belt: still "沒分完"', /沒分完/.test(m[1]), m[1]);
    await put(p, 11, 2);
    await tap(p, '[data-testid=mi-answer-3]');
    m = await msg(p);
    ok('MA03', 'equal boxes, wrong number: "再數一次看看", cookies stay', /再數一次/.test(m[1]) && counts(await at(p)).join() === '4,4,4', m[1]);
    await tap(p, '[data-testid=mi-answer-4]');
    await p.waitForSelector('[data-testid=mi-next]');
    m = await msg(p);
    const eq = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await p.screenshot({ path: `${OUT}/right-1280.png`, fullPage: true });
    ok('MA03', 'right: 12 ÷ 3 = 4 and "3 盒，每盒 4 個，一共 12 個。"; next only now', eq === '12 ÷ 3 = 4' && /3 盒，每盒 4 個，一共 12 個/.test(m[1]), `${eq} | ${m[1]}`);
    await p.$eval('[data-testid=mi-next]', (b) => { b.click(); b.click(); });
    await sleep(100);
    ok('MA03', 'double tap on 下一題 advances exactly one problem', (await p.$eval('[data-testid=mi-factory]', (e) => e.dataset.index)) === '1');
    const seen = [];
    for (let k = 1; k < 5; k++) {
      const { n, boxes } = await shareEvenly(p);
      const answer = n / boxes; // counted from the page: items ÷ boxes
      await tap(p, `[data-testid=mi-answer-${answer}]`);
      await p.waitForSelector('[data-testid=mi-next]');
      seen.push((await p.$eval('[data-testid=mi-task]', (e) => e.textContent)).replace(/\s/g, ''));
      await tap(p, '[data-testid=mi-next]');
    }
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('MA03', 'all five fixed problems in order, then the finished screen', seen.join() === '18÷3=6,8÷2=4,10÷2=5,15÷3=5', seen.join());
    await p.reload({ waitUntil: 'networkidle0' });
    ok('MA04', 'finished state survives a reload', !!(await p.$('[data-testid=mi-finished]')));
    await p.ctx.close();
  }

  // ---------- MA04 saving, two games kept apart ----------
  {
    const p = await page(1280, 1100);
    await open(p, '/math/g1/apple');
    await p.click('[data-testid=mi-apple-0]');
    await p.click('[data-testid=mi-to-basket]');
    await open(p);
    await put(p, 0, 1);
    await put(p, 1, 2);
    await p.reload({ waitUntil: 'networkidle0' });
    const fa = await at(p);
    await open(p, '/math/g1/apple');
    const aa = await p.$eval('[data-testid=mi-apple-0]', (e) => e.dataset.at);
    const keys = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jy.math')).sort());
    ok('MA04', 'switching games and reloading keeps each game’s own progress (separate saves)', fa[0] === 1 && fa[1] === 2 && aa === 'basket' && keys.join() === 'jy.math.apple.v1,jy.math.factory.v1', `${fa.slice(0, 3).join()} ${aa} ${keys.join()}`);
    await open(p, '/math');
    const labels = await p.$$eval('[data-testid^=mi-start-]', (e) => e.map((x) => x.textContent));
    ok('MA04', 'island offers 接著玩 for both games', labels.every((l) => /接著玩/.test(l)), labels.join(' | '));
    await p.evaluate(() => localStorage.setItem('jy.math.factory.v1', '[1,2'));
    await open(p);
    const kept = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jy.math.factory.v1.backup-')).map((k) => localStorage.getItem(k)));
    ok('MA04', 'unreadable factory save: notice, original kept in a backup, apple save untouched', !!(await p.$('[data-testid=mi-notice-broken]')) && kept.includes('[1,2') && (await state(p, 'jy.math.apple.v1')).at[0] === 'basket');
    await p.ctx.close();
  }
  {
    const ctx = await browser.createBrowserContext();
    const a = await page(1280, 1100, {}, ctx);
    await open(a);
    await sleep(200);
    const b = await page(1280, 1100, {}, ctx);
    await open(b);
    await sleep(300);
    const r1 = [await a.$eval('[data-testid=mi-factory]', (e) => e.dataset.role), await b.$eval('[data-testid=mi-factory]', (e) => e.dataset.role)];
    await a.bringToFront();
    await put(a, 0, 0);
    await sleep(300);
    const seenB = (await at(b))[0];
    await b.bringToFront();
    await b.click('[data-testid=mi-take-over]');
    await sleep(400);
    const r2 = [await a.$eval('[data-testid=mi-factory]', (e) => e.dataset.role), await b.$eval('[data-testid=mi-factory]', (e) => e.dataset.role)];
    await put(b, 1, 1);
    const s = await state(b);
    ok('MA04', 'factory in two tabs: second view-only, sees the first tab’s move, takes over and continues', r1.join() === 'writer,viewer' && seenB === 0 && r2.join() === 'viewer,writer' && s.at[0] === 0 && s.at[1] === 1, `${r1} ${seenB} ${r2} ${s.at.slice(0, 2)}`);
    await ctx.close();
  }

  // ---------- touch on a phone ----------
  {
    const p = await page(390, 844, { touch: true, dpr: 3 });
    await open(p);
    await p.$eval('[data-testid=mi-stage]', (e) => e.scrollIntoView({ block: 'start' }));
    await sleep(100);
    const cdp = await p.target().createCDPSession();
    const tp = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
    const it = await rect(p, '[data-testid=mi-item-0]');
    const bx = await rect(p, '[data-testid=mi-zone-box-0]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, it.x, it.y)] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, it.x + ((bx.x - it.x) * k) / 8, it.y + ((Math.min(bx.y, 820) - it.y) * k) / 8)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    ok('MA02', 'touch drag a cookie into box 1 (390 px, DPR 3)', (await at(p))[0] === 0, JSON.stringify({ it, bx }));
    const it1 = await rect(p, '[data-testid=mi-item-1]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(2, it1.x, it1.y)] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(2, it1.x + ((bx.x - it1.x) * k) / 8, it1.y + ((Math.min(bx.y, 820) - it1.y) * k) / 8)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await sleep(300);
    ok('MA02', 'touch cancel returns the cookie to the conveyor, nothing saved', (await at(p))[1] === -1 && (await state(p)).at[1] === -1);
    await p.ctx.close();
  }

  // ---------- MA06 layout ----------
  for (const [w, h, touch, dpr] of [[768, 1024, true, 2], [1024, 768, true, 2], [390, 844, true, 3], [1280, 900, false, 1]]) {
    for (const [lang, scheme] of [['', 'light'], ['/en', 'dark']]) {
      const p = await page(w, h, { touch, dpr, scheme });
      await open(p, F, lang);
      // the largest problem (18 cookies, 3 boxes): measure with everything still on the conveyor and with 6 per box
      await p.evaluate(() => localStorage.setItem('jy.math.factory.v1', JSON.stringify({ schemaVersion: 1, game: 'factory', index: 1, at: Array.from({ length: 18 }, (_, i) => i % 3), solved: false, done: ['g3-factory-01'], voice: true })));
      await p.reload({ waitUntil: 'networkidle0' });
      const m = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const items = [...document.querySelectorAll('[data-testid^=mi-item-]')].map(r);
        const zones = [...document.querySelectorAll('[data-testid^=mi-zone-]')].map(r);
        const over = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        let overlap = false;
        for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) if (over(zones[i], zones[j])) overlap = true;
        const btns = [...document.querySelectorAll('[data-testid=mi-factory] button, [data-testid=mi-factory] a')].map(r).filter((x) => x.width > 0);
        return { hscroll: document.documentElement.scrollWidth > window.innerWidth, inside: items.every((a) => a.left >= 0 && a.right <= window.innerWidth), itemMin: Math.min(...items.map((a) => Math.min(a.width, a.height))), overlap, minBtn: Math.min(...btns.map((b) => Math.min(b.width, b.height))), count: items.length };
      });
      ok('MA06', `${w}×${h} ${lang || 'zh'} ${scheme}: 18 cookies in 3 boxes visible, no overlap, no sideways scroll, targets ≥ 56 px`, !m.hscroll && m.inside && !m.overlap && m.itemMin >= 56 && m.minBtn >= 56 && m.count === 18, JSON.stringify(m));
      await p.screenshot({ path: `${OUT}/factory-${w}x${h}-${lang ? 'en' : 'zh'}-${scheme}.png`, fullPage: true });
      await p.ctx.close();
    }
  }
  {
    const p = await page(1280, 900);
    await open(p, '/math');
    await p.screenshot({ path: `${OUT}/island-1280.png`, fullPage: true });
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
