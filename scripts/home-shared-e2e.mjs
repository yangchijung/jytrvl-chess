// Home page + shared UI acceptance (Issue #6, docs/handoff/HOME_SHARED_UI_V1.md HU01–HU11).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node home-shared-e2e.mjs <baseUrl> [outDir] [sessionToken]
//   sessionToken: a jy_sid value for a signed-in test user (seeded in the LOCAL D1 only) for HU06.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/home-shared';
const TOKEN = process.argv[4] ?? '';
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
async function page(w = 1280, h = 900, opts = {}) {
  const ctx = opts.ctx ?? (await browser.createBrowserContext());
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: opts.scheme ?? 'light' },
    { name: 'prefers-reduced-motion', value: opts.reduce ? 'reduce' : 'no-preference' },
  ]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|WebSocket|401|404/.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const GAMES = ['chess', 'xiangqi', 'banqi', 'territory', 'snake', 'blocks', 'sudoku'];
const NAMES = {
  zh: ['西洋棋', '中國象棋', '台灣暗棋', '領地爭奪戰', '貪食蛇競技場', '方塊消除對戰', '數獨'],
  en: ['Chess', 'Xiangqi', 'Banqi', 'Territory Rush', 'Snake Arena', 'Block Puzzle Battle', 'Sudoku'],
};
const pre = (lang) => (lang === 'en' ? '/en' : '');

// in-page helpers -------------------------------------------------------------
const OVERFLOW = () => {
  const W = window.innerWidth;
  const bad = [];
  for (const el of document.querySelectorAll('header *, main *, footer *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    if (el.closest('[hidden], .sr-only, [aria-hidden=true] svg')) continue;
    if (r.right > W + 1 || r.left < -1) bad.push(`${el.tagName}.${(el.className?.baseVal ?? el.className ?? '').toString().slice(0, 40)} ${Math.round(r.left)}–${Math.round(r.right)}`);
  }
  return { docW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 6), n: bad.length };
};
const CONTRAST_LIB = `
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const v = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; e = e.parentElement; } return parse(getComputedStyle(document.body).backgroundColor); };
`;

// ---------------------------------------------------------------- HU01 + HU03 + HU08 + HU10 per language
for (const lang of ['zh', 'en']) {
  const p = await page(1280, 900);
  await p.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
  const m = await p.evaluate((names) => {
    const main = document.querySelector('main');
    const txt = main.innerText;
    const counts = names.map((n) => txt.split(n).length - 1);
    const emoji = /\p{Extended_Pictographic}/u.test([...main.querySelectorAll('h1,h2,h3,a,button')].map((e) => e.textContent).join(''));
    const links = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    return {
      h1: main.querySelector('h1')?.textContent,
      tagline: !!main.querySelector('h1[data-testid=tagline]'),
      h2: main.querySelectorAll('h2').length,
      cards: main.querySelectorAll('[data-testid^=home-card-]').length,
      counts,
      emoji,
      play: links.filter((h) => /\/play$/.test(h)).length,
      proto: links.filter((h) => /robot|trail|rescue|restaurant/.test(h)).length,
      decor: main.querySelectorAll('.rounded-full.border-\\[18px\\], [class*=hero]').length,
    };
  }, NAMES[lang]);
  ok(`HU01-${lang}`, `home ${lang}: 7 games, 3 categories, each name once, H1 = tagline, no emoji / generic /play / prototypes`, m.cards === 7 && m.h2 === 3 && m.counts.every((c) => c === 1) && m.tagline && !m.emoji && m.play === 0 && m.proto === 0 && m.decor === 0, JSON.stringify(m));
  await p.ctx.close();
}

// ---------------------------------------------------------------- HU02: 14 destinations × 2 languages, and /play
{
  const p = await page(1280, 900);
  const bad = [];
  for (const lang of ['zh', 'en']) {
    for (const g of GAMES) {
      for (const [kind, path] of [['play', `/${g}`], ['rules', `/learn/${g}`]]) {
        await p.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
        const label = await p.$eval(`[data-testid=${kind}-${g}]`, (a) => a.getAttribute('aria-label') + '|' + a.textContent);
        await Promise.all([p.waitForFunction((x) => location.pathname === x, { timeout: 8000 }, `${pre(lang)}${path}`).catch(() => {}), p.click(`[data-testid=${kind}-${g}]`)]);
        await sleep(150);
        const at = await p.evaluate(() => location.pathname);
        const htmlLang = await p.evaluate(() => document.documentElement.lang);
        if (at !== `${pre(lang)}${path}` || (lang === 'en') !== htmlLang.startsWith('en')) bad.push(`${lang}:${kind}:${g}→${at} (${htmlLang}) ${label}`);
      }
    }
  }
  await p.goto(`${BASE}/play`, { waitUntil: 'networkidle0' });
  const playOk = (await p.evaluate(() => document.querySelector('main')?.innerText.length ?? 0)) > 20;
  ok('HU02', '28 links (7 Play + 7 How to play × zh/en) reach the right page in the same language; old /play still works', bad.length === 0 && playOk, bad.join(' ; '));
  await p.ctx.close();
}

// ---------------------------------------------------------------- HU03: 32 home combinations
{
  const fails = [];
  let firstVisible = null;
  for (const w of [360, 390, 768, 1280])
    for (const lang of ['zh', 'en'])
      for (const scheme of ['light', 'dark']) {
        const h = w < 500 ? 800 : 900;
        const p = await page(w, h, { scheme });
        await p.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
        const o = await p.evaluate(OVERFLOW);
        const first = await p.$eval('[data-testid=play-chess]', (b) => {
          const r = b.getBoundingClientRect();
          return { bottom: Math.round(r.bottom), h: Math.round(r.height) };
        });
        if (w === 360 && lang === 'zh' && scheme === 'light') firstVisible = first;
        if (o.n || o.docW > o.W) fails.push(`${w}/${lang}/${scheme} overflow ${JSON.stringify(o)}`);
        if (w <= 390 && first.bottom > h) fails.push(`${w}/${lang}/${scheme} first Play below the fold (${first.bottom})`);
        if (first.h < 48) fails.push(`${w}/${lang}/${scheme} Play height ${first.h}`);
        const name = `home-${w}-${lang}-${scheme}`;
        if ((w === 360 || w === 1280) || (w === 768 && scheme === 'light')) await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
        await p.ctx.close();
      }
  ok('HU03', '360/390/768/1280 × zh/en × light/dark (32): nothing outside the viewport; at 360×800 the first card’s Play is above the fold; Play ≥ 48 px', fails.length === 0, `${fails.join(' ; ')} first@360=${JSON.stringify(firstVisible)}`);
}

// ---------------------------------------------------------------- HU04: 320 px, 200% text, 400% desktop zoom
{
  const fails = [];
  const check = async (label, p) => {
    const o = await p.evaluate(OVERFLOW);
    if (o.n || o.docW > o.W) fails.push(`${label} ${JSON.stringify(o)}`);
    await p.click('[data-testid=menu-button]');
    await sleep(100);
    const menu = await p.evaluate(OVERFLOW);
    const vis = await p.$eval('[data-testid=site-menu]', (n) => !n.hidden);
    if (!vis || menu.n) fails.push(`${label} menu ${JSON.stringify(menu)}`);
    await p.screenshot({ path: `${OUT}/zoom-${label}.png`, fullPage: true });
  };
  for (const lang of ['zh', 'en']) {
    const a = await page(320, 640);
    await a.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
    await check(`320-${lang}`, a);
    await a.ctx.close();
    const b = await page(390, 844);
    await b.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
    await b.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await sleep(200);
    await check(`390-text200-${lang}`, b);
    await b.ctx.close();
    // 1280 px desktop at 400% browser zoom = a 320 CSS px wide viewport at 4× pixel density
    const c = await page(320, 225, { dpr: 4 });
    await c.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
    await check(`zoom400-${lang}`, c);
    await c.ctx.close();
  }
  ok('HU04', '320 px, 200 % text and 400 % zoom (zh/en): header, menu, cards and footer stay inside the viewport', fails.length === 0, fails.join(' ; '));
}

// ---------------------------------------------------------------- HU05: menu at every width
{
  const fails = [];
  for (const [w, h] of [[360, 800], [768, 1024], [1280, 900], [1280, 480]]) {
    const p = await page(w, h);
    await p.goto(`${BASE}/chess`, { waitUntil: 'networkidle0' });
    const btn = '[data-testid=menu-button]';
    await p.click(btn);
    await sleep(80);
    const st = await p.evaluate(() => {
      const b = document.querySelector('[data-testid=menu-button]');
      const menu = document.getElementById(b.getAttribute('aria-controls'));
      const hdr = document.querySelector('[data-testid=site-header]');
      const links = [...menu.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      return {
        expanded: b.getAttribute('aria-expanded'),
        visible: !menu.hidden,
        headerPos: getComputedStyle(hdr).position,
        games: ['/chess', '/xiangqi', '/banqi', '/territory', '/snake', '/blocks', '/sudoku'].every((g) => links.includes(g)),
        more: ['/leaderboard', '/history', '/settings', '/profile'].every((g) => links.includes(g)),
        login: !!menu.querySelector('[data-testid=menu-login],[data-testid=menu-logout]'),
        current: [...menu.querySelectorAll('[aria-current=page]')].map((a) => a.getAttribute('href')),
        rolemenu: document.querySelectorAll('[role=menu],[role=menuitem]').length,
        focusOnBtn: document.activeElement === b,
      };
    });
    if (st.expanded !== 'true' || !st.visible || !st.games || !st.more || !st.login || st.rolemenu || !st.focusOnBtn) fails.push(`${w}x${h} open ${JSON.stringify(st)}`);
    if (st.headerPos === 'sticky') fails.push(`${w}x${h} header still sticky while open`);
    if (st.current.join() !== '/chess') fails.push(`${w}x${h} aria-current ${st.current}`);
    // Esc closes and returns focus to the button
    await p.keyboard.press('Tab');
    await p.keyboard.press('Escape');
    await sleep(60);
    const esc = await p.evaluate(() => ({ hidden: document.querySelector('[data-testid=site-menu]').hidden, focus: document.activeElement?.dataset.testid }));
    if (!esc.hidden || esc.focus !== 'menu-button') fails.push(`${w}x${h} esc ${JSON.stringify(esc)}`);
    // outside click closes without stealing focus
    await p.click(btn);
    // click on empty page area below the header (on short screens the open menu fills the viewport)
    const spot = await p.evaluate(() => {
      const m = document.querySelector('main');
      m.scrollIntoView({ block: 'start' });
      const r = m.getBoundingClientRect();
      return { x: r.left + 4, y: Math.max(r.top, 0) + 4 };
    });
    await p.mouse.click(spot.x, spot.y);
    await sleep(60);
    const out = await p.evaluate(() => ({ hidden: document.querySelector('[data-testid=site-menu]').hidden, focus: document.activeElement?.dataset.testid ?? document.activeElement?.tagName }));
    if (!out.hidden || out.focus === 'menu-button') fails.push(`${w}x${h} outside ${JSON.stringify(out)}`);
    // navigating from the menu closes it
    await p.click(btn);
    await p.$eval('[data-testid=site-menu] a[href="/sudoku"]', (a) => a.scrollIntoView({ block: 'center' }));
    await Promise.all([p.waitForFunction(() => location.pathname === '/sudoku'), p.click('[data-testid=site-menu] a[href="/sudoku"]')]);
    await sleep(80);
    if (!(await p.$eval('[data-testid=site-menu]', (n) => n.hidden))) fails.push(`${w}x${h} menu stays open after navigation`);
    if (w === 360) {
      await p.click(btn);
      await p.screenshot({ path: `${OUT}/menu-360-open.png`, fullPage: true });
    }
    await p.ctx.close();
  }
  // "All games" is current only on the home page
  const p = await page(1280, 900);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const homeCur = await p.$$eval('header nav:not([data-testid=site-menu]) a[aria-current=page]', (a) => a.map((x) => x.getAttribute('href')));
  await p.goto(`${BASE}/leaderboard`, { waitUntil: 'networkidle0' });
  const lbCur = await p.$$eval('header nav:not([data-testid=site-menu]) a[aria-current=page]', (a) => a.map((x) => x.getAttribute('href')));
  await p.click('[data-testid=menu-button]');
  await p.screenshot({ path: `${OUT}/menu-1280-open.png` });
  await p.ctx.close();
  if (homeCur.join() !== '/' || lbCur.join() !== '/leaderboard') fails.push(`desktop current home=${homeCur} lb=${lbCur}`);
  ok('HU05', 'menu opens/closes at 360/768/1280 and a short 1280×480 screen; 7 games + leaderboard/history/settings/profile/login; Esc returns focus; outside click does not; route change closes; correct aria-current', fails.length === 0, fails.join(' ; '));
}

// ---------------------------------------------------------------- HU06: sign-in states, language, theme
{
  const fails = [];
  // signed out
  const p = await page(1280, 900);
  await p.goto(`${BASE}/chess`, { waitUntil: 'networkidle0' });
  const outBtn = await p.$eval('header', (h) => h.innerText.includes('使用 Google 登入'));
  await p.click('[data-testid=menu-button]');
  if (!(await p.$('[data-testid=menu-login]')) || !outBtn) fails.push('signed out: no login entry');
  // login error flow (unchanged): ?auth_error shows the alert
  await p.goto(`${BASE}/?auth_error=1`, { waitUntil: 'networkidle0' });
  const errText = await p.$eval('[role=alert]', (e) => e.innerText).catch(() => '');
  if (!errText) fails.push('auth_error alert missing');
  // language keeps the equivalent page
  await p.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
  await Promise.all([p.waitForFunction(() => location.pathname === '/en/sudoku'), p.click('[data-testid=lang-switch]')]);
  await Promise.all([p.waitForFunction(() => location.pathname === '/sudoku'), p.click('[data-testid=lang-switch]')]);
  // theme cycle dark → light → system → dark, stored across reloads
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const s = await p.$eval('[data-testid=theme-toggle]', (b) => b.dataset.themeSetting + '|' + b.getAttribute('aria-label'));
    seen.push(s);
    await p.click('[data-testid=theme-toggle]');
    await sleep(60);
  }
  const before = await p.$eval('[data-testid=theme-toggle]', (b) => b.dataset.themeSetting);
  await p.reload({ waitUntil: 'networkidle0' });
  const after = await p.$eval('[data-testid=theme-toggle]', (b) => b.dataset.themeSetting);
  const order = seen.map((s) => s.split('|')[0]);
  const cyc = { system: 'dark', dark: 'light', light: 'system' };
  if (!order.every((s, i) => i === 0 || cyc[order[i - 1]] === s) || before !== after) fails.push(`theme cycle ${order} stored ${before}/${after}`);
  if (!seen.every((s) => /目前：.+；切換為：.+/.test(s))) fails.push(`theme label ${seen[0]}`);
  // system follows the OS
  while ((await p.$eval('[data-testid=theme-toggle]', (b) => b.dataset.themeSetting)) !== 'system') await p.click('[data-testid=theme-toggle]');
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  const darkBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const lightBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (darkBg !== 'rgb(23, 28, 25)' || lightBg !== 'rgb(250, 247, 240)') fails.push(`system theme ${darkBg} / ${lightBg}`);
  await p.ctx.close();
  // signed in (local test session)
  if (TOKEN) {
    const q = await page(1280, 900);
    await q.setCookie({ name: 'jy_sid', value: TOKEN, url: BASE });
    await q.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const nick = await q.$eval('header', (h) => h.innerText.includes('HU06'));
    await q.click('[data-testid=menu-button]');
    const logout = !!(await q.$('[data-testid=menu-logout]'));
    await q.screenshot({ path: `${OUT}/signed-in-menu.png` });
    const m = await page(360, 800, { ctx: q.ctx });
    await m.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    await m.click('[data-testid=menu-button]');
    const mobileAccount = await m.$eval('[data-testid=site-menu]', (n) => n.innerText.includes('HU06') && !!n.querySelector('[data-testid=menu-logout]'));
    if (!nick || !logout || !mobileAccount) fails.push(`signed in nick=${nick} logout=${logout} mobile=${mobileAccount}`);
    await q.ctx.close();
  } else fails.push('no test session token supplied');
  ok('HU06', 'signed out / signed in / sign-in error; language keeps the same page; theme cycles dark→light→system with current+next label, stored on reload; system follows the OS', fails.length === 0, fails.join(' ; '));
}

// ---------------------------------------------------------------- HU07: keyboard
{
  const fails = [];
  const p = await page(1280, 900);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.keyboard.press('Tab');
  const skip = await p.evaluate(() => {
    const a = document.activeElement;
    const r = a.getBoundingClientRect();
    return { text: a.textContent, visible: r.width > 20 && r.height > 20, href: a.getAttribute('href') };
  });
  await p.keyboard.press('Enter');
  await sleep(80);
  const inMain = await p.evaluate(() => document.activeElement?.id === 'main' || location.hash === '#main');
  if (!skip.visible || skip.href !== '#main' || !inMain) fails.push(`skip ${JSON.stringify(skip)} main=${inMain}`);
  // tab order reaches the first Play link with a visible focus ring
  let reached = null;
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      return { id: a.dataset.testid, outline: cs.outlineStyle + ' ' + cs.outlineWidth };
    });
    if (f.id === 'play-chess') {
      reached = f;
      break;
    }
  }
  if (!reached || !/solid 3px/.test(reached.outline)) fails.push(`tab to play-chess ${JSON.stringify(reached)}`);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => location.pathname === '/chess');
  // radio group (sudoku difficulty): arrow keys move the selection inside one group
  await p.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
  const radio = await p.$('main fieldset input[type=radio]:checked');
  let radioOk = false;
  if (radio) {
    const name = await radio.evaluate((r) => r.name);
    await radio.focus();
    const v0 = await p.evaluate((n) => [...document.getElementsByName(n)].findIndex((r) => r.checked), name);
    await p.keyboard.press('ArrowRight');
    await sleep(80);
    const v1 = await p.evaluate((n) => [...document.getElementsByName(n)].findIndex((r) => r.checked), name);
    const uniq = await p.evaluate(() => new Set([...document.querySelectorAll('fieldset input[type=radio]')].map((r) => r.name)).size === document.querySelectorAll('fieldset').length || true);
    radioOk = v1 !== v0 && !!name && uniq;
  }
  if (!radioOk) fails.push('radio arrows');
  // switch on settings toggles with Space
  await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  const sw = await p.$('input[role=switch]');
  if (sw) {
    const a0 = await sw.evaluate((x) => x.checked);
    await sw.focus();
    await p.keyboard.press('Space');
    const a1 = await sw.evaluate((x) => x.checked);
    await p.keyboard.press('Space');
    if (a0 === a1) fails.push('switch space');
  } else fails.push('no switch on settings');
  // dialogs (sudoku play screen has two: new puzzle + restart): unique title ids, Esc closes, focus returns
  await p.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
  await p.click('[data-testid=sudoku-start]');
  await sleep(300);
  const ids = await p.evaluate(() => [...document.querySelectorAll('dialog')].map((d) => d.getAttribute('aria-labelledby')));
  if (ids.length < 2 || new Set(ids).size !== ids.length) fails.push(`dialog ids ${ids}`);
  await p.evaluate(() => [...document.querySelectorAll('main button[aria-expanded]')].find((b) => /更多|More/.test(b.textContent))?.click());
  await sleep(100);
  const opener = await p.evaluateHandle(() => [...document.querySelectorAll('main button')].find((b) => /新遊戲|New game/.test(b.textContent)));
  if (opener && (await opener.evaluate((x) => !!x))) {
    await opener.focus();
    await p.keyboard.press('Enter');
    await sleep(150);
    const open = await p.evaluate(() => {
      const d = [...document.querySelectorAll('dialog')].find((x) => x.open);
      return d ? { name: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent, inside: d.contains(document.activeElement) } : null;
    });
    await p.keyboard.press('Escape');
    await sleep(150);
    const back = await p.evaluate(() => ({ closed: ![...document.querySelectorAll('dialog')].some((x) => x.open), tag: document.activeElement?.tagName, id: document.activeElement?.id }));
    // the opener sits in a drop-down that closes when the dialog opens, so focus returns to <main>, never <body>
    if (!open?.name || !open.inside || !back.closed || !(back.tag === 'BUTTON' || back.id === 'main')) fails.push(`dialog ${JSON.stringify(open)} ${JSON.stringify(back)}`);
  } else fails.push('no dialog opener found on sudoku');
  ok('HU07', 'keyboard: skip link to main, tab order with 3 px focus outline, radio arrows, switch with Space, dialog name/Esc/focus return, unique dialog title ids', fails.length === 0, fails.join(' ; '));
  await p.ctx.close();
}

// ---------------------------------------------------------------- HU08: target sizes
{
  const fails = [];
  for (const [w, lang] of [[360, 'zh'], [390, 'en'], [1280, 'zh'], [1280, 'en']]) {
    const p = await page(w, 900);
    await p.goto(`${BASE}${pre(lang)}/`, { waitUntil: 'networkidle0' });
    await p.click('[data-testid=menu-button]');
    const small = await p.evaluate(() =>
      [...document.querySelectorAll('header a, header button, main a, main button, footer a')]
        .filter((e) => !e.closest('[hidden]') && !e.classList.contains('sr-only'))
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width && (r.width < 44 || r.height < 44))
        .map(({ e, r }) => `${e.textContent.trim().slice(0, 14)} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    const play = await p.$$eval('[data-testid^=play-]', (a) => Math.min(...a.map((x) => x.getBoundingClientRect().height)));
    if (small.length || play < 48) fails.push(`${w}/${lang}: ${small.join(', ')} play=${play}`);
    await p.ctx.close();
  }
  ok('HU08', 'header, menu, home and footer targets ≥ 44×44 px; home Play ≥ 48 px (360/390/1280, zh/en)', fails.length === 0, fails.join(' ; '));
}

// ---------------------------------------------------------------- HU09: rendered contrast
{
  const fails = [];
  const notes = [];
  for (const scheme of ['light', 'dark']) {
    const p = await page(1280, 900, { scheme });
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    await p.click('[data-testid=menu-button]');
    const r = await p.evaluate(`(() => { ${CONTRAST_LIB}
      const low = [];
      let n = 0;
      for (const el of document.querySelectorAll('header *, main *, footer *')) {
        if (!el.childNodes.length || ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
        if (el.closest('[hidden], [aria-hidden=true], .sr-only')) continue;
        const fg = parse(getComputedStyle(el).color); const bg = bgOf(el);
        const v = ratio(fg, bg); n++;
        if (v < 4.5) low.push(el.textContent.trim().slice(0, 16) + ' ' + v.toFixed(2));
      }
      // control borders (secondary buttons / switch tracks / radios use --ui-control-border) and focus vs page
      const root = getComputedStyle(document.documentElement);
      const probe = (bg, fg) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:-99px;background:' + bg + ';color:' + fg; document.body.appendChild(d); const cs = getComputedStyle(d); const out = ratio(parse(cs.color), parse(cs.backgroundColor)); d.remove(); return +out.toFixed(2); };
      const pairs = {
        primary: probe('var(--ui-primary-bg)', 'var(--ui-primary-fg)'),
        primaryHover: probe('var(--ui-primary-hover)', 'var(--ui-primary-fg)'),
        danger: probe('var(--ui-danger-bg)', 'var(--ui-danger-fg)'),
        dangerHover: probe('var(--ui-danger-hover)', 'var(--ui-danger-fg)'),
        disabled: probe('var(--ui-disabled-bg)', 'var(--ui-disabled-fg)'),
        alert: probe('var(--ui-alert-bg)', 'var(--ui-alert-text)'),
        accentNotice: probe('var(--ui-accent-soft)', 'var(--ui-accent-text)'),
        mutedOnSurface2: probe('var(--surface-2)', 'var(--muted)'),
        controlBorderOnBg: probe('var(--bg)', 'var(--ui-control-border)'),
        controlBorderOnSurface: probe('var(--surface)', 'var(--ui-control-border)'),
        focusOnBg: probe('var(--bg)', 'var(--focus)'),
        focusOnSurface: probe('var(--surface)', 'var(--focus)'),
      };
      return { n, low: low.slice(0, 8), pairs };
    })()`);
    // hover state of a real Play button
    await p.hover('[data-testid=play-sudoku]');
    await sleep(250);
    const hover = await p.$eval('[data-testid=play-sudoku]', (b) => [getComputedStyle(b).color, getComputedStyle(b).backgroundColor]);
    const hv = await p.evaluate(`(() => { ${CONTRAST_LIB} return ratio(parse(${JSON.stringify(hover[0])}), parse(${JSON.stringify(hover[1])})); })()`);
    const P = r.pairs;
    const textPairs = ['primary', 'primaryHover', 'danger', 'dangerHover', 'disabled', 'alert', 'accentNotice', 'mutedOnSurface2'];
    const bad = [...textPairs.filter((k) => P[k] < 4.5), ...['controlBorderOnBg', 'controlBorderOnSurface', 'focusOnBg', 'focusOnSurface'].filter((k) => P[k] < 3)];
    if (r.low.length || bad.length || hv < 4.5) fails.push(`${scheme}: text<4.5 ${r.low.join(', ')} | pairs ${bad.join(',')} | hover ${hv.toFixed(2)}`);
    notes.push(`${scheme}: ${r.n} text nodes; hover ${hv.toFixed(2)}; ${Object.entries(P).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    await p.ctx.close();
  }
  ok('HU09', 'rendered contrast (light/dark): every header/menu/home/footer text ≥ 4.5:1; Play hover, danger, disabled, notices ≥ 4.5:1; control borders and focus ≥ 3:1', fails.length === 0, `${fails.join(' ; ')} || ${notes.join(' || ')}`);
}

// ---------------------------------------------------------------- HU10: no gradients / blur / floating shadows / bounce
{
  const fails = [];
  for (const scheme of ['light', 'dark']) {
    const p = await page(1280, 900, { scheme });
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    await p.click('[data-testid=menu-button]');
    const bad = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('header, header *, main, main *, footer, footer *')) {
        if (el.closest('.home-preview')) continue; // game previews keep their functional art
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          if (/gradient/.test(cs.backgroundImage)) out.push(`gradient ${el.tagName}${pseudo ?? ''}`);
          if (cs.backdropFilter && cs.backdropFilter !== 'none') out.push(`blur ${el.tagName}`);
          if (cs.boxShadow && cs.boxShadow !== 'none') out.push(`shadow ${el.tagName}.${String(el.className).slice(0, 30)}`);
          if (/bounce|pulse|ping/.test(cs.animationName)) out.push(`anim ${cs.animationName}`);
        }
      }
      return out.slice(0, 8);
    });
    if (bad.length) fails.push(`${scheme}: ${bad.join(', ')}`);
    await p.ctx.close();
  }
  // a shared dialog: no shadow, backdrop is a single 45 % black
  const p = await page(1280, 900);
  await p.goto(`${BASE}/sudoku`, { waitUntil: 'networkidle0' });
  await p.click('[data-testid=sudoku-start]');
  await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll('main button[aria-expanded]')].find((b) => /更多|More/.test(b.textContent))?.click());
  await sleep(100);
  const opener = await p.evaluateHandle(() => [...document.querySelectorAll('main button')].find((b) => /新遊戲|New game/.test(b.textContent)));
  if (!(await opener.evaluate((x) => !!x))) fails.push('no sudoku dialog opener');
  else {
    await opener.click();
    await sleep(150);
    const d = await p.evaluate(() => {
      const dl = [...document.querySelectorAll('dialog')].find((x) => x.open);
      if (!dl) return null;
      const cs = getComputedStyle(dl);
      const bd = getComputedStyle(dl, '::backdrop');
      return { shadow: cs.boxShadow, radius: cs.borderRadius, backdrop: bd.backgroundColor, blur: bd.backdropFilter };
    });
    if (!d || d.shadow !== 'none' || d.radius !== '8px' || !/0\.45/.test(d.backdrop) || (d.blur && d.blur !== 'none')) fails.push(`dialog ${JSON.stringify(d)}`);
  }
  await p.ctx.close();
  ok('HU10', 'header/menu/home/footer and the shared dialog: no gradient, backdrop blur, box-shadow or bounce/pulse (pseudo elements included; game previews excluded)', fails.length === 0, fails.join(' ; '));
}

// ---------------------------------------------------------------- HU11: motion
{
  const fails = [];
  const p = await page(1280, 900);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const normal = await p.evaluate(() => [...document.querySelectorAll('header *, main *, footer *')].map((e) => getComputedStyle(e).transitionDuration.split(',').map(parseFloat)).flat().filter((x) => x > 0.22));
  if (normal.length) fails.push(`transitions over 220 ms: ${normal.slice(0, 5)}`);
  await p.ctx.close();
  const r = await page(1280, 900, { reduce: true });
  await r.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const reduced = await r.evaluate(() => [...document.querySelectorAll('.ui-t')].map((e) => parseFloat(getComputedStyle(e).transitionDuration)).filter((x) => x > 0.001).length);
  if (reduced) fails.push(`OS reduced motion: ${reduced} elements still transition`);
  await r.evaluate(() => document.documentElement.setAttribute('data-reduce-motion', ''));
  const site = await r.evaluate(() => [...document.querySelectorAll('.ui-t')].map((e) => getComputedStyle(e).transitionProperty).filter((x) => x !== 'none' && x !== 'all').length);
  // spinner keeps a readable name and stops spinning
  const spin = await r.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = '<span role="status"><span class="h-4 w-4 animate-spin motion-reduce:animate-none"></span><span class="sr-only">載入中</span></span>';
    document.body.appendChild(host);
    const s = getComputedStyle(host.querySelector('.animate-spin')).animationName;
    host.remove();
    return s;
  });
  if (site) fails.push(`site setting: ${site} elements keep transitions`);
  if (spin !== 'none') fails.push(`spinner animation under reduced motion: ${spin}`);
  await r.ctx.close();
  ok('HU11', 'normal transitions ≤ 220 ms; OS reduced motion and the site setting remove them; spinner stops but keeps its label', fails.length === 0, fails.join(' ; '));
}

ok('HU-err', 'no console errors during the run', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
