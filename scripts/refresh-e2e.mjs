// Page-refresh recovery tests for all six online games (Issue #2).
// For every game: refresh while waiting, while in progress and after the end, then check that
//  - the same room and seat come back (never demoted to spectator, no duplicate seat),
//  - the match keeps following its own rules (board clocks keep running; realtime ticks keep advancing),
//  - banqi hidden pieces never reach the refreshed browser,
//  - the finished game is stored exactly once (local D1 row count by room id, before and after refresh).
// Also records the AI-fill / disconnect-autopilot isolation evidence (bots never count as humans).
// Requires (outside the project): npm i @sparticuz/chromium puppeteer-core ws
// Usage: node refresh-e2e.mjs <baseUrl> <realtimeD1SqlitePath|-> [outDir] [signedInCookie]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const DB = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
const OUT = process.argv[4] ?? 'docs/test-results/screens';
const SIGNED = process.argv[5] ?? null;
const WS = BASE.replace(/^http/, 'ws');
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass: !!pass, info: String(info ?? '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info ?? ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 10000, every = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {
      /* page navigating */
    }
    await sleep(every);
  }
  return false;
}

// ---------- D1 (local only) ----------
function rows(table, roomId) {
  if (!DB) return null;
  const py = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
cur=c.execute('select * from '+sys.argv[2]+' where room_id=?',(sys.argv[3],))
cols=[d[0] for d in cur.description]
print(json.dumps([dict(zip(cols,r)) for r in cur.fetchall()]))`;
  return JSON.parse(execFileSync('python3', ['-c', py, DB, table, roomId]).toString());
}
const count = (table, roomId) => rows(table, roomId)?.length ?? null;

// ---------- browser ----------
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !['--single-process', '--no-zygote', '--disable-site-isolation-trials', '--disable-web-security'].includes(a) && !a.startsWith('--disable-features='))],
  headless: true,
});
const version = await browser.version();
async function player() {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 860 });
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_|404/.test(m.text()) && p.errors.push(m.text()));
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await p.evaluate(() => fetch('/api/me'));
  const cookie = (await p.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');
  return { ctx, p, cookie };
}
const attr = (p, sel, name) => p.$eval(sel, (e, n) => e.getAttribute(n), name).catch(() => null);
const room = (p) => attr(p, '[data-room-status]', 'data-room-status');
const seat = (p) => attr(p, '[data-room-status]', 'data-my-seat');
const post = (p, path, body) =>
  p.evaluate(
    async (path, body) => {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return (await r.json()).id;
    },
    path,
    body,
  );
const reload = async (p) => {
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(800);
};
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
async function guestCookie() {
  const r = await fetch(`${BASE}/api/me`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

// ---------- board-game driver (same cookie as the page = same player) ----------
function boardClient(id, cookie) {
  const ws = new WebSocket(`${WS}/api/rooms/${id}/ws?name=Driver`, { headers: { cookie } });
  const c = { ws, state: null, errors: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'state') c.state = m.room;
    if (m.t === 'error') c.errors.push(m.code);
  });
  c.ready = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}
async function boardMove(id, cookie, m) {
  const c = boardClient(id, cookie);
  await c.ready;
  await waitFor(() => c.state, 5000, 30);
  const n = c.state.moves.length;
  c.send({ t: 'move', m, ply: n });
  const done = await waitFor(() => c.state.moves.length === n + 1 || c.errors.length, 5000, 30);
  c.ws.close();
  if (!done || c.errors.length) throw new Error(`move ${m} failed: ${c.errors.join(',')}`);
  return c.state;
}

const BOARD = {
  chess: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  xiangqi: ['b1c3', 'b10c8', 'h1g3', 'h10g8'],
  banqi: ['f:a1', 'f:b1', 'f:c1', 'f:d1'],
};

async function boardGame(game) {
  const A = await player();
  const B = await player();
  const id = await post(A.p, '/api/rooms', { game, minutes: 5, inc: 0, side: 'first' });
  const T = `${game} refresh`;
  // --- waiting ---
  await A.p.goto(`${BASE}/room/${id}`, { waitUntil: 'networkidle0' });
  await waitFor(async () => (await room(A.p)) === 'waiting');
  await reload(A.p);
  ok(`${T}: waiting → same room, host keeps seat 0`, (await waitFor(async () => (await room(A.p)) === 'waiting', 20000)) && (await seat(A.p)) === '0' && A.p.url().endsWith(id), `${A.p.url()} seat=${await seat(A.p)}`);
  // --- in progress ---
  await B.p.goto(`${BASE}/room/${id}`, { waitUntil: 'networkidle0' });
  await waitFor(async () => (await room(A.p)) === 'playing' && (await room(B.p)) === 'playing');
  const cookies = [A.cookie, B.cookie];
  for (let i = 0; i < 4; i++) await boardMove(id, cookies[i % 2], BOARD[game][i]);
  await waitFor(async () => (await attr(A.p, '[data-plies]', 'data-plies')) === '4');
  // observer (third person) to read clocks and hidden-info state
  const obs = boardClient(id, await guestCookie());
  await obs.ready;
  await waitFor(() => obs.state?.moves.length === 4, 5000, 30);
  const before = structuredClone(obs.state);
  let cdp = null;
  const frames = [];
  if (game === 'banqi') {
    cdp = await A.p.createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameReceived', (e) => frames.push(e.response.payloadData));
  }
  const t0 = Date.now();
  await reload(A.p); // side to move (seat 0) refreshes: its clock must keep running
  await reload(B.p);
  const restored = await waitFor(async () => (await room(A.p)) === 'playing' && (await room(B.p)) === 'playing' && (await attr(A.p, '[data-plies]', 'data-plies')) === '4' && (await attr(B.p, '[data-plies]', 'data-plies')) === '4');
  ok(`${T}: in progress → both seats restored with all 4 plies`, restored && (await seat(A.p)) === '0' && (await seat(B.p)) === '1', `seats ${await seat(A.p)}/${await seat(B.p)}`);
  ok(`${T}: in progress → nobody demoted to spectator`, !(await A.p.evaluate(() => document.body.innerText.includes('觀戰'))) && !(await B.p.evaluate(() => document.body.innerText.includes('觀戰'))));
  await sleep(1500);
  const elapsed = Date.now() - t0;
  const s1 = await boardMove(id, A.cookie, game === 'chess' ? 'f1c4' : game === 'xiangqi' ? 'a1a2' : 'f:e1');
  const used = before.clock.ms[0] - s1.clock.ms[0];
  ok(`${T}: clock kept running for the side to move during refresh (not paused, not reset)`, used >= elapsed - 1500 && used <= elapsed + 2500 && Math.abs(s1.clock.ms[1] - before.clock.ms[1]) <= 20, `elapsed ${elapsed} ms, clock used ${used} ms, opponent ${before.clock.ms[1]}→${s1.clock.ms[1]}`);
  if (game === 'banqi') {
    const states = frames.filter((f) => f.includes('"state"'));
    const leaks = states.filter((f) => f.includes('"layout"') || JSON.parse(f).room?.final);
    const revealed = states.map((f) => JSON.parse(f).room.position.view.cells.filter((c) => c !== 'X').length);
    ok(`${T}: hidden pieces never sent to the refreshed browser`, states.length > 0 && leaks.length === 0 && revealed.every((n) => n <= 5), `${states.length} state frames, face-up per frame ${[...new Set(revealed)].join('/')}`);
    await cdp.detach();
  }
  await shot(A.p, `rf-${game}-playing-after-refresh`);
  // --- ended ---
  const R = boardClient(id, B.cookie);
  await R.ready;
  await waitFor(() => R.state, 4000, 30);
  R.send({ t: 'resign' });
  await waitFor(() => R.state?.result, 4000, 30);
  R.ws.close();
  await waitFor(async () => (await room(A.p)) === 'ended' && (await room(B.p)) === 'ended');
  await sleep(800);
  const n1 = count('games', id);
  await reload(A.p);
  await reload(B.p);
  const endShown = await waitFor(async () => (await room(A.p)) === 'ended' && (await room(B.p)) === 'ended');
  await sleep(1500);
  const n2 = count('games', id);
  ok(`${T}: ended → result screen restored for both players`, endShown, `${await room(A.p)}/${await room(B.p)}`);
  if (DB) ok(`${T}: ended → stored exactly once, refresh adds no record`, n1 === 1 && n2 === 1, `rows before/after refresh ${n1}/${n2}`);
  await shot(B.p, `rf-${game}-ended-after-refresh`);
  ok(`${T}: no page errors`, A.p.errors.length + B.p.errors.length === 0, [...A.p.errors, ...B.p.errors].join(' | '));
  obs.ws.close();
  await A.ctx.close();
  await B.ctx.close();
}

// ---------- realtime games ----------
const RT = {
  territory: { create: '/api/territory/rooms', table: 'territory_games', body: { minutes: 2 } },
  snake: { create: '/api/arena/snake/rooms', table: 'arena_games', body: { minutes: 2, map: 'open' } },
  blocks: { create: '/api/arena/blocks/rooms', table: 'arena_games', body: { minutes: 2 } },
};
const app = (p, n) => attr(p, '[role=application]', n);
const lobbyCount = (p) => p.evaluate(() => document.querySelectorAll('[data-room-status=waiting] ul li').length).catch(() => -1);
const clickText = (p, text) =>
  p.evaluate((text) => {
    const el = [...document.querySelectorAll('button')].find((e) => e.textContent.trim().includes(text) && !e.disabled);
    el?.click();
    return !!el;
  }, text);

async function realtimeGame(game) {
  const cfg = RT[game];
  const A = await player();
  const B = await player();
  const id = await post(A.p, cfg.create, cfg.body);
  const url = `${BASE}/${game}/room/${id}`;
  const T = `${game} refresh`;
  // --- waiting ---
  await A.p.goto(url, { waitUntil: 'networkidle0' });
  await waitFor(async () => (await room(A.p)) === 'waiting');
  await B.p.goto(url, { waitUntil: 'networkidle0' });
  await waitFor(async () => (await lobbyCount(A.p)) === 2);
  await reload(A.p);
  await reload(B.p);
  const w = await waitFor(async () => (await room(A.p)) === 'waiting' && (await lobbyCount(A.p)) === 2 && (await lobbyCount(B.p)) === 2);
  ok(`${T}: waiting → same seats, host kept, no duplicate seat`, w && (await seat(A.p)) === '0' && (await attr(A.p, '[data-room-status]', 'data-host')) === '1' && (await seat(B.p)) === '1', `seats ${await seat(A.p)}/${await seat(B.p)}, lobby size ${await lobbyCount(A.p)}`);
  if (game !== 'blocks') {
    // a computer seat keeps the match going while the humans' snakes / players crash
    await clickText(A.p, '加入電腦');
    await waitFor(async () => (await lobbyCount(A.p)) === 3);
  }
  // --- in progress ---
  // snakes keep circling (clockwise turns every ~3 steps) through a second connection of the same players
  // while the refresh checks run, so the match is still on when the refreshed page comes back
  const steer =
    game === 'snake'
      ? [A.cookie, B.cookie].map((cookie) => {
          const ws = new WebSocket(`${WS}/api/arena/snake/rooms/${id}/ws?name=Driver`, { headers: { cookie } });
          let d = 0;
          const timer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'dir', d: (d = (d + 1) % 4) })), 300);
          return () => {
            clearInterval(timer);
            ws.close();
          };
        })
      : [];
  await clickText(A.p, '開始對戰');
  await waitFor(async () => ['countdown', 'playing'].includes(await app(B.p, 'data-status')), 8000);
  // snakes / players that nobody steers hit a wall within seconds, so those pages are refreshed during the countdown
  if (game === 'blocks') await waitFor(async () => (await app(B.p, 'data-status')) === 'playing', 8000);
  const tick0 = Number((await app(B.p, 'data-tick')) ?? 0);
  const pieces0 = Number((await attr(B.p, '[data-board="0"]', 'data-pieces')) ?? 0);
  await reload(B.p);
  const back = await waitFor(async () => (await room(B.p)) === 'game' && ['countdown', 'playing'].includes(await app(B.p, 'data-status')));
  ok(`${T}: in progress → seat restored (not spectator), match still running`, back && (await seat(B.p)) === '1', `seat=${await seat(B.p)} status=${await app(B.p, 'data-status')}`);
  if (game === 'blocks') {
    const pieces1 = Number((await attr(B.p, '[data-board="0"]', 'data-pieces')) ?? -1);
    ok(`${T}: in progress → own board restored from the server`, pieces1 >= pieces0, `pieces ${pieces0} → ${pieces1}`);
  } else {
    // refreshed during the countdown: the server keeps its own schedule, the page just follows it
    await waitFor(async () => Number((await app(B.p, 'data-tick')) ?? 0) > tick0 + 5, 8000);
    const tick1 = Number((await app(B.p, 'data-tick')) ?? 0);
    const tickA = Number((await app(A.p, 'data-tick')) ?? 0);
    ok(`${T}: in progress → server clock kept running, refreshed client in sync`, tick1 > tick0 && Math.abs(tickA - tick1) <= 5, `tick ${tick0} → ${tick1} (other player ${tickA})`);
  }
  await shot(B.p, `rf-${game}-playing-after-refresh`);
  steer.forEach((stop) => stop());
  // --- end the match ---
  if (game === 'blocks') {
    for (let i = 0; i < 60 && (await app(A.p, 'data-status')) === 'playing'; i++) {
      await A.p.keyboard.press('Space');
      await sleep(60);
    }
  }
  if (process.env.DEBUG) {
    const cdp = await A.p.createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameReceived', (e) => !/sstep|tick|bst|pong/.test(e.response.payloadData.slice(0, 12)) && console.log('A<-', e.response.payloadData.slice(0, 160)));
    cdp.on('Network.webSocketFrameSent', (e) => !/ping|"in"|dir/.test(e.response.payloadData) && console.log('A->', e.response.payloadData.slice(0, 160)));
  }
  const ended = await waitFor(async () => (await app(A.p, 'data-status')) === 'ended' && (await app(B.p, 'data-status')) === 'ended', game === 'territory' ? 150000 : 90000, 500);
  ok(`${T}: match ends`, ended);
  await sleep(1000);
  const n1 = count(cfg.table, id);
  await reload(A.p);
  await reload(B.p);
  const endBack = await waitFor(async () => (await app(A.p, 'data-status')) === 'ended' && (await app(B.p, 'data-status')) === 'ended', 8000);
  await sleep(1500);
  const n2 = count(cfg.table, id);
  ok(`${T}: ended → result screen restored after refresh`, endBack, `${await app(A.p, 'data-status')}/${await app(B.p, 'data-status')}`);
  if (DB) {
    ok(`${T}: ended → stored exactly once, refresh adds no record`, n1 === 1 && n2 === 1, `rows before/after refresh ${n1}/${n2}`);
    const r = rows(cfg.table, id)[0];
    if (r) {
      const players = JSON.parse(r.players);
      const bots = players.filter((x) => x.bot).length;
      ok(`${T}: stored humans = real people only (${game === 'blocks' ? 'no bots' : 'bot seat excluded'})`, r.humans === 2 && players.length === 2 + bots, `humans=${r.humans} seats=${players.length} bots=${bots} counted=${r.counted}`);
    }
  }
  await shot(A.p, `rf-${game}-ended-after-refresh`);
  ok(`${T}: no page errors`, A.p.errors.length + B.p.errors.length === 0, [...A.p.errors, ...B.p.errors].join(' | '));
  await A.ctx.close();
  await B.ctx.close();
}

// ---------- isolation: one person + computer seats never count as a scored match ----------
function arenaClient(path, cookie) {
  const ws = new WebSocket(`${WS}${path}?name=Solo`, { headers: { cookie } });
  const c = { ws, lobby: null, end: null };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'end') c.end = m;
  });
  c.ready = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}
async function isolation(game) {
  const cookie = SIGNED ?? (await guestCookie());
  const cfg = RT[game];
  const r = await fetch(BASE + cfg.create, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(cfg.body) });
  const id = (await r.json()).id;
  const path = game === 'territory' ? `/api/territory/rooms/${id}/ws` : `/api/arena/${game}/rooms/${id}/ws`;
  const c = arenaClient(path, cookie);
  await c.ready;
  await waitFor(() => c.lobby, 5000, 30);
  c.send({ t: 'bot', op: 'add', level: 'easy' });
  await waitFor(() => c.lobby?.seats.length === 2, 5000, 30);
  c.send({ t: 'start' });
  // the lone human sends nothing: it runs into a wall (territory/snake) or the 2-minute timer ends it (blocks)
  await waitFor(() => c.end, 150000, 200);
  await sleep(800);
  const row = DB ? rows(cfg.table, id)[0] : null;
  ok(`isolation ${game}: 1 person + computer → not recorded${SIGNED ? ' (signed-in)' : ''}`, c.end?.recorded === false && (!DB || (row && row.humans === 1 && row.counted === 0)), `end.recorded=${c.end?.recorded} humans=${row?.humans} counted=${row?.counted} reason=${c.end?.reason ?? c.end?.result?.reason}`);
  c.ws.close();
}

// optional filter, e.g. ONLY=snake,blocks
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (g) => !ONLY || ONLY.includes(g);
try {
  for (const g of ['chess', 'xiangqi', 'banqi'].filter(want)) await boardGame(g);
  await Promise.all(['territory', 'snake', 'blocks'].filter(want).map((g) => realtimeGame(g)));
  if (!ONLY || ONLY.includes('isolation')) await Promise.all(['territory', 'snake', 'blocks'].map((g) => isolation(g)));
} catch (e) {
  ok('unexpected exception', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  writeFileSync(`docs/test-results/refresh-e2e-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, browser: version, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed (${version})`);
  process.exit(failed ? 1 : 0);
}
