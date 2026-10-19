// Little Restaurant Owner V3 — R1-a acceptance (Issue #4, RESTAURANT_PLAYFUL_V3 R3-01…R3-09, automatable parts).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node restaurant-v3-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/restaurant-v3';
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
const go = async (p, lang = '', q = '') => {
  await p.goto(`${BASE}${lang}/restaurant${q}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=r3], [data-testid=restaurant]');
};
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 8000 });
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(230); // the input lock / motion is ≤ 200 ms
};
const V = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__r3.v)));
const egg = (p) => p.$eval('[data-testid=r3-bin-egg]', (e) => Number(e.dataset.qty));
const msg = (p) => p.$eval('[data-testid=r3-msg]', (e) => e.textContent).catch(() => '');
const prompt = (p) => p.$eval('[data-testid=r3-prompt] p', (e) => e.textContent);

// ---------------------------------------------------------------- R3-01 menu, portions, buying together
{
  const p = await page(390, 844);
  await go(p);
  const start = await p.evaluate(() => ({ r3: !!document.querySelector('[data-testid=r3]'), robots: document.querySelector('meta[name=robots]')?.content, menu: window.__r3.v.state.menu, plan: window.__r3.v.state.plan, dialog: !!document.querySelector('dialog[open]'), inputs: document.querySelectorAll('[data-testid=r3] input').length }));
  await tap(p, '[data-testid=r3-dish-cheese_egg_toast]');
  const limit = await prompt(p);
  await tap(p, '[data-testid=r3-dish-vegetable_egg_rice]');
  const one = (await V(p)).state.plan;
  await tap(p, '[data-testid=r3-dish-vegetable_egg_rice]');
  await p.screenshot({ path: `${OUT}/r3-plan-390.png`, fullPage: true });
  await tap(p, '[data-testid=r3-to-buy]');
  const basket = await p.$$eval('[data-testid=r3-basket] li', (l) => l.map((x) => `${x.dataset.item}:${x.dataset.packs}`).join());
  const buyText = await p.$eval('[data-testid=r3-buy]', (e) => e.textContent);
  const after = await p.$eval('[data-testid=r3-wallet-after]', (e) => e.textContent);
  await p.screenshot({ path: `${OUT}/r3-buy-390.png`, fullPage: true });
  await tap(p, '[data-testid=r3-buy]');
  const bought = await V(p);
  ok('R3-01', 'no account; opens on the new version (noindex) with no dialog or number input; two rice dishes pre-picked, portions 3 + 3 from the six guests; a third dish says 先選兩道; removing a dish recomputes (tomato 3); buying together lists the merged basket for 117, wallet 500 → 383, then the first guest is at the counter', start.r3 && /noindex/.test(start.robots) && !start.dialog && start.inputs === 0 && start.menu.join() === 'tomato_egg_rice,vegetable_egg_rice' && start.plan.tomato_egg_rice === 3 && start.plan.vegetable_egg_rice === 3 && limit === '先選兩道' && one.tomato_egg_rice === 3 && one.vegetable_egg_rice === 0 && basket === 'rice:1,egg:1,tomato:1,vegetable:1,packaging:6' && buyText.includes('117') && after.includes('500 → 383') && bought.state.phase === 'serve' && bought.state.cash === 383, JSON.stringify({ start, limit, one, basket, buyText, after, phase: bought.state.phase }));

  // ---------------------------------------------------------------- R3-02 / R3-03 the first two guests by hand
  const g1 = await p.$eval('[data-testid=r3-bubble]', (e) => [e.dataset.guest, e.textContent]);
  await tap(p, '[data-testid=r3-bin-rice]');
  await tap(p, '[data-testid=r3-bin-egg]');
  await tap(p, '[data-testid=r3-cook]');
  const lack = [await msg(p), await egg(p)];
  await tap(p, '[data-testid=r3-bin-vegetable]');
  const extra = await msg(p);
  await tap(p, '[data-testid=r3-slot-2]'); // take the greens back out
  await tap(p, '[data-testid=r3-bin-tomato]');
  await p.screenshot({ path: `${OUT}/r3-pan-390.png`, fullPage: true });
  await tap(p, '[data-testid=r3-cook]');
  const egg1 = await egg(p);
  const plate1 = await p.$eval('[data-testid=r3-plate-tomato_egg_rice]', (e) => e.dataset.n);
  const pServe = await prompt(p);
  await tap(p, '[data-testid=r3-serve]');
  const s1 = (await V(p)).state;
  // guest 2: vegetable rice; the same box of eggs goes 5 → 4
  const g2 = await p.$eval('[data-testid=r3-bubble]', (e) => e.dataset.guest);
  const dish2 = await p.$eval('[data-testid=r3-pick-vegetable_egg_rice]', (e) => e.getAttribute('aria-pressed'));
  await tap(p, '[data-testid=r3-bin-vegetable]');
  await tap(p, '[data-testid=r3-bin-egg]');
  await tap(p, '[data-testid=r3-bin-rice]');
  await tap(p, '[data-testid=r3-cook]');
  const egg2 = await egg(p);
  const sharedLabel = await p.$eval('[data-testid=r3-bin-egg]', (e) => e.getAttribute('aria-label'));
  // a wrong dish is not paid and stays on the plate
  await tap(p, '[data-testid=r3-pick-tomato_egg_rice]');
  await tap(p, '[data-testid=r3-bin-tomato]');
  await tap(p, '[data-testid=r3-bin-egg]');
  await tap(p, '[data-testid=r3-bin-rice]');
  await tap(p, '[data-testid=r3-cook]');
  await tap(p, '[data-testid=r3-plate-tomato_egg_rice]');
  const cashBefore = (await V(p)).state.cash;
  await tap(p, '[data-testid=r3-serve]');
  const wrong = { msg: await msg(p), cash: (await V(p)).state.cash, plates: (await V(p)).state.servings.length };
  await tap(p, '[data-testid=r3-plate-vegetable_egg_rice]');
  await tap(p, '[data-testid=r3-serve]');
  const s2 = (await V(p)).state;
  ok('R3-02', 'guest 1 shows tomato egg rice (or toast); a short pan says 還缺番茄 and uses nothing (eggs still 6); a wrong item says 這道不用青菜 and can be taken back; cooking puts one dish on the plate and serving pays 32; a dish the guest does not take says 這份先留著, is not paid and stays on the plate', g1[0] === '0' && g1[1].includes('番茄蛋飯') && lack[0] === '還缺番茄' && lack[1] === 6 && extra === '這道不用青菜' && plate1 === '1' && pServe === '送上桌' && s1.cash === 415 && s1.orders[0].status === 'sold' && wrong.msg === '這份先留著' && wrong.cash === cashBefore && wrong.plates === 2 && s2.orders[1].status === 'sold' && s2.cash === 450, JSON.stringify({ g1, lack, extra, plate1, pServe, c1: s1.cash, wrong, c2: s2.cash }));
  ok('R3-03', 'the two rice dishes take eggs from one shared box: 6 → 5 → 4; the egg bin says which dishes use it', egg1 === 5 && egg2 === 4 && g2 === '1' && dish2 === 'true' && /番茄蛋飯、蔬菜蛋炒飯都用/.test(sharedLabel), JSON.stringify({ egg1, egg2, g2, dish2, sharedLabel }));

  // ---------------------------------------------------------------- R3-06 resume: pan draft, guest, language
  await tap(p, '[data-testid=r3-plate-tomato_egg_rice]');
  await tap(p, '[data-testid=r3-serve]'); // guest 3 gets the kept tomato rice
  await tap(p, '[data-testid=r3-bin-rice]'); // guest 4: start a pan, then reload
  const quickShown = !!(await p.$('[data-testid=r3-quick]'));
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=r3]');
  const re = await p.evaluate(() => ({ guest: document.querySelector('[data-testid=r3-bubble]')?.dataset.guest, pan: document.querySelector('[data-testid=r3-pan]').dataset.items, cash: window.__r3.v.state.cash, batch: window.__r3.v.state.batch }));
  await Promise.all([p.waitForFunction(() => location.pathname === '/en/restaurant'), p.click('[data-testid=lang-switch]')]);
  await p.waitForSelector('[data-testid=r3]');
  const en = await p.evaluate(() => ({ pan: document.querySelector('[data-testid=r3-pan]').dataset.items, cook: document.querySelector('[data-testid=r3-cook]').textContent, prompt: document.querySelector('[data-testid=r3-prompt] p').textContent }));
  ok('R3-06a', 'after guests 1–3 the next group starts by itself (no extra button); quick cook is offered after two hand-cooked dishes; reload keeps guest 4, the half-filled pan and the wallet; English keeps them too', re.guest === '3' && re.pan === 'rice' && re.cash === 482 && re.batch === 2 && quickShown && en.pan === 'rice' && en.cook === 'Cook one' && en.prompt === 'Put ingredients in the pan', JSON.stringify({ re, en, quickShown }));

  // ---------------------------------------------------------------- finish the day with quick cook; R3-04 / R3-07
  for (let k = 0; k < 3; k++) {
    await tap(p, '[data-testid=r3-quick]');
    await tap(p, '[data-testid=r3-serve]');
  }
  await p.waitForSelector('[data-testid=r3-close]');
  const close = await p.$eval('[data-testid=r3-close]', (e) => ({ result: Number(e.dataset.result), cash: Number(e.dataset.cash), sold: Number(e.dataset.sold) }));
  await tap(p, '[data-testid=r3-today]');
  const books = await p.$eval('[data-testid=r3-books]', (e) => ({ revenue: Number(e.dataset.revenue), cogs: Number(e.dataset.cogs), waste: Number(e.dataset.waste) }));
  await tap(p, '[data-testid=r3-plant-preview]');
  const preview = await p.evaluate(() => ({ plant: document.querySelector('[data-testid=r3-plant]')?.dataset.preview, cash: window.__r3.v.state.cash }));
  await tap(p, '[data-testid=r3-plant-cancel]');
  const cancelled = await p.evaluate(() => ({ plant: !!document.querySelector('[data-testid=r3-plant]'), cash: window.__r3.v.state.cash }));
  await tap(p, '[data-testid=r3-plant-preview]');
  await p.evaluate(() => {
    const b = document.querySelector('[data-testid=r3-plant-buy]');
    b.click();
    b.click(); // a double tap must not pay twice
  });
  await sleep(300);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=r3]');
  const plant = await p.evaluate(() => ({ cash: window.__r3.v.state.cash, decor: window.__r3.v.state.decor, phase: window.__r3.v.state.phase, shown: document.querySelector('[data-testid=r3-plant]')?.dataset.preview }));
  await p.screenshot({ path: `${OUT}/r3-close-390.png`, fullPage: true });
  ok('R3-04', 'a full guided day with the default menu ends at the product baseline: 6 served, sales 201, ingredients of meals sold 117, nothing wasted, result 34, wallet 534', close.sold === 6 && close.result === 34 && close.cash === 534 && books.revenue === 201 && books.cogs === 117 && books.waste === 0, JSON.stringify({ close, books }));
  ok('R3-07', 'the plant is previewed first (no charge), cancel keeps 534; buying (even with a double tap) charges once → 414 and the plant stays in the shop after reload', preview.plant === 'true' && preview.cash === 534 && !cancelled.plant && cancelled.cash === 534 && plant.cash === 414 && plant.decor.length === 1 && plant.phase === 'done' && plant.shown === 'false', JSON.stringify({ preview, cancelled, plant }));
  await p.ctx.close();
}

// ---------------------------------------------------------------- R3-05 double taps and two tabs
{
  const ctx = await browser.createBrowserContext();
  const a = await page(1280, 900, { ctx });
  await go(a);
  await tap(a, '[data-testid=r3-to-buy]');
  await a.evaluate(() => {
    const b = document.querySelector('[data-testid=r3-buy]');
    b.click();
    b.click();
  });
  await sleep(300);
  const once = await a.evaluate(() => ({ cash: window.__r3.v.state.cash, buys: window.__r3.v.state.ledger.filter((l) => l.kind === 'purchase').length }));
  // cook one and serve with a double tap
  for (const i of ['rice', 'egg', 'tomato']) await tap(a, `[data-testid=r3-bin-${i}]`);
  await a.evaluate(() => {
    const b = document.querySelector('[data-testid=r3-cook]');
    b.click();
    b.click();
  });
  await sleep(300);
  const cooked = await a.evaluate(() => window.__r3.v.state.servings.length);
  await a.evaluate(() => {
    const b = document.querySelector('[data-testid=r3-serve]');
    b.click();
    b.click();
  });
  await sleep(300);
  const served = await a.evaluate(() => ({ cash: window.__r3.v.state.cash, sales: window.__r3.v.state.ledger.filter((l) => l.kind === 'sale').length }));
  // a second tab sees the newer game; an older tab never writes over it
  const b = await page(1280, 900, { ctx });
  await go(b);
  await b.evaluate(() => window.__r3.update({ draft: { dish: 'vegetable_egg_rice', items: ['rice'] } }));
  await sleep(300);
  const adopted = await a.evaluate(() => ({ seq: window.__r3.v.state.seq, pan: window.__r3.v.draft.items.join(), other: !!document.querySelector('[role=status]') }));
  const stored = await a.evaluate(() => JSON.parse(localStorage.getItem('jy.restaurant.v3')).draft.items.join());
  // same base, the other tab's storage event held back: tab A must adopt, not write over tab B's meal (R3-S1)
  await a.evaluate(() => window.removeEventListener('storage', window.__r3.onStorage));
  await b.evaluate(() => window.__r3.dispatch({ t: 'cook', dish: 'tomato_egg_rice', items: ['rice', 'egg', 'tomato'] }));
  await sleep(250);
  const bState = await b.evaluate(() => ({ servings: window.__r3.v.state.servings.length, egg: window.__r3.v.state.lots.filter((l) => l.item === 'egg').reduce((n, l) => n + l.qty, 0) }));
  await a.evaluate(() => window.__r3.update({ draft: { dish: 'tomato_egg_rice', items: ['egg'] } }));
  await sleep(250);
  const race = await a.evaluate(() => {
    const disk = JSON.parse(localStorage.getItem('jy.restaurant.v3'));
    const eggs = (st) => st.lots.filter((l) => l.item === 'egg').reduce((n, l) => n + l.qty, 0);
    return { diskServ: disk.state.servings.length, diskEgg: eggs(disk.state), diskCash: disk.state.cash, aServ: window.__r3.v.state.servings.length, aCash: window.__r3.v.state.cash, msg: document.querySelector('[data-testid=r3-other-tab]')?.dataset.conflict };
  });
  ok('R3-05', 'double taps buy once (383, one purchase), cook once and sell once (+32, one sale); another tab’s newer save is adopted and not overwritten; with the storage event held back (same base) the stale tab’s pan change does not erase the other tab’s meal — it adopts the newer game and asks to tap again', once.cash === 383 && once.buys === 1 && cooked === 1 && served.cash === 415 && served.sales === 1 && adopted.pan === 'rice' && stored === 'rice' && race.diskServ === bState.servings && race.diskEgg === bState.egg && race.aServ === bState.servings && race.diskCash === 415 && race.msg === 'true', JSON.stringify({ once, cooked, served, adopted, stored, bState, race }));
  await ctx.close();
}

// ---------------------------------------------------------------- R3-06 classic game kept; protected saves
{
  const p = await page(1280, 900);
  await go(p, '', '?play=classic');
  await p.waitForSelector('[data-testid=restaurant]');
  await p.evaluate(() => localStorage.removeItem('jy.restaurant.view'));
  // make a classic save exist (one action is enough), then come back without a query
  await p.click('[data-testid=r-to-buy]');
  await sleep(400);
  const classicRaw = await p.evaluate(() => localStorage.getItem('jy.restaurant.v1'));
  await p.goto(`${BASE}/restaurant`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=r-try-new]');
  const landed = await p.evaluate(() => ({ classic: !!document.querySelector('[data-testid=restaurant]'), v3: !!document.querySelector('[data-testid=r3]') }));
  await tap(p, '[data-testid=r-to-v3]');
  await p.waitForSelector('[data-testid=r3]');
  await tap(p, '[data-testid=r3-to-buy]');
  await tap(p, '[data-testid=r3-buy]');
  const both = await p.evaluate(() => ({ classic: localStorage.getItem('jy.restaurant.v1'), v3cash: JSON.parse(localStorage.getItem('jy.restaurant.v3')).state.cash, back: !!document.querySelector('[data-testid=r3-to-classic]') }));
  ok('R3-06b', 'a player with a classic game lands on it with 玩新版; the new version starts its own save; the classic save text is unchanged and its coins are not mixed in; a way back to the classic game is offered', landed.classic && !landed.v3 && both.classic === classicRaw && both.v3cash === 383 && both.back, JSON.stringify({ landed, v3cash: both.v3cash, same: both.classic === classicRaw }));
  await p.ctx.close();
}
{
  // newer-version V3 save + backup failure: original kept, alternate key used, notice + download; storage full → not saved
  const p = await page(1280, 900);
  const raw = '{"schemaVersion":9,"state":"sentinel"}';
  await p.evaluateOnNewDocument((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('jy.restaurant.v3', raw);
      sessionStorage.setItem('seeded', '1');
    }
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).includes('.backup-')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  }, raw);
  await go(p);
  await tap(p, '[data-testid=r3-to-buy]');
  const st = await p.evaluate(() => ({ main: localStorage.getItem('jy.restaurant.v3'), alt: JSON.parse(localStorage.getItem('jy.restaurant.v3.recovered') ?? 'null'), notice: document.querySelector('[data-testid=r3-notice]')?.dataset.notice, dl: !!document.querySelector('[data-testid=r3-download-old]'), save: document.querySelector('[data-testid=r3-save]').textContent }));
  await p.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await tap(p, '[data-testid=r3-buy]');
  const full = await p.evaluate(() => ({ text: document.querySelector('[data-testid=r3-save]').textContent, phase: window.__r3.v.state.phase }));
  ok('R3-06c', 'unreadable newer V3 save + backup failure: original text kept, progress goes to the alternate key with a notice and download; when storage is full the game goes on and says 還沒存好，先別關掉 (never 已存好)', st.main === raw && st.alt?.state?.phase === 'buy' && st.notice === 'brokenNoBackup' && st.dl && st.save === '已存好' && full.text === '還沒存好，先別關掉' && full.phase === 'serve', JSON.stringify({ ...st, alt: !!st.alt, full }));
  await p.ctx.close();
}

// ---------------------------------------------------------------- R1-b: other menus, "not today", out of stock, play again, advanced entry
/** Serves the guest at the counter through the screen: a ready accepted plate, else cook (by hand / quick), else 今天沒有. */
async function serveOne(p) {
  const st = await p.evaluate(() => {
    const s = window.__r3.v.state;
    const g = [0, 1, 2, 3, 4, 5].find((k) => s.orders[k].status === 'pending' && (k < 3 ? s.batch === 1 : s.batch === 2));
    const c = s.customers[g];
    const wants = [c.likes, c.alsoAccepts].filter((d) => d && s.menu.includes(d));
    return { g, wants, ready: wants.filter((d) => s.servings.some((x) => x.dish === d)), notToday: !!document.querySelector('[data-testid=r3-not-today]'), quick: !!document.querySelector('[data-testid=r3-quick]') };
  });
  if (st.notToday) return tap(p, '[data-testid=r3-not-today]');
  if (!st.ready.length) {
    await tap(p, `[data-testid=r3-pick-${st.wants[0]}]`);
    if (st.quick) await tap(p, '[data-testid=r3-quick]');
    else {
      const items = await p.evaluate((d) => ({ tomato_egg_rice: ['rice', 'egg', 'tomato'], vegetable_egg_rice: ['rice', 'egg', 'vegetable'], cheese_egg_toast: ['bread', 'egg', 'cheese'] })[d], st.wants[0]);
      for (const i of items) await tap(p, `[data-testid=r3-bin-${i}]`);
      await tap(p, '[data-testid=r3-cook]');
    }
  }
  await tap(p, `[data-testid=r3-plate-${st.ready[0] ?? st.wants[0]}]`);
  await tap(p, '[data-testid=r3-serve]');
}
async function playMenu(p, menu) {
  await go(p, '', '?play=v3');
  const now = await p.evaluate(() => window.__r3.v.state.menu);
  for (const d of now.filter((d) => !menu.includes(d))) await tap(p, `[data-testid=r3-dish-${d}]`);
  for (const d of menu.filter((d) => !now.includes(d))) await tap(p, `[data-testid=r3-dish-${d}]`);
  const plan = await p.evaluate(() => window.__r3.v.state.plan);
  await tap(p, '[data-testid=r3-to-buy]');
  const cost = await p.$eval('[data-testid=r3-buy]', (e) => e.textContent);
  await tap(p, '[data-testid=r3-buy]');
  const seen = { notToday: 0 };
  for (let k = 0; k < 20 && (await p.evaluate(() => window.__r3.v.state.phase)) === 'serve'; k++) {
    if (await p.$('[data-testid=r3-not-today]')) seen.notToday++;
    await serveOne(p);
  }
  const close = await p.$eval('[data-testid=r3-close]', (e) => ({ result: Number(e.dataset.result), cash: Number(e.dataset.cash), sold: Number(e.dataset.sold) }));
  return { plan, cost, close, seen };
}
{
  const p = await page(390, 844);
  const tomato = await playMenu(p, ['tomato_egg_rice']);
  await p.screenshot({ path: `${OUT}/r3-tomato-only-close-390.png`, fullPage: true });
  ok('R3-04b', 'screen flow, tomato egg rice only: portions 3, buy 99; guests who want vegetable rice or toast get “今天沒有”; close: 3 served, result −11, wallet 447 (product case)', tomato.plan.tomato_egg_rice === 3 && tomato.cost.includes('99') && tomato.seen.notToday === 3 && tomato.close.sold === 3 && tomato.close.result === -11 && tomato.close.cash === 447, JSON.stringify(tomato));
  await p.evaluate(() => localStorage.removeItem('jy.restaurant.v3'));
  const toast = await playMenu(p, ['tomato_egg_rice', 'cheese_egg_toast']);
  ok('R3-04c', 'screen flow, tomato rice + cheese toast: portions 3 + 2, buy 147; guests 2 and 4 take the toast as their alternative, guest 6 gets 今天沒有; close: 5 served, result 7, wallet 459 (product case)', toast.plan.tomato_egg_rice === 3 && toast.plan.cheese_egg_toast === 2 && toast.cost.includes('147') && toast.seen.notToday === 1 && toast.close.sold === 5 && toast.close.result === 7 && toast.close.cash === 459, JSON.stringify(toast));
  // play again: confirm first, the finished day stays on record, the classic save is untouched
  await tap(p, '[data-testid=r3-save-coins]');
  await tap(p, '[data-testid=r3-again]');
  const dialog = await p.evaluate(() => ({ open: !!document.querySelector('dialog[open]'), focus: document.activeElement?.textContent }));
  await tap(p, '[data-testid=r3-again-yes]');
  const fresh = await p.evaluate(() => ({ phase: window.__r3.v.state.phase, cash: window.__r3.v.state.cash, last: document.querySelector('[data-testid=r3-last-game]')?.textContent, classic: localStorage.getItem('jy.restaurant.v1') }));
  ok('R3-07b', 'play again asks first (focus on “先不要”); the new day starts at 500 and shows “上一局：服務 5 位，錢包 459”; no classic save is created or changed', dialog.open && dialog.focus === '先不要' && fresh.phase === 'plan' && fresh.cash === 500 && fresh.last === '上一局：服務 5 位，錢包 459' && fresh.classic === null, JSON.stringify({ dialog, fresh }));
  // out of stock: tomato only, the 4th tomato rice is refused whole
  await tap(p, '[data-testid=r3-dish-vegetable_egg_rice]');
  await tap(p, '[data-testid=r3-to-buy]');
  await tap(p, '[data-testid=r3-buy]');
  for (const i of ['rice', 'egg', 'tomato']) await tap(p, `[data-testid=r3-bin-${i}]`);
  await tap(p, '[data-testid=r3-cook]');
  for (const i of ['rice', 'egg', 'tomato']) await tap(p, `[data-testid=r3-bin-${i}]`);
  await tap(p, '[data-testid=r3-cook]');
  await tap(p, '[data-testid=r3-quick]');
  const before = await p.evaluate(() => ({ egg: window.__r3.v.state.lots.filter((l) => l.item === 'egg').reduce((n, l) => n + l.qty, 0), rice: window.__r3.v.state.lots.filter((l) => l.item === 'rice').reduce((n, l) => n + l.qty, 0), plates: window.__r3.v.state.servings.length, tomatoBin: document.querySelector('[data-testid=r3-bin-tomato]').disabled }));
  await tap(p, '[data-testid=r3-quick]');
  const after = await p.evaluate(() => ({ egg: window.__r3.v.state.lots.filter((l) => l.item === 'egg').reduce((n, l) => n + l.qty, 0), rice: window.__r3.v.state.lots.filter((l) => l.item === 'rice').reduce((n, l) => n + l.qty, 0), plates: window.__r3.v.state.servings.length, msg: document.querySelector('[data-testid=r3-msg]')?.textContent }));
  ok('R3-02b', 'out of tomatoes after three: the tomato box is disabled and a 4th “直接做一份” is refused whole with “番茄用完了” — no rice or egg used, no plate added', before.tomatoBin && after.egg === before.egg && after.rice === before.rice && after.plates === before.plates && after.msg === '番茄用完了', JSON.stringify({ before, after }));
  await p.ctx.close();
}
{
  // advanced planning entry → the classic planner; wallets stay separate
  const p = await page(1280, 900);
  await go(p);
  await p.click('[data-testid=r3-advanced] summary');
  await tap(p, '[data-testid=r3-to-advanced]');
  await p.waitForSelector('[data-testid=restaurant]');
  const adv = await p.evaluate(() => ({ classic: !!document.querySelector('[data-testid=restaurant]'), plan: !!document.querySelector('[data-testid=plan-tomato_egg_rice]'), back: !!document.querySelector('[data-testid=r-to-v3]') }));
  await tap(p, '[data-testid=r-to-v3]');
  const v3 = await p.evaluate(() => !!document.querySelector('[data-testid=r3]'));
  ok('R3-adv', '「自己規劃（進階）」 before opening leads to the classic planner (manual portions per dish) and 「玩新版」 comes back; the two games keep separate saves', adv.classic && adv.plan && adv.back && v3, JSON.stringify({ adv, v3 }));
  await p.ctx.close();
}

// ---------------------------------------------------------------- R3-08 layouts; R3-09 keyboard, reduced motion
{
  const fails = [];
  for (const [w, h] of [[360, 800], [390, 844], [768, 1024], [1280, 900]])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const p = await page(w, h, { scheme, desktop: w >= 768 });
        await go(p, lang);
        const measure = () =>
          p.evaluate(() => {
            const vis = (b) => b.offsetParent && b.getBoundingClientRect().width;
            const small = [...document.querySelectorAll('[data-testid=r3] button')].filter((b) => vis(b) && (b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44)).map((b) => b.dataset.testid || b.textContent.slice(0, 8));
            const main = ['r3-to-buy', 'r3-buy', 'r3-cook', 'r3-serve'].map((id) => document.querySelector(`[data-testid=${id}]`)).filter(Boolean).filter((b) => b.getBoundingClientRect().height < 56).map((b) => b.dataset.testid);
            return { over: document.documentElement.scrollWidth > innerWidth + 1, small, main };
          });
        const m1 = await measure();
        await tap(p, '[data-testid=r3-to-buy]');
        const m2 = await measure();
        await tap(p, '[data-testid=r3-buy]');
        await tap(p, '[data-testid=r3-bin-rice]');
        const m3 = await measure();
        for (const [k, m] of [['plan', m1], ['buy', m2], ['serve', m3]]) if (m.over || m.small.length || m.main.length) fails.push(`${w}${lang}${scheme}:${k} ${JSON.stringify(m)}`);
        if (scheme === 'light' && (w === 360 || w === 1280)) await p.screenshot({ path: `${OUT}/r3-serve-${w}-${lang ? 'en' : 'zh'}.png`, fullPage: true });
        await p.ctx.close();
      }
  ok('R3-08', '360/390/768/1280 × zh/en × light/dark (plan, buy, serve): no horizontal scroll, every control ≥ 44 px, main actions ≥ 56 px', fails.length === 0, fails.join(' ; '));

  // keyboard only: the first guest from menu to payment
  const k = await page(1280, 900, { reduce: true });
  await go(k);
  const press = async (sel) => {
    await k.focus(sel);
    await k.keyboard.press('Enter');
    await sleep(230);
  };
  await press('[data-testid=r3-to-buy]');
  await press('[data-testid=r3-buy]');
  for (const i of ['tomato', 'rice', 'egg']) await press(`[data-testid=r3-bin-${i}]`);
  await press('[data-testid=r3-cook]');
  const anims = await k.evaluate(() => document.getAnimations().length);
  await press('[data-testid=r3-serve]');
  const kv = await k.evaluate(() => ({ cash: window.__r3.v.state.cash, anims: document.getAnimations().length }));
  ok('R3-09', 'keyboard only (Enter on each control) with reduced motion: menu → buy → three ingredients → cook → serve, paid 32; no animations run; no sound needed', kv.cash === 415 && anims === 0 && kv.anims === 0, JSON.stringify({ kv, anims }));
  await k.ctx.close();
}

ok('R3-err', 'no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
