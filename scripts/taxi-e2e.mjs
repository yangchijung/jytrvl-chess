// Rush Taxi stage 2 — the arcade loop in a real page (iPad landscape 1180×820, software WebGL, so the game is stepped
// by hand with the __taxi.ff hook: deterministic and independent of the renderer's speed).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node taxi-e2e.mjs <baseUrl> [outDir] [--video] [--track=grid]
// The real-map city (OpenStreetMap Kaohsiung) is the default; the end of the run repeats the key checks (G-xx) on the
// old hand-made grid city (?track=grid). --track=grid runs the whole suite on the grid city instead.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/taxi';
const VIDEO = process.argv.includes('--video');
const TRACK = process.argv.find((a) => a.startsWith('--track='))?.slice(8) ?? '';
const PAGE = (track) => `${BASE}/taxi${track ? `?track=${track}` : ''}`;
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
  protocolTimeout: 900000,
});
const errors = [];
const newPage = async () => {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return pg;
};
let p = await newPage();
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
    if (window.__taxi.level.osm) {
      // real map: graph nodes sit only where roads bend or meet, so the nearest node can be far down the road. Start
      // from both ends of the car's road piece (the one behind costs a U-turn) and finish at the better end of the
      // target's road piece, then the target itself.
      const segD = (x, z, a, b) => {
        const A = g.nodes[a], B = g.nodes[b];
        const vx = B.x - A.x, vz = B.z - A.z, L2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / L2));
        return Math.hypot(x - A.x - vx * t, z - A.z - vz * t);
      };
      const nearEdge = (x, z) => g.edges.reduce((b, e) => (segD(x, z, e[0], e[1]) < segD(x, z, b[0], b[1]) ? e : b), g.edges[0]);
      const adj = g.nodes.map(() => []);
      for (const [a, b] of g.edges) adj[a].push(b), adj[b].push(a);
      const f = window.__taxi.car.forward();
      const se = nearEdge(pos.x, pos.z),
        te = nearEdge(tx, tz);
      const dist = g.nodes.map(() => Infinity),
        prev = g.nodes.map(() => -1);
      const open = new Set();
      for (const n of se) {
        const N = g.nodes[n];
        const behind = (N.x - pos.x) * f.x + (N.z - pos.z) * f.z < 0;
        dist[n] = Math.hypot(N.x - pos.x, N.z - pos.z) + (behind ? 60 : 0);
        open.add(n);
      }
      const done = new Set();
      while (open.size && !(done.has(te[0]) && done.has(te[1]))) {
        const u = [...open].reduce((a, b) => (dist[a] < dist[b] ? a : b));
        open.delete(u);
        done.add(u);
        for (const v of adj[u]) {
          const d = dist[u] + Math.hypot(g.nodes[u].x - g.nodes[v].x, g.nodes[u].z - g.nodes[v].z);
          if (d < dist[v]) (dist[v] = d), (prev[v] = u), open.add(v);
        }
      }
      const cost = (n) => dist[n] + Math.hypot(g.nodes[n].x - tx, g.nodes[n].z - tz);
      const end = cost(te[0]) <= cost(te[1]) ? te[0] : te[1];
      const path = [];
      for (let u = end; u !== -1; u = prev[u]) path.unshift(g.nodes[u]);
      // the car and the target on the same road piece, target ahead: straight there
      if (se === te && path.length === 1 && (tx - pos.x) * f.x + (tz - pos.z) * f.z > 0) path.length = 0;
      return [...path.map((n) => ({ x: n.x, z: n.z })), { x: tx, z: tz }];
    }
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

/** in the page: helpers for the real-map city (level.osm): the nearest point on a road's centre line, and a pose on a
 * road (right-hand lane, facing along it) */
const osmHelpers = () =>
  p.evaluate(() => {
    window.__e2e = {
      near(x, z, ok = () => true) {
        let best = null;
        window.__taxi.level.osm.roads.forEach((r) => {
          if (!ok(r)) return;
          for (let s = 0; s < r.pts.length - 1; s++) {
            const [ax, az] = r.pts[s],
              [bx, bz] = r.pts[s + 1];
            const vx = bx - ax,
              vz = bz - az,
              L2 = vx * vx + vz * vz || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
            const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
            if (!best || d < best.d) best = { r, s, t, d, L: Math.sqrt(L2), dx: vx / Math.sqrt(L2), dz: vz / Math.sqrt(L2), x: ax + vx * t, z: az + vz * t };
          }
        });
        return best;
      },
      /** the nearest long straight segment of a main road (not a bridge) to (x, z): a start 12 m in, facing along it */
      straight(x, z, minLen) {
        let best = null;
        for (const r of window.__taxi.level.osm.roads) {
          if (r.bridge || !/^(primary|secondary|trunk|tertiary)$/.test(r.cls)) continue;
          for (let s = 0; s < r.pts.length - 1; s++) {
            const [ax, az] = r.pts[s],
              [bx, bz] = r.pts[s + 1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < minLen) continue;
            const d = Math.hypot(ax - x, az - z);
            if (!best || d < best.d) {
              const dx = (bx - ax) / L,
                dz = (bz - az) / L;
              const lane = r.oneway ? 0 : r.w / 4;
              best = { d, x: ax + dx * 12 - dz * lane, z: az + dz * 12 + dx * lane, yaw: Math.atan2(dx, dz), L };
            }
          }
        }
        return best;
      },
    };
  });
/** a long straight street to drive on: grid city z = −90 from the west edge; real-map city the nearest main road */
const toStraight = (minLen = 140) =>
  p.evaluate((minLen) => {
    const g = window.__taxi;
    if (!g.level.osm) return g.place({ x: -300, y: 1, z: -95.5 }, Math.PI / 2), 'grid';
    const pos = g.car.body.translation();
    const s = window.__e2e.straight(pos.x, pos.z, minLen);
    g.place({ x: s.x, y: 1, z: s.z }, s.yaw);
    return s;
  }, minLen);

/** a simple driver: follows the streets to (x, z), slows for corners, stops at the end. Runs `max` seconds of game
 * time in 1/30 s frames. */
async function driveTo(target, { max = 30, stopAt = 2.5, until, untilPage, top = 75 } = {}) {
  let stuck = 0,
    backing = 0;
  const way = await route(target);
  if (!VIDEO && untilPage) {
    // the same driver run inside the page, a game second (30 frames) per call: far fewer round trips
    await p.evaluate((way, stopAt, top) => (window.__drv = { way, w: 0, stuck: 0, backing: 0, t: 0, stopAt, top }), way, stopAt, top);
    for (let t = 0; t < max; t += 1) {
      const res = await p.evaluate((untilPage, max) => {
        const D = window.__drv,
          T = window.__taxi;
        for (let k = 0; k < 30 && D.t < max; k++, D.t += 1 / 30) {
          const wp = D.way[D.w],
            last = D.w === D.way.length - 1,
            nx = D.way[D.w + 1];
          const car = T.car;
          const pos = car.body.translation();
          const f = car.forward();
          const dx = wp.x - pos.x,
            dz = wp.z - pos.z;
          const d = Math.hypot(dx, dz);
          const ang = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
          const kmh = car.kmh();
          let turn = 0;
          if (nx) turn = Math.abs(Math.atan2(dx * (nx.z - wp.z) - dz * (nx.x - wp.x), dx * (nx.x - wp.x) + dz * (nx.z - wp.z)));
          let want = last ? Math.min(D.top, Math.max(6, d * 2.2)) : turn > 0.5 ? Math.min(D.top, Math.max(28, d * 1.6)) : D.top;
          if (Math.abs(ang) > 0.8) want *= 0.5;
          let c;
          if (last && d < D.stopAt) c = { throttle: 0, brake: kmh > 1 ? 1 : 0, steer: 0 };
          else {
            c = { throttle: kmh < want ? 1 : 0, brake: kmh > want + 12 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 2)) };
            if (!last && d < 7) D.w++;
          }
          D.stuck = c.throttle && kmh < 2 ? D.stuck + 1 / 30 : 0;
          if (D.stuck > 0.8) D.backing = 1.2;
          if (D.backing > 0) {
            D.backing -= 1 / 30;
            D.stuck = 0;
            c = { throttle: 0, brake: 1, steer: -c.steer };
          }
          T.ff(1 / 30, c);
          const r = T.run();
          if (untilPage === 'rider' ? !!r?.rider : r?.rides === 1) return true;
        }
        return false;
      }, untilPage, max);
      if (res) return true;
    }
    return false;
  }
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
  await p.goto(PAGE(TRACK), { waitUntil: 'networkidle0', timeout: 180000 });
  await p.waitForFunction(() => document.querySelector('[data-testid=taxi]')?.dataset.state === 'ready', { timeout: 180000 });
  // the live loop is stopped (paused) so only our hand steps move the game
  await p.evaluate(() => window.__taxi.setPaused(true));
  const OSM = await p.evaluate(() => !!window.__taxi.level.osm);
  if (OSM) await osmHelpers();
  await ff(0.5);
  await settle();
  await shot('1-menu');
  // the menu's aerial orbit sees the most of the city: the heaviest view at load
  const menuSt = await p.evaluate(() => window.__taxi.stats());
  ok('P-01', 'menu orbit view: draw calls under 150, triangles at most 320k', menuSt.drawCalls < 150 && menuSt.triangles <= 320000, JSON.stringify(menuSt));
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
  const spawnSt = await p.evaluate(() => window.__taxi.stats());
  ok('P-02', 'spawn view: draw calls under 150, triangles at most 320k', spawnSt.drawCalls < 150 && spawnSt.triangles <= 320000, JSON.stringify(spawnSt));
  // real-map city: the road name under the speed and the district name at the foot of the minimap (2 s, polite)
  if (OSM) {
    await new Promise((res) => setTimeout(res, 700));
    const where = () =>
      p.evaluate(() => {
        const box = (e) => e && e.getBoundingClientRect();
        const road = document.querySelector('[data-testid=taxi-road]');
        const dist = document.querySelector('[data-testid=taxi-district]');
        const speed = box(document.querySelector('.taxi-speed'));
        const map = box(document.querySelector('[data-testid=taxi-minimap]'));
        const d = box(dist);
        const controls = [...document.querySelectorAll('.taxi-gas, .taxi-brake, .taxi-drift, .taxi-rush, .taxi-stick-base, .taxi-time, .taxi-home, .taxi-reset, .taxi-pause, .taxi-rider, .taxi-arrow')].filter((e) => { const b = e.getBoundingClientRect(); return d && b.width && !(b.right <= d.left || b.left >= d.right || b.bottom <= d.top || b.top >= d.bottom); }).map((e) => e.className);
        return {
          road: road?.textContent ?? null,
          roadUnderSpeed: !!(road && speed && box(road).top >= speed.bottom - 1),
          district: dist?.dataset.zh ?? null,
          text: dist?.textContent ?? null,
          live: dist?.parentElement?.getAttribute('aria-live') ?? null,
          inMap: !!(d && map && d.left >= map.left - 1 && d.right <= map.right + 1 && d.bottom <= map.bottom + 1),
          controls,
        };
      });
    // the label from the start of the run has gone by now (2 s of real time; hand steps are slow): read the road,
    // then drive into another district (landmark by landmark until the label names a new one), then wait it out
    const w0 = await where();
    await p.screenshot({ path: `${OUT}/2c-minimap-crop.png`, clip: { x: 0, y: 140, width: 260, height: 180 } });
    const startDistrict = await p.evaluate(() => document.querySelector('.taxi-district')?.dataset.zh ?? null);
    if (startDistrict) await new Promise((res) => setTimeout(res, 2400));
    let w2 = null;
    const n = await p.evaluate(() => window.__taxi.level.osm.landmarks.length);
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const moved = await p.evaluate((i) => {
        const lm = window.__taxi.level.osm.landmarks[i];
        const h = window.__e2e.near(lm.x, lm.z, (r) => !r.bridge);
        if (!h || h.d > 120) return false;
        window.__taxi.place({ x: h.x, y: 1, z: h.z }, Math.atan2(h.dx, h.dz));
        return true;
      }, i);
      if (!moved) continue;
      await ff(1 / 30);
      await new Promise((res) => setTimeout(res, 500));
      const w = await where();
      // a label is up: the cab entered a district different from the last one
      if (w.district) {
        seen.add(w.district);
        w2 = w;
        break;
      }
    }
    await shot('2d-district');
    await new Promise((res) => setTimeout(res, 2400));
    const w3 = await where();
    ok('X-27', 'real-map city: the road name under the speed; entering another district shows its name (polite live region) at the foot of the minimap, clear of the controls, gone after ~2 s', w0.road && w0.roadUnderSpeed && w2?.district && w2.text && w2.live === 'polite' && w2.inMap && w2.controls.length === 0 && !w3.district, JSON.stringify({ w0, startDistrict, w2, w3, seen: [...seen] }));
    // back to the spawn for the drive to the first passenger
    await p.evaluate(() => { const s = window.__taxi.level.spawn; window.__taxi.place(s.p, s.yaw); });
    await ff(1 / 30);
  }
  // the minimap: visible during an arcade run, never takes touches, and clear of the pedals, the stick, the clock and
  // the top buttons, on the iPad and on a phone held sideways (844 × 390)
  const mapCheck = () =>
    p.evaluate(() => {
      const m = document.querySelector('[data-testid=taxi-minimap]');
      if (!m) return { found: false };
      const r = m.getBoundingClientRect();
      const hits = (sel) => [...document.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return b.width && !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom); }).map((e) => e.className);
      return { found: true, w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom), pe: getComputedStyle(m).pointerEvents, hidden: m.getAttribute('aria-hidden'), drawn: m.querySelector('canvas')?.dataset.drawn === '1', overlaps: hits('.taxi-gas, .taxi-brake, .taxi-drift, .taxi-rush, .taxi-stick-base, .taxi-time, .taxi-home, .taxi-reset, .taxi-pause, .taxi-rider, .taxi-arrow') };
    });
  await p.waitForFunction(() => document.querySelector('[data-testid=taxi-minimap] canvas')?.dataset.drawn === '1', { timeout: 20000 }).catch(() => null);
  const mapPad = await mapCheck();
  await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await new Promise((res) => setTimeout(res, 300));
  await shot('2b-phone-minimap');
  const mapPhone = await mapCheck();
  await p.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await new Promise((res) => setTimeout(res, 200));
  const mapOk = (m) => m.found && m.w >= 100 && m.pe === 'none' && m.hidden === 'true' && m.drawn && m.overlaps.length === 0;
  ok('X-25', 'minimap: visible during an arcade run, no touches, clear of the pedals, stick and top controls (iPad and phone)', mapOk(mapPad) && mapOk(mapPhone), JSON.stringify({ pad: mapPad, phone: mapPhone }));
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
  const picked = await driveTo(nearest, { max: 30, untilPage: 'rider', until: async () => !!(await run()).rider });
  await settle();
  r = await run();
  await new Promise((res) => setTimeout(res, 300));
  const pop = await p.evaluate(() => window.__popLog.join(' | '));
  ok('X-03', 'a simple driver reaches the first passenger and stops in the circle: picked up within 30 s; the destination name and seconds pop up', picked && r.first !== null && r.first < 30 && pop.includes(r.rider.dest.name.zh), `picked at ${r.first?.toFixed(1)} s, pop "${pop.replace(/\n/g, ' ')}"`);
  await shot('3-pickup');
  ok('X-04', 'carrying: the arrow turns green to the destination, the passenger timer bar shows', (await p.$eval('[data-testid=taxi-arrow]', (e) => e.dataset.to)) === 'dest' && !!(await p.$('[data-testid=taxi-rider]')));
  // stunt: a drift with the passenger aboard builds the combo and pays tips
  const money0 = r.money;
  // on a long straight street (grid city: z = −90 from the west edge; real map: the nearest long main road; test
  // ground: the plaza) so the slide has room
  const city = await p.evaluate(() => window.__taxi.level.id === 'city');
  if (city) await toStraight();
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
    if (window.__taxi.level.osm) {
      // real map: 45 m back along the destination's road (the other way when the road is shorter), same side
      const h = window.__e2e.near(d.x, d.z, (r) => !r.bridge);
      const lat = (d.x - h.x) * -h.dz + (d.z - h.z) * h.dx;
      const walk = (dir) => {
        const pts = h.r.pts;
        let x = h.x, z = h.z, left = 45, i = dir < 0 ? h.s : h.s + 1;
        while (left > 0 && i >= 0 && i < pts.length) {
          const [px, pz] = pts[i];
          const L = Math.hypot(px - x, pz - z);
          if (L >= left) return { x: x + ((px - x) * left) / L, z: z + ((pz - z) * left) / L };
          (left -= L), (x = px), (z = pz), (i += dir);
        }
        return left < 15 ? { x, z } : null;
      };
      const from = walk(-1) ?? walk(1) ?? { x: h.x - h.dx * 45, z: h.z - h.dz * 45 };
      // the same lateral offset as the stop, so the cab is in the stop's lane
      const n2 = window.__e2e.near(from.x, from.z, (r) => r === h.r);
      const fx = from.x - n2.dz * lat,
        fz = from.z + n2.dx * lat;
      window.__taxi.place({ x: fx, y: 1, z: fz }, Math.atan2(d.x - fx, d.z - fz));
      return;
    }
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
  const dropped = await driveTo(dest, { max: OSM ? 25 : 15, stopAt: 2, untilPage: 'rides1', until: async () => (await run()).rides === 1 });
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
  const credit = await p.$eval('[data-testid=taxi-osm-credit]', (a) => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent, h: a.getBoundingClientRect().height })).catch(() => null);
  ok('X-28', 'help: the OpenStreetMap credit links to the copyright page in a new tab (ODbL), 44 px tall', credit && credit.href === 'https://www.openstreetmap.org/copyright' && credit.target === '_blank' && /noopener/.test(credit.rel) && /OpenStreetMap/.test(credit.text) && credit.h >= 44, JSON.stringify(credit));
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
  await toStraight();
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
  const world = await p.evaluate(() => {
    const L = window.__taxi.level;
    return { id: L.id, osm: !!L.osm, places: L.places.length, cars: window.__taxi.traffic?.cars.length ?? 0, people: window.__taxi.people?.list.length ?? 0, bridges: L.signs.filter((s) => s.decor).length, bridgeRoads: L.osm?.roads.filter((r) => r.bridge).length ?? 0, rails: L.shapes.filter((s) => /^br\d/.test(s.id)).length, districts: L.osm?.districts.length ?? 0, stops: L.stops.length };
  });
  if (world.osm) ok('X-14', 'the real-map city: at least 30 landmark destinations, 8 districts, traffic, stops along the streets, railed bridges', world.id === 'city' && world.places >= 30 && world.districts === 8 && world.cars >= 20 && world.stops >= 100 && world.bridgeRoads > 0 && world.rails >= world.bridgeRoads * 2, JSON.stringify(world));
  else ok('X-14', 'the city: at least 30 destinations, traffic and people on the streets, the Love River named at the bridges', world.id === 'city' && world.places >= 30 && world.cars >= 20 && world.people >= 40 && world.bridges === 8, JSON.stringify(world));
  const st = await p.evaluate(() => window.__taxi.stats());
  ok('X-13', 'draw calls under 150', st.drawCalls < 150, JSON.stringify(st));
  // chase camera vs the landmark name boards: drive past the 郵局 board both ways along its street; at every step
  // nothing drawn opaque may sit between the lens and the cab, and no board may fill the lens up close
  {
    const pass = [];
    for (const dirSign of [1, -1]) {
      const at = await p.evaluate((dirSign) => {
        const g = window.__taxi;
        if (g.level.osm) {
          // real map: the first landmark board on a long enough straight road piece; drive along the road past it
          for (const pl of g.level.places) {
            const s = g.level.signs.find((x) => x.id === pl.id);
            const h = s && window.__e2e.near(pl.x, pl.z, (r) => !r.bridge);
            if (!h || h.L < 60 || h.t * h.L < 25 || (1 - h.t) * h.L < 25) continue;
            const ax = h.dx * dirSign,
              az = h.dz * dirSign;
            g.place({ x: pl.x - ax * 22, y: 1, z: pl.z - az * 22 }, Math.atan2(ax, az));
            return { sx: s.x, sz: s.z, id: pl.id };
          }
        }
        const s = g.level.signs.find((x) => x.id === 'post');
        const pl = g.level.places.find((x) => x.id === 'post');
        const ax = Math.sin(s.yaw) * dirSign,
          az = Math.cos(s.yaw) * dirSign;
        g.place({ x: pl.x - ax * 22, y: 1, z: pl.z - az * 22 }, Math.atan2(ax, az));
        return { sx: s.x, sz: s.z, id: 'post' };
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
      pass.push({ dir: dirSign, board: at.id, ...worst, carToBoard: +closest.toFixed(1) });
    }
    ok('X-26', 'chase camera: no board, landmark or wall hides the cab when driving past a name board', pass.every((x) => x.blocked === 0 && x.nearHits === 0 && x.carToBoard < 25), JSON.stringify(pass));
  }
  // ---------------- the old grid city (?track=grid): the key checks ----------------
  if (!TRACK) {
    await p.close();
    p = await newPage();
    await p.goto(PAGE('grid'), { waitUntil: 'networkidle0', timeout: 180000 });
    await p.waitForFunction(() => document.querySelector('[data-testid=taxi]')?.dataset.state === 'ready', { timeout: 180000 });
    await p.evaluate(() => window.__taxi.setPaused(true));
    await ff(0.5);
    const gMenu = await p.evaluate(() => ({ osm: !!window.__taxi.level.osm, id: window.__taxi.level.id, places: window.__taxi.level.places.length, bridges: window.__taxi.level.signs.filter((s) => s.decor).length, ...window.__taxi.stats() }));
    ok('G-01', 'grid city: loads as the hand-made city (no OSM data), 8 bridge boards, menu under 150 draw calls', !gMenu.osm && gMenu.id === 'city' && gMenu.places >= 30 && gMenu.bridges === 8 && gMenu.drawCalls < 150, JSON.stringify(gMenu));
    await p.click('[data-testid=taxi-start-arcade]');
    await p.waitForSelector('[data-testid=taxi-garage]');
    await p.click('[data-testid=taxi-go]');
    await p.evaluate(() => window.__taxi.setPaused(true));
    await ff(1 / 30);
    await settle();
    r = await run();
    // the minimap draws on its own animation frames: wait for the first picture (a busy machine can take a while)
    await p.waitForFunction(() => document.querySelector('[data-testid=taxi-minimap] canvas')?.dataset.drawn === '1', { timeout: 20000 }).catch(() => null);
    const gMap = await mapCheck();
    const gSt = await p.evaluate(() => window.__taxi.stats());
    ok('G-02', 'grid city: arcade starts (50 s, five waiting), the minimap is drawn and clear of the controls, no district or road label, under 150 draw calls', r.time > 49.5 && r.waiting.length === 5 && mapOk(gMap) && !(await p.$('[data-testid=taxi-district]')) && !(await p.$('[data-testid=taxi-road]')) && gSt.drawCalls < 150, JSON.stringify({ map: gMap, st: gSt }));
    await shot('g1-start');
    const gsp = await p.evaluate(() => window.__taxi.level.spawn.p);
    const gNear = r.waiting.reduce((a, b) => (Math.hypot(a.x - gsp.x, a.z - gsp.z) < Math.hypot(b.x - gsp.x, b.z - gsp.z) ? a : b));
    const gPicked = await driveTo(gNear, { max: 30, untilPage: 'rider', until: async () => !!(await run()).rider });
    r = await run();
    ok('G-03', 'grid city: the simple driver picks up the nearest passenger within 30 s', gPicked && r.first !== null && r.first < 30, `picked at ${r.first?.toFixed(1)} s`);
    await shot('g2-pickup');
  }
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((x) => x.pass).length, failed: results.filter((x) => !x.pass).length, results }, null, 2));
  console.log(`${results.filter((x) => x.pass).length}/${results.length} passed`);
}
