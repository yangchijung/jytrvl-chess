// Planet Rescue Crew — prototype browser acceptance.
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node rescue-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/rescue';
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
async function page(ctx, w = 1280, h = 900, opts = {}) {
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
const go = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/rescue`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=rescue]');
};
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 10000 });
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(50);
};
const prompt = (p) => p.$eval('[data-testid=rescue-prompt]', (e) => e.innerText);
const disabled = (p, sel) => p.$eval(sel, (b) => b.disabled);
async function trip(p, k, route, items) {
  await tap(p, `[data-testid=select-${k}]`);
  await tap(p, `[data-testid=route-${k}-${route}]`);
  for (const i of items) await tap(p, `[data-testid=add-${i}]`);
}
const confirmAll = async (p) => {
  for (const r of ['navigator', 'engineer', 'supplier']) await tap(p, `[data-testid=ok-${r}]`);
};
const waitDone = (p) => p.waitForFunction(() => document.querySelector('[data-ok]')?.dataset.ok !== '', { timeout: 20000 });
const story = (p) => p.$eval('[data-testid=rescue-story]', (e) => e.innerText).catch(() => '');

// ---------- basics
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx);
  await go(p);
  const meta = await p.$eval('meta[name=robots]', (e) => e.content).catch(() => '');
  ok('P-01', 'zh setup: story, three roles, team size, 4 missions, noindex', (await prompt(p)).includes('基地沒電了') && (await p.$$('[data-testid^=mission-]')).length === 4 && /noindex/.test(meta), meta);
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  ok('P-02', 'not linked from home', (await p.$$eval('a[href$="/rescue"]', (a) => a.length)) === 0);
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok('P-03', 'robots.txt disallows /rescue', /Disallow: \/rescue\n/.test(robots) && /Disallow: \/en\/rescue\n/.test(robots));
  const e = await page(ctx);
  await go(e, '/en');
  ok('P-04', 'en setup loads', (await prompt(e)).includes('The base lost power'));
  await ctx.close();
}

// ---------- three players, mission 2
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx);
  await go(p);
  await tap(p, '[data-testid=mode-three]');
  await tap(p, '[data-testid=mission-M2]');
  ok('P-05', 'cards are hidden on the shared screen; roads show "?"', !(await p.$('[data-testid^=card-]')) && (await p.$eval('[data-testid=feature-yellow]', (e) => e.dataset.shown)) === 'false');
  await tap(p, '[data-testid=peek-navigator]');
  const coverText = await p.$eval('[data-testid=rescue-cover]', (e) => e.innerText);
  const hiddenFirst = !(await p.$('[data-testid=card-navigator]'));
  await tap(p, '[data-testid=cover-open]');
  const nav = await p.$eval('[data-testid=card-navigator]', (e) => e.innerText);
  await p.screenshot({ path: `${OUT}/rescue-cover-navigator.png` });
  await tap(p, '[data-testid=cover-close]');
  ok('P-06', 'pass-the-tablet cover: hand over first, then the navigator card (roads)', hiddenFirst && coverText.includes('把平板交給 導航員') && nav.includes('黃色路') && nav.includes('橋壞了') && !(await p.$('[data-testid=rescue-cover]')), nav.replace(/\n/g, ' '));
  await tap(p, '[data-testid=peek-engineer]');
  await tap(p, '[data-testid=cover-open]');
  const eng = await p.$eval('[data-testid=card-engineer]', (e) => e.innerText);
  await tap(p, '[data-testid=cover-close]');
  await tap(p, '[data-testid=peek-supplier]');
  await tap(p, '[data-testid=cover-open]');
  const sup = await p.$eval('[data-testid=card-supplier]', (e) => e.innerText);
  await tap(p, '[data-testid=cover-close]');
  ok('P-07', 'engineer sees needs; supplier sees storage, capacity and heavy items', eng.includes('×1') && sup.includes('一趟最多載 2 件') && sup.includes('電池是重物'), `${eng.replace(/\n/g, ' ')} | ${sup.replace(/\n/g, ' ')}`);
  // first plan forgets the plank
  await trip(p, 0, 'yellow', ['battery', 'panel']);
  ok('P-08', 'go needs a plan and all three confirmations', await disabled(p, '[data-testid=rescue-go]'));
  await confirmAll(p);
  const enabled = !(await disabled(p, '[data-testid=rescue-go]'));
  await tap(p, '[data-testid=add-cable]');
  const reset = await disabled(p, '[data-testid=rescue-go]');
  await tap(p, '[data-testid=cargo-0-2]');
  ok('P-09', 'changing the plan clears confirmations', enabled && reset);
  await confirmAll(p);
  await tap(p, '[data-testid=rescue-go]');
  await sleep(200);
  const moving = (await p.$eval('[data-ok]', (e) => e.dataset.playing)) === 'true';
  await waitDone(p);
  const s1 = await story(p);
  ok('P-10', 'rover animates, stops at the bridge; story is a chain of causes', moving && s1.includes('第 1 趟：走黃色路') && s1.includes('橋壞了，車上沒有木板，所以過不去') && (await p.$eval('[data-ok]', (e) => e.dataset.ok)) === 'false', s1.replace(/\n/g, ' '));
  ok('P-11', 'the road feature is revealed after the run', (await p.$eval('[data-testid=feature-yellow]', (e) => e.dataset.shown)) === 'true');
  await p.screenshot({ path: `${OUT}/rescue-fail.png` });
  await tap(p, '[data-testid=rescue-retry]');
  const kept = await p.evaluate(() => window.__rescue.plan[0].cargo.join());
  ok('P-12', 'change the plan keeps what was written', kept === 'battery,panel', kept);
  // fix: plank + battery first, then panel + cable
  await tap(p, '[data-testid=cargo-0-1]');
  await tap(p, '[data-testid=select-0]');
  await tap(p, '[data-testid=add-plank]');
  await trip(p, 1, 'yellow', ['panel', 'cable']);
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-testid=rescue]');
  await tap(p, '[data-testid=mission-M2]');
  const plan = await p.evaluate(() => JSON.stringify(window.__rescue.plan));
  ok('P-13', 'plan survives reload', plan === JSON.stringify([{ route: 'yellow', cargo: ['battery', 'plank'] }, { route: 'yellow', cargo: ['panel', 'cable'] }]), plan);
  await confirmAll(p);
  await tap(p, '[data-testid=rescue-go]');
  await waitDone(p);
  const s2 = await story(p);
  const lit = await p.$eval('[data-testid=rescue-base]', (e) => e.dataset.lit);
  ok('P-14', 'fixed plan: bridge repaired, parts delivered, base lights up', s2.includes('用木板修好了橋') && s2.includes('送到基地') && lit === 'true' && (await prompt(p)).includes('基地亮燈了'), s2.replace(/\n/g, ' '));
  await p.screenshot({ path: `${OUT}/rescue-success.png` });
  ok('P-15', 'success: star saved, swap-roles tip, next mission', (await p.evaluate(() => JSON.parse(localStorage.getItem('jy.rescue.v1')).done)).includes('M2') && (await p.evaluate(() => document.body.innerText.includes('下一關換角色'))) && !!(await p.$('[data-testid=rescue-next]')));
  // M3: over capacity and missing
  await tap(p, '[data-testid=rescue-next]');
  await trip(p, 0, 'yellow', ['battery', 'battery', 'panel']);
  await confirmAll(p);
  await tap(p, '[data-testid=rescue-go]');
  await waitDone(p);
  const s3 = await story(p);
  await tap(p, '[data-testid=rescue-retry]');
  await tap(p, '[data-testid=cargo-0-2]');
  await confirmAll(p);
  await tap(p, '[data-testid=rescue-go]');
  await waitDone(p);
  const s4 = await story(p);
  ok('P-16', 'over capacity and "still missing" messages', s3.includes('載了 3 件，車子一次只能載 2 件') && s4.includes('基地還缺：太陽能板×2'), `${s3.replace(/\n/g, ' ')} | ${s4.replace(/\n/g, ' ')}`);
  await tap(p, '[data-testid=rescue-retry]');
  await trip(p, 1, 'red', ['panel', 'panel']);
  await confirmAll(p);
  await tap(p, '[data-testid=rescue-go]');
  await waitDone(p);
  ok('P-17', 'long road (2 time) + shortcut without heavy items completes mission 3', (await p.$eval('[data-ok]', (e) => e.dataset.ok)) === 'true');
  ok('P-18', 'no console errors', p.errors.length === 0, p.errors.join(' | '));
  await ctx.close();
}

// ---------- solo practice + reduced motion
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx, 390, 844, { reduce: true });
  await go(p);
  await tap(p, '[data-testid=mode-solo]');
  await tap(p, '[data-testid=mission-M1]');
  const cards = (await p.$$('[data-testid^=card-]')).length;
  const shown = await p.$eval('[data-testid=feature-red]', (e) => e.dataset.shown);
  await trip(p, 0, 'yellow', ['battery', 'battery']);
  ok('P-19', 'solo: all three cards visible, no confirmation needed', cards === 3 && shown === 'true' && !(await p.$('[data-testid=rescue-confirm]')) && !(await disabled(p, '[data-testid=rescue-go]')));
  await tap(p, '[data-testid=rescue-go]');
  const d = await p.$eval('[data-ok]', (e) => e.dataset.ok);
  ok('P-20', 'reduced motion: result at once', d === 'true');
  await p.screenshot({ path: `${OUT}/rescue-390-solo-done.png`, fullPage: true });
  await ctx.close();
}

// ---------- layouts
{
  const fails = [];
  for (const w of [360, 390, 768, 1280])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.createBrowserContext();
        const p = await page(ctx, w, w < 500 ? 800 : 900, { scheme });
        await go(p, lang);
        const check = () =>
          p.evaluate(() => {
            const over = document.documentElement.scrollWidth > window.innerWidth + 1;
            const btns = [...document.querySelectorAll('[data-testid=rescue] button')].filter((b) => b.getBoundingClientRect().width);
            const small = btns.filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width < 44 || r.height < 44;
            }).map((b) => b.dataset.testid || b.innerText.slice(0, 10));
            const outside = btns.filter((b) => {
              const r = b.getBoundingClientRect();
              return r.left < -1 || r.right > window.innerWidth + 1;
            }).length;
            return { over, small, outside };
          });
        const a = await check();
        await p.screenshot({ path: `${OUT}/rescue-${w}-${lang ? 'en' : 'zh'}-${scheme}-setup.png`, fullPage: true });
        await tap(p, '[data-testid=mission-M4]');
        await trip(p, 0, 'red', ['plank', 'battery', 'battery']);
        const b = await check();
        await p.screenshot({ path: `${OUT}/rescue-${w}-${lang ? 'en' : 'zh'}-${scheme}-plan.png`, fullPage: true });
        await tap(p, '[data-testid=peek-supplier]');
        await tap(p, '[data-testid=cover-open]');
        const c = await check();
        for (const [k, m] of [['setup', a], ['plan', b], ['cover', c]]) if (m.over || m.small.length || m.outside) fails.push(`${w}${lang || '/zh'}-${scheme}-${k}:${JSON.stringify(m)}`);
        if (p.errors.length) fails.push(`${w}${lang}${scheme} errors ${p.errors[0]}`);
        await ctx.close();
      }
  ok('P-21', '360/390/768/1280 × zh/en × light/dark: no overflow, targets ≥44px (setup, plan, cover)', fails.length === 0, fails.join(' ; '));
}

await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
