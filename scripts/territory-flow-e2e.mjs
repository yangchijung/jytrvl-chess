// Territory Rush continuous steering — T1 preview checks (Issue #8, TERRITORY_POINTER_V1 TC01–TC05, TC09 parts).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node territory-flow-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/territory-flow';
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
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme ?? 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401/.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const open = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/territory/flow`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('[data-testid=flow-board]');
};
const F = (p) => p.evaluate(() => ({ status: window.__flow.status, tick: window.__flow.g.tick, target: window.__flow.g.flow[0].target, heading: window.__flow.g.flow[0].heading, fx: window.__flow.g.flow[0].fx, fy: window.__flow.g.flow[0].fy, alive: window.__flow.g.players[0].alive }));
const centre = (p) => p.$eval('[data-testid=flow-board]', (e) => {
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const playing = (p) => p.waitForFunction(() => window.__flow?.status === 'playing', { timeout: 6000 });
const deg = (r) => (r * 180) / Math.PI;
const near = (a, b, tol = 2) => Math.abs(((deg(a) - b + 540) % 360) - 180) < tol;

// ---------------------------------------------------------------- mouse: point to steer, dead zone, countdown, keyboard
{
  const p = await page(1280, 900);
  await open(p);
  const meta = await p.$eval('meta[name=robots]', (e) => e.content);
  const c = await centre(p);
  const pre = await F(p);
  await p.mouse.move(c.x + 200, c.y - 200); // during the countdown: ignored
  const during = await F(p);
  await playing(p);
  // TC01: 30° below the right-hand side (screen y grows downwards)
  await p.mouse.move(c.x + 200 * Math.cos(Math.PI / 6), c.y + 200 * Math.sin(Math.PI / 6));
  await sleep(700);
  const a = await F(p);
  await sleep(500);
  const b = await F(p);
  const moved = Math.atan2(b.fy - a.fy, b.fx - a.fx);
  // 120°
  await p.mouse.move(c.x + 200 * Math.cos((2 * Math.PI) / 3), c.y + 200 * Math.sin((2 * Math.PI) / 3));
  await sleep(900);
  const c1 = await F(p);
  await sleep(400);
  const c2 = await F(p);
  const moved120 = Math.atan2(c2.fy - c1.fy, c2.fx - c1.fx);
  ok('TC01', 'mouse (no button) steers to any angle: at 30° and 120° the target, heading and actual movement all point there (not a right angle); noindex preview', /noindex/.test(meta) && near(a.target, 30, 1) && near(b.heading, 30, 1) && near(moved, 30, 1) && near(c1.target, 120, 1) && near(moved120, 120, 1), JSON.stringify({ target30: deg(a.target).toFixed(1), moved30: deg(moved).toFixed(1), target120: deg(c1.target).toFixed(1), moved120: deg(moved120).toFixed(1) }));
  await p.screenshot({ path: `${OUT}/flow-1280.png` });
  await p.ctx.close();
}
{
  // a fresh round so the player is surely alive: speed on a diagonal, dead zone, keyboard
  const p = await page(1280, 900);
  await open(p);
  const pre = await F(p);
  const c = await centre(p);
  await p.mouse.move(c.x + 200, c.y + 200);
  const during = await F(p);
  await playing(p);
  await p.mouse.move(c.x + 150, c.y - 150); // −45°
  await sleep(900); // let the heading finish turning (≤ 180° at 270°/s)
  const t0 = await F(p);
  await sleep(600);
  const t1 = await F(p);
  await sleep(10);
  const speed = Math.hypot(t1.fx - t0.fx, t1.fy - t0.fy) / Math.max(1, t1.tick - t0.tick);
  // TC05: the dead zone on top of the player keeps the heading; countdown input did nothing
  const beforeDead = await F(p);
  await p.mouse.move(c.x + 3, c.y + 2);
  await sleep(150);
  const dead = await F(p);
  // keyboard takes over from a still mouse
  await p.keyboard.press('ArrowUp');
  await sleep(100);
  const key = await F(p);
  await sleep(400);
  const keyLater = await F(p);
  ok('TC02/05', 'speed is 0.5 cell per step on a diagonal; the countdown ignores input; pointing on the player (dead zone) keeps the heading; the arrow key takes over and a still mouse does not grab it back', t1.alive && Math.abs(speed - 0.5) < 0.01 && pre.target === during.target && Math.abs(dead.target - beforeDead.target) < 1e-9 && near(key.target, -90, 0.5) && near(keyLater.target, -90, 0.5), JSON.stringify({ speed: speed.toFixed(3), during: during.target === pre.target, dead: deg(dead.target).toFixed(1), key: deg(key.target).toFixed(1) }));
  // ended → play again
  await p.evaluate(() => window.__flow.g.forfeit(0));
  await p.waitForSelector('[data-testid=flow-end]', { timeout: 4000 });
  await p.click('[data-testid=flow-again]');
  await sleep(200);
  const again = await F(p);
  ok('FL-again', 'after being knocked out, “再玩一次” starts a fresh round (countdown, alive, tick 0)', again.status === 'countdown' && again.alive && again.tick === 0, JSON.stringify(again));
  // background pause (Issue #8 P2): hidden in the countdown and in play, no catch-up on return
  const vis = (hidden) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await vis(true);
  await sleep(2600);
  const cdHidden = await F(p);
  await vis(false);
  await sleep(150);
  const cdBack = await F(p);
  await playing(p);
  await sleep(300);
  const p0 = (await F(p)).tick;
  await vis(true);
  await sleep(1500);
  const tHidden = (await F(p)).tick;
  await vis(false);
  await sleep(120);
  const tBack = (await F(p)).tick;
  ok('FL-pause', 'hidden page: the countdown waits (still counting down after 2.6 s hidden) and play stops (no ticks while hidden); on return no catch-up burst (≤ 4 steps in 120 ms)', cdHidden.status === 'countdown' && cdBack.status === 'countdown' && tHidden - p0 <= 1 && tBack - tHidden <= 4, JSON.stringify({ cd: [cdHidden.status, cdBack.status], p0, tHidden, tBack }));
  await p.ctx.close();
}

// ---------------------------------------------------------------- touch: tap turns at once, drag steers, second finger ignored, cancel
{
  const p = await page(390, 844, { touch: true });
  await open(p);
  const hint = await p.$eval('[data-testid=flow-hint]', (e) => [e.dataset.mode, e.textContent]);
  await playing(p);
  const c = await centre(p);
  const cdp = await p.createCDPSession();
  const pt = (x, y, id = 1) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 });
  const at = (degA, r = 120) => [c.x + r * Math.cos((degA * Math.PI) / 180), c.y + r * Math.sin((degA * Math.PI) / 180)];
  const [x1, y1] = at(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x1, y1)] });
  await sleep(60);
  const tap = await F(p); // no drag yet
  const [x2, y2] = at(-45);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(x2, y2)] });
  await sleep(60);
  const drag = await F(p);
  // a second finger does not take over
  const [x3, y3] = at(180);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x2, y2, 1), pt(x3, y3, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(x2, y2, 1), pt(x3, y3 + 10, 2)] });
  await sleep(60);
  const second = await F(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const lifted = await F(p);
  // cancel, then a new tap still works
  const [x4, y4] = at(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x4, y4, 3)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await sleep(60);
  const [x5, y5] = at(150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x5, y5, 4)] });
  await sleep(60);
  const afterCancel = await F(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const ta = await p.evaluate(() => ({ board: getComputedStyle(document.querySelector('[data-testid=flow-board]')).touchAction, body: getComputedStyle(document.body).touchAction, over: document.documentElement.scrollWidth > innerWidth + 1 }));
  ok('TC03', 'touch: a tap turns at once (120°) without dragging; dragging keeps steering (−45°); a second finger cannot take over; lifting keeps the last direction; after touchcancel a new tap works (150°); only the board blocks page scrolling; hint shows the touch wording', hint[0] === 'touch' && hint[1].includes('點一下轉向，拖著改方向') && near(tap.target, 120, 1) && near(drag.target, -45, 1) && near(second.target, -45, 1) && near(lifted.target, -45, 1) && lifted.alive !== undefined && near(afterCancel.target, 150, 1) && ta.board === 'none' && ta.body !== 'none' && !ta.over, JSON.stringify({ tap: deg(tap.target).toFixed(1), drag: deg(drag.target).toFixed(1), second: deg(second.target).toFixed(1), lifted: deg(lifted.target).toFixed(1), afterCancel: deg(afterCancel.target).toFixed(1), ta }));
  await p.screenshot({ path: `${OUT}/flow-390-touch.png` });
  await p.ctx.close();
}

// ---------------------------------------------------------------- TC04 sizes, DPR, languages, themes
{
  const fails = [];
  for (const [w, h, dpr] of [[360, 780, 3], [768, 1024, 2], [1280, 800, 1]])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const p = await page(w, h, { dpr, scheme });
        await open(p, lang);
        await playing(p);
        const c = await centre(p);
        await p.mouse.move(c.x + 100 * Math.cos(-Math.PI / 4), c.y + 100 * Math.sin(-Math.PI / 4));
        await sleep(120);
        const s = await F(p);
        const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, small: [...document.querySelectorAll('[data-testid=flow] button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length }));
        if (!near(s.target, -45, 1) || m.over || m.small) fails.push(`${w}@${dpr}${lang}${scheme} target ${deg(s.target).toFixed(1)} ${JSON.stringify(m)}`);
        if (w === 360 && scheme === 'dark') await p.screenshot({ path: `${OUT}/flow-360-${lang ? 'en' : 'zh'}-dark.png` });
        await p.ctx.close();
      }
  ok('TC04', '360@3x / 768@2x / 1280@1x × zh/en × light/dark: pointing at −45° from the player gives −45° (relative to the drawn player, any DPR); no horizontal scroll', fails.length === 0, fails.join(' ; '));
}

ok('FL-err', 'no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
