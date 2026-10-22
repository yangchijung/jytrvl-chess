// Rush Taxi stage 2 — the arcade loop in a real page (iPad landscape 1180×820, software WebGL, so the game is stepped
// by hand with the __taxi.ff hook: deterministic and independent of the renderer's speed).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node taxi-e2e.mjs <baseUrl> [outDir] [--video]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/taxi';
const VIDEO = process.argv.includes('--video');
mkdirSync(`${OUT}/frames`, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 900) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`);
};
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a)), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  headless: true,
});
const errors = [];
const p = await browser.newPage();
await p.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let frame = 0;
const shot = async (name) => p.screenshot({ path: `${OUT}/${name}.png` });
const rec = async () => VIDEO && p.screenshot({ path: `${OUT}/frames/f${String(frame++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 80 });
const run = () => p.evaluate(() => { const r = window.__taxi.run(); return r && { phase: r.phase, time: r.time, money: r.money, rides: r.rides, combo: r.combo, best: r.bestCombo, rider: r.rider && { dest: r.rider.dest, left: r.rider.left, limit: r.rider.limit }, waiting: r.waiting.map((w) => w.stop), first: r.firstPickupAt, clock: r.clock }; });
const ff = (s, c = {}) => p.evaluate((s, c) => window.__taxi.ff(s, c), s, c);
const settle = () => new Promise((r) => setTimeout(r, 120)); // let React draw the HUD after a hand step

/** a simple driver: steer towards (x, z), slow down near it, stop inside. Runs `max` seconds of game time in 1/30 s frames. */
async function driveTo(target, { max = 30, stopAt = 2.5, until } = {}) {
  let stuck = 0,
    backing = 0;
  for (let t = 0; t < max; t += 1 / 30) {
    const c = await p.evaluate((tx, tz, stopAt) => {
      const car = window.__taxi.car;
      const pos = car.body.translation();
      const f = car.forward();
      const dx = tx - pos.x,
        dz = tz - pos.z;
      const d = Math.hypot(dx, dz);
      // angle from the nose to the target; + = target is to the right (+x is the car's left)
      const ang = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
      const kmh = car.kmh();
      const want = Math.min(90, Math.max(6, d * 2.2)) * (Math.abs(ang) > 0.8 ? 0.5 : 1);
      if (d < stopAt) return { brake: kmh > 1 ? 1 : 0, d, kmh };
      return { throttle: kmh < want ? 1 : 0, brake: kmh > want + 15 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 2)), d, kmh };
    }, target.x, target.z, stopAt);
    // stuck nose-first against something: back out for a second with the wheel the other way
    stuck = c.throttle && c.kmh < 2 ? stuck + 1 / 30 : 0;
    if (stuck > 0.8) backing = 1.2;
    if (backing > 0) {
      backing -= 1 / 30;
      stuck = 0;
      c.throttle = 0;
      c.brake = 1;
      c.steer = -(c.steer ?? 0);
    }
    await p.evaluate((c) => window.__taxi.ff(1 / 30, c), { throttle: c.throttle ?? 0, brake: c.brake ?? 0, steer: c.steer ?? 0 });
    await rec();
    if (until && (await until())) return true;
  }
  return false;
}

try {
  await p.goto(`${BASE}/taxi`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.querySelector('[data-testid=taxi]')?.dataset.state === 'ready', { timeout: 60000 });
  // the live loop is stopped (paused) so only our hand steps move the game
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(0.5);
  await settle();
  await shot('1-menu');
  const menuWords = await p.$eval('[data-testid=taxi-menu]', (e) => (e.innerText.match(/[一-鿿]/g) ?? []).length);
  ok('X-01', 'the menu: two big picture buttons (arcade, practice) with two-character names', !!(await p.$('[data-testid=taxi-start-arcade]')) && !!(await p.$('[data-testid=taxi-start-practice]')) && menuWords <= 4, `chinese chars: ${menuWords}`);

  // ---------------- arcade ----------------
  await p.$eval('[data-testid=taxi-start-arcade]', (b) => b.click());
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(1 / 30);
  await settle();
  let r = await run();
  ok('X-02', 'arcade starts with 50 s on the clock, 0 money, five people waiting, the arrow (yellow) pointing to the nearest one', r.time > 49.9 && r.money === 0 && r.waiting.length === 5 && (await p.$eval('[data-testid=taxi-arrow]', (e) => e.dataset.to)) === 'pickup' && (await p.$eval('[data-testid=taxi-time]', (e) => e.dataset.value)) === '50', JSON.stringify({ time: r.time, waiting: r.waiting.length }));
  await shot('2-start');
  // drive to the first (nearest) passenger
  const nearest = r.waiting.reduce((a, b) => (Math.hypot(a.x, a.z + 60) < Math.hypot(b.x, b.z + 60) ? a : b));
  const picked = await driveTo(nearest, { max: 30, until: async () => !!(await run()).rider });
  await settle();
  r = await run();
  const pop = await p.$eval('[data-testid=taxi-pops]', (e) => e.innerText).catch(() => '');
  ok('X-03', 'a simple driver reaches the first passenger and stops in the circle: picked up within 30 s; the destination name and seconds pop up', picked && r.first !== null && r.first < 30 && pop.includes(r.rider.dest.name.zh), `picked at ${r.first?.toFixed(1)} s, pop "${pop.replace(/\n/g, ' ')}"`);
  await shot('3-pickup');
  ok('X-04', 'carrying: the arrow turns green to the destination, the passenger timer bar shows', (await p.$eval('[data-testid=taxi-arrow]', (e) => e.dataset.to)) === 'dest' && !!(await p.$('[data-testid=taxi-rider]')));
  // stunt: a drift with the passenger aboard builds the combo and pays tips
  const money0 = r.money;
  await ff(1.5, { throttle: 1 });
  await ff(1.6, { throttle: 1, steer: 1, drift: true });
  await settle();
  r = await run();
  ok('X-05', 'a drift with a passenger aboard: tip combo and money go up', r.combo >= 1 && r.money > money0, JSON.stringify({ combo: r.combo, money: r.money }));
  await shot('4-combo');
  // a hard hit on a wall breaks the combo
  await p.evaluate(() => window.__taxi.place({ x: 20, y: 1, z: 0 }, Math.PI / 2));
  await ff(3.6, { throttle: 1 });
  r = await run();
  ok('X-06', 'hitting the long wall at speed breaks the combo (best combo kept)', r.combo === 0 && r.best >= 1, JSON.stringify({ combo: r.combo, best: r.best }));
  // deliver: put the car 45 m before the destination, facing it, and drive in
  const dest = r.rider.dest;
  await p.evaluate((d) => {
    // approach along the road the destination sits on (both lie on road lines)
    const onX = Math.abs(Math.abs(d.x) % 60 - 30) < 1; // x is a road line → come along z
    const from = onX ? { x: d.x, z: d.z - 45 * Math.sign(d.z || 1) } : { x: d.x - 45 * Math.sign(d.x || 1), z: d.z };
    const yaw = Math.atan2(d.x - from.x, d.z - from.z);
    window.__taxi.place({ x: from.x, y: 1, z: from.z }, yaw);
  }, dest);
  const time0 = r.time;
  const money1 = r.money;
  const dropped = await driveTo(dest, { max: 15, stopAt: 2, until: async () => (await run()).rides === 1 });
  await settle();
  r = await run();
  const dropPop = await p.$eval('[data-testid=taxi-pops]', (e) => e.innerText).catch(() => '');
  ok('X-07', 'stopping at the destination drops the passenger: the rating pops up, the fare is paid, bonus seconds added', dropped && r.rides === 1 && r.money > money1 && /Speedy|Normal|Slow/.test(dropPop), `${dropPop.replace(/\n/g, ' ')} time ${time0.toFixed(1)}→${r.time.toFixed(1)}`);
  await shot('5-drop');
  // pause with Esc
  await p.evaluate(() => window.__taxi.setPaused(false));
  await p.keyboard.press('Escape');
  await new Promise((res) => setTimeout(res, 300));
  ok('X-08', 'Esc pauses: resume / restart / menu', !!(await p.$('[data-testid=taxi-paused]')));
  await shot('6-pause');
  await p.$eval('[data-testid=taxi-resume]', (b) => b.click());
  await p.evaluate(() => window.__taxi.setPaused(true));
  // run the clock out
  for (let k = 0; k < 80 && (await run()).phase !== 'over'; k++) await ff(1);
  await settle();
  r = await run();
  const rank = await p.$eval('[data-testid=taxi-rank]', (e) => e.textContent).catch(() => '');
  ok('X-09', 'at 0 s the run ends: results with rank, money, rides, best combo', r.phase === 'over' && /^[SABCD]$/.test(rank) && (await p.$eval('[data-testid=taxi-result-rides]', (e) => e.textContent)) === String(r.rides), `rank ${rank} money ${r.money} rides ${r.rides}`);
  await shot('7-results');
  await p.$eval('[data-testid=taxi-again]', (b) => b.click());
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(1 / 30);
  r = await run();
  ok('X-10', '"play again" starts a fresh arcade run', r.phase === 'play' && r.money === 0 && r.time > 49);
  // practice: no clock
  await p.evaluate(() => window.__taxi.setPaused(false));
  await p.keyboard.press('Escape');
  await new Promise((res) => setTimeout(res, 200));
  await p.$eval('[data-testid=taxi-to-menu]', (b) => b.click());
  await p.$eval('[data-testid=taxi-start-practice]', (b) => b.click());
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(60);
  await settle();
  r = await run();
  ok('X-11', 'practice: no clock on screen and the run never ends', r.phase === 'play' && !(await p.$('[data-testid=taxi-time]')));
  // touch controls
  const small = await p.$$eval('.taxi-gas, .taxi-brake, .taxi-drift, .taxi-rush', (e) => e.map((x) => Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height)));
  ok('X-12', 'touch: gas and brake buttons at least 72 px', small.length === 4 && small[0] >= 72 && small[1] >= 72, JSON.stringify(small));
  const st = await p.evaluate(() => window.__taxi.stats());
  ok('X-13', 'draw calls under 150', st.drawCalls < 150, JSON.stringify(st));
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((x) => x.pass).length, failed: results.filter((x) => !x.pass).length, results }, null, 2));
  console.log(`${results.filter((x) => x.pass).length}/${results.length} passed`);
}
