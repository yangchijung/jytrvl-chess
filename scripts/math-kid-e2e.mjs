// Math Island "few words, many pictures, drag" redesign — island map and Apple Basket browser checks
// (James 2026-10-22). iPad landscape 1180×820 and phone 390×844, Chromium.
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node math-kid-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/math-kid';
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
const audioReq = [];
async function page(w = 1180, h = 820, opts = {}) {
  const ctx = opts.ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: opts.touch ?? true, hasTouch: opts.touch ?? true, deviceScaleFactor: 2 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme ?? 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|NotSupportedError|no supported source|NotAllowedError/i.test(m.text()) && errors.push(m.text()));
  p.on('request', (r) => /\/math\/audio\//.test(r.url()) && audioReq.push(r.url().split('/').pop()));
  p.ctx = ctx;
  return p;
}
/** Chinese characters a child can see: visible text only (screen-reader-only text excluded) */
const visibleZh = (p) =>
  p.evaluate(() => {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) {
        const el = n.parentElement;
        const cs = el && getComputedStyle(el);
        const r = el?.getBoundingClientRect();
        if (cs && cs.visibility !== 'hidden' && cs.display !== 'none' && r && r.width > 2 && r.height > 2 && !el.closest('.sr-only')) out.push(...(n.textContent.match(/[一-鿿]/g) ?? []));
        return;
      }
      for (const c of n.childNodes) walk(c);
    };
    walk(document.body);
    return out.join('');
  });
const tap = (p, sel) => p.$eval(sel, (e) => e.click());
const at = (p) => p.$$eval('[data-testid^=mi-apple-]', (els) => els.map((e) => [Number(e.dataset.testid.slice(9)), e.dataset.at]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
const data = (p) => p.$eval('[data-testid=mi-apple]', (e) => ({ ...e.dataset }));
const center = (p, sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
/** a real finger drag (touch events through the DevTools protocol) */
async function fingerDrag(p, from, to) {
  const a = await center(p, from);
  await sleep(80);
  const a2 = await center(p, from);
  const b = await center(p, to);
  const cdp = await p.target().createCDPSession();
  const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(a2.x, a2.y) });
  for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(a2.x + ((b.x - a2.x) * k) / 8, a2.y + ((b.y - a2.y) * k) / 8) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await sleep(200);
  return a;
}
const smallTargets = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('.mi button, .mi a, .mi [role=button][tabindex="0"]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.width < 64 || r.height < 64);
      })
      .map((e) => e.dataset.testid || e.getAttribute('aria-label')),
  );

try {
  // ---------------------------------------------------------------- island map
  {
    const p = await page();
    await p.goto(`${BASE}/math`, { waitUntil: 'networkidle0' });
    await sleep(400);
    const header = await p.$('[data-testid=site-header]');
    const places = await p.$$eval('[data-testid^=mi-start-]', (e) => e.map((x) => ({ id: x.dataset.testid.slice(9), grade: x.dataset.grade, name: x.innerText.trim(), w: x.getBoundingClientRect().width, h: x.getBoundingClientRect().height })));
    ok('K-01', 'the island map: eight picture buttons in grade order, names only (≤ 5 characters), no site header', !header && places.map((x) => x.id).join() === 'apple,train,shop,balance,clock,garden,factory,frog' && places.every((x) => [...x.name].length <= 5 && x.w >= 64 && x.h >= 64), JSON.stringify(places.map((x) => x.name)));
    ok('K-02', 'grade flags by colour: green for grade 1 (and 1–2), yellow grade 2, blue grade 3', places.map((x) => x.grade).join('') === '11111233', places.map((x) => x.grade).join(''));
    const zh = await visibleZh(p);
    const names = places.map((x) => x.name).join('');
    ok('K-03', 'apart from the eight game names, no Chinese characters on the map (no grade text, no “5 題”)', zh === names, zh);
    ok('K-04', 'every control on the map is at least 64 px', (await smallTargets(p)).length === 0, JSON.stringify(await smallTargets(p)));
    ok('K-05', 'first visit: a finger shows where to tap', !!(await p.$('[data-testid=mi-hand]')));
    await p.screenshot({ path: `${OUT}/ipad-menu.png` });
    // tapping says the game's name first, then opens it
    audioReq.length = 0;
    const t0 = Date.now();
    await p.tap('[data-testid=mi-start-apple]');
    await p.waitForSelector('[data-testid=mi-apple]', { timeout: 8000 });
    ok('K-06', 'a tap on the apple tree asks for "menu_apple" (the spoken name), then opens the Apple Basket', audioReq.includes('menu_apple.mp3'), `${audioReq.join()} in ${Date.now() - t0} ms`);
    await p.goto(`${BASE}/math/parent`, { waitUntil: 'networkidle0' });
    const parent = await p.$eval('[data-testid=mi-parent]', (e) => e.innerText);
    ok('K-07', 'the adults page has the grade colours, what each game practises, curriculum codes and privacy (with the normal site header)', /綠色是一年級/.test(parent) && /N-1-2/.test(parent) && /不收集姓名/.test(parent) && !!(await p.$('[data-testid=site-header]')));
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- Apple Basket on the iPad
  {
    const p = await page();
    await p.goto(`${BASE}/math/g1/apple`, { waitUntil: 'networkidle0' });
    await sleep(500);
    ok('K-10', 'no Chinese characters at all on the game screen; 5 progress dots, the first is current', (await visibleZh(p)) === '' && (await p.$$eval('.kid-dot', (e) => e.map((x) => x.dataset.state).join())) === 'now,todo,todo,todo,todo', await visibleZh(p));
    ok('K-11', 'the finger demo shows the first drag (apple → basket) until the child touches', !!(await p.$('[data-testid=mi-hand]')));
    ok('K-12', 'every control and apple is at least 64 px', (await smallTargets(p)).length === 0, JSON.stringify(await smallTargets(p)));
    await p.screenshot({ path: `${OUT}/ipad-apple-start.png` });
    audioReq.length = 0;
    await fingerDrag(p, '[data-testid=mi-apple-0]', '[data-testid=mi-zone-basket]');
    ok('K-13', 'a real finger drag puts the apple in the basket; the finger demo goes away; "1" is counted aloud', (await at(p))[0] === 'basket' && !(await p.$('[data-testid=mi-hand]')) && audioReq.includes('n_1.mp3'), `${JSON.stringify(await at(p))} ${audioReq.join()}`);
    ok('K-14', 'number cards are not shown before every apple is in the basket', (await p.$$('.kid-card')).length === 0);
    for (let i = 1; i < 7; i++) await fingerDrag(p, `[data-testid=mi-apple-${i}]`, '[data-testid=mi-zone-basket]');
    const cards = await p.$$eval('.kid-card', (e) => e.map((x) => ({ n: x.textContent, w: x.getBoundingClientRect().width, h: x.getBoundingClientRect().height })));
    ok('K-15', 'all 7 in: each one counted (n_1 … n_7), then three big number cards appear (≥ 96 px) and "3 + 4 = ?"', ['n_2.mp3', 'n_7.mp3'].every((f) => audioReq.includes(f)) && cards.length === 3 && cards.every((c) => c.w >= 96 && c.h >= 96) && (await p.$eval('[data-testid=mi-task]', (e) => e.textContent)) === '3 + 4 = ?', JSON.stringify(cards));
    await p.screenshot({ path: `${OUT}/ipad-apple-cards.png` });
    // wrong cards: back with a shake, no words; the third brings the finger to the right card
    const wrongs = cards.map((c) => c.n).filter((n) => n !== '7');
    await fingerDrag(p, `[data-testid=mi-answer-${wrongs[0]}]`, '[data-testid=mi-zone-basket]');
    const after1 = { wrong: (await data(p)).wrong, cards: (await p.$$('.kid-card')).length, zh: await visibleZh(p) };
    ok('K-16', 'a wrong card dragged to the basket goes back (all three cards still there), no word appears, nothing is counted as solved', after1.wrong === '1' && after1.cards === 3 && after1.zh === '' && (await data(p)).solved === 'false', JSON.stringify(after1));
    await tap(p, `[data-testid=mi-answer-${wrongs[1]}]`);
    ok('K-17', 'two wrong tries: no finger yet', !(await p.$('[data-testid=mi-hand]')));
    await tap(p, `[data-testid=mi-answer-${wrongs[0]}]`);
    await sleep(200);
    ok('K-18', 'the third wrong try: the finger shows the right card going to the basket', !!(await p.$('[data-testid=mi-hand]')) && (await data(p)).wrong === '3');
    await p.screenshot({ path: `${OUT}/ipad-apple-demo.png` });
    const hop0 = await p.$eval('[data-testid=mi-otter]', (e) => e.dataset.jump);
    await fingerDrag(p, '[data-testid=mi-answer-7]', '[data-testid=mi-zone-basket]');
    const r = { solved: (await data(p)).solved, task: await p.$eval('[data-testid=mi-task]', (e) => e.textContent), star: await p.$eval('[data-testid=mi-star]', (e) => e.dataset.go), hop: await p.$eval('[data-testid=mi-otter]', (e) => e.dataset.jump), dots: await p.$$eval('.kid-dot', (e) => e.map((x) => x.dataset.state).join()) };
    ok('K-19', 'dragging 7 onto the basket: solved, "3 + 4 = 7", the star flies, 波波 hops, the first dot turns green', r.solved === 'true' && r.task === '3 + 4 = 7' && r.star === '1' && r.hop !== hop0 && r.dots.startsWith('done,'), JSON.stringify(r));
    await sleep(120);
    await p.screenshot({ path: `${OUT}/ipad-apple-right.png` });
    // reload keeps the solved problem
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForSelector('[data-testid=mi-apple]');
    ok('K-20', 'reload keeps problem 1 solved with the next arrow', (await data(p)).solved === 'true' && !!(await p.$('[data-testid=mi-next]')));
    await tap(p, '[data-testid=mi-next]');
    // problems 2–5: tap-then-tap for apples, a tap on the right card
    const sums = [5, 5, 3, 8];
    for (const n of sums) {
      await sleep(100);
      const count = (await at(p)).length;
      for (let i = 0; i < count; i++) {
        await tap(p, `[data-testid=mi-apple-${i}]`);
        await tap(p, '[data-testid=mi-zone-basket]');
      }
      await tap(p, `[data-testid=mi-answer-${n}]`);
      await tap(p, '[data-testid=mi-next]');
    }
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('K-21', 'tap-then-tap and tapping a card also work; all five end on the stars and the five equations, still no words', (await p.$$eval('[data-testid=mi-finished] li', (e) => e.length)) === 5 && (await visibleZh(p)) === '' && (await p.$$eval('.kid-dot', (e) => e.every((x) => x.dataset.state === 'done'))));
    await p.screenshot({ path: `${OUT}/ipad-apple-finished.png` });
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- keyboard and the second tab
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(1180, 820, { ctx, touch: false });
    await p.goto(`${BASE}/math/g1/apple`, { waitUntil: 'networkidle0' });
    await p.focus('[data-testid=mi-apple-0]');
    await p.keyboard.press('Enter');
    await p.$eval('[data-testid=mi-zone-basket]', (e) => e.focus());
    await p.keyboard.press('Enter');
    await sleep(80);
    ok('K-30', 'keyboard: Enter on an apple, then Enter on the basket puts it in (same action as dragging)', (await at(p))[0] === 'basket');
    const q = await page(1180, 820, { ctx, touch: false });
    await q.goto(`${BASE}/math/g1/apple`, { waitUntil: 'networkidle0' });
    await sleep(300);
    ok('K-31', 'a second tab of the same game only watches (single writer kept from M0)', (await q.$eval('[data-testid=mi-apple]', (e) => e.dataset.role)) === 'viewer');
    await ctx.close();
  }

  // ---------------------------------------------------------------- phone
  {
    const p = await page(390, 844);
    await p.goto(`${BASE}/math`, { waitUntil: 'networkidle0' });
    const side1 = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await p.screenshot({ path: `${OUT}/phone-menu.png`, fullPage: true });
    await p.goto(`${BASE}/math/g1/apple`, { waitUntil: 'networkidle0' });
    const side2 = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await fingerDrag(p, '[data-testid=mi-apple-0]', '[data-testid=mi-zone-basket]');
    await p.screenshot({ path: `${OUT}/phone-apple.png`, fullPage: true });
    ok('K-40', 'phone 390: no sideways scroll on the map or the game; a finger drag works; controls ≥ 64 px', !side1 && !side2 && (await at(p))[0] === 'basket' && (await smallTargets(p)).length === 0, JSON.stringify({ side1, side2, small: await smallTargets(p) }));
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
