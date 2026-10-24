// Rush Taxi real map: traffic views. Puts the taxi at a stop line in front of a signalled junction downtown and on
// a side street, lets the traffic run, and records draw calls, triangles, cars near the taxi and screenshots.
// Usage: node taxi-osm-traffic-views.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? '/tmp/claude-0/osm-traffic-views';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a)), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  headless: true,
  protocolTimeout: 600000,
});
const errors = [];
const p = await browser.newPage();
p.setDefaultNavigationTimeout(300000);
p.setDefaultTimeout(300000);
await p.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const ff = (s, c = {}) => p.evaluate((s, c) => window.__taxi.ff(s, c), s, c);
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const out = { views: [] };
try {
  await p.goto(`${BASE}/taxi`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.querySelector('[data-testid=taxi]')?.dataset.state === 'ready', { timeout: 120000 });
  await p.click('[data-testid=taxi-start-arcade]');
  await p.waitForSelector('[data-testid=taxi-go]');
  await p.click('[data-testid=taxi-go]');
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(0.5);
  out.spawn = await p.evaluate(() => ({ ...window.__taxi.stats(), signals: window.__taxi.level.signals?.length ?? 0, walks: window.__taxi.level.walks.length, cars: window.__taxi.traffic?.cars.length, people: window.__taxi.people?.list.length }));
  await shot('t0-spawn');
  // views: a signalled approach on the biggest roads near the middle, then a side street
  const picks = await p.evaluate(() => {
    const L = window.__taxi.level;
    const net = L.roadnet;
    const sig = net.lanes.filter((l) => l.signal && l.rank >= 4 && l.len > 40).sort((a, b) => Math.hypot(...a.pts[0]) - Math.hypot(...b.pts[0]));
    const side = net.lanes.filter((l) => l.yieldAt && l.rank <= 2 && l.len > 40).sort((a, b) => Math.hypot(...a.pts[0]) - Math.hypot(...b.pts[0]));
    const at = (l, back) => {
      const n = l.pts.length;
      const [ax, az] = l.pts[n - 2],
        [bx, bz] = l.pts[n - 1];
      const L2 = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L2,
        uz = (bz - az) / L2;
      return { x: bx - ux * back, z: bz - uz * back, yaw: Math.atan2(ux, uz) };
    };
    return [at(sig[0], 14), at(sig[3] ?? sig[1], 30), at(side[0], 18)];
  });
  for (const [i, v] of picks.entries()) {
    await p.evaluate((v) => window.__taxi.place({ x: v.x, y: 1, z: v.z }, v.yaw), v);
    await ff(6);
    await ff(0.2);
    const st = await p.evaluate(() => {
      const t = window.__taxi.car.body.translation();
      const near = window.__taxi.traffic.cars.filter((c) => Math.hypot(c.pos.x - t.x, c.pos.y - t.z) < 120).length;
      const ppl = window.__taxi.people.list.filter((q) => Math.hypot(q.x - t.x, q.z - t.z) < 80).length;
      return { ...window.__taxi.stats(), carsNear: near, peopleNear: ppl, x: t.x, z: t.z };
    });
    out.views.push(st);
    await shot(`t${i + 1}-view`);
  }
} catch (e) {
  errors.push('script: ' + String(e));
}
out.errors = errors.slice(0, 10);
writeFileSync(`${OUT}/views.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
await browser.close();
