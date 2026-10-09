// Territory Rush browser end-to-end test (local wrangler or production).
// Requires: npm i @sparticuz/chromium puppeteer-core (outside the project). Usage: node territory-e2e.mjs <baseUrl> [outDir]
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
  const ok = await p.evaluate(
    (text, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text) && !e.disabled);
      if (el) el.click();
      return !!el;
    },
    text,
    sel,
  );
  if (!ok) throw new Error(`no element with text ${text}`);
  await sleep(150);
};
const myPct = (p) => p.$eval('[role=application] .text-2xl', (e) => parseFloat(e.textContent)).catch(() => NaN);
// canvas has non-background pixels (land drawn)
const canvasPainted = (p) =>
  p.evaluate(() => {
    const c = document.querySelector('[role=application] canvas');
    const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < x.length; i += 4 * 97) colors.add((x[i] << 16) | (x[i + 1] << 8) | x[i + 2]);
    return colors.size;
  });
async function waitFor(fn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
}

try {
  const ctx = await browser.createBrowserContext();
  // 1. home lists four games
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    const links = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    ok('home shows Territory Rush card', links.includes('/territory'));
    const cards = await p.$$eval('main a[href="/chess"], main a[href="/xiangqi"], main a[href="/banqi"], main a[href="/territory"]', (a) => new Set(a.map((x) => x.getAttribute('href'))).size);
    ok('home lists all four games', cards === 4, String(cards));
    await p.close();
  }
  // 2. hub page (prerendered + SEO)
  {
    const p = await newPage(ctx);
    const r = await p.goto(BASE + '/territory', { waitUntil: 'networkidle0' });
    ok('/territory loads', r.status() === 200);
    ok('/territory title', (await p.title()).includes('領地爭奪戰'));
    ok('/territory has 5 mode options', (await p.$$('main a[href^="/territory/"], main a[href="/learn/territory"]')).length >= 5);
    await shot(p, 't01-hub');
    ok('/territory no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 3. solo vs AI: start, steer with keyboard, capture land
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/territory/play?mode=ai', { waitUntil: 'networkidle0' });
    await clickText(p, '3'); // 3 bots
    await clickText(p, '開始遊戲');
    ok('solo game canvas visible', await waitFor(() => p.$('[role=application] canvas')));
    const start = await myPct(p);
    ok('starting land shown', start > 0, `${start}%`);
    await waitFor(() => p.$eval('[role=application]', (e) => e.dataset.status === 'playing'));
    // draw a loop relative to the current heading: left, back, right, then forward into home land
    const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    const d = Number(await p.$eval('[role=application]', (e) => e.dataset.dir));
    for (const k of [(d + 3) % 4, (d + 2) % 4, (d + 1) % 4, d]) {
      await p.keyboard.press(KEYS[k]);
      await sleep(420);
    }
    const captured = await waitFor(async () => (await myPct(p)) > start, 3000);
    ok('player captures land by looping home', captured, `${start}% → ${await myPct(p)}%`);
    ok('leaderboard lists live players', (await p.$$eval('[role=application] ol li', (l) => l.length)) >= 3);
    ok('timer running', await p.$('[role=timer]').then(Boolean));
    ok('canvas rendered (multiple colours)', (await canvasPainted(p)) > 4);
    await shot(p, 't02-solo');
    // keep heading straight until we leave the map (or hit something) → end overlay
    ok('end overlay after elimination', await waitFor(() => p.$('[role=dialog]'), 30000));
    await shot(p, 't03-end');
    ok('solo no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 4. local two players
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/territory/play?mode=local', { waitUntil: 'networkidle0' });
    await clickText(p, '0');
    await clickText(p, '開始遊戲');
    await sleep(800);
    ok('local 2P shows two HUD cards', (await p.$$('[role=application] .text-2xl')).length === 2);
    await sleep(3000);
    await p.keyboard.press('KeyW');
    await p.keyboard.press('ArrowDown');
    await sleep(500);
    await shot(p, 't04-local2p');
    ok('local 2P no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 5. tutorial step 1 completes after three turns
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/learn/territory', { waitUntil: 'networkidle0' });
    await sleep(1200);
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowDown']) {
      await p.keyboard.press(k);
      await sleep(400);
    }
    ok('tutorial step 1 completes', await waitFor(() => p.evaluate(() => document.body.innerText.includes('✓')), 5000));
    await shot(p, 't05-learn');
    ok('tutorial no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 6. online private room: two browsers + one bot
  {
    const ctxB = await browser.createBrowserContext();
    const a = await newPage(ctx);
    await a.goto(BASE + '/territory/new-room', { waitUntil: 'networkidle0' });
    await clickText(a, '建立私人房間');
    ok('room page opened', await waitFor(() => /\/territory\/room\/[A-Z0-9]{6}$/.test(a.url())), a.url());
    const b = await newPage(ctxB);
    await b.goto(a.url(), { waitUntil: 'networkidle0' });
    ok('guest joins lobby (2 players)', await waitFor(() => a.evaluate(() => document.querySelectorAll('main ul li').length === 2)));
    await clickText(a, '加入電腦');
    ok('host adds bot (3 players)', await waitFor(() => b.evaluate(() => document.querySelectorAll('main ul li').length === 3)));
    await shot(a, 't06-lobby');
    await clickText(a, '開始對戰');
    ok('both clients enter the match', await waitFor(async () => (await a.$('[role=application]')) && (await b.$('[role=application]'))));
    await sleep(4000);
    const tickOf = (x) => x.$eval('[role=application]', (e) => Number(e.dataset.tick));
    const t0 = await tickOf(a);
    await b.keyboard.press('ArrowUp');
    await sleep(1500);
    const t1 = await tickOf(a);
    ok('online ticks stream to both clients (~10/s)', t1 - t0 >= 10 && Math.abs((await tickOf(b)) - t1) <= 3, `${t0} → ${t1}`);
    ok('online leaderboard live', (await a.$$eval('[role=application] ol li', (l) => l.length)) >= 2);
    await shot(b, 't07-online');
    ok('online no console errors', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '));
    await a.close();
    await b.close();
    await ctxB.close();
  }
  // 7. mobile layout + joystick
  {
    const p = await newPage(ctx, 390, 844, true);
    await p.goto(BASE + '/territory/play?mode=ai', { waitUntil: 'networkidle0' });
    await clickText(p, '開始遊戲');
    await sleep(800);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    ok('mobile: no horizontal scroll', !overflow);
    await clickText(p, '🕹');
    ok('mobile: joystick toggles', await p.$('[aria-pressed=true]').then(Boolean));
    await shot(p, 't08-mobile');
    await p.close();
  }
  // 8. English
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/en/territory', { waitUntil: 'networkidle0' });
    ok('English hub', (await p.$eval('h1', (e) => e.textContent)).includes('Territory Rush') && (await p.title()).includes('Territory Rush'));
    await p.goto(BASE + '/en/leaderboard', { waitUntil: 'networkidle0' });
    ok('leaderboard has Territory tab', await p.evaluate(() => document.body.innerText.includes('Territory Rush')));
    await p.close();
  }
} catch (e) {
  ok('unexpected exception', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  writeFileSync(`docs/test-results/territory-e2e-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
