// Rush Taxi: quick check of the real-map city. Loads /taxi, starts an arcade run, drives a few seconds with the
// deterministic step, and records draw calls, triangles, page errors and screenshots (menu, start, a few views).
// Usage: node taxi-osm-smoke.mjs <baseUrl> [outDir] [query]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? '/tmp/claude-0/osm-smoke';
const Q = process.argv[4] ?? '';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a)), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  headless: true,
  protocolTimeout: 600000,
});
const errors = [];
const p = await browser.newPage();
await p.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const ff = (s, c = {}) => p.evaluate((s, c) => window.__taxi.ff(s, c), s, c);
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const out = {};
try {
  const t0 = Date.now();
  await p.goto(`${BASE}/taxi${Q}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.querySelector('[data-testid=taxi]')?.dataset.state === 'ready', { timeout: 120000 });
  out.loadMs = Date.now() - t0;
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(0.5);
  await shot('1-menu');
  await p.click('[data-testid=taxi-start-arcade]');
  await p.waitForSelector('[data-testid=taxi-go]');
  await p.click('[data-testid=taxi-go]');
  await p.evaluate(() => window.__taxi.setPaused(true));
  await ff(0.5);
  await shot('2-start');
  out.level = await p.evaluate(() => ({ places: window.__taxi.level.places.length, stops: window.__taxi.level.stops.length, shapes: window.__taxi.level.shapes.length, cars: window.__taxi.traffic?.cars.length ?? 0 }));
  out.stats0 = await p.evaluate(() => window.__taxi.stats());
  for (let i = 0; i < 90; i++) await ff(1 / 30, { throttle: 1, steer: 0 });
  await shot('3-drive');
  out.car = await p.evaluate(() => { const t = window.__taxi.car.body.translation(); return { x: t.x, y: t.y, z: t.z, kmh: window.__taxi.car.kmh() }; });
  out.stats1 = await p.evaluate(() => window.__taxi.stats());
} catch (e) {
  errors.push('script: ' + String(e));
}
out.errors = errors.slice(0, 10);
writeFileSync(`${OUT}/smoke.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
await browser.close();
