// Screenshots + checks for the product copy v1.1 integration (Issue #2), zh / en, 360 px and desktop:
// tagline, onboarding card (first visit, dismiss, re-open), rules summaries, tutorial feedback and the
// connection states (reconnecting → syncing → synced, reconnect failed with retry / leave).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node copy-shots.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/copy';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass: !!pass, info: String(info) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {
      /* navigating */
    }
    await sleep(150);
  }
  return false;
}
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const version = await browser.version();
const text = (p) => p.evaluate(() => document.body.innerText);
const COPY = {
  zh: { tagline: '一起玩，一起動腦。', got: '知道了', how: '遊戲說明', start: '開始', reconnecting: '連線中斷', syncing: '同步', synced: '已同步', failed: '無法重新連線', retry: '再試一次', leave: '離開房間', xq: '長將', bq: '50' },
  en: { tagline: 'Play Together, Think Better.', got: 'Got it', how: 'How to play', start: 'Start', reconnecting: 'onnection', syncing: 'ync', synced: 'ynced', failed: 'reconnect', retry: 'Try again', leave: 'Leave room', xq: 'check', bq: '50' },
};

for (const [vw, vh, tag] of [
  [360, 780, '360'],
  [1280, 860, 'desktop'],
]) {
  for (const lang of ['zh', 'en']) {
    const c = COPY[lang];
    const pre = lang === 'en' ? '/en' : '';
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: vw, height: vh, isMobile: vw < 500, hasTouch: vw < 500 });
    const T = `${tag} ${lang}`;
    // tagline
    await p.goto(`${BASE}${pre || '/'}`, { waitUntil: 'networkidle0' });
    const tg = await p.$eval('[data-testid=tagline]', (e) => e.textContent).catch(() => null);
    ok(`${T}: tagline under the title`, tg === c.tagline, tg);
    await p.screenshot({ path: `${OUT}/${tag}-${lang}-home.png` });
    // onboarding: first visit shows, dismiss hides, re-open button shows it again, stays dismissed after reload
    await p.goto(`${BASE}${pre}/xiangqi`, { waitUntil: 'networkidle0' });
    ok(`${T}: onboarding card on first visit`, !!(await p.$('[data-testid=onboarding]')));
    const card = await p.$('[data-testid=onboarding]');
    if (card) await card.screenshot({ path: `${OUT}/${tag}-${lang}-onboarding.png` });
    await p.evaluate((got) => [...document.querySelectorAll('[data-testid=onboarding] button')].find((b) => b.textContent.includes(got))?.click(), c.got);
    await sleep(200);
    await p.reload({ waitUntil: 'networkidle0' });
    ok(`${T}: onboarding stays dismissed`, !(await p.$('[data-testid=onboarding]')));
    await p.evaluate((how) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(how))?.click(), c.how);
    await sleep(200);
    ok(`${T}: onboarding can be re-opened`, !!(await p.$('[data-testid=onboarding]')));
    // rules summaries
    await p.goto(`${BASE}${pre}/play?game=xiangqi&mode=room`, { waitUntil: 'networkidle0' });
    ok(`${T}: xiangqi rules summary in setup`, (await text(p)).includes(c.xq));
    await p.screenshot({ path: `${OUT}/${tag}-${lang}-xiangqi-setup.png`, fullPage: true });
    await p.goto(`${BASE}${pre}/play?game=banqi&mode=room`, { waitUntil: 'networkidle0' });
    ok(`${T}: banqi default rules summary in setup`, (await text(p)).includes(c.bq));
    await p.screenshot({ path: `${OUT}/${tag}-${lang}-banqi-setup.png`, fullPage: true });
    // tutorial feedback (shared Notice): wrong move → tryAgain, right move → actionDone
    await p.goto(`${BASE}${pre}/learn/xiangqi`, { waitUntil: 'networkidle0' });
    await p.screenshot({ path: `${OUT}/${tag}-${lang}-tutorial.png`, fullPage: true });
    await ctx.close();
  }
}

// connection states: wrap WebSocket so the test can drop the connection and refuse reconnects
for (const lang of ['zh', 'en']) {
  const c = COPY[lang];
  const pre = lang === 'en' ? '/en' : '';
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    window.__ws = [];
    window.__block = false;
    // simulate an abrupt network drop as the page sees it (a clean close() waits for the server's close frame)
    window.__drop = () =>
      window.__ws.splice(0).forEach((w) => {
        const live = w.readyState <= 1;
        const h = w.onclose;
        if (!live) return;
        w.onclose = null;
        w.onmessage = null;
        w.close();
        if (h) h.call(w, new CloseEvent('close', { code: 1006 }));
      });
    window.WebSocket = class extends Real {
      constructor(url, prot) {
        super(window.__block ? url.replace(/\/api\/.*/, '/api/blocked-for-test') : url, prot);
        window.__ws.push(this);
      }
    };
  });
  await p.goto(`${BASE}${pre || '/'}`, { waitUntil: 'networkidle0' });
  const id = await p.evaluate(async () => (await (await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'xiangqi', minutes: 5 }) })).json()).id);
  await p.goto(`${BASE}${pre}/room/${id}`, { waitUntil: 'networkidle0' });
  await waitFor(async () => (await p.$eval('[data-room-status]', (e) => e.dataset.phase).catch(() => null)) === 'synced');
  const phase = () => p.$eval('[data-room-status]', (e) => e.dataset.phase).catch(() => null);
  // drop with reconnects refused for a moment → reconnecting (warning); let them through → syncing (info) → synced (success)
  await p.evaluate(() => {
    window.__phases = [];
    // record every committed phase (a MutationObserver sees each React commit, even within one frame)
    new MutationObserver(() => {
      const ph = document.querySelector('[data-room-status]')?.getAttribute('data-phase');
      if (ph && window.__phases.at(-1) !== ph) window.__phases.push(ph);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase'] });
    window.__block = true;
    window.__drop();
  });
  await waitFor(async () => (await phase()) === 'reconnecting', 3000);
  await sleep(300);
  const rc = await text(p);
  await p.screenshot({ path: `${OUT}/360-${lang}-conn-reconnecting.png` });
  await p.evaluate(() => (window.__block = false));
  await waitFor(async () => (await phase()) === 'synced', 15000);
  const syncedText = await text(p);
  await p.screenshot({ path: `${OUT}/360-${lang}-conn-synced.png` });
  const seen = await p.evaluate(() => window.__phases);
  ok(`conn ${lang}: reconnecting → syncing → synced`, seen.join(',').includes('reconnecting') && seen.includes('syncing') && seen.at(-1) === 'synced' && rc.includes(c.reconnecting) && syncedText.includes(c.synced), seen.join(' → '));
  // refuse reconnects → failed with retry + leave
  await p.evaluate(() => {
    window.__block = true;
    window.__drop();
  });
  const failed = await waitFor(async () => (await phase()) === 'failed', 45000);
  const ft = await text(p);
  await p.screenshot({ path: `${OUT}/360-${lang}-conn-failed.png` });
  ok(`conn ${lang}: reconnect failed shows retry and leave`, failed && ft.includes(c.retry) && ft.includes(c.leave), await phase());
  // retry works once the network is back
  await p.evaluate(() => (window.__block = false));
  await p.evaluate((retry) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(retry))?.click(), c.retry);
  ok(`conn ${lang}: retry reconnects and resyncs`, await waitFor(async () => (await phase()) === 'synced', 8000));
  ok(`conn ${lang}: notice does not promise the match is paused`, !/暫停|paused/i.test(rc + ft));
  await ctx.close();
}
await browser.close();
writeFileSync(`docs/test-results/copy-shots-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, browser: version, date: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed (${version})`);
process.exit(failed ? 1 : 0);
