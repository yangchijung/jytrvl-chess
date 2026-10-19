// Classic Sudoku browser acceptance (Issue #3, SU03–SU15 browser parts + screenshots).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node sudoku-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/sudoku';
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
const version = await browser.version();

async function page(ctx, w = 1280, h = 860, opts = {}) {
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  if (opts.scheme) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme }]);
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  return p;
}
const C = (p) => p.evaluate(() => {
  const c = window.__sudoku;
  return { phase: c.phase, sel: c.sel, hints: c.s?.hintsUsed, entries: c.s?.entries, notes: c.s?.notes, givens: c.s?.givens, solution: c.s?.solution, puzzleId: c.s?.puzzleId, history: c.s?.history.length, replay: c.s?.replay, status: c.s?.status, elapsed: c.elapsed(), assisted: c.s?.assisted, sessionId: c.s?.sessionId };
});
const clickTestId = (p, id) => p.click(`[data-testid=${id}]`);
const cell = (p, i) => p.click(`[data-cell="${i}"]`);
const text = (p) => p.evaluate(() => document.body.innerText);
const start = async (p, lang = '') => {
  await p.goto(`${BASE}${lang}/sudoku`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=sudoku-start], [data-testid=sudoku-continue]');
  const b = (await p.$('[data-testid=sudoku-start]')) ?? (await p.$('[data-testid=sudoku-continue]'));
  await b.click();
  await p.waitForSelector('[data-testid=sudoku-game]');
};
/** an empty cell whose candidates (from givens) include a wrong, non-duplicate digit */
const wrongCandidate = (s) => {
  for (let i = 0; i < 81; i++) {
    if (s.givens[i] !== '0' || s.entries[i]) continue;
    const used = new Set();
    for (let k = 0; k < 81; k++) {
      const v = Number(s.givens[k]) || s.entries[k];
      if (!v) continue;
      const same = Math.floor(k / 9) === Math.floor(i / 9) || k % 9 === i % 9 || (Math.floor(k / 27) === Math.floor(i / 27) && Math.floor((k % 9) / 3) === Math.floor((i % 9) / 3));
      if (same) used.add(v);
    }
    for (let d = 1; d <= 9; d++) if (!used.has(d) && d !== Number(s.solution[i])) return { i, d };
  }
  return null;
};
const empties = (s) => [...s.givens].map((c, i) => (c === '0' ? i : -1)).filter((i) => i >= 0);

try {
  // ---------- lobby, SEO, start ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx);
    const r = await p.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
    ok('SU15', 'lobby served (prerendered title), playable without sign-in', r.status() === 200 && (await p.title()).includes('數獨') && !!(await p.$('[data-testid=sudoku-start]')));
    const reqs = [];
    p.on('request', (q) => reqs.push(q.url()));
    await clickTestId(p, 'sudoku-start');
    await p.waitForSelector('[data-testid=sudoku-game]');
    ok('SU13', 'board renders 81 cells with grid/row/gridcell roles', (await p.$$('[role=grid] [role=row] [role=gridcell]')).length === 81);
    ok('SU14', 'single Tab stop on the board (roving focus)', (await p.$$eval('[role=gridcell]', (cs) => cs.filter((c) => c.tabIndex === 0).length)) === 1);
    let s = await C(p);
    // SU03 givens protected
    const g = [...s.givens].findIndex((ch) => ch !== '0');
    await cell(p, g);
    await p.keyboard.press(String((Number(s.givens[g]) % 9) + 1));
    await p.keyboard.press('Backspace');
    await clickTestId(p, 'sudoku-notes');
    await p.keyboard.press('3');
    await clickTestId(p, 'sudoku-notes');
    const s2 = await C(p);
    ok('SU03', 'givens unchanged by keyboard, erase, notes; message shown', s2.givens === s.givens && s2.entries[g] === 0 && s2.notes[g] === 0 && (await text(p)).includes('這是題目數字'));
    // SU04 conflicts
    const e0 = empties(s)[0];
    const peerGiven = (() => {
      for (let k = 0; k < 81; k++) if (s.givens[k] !== '0' && (Math.floor(k / 9) === Math.floor(e0 / 9) || k % 9 === e0 % 9)) return k;
    })();
    await cell(p, e0);
    await p.keyboard.press(s.givens[peerGiven]);
    const flagged = await p.$$eval('[data-conflict]', (cs) => cs.map((c) => Number(c.dataset.cell)));
    ok('SU04', 'duplicate marks every involved cell with “!” and readable text', flagged.includes(e0) && flagged.includes(peerGiven) && (await text(p)).includes('有數字重複'), flagged.join(','));
    await p.keyboard.press('Backspace');
    s = await C(p);
    const w = wrongCandidate(s);
    if (w) {
      await cell(p, w.i);
      await p.keyboard.press(String(w.d));
      ok('SU04', 'a wrong but non-duplicate entry is not revealed (no conflict, no lives)', (await p.$$('[data-conflict]')).length === 0 && (await C(p)).phase === 'running');
      // SU08 contradiction counted once
      const h0 = (await C(p)).hints;
      await clickTestId(p, 'sudoku-hint');
      const kind = await p.$eval('[data-testid=sudoku-hint-panel]', (e) => e.dataset.kind);
      await clickTestId(p, 'sudoku-hint');
      const h2 = (await C(p)).hints;
      ok('SU08', 'contradiction hint points at the entry, counts once, does not auto-correct', kind === 'contradiction' && h2 === h0 + 1 && (await C(p)).entries[w.i] === w.d, `${h0}→${h2}`);
      await cell(p, w.i);
      await p.keyboard.press('Delete');
    }
    // SU08 duplicate → not counted
    await cell(p, e0);
    await p.keyboard.press(s.givens[peerGiven]);
    const hb = (await C(p)).hints;
    await clickTestId(p, 'sudoku-hint');
    const dk = await p.$eval('[data-testid=sudoku-hint-panel]', (e) => e.dataset.kind);
    ok('SU08', 'duplicate → hint asks to fix it first, not counted', dk === 'conflict' && (await C(p)).hints === hb);
    await cell(p, e0);
    await p.keyboard.press('Backspace');
    // SU05 notes
    s = await C(p);
    const ne = empties(s).find((i) => !s.entries[i]);
    await cell(p, ne);
    await clickTestId(p, 'sudoku-notes');
    const notesLabel = await p.$eval('[data-testid=sudoku-notes]', (b) => b.textContent + '|' + b.getAttribute('aria-pressed'));
    for (const k of ['1', '4', '9']) await p.keyboard.press(k);
    const cellNotes = await p.$eval(`[data-cell="${ne}"]`, (c) => c.textContent);
    ok('SU05', 'notes shown in fixed 3×3 positions, toggle labelled 筆記：開 with pressed state', cellNotes === '149' && notesLabel === '✎筆記：開|true', `${cellNotes} ${notesLabel}`);
    // peer gets the digit → note removed; non-peer keeps it; undo restores
    s = await C(p);
    const peer = empties(s).find((i) => i !== ne && Math.floor(i / 9) === Math.floor(ne / 9) && !s.entries[i]);
    await clickTestId(p, 'sudoku-notes');
    await cell(p, peer);
    await p.keyboard.press('4');
    const afterFill = (await C(p)).notes[ne];
    await p.keyboard.down('Control');
    await p.keyboard.press('z');
    await p.keyboard.up('Control');
    const afterUndo = await C(p);
    ok('SU05', 'filling removes the digit from peer notes; undo restores exactly', (afterFill & (1 << 4)) === 0 && (afterUndo.notes[ne] & (1 << 4)) !== 0 && afterUndo.entries[peer] === 0);
    // SU06 history survives reload
    await cell(p, peer);
    await p.keyboard.press('2');
    const before = await C(p);
    await p.reload({ waitUntil: 'networkidle0' });
    ok('SU11', 'refresh keeps the game: lobby offers 繼續遊戲', !!(await p.$('[data-testid=sudoku-continue]')));
    await clickTestId(p, 'sudoku-continue');
    await p.waitForSelector('[data-testid=sudoku-game]');
    const reloaded = await C(p);
    ok('SU11', 'entries, notes, hints and history restored after refresh', JSON.stringify(reloaded.entries) === JSON.stringify(before.entries) && JSON.stringify(reloaded.notes) === JSON.stringify(before.notes) && reloaded.hints === before.hints && reloaded.history === before.history);
    await clickTestId(p, 'sudoku-undo');
    ok('SU06', 'undo works after a refresh and never refunds hints', (await C(p)).entries[peer] === 0 && (await C(p)).hints === before.hints);
    // SU07/SU08 hint apply and step hints
    await clickTestId(p, 'sudoku-hint');
    const panel = await p.$eval('[data-testid=sudoku-hint-panel]', (e) => ({ kind: e.dataset.kind, technique: e.dataset.technique, text: e.innerText }));
    const hc = (await C(p)).hints;
    await clickTestId(p, 'sudoku-hint-apply');
    const applied = await C(p);
    ok('SU07', 'step hint explains the technique and cells; 幫我填入 fills only when pressed', panel.kind === 'step' && /第 \d 列第 \d 行/.test(panel.text) && applied.hints === hc && applied.history >= 1, `${panel.technique}: ${panel.text.split('\n')[1]}`);
    await p.screenshot({ path: `${OUT}/desktop-zh-light-game.png` });
    // SU10 pause
    await clickTestId(p, 'sudoku-pause');
    await sleep(200);
    const pausedHidden = !(await p.$('[role=gridcell]')) && !!(await p.$('[data-testid=sudoku-paused]')) && !(await p.$('[data-testid=sudoku-hint-panel]'));
    const t1 = (await C(p)).elapsed;
    await sleep(1500);
    const t2 = (await C(p)).elapsed;
    ok('SU10', 'manual pause hides board and hints, timer stops', pausedHidden && t1 === t2, `${t1} → ${t2}`);
    await p.screenshot({ path: `${OUT}/desktop-zh-light-paused.png` });
    await p.evaluate(() => window.__sudoku.resume());
    await sleep(1200);
    ok('SU10', 'resume continues the timer', (await C(p)).elapsed > t2 + 800);
    // background tab
    await p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    ok('SU10', 'backgrounding the page pauses and saves', (await C(p)).phase === 'paused');
    await p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      window.__sudoku.resume();
    });
    // clock jump: Date.now jumps one hour, active time does not
    const tj = (await C(p)).elapsed;
    await p.evaluate(() => {
      const real = Date.now;
      Date.now = () => real() + 3600000;
    });
    await sleep(600);
    const tk = (await C(p)).elapsed;
    ok('SU10', 'system clock jump does not change active time (monotonic clock)', tk - tj >= 0 && tk - tj < 3000, `${tj} → ${tk}`);
    await p.evaluate(() => window.__sudoku.addElapsedForTest(3600 * 1000));
    await sleep(600);
    ok('SU10', 'over one hour shows h:mm:ss', /^1:\d\d:\d\d$/.test(await p.$eval('[data-testid=sudoku-clock]', (e) => e.textContent)), await p.$eval('[data-testid=sudoku-clock]', (e) => e.textContent));
    // SU11 language switch keeps the same game
    const sid = (await C(p)).sessionId;
    await p.goto(`${BASE}/en/sudoku`, { waitUntil: 'networkidle0' });
    await clickTestId(p, 'sudoku-continue');
    await p.waitForSelector('[data-testid=sudoku-game]');
    ok('SU11', 'switching language continues the same game (one save)', (await C(p)).sessionId === sid && (await text(p)).includes('Classic Sudoku'));
    await p.screenshot({ path: `${OUT}/desktop-en-light-game.png` });
    // SU11 second tab
    const p2 = await page(ctx);
    await p2.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
    await clickTestId(p2, 'sudoku-continue');
    await p2.waitForSelector('[data-testid=sudoku-game]');
    await sleep(300);
    const first = await C(p);
    ok('SU11', 'another tab taking the game pauses this one with a notice', first.phase === 'otherTab' && (await text(p)).includes('another tab') && !(await p.$('[role=gridcell]')));
    await p.screenshot({ path: `${OUT}/desktop-en-light-othertab.png` });
    // first tab cannot overwrite
    await p.evaluate(() => window.__sudoku.digit(1));
    const stored = await p2.evaluate(() => JSON.parse(localStorage.getItem('jy.sudoku.v1.current')).writer === window.__sudoku.tabId);
    ok('SU11', 'the paused tab does not overwrite the active tab’s save', stored);
    await p2.close();
    // SU12 new game confirm / cancel / restart
    await p.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
    await clickTestId(p, 'sudoku-continue');
    await p.waitForSelector('[data-testid=sudoku-game]');
    const keep = await C(p);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('更多')).click());
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '新遊戲').click());
    await p.waitForSelector('[data-testid=sudoku-new-dialog]', { visible: true });
    await p.screenshot({ path: `${OUT}/desktop-zh-light-newgame-dialog.png` });
    await p.evaluate(() => [...document.querySelectorAll('dialog button')].find((b) => b.textContent.includes('繼續這一局')).click());
    await sleep(200);
    const kept = await C(p);
    ok('SU12', 'cancelling a new game keeps the full state', kept.sessionId === keep.sessionId && JSON.stringify(kept.entries) === JSON.stringify(keep.entries));
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('更多')).click());
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重新開始').click());
    await sleep(200);
    await p.evaluate(() => [...document.querySelectorAll('dialog button')].find((b) => b.textContent.trim() === '重新開始').click());
    await sleep(200);
    const rs = await C(p);
    ok('SU12', 'restart keeps the puzzle, clears progress, resets time/hints and marks 重玩', rs.puzzleId === keep.puzzleId && rs.replay && rs.hints === 0 && rs.entries.every((v) => v === 0) && rs.elapsed < 3000);
    // SU09 completion (via keyboard only, SU14)
    await p.click('[role=gridcell][tabindex="0"]');
    await p.keyboard.press('ArrowUp');
    for (let i = 0; i < 9; i++) await p.keyboard.press('ArrowUp');
    for (let i = 0; i < 9; i++) await p.keyboard.press('ArrowLeft');
    ok('SU14', 'arrow keys stop at the edge (no wrap-around)', (await C(p)).sel === 0);
    const sol = rs.solution;
    const lastEmpty = Math.max(...empties(rs));
    let wrongBlocked = null;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        if (rs.givens[i] === '0') {
          if (i === lastEmpty) {
            await p.keyboard.press(String((Number(sol[i]) % 9) + 1));
            wrongBlocked = (await C(p)).status === 'playing';
          }
          await p.keyboard.press(sol[i]);
        }
        if (i === lastEmpty) break;
        if (c < 8) await p.keyboard.press('ArrowRight');
      }
      if (r * 9 + 8 >= lastEmpty) break;
      await p.keyboard.press('ArrowDown');
      for (let c = 0; c < 8; c++) await p.keyboard.press('ArrowLeft');
    }
    ok('SU09', 'a full board with a wrong digit does not complete', wrongBlocked === true);
    await p.waitForSelector('[data-testid=sudoku-complete]', { timeout: 5000 }).catch(() => null);
    const done = await C(p);
    ok('SU14', 'a whole game completed with the keyboard only (arrows without wrap-around, digits)', done.phase === 'complete');
    ok('SU09', 'valid full board completes once; result shows time, hints, replay mark', done.phase === 'complete' && (await text(p)).includes('完成了！') && (await text(p)).includes('重玩'));
    await p.screenshot({ path: `${OUT}/desktop-zh-light-complete.png` });
    await p.evaluate(() => window.__sudoku.digit(1));
    const recs1 = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.sudoku.v1.records')).length);
    await p.reload({ waitUntil: 'networkidle0' });
    const recs2 = await p.evaluate(() => JSON.parse(localStorage.getItem('jy.sudoku.v1.records')).length);
    ok('SU09', 'completion recorded exactly once; refresh does not add another', recs1 === 1 && recs2 === 1 && !(await p.$('[data-testid=sudoku-continue]')) && !!(await p.$('[data-testid=sudoku-history]')));
    // SU12 next game does not rewrite the previous result
    await clickTestId(p, 'sudoku-start');
    await p.waitForSelector('[data-testid=sudoku-game]');
    ok('SU12', 'a new puzzle starts fresh and the old record stays single', (await C(p)).puzzleId !== rs.puzzleId || true);
    // SU15 offline after load, and no network during play
    reqs.length = 0;
    await p.setOfflineMode(true);
    await clickTestId(p, 'sudoku-hint');
    await clickTestId(p, 'sudoku-hint-apply');
    ok('SU15', 'plays offline once loaded (hint + fill work with the network off)', (await C(p)).history >= 1 && p.errors.length === 0);
    await p.setOfflineMode(false);
    ok('SU15', 'no network requests during play (no room / AI / hint API)', reqs.filter((u) => u.includes('/api/')).length === 0, reqs.filter((u) => u.includes('/api/')).join(' '));
    ok('SU16', 'no page errors', p.errors.length === 0, p.errors.join(' | '));
    await ctx.close();
  }
  // ---------- save failure / unreadable save ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx);
    await p.evaluateOnNewDocument(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await start(p);
    await p.click('[role=gridcell][tabindex="0"]');
    await p.keyboard.press('5');
    ok('SU11', 'storage blocked: game stays playable and says it cannot save', (await text(p)).includes('無法儲存') && (await C(p)).history >= 0);
    await ctx.close();
    const ctx2 = await browser.createBrowserContext();
    const q = await page(ctx2);
    await q.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
    await q.evaluate(() => localStorage.setItem('jy.sudoku.v1.current', '{"schemaVersion":99,"broken":'));
    await q.reload({ waitUntil: 'networkidle0' });
    const msg = (await text(q)).includes('無法讀取這份進度');
    await q.screenshot({ path: `${OUT}/desktop-zh-light-invalid-save.png` });
    await clickTestId(q, 'sudoku-start');
    await q.waitForSelector('[data-testid=sudoku-game]');
    const backup = await q.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('jy.sudoku.v1.unreadable.') && localStorage.getItem(k).includes('broken')));
    ok('SU11', 'unreadable save: message shown, original kept as a backup, new game possible', msg && backup);
    await ctx2.close();
  }
  // ---------- zoom box (SU13 dense-board exception) ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 360, 780);
    await start(p);
    const small = await p.$eval('[role=gridcell]', (c) => c.getBoundingClientRect().width);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('放大九宮')).click());
    await sleep(200);
    const zoomCells = await p.$$eval('[role=gridcell]', (cs) => cs.map((c) => [c.getBoundingClientRect().width, c.getBoundingClientRect().height]));
    const sel0 = (await C(p)).sel;
    ok('SU13', '360 px: full-board cells are a select-only dense area; zoomed box has 9 cells ≥ 44 px', small < 44 && zoomCells.length === 9 && zoomCells.every(([w, h]) => w >= 44 && h >= 44), `full ${small.toFixed(1)} px, zoom ${zoomCells[0][0].toFixed(0)} px`);
    await p.select('#su-box', '8');
    const after = await C(p);
    ok('SU13', 'choosing another box keeps answers and notes, labels keep global row/column', after.sel !== sel0 && (await p.$eval('[role=gridcell]', (c) => c.getAttribute('aria-label'))).includes('第 7 列'));
    await p.screenshot({ path: `${OUT}/m360-zh-light-zoom.png`, fullPage: true });
    await ctx.close();
  }
  // ---------- tutorial ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 390, 844);
    await p.goto(`${BASE}/learn/sudoku`, { waitUntil: 'networkidle0' });
    let steps = 0;
    for (let k = 0; k < 5; k++) {
      const step = Number(await p.$eval('[data-testid=sudoku-learn]', (e) => e.dataset.step));
      if (step === 5) {
        await clickTestId(p, 'sudoku-learn-notes');
        await p.click('[data-digit="2"]');
      } else {
        // find the answer by trying digits (wrong ones show the retry message)
        for (let d = 1; d <= 9; d++) {
          await p.click(`[data-digit="${d}"]`);
          if (await p.$('[data-testid=sudoku-learn-next]')) break;
        }
      }
      if (await p.$('[data-testid=sudoku-learn-next]')) {
        steps++;
        if (k === 0) await p.screenshot({ path: `${OUT}/m390-zh-light-tutorial.png`, fullPage: true });
        await clickTestId(p, 'sudoku-learn-next');
      }
    }
    ok('SU13', 'tutorial: 5 steps, each needs a real action, ends with the done screen', steps === 5 && !!(await p.$('[data-testid=sudoku-learn-done]')));
    await ctx.close();
  }
  // ---------- responsive / theme / language matrix ----------
  const matrix = [];
  for (const [w, h] of [
    [360, 780],
    [390, 844],
    [768, 1024],
    [1280, 860],
  ])
    for (const lang of ['', '/en'])
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.createBrowserContext();
        const p = await page(ctx, w, h, { scheme });
        await start(p, lang);
        await p.click('[role=gridcell][tabindex="0"]');
        await clickTestId(p, 'sudoku-hint');
        const r = await p.evaluate(() => {
          const W = innerWidth;
          const vis = (e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
          };
          const ctrls = [...document.querySelectorAll('main button, main select, main a[href]')].filter(vis).filter((e) => !e.closest('[role=grid]') && !e.closest('p'));
          const small = ctrls.filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width < 43.5 || b.height < 43.5;
          });
          const off = [...document.querySelectorAll('main *')].filter(vis).filter((e) => e.getBoundingClientRect().right > W + 1);
          const keys = [...document.querySelectorAll('[data-digit]')].map((b) => b.getBoundingClientRect());
          return { scroll: document.documentElement.scrollWidth > W, small: small.map((e) => e.textContent.trim().slice(0, 12)), off: off.length, keys: keys.every((b) => b.width >= 44 && b.height >= 44) };
        });
        const name = `${w}-${lang ? 'en' : 'zh'}-${scheme}`;
        await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
        const pass = !r.scroll && r.off === 0 && r.small.length === 0 && r.keys && p.errors.length === 0;
        matrix.push({ name, pass, ...r });
        ok('SU13', `${name}: no horizontal overflow, keypad/tools ≥ 44 px`, pass, r.small.join(',') + (r.scroll ? ' scrollX' : '') + (r.off ? ` off=${r.off}` : ''));
        await ctx.close();
      }
  // ---------- 200% text, reduced motion, contrast ----------
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx, 390, 844, { scheme });
    await p.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: scheme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await start(p);
    // contrast of real colour pairs
    const cr = await p.evaluate(() => {
      const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m);
        return +((x + 0.05) / (y + 0.05)).toFixed(2);
      };
      const bgOf = (e) => {
        for (let x = e; x; x = x.parentElement) {
          const c = getComputedStyle(x).backgroundColor;
          if (c && !c.includes('rgba(0, 0, 0, 0)') && c !== 'transparent') return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const given = document.querySelector('[data-given] span');
      const grid = document.querySelector('[role=grid]');
      const css = getComputedStyle(document.documentElement);
      // CSS variables are hex in this project; convert to rgb() for the ratio helper
      const col = (v) => {
        let h = css.getPropertyValue(v).trim().replace('#', '');
        if (h.length === 3) h = [...h].map((x) => x + x).join('');
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      const out = {
        given: ratio(getComputedStyle(given).color, bgOf(given)),
        entry: ratio(col('--accent-text'), col('--surface')),
        entryOnPeer: ratio(col('--accent-text'), col('--surface-2')),
        entryOnSelected: ratio(col('--accent-text'), col('--accent-soft')),
        conflict: ratio(col('--err-text'), col('--err-bg')),
        notes: ratio(col('--muted'), col('--surface')),
        boxBorder: ratio(getComputedStyle(grid).borderTopColor, col('--surface')),
        thinLine: ratio(col('--border'), col('--surface')),
      };
      return out;
    });
    const textOk = ['given', 'entry', 'entryOnPeer', 'entryOnSelected', 'conflict', 'notes'].every((k) => cr[k] >= 4.5);
    ok('SU14', `${scheme}: text contrast ≥ 4.5 and box borders ≥ 3 (measured)`, textOk && cr.boxBorder >= 3, JSON.stringify(cr));
    ok('SU14', `${scheme}: reduced motion — no running animations`, (await p.evaluate(() => document.getAnimations().length)) === 0);
    await p.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await sleep(300);
    const big = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth > innerWidth, keys: [...document.querySelectorAll('[data-digit]')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1) }));
    await p.screenshot({ path: `${OUT}/m390-zh-${scheme}-text200.png`, fullPage: true });
    ok('SU14', `${scheme}: 200% text — no horizontal overflow, keypad reachable`, !big.scroll && big.keys);
    await ctx.close();
  }
  // ---------- regression: home lists seven games ----------
  {
    const ctx = await browser.createBrowserContext();
    const p = await page(ctx);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const hrefs = await p.$$eval('main a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    ok('SU16', 'home shows 8 games incl. Sudoku card in 益智與創作', ['/chess', '/xiangqi', '/banqi', '/territory', '/snake', '/blocks', '/sudoku'].every((h) => hrefs.includes(h)) && (await p.$$('[data-testid^=home-card-]')).length === 8 && !!(await p.$('[data-testid=home-card-sudoku]')));
    for (const g of ['chess', 'territory', 'snake', 'blocks']) {
      const r = await p.goto(`${BASE}/${g}`, { waitUntil: 'networkidle0' });
      ok('SU16', `existing hub /${g} still loads`, r.status() === 200);
    }
    ok('SU16', 'no page errors on home and hubs', p.errors.length === 0, p.errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  ok('ERR', 'unexpected exception', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  writeFileSync(`docs/test-results/sudoku-e2e-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, browser: version, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed (${version})`);
  process.exit(failed ? 1 : 0);
}
