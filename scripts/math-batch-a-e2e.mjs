// Math Island batch A — Make-Ten Train, Coin Shop, Balance Scale browser checks (desktop + phone Chromium).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node math-batch-a-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/math-batch-a';
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
async function page(w = 1280, h = 1000, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme ?? 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|NotSupportedError|no supported source/i.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const GAMES = { train: '/math/g1/train', shop: '/math/g1/shop', balance: '/math/g1/balance' };
const open = async (p, game, lang = '') => {
  await p.goto(`${BASE}${lang}${GAMES[game]}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector(`[data-testid=mi-${game}]`);
};
const at = (p) => p.$$eval('[data-testid^=mi-item-]', (els) => els.map((e) => [Number(e.dataset.testid.slice(8)), Number(e.dataset.at)]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
const tap = (p, sel) => p.$eval(sel, (e) => e.click());
const put = async (p, i, target) => {
  await tap(p, `[data-testid=mi-item-${i}]`);
  await p.waitForSelector('[data-testid=mi-held]');
  await tap(p, `[data-testid=${target}]`);
};
const msg = (p) => p.$eval('[data-testid=mi-msg]', (e) => [e.dataset.kind, e.textContent]).catch(() => [null, '']);
const data = (p, game) => p.$eval(`[data-testid=mi-${game}]`, (e) => ({ ...e.dataset }));
const center = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
async function dragTo(p, from, to) {
  await p.$eval(from, (e) => e.scrollIntoView({ block: 'center' }));
  await sleep(120); // let the scroll settle before measuring
  const a = await center(p, from);
  const b = await center(p, to);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  for (let k = 1; k <= 8; k++) await p.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  await p.mouse.up();
  await sleep(250);
}
const answer = async (p) => {
  // the solved state is the only thing that shows "next"; pick the right choice by trying the visible ones
  for (const id of await p.$$eval('[data-testid^=mi-answer-]', (e) => e.map((x) => x.dataset.testid))) {
    await tap(p, `[data-testid=${id}]`);
    await sleep(60);
    if (await p.$('[data-testid=mi-next]')) return id.slice(10);
  }
  return null;
};
const layout = (p) =>
  p.evaluate(() => {
    const small = [...document.querySelectorAll('.mi button, .mi a')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.width < 44 || r.height < 44);
    }).map((e) => e.dataset.testid || e.textContent.trim().slice(0, 12));
    return { side: document.documentElement.scrollWidth > innerWidth, small };
  });

try {
  // ---------- island and routes ----------
  {
    const p = await page();
    await p.goto(`${BASE}/math`, { waitUntil: 'networkidle0' });
    const links = await p.$$eval('[data-testid^=mi-start-]', (e) => e.map((x) => x.dataset.testid.slice(9)));
    ok('A-01', 'the island lists the playable games in grade order', links.join() === 'apple,train,shop,balance,clock,garden,factory,frog', links.join());
    for (const g of Object.keys(GAMES))
      for (const lang of ['', '/en']) {
        await open(p, g, lang);
        await p.reload({ waitUntil: 'networkidle0' });
        await p.waitForSelector(`[data-testid=mi-${g}]`);
        const robots = await p.$eval('meta[name=robots]', (m) => m.content).catch(() => 'missing');
        const title = await p.title();
        ok('A-02', `${lang || 'zh'} ${GAMES[g]} opens directly and after reload, indexable, own title`, /^index/.test(robots) && /JY Games/.test(title) && (await at(p)).length > 0, `${robots} | ${title}`);
      }
    await p.ctx.close();
  }

  // ---------- Make-Ten Train ----------
  {
    const p = await page();
    await open(p, 'train');
    await p.screenshot({ path: `${OUT}/train-start-1280.png`, fullPage: true });
    // problem 1: 7 + 3 — real drag of one rider into car 1
    await dragTo(p, '[data-testid=mi-item-0]', '[data-testid=mi-zone-car-0]');
    ok('TR-01', 'a real mouse drag puts a rider in car 1 (anywhere in the car counts)', (await at(p))[0] === 0, JSON.stringify(await at(p)));
    // car 2 refuses while car 1 has empty seats
    await put(p, 1, 'mi-to-car-1');
    const [k1, t1] = await msg(p);
    ok('TR-02', 'car 2 is refused while car 1 has empty seats, with a short hint; the rider stays on the platform', k1 === 'hint' && /先把第一節坐滿/.test(t1) && (await at(p))[1] === -1, t1);
    // answer before everyone boarded
    await tap(p, '[data-testid=mi-answer-10]');
    ok('TR-03', 'answering before everyone has boarded asks to board first (no right/wrong yet)', /月台上還有人/.test((await msg(p))[1]));
    await put(p, 1, 'mi-to-car-0');
    await put(p, 2, 'mi-to-car-0');
    const full = await p.$eval('[data-testid=mi-car-0-count]', (e) => e.textContent);
    await tap(p, '[data-testid=mi-answer-10]');
    ok('TR-04', '7 + 3: car 1 shows "坐滿 10 人" and 10 is accepted', /坐滿 10 人/.test(full) && !!(await p.$('[data-testid=mi-next]')) && /剛好 10 人/.test((await msg(p))[1]), full);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // problem 2: 8 + 5 — tap-then-tap: 2 to car 1, then car 1 full refuses the 3rd
    await put(p, 0, 'mi-to-car-0');
    await put(p, 1, 'mi-to-car-0');
    await put(p, 2, 'mi-to-car-0');
    const [, t2] = await msg(p);
    ok('TR-05', '8 + 5: car 1 is full after 2 more riders and refuses an 11th', /第一節坐滿了/.test(t2) && (await at(p))[2] === -1, t2);
    for (let i = 2; i < 5; i++) await put(p, i, 'mi-to-car-1');
    const task = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await tap(p, '[data-testid=mi-answer-12]');
    const wrong = await msg(p);
    await tap(p, '[data-testid=mi-answer-13]');
    const solvedTask = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    ok('TR-06', '8 + 5: a wrong count gets "再數一次" and keeps the riders; 13 is accepted and shown as 10 + 3', /一共有幾個人/.test(task) && wrong[0] === 'hint' && solvedTask === '8 + 5 = 10 + 3 = 13', `${wrong[1]} | ${solvedTask}`);
    await p.screenshot({ path: `${OUT}/train-solved-1280.png`, fullPage: true });
    // reload keeps progress
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForSelector('[data-testid=mi-train]');
    const d = await data(p, 'train');
    ok('TR-07', 'reloading keeps the solved problem 2', d.index === '1' && d.solved === 'true', JSON.stringify(d));
    // finish the rest by tap-then-tap
    await tap(p, '[data-testid=mi-next]');
    for (let n = 2; n < 5; n++) {
      await sleep(80);
      const a = await at(p);
      const seatsLeft = await p.$eval('[data-testid=mi-car-0-count]', (e) => 10 - Number((e.textContent.match(/\d+/) ?? ['10'])[0]));
      for (let i = 0; i < a.length; i++) await put(p, i, i < seatsLeft ? 'mi-to-car-0' : 'mi-to-car-1');
      await answer(p);
      await tap(p, '[data-testid=mi-next]');
    }
    await p.waitForSelector('[data-testid=mi-finished]');
    const list = await p.$eval('[data-testid=mi-finished] ul', (e) => e.textContent);
    ok('TR-08', 'all five problems end on the summary', /9 \+ 4 = 13/.test(list) && /8 \+ 8 = 16/.test(list), list);
    await p.ctx.close();
  }

  // ---------- Coin Shop ----------
  {
    const p = await page();
    await open(p, 'shop');
    const values = await p.$$eval('[data-testid^=mi-item-]', (e) => e.map((x) => [Number(x.dataset.testid.slice(8)), Number(x.dataset.value), x.getBoundingClientRect().width]));
    const w = Object.fromEntries(values.map(([, v, wd]) => [v, wd]));
    ok('SH-01', 'coins are sized like the real ones (1 < 5 < 10 元) and every coin is at least 44 px', w[1] < w[5] && w[5] < w[10] && values.every((x) => x[2] >= 44), JSON.stringify(w));
    await tap(p, '[data-testid=mi-pay]');
    ok('SH-02', 'paying with an empty tray asks for coins first', /先把錢幣放到托盤/.test((await msg(p))[1]));
    const idx = (v) => values.filter((x) => x[1] === v).map((x) => x[0]);
    await dragTo(p, `[data-testid=mi-item-${idx(10)[0]}]`, '[data-testid=mi-zone-tray]');
    await tap(p, '[data-testid=mi-pay]');
    const over = await msg(p);
    ok('SH-03', 'a real drag puts 10 元 on the tray; paying 10 for 7 says "多了 3 元" and the coin stays', /多了 3 元/.test(over[1]) && (await at(p))[idx(10)[0]] === 0, over[1]);
    await put(p, idx(10)[0], 'mi-to-purse');
    await put(p, idx(5)[0], 'mi-to-tray');
    await put(p, idx(1)[0], 'mi-to-tray');
    await tap(p, '[data-testid=mi-pay]');
    const short = await msg(p);
    ok('SH-04', '5 + 1 for 7 says "還差 1 元"', /還差 1 元/.test(short[1]), short[1]);
    await put(p, idx(1)[1], 'mi-to-tray');
    await tap(p, '[data-testid=mi-pay]');
    ok('SH-05', '5 + 1 + 1 is exactly 7 and accepted', !!(await p.$('[data-testid=mi-next]')) && /剛好 7 元/.test((await msg(p))[1]));
    await p.screenshot({ path: `${OUT}/shop-solved-1280.png`, fullPage: true });
    // the rest: greedy from the largest coin, all by tap-then-tap
    const prices = [12, 25, 36, 60];
    for (const price of prices) {
      await tap(p, '[data-testid=mi-next]');
      await sleep(80);
      const coins = (await p.$$eval('[data-testid^=mi-item-]', (e) => e.map((x) => [Number(x.dataset.testid.slice(8)), Number(x.dataset.value)]))).sort((a, b) => b[1] - a[1]);
      let left = price;
      for (const [i, v] of coins) if (v <= left) (await put(p, i, 'mi-to-tray'), (left -= v));
      await tap(p, '[data-testid=mi-pay]');
    }
    await tap(p, '[data-testid=mi-next]');
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('SH-06', 'all five purchases end on the summary', /彩色筆 60 元/.test(await p.$eval('[data-testid=mi-finished] ul', (e) => e.textContent)));
    await p.ctx.close();
  }

  // ---------- Balance Scale ----------
  {
    const p = await page();
    await open(p, 'balance');
    const t0 = (await data(p, 'balance')).tilt;
    const eq = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await dragTo(p, '[data-testid=mi-item-0]', '[data-testid=mi-zone-pan]');
    const t1 = (await data(p, 'balance')).tilt;
    ok('BA-01', '5 + 3 = □: the scale starts tilted to the left; a real drag of one block into the box makes it less tilted', eq === '5 + 3 = □' && t0 === '8' && t1 === '7', `${eq} ${t0}→${t1}`);
    await tap(p, '[data-testid=mi-check]');
    const h = await msg(p);
    const tiltText = await p.$eval('[data-testid=mi-tilt]', (e) => e.textContent);
    ok('BA-02', '"done" before level says to look at which side is heavier; the tilt is also given as text', h[0] === 'hint' && /哪一邊比較重/.test(h[1]) && /左邊比較重/.test(tiltText), `${h[1]} | ${tiltText}`);
    for (let i = 1; i < 9; i++) await put(p, i, 'mi-to-pan');
    const heavyR = (await data(p, 'balance')).tilt;
    await put(p, 8, 'mi-to-bin');
    await tap(p, '[data-testid=mi-check]');
    const solved = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    ok('BA-03', 'one block too many tips it right; taking it back levels it; the □ fills in as 8', heavyR === '-1' && solved === '5 + 3 = 8' && /兩邊一樣重/.test((await msg(p))[1]), `${heavyR} ${solved}`);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    const eq2 = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    const panSide = await p.$eval('[data-testid=mi-zone-pan]', (e) => e.closest('[data-testid^=mi-pan-]').dataset.testid);
    ok('BA-04', 'problem 2 is "□ = 4 + 2": the box (and its pan) is on the left', eq2 === '□ = 4 + 2' && panSide === 'mi-pan-left', `${eq2} ${panSide}`);
    await p.screenshot({ path: `${OUT}/balance-p2-1280.png`, fullPage: true });
    for (const need of [6, 6, 3, 7]) {
      for (let i = 0; i < need; i++) await put(p, i, 'mi-to-pan');
      await tap(p, '[data-testid=mi-check]');
      await tap(p, '[data-testid=mi-next]');
      await sleep(80);
    }
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('BA-05', 'all five end on the summary with filled equations', /7 \+ 5 = 9 \+ 3/.test(await p.$eval('[data-testid=mi-finished] ul', (e) => e.textContent)));
    await p.ctx.close();
  }

  // ---------- keyboard ----------
  {
    const p = await page();
    await open(p, 'train');
    await p.focus('[data-testid=mi-item-0]');
    await p.keyboard.press('Enter');
    await p.waitForSelector('[data-testid=mi-held]');
    await p.focus('[data-testid=mi-to-car-0]');
    await p.keyboard.press('Enter');
    await sleep(80);
    ok('A-03', 'keyboard: Enter on a rider, then Enter on "坐第 1 節" seats it (same action as drag and tap)', (await at(p))[0] === 0);
    await p.ctx.close();
  }

  // ---------- phone layout, dark ----------
  for (const g of Object.keys(GAMES)) {
    const p = await page(390, 844, { touch: true, dpr: 2, scheme: g === 'shop' ? 'dark' : 'light' });
    await open(p, g);
    const l = await layout(p);
    await p.screenshot({ path: `${OUT}/${g}-390${g === 'shop' ? '-dark' : ''}.png`, fullPage: true });
    ok('A-04', `phone 390: ${g} has no sideways scroll and every control is at least 44 px`, !l.side && l.small.length === 0, JSON.stringify(l));
    // a real finger drag on the phone
    const from = '[data-testid=mi-item-0]';
    const to = g === 'train' ? '[data-testid=mi-zone-car-0]' : g === 'shop' ? '[data-testid=mi-zone-tray]' : '[data-testid=mi-zone-pan]';
    await p.$eval(from, (e) => e.scrollIntoView({ block: 'center' }));
    const a = await center(p, from);
    const b = await center(p, to);
    const cdp = await p.target().createCDPSession();
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(a.x, a.y) });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
    ok('A-05', `phone 390: ${g} — a finger drag moves the first object into its place`, (await at(p))[0] === 0, JSON.stringify((await at(p)).slice(0, 3)));
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
