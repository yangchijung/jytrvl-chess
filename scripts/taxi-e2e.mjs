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

/** the street route from the car to (x, z): the city's road graph (shortest path), then the target itself */
const route = (target) =>
  p.evaluate((tx, tz) => {
    const g = window.__taxi.level.graph;
    const pos = window.__taxi.car.body.translation();
    if (!g) return [{ x: tx, z: tz }];
    const near = (x, z) => g.nodes.reduce((b, n, i) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(g.nodes[b].x - x, g.nodes[b].z - z) ? i : b), 0);
    const adj = g.nodes.map(() => []);
    for (const [a, b] of g.edges) adj[a].push(b), adj[b].push(a);
    const from = near(pos.x, pos.z),
      to = near(tx, tz);
    const dist = g.nodes.map(() => Infinity),
      prev = g.nodes.map(() => -1);
    dist[from] = 0;
    const open = new Set([from]);
    while (open.size) {
      const u = [...open].reduce((a, b) => (dist[a] < dist[b] ? a : b));
      open.delete(u);
      if (u === to) break;
      for (const v of adj[u]) {
        const d = dist[u] + Math.hypot(g.nodes[u].x - g.nodes[v].x, g.nodes[u].z - g.nodes[v].z);
        if (d < dist[v]) (dist[v] = d), (prev[v] = u), open.add(v);
      }
    }
    const path = [];
    for (let u = to; u !== -1; u = prev[u]) path.unshift(g.nodes[u]);
    // skip the first crossing when the car is already past it towards the second
    if (path.length > 1 && Math.hypot(path[1].x - pos.x, path[1].z - pos.z) < Math.hypot(path[1].x - path[0].x, path[1].z - path[0].z)) path.shift();
    // and the last crossing when the target lies between it and the one before
    if (path.length > 1) {
      const a = path[path.length - 2],
        b = path[path.length - 1];
      if (Math.hypot(tx - a.x, tz - a.z) < Math.hypot(b.x - a.x, b.z - a.z)) path.pop();
    }
    return [...path.map((n) => ({ x: n.x, z: n.z })), { x: tx, z: tz }];
  }, target.x, target.z);

/** a simple driver: follows the streets to (x, z), slows for corners, stops at the end. Runs `max` seconds of game
 * time in 1/30 s frames. */
async function driveTo(target, { max = 30, stopAt = 2.5, until, top = 75 } = {}) {
  let stuck = 0,
    backing = 0;
  const way = await route(target);
  let w = 0;
  for (let t = 0; t < max; t += 1 / 30) {
    const wp = way[w];
    const last = w === way.length - 1;
    const nx = way[w + 1];
    const c = await p.evaluate((wp, nx, last, stopAt, top) => {
      const car = window.__taxi.car;
      const pos = car.body.translation();
      const f = car.forward();
      const dx = wp.x - pos.x,
        dz = wp.z - pos.z;
      const d = Math.hypot(dx, dz);
      // angle from the nose to the target; + = target is to the right (+x is the car's left)
      const ang = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
      const kmh = car.kmh();
      // a corner ahead: how sharp is the turn at this waypoint
      let turn = 0;
      if (nx) turn = Math.abs(Math.atan2(dx * (nx.z - wp.z) - dz * (nx.x - wp.x), dx * (nx.x - wp.x) + dz * (nx.z - wp.z)));
      let want = last ? Math.min(top, Math.max(6, d * 2.2)) : turn > 0.5 ? Math.min(top, Math.max(28, d * 1.6)) : top;
      if (Math.abs(ang) > 0.8) want *= 0.5;
      if (last && d < stopAt) return { brake: kmh > 1 ? 1 : 0, d, kmh, next: false };
      return { throttle: kmh < want ? 1 : 0, brake: kmh > want + 12 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 2)), d, kmh, next: !last && d < 7 };
    }, wp, nx ?? null, last, stopAt, top);
    if (c.next) w++;
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
  await p.click('[data-testid=taxi-start-arcade]'); // a real tap: it also unlocks the sound
  // the garage: four cabs, four drivers, the last choice pre-selected; picking a cab changes the handling live
  await p.waitForSelector('[data-testid=taxi-garage]');
  await shot('1b-garage');
  const garage = await p.evaluate(() => ({
    cabs: document.querySelectorAll('[data-testid^=taxi-car-]').length,
    drivers: document.querySelectorAll('[data-testid^=taxi-driver-]').length,
    pressed: [...document.querySelectorAll('[data-testid=taxi-garage] [aria-pressed=true]')].map((e) => e.dataset.testid),
    orbit: window.__taxi.car && document.querySelector('[data-testid=taxi-go]') !== null,
  }));
  ok('X-18', 'garage: 4 cabs and 4 drivers, one of each selected, a big 出發 button', garage.cabs === 4 && garage.drivers === 4 && garage.pressed.length === 2 && garage.orbit, JSON.stringify(garage));
  await p.click('[data-testid=taxi-car-rocket]');
  const rocket = await p.evaluate(() => ({ top: window.__taxi.tuning.topSpeedKmh, pressed: document.querySelector('[data-testid=taxi-car-rocket]').getAttribute('aria-pressed'), saved: localStorage.getItem('jy.taxi.garage') }));
  await p.click('[data-testid=taxi-car-classic]');
  await p.click('[data-testid=taxi-driver-ayi]');
  const classic = await p.evaluate(() => ({ top: window.__taxi.tuning.topSpeedKmh, saved: localStorage.getItem('jy.taxi.garage') }));
  ok('X-19', 'picking the rocket cab sets its top speed (165 km/h) and is remembered; back to the classic cab restores it', rocket.top === 165 && rocket.pressed === 'true' && /rocket/.test(rocket.saved) && classic.top < 165 && /classic/.test(classic.saved) && /ayi/.test(classic.saved), JSON.stringify({ rocket, classic }));
  await p.click('[data-testid=taxi-go]');
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(1 / 30);
  await settle();
  let r = await run();
  ok('X-02', 'arcade starts with 50 s on the clock, 0 money, five people waiting, the arrow (yellow) pointing to the nearest one', r.time > 49.5 && r.money === 0 && r.waiting.length === 5 && (await p.$eval('[data-testid=taxi-arrow]', (e) => e.dataset.to)) === 'pickup' && (await p.$eval('[data-testid=taxi-time]', (e) => e.dataset.value)) === '50', JSON.stringify({ time: r.time, waiting: r.waiting.length }));
  await shot('2-start');
  // music: the tap on "arcade" unlocked sound; the arcade track is playing (decoded from the mp3)
  await p.waitForFunction(() => window.__taxiMusic?.current?.track === 'arcade', { timeout: 15000 }).catch(() => null);
  const mus = await p.evaluate(() => ({ unlocked: window.__taxiMusic.unlocked, track: window.__taxiMusic.current?.track, loop: window.__taxiMusic.current?.src.loop, loopEnd: window.__taxiMusic.current?.src.loopEnd, dur: window.__taxiMusic.current?.src.buffer.duration }));
  ok('X-15', 'music: starts with the first tap, the arcade track loops between its bar-line loop points', mus.unlocked && mus.track === 'arcade' && mus.loop && mus.loopEnd > 80 && mus.loopEnd < mus.dur, JSON.stringify(mus));
  // drive to the first (nearest) passenger
  const sp = await p.evaluate(() => window.__taxi.level.spawn.p);
  const nearest = r.waiting.reduce((a, b) => (Math.hypot(a.x - sp.x, a.z - sp.z) < Math.hypot(b.x - sp.x, b.z - sp.z) ? a : b));
  // pop-ups live ~2 s of real time, but a hand-stepped run is far slower than real time: log every pop as it appears
  await p.evaluate(() => {
    window.__popLog = [];
    const box = document.querySelector('[data-testid=taxi-pops]');
    new MutationObserver(() => box.querySelectorAll('.taxi-pop').forEach((e) => window.__popLog.push(e.innerText))).observe(box, { childList: true, subtree: true });
  });
  const picked = await driveTo(nearest, { max: 30, until: async () => !!(await run()).rider });
  await settle();
  r = await run();
  await new Promise((res) => setTimeout(res, 300));
  const pop = await p.evaluate(() => window.__popLog.join(' | '));
  ok('X-03', 'a simple driver reaches the first passenger and stops in the circle: picked up within 30 s; the destination name and seconds pop up', picked && r.first !== null && r.first < 30 && pop.includes(r.rider.dest.name.zh), `picked at ${r.first?.toFixed(1)} s, pop "${pop.replace(/\n/g, ' ')}"`);
  await shot('3-pickup');
  ok('X-04', 'carrying: the arrow turns green to the destination, the passenger timer bar shows', (await p.$eval('[data-testid=taxi-arrow]', (e) => e.dataset.to)) === 'dest' && !!(await p.$('[data-testid=taxi-rider]')));
  // stunt: a drift with the passenger aboard builds the combo and pays tips
  const money0 = r.money;
  // on a long straight street (city: z = −90 from the west edge; test ground: the plaza) so the slide has room
  const city = await p.evaluate(() => window.__taxi.level.id === 'city');
  if (city) await p.evaluate(() => window.__taxi.place({ x: -300, y: 1, z: -95.5 }, Math.PI / 2));
  await ff(1.5, { throttle: 1 });
  await ff(1.3, { throttle: 1, steer: city ? 0.5 : 1, drift: true });
  await settle();
  r = await run();
  ok('X-05', 'a drift with a passenger aboard: tip combo and money go up', r.combo >= 1 && r.money > money0, JSON.stringify({ combo: r.combo, money: r.money }));
  await shot('4-combo');
  // sound effects: the tap created them on the same audio context; the engine is audible while driving
  await ff(0.5, { throttle: 1 });
  await new Promise((res) => setTimeout(res, 400));
  const engineDriving = await p.evaluate(() => ({ sfx: !!window.__taxiMusic.sfx, level: window.__taxiMusic.sfx?.engineLevel ?? -1, running: window.__taxiMusic.unlocked }));
  // running into a car breaks the combo (and knocks the car flying)
  await p.evaluate(() => {
    // a car on a long straight stretch, so 30 m ahead of it is still its lane
    const cars = window.__taxi.traffic.cars;
    const k = cars.findIndex((c) => !c.flying && !c.piece.turn && c.piece.len - c.s > 38);
    window.__hitCar = Math.max(0, k);
    const n = cars[window.__hitCar];
    const s = Math.sin(n.yaw),
      c = Math.cos(n.yaw);
    // in its lane, 30 m ahead, facing it
    window.__taxi.place({ x: n.pos.x + s * 30, y: 1, z: n.pos.y + c * 30 }, n.yaw + Math.PI);
  });
  await ff(3, { throttle: 1 });
  r = await run();
  const flew = await p.evaluate(() => window.__taxi.traffic.cars[window.__hitCar].flying > 0);
  ok('X-06', 'running into a traffic car knocks it flying and breaks the combo (best combo kept)', flew && r.combo === 0 && r.best >= 1, JSON.stringify({ flew, combo: r.combo, best: r.best }));
  // deliver: put the car 45 m before the destination, facing it, and drive in
  const dest = r.rider.dest;
  await p.evaluate((d) => {
    // start 45 m back along the destination's street (city: streets every 60 m), never across the river
    const alongX = Math.abs(d.x / 60 - Math.round(d.x / 60)) < 0.01;
    for (const dir of [1, -1]) {
      const from = alongX ? { x: d.x - dir * 45, z: d.z } : { x: d.x, z: d.z - dir * 45 };
      const ok = Math.abs(from.x) < 335 && Math.abs(from.z) < 335 && (alongX || (Math.sign(from.z) === Math.sign(d.z) && Math.abs(from.z) > 25));
      if (!ok) continue;
      window.__taxi.place({ x: from.x, y: 1, z: from.z }, Math.atan2(d.x - from.x, d.z - from.z));
      return;
    }
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
  ok('X-08', 'Esc pauses: resume / restart / menu, plus separate music and sound-effect volume', !!(await p.$('[data-testid=taxi-paused]')) && !!(await p.$('[data-testid=taxi-volume-music]')) && !!(await p.$('[data-testid=taxi-volume-sfx]')));
  await shot('6-pause');
  await new Promise((res) => setTimeout(res, 800));
  const enginePaused = await p.evaluate(() => window.__taxiMusic.sfx?.engineLevel ?? -1);
  ok('X-24', 'sound effects: after the tap they exist, the engine sounds while driving and fades to silence on pause', engineDriving.sfx && engineDriving.running && engineDriving.level > 0.015 && enginePaused >= 0 && enginePaused < 0.003, JSON.stringify({ ...engineDriving, paused: enginePaused }));
  // stage 5: help panel (pictures of the three control schemes) and the control settings
  await p.click('[data-testid=taxi-help-open]');
  await new Promise((res) => setTimeout(res, 150));
  const help = await p.$eval('[data-testid=taxi-help]', (e) => ({ rows: e.querySelectorAll('tbody tr').length, keys: e.querySelectorAll('kbd').length, map: !!e.querySelector('.tc-touchmap'), visible: e.getBoundingClientRect().height > 100 })).catch(() => null);
  await shot('6b-help');
  await p.keyboard.press('Escape'); // closes the panel, not the pause menu
  await new Promise((res) => setTimeout(res, 150));
  ok('X-21', 'pause → 操作說明: keyboard keys, gamepad buttons and a touch map; Esc closes it back to the pause menu', help && help.visible && help.rows === 7 && help.keys >= 10 && help.map && !(await p.$('[data-testid=taxi-help]')) && !!(await p.$('[data-testid=taxi-paused]')), JSON.stringify(help));
  const sw = await p.$eval('[data-testid=taxi-auto-gas]', (e) => ({ role: e.getAttribute('role'), on: e.getAttribute('aria-checked'), h: e.getBoundingClientRect().height }));
  await p.click('[data-testid=taxi-auto-gas]');
  const swOn = await p.$eval('[data-testid=taxi-auto-gas]', (e) => e.getAttribute('aria-checked'));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.taxi.settings') ?? '{}').autoGas);
  const pausedGas = await p.evaluate(() => window.__taxi.input.autoGas);
  const tiltSw = await p.$('[data-testid=taxi-tilt]');
  let tiltInfo = 'tilt hidden (no DeviceOrientationEvent / not touch)';
  let tiltOk = true;
  if (tiltSw) {
    await p.click('[data-testid=taxi-tilt]');
    await new Promise((res) => setTimeout(res, 150));
    let on = await p.$eval('[data-testid=taxi-tilt]', (e) => e.getAttribute('aria-checked'));
    // headless Chrome refuses the motion-sensor permission: the switch must stay off and say so; then grant it
    const denied = on === 'false' ? await p.$eval('[data-testid=taxi-tilt-status]', (e) => e.textContent) : '';
    if (on === 'false') {
      await p.evaluate(() => (DeviceOrientationEvent.requestPermission = async () => 'granted'));
      await p.click('[data-testid=taxi-tilt]');
      await new Promise((res) => setTimeout(res, 150));
      on = (await p.$eval('[data-testid=taxi-tilt]', (e) => e.getAttribute('aria-checked'))) + (denied ? ` after "${denied}"` : '');
    }
    await p.evaluate(() => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 6, gamma: 40, alpha: 0 })));
    const cal = await p.$('[data-testid=taxi-tilt-calibrate]');
    if (cal) await p.click('[data-testid=taxi-tilt-calibrate]');
    const centre = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.taxi.settings') ?? '{}').tiltCentre);
    tiltOk = on.startsWith('true') && !!cal && centre?.beta === 6;
    tiltInfo = JSON.stringify({ on, cal: !!cal, centre });
  }
  ok('X-22', 'settings: auto gas is a real switch (role=switch, ≥64 px), saved per browser, not driving the car while paused; tilt toggle + 校正 when supported', sw.role === 'switch' && sw.on === 'false' && sw.h >= 64 && swOn === 'true' && saved === true && pausedGas === false && tiltOk, JSON.stringify({ sw, swOn, saved, pausedGas }) + ' ' + tiltInfo);
  await shot('6c-settings');
  await p.$eval('[data-testid=taxi-resume]', (b) => b.click());
  // auto gas: real frames with no input → the car speeds up by itself
  await p.evaluate(() => window.__taxi.place({ x: -300, y: 1, z: -95.5 }, Math.PI / 2));
  const k0 = await p.evaluate(() => window.__taxi.car.kmh());
  const read = await p.evaluate(() => ({ auto: window.__taxi.input.autoGas, tilt: window.__taxi.input.tilt }));
  await new Promise((res) => setTimeout(res, 1500));
  const k1 = await p.evaluate(() => window.__taxi.car.kmh());
  ok('X-23', 'auto gas on: with no key or touch the car drives forward during play', read.auto && k1 > k0 + 3, JSON.stringify({ k0, k1, ...read }));
  // switch it back off for the rest of the run
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid=taxi-auto-gas]', { timeout: 5000 });
  await p.click('[data-testid=taxi-auto-gas]');
  if (await p.$('[data-testid=taxi-tilt][aria-checked=true]')) await p.click('[data-testid=taxi-tilt]');
  await p.$eval('[data-testid=taxi-resume]', (b) => b.click());
  await p.evaluate(() => window.__taxi.setPaused(true));
  // run the clock out
  for (let k = 0; k < 80 && (await run()).phase !== 'over'; k++) await ff(1);
  await settle();
  r = await run();
  const rank = await p.$eval('[data-testid=taxi-rank]', (e) => e.textContent).catch(() => '');
  ok('X-09', 'at 0 s the run ends: results with rank, money, rides, best combo', r.phase === 'over' && /^[SABCD]$/.test(rank) && (await p.$eval('[data-testid=taxi-result-rides]', (e) => e.textContent)) === String(r.rides), `rank ${rank} money ${r.money} rides ${r.rides}`);
  await shot('7-results');
  await p.waitForFunction(() => window.__taxiMusic?.current?.track === 'results', { timeout: 10000 }).catch(() => null);
  ok('X-16', 'music: the results fanfare plays once at the end of a run', await p.evaluate(() => window.__taxiMusic.current?.track === 'results' && !window.__taxiMusic.current.src.loop));
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
  // a returning child: the garage remembers the classic cab and auntie, so it is one more tap to drive
  const again = await p.$$eval('[data-testid=taxi-garage] [aria-pressed=true]', (e) => e.map((x) => x.dataset.testid));
  ok('X-20', 'garage pre-selects the last choice', again.includes('taxi-car-classic') && again.includes('taxi-driver-ayi'), JSON.stringify(again));
  await p.$eval('[data-testid=taxi-go]', (b) => b.click());
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(60);
  await settle();
  r = await run();
  ok('X-11', 'practice: no clock on screen and the run never ends', r.phase === 'play' && !(await p.$('[data-testid=taxi-time]')));
  await p.waitForFunction(() => window.__taxiMusic?.current?.track === 'practice', { timeout: 10000 }).catch(() => null);
  ok('X-17', 'music: practice has its own relaxed track', await p.evaluate(() => window.__taxiMusic.current?.track === 'practice'));
  // touch controls
  const small = await p.$$eval('.taxi-gas, .taxi-brake, .taxi-drift, .taxi-rush', (e) => e.map((x) => Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height)));
  ok('X-12', 'touch: gas and brake buttons at least 72 px', small.length === 4 && small[0] >= 72 && small[1] >= 72, JSON.stringify(small));
  const world = await p.evaluate(() => ({ id: window.__taxi.level.id, places: window.__taxi.level.places.length, cars: window.__taxi.traffic?.cars.length ?? 0, people: window.__taxi.people?.list.length ?? 0, bridges: window.__taxi.level.signs.filter((s) => s.decor).length }));
  ok('X-14', 'the city: at least 30 destinations, traffic and people on the streets, the Love River named at the bridges', world.id === 'city' && world.places >= 30 && world.cars >= 20 && world.people >= 40 && world.bridges === 8, JSON.stringify(world));
  const st = await p.evaluate(() => window.__taxi.stats());
  ok('X-13', 'draw calls under 150', st.drawCalls < 150, JSON.stringify(st));
  // chase camera vs the landmark name boards: drive past the 郵局 board both ways along its street; at every step
  // nothing drawn opaque may sit between the lens and the cab, and no board may fill the lens up close
  {
    const pass = [];
    for (const dirSign of [1, -1]) {
      const at = await p.evaluate((dirSign) => {
        const g = window.__taxi;
        const s = g.level.signs.find((x) => x.id === 'post');
        const pl = g.level.places.find((x) => x.id === 'post');
        const ax = Math.sin(s.yaw) * dirSign,
          az = Math.cos(s.yaw) * dirSign;
        g.place({ x: pl.x - ax * 22, y: 1, z: pl.z - az * 22 }, Math.atan2(ax, az));
        return { sx: s.x, sz: s.z };
      }, dirSign);
      let worst = { blocked: 0, nearHits: 0, blockers: [] },
        closest = Infinity;
      for (let k = 0; k < 24; k++) {
        await ff(0.2, { throttle: 0.45 });
        const v = await p.evaluate(() => {
          const s = window.__taxi.sight();
          const own = s.blockers.filter((b) => /^(boards|landmarks|buildings)@/.test(b));
          return { ...s, own };
        });
        if (v.own.length > worst.blocked || v.nearHits > worst.nearHits) worst = { blocked: v.own.length, nearHits: v.nearHits, blockers: v.blockers };
        const cam = await p.evaluate(() => window.__taxi.car.body.translation());
        const d = Math.hypot(cam.x - at.sx, cam.z - at.sz);
        if (d < closest) closest = d;
        if (k === 9) await shot(`7-board-pass-${dirSign > 0 ? 'a' : 'b'}`);
      }
      pass.push({ dir: dirSign, ...worst, carToBoard: +closest.toFixed(1) });
    }
    ok('X-26', 'chase camera: no board, landmark or wall hides the cab when driving past a name board', pass.every((x) => x.blocked === 0 && x.nearHits === 0 && x.carToBoard < 25), JSON.stringify(pass));
  }
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((x) => x.pass).length, failed: results.filter((x) => !x.pass).length, results }, null, 2));
  console.log(`${results.filter((x) => x.pass).length}/${results.length} passed`);
}
