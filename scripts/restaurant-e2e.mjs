// Little Restaurant Owner one-day prototype — browser checks (Issue #4).
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
async function page(ctx, w = 1280, h = 860, scheme = 'light') {
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  return p;
}
const S = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__restaurant.s)));
const click = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 8000 });
  await p.click(sel);
  await sleep(120);
};
const go = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/restaurant`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=restaurant]');
};
const sell = async (p, o, dish) => click(p, `[data-testid=order-${o}] button[data-dish=${dish}]`);

try {
  // ---------- full baseline day ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx);
    await go(p);
    ok('UI', 'prototype page loads with default plan (two rice dishes ×3)', (await p.$eval('[data-testid=plan-tomato_egg_rice]', (e) => e.dataset.value)) === '3' && (await p.$eval('[data-testid=plan-vegetable_egg_rice]', (e) => e.dataset.value)) === '3');
    // shared ingredient lookup
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('蛋') && b.getAttribute('aria-pressed') !== null && b.textContent.length < 6).click());
    const used = await p.$eval('[data-testid=r-usedby]', (e) => e.textContent);
    ok('UI', 'tapping an ingredient lists every dish using it (text, not colour only)', used.includes('番茄蛋飯') && used.includes('蔬菜蛋炒飯') && used.includes('起司蛋吐司'), used);
    await p.screenshot({ path: `${OUT}/1280-zh-light-menu.png`, fullPage: true });
    await click(p, '[data-testid=r-to-buy]');
    const rows = await p.$$eval('[data-testid=r-buy-table] tbody tr', (rs) => Object.fromEntries(rs.map((r) => [r.dataset.item, [Number(r.dataset.need), Number(r.dataset.short), Number(r.dataset.suggest)]])));
    const spend = await p.$eval('[data-testid=r-spend]', (e) => Number(e.textContent));
    ok('RT01', 'shopping list sums needs (rice 6, egg 6, tomato 3, veg 3, boxes 6) → 117', spend === 117 && rows.rice[0] === 6 && rows.egg[0] === 6 && rows.tomato[0] === 3 && rows.vegetable[0] === 3 && rows.packaging[0] === 6 && rows.rice[2] === 1 && rows.egg[2] === 1, JSON.stringify(rows));
    await p.click('[data-testid=r-compare] summary');
    const cmp = await p.$eval('[data-testid=r-compare]', (e) => e.innerText);
    ok('UI', 'comparison explains 201 vs 117 and that 84 is stock/cash, not a discount', cmp.includes('201') && cmp.includes('117') && cmp.includes('84') && cmp.includes('不是單價變便宜'));
    await p.screenshot({ path: `${OUT}/1280-zh-light-buy.png`, fullPage: true });
    await click(p, '[data-testid=r-confirm-buy]');
    let s = await S(p);
    ok('RT12', 'purchase charged once (500 → 383)', s.cash === 383 && s.phase === 'prep');
    // refresh after purchase
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=restaurant]');
    s = await S(p);
    ok('RT12', 'refresh after purchase restores the same plan, stock and cash without charging again', s.cash === 383 && s.phase === 'prep' && s.lots.length === 5);
    // cook batch 1: 2 + 2
    await click(p, '[data-testid=make1-tomato_egg_rice]');
    await click(p, '[data-testid=make1-tomato_egg_rice]');
    await click(p, '[data-testid=make1-vegetable_egg_rice]');
    await click(p, '[data-testid=make1-vegetable_egg_rice]');
    await click(p, '[data-testid=make1-vegetable_egg_rice]'); // 5th in batch → refused
    const err = await p.$eval('[data-testid=r-error]', (e) => e.textContent).catch(() => '');
    s = await S(p);
    ok('RT05', 'fifth serving in a batch refused with a message; nothing changes', err.includes('4') && s.madeThisBatch === 4 && s.servings.length === 4, err);
    await p.screenshot({ path: `${OUT}/1280-zh-light-prep.png`, fullPage: true });
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=restaurant]');
    s = await S(p);
    ok('RT12', 'refresh after cooking keeps meals, stock and batch capacity', s.servings.length === 4 && s.madeThisBatch === 4 && s.madeToday === 4 && s.cash === 383);
    await click(p, '[data-testid=r-open]');
    ok('UI', 'first batch shows only guests 1–3', (await p.$$('[data-testid^=order-]')).length === 3);
    await sell(p, 0, 'tomato_egg_rice');
    const before = (await S(p)).cash;
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=restaurant]');
    s = await S(p);
    ok('RT12', 'refresh after a sale keeps the money once and the guest handled', s.cash === before && s.cash === 383 + 32 && s.orders[0].status === 'sold');
    const noMatchDisabled = await p.$eval('[data-testid=order-1] [data-nomatch]', (b) => b.disabled);
    ok('RT11', '“nothing suitable” is unavailable while a suitable meal is ready', noMatchDisabled);
    await sell(p, 1, 'vegetable_egg_rice');
    await sell(p, 2, 'tomato_egg_rice');
    await p.screenshot({ path: `${OUT}/1280-zh-light-serve.png`, fullPage: true });
    await click(p, '[data-testid=r-end-batch]');
    await click(p, '[data-testid=make1-tomato_egg_rice]');
    await click(p, '[data-testid=make1-vegetable_egg_rice]');
    await click(p, '[data-testid=r-open]');
    await sell(p, 3, 'vegetable_egg_rice');
    await sell(p, 4, 'tomato_egg_rice');
    await sell(p, 5, 'vegetable_egg_rice');
    await click(p, '[data-testid=r-end-batch]');
    const led = await p.$eval('[data-testid=r-ledger]', (e) => ({ ...e.dataset }));
    ok('RT07', 'ledger: revenue 201, cost 117, waste 0, result 34, cash 534', led.revenue === '201' && led.cogs === '117' && led.waste === '0' && led.result === '34' && led.cash === '534', JSON.stringify(led));
    await p.screenshot({ path: `${OUT}/1280-zh-light-ledger.png`, fullPage: true });
    await click(p, '[data-testid=r-decor-buy]');
    s = await S(p);
    ok('RT07', 'buying the 120 decoration leaves 414; marked decoration only', s.cash === 414 && s.phase === 'done' && (await p.evaluate(() => document.body.innerText.includes('收入不保證增加') || document.body.innerText.includes('今天營業完成'))));
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=r-done]');
    ok('RT12', 'refresh at the end keeps 414 and the single decoration purchase', (await S(p)).cash === 414 && (await S(p)).decor.length === 1);
    await p.screenshot({ path: `${OUT}/1280-zh-light-done.png`, fullPage: true });
    ok('UI', 'no page errors', p.errors.length === 0, p.errors.join(' | '));
    await ctx.close();
  }
  // ---------- RT14 / RT13 in the UI ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 390, 844);
    await go(p);
    // RT13: drop fried rice, add toast ×3
    await p.click('[data-testid=dish-vegetable_egg_rice] button[aria-pressed]');
    await p.click('[data-testid=dish-cheese_egg_toast] button[aria-pressed]');
    for (let i = 0; i < 3; i++) await p.click('[data-testid=plan-cheese_egg_toast] button[aria-label="+"]');
    const needs = await p.$$eval('[data-testid=r-needs] li', (ls) => Object.fromEntries(ls.map((l) => [l.dataset.item, Number(l.dataset.need)])));
    ok('RT13', 'menu change re-sums needs: rice 3, egg 6, bread 3, cheese 3; no vegetables', needs.rice === 3 && needs.egg === 6 && needs.bread === 3 && needs.cheese === 3 && !needs.vegetable, JSON.stringify(needs));
    await p.screenshot({ path: `${OUT}/390-zh-light-menu.png`, fullPage: true });
    // RT14: little cash
    await p.evaluate(() => {
      const c = window.__restaurant;
      c.s = { ...c.s, cash: 130, cashOpen: 130 };
    });
    await click(p, '[data-testid=r-to-buy]');
    const disabled = await p.$eval('[data-testid=r-confirm-buy]', (b) => b.disabled);
    const txt = await p.evaluate(() => document.body.innerText);
    ok('RT14', 'not enough cash (fixed costs reserved): explains the gap, purchase disabled, no charge', disabled && txt.includes('還差') && (await S(p)).cash === 130 && (await S(p)).lots.length === 0);
    await p.screenshot({ path: `${OUT}/390-zh-light-buy-cash.png`, fullPage: true });
    await ctx.close();
  }
  // ---------- responsive matrix ----------
  for (const [w, h] of [
    [360, 780],
    [390, 844],
    [768, 1024],
    [1280, 860],
  ])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.createBrowserContext();
        const p = await page(ctx, w, h, scheme);
        await go(p, lang);
        const shots = [];
        const check = async (label) => {
          const r = await p.evaluate(() => {
            const W = innerWidth;
            const vis = (e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
            const inScroller = (e) => {
              for (let a = e.parentElement; a; a = a.parentElement) {
                const ox = getComputedStyle(a).overflowX;
                if ((ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth) return true;
              }
              return false;
            };
            const ctrls = [...document.querySelectorAll('main button, main select, main summary')].filter(vis);
            const small = ctrls.filter((e) => e.getBoundingClientRect().height < 43.5 || e.getBoundingClientRect().width < 43.5).map((e) => e.textContent.trim().slice(0, 10));
            const off = ctrls.filter((e) => !inScroller(e) && (e.getBoundingClientRect().right > W + 1 || e.getBoundingClientRect().left < -1)).length;
            return { scroll: document.documentElement.scrollWidth > W, small, off };
          });
          shots.push(`${label}:${r.scroll ? 'X' : ''}${r.off ? `off${r.off}` : ''}${r.small.length ? `small(${r.small.join('|')})` : ''}`);
          return !r.scroll && !r.off && !r.small.length;
        };
        const name = `${w}-${lang ? 'en' : 'zh'}-${scheme}`;
        let pass = await check('menu');
        await p.screenshot({ path: `${OUT}/${name}-menu.png`, fullPage: true });
        await click(p, '[data-testid=r-to-buy]');
        pass = (await check('buy')) && pass;
        await p.screenshot({ path: `${OUT}/${name}-buy.png`, fullPage: true });
        await click(p, '[data-testid=r-confirm-buy]');
        pass = (await check('prep')) && pass;
        ok('UI', `${name}: no horizontal overflow, controls ≥ 44 px (shopping table scrolls inside its box)`, pass && p.errors.length === 0, shots.join(' '));
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
