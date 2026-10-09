// Requires: npm i @sparticuz/chromium puppeteer-core (run outside the project). Usage: node e2e.mjs <baseUrl>
// End-to-end smoke test against a running JY Chess (local wrangler or production).
// Usage: node e2e.mjs [baseUrl] [outDir]
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

const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features=')), '--autoplay-policy=no-user-gesture-required'], headless: true });

async function newPage(ctx, w = 1280, h = 860, mobile = false) {
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => {
    if (m.type() === 'error') p.errors.push(m.text());
  });
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickSq = async (p, sq) => {
  const el = await p.$(`[role=grid] button[aria-label^="${sq} "]`);
  if (!el) throw new Error(`square ${sq} not found`);
  await el.click();
  await sleep(120);
};
const moveCount = (p) => p.$$eval('section[aria-label] ol li', (lis) => lis.filter((l) => l.textContent.trim() !== '—').length).catch(() => 0);
const plies = (p) =>
  p.$$eval('section ol li span', (s) => s.filter((x, i) => i % 3 !== 0 && x.textContent.trim()).length).catch(() => 0);
async function waitPlies(p, n, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await plies(p)) >= n) return true;
    await sleep(250);
  }
  return false;
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

try {
  const ctx = await browser.createBrowserContext();
  // 1. Home
  {
    const p = await newPage(ctx);
    const r = await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    ok('home loads', r.status() === 200 && (await p.$eval('h1', (e) => e.textContent)).includes('即時圈地'));
    ok('cross-origin isolated', await p.evaluate(() => self.crossOriginIsolated));
    await shot(p, '01-home-desktop');
    ok('home no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 2. Chess vs AI
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/play?game=chess&mode=ai', { waitUntil: 'networkidle0' });
    const btns = await p.$$('button');
    for (const b of btns) if ((await b.evaluate((e) => e.textContent)).includes('開始對局')) { await b.click(); break; }
    await sleep(500);
    await clickSq(p, 'e2');
    const dots = await p.$$eval('[role=grid] button[aria-label*="可走位置"]', (x) => x.map((e) => e.getAttribute('aria-label').split(' ')[0]));
    ok('chess legal hints e2', dots.includes('e3') && dots.includes('e4'), dots.join(','));
    await clickSq(p, 'e4');
    ok('chess AI replies', await waitPlies(p, 2, 30000));
    await shot(p, '02-chess-vs-ai');
    ok('chess no errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 3. Xiangqi vs AI (Fairy-Stockfish)
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/play?game=xiangqi&mode=ai', { waitUntil: 'networkidle0' });
    for (const b of await p.$$('button')) if ((await b.evaluate((e) => e.textContent)).includes('開始對局')) { await b.click(); break; }
    await sleep(500);
    await clickSq(p, 'h3');
    await clickSq(p, 'e3');
    ok('xiangqi AI replies', await waitPlies(p, 2, 40000));
    const notation = await p.$eval('section ol', (e) => e.textContent);
    ok('xiangqi chinese notation', notation.includes('炮二平五'), notation.slice(0, 40));
    await shot(p, '03-xiangqi-vs-ai');
    ok('xiangqi no errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 4. Banqi vs AI
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/play?game=banqi&mode=ai', { waitUntil: 'networkidle0' });
    for (const b of await p.$$('button')) if ((await b.evaluate((e) => e.textContent)).includes('開始對局')) { await b.click(); break; }
    await sleep(500);
    await clickSq(p, 'd2');
    ok('banqi flip + AI replies', await waitPlies(p, 2, 20000).catch(() => false) || (await p.$$eval('section ol li', (l) => l.length)) >= 2);
    await shot(p, '04-banqi-vs-ai');
    ok('banqi no errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // 5. Lessons
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/learn/chess', { waitUntil: 'networkidle0' });
    ok('lesson page', (await p.$eval('h2', (e) => e.textContent)).length > 0);
    await shot(p, '05-learn-chess');
    await p.goto(BASE + '/en/learn/xiangqi', { waitUntil: 'networkidle0' });
    const h = await p.$eval('main h1', (e) => e.textContent);
    ok('english lessons', h.includes('Learn the rules'), h);
    await shot(p, '06-learn-xiangqi-en');
    await p.close();
  }
  // 6. Online private room between two separate guests
  {
    const ctxA = await browser.createBrowserContext();
    const ctxB = await browser.createBrowserContext();
    const a = await newPage(ctxA);
    const b = await newPage(ctxB, 390, 844, true);
    await a.goto(BASE + '/play?game=chess&mode=room', { waitUntil: 'networkidle0' });
    // choose "first" (white) and start
    for (const el of await a.$$('button')) if ((await el.evaluate((e) => e.textContent)).includes('開始對局')) { await el.click(); break; }
    await a.waitForFunction(() => location.pathname.startsWith('/room/'), { timeout: 15000 });
    const roomUrl = await a.evaluate(() => location.href);
    ok('room created', /\/room\/[A-Z2-9]{6}$/.test(roomUrl), roomUrl);
    await shot(a, '07-room-waiting');
    await b.goto(roomUrl, { waitUntil: 'networkidle0' });
    await sleep(1500);
    const aSeat = await a.$eval('main', (m) => m.textContent.includes('輪到你了'));
    const white = aSeat ? a : b;
    const black = aSeat ? b : a;
    await clickSq(white, 'e2');
    await clickSq(white, 'e4');
    ok('online move synced', await waitPlies(black, 1, 8000));
    await clickSq(black, 'e7');
    await clickSq(black, 'e5');
    ok('online reply synced', await waitPlies(white, 2, 8000));
    // illegal / out-of-turn attempt by black
    await clickSq(black, 'd7');
    const hints = await black.$$eval('[role=grid] button[aria-label*="可走位置"]', (x) => x.length);
    ok('no moves offered out of turn', hints === 0);
    // reconnect: black reloads, state must persist
    await black.reload({ waitUntil: 'networkidle0' });
    ok('state restored after reload', await waitPlies(black, 2, 10000));
    await shot(white, '08-online-white');
    await shot(black, '09-online-black-mobile');
    // resign
    for (const el of await white.$$('button')) if ((await el.evaluate((e) => e.textContent)).includes('認輸')) { await el.click(); break; }
    await sleep(300);
    for (const el of await white.$$('dialog button')) if ((await el.evaluate((e) => e.textContent)).trim() === '確定') { await el.click(); break; }
    await sleep(1500);
    const endText = await black.$eval('main', (m) => m.textContent);
    ok('resign result propagated', endText.includes('你贏了') || endText.includes('認輸'), '');
    ok('online no errors', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '));
    await ctxA.close();
    await ctxB.close();
  }
  // 7. Mobile layout: no horizontal scroll
  {
    const p = await newPage(ctx, 375, 812, true);
    for (const path of ['/', '/xiangqi', '/play?game=banqi&mode=local', '/learn/banqi', '/en/leaderboard']) {
      await p.goto(BASE + path, { waitUntil: 'networkidle0' });
      if (path.includes('mode=local')) for (const el of await p.$$('button')) if ((await el.evaluate((e) => e.textContent)).includes('開始對局')) { await el.click(); break; }
      await sleep(400);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`mobile no h-scroll ${path}`, overflow <= 1, `overflow ${overflow}`);
    }
    await shot(p, '10-mobile-banqi-learn');
    await p.goto(BASE + '/play?game=xiangqi&mode=local', { waitUntil: 'networkidle0' });
    for (const el of await p.$$('button')) if ((await el.evaluate((e) => e.textContent)).includes('開始對局')) { await el.click(); break; }
    await sleep(500);
    await shot(p, '11-mobile-xiangqi');
    await p.close();
  }
  // 8. API surface
  {
    const p = await newPage(ctx);
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const health = await p.evaluate(async () => (await fetch('/api/health')).json());
    ok('api health', health.ok === true, JSON.stringify(health));
    const lb = await p.evaluate(async () => (await fetch('/api/leaderboard?game=chess')).status);
    ok('api leaderboard', lb === 200);
    const bad = await p.evaluate(async () => (await fetch('/api/rooms', { method: 'POST', body: '{"game":"go"}', headers: { 'content-type': 'application/json' } })).status);
    ok('api rejects bad game', bad === 400);
    const sitemap = await p.evaluate(async () => (await fetch('/sitemap.xml')).text());
    ok('sitemap', sitemap.includes('<loc>https://chess.jytrvl.com/xiangqi</loc>'));
    await p.close();
  }
} catch (e) {
  ok('unexpected exception', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  writeFileSync(`docs/test-results/e2e-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
