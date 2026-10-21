// Territory Rush T3 — online continuous steering in real pages: friend room from the hub, two browsers,
// pointer aiming confirmed by the server, refresh mid-game, quick match. (Issue #8, TC08/TC09)
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core
// Usage: node territory-t3-e2e.mjs <baseUrl> [outDir]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/screens/territory-t3';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 900) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`);
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
  await p.setViewport({ width: w, height: h, isMobile: !!opts.touch, hasTouch: !!opts.touch, deviceScaleFactor: opts.dpr ?? 1 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.scheme ?? 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|401|Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()));
  p.ctx = ctx;
  return p;
}
const S = (p) =>
  p.evaluate(() => {
    const c = window.__tr;
    if (!c?.game) return null;
    const f = c.flow;
    return { status: c.status, flow: !!f, me: c.me, tick: c.game.tick, engine: c.lobby?.engine, players: c.game.players.map((pl, i) => ({ alive: pl.alive, trail: pl.trail.length, x: f?.flow[i]?.fx, y: f?.flow[i]?.fy, h: f?.flow[i]?.heading, t: f?.flow[i]?.target, path: f?.flow[i]?.path.length })), heads: c.screenHeads };
  });
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const wrapRect = (p) => p.$eval('[role=application]', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top }; });
async function aimMouse(p, angle, dist = 380) {
  const s = await S(p);
  const h = s.heads[s.me[0]];
  const r = await wrapRect(p);
  await p.mouse.move(r.left + h.x + Math.cos(angle) * dist, r.top + h.y + Math.sin(angle) * dist, { steps: 2 });
}
/** A test player that plays sensibly: short loops out from its land and back home (so it stays alive while the test waits). */
const keep = (p, on) =>
  p.evaluate((on) => {
    clearInterval(window.__keep);
    if (!on) return;
    let phase = 0;
    window.__keep = setInterval(() => {
      const c = window.__tr;
      const f = c?.flow;
      const i = c?.me[0];
      const g = c?.game;
      if (!f || i === undefined || !f.flow[i] || !g.players[i].alive) return;
      let sx = 0, sy = 0, n = 0;
      for (let k = 0; k < g.owner.length; k++) if (g.owner[k] === i) (sx += k % g.w), (sy += Math.floor(k / g.w)), n++;
      const hx = n ? sx / n + 0.5 : g.w / 2, hy = n ? sy / n + 0.5 : g.h / 2;
      const me = f.flow[i];
      const home = Math.atan2(hy - me.fy, hx - me.fx);
      const out = g.players[i].trail.length;
      const wr = (x) => Math.atan2(Math.sin(x), Math.cos(x));
      // a loop like a careful child: out for a few cells, keep turning one way, head home once facing it
      if (out === 0) phase = 0;
      else if (out > 5 && phase === 0) phase = 1;
      if (phase === 1 && Math.abs(wr(me.heading - home)) < 0.4) phase = 2;
      const t = out === 0 ? Math.atan2(g.h / 2 - me.fy, g.w / 2 - me.fx) + Math.PI / 2 : phase === 1 ? me.heading + 0.5 : phase === 2 ? home : me.target; // leave sideways: two runners spawn facing each other
      // stay off the walls
      const m = 7;
      const nx = me.fx + Math.cos(t) * m, ny = me.fy + Math.sin(t) * m;
      c.steerAngle(0, nx < 1 || ny < 1 || nx > g.w - 1 || ny > g.h - 1 ? Math.atan2(g.h / 2 - me.fy, g.w / 2 - me.fx) : t);
    }, 50);
  }, on);
async function clickText(p, re) {
  const ok = await p.evaluate((src) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll('button, a')].find((e) => rx.test(e.textContent ?? ''));
    if (b) b.click();
    return !!b;
  }, re.source);
  if (!ok) throw new Error(`no button ${re}`);
}

try {
  /** Host makes a friend room from the hub; a phone joins by the link; the host starts. */
  async function room(phoneDpr = 1) {
    const A = await page(1280, 900);
    await A.goto(`${BASE}/territory`, { waitUntil: 'networkidle0' });
    await A.$eval('a[href$="/territory/new-room"]', (a) => a.click());
    await A.waitForFunction(() => location.pathname.endsWith('/territory/new-room'));
    await sleep(300);
    await clickText(A, /建立房間|好友房|Create|room/i).catch(async () => {
      await A.$$eval('main button', (bs) => bs[bs.length - 1].click());
    });
    await A.waitForFunction(() => /\/territory\/room\/[A-Z0-9]{6}$/.test(location.pathname), { timeout: 10000 });
    const url = await A.evaluate(() => location.href);
    await A.waitForSelector('[data-room-status=waiting][data-host="1"]');
    const B = await page(390, 844, { touch: true, dpr: phoneDpr });
    await B.goto(url, { waitUntil: 'domcontentloaded' });
    await B.waitForSelector('[data-room-status=waiting][data-my-seat="1"]', { timeout: 10000 });
    const engine = await A.evaluate(async () => (await (await fetch(`/api/territory/rooms/${location.pathname.split('/').pop()}`)).json()).engine);
    return { A, B, url, engine };
  }
  async function begin(A, B) {
    await clickText(A, /開始|Start/);
    await A.waitForSelector('[role=application][data-flow=true]', { timeout: 10000 });
    if (B) await B.waitForSelector('[role=application][data-flow=true]', { timeout: 10000 });
    await A.waitForFunction(() => window.__tr?.status === 'playing', { timeout: 10000 });
  }

  // ---------------------------------------------------------------- room 1: the phone, in the first seconds of play
  // Runners can be knocked out by the other test page within seconds (that is the game). When a check's
  // precondition (both runners alive, match running) is lost, the room is replayed, at most 3 times; the
  // number of replays is recorded.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const keepResults = results.length;
    const { A, B, engine } = await room(1);
    ok('T3-01', 'a friend room made from the hub (首頁 → 領地爭奪戰 → 建立私人房間) is a continuous room; a phone joins by the shared link', engine === 'flow', engine);
    await begin(A, B);
    await keep(A, true);
    await B.waitForFunction(() => window.__tr?.status === 'playing', { timeout: 10000 });
    await keep(B, true);
    await sleep(600);
    await keep(B, false); // hands off only for the tap
    // phone: a tap turns the guest at once (towards the middle, off the axes)
    const cdp = await B.target().createCDPSession();
    const sb = await S(B);
    const seatB = sb.me[0];
    const bh = sb.heads[seatB];
    if (!bh) { await A.ctx.close(); await B.ctx.close(); console.log('retry room 1 (guest out before the tap)'); continue; }
    const br = await wrapRect(B);
    const tapA = Math.atan2(24 - sb.players[seatB].y, 24 - sb.players[seatB].x) - 0.5;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: br.left + bh.x + Math.cos(tapA) * 80, y: br.top + bh.y + Math.sin(tapA) * 80, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
    await sleep(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(350);
    const [sa2, sb2] = await Promise.all([S(A), S(B)]);
    await keep(B, true);
    ok('T3-04', 'phone: a tap turns the guest’s runner; the server confirms it and the host’s page sees the same target', Math.abs(wrap(sb2.players[seatB].t - tapA)) < 0.1 && Math.abs(wrap(sa2.players[seatB].t - tapA)) < 0.1, `tap=${tapA.toFixed(2)} guest=${sb2.players[seatB].t?.toFixed(2)} host=${sa2.players[seatB].t?.toFixed(2)}`);
    const dTick = Math.abs(sa2.tick - sb2.tick);
    const dPos = Math.hypot(sa2.players[seatB].x - sb2.players[seatB].x, sa2.players[seatB].y - sb2.players[seatB].y);
    ok('T3-03', 'host and phone show the same runner at the same place (within the ticks between the two reads)', dPos <= dTick * 0.5 + 0.6, `dTick=${dTick} dPos=${dPos.toFixed(2)}`);
    await B.screenshot({ path: `${OUT}/room-guest-390.png` });
    // refresh the phone mid-game
    await B.reload({ waitUntil: 'domcontentloaded' });
    await B.waitForSelector('[role=application][data-flow=true]', { timeout: 10000 });
    await keep(B, true);
    await sleep(500);
    const r1 = await S(B);
    await sleep(500);
    const r2 = await S(B);
    ok('T3-05', 'refreshing the phone during the game returns to the same seat with every runner and line restored; the game keeps running (or, if the match ended while the slow test page reloaded, the result is shown)', r1 && r1.me[0] === seatB && r1.flow && (r2.status === 'playing' ? r2.tick > r1.tick : r2.status === 'ended' && !!(await B.$('[role=dialog], [data-testid=tr-end], .end, [aria-modal]'))) && r1.players.every((p) => !p.alive || (p.path > 0) === (p.trail > 0)), JSON.stringify({ status: r2?.status, t: [r1?.tick, r2?.tick], p: r1?.players.map((p) => [p.alive, p.trail, p.path]) }));
    const sc = await B.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    ok('T3-06', 'phone layout: no sideways scroll; touch hint shown', !sc && /點一下轉向/.test(await B.$eval('[data-testid=tr-hint]', (e) => e.textContent)));
    await A.ctx.close();
    await B.ctx.close();
    const lost = !(sa2.status === 'playing' && sa2.players.every((p) => p.alive));
    if (lost && attempt < 3) {
      results.splice(keepResults);
      console.log(`retry room 1 (a runner was knocked out before the checks finished), attempt ${attempt + 1}`);
      continue;
    }
    ok('T3-R1', 'room 1 replays needed because a runner was knocked out mid-check', true, `${attempt - 1}`);
    break;
  }

  // ---------------------------------------------------------------- room 2: the host's mouse; the guest has left (server autopilot)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const keepResults = results.length;
    const { A, B } = await room(1);
    await begin(A, B);
    await keep(A, true);
    await B.ctx.close(); // the guest leaves: its runner is driven by the server's autopilot
    await sleep(600);
    await keep(A, false);
    const s0 = await S(A);
    const me = s0.me[0];
    if (!s0.heads[me]) { await A.ctx.close(); console.log('retry room 2 (host out before the check)'); continue; }
    const aim = Math.atan2(24 - s0.players[me].y, 24 - s0.players[me].x) + 0.4;
    await aimMouse(A, aim);
    await sleep(700);
    const s1 = await S(A);
    await sleep(400);
    const s2 = await S(A);
    const moved = Math.atan2(s2.players[me].y - s1.players[me].y, s2.players[me].x - s1.players[me].x);
    const hint = await A.$eval('[data-testid=tr-hint]', (e) => e.textContent);
    ok('T3-02', 'the host aims the mouse (no button) at an off-axis angle: the server-confirmed target follows the pointer and the runner moves along it', s2.status === 'playing' && s2.players[me].alive && Math.abs(wrap(s1.players[me].t - aim)) < 0.15 && Math.abs(wrap(moved - s1.players[me].t)) < 0.05 && /滑鼠指向哪裡/.test(hint), `status=${s2.status} aim=${aim.toFixed(2)} target=${s1.players[me].t?.toFixed(2)} moved=${moved.toFixed(2)}`);
    const other = 1 - me;
    const o1 = s1.players[other], o2 = s2.players[other];
    ok('T3-08', 'the guest who left keeps moving under the server autopilot', !o2.alive || Math.hypot(o2.x - o1.x, o2.y - o1.y) > 1, JSON.stringify([o1, o2].map((o) => [o.alive, o.x?.toFixed(1), o.y?.toFixed(1)])));
    await A.screenshot({ path: `${OUT}/room-host-1280.png` });
    await A.ctx.close();
    if (!(s2.status === 'playing' && s2.players[me].alive) && attempt < 3) {
      results.splice(keepResults);
      console.log(`retry room 2, attempt ${attempt + 1}`);
      continue;
    }
    ok('T3-R2', 'room 2 replays needed', true, `${attempt - 1}`);
    break;
  }

  // ---------------------------------------------------------------- quick match from the hub (alone: bots fill in)
  const Q = await page(1280, 900, { scheme: 'dark' });
  await Q.goto(`${BASE}/en/territory`, { waitUntil: 'networkidle0' });
  await Q.$eval('a[href$="/territory/match"]', (a) => a.click());
  await Q.waitForFunction(() => /\/territory\/room\/[A-Z0-9]{6}$/.test(location.pathname), { timeout: 30000 });
  await Q.waitForSelector('[role=application][data-flow=true]', { timeout: 15000 });
  const q = await S(Q);
  await Q.screenshot({ path: `${OUT}/match-en-dark-1280.png` });
  ok('T3-07', 'quick match from the English hub (alone, so computer players fill the room) is continuous', q.engine === 'flow' && q.flow && q.players.length >= 4, `${q.engine} players=${q.players.length}`);
  await Q.ctx.close();
  ok('ALL', 'no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
