// Math Island batch B — Clock Repair, Multiplication Garden, Number-Line Frog browser checks (desktop + phone Chromium).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node math-batch-b-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/math-batch-b';
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
async function page(w = 1280, h = 1000, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme ?? 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|NotSupportedError|no supported source/i.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const GAMES = { clock: '/math/g1/clock', garden: '/math/g2/garden', frog: '/math/g3/frog' };
const open = async (p, game, lang = '') => {
  await p.goto(`${BASE}${lang}${GAMES[game]}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector(`[data-testid=mi-${game}]`);
};
const at = (p) => p.$$eval('[data-testid^=mi-item-]', (els) => els.map((e) => [Number(e.dataset.testid.slice(8)), Number(e.dataset.at)]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
const tap = (p, sel) => p.$eval(sel, (e) => e.click());
const put = async (p, i, target) => {
  await tap(p, `[data-testid=mi-item-${i}]`);
  await p.waitForSelector('[data-testid=mi-held]');
  await tap(p, `[data-testid=${target}]`);
};
const msg = (p) => p.$eval('[data-testid=mi-msg]', (e) => [e.dataset.kind, e.textContent]).catch(() => [null, '']);
const data = (p, game) => p.$eval(`[data-testid=mi-${game}]`, (e) => ({ ...e.dataset }));
const center = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
async function dragTo(p, from, to) {
  await p.$eval(from, (e) => e.scrollIntoView({ block: 'center' }));
  const a = await center(p, from);
  const b = await center(p, to);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  for (let k = 1; k <= 8; k++) await p.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  await p.mouse.up();
  await sleep(250);
}
const answer = async (p) => {
  // the solved state is the only thing that shows "next"; pick the right choice by trying the visible ones
  for (const id of await p.$$eval('[data-testid^=mi-answer-]', (e) => e.map((x) => x.dataset.testid))) {
    await tap(p, `[data-testid=${id}]`);
    await sleep(60);
    if (await p.$('[data-testid=mi-next]')) return id.slice(10);
  }
  return null;
};
const layout = (p) =>
  p.evaluate(() => {
    const small = [...document.querySelectorAll('.mi button, .mi a')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.width < 44 || r.height < 44);
    }).map((e) => e.dataset.testid || e.textContent.trim().slice(0, 12));
    return { side: document.documentElement.scrollWidth > innerWidth, small };
  });


/** turn the clock face by `turns` full turns (negative = backwards) with a real mouse, from 12 o'clock */
async function rotate(p, turns, steps = 24) {
  await p.$eval('[data-testid=mi-face]', (e) => e.scrollIntoView({ block: 'center' }));
  const r = await p.$eval('[data-testid=mi-face]', (e) => { const b = e.getBoundingClientRect(); return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, rad: b.width * 0.35 }; });
  const at = (a) => ({ x: r.x + Math.sin(a) * r.rad, y: r.y - Math.cos(a) * r.rad });
  const a0 = at(0);
  await p.mouse.move(a0.x, a0.y);
  await p.mouse.down();
  const n = Math.round(Math.abs(turns) * steps);
  for (let k = 1; k <= n; k++) { const q = at(Math.sign(turns) * (k / steps) * 2 * Math.PI); await p.mouse.move(q.x, q.y); }
  await p.mouse.up();
  await sleep(150);
}
const minutes = async (p) => Number((await data(p, 'clock')).minutes);
const deg = (p, id) => p.$eval(`[data-testid=${id}]`, (e) => Number(e.dataset.deg));

try {
  {
    const p = await page();
    await p.goto(`${BASE}/math`, { waitUntil: 'networkidle0' });
    const links = await p.$$eval('[data-testid^=mi-start-]', (e) => e.map((x) => x.dataset.testid.slice(9)));
    ok('B-01', 'the island lists eight games in grade order', links.join() === 'apple,train,shop,balance,clock,garden,factory,frog', links.join());
    for (const g of Object.keys(GAMES))
      for (const lang of ['', '/en']) {
        await open(p, g, lang);
        await p.reload({ waitUntil: 'networkidle0' });
        await p.waitForSelector(`[data-testid=mi-${g}]`);
        const robots = await p.$eval('meta[name=robots]', (m) => m.content).catch(() => 'missing');
        ok('B-02', `${lang || 'zh'} ${GAMES[g]} opens directly and after reload, indexable`, /^index/.test(robots) && /JY Games/.test(await p.title()), `${robots} | ${await p.title()}`);
      }
    await p.ctx.close();
  }

  // ---------- Clock Repair ----------
  {
    const p = await page();
    await open(p, 'clock');
    await p.screenshot({ path: `${OUT}/clock-start-1280.png`, fullPage: true });
    const m0 = await minutes(p);
    await rotate(p, 2);
    const m1 = await minutes(p);
    ok('CL-01', 'two real turns of the face move 上午 6 點 to 上午 8 點; the hour hand moved 60° (gears)', m0 === 360 && m1 === 480 && (await deg(p, 'mi-hour-hand')) === 240 && (await deg(p, 'mi-minute-hand')) === 0, `${m0}→${m1} hour=${await deg(p, 'mi-hour-hand')}`);
    await tap(p, '[data-testid=mi-check]');
    ok('CL-02', '上午 8 點 is accepted', !!(await p.$('[data-testid=mi-next]')) && /上午 8 點/.test((await msg(p))[1]));
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // problem 2: 上午 11 點 → 下午 1 點半, crossing noon
    const am = (await p.$eval('[data-testid=mi-daypart]', (e) => e.dataset.pm)) === 'false';
    await rotate(p, 1.5);
    await tap(p, '[data-testid=mi-check]');
    const wrong = await msg(p);
    await rotate(p, 1);
    const pm = (await p.$eval('[data-testid=mi-daypart]', (e) => e.dataset.pm)) === 'true';
    ok('CL-03', 'turning past 12 switches 上午 to 下午; a wrong time is read back to the child', am && pm && wrong[0] === 'hint' && /現在時鐘是 下午 12 點半/.test(wrong[1]), wrong[1]);
    await tap(p, '[data-testid=mi-check]');
    ok('CL-04', '下午 1 點半 is accepted', !!(await p.$('[data-testid=mi-next]')));
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // problem 3 by the step buttons: 8:00 → 9:15 is 15 steps of 5 minutes
    for (let k = 0; k < 15; k++) await tap(p, '[data-testid=mi-fwd-step]');
    await tap(p, '[data-testid=mi-check]');
    ok('CL-05', 'the step buttons move 5 minutes each (15 steps: 上午 9 點 15 分)', !!(await p.$('[data-testid=mi-next]')), String(await minutes(p)));
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // problem 4 by keyboard: 下午 2 點 → 下午 4 點 50 分 (PageUp twice, then 10 × 5 minutes)
    await p.$eval('[data-testid=mi-face]', (e) => e.focus());
    await p.keyboard.press('PageUp');
    await p.keyboard.press('PageUp');
    for (let k = 0; k < 10; k++) await p.keyboard.press('ArrowRight');
    await sleep(80);
    const h = await deg(p, 'mi-hour-hand');
    await p.screenshot({ path: `${OUT}/clock-450-1280.png`, fullPage: true });
    await tap(p, '[data-testid=mi-check]');
    ok('CL-06', 'keyboard sets 下午 4 點 50 分; the short hand is between 4 and 5 (145°), not on 5', h === 145 && !!(await p.$('[data-testid=mi-next]')), `hour=${h}`);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    for (let k = 0; k < 37; k++) await tap(p, '[data-testid=mi-fwd-step]');
    await tap(p, '[data-testid=mi-check]');
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForSelector('[data-testid=mi-clock]');
    const d = await data(p, 'clock');
    ok('CL-07', '1-minute steps reach 上午 10 點 37 分; reload keeps the solved problem', d.index === '4' && d.solved === 'true', JSON.stringify(d));
    await tap(p, '[data-testid=mi-next]');
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('CL-08', 'all five end on the summary', /下午 4 點 50 分/.test(await p.$eval('[data-testid=mi-finished] ul', (e) => e.textContent)));
    await p.ctx.close();
  }

  // ---------- Multiplication Garden ----------
  {
    const p = await page();
    await open(p, 'garden');
    const cell = async (r, c) => p.$eval('[data-testid=mi-bed]', (e, r, c) => { const b = e.getBoundingClientRect(); const w = b.width / 8, h = b.height / 8; return { x: b.left + (c - 0.5) * w, y: b.top + (r - 0.5) * h }; }, r, c);
    await p.$eval('[data-testid=mi-bed]', (e) => e.scrollIntoView({ block: 'center' }));
    const a = await cell(1, 1);
    const b = await cell(3, 4);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    for (let k = 1; k <= 6; k++) await p.mouse.move(a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6);
    await p.mouse.up();
    await sleep(100);
    const d1 = await data(p, 'garden');
    const flowers = await p.$$eval('[data-testid=mi-bed] [data-on=true]', (e) => e.length);
    ok('GA-01', 'a real drag from the corner pulls out 3 rows of 4 (12 flowers drawn)', d1.rows === '3' && d1.cols === '4' && flowers === 12, JSON.stringify(d1));
    await tap(p, '[data-testid=mi-plant]');
    const eq = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await tap(p, '[data-testid=mi-answer-11]');
    const w = await msg(p);
    await tap(p, '[data-testid=mi-answer-12]');
    const eq2 = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    await tap(p, '[data-testid=mi-turn]');
    const turned = await p.$eval('[data-testid=mi-task]', (e) => e.textContent);
    const same = await p.$eval('[data-testid=mi-same]', (e) => e.textContent);
    ok('GA-02', 'planted: "4 × 3 = ?" (each row × rows); 11 is wrong, 12 right; "turn" shows 3 × 4 = 12, same flowers', eq === '4 × 3 = ?' && w[0] === 'hint' && eq2 === '4 × 3 = 12' && turned === '3 × 4 = 12' && /一樣多/.test(same), `${eq} | ${eq2} | ${turned}`);
    await p.screenshot({ path: `${OUT}/garden-turned-1280.png`, fullPage: true });
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // problem 2 with the steppers: 5 in each row, 2 rows; first a wrong shape
    for (let k = 0; k < 2; k++) await tap(p, '[data-testid=mi-rows-more]');
    for (let k = 0; k < 3; k++) await tap(p, '[data-testid=mi-cols-more]'); // rows+ already made it 1 in each row
    await tap(p, '[data-testid=mi-plant]');
    const shape = await msg(p);
    await tap(p, '[data-testid=mi-cols-more]');
    await tap(p, '[data-testid=mi-plant]');
    await tap(p, '[data-testid=mi-answer-10]');
    ok('GA-03', 'steppers: 4 in each row is "再看看每排幾朵"; 5 × 2 = 10 accepted', /再看看每排幾朵/.test(shape[1]) && !!(await p.$('[data-testid=mi-next]')), shape[1]);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // problem 3: two ways of 12 by tapping squares
    const tapCell = async (r, c) => { const q = await cell(r, c); await p.mouse.click(q.x, q.y); await sleep(60); };
    await tapCell(2, 5);
    await tap(p, '[data-testid=mi-plant]');
    const ne = await msg(p);
    await tapCell(2, 6);
    await tap(p, '[data-testid=mi-plant]');
    const one = await msg(p);
    await tapCell(2, 6);
    await tap(p, '[data-testid=mi-plant]');
    const again = await msg(p);
    await tapCell(4, 3);
    await tap(p, '[data-testid=mi-plant]');
    ok('GA-04', '12 in equal rows: 10 is refused, 6 × 2 found, the same again is refused, 3 × 4 completes it', /剛好 12 朵/.test(ne[1]) && /再找一種/.test(one[1]) && /換一種/.test(again[1]) && !!(await p.$('[data-testid=mi-next]')), `${ne[1]} | ${one[1]} | ${again[1]}`);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // keyboard: 3 in each row, 6 rows
    await p.focus('[data-testid=mi-bed]');
    for (let k = 0; k < 2; k++) await p.keyboard.press('ArrowRight');
    for (let k = 0; k < 5; k++) await p.keyboard.press('ArrowDown');
    await sleep(80);
    const d4 = await data(p, 'garden');
    await tap(p, '[data-testid=mi-plant]');
    await tap(p, '[data-testid=mi-answer-18]');
    ok('GA-05', 'keyboard arrows grow the bed to 3 × 6; 18 accepted', d4.cols === '3' && d4.rows === '6' && !!(await p.$('[data-testid=mi-next]')), JSON.stringify(d4));
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    await tapCell(4, 7);
    await tap(p, '[data-testid=mi-plant]');
    const split = await p.$eval('[data-testid=mi-split]', (e) => e.textContent);
    await p.screenshot({ path: `${OUT}/garden-split-1280.png`, fullPage: true });
    await tap(p, '[data-testid=mi-answer-28]');
    ok('GA-06', '7 × 4 shows the fence "5 × 4 ＋ 2 × 4" and 28 is accepted', /5 × 4 ＋ 2 × 4/.test(split) && /20 加 8/.test((await msg(p))[1]), split);
    await tap(p, '[data-testid=mi-next]');
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('GA-07', 'all five end on the summary', /7 × 4 = 28/.test(await p.$eval('[data-testid=mi-finished] ul', (e) => e.textContent)));
    await p.ctx.close();
  }

  // ---------- Number-Line Frog ----------
  {
    const p = await page();
    await open(p, 'frog');
    const xAt = (v, max) => p.$eval('[data-testid=mi-line]', (e, v, max) => { const b = e.getBoundingClientRect(); const W = Number(e.dataset.w); return { x: b.left + ((40 + (v / max) * (W - 80)) / W) * b.width, y: b.top + b.height * 0.68 }; }, v, max);
    const tapAt = async (v, max) => { const q = await xAt(v, max); await p.mouse.click(q.x, q.y); await sleep(80); };
    await tap(p, '[data-testid=mi-go]');
    const none = await msg(p);
    await tapAt(13, 20);
    await tap(p, '[data-testid=mi-go]');
    const five = await msg(p);
    ok('FR-01', 'jumping with no mark asks for one; marking 13 says it takes 5 jumps, not 4', /先點數線/.test(none[1]) && /要跳 5 次，題目是跳 4 次/.test(five[1]) && (await data(p, 'frog')).pick === '13', five[1]);
    await tap(p, '[data-testid=mi-pick-left]');
    await tap(p, '[data-testid=mi-go]');
    const off = await msg(p);
    await tap(p, '[data-testid=mi-pick-left]');
    await tap(p, '[data-testid=mi-go]');
    await sleep(1100);
    const hops = await p.$$eval('[data-testid=mi-hop]', (e) => e.length);
    const at = await p.$eval('[data-testid=mi-frog-at]', (e) => e.dataset.v);
    ok('FR-02', '12 cannot be reached by jumps of 2; 11 is right and the frog makes 4 arcs to 11', /跳不到/.test(off[1]) && hops === 4 && at === '11', `${off[1]} hops=${hops} at=${at}`);
    await p.screenshot({ path: `${OUT}/frog-solved-1280.png`, fullPage: true });
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    await tapAt(18, 20);
    await tap(p, '[data-testid=mi-go]');
    const way = await msg(p);
    await tapAt(6, 20);
    await tap(p, '[data-testid=mi-go]');
    ok('FR-03', '15 jumping left: a mark to the right says "看看往哪一邊跳"; 6 is right', /哪一邊/.test(way[1]) && !!(await p.$('[data-testid=mi-next]')), way[1]);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    // keyboard on the line: 30 + 10 × 4
    await p.$eval('[data-testid=mi-line]', (e) => e.focus());
    for (let k = 0; k < 4; k++) await p.keyboard.press('ArrowRight'); // the first press marks one step right of the start (30)
    await sleep(60);
    const kpick = (await data(p, 'frog')).pick;
    await p.keyboard.press('Enter');
    await sleep(80);
    ok('FR-04', 'keyboard: arrows move the mark from the start, Enter jumps (70 accepted)', kpick === '70' && !!(await p.$('[data-testid=mi-next]')), kpick);
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    await tapAt(800, 1000);
    await tap(p, '[data-testid=mi-go]');
    await tap(p, '[data-testid=mi-next]');
    await sleep(100);
    await tapAt(60, 100);
    await tap(p, '[data-testid=mi-go]');
    ok('FR-05', 'the line labelled only at 0 and 100: 60 is right', !!(await p.$('[data-testid=mi-next]')));
    await tap(p, '[data-testid=mi-next]');
    await p.waitForSelector('[data-testid=mi-finished]');
    ok('FR-06', 'all five end on the summary', /200 \+ 200 × 3 = 800/.test(await p.$eval('[data-testid=mi-finished] ul', (e) => e.textContent)));
    await p.ctx.close();
  }

  // ---------- phone layout and a finger on each game ----------
  for (const g of Object.keys(GAMES)) {
    const p = await page(390, 844, { touch: true, dpr: 2, scheme: g === 'garden' ? 'dark' : 'light' });
    await open(p, g);
    const l = await layout(p);
    await p.screenshot({ path: `${OUT}/${g}-390${g === 'garden' ? '-dark' : ''}.png`, fullPage: true });
    ok('B-03', `phone 390: ${g} has no sideways scroll and every control is at least 44 px`, !l.side && l.small.length === 0, JSON.stringify(l));
    const cdp = await p.target().createCDPSession();
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    const sel = g === 'clock' ? '[data-testid=mi-face]' : g === 'garden' ? '[data-testid=mi-bed]' : '[data-testid=mi-line]';
    await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
    const b = await p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, W: Number(e.dataset.w) || 1000 }; });
    let path;
    if (g === 'clock') { const cx = b.l + b.w / 2, cy = b.t + b.h / 2, rad = b.w * 0.35; path = Array.from({ length: 13 }, (_, k) => [cx + Math.sin((k / 12) * Math.PI) * rad, cy - Math.cos((k / 12) * Math.PI) * rad]); } // half a turn
    else if (g === 'garden') path = Array.from({ length: 7 }, (_, k) => [b.l + (b.w / 8) * (0.5 + (k / 6) * 2), b.t + (b.h / 8) * (0.5 + (k / 6) * 1)]); // to row 2, col 3
    else path = [[b.l + b.w * ((40 + (11 / 20) * (b.W - 80)) / b.W), b.t + b.h * 0.68]];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(...path[0]) });
    for (const q of path.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(...q) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
    const d = await data(p, g);
    const okMove = g === 'clock' ? d.minutes === '390' : g === 'garden' ? d.rows === '2' && d.cols === '3' : d.pick === '11';
    ok('B-04', `phone 390: ${g} — a finger ${g === 'clock' ? 'turns half a turn (6:00 → 6:30)' : g === 'garden' ? 'pulls out 2 rows of 3' : 'marks 11'}`, okMove, JSON.stringify(d));
    await p.ctx.close();
  }
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
