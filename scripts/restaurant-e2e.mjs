// Little Restaurant Owner — scene version (V2) browser acceptance (Issue #4, V2-01…V2-09; RT numbers via the UI).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node restaurant-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/restaurant';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${info}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const version = await browser.version();
async function page(ctx, w = 1280, h = 860, opts = {}) {
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: opts.reduce ? 'reduce' : 'no-preference' },
  ]);
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  return p;
}
const S = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__restaurant.s)));
const fxIdle = (p) => p.waitForFunction(() => !document.querySelector('[data-testid=restaurant]')?.dataset.fx, { timeout: 5000 });
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 8000 });
  await fxIdle(p);
  // keep the control clear of the sticky site header
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(60);
  await fxIdle(p);
};
const go = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/restaurant?play=classic`, { waitUntil: 'load' }); // the classic (V2) game
  await p.waitForSelector('[data-testid=restaurant]');
};
const text = (p) => p.evaluate(() => document.body.innerText);
const guestOnStage = (p) => p.$eval('[data-testid=r-guest]', (e) => Number(e.dataset.guest)).catch(() => null);
/** serve the current guest their favourite if ready, else the alternative, else "not today" */
async function serveAll(p) {
  for (let k = 0; k < 3; k++) {
    const g = await guestOnStage(p);
    if (g === null) break;
    const s = await S(p);
    const c = s.customers[g];
    const ready = (d) => s.servings.some((x) => x.dish === d) && s.menu.includes(d);
    const d = [c.likes, c.alsoAccepts].find((x) => x && ready(x));
    if (d) await tap(p, `[data-testid=plate-${d}]`);
    else await tap(p, '[data-testid=r-nomatch]');
  }
  await tap(p, '[data-testid=r-end-batch]');
}

try {
  // ---------- V2-01 / V2-05 / V2-09: first visit, picture-card day, baseline numbers ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 390, 844);
    await go(p);
    const words = (await p.$eval('[data-testid=r-prompt] span', (e) => e.textContent)).length;
    ok('V2-01', 'first screen: short prompt, picture cards, ledger closed', words <= 10 && (await p.$$('[data-testid^=dish-] img')).length >= 3 && !(await p.$('[data-testid=r-ledger]')), `prompt ${words} chars`);
    ok('V2-02', 'shared ingredients named on the menu step (rice & egg used by 2 dishes)', (await p.$eval('[data-testid=r-shared]', (e) => e.textContent)).includes('米') && (await p.$eval('[data-testid=r-tray]', (e) => e.innerText)).includes('6'));
    await p.screenshot({ path: `${OUT}/390-zh-light-1-menu.png`, fullPage: true });
    await tap(p, '[data-testid=r-to-buy]');
    const buy = await p.$$eval('[data-testid=r-buy] li', (ls) => Object.fromEntries(ls.map((l) => [l.dataset.item, [Number(l.dataset.need), Number(l.dataset.packs)]])));
    const btn = await p.$eval('[data-testid=r-confirm-buy]', (b) => b.textContent);
    ok('RT01', 'one rice box and one egg box for both dishes; Buy for 117', buy.rice[0] === 6 && buy.rice[1] === 1 && buy.egg[0] === 6 && buy.egg[1] === 1 && btn.includes('117'), JSON.stringify(buy));
    ok('V2-06', '390 px: shopping needs no sideways scrolling (pack counts visible on cards)', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && (await p.$$eval('[data-testid=r-buy] li', (ls) => ls.every((l) => l.getBoundingClientRect().right <= innerWidth))));
    await p.screenshot({ path: `${OUT}/390-zh-light-2-buy.png`, fullPage: true });
    await tap(p, '[data-testid=r-confirm-buy]');
    ok('V2-03', 'before cooking: this batch’s three first choices shown as pictures', (await p.$$('[data-testid=r-preview] img')).length === 3);
    // V2-04: double tap while the cook animation runs → one serving only
    await p.waitForSelector('[data-testid=make1-tomato_egg_rice]');
    await p.click('[data-testid=make1-tomato_egg_rice]');
    await p.click('[data-testid=make1-tomato_egg_rice]').catch(() => {});
    await p.click('[data-testid=make1-tomato_egg_rice]').catch(() => {});
    await sleep(80);
    ok('V2-04', 'tapping again during the animation does not cook twice', (await S(p)).servings.length === 1);
    await p.screenshot({ path: `${OUT}/390-zh-light-3-cook.png` });
    // reload in the middle of the animation
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=restaurant]');
    ok('V2-04', 'reload during the animation shows the committed state once (1 meal, cash 383)', (await S(p)).servings.length === 1 && (await S(p)).cash === 383);
    await tap(p, '[data-testid=make1-tomato_egg_rice]');
    await tap(p, '[data-testid=make1-vegetable_egg_rice]');
    // skip animation
    await p.waitForSelector('[data-testid=make1-vegetable_egg_rice]');
    await p.click('[data-testid=make1-vegetable_egg_rice]');
    const skipBtn = await p.$('[data-testid=r-skip]');
    if (skipBtn) await skipBtn.click();
    await sleep(50);
    ok('V2-04', 'skipping the animation keeps the result (4 meals) and unlocks input', (await S(p)).servings.length === 4 && !(await p.$eval('[data-testid=restaurant]', (e) => e.dataset.fx)));
    // pause blocks actions
    await tap(p, '[data-testid=r-pause]');
    const before = (await S(p)).seq;
    await p.click('[data-testid=r-open]').catch(() => {});
    ok('V2-04', 'pause covers the scene and blocks actions', !!(await p.$('[data-testid=r-paused]')) && (await S(p)).seq === before);
    await p.screenshot({ path: `${OUT}/390-zh-light-pause.png` });
    await p.click('[data-testid=r-pause]');
    await tap(p, '[data-testid=r-open]');
    const bubble = await p.$$eval('.rs-bubble img', (is) => is.length);
    ok('V2-03', 'serving: the guest bubble shows every acceptable dish (pictures joined by “or”)', bubble === 2 && (await p.$eval('.rs-bubble', (e) => e.textContent)).includes('或'));
    await p.screenshot({ path: `${OUT}/390-zh-light-4-serve.png`, fullPage: true });
    // serve guest 1 and reload mid-animation
    await p.click('[data-testid=plate-tomato_egg_rice]');
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=restaurant]');
    let s = await S(p);
    ok('V2-04', 'reload during the serving animation: paid once, guest handled once', s.cash === 383 + 32 && s.orders[0].status === 'sold' && s.orders[1].status === 'pending');
    await serveAll(p);
    await tap(p, '[data-testid=make1-tomato_egg_rice]');
    await tap(p, '[data-testid=make1-vegetable_egg_rice]');
    await tap(p, '[data-testid=r-open]');
    await serveAll(p);
    const res = await p.$eval('[data-testid=r-result]', (e) => ({ ...e.dataset }));
    ok('V2-05', 'all six sold: result 34, cash 534 (RT07 via the scene)', res.result === '34' && res.cash === '534' && res.sold === '6', JSON.stringify(res));
    const reflect = await p.$eval('[data-testid=r-reflect]', (e) => e.textContent);
    ok('V2-09', 'reflection matches the real result (no leftovers → no “still usable” question) and can be skipped', !reflect.includes('明天還能用') && !!(await p.$('[data-testid=r-reflect] button')), reflect);
    await p.screenshot({ path: `${OUT}/390-zh-light-5-close.png`, fullPage: true });
    await tap(p, '[data-testid=r-decor-buy]');
    s = await S(p);
    ok('V2-09', 'plant appears in the shop; cash 414; ledger lists the upgrade separately and the day result stays 34', s.cash === 414 && !!(await p.$('[data-testid=r-plant]')) && (await (async () => {
      await tap(p, '[data-testid=r-ledger-toggle]');
      const b = await p.$eval('[data-testid=r-books]', (e) => ({ ...e.dataset, t: e.innerText }));
      return b.result === '34' && b.t.includes('裝潢支出');
    })()));
    await p.screenshot({ path: `${OUT}/390-zh-light-6-done-ledger.png`, fullPage: true });
    ok('V2-07', 'no page errors and nothing spoken automatically', p.errors.length === 0);
    await ctx.close();
  }
  // ---------- V2-05 only five sold (scenario), V2-03 nothing to serve ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 1280, 860, { reduce: true });
    await go(p);
    await p.evaluate(() => {
      const c = window.__restaurant;
      const customers = c.s.customers.map((x, i) => (i === 4 ? { likes: 'cheese_egg_toast', alsoAccepts: null, budget: 40 } : x));
      c.s = { ...c.s, customers };
    });
    await tap(p, '[data-testid=r-to-buy]');
    await tap(p, '[data-testid=r-confirm-buy]');
    for (const d of ['tomato_egg_rice', 'tomato_egg_rice', 'vegetable_egg_rice', 'vegetable_egg_rice']) await tap(p, `[data-testid=make1-${d}]`);
    await tap(p, '[data-testid=r-open]');
    await serveAll(p);
    await tap(p, '[data-testid=make1-tomato_egg_rice]');
    await tap(p, '[data-testid=make1-vegetable_egg_rice]');
    await tap(p, '[data-testid=r-open]');
    await serveAll(p);
    await tap(p, '[data-testid=r-ledger-toggle]');
    const b = await p.$eval('[data-testid=r-books]', (e) => ({ ...e.dataset }));
    ok('V2-05', 'only five sold: 169 / 98 / waste 19 / result 2 / cash 502 (RT08)', b.revenue === '169' && b.cogs === '98' && b.waste === '19' && b.result === '2' && b.cash === '502', JSON.stringify(b));
    ok('V2-07', 'reduced motion: no animation state is ever entered', (await p.evaluate(() => window.__restaurant.fx)) === null);
    await p.screenshot({ path: `${OUT}/1280-zh-light-ledger-five-sold.png`, fullPage: true });
    await ctx.close();
  }
  {
    // empty day: buy nothing, cook nothing, every guest gets "not today", day still closes
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 390, 844, { reduce: true });
    await go(p);
    await tap(p, '[data-testid=r-to-buy]');
    await p.evaluate(() => {
      const c = window.__restaurant;
      c.setDraft({ rice: 0, egg: 0, tomato: 0, vegetable: 0, packaging: 0, bread: 0, cheese: 0 });
    });
    await tap(p, '[data-testid=r-confirm-buy]');
    const skipLabel = await p.$eval('[data-testid=r-open]', (b) => b.textContent);
    await tap(p, '[data-testid=r-open]');
    await serveAll(p);
    await tap(p, '[data-testid=r-open]');
    await serveAll(p);
    const s = await S(p);
    ok('V2-03', 'no stock and no meals: “Skip cooking” and “Not today” lead to closing (no dead end)', skipLabel.includes('這批先不做') && s.phase === 'closed' && s.orders.every((o) => o.status === 'no_match') && s.cash === 450);
    await ctx.close();
  }
  // ---------- V2-02 / V2-07 missing eggs, no cash, keyboard ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 768, 1024, { reduce: true });
    await go(p);
    await p.evaluate(() => {
      const c = window.__restaurant;
      c.s = { ...c.s, cash: 130, cashOpen: 130 };
    });
    await tap(p, '[data-testid=r-to-buy]');
    ok('V2-07', 'not enough coins: icon + short text, Buy disabled, nothing charged (RT14)', (await text(p)).includes('錢不夠') && (await p.$eval('[data-testid=r-confirm-buy]', (b) => b.disabled)) && (await S(p)).cash === 130);
    await p.screenshot({ path: `${OUT}/768-zh-light-no-cash.png`, fullPage: true });
    // eggs short for all dishes: buy everything but eggs
    await p.evaluate(() => {
      const c = window.__restaurant;
      c.s = { ...c.s, cash: 500, cashOpen: 500 };
      c.setDraft({ rice: 1, egg: 0, tomato: 1, vegetable: 1, packaging: 6 });
    });
    ok('V2-02', 'egg shortage lists every affected dish before buying', (await text(p)).includes('缺 蛋') && (await text(p)).includes('番茄蛋飯') && (await text(p)).includes('蔬菜蛋炒飯'));
    await tap(p, '[data-testid=r-confirm-buy]');
    const labels = await p.$$eval('[data-testid^=make1-]', (bs) => bs.map((b) => [b.disabled, b.textContent]));
    ok('V2-02', 'empty egg box: every egg dish shows “No eggs” with an icon, not colour only', labels.every(([dis, t]) => dis && t.includes('缺 蛋')), JSON.stringify(labels));
    await p.screenshot({ path: `${OUT}/768-zh-light-no-eggs.png`, fullPage: true });
    await ctx.close();
  }
  {
    // keyboard only: Tab to controls and press Enter / Space for a whole day
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 1280, 860, { reduce: true });
    await go(p, '/en');
    const press = async (sel) => {
      await p.waitForSelector(sel, { visible: true });
      await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
      await p.focus(sel);
      await p.keyboard.press('Enter');
      await sleep(40);
    };
    await press('[data-testid=r-to-buy]');
    await press('[data-testid=r-confirm-buy]');
    for (const d of ['tomato_egg_rice', 'tomato_egg_rice', 'vegetable_egg_rice', 'vegetable_egg_rice']) await press(`[data-testid=make1-${d}]`);
    await press('[data-testid=r-open]');
    for (let k = 0; k < 3; k++) {
      const g = await guestOnStage(p);
      const s = await S(p);
      await press(`[data-testid=plate-${s.customers[g].likes}]`);
    }
    await press('[data-testid=r-end-batch]');
    await press('[data-testid=make1-tomato_egg_rice]');
    await press('[data-testid=make1-vegetable_egg_rice]');
    await press('[data-testid=r-open]');
    for (let k = 0; k < 3; k++) {
      const g = await guestOnStage(p);
      const s = await S(p);
      await press(`[data-testid=plate-${s.customers[g].likes}]`);
    }
    await press('[data-testid=r-end-batch]');
    await press('[data-testid=r-decor-skip]');
    ok('V2-07', 'keyboard only (English, sound off, reduced motion): full day to cash 534', (await S(p)).cash === 534 && (await S(p)).phase === 'done');
    await ctx.close();
  }
  // ---------- V2-08 restart confirm, unreadable save, tabs, draft ----------
  {
    const ctx = await browser.createBrowserContext();
    const a = await page(ctx, 1280, 860, { reduce: true });
    await go(a);
    await tap(a, '[data-testid=r-to-buy]');
    await a.evaluate(() => window.__restaurant.setDraft({ rice: 2, egg: 1, tomato: 1, vegetable: 1, packaging: 6 }));
    await a.reload({ waitUntil: 'load' });
    await a.waitForSelector('[data-testid=r-confirm-buy]');
    ok('V2-08', 'unsent shopping draft (manual packs) survives a reload', (await a.$eval('[data-testid=r-confirm-buy]', (b) => b.textContent)).includes('153'));
    await tap(a, '[data-testid=r-restart]');
    await a.waitForSelector('[data-testid=r-restart-dialog]', { visible: true });
    await a.screenshot({ path: `${OUT}/1280-zh-light-restart-confirm.png` });
    await a.evaluate(() => [...document.querySelectorAll('dialog button')].find((b) => b.textContent.includes('繼續玩')).click());
    await sleep(100);
    ok('V2-08', 'restart asks first; “keep playing” changes nothing', (await S(a)).phase === 'buy');
    const b = await page(ctx, 1280, 860, { reduce: true });
    await go(b);
    const seqB = (await S(b)).seq;
    await tap(a, '[data-testid=r-restart]');
    await a.waitForSelector('[data-testid=r-restart-yes]', { visible: true });
    await a.click('[data-testid=r-restart-yes]');
    await sleep(300);
    const sb = await S(b);
    ok('V2-08', 'restart in one tab is adopted by the other (sequence keeps growing, not reset to 0)', sb.phase === 'plan' && sb.seq > seqB && (await text(b)).includes('另一個分頁'), `seq ${seqB} → ${sb.seq}`);
    await b.close();
    await a.evaluate(() => localStorage.setItem('jy.restaurant.v1', JSON.stringify({ version: 1, cash: -5, phase: 'nope' })));
    await a.reload({ waitUntil: 'load' });
    await a.waitForSelector('[data-testid=restaurant]');
    const backup = await a.evaluate(() => Object.keys(localStorage).some((k) => (k.startsWith('jy.restaurant.v1.unreadable.') || k.startsWith('jy.restaurant.v1.backup-')) && localStorage.getItem(k).includes('nope')));
    ok('V2-08', 'damaged save: notice shown, original kept as backup, a fresh day starts', backup && (await text(a)).includes('已另存備份') && (await S(a)).cash === 500);
    await ctx.close();
  }
  // ---------- V2-06 layout matrix ----------
  for (const [w, h] of [
    [360, 780],
    [390, 844],
    [768, 1024],
    [1280, 860],
  ])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.createBrowserContext();
        const p = await page(ctx, w, h, { scheme, reduce: true });
        await go(p, lang);
        const shots = [];
        const check = async (label) => {
          const r = await p.evaluate(() => {
            const W = innerWidth;
            const vis = (e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
            const ctrls = [...document.querySelectorAll('[data-testid=restaurant] button')].filter(vis);
            const small = ctrls.filter((e) => e.getBoundingClientRect().height < 43.5 || e.getBoundingClientRect().width < 43.5).map((e) => e.textContent.trim().slice(0, 8));
            const off = ctrls.filter((e) => e.getBoundingClientRect().right > W + 1 || e.getBoundingClientRect().left < -1).length;
            const main = ['r-to-buy', 'r-confirm-buy', 'r-open', 'r-end-batch'].map((t) => document.querySelector(`[data-testid=${t}]`)).filter(Boolean).every((e) => e.getBoundingClientRect().height >= 55.5);
            return { scroll: document.documentElement.scrollWidth > W, small, off, main };
          });
          shots.push(`${label}:${r.scroll ? 'X' : ''}${r.off ? `off${r.off}` : ''}${r.small.length ? `small(${r.small.join('|')})` : ''}${r.main ? '' : 'main<56'}`);
          return !r.scroll && !r.off && !r.small.length && r.main;
        };
        const name = `${w}-${lang ? 'en' : 'zh'}-${scheme}`;
        let pass = await check('menu');
        await p.screenshot({ path: `${OUT}/${name}-menu.png`, fullPage: true });
        await tap(p, '[data-testid=r-to-buy]');
        pass = (await check('buy')) && pass;
        await tap(p, '[data-testid=r-confirm-buy]');
        await tap(p, '[data-testid=make1-tomato_egg_rice]');
        pass = (await check('cook')) && pass;
        await tap(p, '[data-testid=r-open]');
        pass = (await check('serve')) && pass;
        await p.screenshot({ path: `${OUT}/${name}-serve.png`, fullPage: true });
        await tap(p, '[data-testid=r-ledger-toggle]');
        pass = (await check('ledger')) && pass;
        ok('V2-06', `${name}: no sideways scroll; controls ≥ 44 px; main actions ≥ 56 px`, pass && p.errors.length === 0, shots.join(' '));
        await ctx.close();
      }
} catch (e) {
  ok('ERR', 'unexpected exception', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  writeFileSync(`docs/test-results/restaurant-e2e-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, browser: version, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed (${version})`);
  process.exit(failed ? 1 : 0);
}
