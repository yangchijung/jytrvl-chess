// Planet Rescue Crew — separate-device room acceptance (each browser context = a different person).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node rescue-online-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/rescue-online';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${info}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const errors = [];
async function person(name, w = 1280, h = 900, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ]);
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && !/WebSocket/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  await p.evaluate((n) => localStorage.setItem('jychess.guestName', n), name);
  p.ctx = ctx;
  return p;
}
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 10000 });
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(80);
};
const st = (p) => p.evaluate(() => window.__rescue?.st ?? null);
const until = (p, fn, arg, timeout = 10000) => p.waitForFunction(fn, { timeout }, arg);
const seats = (p, n) => until(p, (k) => window.__rescue?.st?.seats.length === k, n);
const myCards = (p) => p.$$eval('[data-testid^=card-]', (c) => c.map((x) => x.dataset.testid.replace('card-', '')));
const roomUrl = (lang, id) => `${BASE}${lang}/rescue/room/${id}`;

// ---------- O-01 host creates a room
const a = await person('Amy');
await a.goto(`${BASE}/rescue`, { waitUntil: 'load' });
await tap(a, '[data-testid=mission-M2]'); // remember mission 2 as the starting mission
await tap(a, '[data-testid=rescue-back]');
await tap(a, '[data-testid=rescue-create]');
await a.waitForFunction(() => /\/rescue\/room\/[A-Z2-9]{6}$/.test(location.pathname), { timeout: 10000 });
await seats(a, 1);
const id = (await st(a)).id;
const s1 = await st(a);
ok('O-01', 'create a room: code, waiting-for-team hint, go disabled', /^[A-HJ-NP-Z2-9]{6}$/.test(id) && s1.missionId === 'M2' && (await a.evaluate(() => document.body.innerText.includes('至少 2 人才能出發'))) && (await a.$eval('[data-testid=rescue-go]', (b) => b.disabled)), id);

// ---------- O-02 two friends join with their own identities
const b = await person('Ben');
const c = await person('Cleo', 390, 844);
await b.goto(roomUrl('', id), { waitUntil: 'load' });
await seats(a, 2);
await c.goto(roomUrl('/en', id), { waitUntil: 'load' });
await seats(a, 3);
await seats(b, 3);
await seats(c, 3);
const cards = [await myCards(a), await myCards(b), await myCards(c)];
const names = (await st(a)).seats.map((x) => x.name);
ok('O-02', 'three people, three devices: each sees only their own card', names.join() === 'Amy,Ben,Cleo' && cards.map((x) => x.join()).join('|') === 'navigator|engineer|supplier', `${names} ${JSON.stringify(cards)}`);
await a.screenshot({ path: `${OUT}/online-amy-navigator.png`, fullPage: true });
await c.screenshot({ path: `${OUT}/online-cleo-390-en.png`, fullPage: true });

// ---------- O-03 shared plan board syncs
await tap(b, '[data-testid=select-0]');
await tap(b, '[data-testid=route-0-yellow]');
await tap(b, '[data-testid=add-plank]');
await tap(b, '[data-testid=add-battery]');
await until(a, () => window.__rescue.st.plan[0].cargo.join() === 'plank,battery');
await until(c, () => window.__rescue.st.plan[0].cargo.join() === 'plank,battery');
await tap(c, '[data-testid=select-1]');
await tap(c, '[data-testid=route-1-yellow]');
await tap(c, '[data-testid=add-panel]');
await tap(c, '[data-testid=add-cable]');
await until(a, () => window.__rescue.st.plan[1].cargo.join() === 'panel,cable');
ok('O-03', 'plan edits from any teammate appear on every device', true);

// ---------- O-04 everyone confirms their own role, then go
const cannot = await a.$eval('[data-testid=ok-engineer]', (x) => x.disabled);
await tap(a, '[data-testid=ok-navigator]');
await tap(b, '[data-testid=ok-engineer]');
await until(c, () => window.__rescue.st.oks.length === 2);
const goBefore = await c.$eval('[data-testid=rescue-go]', (x) => x.disabled);
await tap(c, '[data-testid=ok-supplier]');
await until(a, () => window.__rescue.st.oks.length === 3);
ok('O-04', 'only the holder can confirm a role; go waits for all three', cannot && goBefore && !(await a.$eval('[data-testid=rescue-go]', (x) => x.disabled)));
await tap(a, '[data-testid=rescue-go]');
await sleep(400);
const animB = (await b.$eval('[data-ok]', (e) => e.dataset.playing)) === 'true';
for (const p of [a, b, c]) await until(p, () => document.querySelector('[data-ok]')?.dataset.ok === 'true', null, 15000);
ok('O-05', 'the run plays on every device and the base lights up for all', animB && (await c.$eval('[data-testid=rescue-base]', (e) => e.dataset.lit)) === 'true');
await b.screenshot({ path: `${OUT}/online-ben-success.png`, fullPage: true });

// ---------- O-06 a fourth person watches
const d = await person('Dan');
await d.goto(roomUrl('', id), { waitUntil: 'load' });
await until(d, () => !!window.__rescue?.st);
const ds = await st(d);
ok('O-06', 'a fourth person can watch but has no seat or card', ds.mySeat === null && (await myCards(d)).length === 0 && ds.seats.length === 3);

// ---------- O-07 only the host picks the next mission
ok('O-07', 'non-host sees "waiting for the host"', (await b.evaluate(() => document.body.innerText.includes('等房主選下一個任務'))) && !(await b.$('[data-testid=rescue-next]')));
await tap(a, '[data-testid=rescue-next]');
for (const p of [a, b, c]) await until(p, () => window.__rescue.st.missionId === 'M3' && !window.__rescue.st.result);
ok('O-08', 'host moves everyone to the next mission', true);

// ---------- O-09 swap roles
await tap(a, '[data-testid=rescue-rotate]');
await until(a, () => window.__rescue.st.roles.navigator === 1);
await sleep(200);
const after = [await myCards(a), await myCards(b), await myCards(c)].map((x) => x.join()).join('|');
ok('O-09', 'swap roles: everyone gets a different card', after === 'supplier|navigator|engineer', after);

// ---------- O-10 reload keeps seat and role
await b.reload({ waitUntil: 'load' });
await until(b, () => window.__rescue?.st?.mySeat === 1);
ok('O-10', 'reload: same seat and role come back', (await myCards(b)).join() === 'navigator');

// ---------- O-11 two people: one holds two roles
const e = await person('Eve');
await e.goto(`${BASE}/rescue`, { waitUntil: 'load' });
await tap(e, '[data-testid=rescue-create]');
await e.waitForFunction(() => /\/rescue\/room\//.test(location.pathname));
await seats(e, 1);
const id2 = (await st(e)).id;
const f = await person('Finn');
await f.goto(roomUrl('', id2), { waitUntil: 'load' });
await seats(e, 2);
await seats(f, 2);
ok('O-11', 'two people: one holds two cards, the other one', (await myCards(e)).join() === 'navigator,supplier' && (await myCards(f)).join() === 'engineer');

// ---------- O-12 missing room
const g = await person('Gus');
await g.goto(roomUrl('', 'ZZZZZZ'), { waitUntil: 'load' });
await until(g, () => document.querySelector('[data-testid=rescue-connecting]')?.innerText.includes('找不到'), null, 20000).catch(() => {});
ok('O-12', 'unknown room code: clear "room not found"', (await g.$eval('[data-testid=rescue-connecting]', (x) => x.innerText).catch(() => '')).includes('找不到'));

// ---------- O-13 layout of the room on phones
{
  const fails = [];
  for (const [w, lang, scheme] of [[360, '', 'light'], [390, '/en', 'dark'], [768, '', 'dark']]) {
    const p = await person(`L${w}`, w, w < 500 ? 800 : 900, { scheme });
    await p.goto(roomUrl(lang, id2), { waitUntil: 'load' });
    await until(p, () => !!window.__rescue?.st);
    const m = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth > window.innerWidth + 1;
      const small = [...document.querySelectorAll('[data-testid=rescue] button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width && (r.width < 44 || r.height < 44);
      }).length;
      return { over, small };
    });
    if (m.over || m.small) fails.push(`${w}${lang}${scheme}:${JSON.stringify(m)}`);
    await p.screenshot({ path: `${OUT}/online-${w}-${lang ? 'en' : 'zh'}-${scheme}.png`, fullPage: true });
  }
  ok('O-13', 'room on 360/390/768 (zh/en, light/dark): no overflow, targets ≥44px', fails.length === 0, fails.join(' ; '));
}
ok('O-14', 'no console errors on any device', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
