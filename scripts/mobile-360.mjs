// 360 px acceptance (Issue #2): every page / state in zh & en, light & dark.
// Checks real element bounds instead of trusting overflow-x hidden:
//  - the document does not scroll sideways,
//  - every visible control lies inside the 360 px viewport (unless it sits in a deliberate horizontal scroller),
//  - controls (buttons, inputs, selects, summaries, nav/menu links) are at least 44×44 px.
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node mobile-360.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/360';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const version = await browser.version();

const clickText = (p, text, sel = 'button') =>
  p.evaluate(
    (text, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text) && !e.disabled);
      el?.click();
      return !!el;
    },
    text,
    sel,
  );

/** Pages and states. `prep` puts the page into the state to check (start a game, open a dialog …). */
const T = (zh, en) => ({ zh, en });
const PAGES = [
  { id: 'home', path: '/' },
  ...['chess', 'xiangqi', 'banqi', 'territory', 'snake', 'blocks'].map((g) => ({ id: `hub-${g}`, path: `/${g}` })),
  ...['chess', 'xiangqi', 'banqi', 'territory', 'snake', 'blocks'].map((g) => ({ id: `learn-${g}`, path: `/learn/${g}` })),
  { id: 'setup-chess-ai', path: '/play?game=chess&mode=ai' },
  { id: 'setup-xiangqi-room', path: '/play?game=xiangqi&mode=room' },
  { id: 'setup-banqi-local', path: '/play?game=banqi&mode=local' },
  { id: 'matchmaking-xiangqi', path: '/matchmaking?game=xiangqi' },
  {
    id: 'game-chess-ai',
    path: '/play?game=chess&mode=ai',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始' : 'Start');
      await sleep(1200);
    },
  },
  {
    id: 'game-banqi-local',
    path: '/play?game=banqi&mode=local',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始' : 'Start');
      await sleep(800);
    },
  },
  {
    id: 'dialog-resign',
    path: '/play?game=xiangqi&mode=ai',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始' : 'Start');
      await sleep(1000);
      await clickText(p, l === 'zh' ? '認輸' : 'Resign');
      await sleep(500);
    },
  },
  { id: 'setup-territory', path: '/territory/play?mode=ai' },
  {
    id: 'game-territory',
    path: '/territory/play?mode=ai',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始遊戲' : 'Start');
      await sleep(1500);
    },
  },
  {
    id: 'game-snake',
    path: '/snake/play?mode=classic',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始遊戲' : 'Start');
      await sleep(1000);
    },
  },
  {
    id: 'result-snake',
    path: '/snake/play?mode=classic',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始遊戲' : 'Start');
      await p.waitForSelector('[role=dialog]', { timeout: 30000 }).catch(() => null);
      await sleep(1500);
    },
  },
  {
    id: 'game-blocks',
    path: '/blocks/play?mode=marathon',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始遊戲' : 'Start');
      await sleep(1000);
    },
  },
  {
    id: 'result-blocks',
    path: '/blocks/play?mode=sprint',
    prep: async (p, l) => {
      await clickText(p, l === 'zh' ? '開始遊戲' : 'Start');
      await sleep(400);
      for (let i = 0; i < 40 && !(await p.$('[role=dialog]')); i++) {
        await p.keyboard.press('Space');
        await sleep(40);
      }
      await sleep(1500); // let the result card finish its entrance animation before measuring
    },
  },
  { id: 'newroom-snake', path: '/snake/new-room' },
  { id: 'newroom-territory', path: '/territory/new-room' },
  {
    id: 'room-waiting',
    path: '/',
    prep: async (p, l) => {
      const id = await p.evaluate(async () => (await (await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'chess', minutes: 5 }) })).json()).id);
      await p.goto(`${BASE}${l === 'en' ? '/en' : ''}/room/${id}`, { waitUntil: 'networkidle0' });
      await sleep(800);
    },
  },
  {
    id: 'room-arena-lobby',
    path: '/',
    prep: async (p, l) => {
      const id = await p.evaluate(async () => (await (await fetch('/api/arena/blocks/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).id);
      await p.goto(`${BASE}${l === 'en' ? '/en' : ''}/blocks/room/${id}`, { waitUntil: 'networkidle0' });
      await sleep(800);
    },
  },
  { id: 'error-room-not-found', path: '/room/ZZZZZZ', wait: 2500 },
  { id: 'leaderboard', path: '/leaderboard' },
  { id: 'settings', path: '/settings' },
];

const checkPage = (p) =>
  p.evaluate(() => {
    const W = innerWidth;
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[aria-hidden=true],.sr-only');
    };
    const inScroller = (e) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth) return true;
      }
      return false;
    };
    const label = (e) => `${e.tagName.toLowerCase()}「${(e.getAttribute('aria-label') || e.textContent || e.value || '').trim().slice(0, 24)}」`;
    const controls = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]')].filter(vis);
    const offscreen = controls.filter((e) => {
      const r = e.getBoundingClientRect();
      return (r.left < -1 || r.right > W + 1) && !inScroller(e);
    });
    // touch-target rule: controls, plus links that act as navigation / buttons (not words inside running text)
    const isTarget = (e) => {
      if (e.matches('a[href]')) {
        if (e.closest('p,li p,footer')) return false; // inline text links / footer text links
        const r = e.getBoundingClientRect();
        return r.height < 200; // cards are large anyway
      }
      if (e.matches('input[type=range]')) return false; // sliders: height is the thumb, checked manually
      if (e.closest('[role=grid]')) return false; // board squares are sized by the board, checked separately
      return true;
    };
    const small = controls.filter(isTarget).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width < 43.5 || r.height < 43.5;
    });
    return {
      scrollX: document.documentElement.scrollWidth > W,
      docWidth: document.documentElement.scrollWidth,
      controls: controls.length,
      offscreen: offscreen.map(label),
      small: small.map((e) => {
        const r = e.getBoundingClientRect();
        return `${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}`;
      }),
    };
  });

const results = [];
for (const lang of ['zh', 'en']) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.createBrowserContext();
    for (const pg of PAGES) {
      const p = await ctx.newPage();
      await p.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      const errors = [];
      p.on('pageerror', (e) => errors.push(String(e)));
      const url = `${BASE}${lang === 'en' ? (pg.path === '/' ? '/en' : '/en' + pg.path) : pg.path}`;
      try {
        await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        if (pg.wait) await sleep(pg.wait);
        if (pg.prep) await pg.prep(p, lang);
        const r = await checkPage(p);
        const file = `${pg.id}-${lang}-${scheme}.jpg`;
        await p.screenshot({ path: `${OUT}/${file}`, fullPage: true, type: 'jpeg', quality: 70 });
        const pass = !r.scrollX && r.offscreen.length === 0 && r.small.length === 0 && errors.length === 0;
        results.push({ page: pg.id, lang, scheme, url, pass, ...r, errors, screenshot: `screens/360/${file}` });
        console.log(`${pass ? 'PASS' : 'FAIL'} ${pg.id} ${lang}/${scheme}${r.scrollX ? ` scrollX(${r.docWidth})` : ''}${r.offscreen.length ? ` offscreen: ${r.offscreen.join(', ')}` : ''}${r.small.length ? ` small: ${r.small.join(', ')}` : ''}${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
      } catch (e) {
        results.push({ page: pg.id, lang, scheme, url, pass: false, errors: [String(e)] });
        console.log(`FAIL ${pg.id} ${lang}/${scheme} ${e}`);
      }
      await p.close();
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`docs/test-results/mobile-360-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, browser: version, viewport: '360×780 @1x, touch', date: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed (${version})`);
process.exit(failed ? 1 : 0);
