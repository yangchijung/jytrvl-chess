// Snake Arena & Block Puzzle Battle browser end-to-end test (local wrangler or production).
// Requires: npm i @sparticuz/chromium puppeteer-core (outside the project). Usage: node arena-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
async function newPage(ctx, w = 1280, h = 860, mobile = false) {
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  return p;
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const clickText = async (p, text, sel = 'button, a') => {
  const found = await p.evaluate(
    (text, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text) && !e.disabled);
      if (el) el.click();
      return !!el;
    },
    text,
    sel,
  );
  if (!found) throw new Error(`no element with text ${text}`);
  await sleep(150);
};
const attr = (p, sel, name) => p.$eval(sel, (e, n) => e.getAttribute(n), name).catch(() => null);
async function waitFor(fn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(120);
  }
  return false;
}
const playing = (p) => waitFor(async () => (await attr(p, '[role=application]', 'data-status')) === 'playing', 8000);

try {
  const ctx = await browser.createBrowserContext();
  // ---------- home ----------
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    const cats = await p.$$eval('main section h2', (hs) => hs.map((h) => h.textContent));
    ok('home: three categories', ['棋藝策略', '即時競技', '益智挑戰'].every((c) => cats.some((x) => x.includes(c))), cats.join(' | '));
    const hrefs = await p.$$eval('main a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    ok('home: six game cards', ['/chess', '/xiangqi', '/banqi', '/territory', '/snake', '/blocks'].every((h) => hrefs.includes(h)));
    ok('home: brand is JY Games', (await p.title()).includes('JY Games') && (await p.$eval('header', (h) => h.textContent)).includes('JY Games'));
    await shot(p, 'g01-home');
    ok('home: no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // ---------- snake ----------
  {
    const p = await newPage(ctx);
    const r = await p.goto(BASE + '/snake', { waitUntil: 'networkidle0' });
    ok('snake: hub loads (prerendered, SEO)', r.status() === 200 && (await p.title()).includes('貪食蛇'));
    ok('snake: hub lists 8 modes', (await p.$$('main a[href^="/snake/"], main a[href="/learn/snake"]')).length >= 8);
    await shot(p, 's01-hub');
    await p.goto(BASE + '/snake/play?mode=classic', { waitUntil: 'networkidle0' });
    await clickText(p, '開始遊戲');
    ok('snake classic: canvas + score HUD', await waitFor(() => p.$('[data-testid=score]')));
    ok('snake classic: game starts', await playing(p));
    const t0 = Number(await attr(p, '[role=application]', 'data-tick'));
    await sleep(1000);
    const t1 = Number(await attr(p, '[role=application]', 'data-tick'));
    ok('snake classic: ~10 steps per second at normal speed', t1 - t0 >= 7 && t1 - t0 <= 13, `${t1 - t0}`);
    const d = Number(await attr(p, '[role=application]', 'data-dir'));
    await p.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][(d + 1) % 4]);
    await sleep(250);
    ok('snake classic: keyboard steering', Number(await attr(p, '[role=application]', 'data-dir')) === (d + 1) % 4);
    await p.keyboard.press('Space');
    await sleep(200);
    ok('snake classic: pause', (await attr(p, '[role=application]', 'data-status')) === 'paused');
    const tp = Number(await attr(p, '[role=application]', 'data-tick'));
    await sleep(600);
    ok('snake classic: paused game does not move', Number(await attr(p, '[role=application]', 'data-tick')) === tp);
    await shot(p, 's02-paused');
    await p.keyboard.press('Space');
    ok('snake classic: resume', await playing(p));
    ok('snake classic: crash → game over dialog', await waitFor(() => p.$('[role=dialog]'), 20000));
    await shot(p, 's03-end');
    ok('snake classic: no console errors', p.errors.length === 0, p.errors.join(' | '));
    // vs AI
    await p.goto(BASE + '/snake/play?mode=ai', { waitUntil: 'networkidle0' });
    await clickText(p, '3', 'button[aria-pressed]');
    await clickText(p, '開始遊戲');
    await playing(p);
    await sleep(1500);
    ok('snake vs AI: leaderboard lists 4 snakes', (await p.$$eval('[role=application] ol li', (l) => l.length)) === 4);
    await shot(p, 's04-ai');
    // local 2P
    await p.goto(BASE + '/snake/play?mode=local', { waitUntil: 'networkidle0' });
    await clickText(p, '0', 'button[aria-pressed]');
    await clickText(p, '開始遊戲');
    await playing(p);
    ok('snake local: two score cards', (await p.$$('[data-testid=score]')).length === 2);
    await shot(p, 's05-local');
    await p.close();
  }
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/learn/snake', { waitUntil: 'networkidle0' });
    await playing(p);
    for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowRight']) {
      await p.keyboard.press(k);
      await sleep(350);
    }
    ok('snake tutorial: step 1 completes', await waitFor(() => p.evaluate(() => document.body.innerText.includes('✓')), 6000));
    await shot(p, 's06-learn');
    ok('snake tutorial: no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  {
    // online room
    const ctxB = await browser.createBrowserContext();
    const a = await newPage(ctx);
    await a.goto(BASE + '/snake/new-room', { waitUntil: 'networkidle0' });
    await clickText(a, '建立房間');
    ok('snake online: room created', await waitFor(() => /\/snake\/room\/[A-Z0-9]{6}$/.test(a.url())), a.url());
    const b = await newPage(ctxB);
    await b.goto(a.url(), { waitUntil: 'networkidle0' });
    ok('snake online: guest joins', await waitFor(() => a.evaluate(() => document.querySelectorAll('main ul li').length === 2)));
    await clickText(a, '開始對戰');
    ok('snake online: both in the arena', await waitFor(async () => (await a.$('[role=application]')) && (await b.$('[role=application]'))));
    await sleep(4500);
    const ta = Number(await attr(a, '[role=application]', 'data-tick'));
    const tb = Number(await attr(b, '[role=application]', 'data-tick'));
    ok('snake online: both clients in sync', ta > 5 && Math.abs(ta - tb) <= 3, `${ta}/${tb}`);
    await shot(b, 's07-online');
    ok('snake online: no console errors', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '));
    await a.close();
    await b.close();
    await ctxB.close();
  }
  // ---------- blocks ----------
  {
    const p = await newPage(ctx);
    const r = await p.goto(BASE + '/blocks', { waitUntil: 'networkidle0' });
    ok('blocks: hub loads (prerendered, SEO)', r.status() === 200 && (await p.title()).includes('方塊消除對戰'));
    ok('blocks: hub lists 10 modes', (await p.$$('main a[href^="/blocks/"], main a[href="/learn/blocks"]')).length >= 10);
    await shot(p, 'b01-hub');
    await p.goto(BASE + '/blocks/play?mode=marathon', { waitUntil: 'networkidle0' });
    ok('blocks marathon: key settings available', await p.evaluate(() => document.body.innerText.includes('DAS')));
    await clickText(p, '開始遊戲');
    ok('blocks marathon: starts', await playing(p));
    const pieces = () => attr(p, '[data-board="0"]', 'data-pieces').then(Number);
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press('Space');
      await sleep(120);
    }
    ok('blocks marathon: hard drop locks pieces', (await pieces()) === 5, String(await pieces()));
    await p.keyboard.down('ArrowLeft');
    await sleep(500);
    await p.keyboard.up('ArrowLeft');
    await p.keyboard.press('KeyC');
    await sleep(150);
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('Space');
    await sleep(200);
    ok('blocks marathon: DAS move, hold, rotate, drop', (await pieces()) === 6);
    const sc = Number(await attr(p, '[data-board="0"]', 'data-score'));
    ok('blocks marathon: hard drop scores points', sc > 0, String(sc));
    await shot(p, 'b02-marathon');
    await p.keyboard.press('Escape');
    await sleep(200);
    ok('blocks marathon: pause', (await attr(p, '[role=application]', 'data-status')) === 'paused');
    await p.keyboard.press('Escape');
    for (let i = 0; i < 60; i++) {
      await p.keyboard.press('Space');
      await sleep(30);
    }
    ok('blocks marathon: top-out → result dialog', await waitFor(() => p.$('[role=dialog]'), 10000));
    await shot(p, 'b03-end');
    ok('blocks marathon: no console errors', p.errors.length === 0, p.errors.join(' | '));
    // vs AI
    await p.goto(BASE + '/blocks/play?mode=ai', { waitUntil: 'networkidle0' });
    await clickText(p, '困難', 'label');
    await clickText(p, '開始遊戲');
    await playing(p);
    await sleep(4000);
    ok('blocks vs AI: two boards', (await p.$$('[data-board]')).length === 2);
    ok('blocks vs AI: computer is playing', Number(await attr(p, '[data-board="1"]', 'data-pieces')) >= 3);
    await shot(p, 'b04-ai');
    // local 2P
    await p.goto(BASE + '/blocks/play?mode=local', { waitUntil: 'networkidle0' });
    await clickText(p, '開始遊戲');
    await playing(p);
    await p.keyboard.press('Space');
    await p.keyboard.press('Enter');
    await sleep(200);
    ok('blocks local: both keyboards drive their own board', Number(await attr(p, '[data-board="0"]', 'data-pieces')) === 1 && Number(await attr(p, '[data-board="1"]', 'data-pieces')) === 1);
    await shot(p, 'b05-local');
    await p.close();
  }
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/learn/blocks', { waitUntil: 'networkidle0' });
    await playing(p);
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowLeft');
    await sleep(300);
    ok('blocks tutorial: step 1 completes', await waitFor(() => p.evaluate(() => document.body.innerText.includes('✓')), 5000));
    await shot(p, 'b06-learn');
    ok('blocks tutorial: no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  {
    const ctxB = await browser.createBrowserContext();
    const a = await newPage(ctx);
    await a.goto(BASE + '/blocks/new-room', { waitUntil: 'networkidle0' });
    await clickText(a, '建立房間');
    ok('blocks online: room created', await waitFor(() => /\/blocks\/room\/[A-Z0-9]{6}$/.test(a.url())), a.url());
    const b = await newPage(ctxB);
    await b.goto(a.url(), { waitUntil: 'networkidle0' });
    ok('blocks online: guest joins', await waitFor(() => a.evaluate(() => document.querySelectorAll('main ul li').length === 2)));
    await clickText(a, '開始對戰');
    ok('blocks online: both see two boards', await waitFor(async () => (await a.$$('[data-board]')).length === 2 && (await b.$$('[data-board]')).length === 2, 10000));
    await waitFor(async () => (await attr(a, '[role=application]', 'data-status')) === 'playing', 8000);
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      await a.keyboard.press('Space');
      await sleep(150);
    }
    ok('blocks online: own drops apply instantly', Number(await attr(a, '[data-board="0"]', 'data-pieces')) >= 3);
    ok('blocks online: opponent sees them via the server', await waitFor(async () => Number(await attr(b, '[data-board="0"]', 'data-pieces')) >= 3, 4000));
    await shot(b, 'b07-online');
    ok('blocks online: no console errors', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '));
    await a.close();
    await b.close();
    await ctxB.close();
  }
  // ---------- mobile ----------
  {
    const p = await newPage(ctx, 390, 844, true);
    await p.goto(BASE + '/blocks/play?mode=marathon', { waitUntil: 'networkidle0' });
    await clickText(p, '開始遊戲');
    await playing(p);
    ok('mobile blocks: touch buttons shown', !!(await p.$('button[aria-label="硬降"]')));
    await p.tap('button[aria-label="硬降"]');
    await sleep(200);
    ok('mobile blocks: tap hard drop', Number(await attr(p, '[data-board="0"]', 'data-pieces')) === 1);
    ok('mobile blocks: no horizontal scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    await shot(p, 'm01-blocks');
    await p.goto(BASE + '/snake/play?mode=classic', { waitUntil: 'networkidle0' });
    await clickText(p, '開始遊戲');
    await playing(p);
    ok('mobile snake: D-pad shown', !!(await p.$('button[aria-label="▲"]')));
    const d = Number(await attr(p, '[role=application]', 'data-dir'));
    const label = ['▲', '▶', '▼', '◀'][(d + 1) % 4];
    await p.tap(`button[aria-label="${label}"]`);
    await sleep(250);
    ok('mobile snake: D-pad steers', Number(await attr(p, '[role=application]', 'data-dir')) === (d + 1) % 4);
    ok('mobile snake: no horizontal scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    await shot(p, 'm02-snake');
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    ok('mobile home: no horizontal scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    await p.close();
  }
  // ---------- English & leaderboard ----------
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/en/snake', { waitUntil: 'networkidle0' });
    ok('English snake hub', (await p.$eval('h1', (e) => e.textContent)).includes('Snake Arena') && (await p.title()).includes('Snake Arena'));
    await p.goto(BASE + '/en/blocks', { waitUntil: 'networkidle0' });
    ok('English blocks hub', (await p.$eval('h1', (e) => e.textContent)).includes('Block Puzzle Battle'));
    await p.goto(BASE + '/en/leaderboard?game=blocks', { waitUntil: 'networkidle0' });
    ok('leaderboard: Block Puzzle Battle boards', await p.evaluate(() => document.body.innerText.includes('Ranked Battle') && document.body.innerText.includes('Sprint')));
    await p.goto(BASE + '/leaderboard?game=snake', { waitUntil: 'networkidle0' });
    ok('leaderboard: Snake Arena boards', await p.evaluate(() => document.body.innerText.includes('多人競技場') && document.body.innerText.includes('生存模式')));
    await shot(p, 'g02-leaderboard');
    ok('leaderboard: no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
} catch (e) {
  ok('unexpected exception', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  writeFileSync(`docs/test-results/arena-e2e-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
