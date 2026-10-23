// Territory Rush player colours — browser check: pick a colour (mouse + keyboard), it is remembered, the solo game
// draws your head and land in it and the computer rivals differ; local two-player cannot share a colour; two pages
// asking for the same colour in a friend room get different ones and agree after a reload. Screenshots of the
// picker and of a game in progress (light/dark, 1180×820 and 390×844).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node territory-colors-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/territory-colors';
mkdirSync(OUT, { recursive: true });
// keep in step with shared/territory/colors.ts
const COLORS = [
  ['#e8322b', '#ffb2ab', '#a02d2e'],
  ['#ff7d0f', '#ffcb94', '#af5e1c'],
  ['#ffcc00', '#ffe98a', '#af9112'],
  ['#7dd321', '#cbf29d', '#5a9527'],
  ['#00b36b', '#8fe6c2', '#098157'],
  ['#14b4eb', '#a3e4fb', '#1681ab'],
  ['#3d63ff', '#b3c3ff', '#314db8'],
  ['#9447ff', '#d6bdff', '#693ab8'],
  ['#f2298f', '#ffaed6', '#a6276f'],
];
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
async function page(w = 1180, h = 820, opts = {}) {
  const ctx = opts.ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (rgb, h, tol = 10) => hex(h).every((v, k) => Math.abs(v - rgb[k]) <= tol);
const selected = (p, sel) => p.$$eval(`${sel} [role=radio]`, (bs) => bs.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => Number(b.dataset.color)));
/** Pixel colours at my head centre and inside my start land (1.3 cells down-right of the head). */
const samples = (p) =>
  p.evaluate(() => {
    const c = window.__tr;
    const k = c.me[0];
    const h = c.screenHeads[k];
    const cv = document.querySelector('[role=application] canvas');
    const r = cv.getBoundingClientRect();
    const sx = cv.width / r.width;
    const px = (x, y) => [...cv.getContext('2d').getImageData(Math.round(x * sx), Math.round(y * sx), 1, 1).data].slice(0, 3);
    return { head: px(h.x, h.y), land: px(h.x + h.cell * 1.3, h.y + h.cell * 1.3), colors: c.game.players.map((pl) => pl.color), me: k };
  });
async function noHScroll(p) {
  return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

try {
  // ---------------------------------------------------------------- picker: mouse, keyboard, remembered
  {
    const p = await page();
    await p.goto(`${BASE}/territory/play?mode=ai`, { waitUntil: 'networkidle0' });
    const sizes = await p.$$eval('[data-testid=tr-color-p1] [role=radio]', (bs) => bs.map((b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height, b.getAttribute('aria-label')]));
    ok('P1', '9 swatches, each ≥ 44×44 px with a colour name as its label', sizes.length === 9 && sizes.every(([w, h, l]) => w >= 44 && h >= 44 && l && l.length >= 2), JSON.stringify(sizes.map((s) => s[2])));
    await p.click('[data-testid=tr-color-p1] [data-color="7"]');
    const s1 = await selected(p, '[data-testid=tr-color-p1]');
    const check = await p.$eval('[data-testid=tr-color-p1] [data-color="7"]', (b) => !!b.querySelector('svg'));
    const legend = await p.$eval('[data-testid=tr-color-p1] legend', (l) => l.textContent);
    ok('P2', 'clicking violet selects it: one radio checked, a check mark drawn, the name written out', JSON.stringify(s1) === '[7]' && check && /紫羅蘭/.test(legend), legend);
    await p.focus('[data-testid=tr-color-p1] [data-color="7"]');
    await p.keyboard.press('ArrowRight');
    const k1 = await selected(p, '[data-testid=tr-color-p1]');
    const focused = await p.evaluate(() => document.activeElement?.dataset.color);
    await p.keyboard.press('ArrowLeft');
    const k2 = await selected(p, '[data-testid=tr-color-p1]');
    const tabStops = await p.$$eval('[data-testid=tr-color-p1] [role=radio]', (bs) => bs.filter((b) => b.tabIndex === 0).length);
    ok('P3', 'keyboard: arrows move and select (focus follows), one tab stop in the group', JSON.stringify(k1) === '[8]' && focused === '8' && JSON.stringify(k2) === '[7]' && tabStops === 1, `${k1} ${focused} ${k2} stops=${tabStops}`);
    await p.reload({ waitUntil: 'networkidle0' });
    ok('P4', 'the choice is remembered in this browser after a reload', JSON.stringify(await selected(p, '[data-testid=tr-color-p1]')) === '[7]');

    // ---------------------------------------------------------------- solo game uses it; rivals differ
    await p.$eval('[data-testid=tr-start]', (b) => b.click());
    await p.waitForFunction(() => window.__tr?.game && window.__tr.screenHeads && Object.keys(window.__tr.screenHeads).length, { timeout: 10000 });
    await sleep(300);
    const s = await samples(p);
    ok('G1', 'solo: my runner is violet and every computer rival has another, unique colour', s.colors[s.me] === 7 && s.colors.filter((c) => c === 7).length === 1 && new Set(s.colors).size === s.colors.length, JSON.stringify(s.colors));
    ok('G2', 'solo: the head and my land are drawn in the violet base / light tint on the board', near(s.head, COLORS[7][0]) && near(s.land, COLORS[7][1]), JSON.stringify(s));
    await p.waitForFunction(() => window.__tr?.status === 'playing', { timeout: 10000 });
    await sleep(2500);
    await p.screenshot({ path: `${OUT}/game-light-1180.png` });
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- dark theme, phone: game + picker screenshots
  for (const [w, h, scheme, touch] of [
    [1180, 820, 'dark', false],
    [390, 844, 'light', true],
    [390, 844, 'dark', true],
  ]) {
    const p = await page(w, h, { scheme, touch, dpr: touch ? 2 : 1 });
    await p.goto(`${BASE}/territory/play?mode=ai`, { waitUntil: 'networkidle0' });
    await p.click('[data-testid=tr-color-p1] [data-color="2"]'); // sunflower: the lightest colour, hardest for contrast
    await p.$eval('[data-testid=tr-colors]', (e) => e.scrollIntoView({ block: 'center' }));
    await sleep(200);
    await p.screenshot({ path: `${OUT}/picker-${scheme}-${w}.png` });
    const nh = await noHScroll(p);
    await p.$eval('[data-testid=tr-start]', (b) => b.click());
    await p.waitForFunction(() => window.__tr?.status === 'playing', { timeout: 10000 });
    await sleep(300);
    const s = await samples(p);
    ok(`G3-${scheme}-${w}`, `${scheme} ${w}px: sunflower head and ${scheme === 'dark' ? 'dark-board' : 'light'} land tint drawn; rivals differ; no sideways scroll`, s.colors[s.me] === 2 && new Set(s.colors).size === s.colors.length && near(s.head, COLORS[2][0]) && near(s.land, COLORS[2][scheme === 'dark' ? 2 : 1]) && nh, JSON.stringify(s));
    await sleep(2500);
    await p.screenshot({ path: `${OUT}/game-${scheme}-${w}.png` });
    await p.ctx.close();
  }
  {
    const p = await page(1180, 820, {});
    await p.goto(`${BASE}/territory/play?mode=ai`, { waitUntil: 'networkidle0' });
    await p.$eval('[data-testid=tr-colors]', (e) => e.scrollIntoView({ block: 'center' }));
    await p.screenshot({ path: `${OUT}/picker-light-1180.png` });
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- local two players: no shared colour
  {
    const p = await page(1180, 820);
    await p.goto(`${BASE}/territory/play?mode=local`, { waitUntil: 'networkidle0' });
    await p.click('[data-testid=tr-color-p1] [data-color="0"]');
    await p.click('[data-testid=tr-color-p2] [data-color="5"]');
    const takenInP1 = await p.$eval('[data-testid=tr-color-p1] [data-color="5"]', (b) => [b.getAttribute('aria-disabled'), b.getAttribute('aria-label')]);
    await p.click('[data-testid=tr-color-p2] [data-color="0"]'); // player 1's: refused
    const p2 = await selected(p, '[data-testid=tr-color-p2]');
    await p.focus('[data-testid=tr-color-p2] [data-color="5"]');
    for (let k = 0; k < 4; k++) await p.keyboard.press('ArrowRight'); // 6 7 8 → skips 0 → 1
    const p2k = await selected(p, '[data-testid=tr-color-p2]');
    ok('L1', "two players: player 1's colour is marked taken for player 2 (refused by click, skipped by arrows)", takenInP1[0] === 'true' && /玩家 2/.test(takenInP1[1]) && JSON.stringify(p2) === '[5]' && JSON.stringify(p2k) === '[1]', JSON.stringify({ takenInP1, p2, p2k }));
    await p.$eval('[data-testid=tr-start]', (b) => b.click());
    await p.waitForFunction(() => window.__tr?.game, { timeout: 10000 });
    const cs = await p.evaluate(() => window.__tr.game.players.map((pl) => pl.color));
    ok('L2', 'two players: P1 tomato, P2 tangerine, computers all different', cs[0] === 0 && cs[1] === 1 && new Set(cs).size === cs.length, JSON.stringify(cs));
    await p.ctx.close();
  }

  // ---------------------------------------------------------------- online friend room: same colour asked twice
  {
    const A = await page(1180, 820);
    const B = await page(390, 844, { touch: true, dpr: 2, scheme: 'dark' });
    for (const p of [A, B]) {
      await p.goto(`${BASE}/territory`, { waitUntil: 'networkidle0' });
      await p.evaluate(() => localStorage.setItem('jychess.territory.colors.v1', JSON.stringify({ p1: 5, p2: 6 })));
    }
    const id = await A.evaluate(async () => (await (await fetch('/api/territory/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ minutes: 2, engine: 'flow' }) })).json()).id);
    await A.goto(`${BASE}/territory/room/${id}`, { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('[data-testid=tr-room-color]');
    await B.goto(`${BASE}/territory/room/${id}`, { waitUntil: 'domcontentloaded' });
    await B.waitForSelector('[data-room-status=waiting][data-my-seat="1"] [data-testid=tr-room-color]');
    await sleep(400);
    const a = await A.$eval('[data-testid=tr-room-color]', (e) => e.dataset.color);
    const b = await B.$eval('[data-testid=tr-room-color]', (e) => e.dataset.color);
    const moved = await B.$eval('[data-testid=tr-color-moved]', (e) => e.textContent).catch(() => null);
    const takenOnB = await B.$eval('[data-testid=tr-room-color] [data-color="5"]', (e) => e.getAttribute('aria-disabled'));
    ok('O1', 'both ask for sky blue: the first keeps it, the second gets the nearest (royal blue) and is told so', a === '5' && b === '6' && /天空藍/.test(moved ?? '') && /寶石藍/.test(moved ?? '') && takenOnB === 'true', JSON.stringify({ a, b, moved }));
    await B.screenshot({ path: `${OUT}/room-dark-390.png`, fullPage: true });
    await A.screenshot({ path: `${OUT}/room-light-1180.png`, fullPage: true });
    await B.reload({ waitUntil: 'domcontentloaded' });
    await B.waitForSelector('[data-room-status=waiting] [data-testid=tr-room-color]');
    await sleep(400);
    const seatsA = await A.$$eval('[data-seat-color]', (ls) => ls.map((l) => l.dataset.seatColor));
    const seatsB = await B.$$eval('[data-seat-color]', (ls) => ls.map((l) => l.dataset.seatColor));
    ok('O2', 'after the second page reloads, both pages list the same, different colours', JSON.stringify(seatsA) === JSON.stringify(seatsB) && seatsA.length === 2 && seatsA[0] !== seatsA[1], JSON.stringify({ seatsA, seatsB }));
    // change in the lobby to a free colour; host starts; game colours match on both pages, also after a reload
    await B.click('[data-testid=tr-room-color] [data-color="8"]');
    await A.waitForFunction(() => [...document.querySelectorAll('[data-seat-color]')].map((l) => l.dataset.seatColor).join() === '5,8', { timeout: 5000 });
    await A.evaluate(() => [...document.querySelectorAll('button')].find((b) => /開始|Start/.test(b.textContent ?? ''))?.click());
    await A.waitForFunction(() => window.__tr?.game, { timeout: 10000 });
    await B.waitForFunction(() => window.__tr?.game, { timeout: 10000 });
    const ga = await A.evaluate(() => window.__tr.game.players.map((p) => p.color));
    await B.reload({ waitUntil: 'domcontentloaded' });
    await B.waitForFunction(() => window.__tr?.game, { timeout: 10000 });
    const gb = await B.evaluate(() => window.__tr.game.players.map((p) => p.color));
    ok('O3', 'a lobby change reaches the host; the game uses those colours and a mid-game reload draws the same', JSON.stringify(ga) === '[5,8]' && JSON.stringify(gb) === '[5,8]', JSON.stringify({ ga, gb }));
    await A.ctx.close();
    await B.ctx.close();
  }
  ok('E', 'no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  ok('X', 'script error', false, e.stack ?? e);
}
await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
process.exit(pass === results.length ? 0 : 1);
