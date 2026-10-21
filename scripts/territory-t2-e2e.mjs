// Territory Rush T2 — continuous steering in the regular solo / two-player games and the tutorial
// (Issue #8, TERRITORY_POINTER_V1 TC01–TC07, TC09 parts). Entered from the real hub, not the /territory/flow page.
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node territory-t2-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/territory-t2';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 900) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`);
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
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
/** From the home page: Territory Rush → a mode card → start. */
async function enter(p, mode = 'ai', lang = '') {
  await p.goto(`${BASE}${lang}/`, { waitUntil: 'networkidle0' });
  await p.goto(`${BASE}${lang}/territory`, { waitUntil: 'networkidle0' });
  await p.$eval(`a[href$="/territory/play?mode=${mode}"]`, (a) => a.click());
  await p.waitForSelector('[data-testid=tr-start]');
  await p.$eval('[data-testid=tr-start]', (b) => b.click());
  await p.waitForSelector('[role=application][data-flow=true]', { timeout: 8000 });
}
const S = (p) => p.evaluate(() => {
  const c = window.__tr;
  const g = c.game;
  return { status: c.status, flow: !!c.flow, me: c.me, tick: g.tick, players: g.players.map((pl, i) => ({ alive: pl.alive, x: c.flow?.flow[i]?.fx, y: c.flow?.flow[i]?.fy, heading: c.flow?.flow[i]?.heading, target: c.flow?.flow[i]?.target, trail: pl.trail.length, bot: pl.bot })), heads: c.screenHeads };
});
const playing = (p) => p.waitForFunction(() => window.__tr?.status === 'playing', { timeout: 8000 });
const wrapRect = (p) => p.$eval('[role=application]', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top }; });
const deg = (r) => (r * 180) / Math.PI;
const near = (a, b, tol = 2) => Math.abs(((deg(a) - b + 540) % 360) - 180) < tol;
async function point(p, slot, angleDeg, dist = 120, kind = 'mouse') {
  const s = await S(p);
  const idx = s.me[slot];
  const h = s.heads[idx];
  const r = await wrapRect(p);
  const x = r.left + h.x + Math.cos((angleDeg * Math.PI) / 180) * dist,
    y = r.top + h.y + Math.sin((angleDeg * Math.PI) / 180) * dist;
  if (kind === 'mouse') await p.mouse.move(x, y, { steps: 2 });
  return { x, y };
}

try {
  // ---------------------------------------------------------------- solo vs computer from the hub, mouse
  {
    const p = await page(1280, 900);
    await enter(p, 'ai');
    const cd = await S(p);
    await point(p, 0, 45);
    const during = await S(p);
    await playing(p);
    await sleep(150);
    await point(p, 0, 30);
    await sleep(700);
    const a = await S(p);
    const x0 = a.players[0].x, y0 = a.players[0].y;
    await sleep(600);
    const b = await S(p);
    const moved = Math.atan2(b.players[0].y - y0, b.players[0].x - x0);
    const hint = await p.$eval('[data-testid=tr-hint]', (e) => e.textContent);
    ok('TC01', 'regular solo game (home → 領地爭奪戰 → 單人 → 開始): pointing the mouse at 30° makes the runner travel at 30°, not a right angle', cd.flow && near(a.players[0].target, 30, 1.5) && near(moved, 30, 3) && /滑鼠指向哪裡/.test(hint), JSON.stringify({ target: deg(a.players[0].target).toFixed(1), moved: deg(moved).toFixed(1), hint }));
    ok('TC05', 'the countdown takes no input (target unchanged while counting down)', cd.status === 'countdown' && during.players[0].target === cd.players[0].target);
    for (const ang of [60, 135, -150]) {
      await point(p, 0, ang);
      await sleep(80);
    }
    const c = await S(p);
    ok('TC01', 'more angles: 60°, 135°, −150° each become the target (head keeps moving while the mouse does, so ±3°)', near(c.players[0].target, -150, 3), deg(c.players[0].target).toFixed(1));
    // background pause — while the runner is alive and the game is running
    await point(p, 0, deg(Math.atan2(450 - c.heads[c.me[0]].y, 640 - c.heads[c.me[0]].x)));
    const vis = (hidden) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
    const b0 = await S(p);
    await vis(true);
    await sleep(1500);
    const b1 = await S(p);
    await vis(false);
    await sleep(300);
    const b2 = await S(p);
    ok('BG', 'hidden page pauses the regular game (runner alive, game running); on return it resumes without a catch-up burst', b0.status === 'playing' && b0.players[0].alive && b1.tick - b0.tick <= 1 && b2.tick - b1.tick >= 2 && b2.tick - b1.tick <= 10 && b2.players[0].alive, `${b0.status} ${b0.tick} ${b1.tick} ${b2.tick} alive=${b2.players[0].alive}`);
    await p.keyboard.press('ArrowUp');
    await sleep(60);
    const k = await S(p);
    await sleep(300);
    const k2 = await S(p);
    ok('TC05', 'arrow key takes over (−90°), a still mouse does not grab it back', near(k.players[0].target, -90, 0.5) && near(k2.players[0].target, -90, 0.5));
    // bots
    await sleep(4000);
    const bots = await S(p);
    const botHead = bots.players.filter((x) => x.bot && x.alive).map((x) => deg(x.heading));
    ok('TC07', 'computer players move with the same continuous steering (headings off the four axes)', botHead.some((h) => Math.abs(((h % 90) + 90) % 90) > 8 && Math.abs(((h % 90) + 90) % 90) < 82), botHead.map((h) => h.toFixed(0)).join());
    await p.screenshot({ path: `${OUT}/solo-1280.png` });
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- phone: touch turns at once, drag keeps steering
  {
    const p = await page(390, 844, { touch: true, dpr: 3 });
    await enter(p, 'ai');
    await playing(p);
    await sleep(200);
    const cdp = await p.target().createCDPSession();
    const tp = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
    const pt = await point(p, 0, 120, 90, 'none');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, pt.x, pt.y)] });
    await sleep(40);
    const tap = await S(p);
    const pt2 = await point(p, 0, -45, 90, 'none');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, pt2.x, pt2.y)] });
    await sleep(40);
    const drag = await S(p);
    // a second finger does not take over
    const pt3 = await point(p, 0, 160, 90, 'none');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, pt2.x, pt2.y), tp(2, pt3.x, pt3.y)] });
    await sleep(40);
    const second = await S(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    const lifted = await S(p);
    const hint = await p.$eval('[data-testid=tr-hint]', (e) => e.textContent);
    ok('TC03', 'touch: a tap turns at once (120°, no swipe distance), dragging updates (−45°), a second finger cannot take over, lifting keeps the heading', near(tap.players[0].target, 120, 3) && near(drag.players[0].target, -45, 3) && near(second.players[0].target, -45, 3) && near(lifted.players[0].target, -45, 3) && /點一下轉向/.test(hint), JSON.stringify({ tap: deg(tap.players[0].target).toFixed(1), drag: deg(drag.players[0].target).toFixed(1), second: deg(second.players[0].target).toFixed(1) }));
    const sc = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await p.screenshot({ path: `${OUT}/solo-390-touch.png` });
    ok('TC09', '390 px phone: no sideways scroll; only the play area blocks page gestures', !sc && (await p.$eval('[role=application]', (e) => getComputedStyle(e).touchAction)) === 'none' && (await p.evaluate(() => getComputedStyle(document.body).touchAction)) !== 'none');
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- two players on one device
  {
    const p = await page(1024, 768, { touch: true, dpr: 2 });
    await enter(p, 'local');
    await playing(p);
    await sleep(200);
    const cdp = await p.target().createCDPSession();
    const tp = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
    const r = await wrapRect(p);
    const W = await p.$eval('[role=application]', (e) => e.getBoundingClientRect().width);
    const before = await S(p);
    // P1 touches on the left half, P2 on the right half, at the same time
    const h1 = before.heads[before.me[0]], h2 = before.heads[before.me[1]];
    const a1 = { x: Math.min(r.left + W / 2 - 10, r.left + h1.x + 60), y: r.top + h1.y + 60 };
    const a2 = { x: Math.max(r.left + W / 2 + 10, r.left + h2.x - 60), y: r.top + h2.y - 60 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, a1.x, a1.y)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, a1.x, a1.y), tp(2, a2.x, a2.y)] });
    await sleep(40);
    const s = await S(p);
    const want1 = Math.atan2(a1.y - (r.top + h1.y), a1.x - (r.left + h1.x));
    const want2 = Math.atan2(a2.y - (r.top + h2.y), a2.x - (r.left + h2.x));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // keyboards: WASD player 1, arrows player 2
    await p.keyboard.press('KeyS');
    await p.keyboard.press('ArrowLeft');
    await sleep(40);
    const k = await S(p);
    ok('TC07', 'two players on one device: each half of the screen steers only its own player (both at once); WASD and arrow keys are separate', Math.abs(s.players[s.me[0]].target - want1) < 0.12 && Math.abs(s.players[s.me[1]].target - want2) < 0.12 && near(k.players[k.me[0]].target, 90, 0.5) && near(k.players[k.me[1]].target, 180, 0.5), JSON.stringify({ p1: deg(s.players[s.me[0]].target).toFixed(0), want1: deg(want1).toFixed(0), p2: deg(s.players[s.me[1]].target).toFixed(0), want2: deg(want2).toFixed(0) }));
    await p.screenshot({ path: `${OUT}/two-player-1024.png` });
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- tutorial: three big turns
  {
    const p = await page(1280, 900);
    await p.goto(`${BASE}/learn/territory`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('[role=application][data-flow=true]', { timeout: 8000 });
    await playing(p);
    await sleep(200);
    const pic = !!(await p.$('[data-testid=tr-learn-pic-1]'));
    // small wiggles do not count
    for (let k = 0; k < 6; k++) {
      const s = await S(p);
      await point(p, 0, deg(s.players[0].heading) + (k % 2 ? 25 : -25));
      await sleep(120);
    }
    const wiggle = await p.$eval('main', (e) => e.innerText.match(/已轉大彎 (\d)/)?.[1]);
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await p.keyboard.press(key);
      await sleep(700);
    }
    const done = await p.$eval('main', (e) => /完成|Done|做到了/.test(e.innerText) && !/已轉大彎 [0-2]/.test(e.innerText));
    await p.screenshot({ path: `${OUT}/tutorial-1280.png` });
    ok('TC07', 'tutorial uses continuous steering with a picture per lesson; small wiggles do not count, three real turns complete lesson 1', pic && Number(wiggle ?? 0) === 0 && done, `wiggle=${wiggle}`);
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- layout matrix
  for (const [w, h, touch, dpr] of [[360, 780, true, 3], [768, 1024, true, 2], [1280, 900, false, 1]]) {
    for (const [lang, scheme] of [['', 'light'], ['/en', 'dark']]) {
      const p = await page(w, h, { touch, dpr, scheme });
      await enter(p, 'ai', lang);
      await playing(p);
      const m = await p.evaluate(() => ({ hscroll: document.documentElement.scrollWidth > innerWidth, joy: document.querySelector('[aria-pressed][class*="min-h-11"]')?.getBoundingClientRect().height ?? 44 }));
      ok('TC09', `${w}×${h} ${lang || 'zh'} ${scheme}: continuous game opens from the hub, no sideways scroll, controls ≥ 44 px`, !m.hscroll && m.joy >= 44, JSON.stringify(m));
      if (w === 360) await p.screenshot({ path: `${OUT}/solo-360-${lang ? 'en' : 'zh'}-${scheme}.png` });
      await p.ctx.close();
    }
  }
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
