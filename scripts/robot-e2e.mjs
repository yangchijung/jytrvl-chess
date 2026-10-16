// Robot Delivery Lab — prototype browser acceptance (Issue #5).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node robot-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/robot';
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
  await p.goto(`${BASE}${lang}/robot`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=robot]');
};
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 8000 });
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(40);
};
const add = async (p, blocks) => {
  for (const b of blocks) await tap(p, `[data-testid=add-${b}]`);
};
const ds = (p) => p.$eval('[data-testid=robot]', (e) => ({ ...e.dataset }));
const bot = (p) => p.$eval('[data-testid=robot-bot]', (e) => ({ x: +e.dataset.x, y: +e.dataset.y, dir: e.dataset.dir }));
const prompt = (p) => p.$eval('[data-testid=robot-prompt]', (e) => e.innerText);
const waitDone = (p) => p.waitForFunction(() => document.querySelector('[data-testid=robot]')?.dataset.outcome, { timeout: 15000 });
const SOL = {
  R01: ['forward', 'forward', 'pick', 'forward', 'forward', 'drop'],
  R02: ['forward', 'forward', 'pick', 'right', 'forward', 'forward', 'drop'],
};

// ---------- R-01 page basics
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx);
  await go(p);
  const meta = await p.$eval('meta[name=robots]', (e) => e.content).catch(() => '');
  ok('R-01', 'zh page loads, noindex', (await prompt(p)).includes('排好指令') && /noindex/.test(meta), meta);
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  const linked = await p.$$eval('a[href$="/robot"]', (a) => a.length);
  ok('R-02', 'not linked from home', linked === 0, linked);
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok('R-03', 'robots.txt disallows /robot', /Disallow: \/robot\n/.test(robots) && /Disallow: \/en\/robot\n/.test(robots));
  const e = await page(ctx);
  await go(e, '/en');
  ok('R-04', 'en page loads', (await prompt(e)).includes('Line up blocks'));
  await ctx.close();
}

// ---------- R-05..R-09 play level 1 with animation, unlock, save
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx);
  await go(p);
  await add(p, SOL.R01);
  ok('R-05', 'program shows 6 picture blocks', (await p.$$('[data-testid=robot-program] [data-block]')).length === 6);
  await tap(p, '[data-testid=robot-run]');
  await sleep(700);
  const mid = await bot(p);
  const playing = (await ds(p)).playing === 'true';
  await waitDone(p);
  const end = await bot(p);
  ok('R-06', 'robot animates step by step, then delivers', playing && mid.x > 0 && mid.x < 4 && end.x === 4 && end.y === 1 && (await ds(p)).outcome === 'success', JSON.stringify({ mid, end }));
  ok('R-07', 'win prompt + shortest star', (await prompt(p)).includes('送到了') && (await p.evaluate(() => document.body.innerText.includes('最短路線'))));
  const unlocked = await p.$eval('[data-testid=lv-2]', (b) => !b.disabled);
  ok('R-08', 'level 2 unlocked, next button', unlocked && !!(await p.$('[data-testid=robot-next]')));
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-testid=robot]');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.robot.v1')));
  ok('R-09', 'progress saved, survives reload', saved.unlocked === 2 && saved.done.R01 === 6 && (await ds(p)).level === 'R02', JSON.stringify(saved));

  // ---------- R-10 bump error on level 2 with step number + highlight
  await add(p, ['forward', 'forward', 'forward', 'forward']);
  await tap(p, '[data-testid=robot-run]');
  await waitDone(p);
  const bad = await p.$$eval('[data-testid=robot-program] [data-block]', (bs) => bs.findIndex((b) => b.className.includes('warn')));
  ok('R-10', 'wall bump: step 4 named and highlighted', (await ds(p)).outcome === 'error' && (await prompt(p)).includes('第 4 步') && bad === 3, await prompt(p));
  const atWall = await bot(p);
  ok('R-11', 'robot stops before the wall', atWall.x === 0 && atWall.y === 0, JSON.stringify(atWall));

  // ---------- R-12 edit: select block 3, remove, then fix and solve
  await tap(p, '[data-testid=robot-clear]');
  ok('R-12', 'clear empties program', (await p.$$('[data-testid=robot-program] [data-block]')).length === 0);
  await add(p, ['forward', 'forward', 'right', 'pick', 'forward', 'forward', 'drop']);
  // move "pick" (index 3) earlier → before "right"
  await tap(p, '[data-testid=robot-program] li:nth-child(4) button');
  await tap(p, '[aria-label="往前移"]');
  const order = await p.$$eval('[data-testid=robot-program] [data-block]', (bs) => bs.map((b) => b.dataset.block).join(','));
  ok('R-13', 'move block earlier', order === SOL.R02.join(','), order);
  // step mode
  await tap(p, '[data-testid=robot-step]');
  const s1 = await bot(p);
  await tap(p, '[data-testid=robot-step]');
  const s2 = await bot(p);
  ok('R-14', 'one-step mode moves one block at a time', s1.y === 2 && s2.y === 1, JSON.stringify([s1, s2]));
  await tap(p, '[data-testid=robot-reset]');
  const back = await bot(p);
  ok('R-15', 'restart returns robot to start', back.x === 0 && back.y === 3 && back.dir === 'N');
  await tap(p, '[data-testid=robot-run]');
  await waitDone(p);
  ok('R-16', 'level 2 solved after fixing', (await ds(p)).outcome === 'success');
  // remove block
  await tap(p, '[data-testid=robot-program] li:nth-child(1) button');
  await tap(p, '[aria-label="拿掉"]');
  ok('R-17', 'remove a block', (await p.$$('[data-testid=robot-program] [data-block]')).length === 6);
  // incomplete
  await tap(p, '[data-testid=robot-clear]');
  await add(p, ['forward']);
  await tap(p, '[data-testid=robot-run]');
  await waitDone(p);
  ok('R-18', 'incomplete program: not delivered yet', (await ds(p)).outcome === 'incomplete' && (await prompt(p)).includes('還沒送到'));
  ok('R-19', 'no console errors', p.errors.length === 0, p.errors.join(' | '));
  await ctx.close();
}

// ---------- R-20 reduced motion: result immediately
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx, 390, 844, { reduce: true });
  await go(p);
  await add(p, SOL.R01);
  await tap(p, '[data-testid=robot-run]');
  const d = await ds(p);
  ok('R-20', 'reduced motion shows result at once', d.outcome === 'success' && d.playing === 'false');
  await ctx.close();
}

// ---------- R-21 layouts
{
  let fails = [];
  for (const w of [360, 390, 768, 1280])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.createBrowserContext();
        const p = await page(ctx, w, w < 500 ? 800 : 900, { scheme });
        await go(p, lang);
        await add(p, ['forward', 'forward', 'pick']);
        const m = await p.evaluate(() => {
          const over = document.documentElement.scrollWidth > window.innerWidth + 1;
          const small = [...document.querySelectorAll('[data-testid=robot] button')].filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width && (r.width < 44 || r.height < 44);
          }).length;
          const map = document.querySelector('[data-testid=robot-map]').getBoundingClientRect();
          const outside = [...document.querySelectorAll('[data-testid=robot] button')].filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width && (r.left < 0 || r.right > window.innerWidth + 1);
          }).length;
          return { over, small, mapW: map.width, outside };
        });
        if (m.over || m.small || m.outside || m.mapW < 200) fails.push(`${w}${lang || '/zh'}-${scheme}:${JSON.stringify(m)}`);
        await p.screenshot({ path: `${OUT}/robot-${w}-${lang ? 'en' : 'zh'}-${scheme}.png`, fullPage: true });
        if (p.errors.length) fails.push(`${w}${lang}${scheme} errors ${p.errors[0]}`);
        await ctx.close();
      }
  ok('R-21', '360/390/768/1280 × zh/en × light/dark: no overflow, targets ≥44px, map visible', fails.length === 0, fails.join(' ; '));
}

await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
