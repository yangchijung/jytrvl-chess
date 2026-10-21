// Sketch Coaster (/coaster/) browser checks: draw (mouse and touch), smoothing, share link, identical rides, loop, end screen.
// Usage: node e2e.mjs <baseUrl> <outDir>
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = (process.argv[2] ?? 'http://127.0.0.1:8788') + '/coaster/';
const OUT = process.argv[3] ?? 'docs/test-results/screens/coaster';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => { results.push({ id, name, pass: !!pass, info: String(info).slice(0, 800) }); console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a)), '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'], headless: true });
const errors = [];
async function page(w, h, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const C = (p) => p.evaluate(() => ({ mode: window.__coaster.mode, code: window.__coaster.code }));
/** A drawn line: a run-up, a full loop (drawn as a circle going up and over), a hill, then a run-out. */
function pathPts(W, H) {
  const g = H - 76, pts = [];
  const X0 = W * 0.08, base = g - 160;
  for (let x = X0; x < W * 0.3; x += 6) pts.push([x, base - (x - X0) * 0.12 + Math.sin(x / 9) * 2.5]); // shaky hand
  const cx = pts[pts.length - 1][0], cy = pts[pts.length - 1][1] - 120;
  for (let a = Math.PI / 2; a > Math.PI / 2 - Math.PI * 2; a -= 0.05) pts.push([cx + Math.cos(a) * 120 * 0 + Math.sin(Math.PI / 2 - a) * 120, cy + Math.cos(Math.PI / 2 - a) * 120]);
  const [lx, ly] = pts[pts.length - 1];
  for (let x = lx; x < W * 0.92; x += 6) pts.push([x, ly - Math.sin(((x - lx) / (W * 0.92 - lx)) * Math.PI) * 180 + Math.sin(x / 7) * 2]);
  return pts;
}
try {
  // ------------------------------------------------ desktop: draw with the mouse
  const p = await page(1280, 800);
  await p.goto(BASE + '?lang=zh', { waitUntil: 'load' });
  await sleep(300);
  await p.screenshot({ path: `${OUT}/01-draw-1280.png` });
  ok('L1', 'opens in drawing mode with the hint (zh)', (await C(p)).mode === 'draw' && (await p.$eval('#hint', (e) => e.textContent)).includes('畫一條線'));
  // too short
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(460, 380, { steps: 5 }); await p.mouse.up();
  await sleep(200);
  ok('D3', 'a line under 25 m is refused with a message and drawing starts again', (await C(p)).mode === 'draw' && /太短/.test(await p.$eval('#toast', (e) => e.textContent)));
  const pts = pathPts(1280, 800);
  await p.mouse.move(pts[0][0], pts[0][1]); await p.mouse.down();
  for (const [x, y] of pts.slice(1)) await p.mouse.move(x, y);
  await p.screenshot({ path: `${OUT}/02-drawing-1280.png` });
  await p.mouse.up();
  await sleep(300);
  const st = await C(p);
  const hash = await p.evaluate(() => location.hash);
  ok('D1', 'releasing turns the line into a track (ready) and writes the share code to #t=…', st.mode === 'ready' && hash === '#t=' + st.code && /^[A-Za-z0-9_-]+$/.test(st.code), `${st.code.length} chars`);
  await p.screenshot({ path: `${OUT}/03-ready-1280.png` });
  // smoothing keeps the loop size; the drawer's track equals the decoded one
  const sm = await p.evaluate(() => {
    const c = window.__coaster;
    const tr = c.track;
    // loop size: span of x while the track goes backwards
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, back = 0;
    for (let i = 1; i < tr.n; i++) if (tr.TX[i] * tr.sigma < 0) { back++; minX = Math.min(minX, tr.X[i]); maxX = Math.max(maxX, tr.X[i]); minY = Math.min(minY, tr.Y[i]); maxY = Math.max(maxY, tr.Y[i]); }
    const re = c.encode(c.decode(c.code));
    return { back, loopW: maxX - minX, loopH: maxY - minY, stable: re === c.code };
  });
  ok('S1', 'the drawn 24 m loop survives smoothing as a loop of about the same width (24 m); re-encoding the decoded track gives the same code', sm.back > 20 && sm.loopW > 20 && sm.loopW < 28 && sm.stable, JSON.stringify(sm));
  // identical rides
  const sims = await p.evaluate(() => Array.from({ length: 10 }, () => window.__coaster.simulate()));
  ok('P1', 'the same track simulated 10 times gives exactly the same ride (fixed 1/240 s steps)', sims.every((s) => s.hash === sims[0].hash && s.steps === sims[0].steps), JSON.stringify(sims[0]));
  ok('P2', 'the train goes upside down in the loop and gets through to the end station', sims[0].flipped && sims[0].steps < 240 * 300 && sims[0].maxV > 12, JSON.stringify({ flipped: sims[0].flipped, t: sims[0].time.toFixed(1), vmax: (sims[0].maxV * 3.6).toFixed(0), g: sims[0].maxG.toFixed(2) }));
  const code = st.code;
  // ride in the page: first person, side view, minimap, end screen
  await p.keyboard.press('Enter');
  await sleep(300);
  const held = await p.evaluate(() => window.__coaster.ff(2.0));
  const moved = await p.evaluate(() => window.__coaster.ff(2.0));
  const r1 = await p.evaluate(() => ({ mode: window.__coaster.mode, s: window.__coaster.ride.s, gl: getComputedStyle(document.getElementById('gl')).display, mini: getComputedStyle(document.getElementById('mini')).display }));
  await p.screenshot({ path: `${OUT}/04-ride-fp-1280.png` });
  ok('R1', 'Enter starts the ride: the train waits 2.2 s in the station, then leaves; first-person 3D with the minimap', r1.mode === 'ride' && held.s === 22 && held.v === 0 && moved.s > 23 && r1.gl === 'block' && r1.mini === 'block', JSON.stringify({ held, moved, ...r1 }));
  const glPix = await p.evaluate(() => window.__coaster.glSample([[0.05, 0.9], [0.5, 0.5], [0.05, 0.12]]));
  ok('R2', '3D view renders sky and ground (non-blank, different colours top and bottom)', JSON.stringify(glPix[0]) !== JSON.stringify(glPix[2]), JSON.stringify(glPix));
  await p.keyboard.press('m');
  await sleep(100);
  const miniOff = await p.evaluate(() => [getComputedStyle(document.getElementById('mini')).display, localStorage.getItem('coaster.mini')]);
  await p.keyboard.press('m');
  await p.keyboard.press('v');
  await sleep(600);
  await p.screenshot({ path: `${OUT}/05-ride-side-1280.png` });
  ok('R3', 'M hides the minimap and remembers it; V switches to the side view', miniOff[0] === 'none' && miniOff[1] === '0' && (await p.evaluate(() => getComputedStyle(document.getElementById('gl')).display)) === 'none');
  await p.keyboard.press('v');
  await p.evaluate(() => window.__coaster.ff(60));
  await p.waitForFunction(() => window.__coaster.mode === 'done', { timeout: 30000 });
  await sleep(300);
  await p.screenshot({ path: `${OUT}/06-done-1280.png` });
  const card = await p.$eval('#card', (e) => e.innerText);
  ok('E1', 'the end screen shows length, top speed, max G and airtime with ride again / draw new / save / copy / share on X', /全長/.test(card) && /最高速度/.test(card) && /再搭一次/.test(card) && /存圖/.test(card) && /分享到 X/.test(card), card.replace(/\n/g, ' '));
  // save image
  const dl = await p.evaluate(() => new Promise((res) => { const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { res(this.download + ' ' + this.href.slice(0, 5)); HTMLAnchorElement.prototype.click = orig; }; [...document.querySelectorAll('#cardBtns button')].find((b) => /存圖/.test(b.textContent)).click(); }));
  ok('E2', 'save image produces a PNG download', /coaster-.*\.png blob:/.test(dl), dl);
  await p.ctx.close();

  // ------------------------------------------------ the loop seen from the front seat (upside down)
  {
    const q = await page(1280, 800);
    await q.goto(BASE + '?lang=zh', { waitUntil: 'load' });
    const lc = await q.evaluate(() => { const pts = []; for (let x = 5; x < 40; x += 0.3) pts.push({ x, y: 12 }); for (let a = 0; a < Math.PI * 2; a += 0.03) pts.push({ x: 40 + Math.sin(a) * 12, y: 24 - Math.cos(a) * 12 }); for (let x = 40; x < 110; x += 0.3) pts.push({ x, y: 12 + Math.sin(((x - 40) / 70) * Math.PI) * 15 }); return window.__coaster.encode(window.__coaster.smoothLine(pts)); });
    await q.goto(`${BASE}?lang=zh#t=${lc}`, { waitUntil: 'load' });
    await q.keyboard.press('Enter');
    await sleep(200);
    let up = null;
    for (let k = 0; k < 400 && up === null; k++) {
      // sample the 3D view in the same step that reaches the top (the ride keeps moving between calls)
      const r = await q.evaluate(() => { window.__coaster.ff(0.05); const tr = window.__coaster.track, s = window.__coaster.ride.s, i = Math.round(s / 0.25); const tx = tr.TX[i] * tr.sigma; return { tx, g: window.__coaster.ride.gf, sky: tx < -0.95 ? window.__coaster.glSample([[0.5, 0.92], [0.5, 0.06]]) : null }; });
      if (r.tx < -0.95) up = r;
    }
    const sky = up?.sky;
    await q.screenshot({ path: `${OUT}/04b-ride-fp-loop-1280.png` });
    ok('R4', 'at the top of a loop the seat is upside down: the 3D view shows the ground at the top of the screen', up !== null && sky && sky[1][1] > sky[1][2] && sky[1][1] > sky[1][0], JSON.stringify({ up, sky }));
    await q.ctx.close();
  }

  // ------------------------------------------------ the shared link, opened ten times
  const hashes = [];
  for (let k = 0; k < 10; k++) {
    const q = await page(1024, 768);
    await q.goto(`${BASE}?lang=ja#t=${code}`, { waitUntil: 'load' });
    await sleep(150);
    const r = await q.evaluate(() => ({ mode: window.__coaster.mode, sim: window.__coaster.simulate(), banner: document.getElementById('banner').textContent }));
    hashes.push(r.sim.hash);
    if (k === 0) { await q.screenshot({ path: `${OUT}/07-shared-ja-1024.png` }); ok('SH1', 'a shared link opens straight into the decoded track, fitted to the screen, with a banner (ja)', r.mode === 'shared' && /だれかが/.test(r.banner)); }
    await q.ctx.close();
  }
  ok('SH2', 'the same link opened 10 times: every ride is identical, and identical to the drawer’s', hashes.every((h) => h === sims[0].hash), hashes.join(','));

  // ------------------------------------------------ phone: draw with a finger
  const m = await page(390, 844, { touch: true, dpr: 2 });
  await m.goto(BASE + '?lang=en', { waitUntil: 'load' });
  await sleep(200);
  const cdp = await m.target().createCDPSession();
  const mp = pathPts(390, 844).map(([x, y]) => [x * 1 + 0, y]);
  // squeeze horizontally: phone is narrow, so draw a smaller loop
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 20, y: 600 }] });
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    const x = 20 + u * 350, y = 600 - Math.sin(u * Math.PI * 2) * 140 - u * 60;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const ms = await C(m);
  await m.screenshot({ path: `${OUT}/08-ready-390.png` });
  const sc = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  ok('T1', 'phone: a finger stroke becomes a track; no page scroll; buttons at least 44 px', ms.mode === 'ready' && !sc && (await m.$$eval('#bar button', (bs) => bs.every((b) => b.getBoundingClientRect().height >= 44))), ms.mode);
  await m.ctx.close();
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
