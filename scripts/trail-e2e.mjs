// Try Again Trail — prototype browser acceptance.
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node trail-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/trail';
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
async function page(ctx, w = 1280, h = 900, opts = {}) {
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: opts.reduce ? 'reduce' : 'no-preference' },
  ]);
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  return p;
}
const go = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/trail`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=trail]');
};
const tap = async (p, sel) => {
  await p.waitForSelector(sel, { visible: true, timeout: 10000 });
  await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await p.click(sel);
  await sleep(60);
};
const prompt = (p) => p.$eval('[data-testid=trail-prompt]', (e) => e.innerText);
const st = (p) => p.$eval('[data-turn]', (e) => ({ ...e.dataset }));
const at = (p, who) => p.$eval(`[data-testid=token-${who}]`, (e) => +e.dataset.at);
const energy = (p, who) => p.$eval(`[data-testid=energy-${who}]`, (e) => +e.dataset.energy);
/** wait until it is this human player's turn (or the game is over) */
const myTurn = (p, who = 0) => p.waitForFunction((w) => {
  const d = document.querySelector('[data-turn]')?.dataset;
  return d && (d.status === 'over' || (d.turn === String(w) && document.querySelector('[data-testid=trail-rest]')));
}, { timeout: 20000 }, who);
async function humanTurn(p, path, who = 0) {
  await myTurn(p, who);
  const round0 = (await p.evaluate(() => window.__trail.game.round));
  for (const n of path) await tap(p, `[data-testid=node-${n}]`);
  const s = await p.evaluate(() => ({ turn: window.__trail.game.turn, round: window.__trail.game.round, status: window.__trail.game.status }));
  if (s.status === 'playing' && s.turn === who && s.round === round0) await tap(p, '[data-testid=trail-rest]');
}
const BEST = [[1, 4, 1, 2], [5, 7], [10, 12, 11, 9], [11, 12]];
const REST_THEN_BEST = [[], [1, 4, 1, 2, 5], [7, 10, 12, 11], [9, 11], [12]];

// ---------- T-01..04 basics
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx);
  await go(p);
  const meta = await p.$eval('meta[name=robots]', (e) => e.content).catch(() => '');
  ok('T-01', 'zh setup loads (goal, rules, modes, 3 maps), noindex', (await prompt(p)).includes('集滿 3 個徽章') && (await p.$$('[data-testid^=map-]')).length === 3 && /noindex/.test(meta), meta);
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  ok('T-02', 'not linked from home', (await p.$$eval('a[href$="/trail"]', (a) => a.length)) === 0);
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok('T-03', 'robots.txt disallows /trail', /Disallow: \/trail\n/.test(robots) && /Disallow: \/en\/trail\n/.test(robots));
  const e = await page(ctx);
  await go(e, '/en');
  ok('T-04', 'en setup loads', (await prompt(e)).includes('Get 3 badges'));
  await ctx.close();
}

// ---------- T-05..14 vs easy computer on Little Hills
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx);
  await go(p);
  ok('T-05', 'first game: you go first', (await p.evaluate(() => document.body.innerText)).includes('這局 你 先走'));
  await tap(p, '[data-testid=mode-easy]');
  await tap(p, '[data-testid=map-hills]');
  await tap(p, '[data-testid=trail-start]');
  await myTurn(p);
  const glow = await p.$$eval('[data-testid^=node-]', (b) => b.map((x) => x.dataset.testid));
  ok('T-06', 'glowing reachable spots with energy cost', glow.join() === 'node-1' && (await energy(p, 0)) === 2 && (await p.$eval('[data-testid=node-1]', (b) => b.innerText)).includes('1⚡'), glow.join());
  await tap(p, '[data-testid=node-1]');
  await tap(p, '[data-testid=node-4]');
  await sleep(150);
  const fx = await p.$('[data-testid=trail-fx]');
  ok('T-07', 'step moves explorer, apple gives +2 with floating effect', (await at(p, 0)) === 4 && (await energy(p, 0)) === 2 && !!fx, `at=${await at(p, 0)} e=${await energy(p, 0)}`);
  await tap(p, '[data-testid=trail-undo]');
  ok('T-08', 'redo this turn returns to the turn start', (await at(p, 0)) === 0 && (await energy(p, 0)) === 2);
  // play the best route; watch the computer move in steps
  await humanTurn(p, BEST[0]);
  await sleep(300);
  const cpuPrompt = await prompt(p);
  const c0 = await at(p, 1);
  await sleep(700);
  const c1 = await at(p, 1);
  ok('T-09', 'computer moves one step at a time', cpuPrompt.includes('電腦正在走') && c0 !== c1, `${c0}->${c1}`);
  await humanTurn(p, BEST[1]);
  // reload in the middle of the game
  await myTurn(p);
  const before = await p.evaluate(() => JSON.stringify(window.__trail.game.players));
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-turn]');
  const after = await p.evaluate(() => JSON.stringify(window.__trail.game.players));
  ok('T-10', 'reload keeps the game exactly', before === after);
  await humanTurn(p, BEST[2]);
  await humanTurn(p, BEST[3]);
  await p.waitForFunction(() => document.querySelector('[data-turn]')?.dataset.status === 'over', { timeout: 20000 });
  const end = await st(p);
  ok('T-11', 'best route beats the easy computer; result first', end.winner === '0' && (await prompt(p)).includes('你先到營地'), end.winner);
  const endBtns = await p.$$eval('[data-testid=trail-end] button', (b) => b.map((x) => x.innerText.trim()));
  ok('T-12', 'ending offers break / look back / try again (+ optional thanks)', ['休息一下', '回看一個轉折', '再試一次', '謝謝一起玩'].every((t) => endBtns.some((b) => b.includes(t))), endBtns.join('|'));
  await tap(p, '[data-testid=trail-look]');
  ok('T-13', 'perfect game: review says every turn was great', (await prompt(p)).includes('每一步都走得很好') && !(await p.$('[data-testid=trail-practise]')));
  await p.screenshot({ path: `${OUT}/trail-review-perfect.png` });
  // try again → computer goes first now
  await tap(p, '[data-testid=trail-again]');
  await sleep(200);
  ok('T-14', 'try again alternates who goes first (computer now)', (await p.evaluate(() => window.__trail.game.first)) === 1);
  // take a break from the running game is only at the end; play this one with rest first, lose a round
  await humanTurn(p, REST_THEN_BEST[0]);
  const saved1 = await p.evaluate(() => window.__trail.game.players[0].energy);
  for (const t of REST_THEN_BEST.slice(1)) await humanTurn(p, t);
  await p.waitForFunction(() => document.querySelector('[data-turn]')?.dataset.status === 'over', { timeout: 30000 });
  const res2 = await st(p);
  await tap(p, '[data-testid=trail-look]');
  const rp = await prompt(p);
  const lines = await p.$$eval('[data-testid=line-better],[data-testid=line-actual]', (l) => l.map((x) => x.dataset.testid));
  ok('T-15', 'review finds round 1 (rested) and shows the faster route', rp.includes('第 1 回合') && rp.includes('快 1 回合') && lines.includes('line-better'), `${rp.replace(/\n/g, ' ')} ${lines} saved=${saved1}`);
  await p.screenshot({ path: `${OUT}/trail-review.png` });
  await tap(p, '[data-testid=note-apple]');
  const notes = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.trail.v1')).notes);
  ok('T-16', '"what would you change" answer saved locally (optional)', notes.includes('hills:apple'));
  const realWinner = res2.winner;
  await tap(p, '[data-testid=trail-practise]');
  ok('T-17', 'practice branch starts at the turning point', !!(await p.$('[data-testid=trail-practice]')) && (await at(p, 0)) === 0);
  for (const t of BEST) await humanTurn(p, t);
  await p.waitForFunction(() => document.querySelector('[data-turn]')?.dataset.status === 'over', { timeout: 30000 });
  const pr = await prompt(p);
  ok('T-18', 'practice shows the new round vs before', pr.includes('練習：第 4 回合到營地') && pr.includes('原本第 5 回合'), pr);
  await tap(p, '[data-testid=trail-back]');
  const back = await p.evaluate(() => ({ screen: window.__trail.screen, winner: window.__trail.game.winner, log: window.__trail.game.log.length, practice: window.__trail.saved.practice }));
  ok('T-19', 'back to result: the real result is unchanged', back.screen === 'review' && String(back.winner) === realWinner && back.practice === null, JSON.stringify(back));
  await tap(p, '[data-testid=trail-break]');
  const cleared = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.trail.v1')).game);
  ok('T-20', 'take a break returns to the start screen', (await p.$eval('[data-testid=trail]', (e) => e.dataset.screen)) === 'setup' && cleared === null);
  ok('T-21', 'no console errors', p.errors.length === 0, p.errors.join(' | '));
  await ctx.close();
}

// ---------- T-22 two players on one device
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx, 390, 844);
  await go(p);
  await tap(p, '[data-testid=mode-duo]');
  await tap(p, '[data-testid=trail-start]');
  await humanTurn(p, [1], 0);
  const t1 = await prompt(p);
  await humanTurn(p, [1, 2], 1);
  ok('T-22', 'two players take turns on one device', t1.includes('輪到 紫隊') && (await at(p, 1)) === 2 && (await st(p)).turn === '0', t1);
  await p.screenshot({ path: `${OUT}/trail-390-duo.png`, fullPage: true });
  await ctx.close();
}

// ---------- T-23 reduced motion: no waiting on the computer
{
  const ctx = await browser.createBrowserContext();
  const p = await page(ctx, 390, 844, { reduce: true });
  await go(p);
  await tap(p, '[data-testid=trail-start]');
  await humanTurn(p, BEST[0]);
  const t0 = Date.now();
  await myTurn(p);
  ok('T-23', 'reduced motion: computer turn finishes at once', Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
  await ctx.close();
}

// ---------- T-24 layouts
{
  const fails = [];
  for (const w of [360, 390, 768, 1280])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.createBrowserContext();
        const p = await page(ctx, w, w < 500 ? 800 : 900, { scheme });
        await go(p, lang);
        const check = () =>
          p.evaluate(() => {
            const over = document.documentElement.scrollWidth > window.innerWidth + 1;
            const btns = [...document.querySelectorAll('[data-testid=trail] button')].filter((b) => b.getBoundingClientRect().width);
            const small = btns.filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width < 44 || r.height < 44;
            }).length;
            const outside = btns.filter((b) => {
              const r = b.getBoundingClientRect();
              return r.left < -1 || r.right > window.innerWidth + 1;
            }).length;
            return { over, small, outside };
          });
        const a = await check();
        await p.screenshot({ path: `${OUT}/trail-${w}-${lang ? 'en' : 'zh'}-${scheme}-setup.png`, fullPage: true });
        await tap(p, '[data-testid=trail-start]');
        await tap(p, '[data-testid=node-1]');
        const b = await check();
        const mapW = await p.$eval('[data-testid=trail-map]', (m) => m.getBoundingClientRect().width);
        await p.screenshot({ path: `${OUT}/trail-${w}-${lang ? 'en' : 'zh'}-${scheme}-game.png`, fullPage: true });
        for (const [k, m] of [['setup', a], ['game', b]]) if (m.over || m.small || m.outside) fails.push(`${w}${lang || '/zh'}-${scheme}-${k}:${JSON.stringify(m)}`);
        if (mapW < 300) fails.push(`${w} map ${mapW}`);
        if (p.errors.length) fails.push(`${w}${lang}${scheme} errors ${p.errors[0]}`);
        await ctx.close();
      }
  ok('T-24', '360/390/768/1280 × zh/en × light/dark: no overflow, targets ≥44px', fails.length === 0, fails.join(' ; '));
}

await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
