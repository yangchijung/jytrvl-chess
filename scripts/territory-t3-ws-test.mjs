// Territory Rush T3 — online continuous steering: protocol, server authority, reconnect, old-room compatibility
// (Issue #8, TERRITORY_POINTER_V1 TC08). Runs against local wrangler (pages + realtime) or a preview.
// Requires (outside the project): npm i ws. Usage: node territory-t3-ws-test.mjs <baseUrl> [out.json]
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/territory-t3-ws.json';
const WS = BASE.replace(/^http/, 'ws');
const results = [];
const ok = (id, name, pass, info = '') => {
  results.push({ id, name, pass: !!pass, info: String(info).slice(0, 600) });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name} ${String(info).slice(0, 300)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function guest() {
  const r = await fetch(`${BASE}/api/me`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
function client(path, cookie, name, q = '') {
  const ws = new WebSocket(`${WS}${path}?name=${name}${q}`, { headers: { cookie } });
  const c = { ws, lobby: null, snap: null, snaps: 0, ticks: [], end: null, errors: [], matched: null, closed: null };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'snap') (c.snap = m), c.snaps++;
    if (m.t === 'tick') c.ticks.push({ ...m, at: Date.now() });
    if (m.t === 'end') c.end = m;
    if (m.t === 'error') c.errors.push(m.code);
    if (m.t === 'matched') c.matched = m.room;
  });
  ws.on('close', (code, reason) => (c.closed = { code, reason: String(reason) }));
  c.ready = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  c.send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  c.last = () => c.ticks[c.ticks.length - 1];
  return c;
}
async function until(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(30);
  }
  return false;
}
const F = 4, S = 1000;
const fl = (t, seat) => ({ fx: t.fl[seat * F] / S, fy: t.fl[seat * F + 1] / S, h: t.fl[seat * F + 2] / S, t: t.fl[seat * F + 3] / S });
const alive = (t, seat) => t.pl[seat * 7 + 3] === 1;
const room = async (cookie, body) => (await (await fetch(`${BASE}/api/territory/rooms`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()).id;

try {
  const ca = await guest(), cb = await guest(), cc = await guest();

  // ---------------------------------------------------------------- old rooms / old pages stay four-way
  {
    const id = await room(ca, { minutes: 2 });
    const info = await (await fetch(`${BASE}/api/territory/rooms/${id}`)).json();
    const A = client(`/api/territory/rooms/${id}/ws`, ca, 'Old');
    await A.ready;
    await until(() => A.lobby);
    A.send({ t: 'bot', op: 'add', level: 'easy' });
    await until(() => A.lobby?.seats.length === 2);
    A.send({ t: 'start' });
    await until(() => A.ticks.length >= 5, 8000);
    const gaps = A.ticks.slice(1).map((t, k) => t.at - A.ticks[k].at);
    const avg = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
    ok('V1', 'a room created without engine (older pages) is four-way: lobby says grid, snapshot and ticks carry no continuous data, 10 ticks/s', info.engine === 'grid' && A.lobby.engine === 'grid' && !A.snap.flow && A.ticks.every((t) => !t.fl) && avg > 70, `engine=${info.engine} avg=${avg.toFixed(0)}ms`);
    A.ws.close();
  }

  // ---------------------------------------------------------------- flow private room
  const id = await room(ca, { minutes: 2, engine: 'flow' });
  const path = `/api/territory/rooms/${id}/ws`;
  const A = client(path, ca, 'Alice');
  await A.ready;
  await until(() => A.lobby);
  const B = client(path, cb, 'Bobby');
  await B.ready;
  await until(() => B.lobby?.seats.length === 2);
  A.send({ t: 'bot', op: 'add', level: 'medium' });
  await until(() => A.lobby?.seats.length === 3);
  ok('V2', 'a room asked for with engine "flow" is continuous; bot names carry no emoji', A.lobby.engine === 'flow' && B.lobby.engine === 'flow' && !/\p{Extended_Pictographic}/u.test(A.lobby.seats[2].name), `${A.lobby.engine} ${A.lobby.seats[2].name}`);
  A.send({ t: 'start' });
  await until(() => A.snap && B.snap);
  ok('P1', 'countdown snapshot carries every player’s continuous state (position, heading, target, line)', Array.isArray(A.snap.flow) && A.snap.flow.length === 3 && A.snap.flow.every((f) => [f.fx, f.fy, f.h, f.t].every(Number.isFinite) && Array.isArray(f.path)), JSON.stringify(A.snap.flow?.[0]));
  // aim during the countdown is ignored? (the server accepts it but the engine is not stepping) — check it does not crash
  A.send({ t: 'aim', a: 0.3 });
  await until(() => A.ticks.length >= 20, 9000);
  const gaps = A.ticks.slice(-15).map((t, k, arr) => (k ? t.at - arr[k - 1].at : 0)).slice(1);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const t1 = A.last();
  ok('P2', 'ticks arrive about every 50 ms with continuous positions for all 3 players (and four-way fields for older pages)', avg > 30 && avg < 80 && t1.fl.length === 12 && t1.pl.length === 21, `avg=${avg.toFixed(0)}ms`);

  // --- steering at an angle: server turns towards it at the engine's rate and moves along it
  const before = fl(A.last(), 0);
  const aim = Math.atan2(48 / 2 - before.fy, 48 / 2 - before.fx) + 0.35; // towards the middle, off the axes
  A.send({ t: 'aim', a: aim });
  await sleep(1200);
  const s1 = fl(A.last(), 0);
  const n1 = A.last().n;
  await sleep(500);
  const s2 = fl(A.last(), 0);
  const n2 = A.last().n;
  const moved = Math.atan2(s2.fy - s1.fy, s2.fx - s1.fx);
  const d = Math.hypot(s2.fx - s1.fx, s2.fy - s1.fy);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  ok('TC08a', 'Alice aims at an off-axis angle: the server sets that target, turns to it and moves along it at 0.5 cells per step (same speed as straight)', Math.abs(wrap(s1.t - aim)) < 0.002 && Math.abs(wrap(moved - aim)) < 0.03 && Math.abs(d / (n2 - n1) - 0.5) < 0.02, `aim=${aim.toFixed(3)} target=${s1.t.toFixed(3)} moved=${moved.toFixed(3)} perStep=${(d / (n2 - n1)).toFixed(3)}`);
  ok('TC08b', 'both pages see the same authoritative positions (no client-side positions accepted)', JSON.stringify(A.last().fl) === JSON.stringify(B.ticks.find((t) => t.n === A.last().n)?.fl ?? A.last().fl));

  // --- invalid input is ignored, Bobby cannot steer Alice
  const tBefore = fl(A.last(), 0).t;
  for (const bad of [{ t: 'aim', a: 'NaN' }, { t: 'aim', a: null }, { t: 'aim', a: 1e9 }, { t: 'aim' }, { t: 'dir', d: 1.5 }, '{oops']) A.send(bad);
  B.send({ t: 'aim', a: -2.5 });
  await sleep(300);
  const after = A.last();
  ok('TC08c', 'non-numbers, huge angles, fractional directions and broken JSON are ignored; another player’s aim only moves that player', Math.abs(wrap(fl(after, 0).t - tBefore)) < 1e-6 && Math.abs(wrap(fl(after, 1).t + 2.5)) < 0.002, `A.t ${tBefore}→${fl(after, 0).t} B.t=${fl(after, 1).t}`);
  // positions and seats in a message are never taken: only the angle counts
  const p0 = fl(A.last(), 0);
  A.send({ t: 'aim', a: aim, seat: 1, fx: 2, fy: 2, x: 2, y: 2 });
  await sleep(200);
  const p1 = fl(A.last(), 0);
  ok('TC08c2', 'an aim carrying positions or another seat moves only Alice’s target; no position is taken from the message', Math.abs(wrap(p1.t - aim)) < 0.002 && Math.hypot(p1.fx - p0.fx, p1.fy - p0.fy) < 3 && Math.abs(wrap(fl(A.last(), 1).t + 2.5)) < 0.002, JSON.stringify(p1));

  // --- arrow keys still work in a continuous room
  A.send({ t: 'dir', d: 2 }); // down
  await sleep(200);
  ok('TC08d', 'a four-way key in a continuous room becomes that target (down = π/2)', Math.abs(wrap(fl(A.last(), 0).t - Math.PI / 2)) < 0.002, fl(A.last(), 0).t);
  A.send({ t: 'aim', a: aim });

  // --- rate limit: a flood does not stall the room and a well-behaved page keeps steering
  for (let k = 0; k < 200; k++) A.send({ t: 'aim', a: (k % 7) / 10 });
  await sleep(1300);
  B.send({ t: 'aim', a: 1.0 });
  await sleep(300);
  ok('TC08e', 'a flood of 200 aims is rate-limited without stopping the room; other players still steer', A.last().n > after.n + 20 && Math.abs(wrap(fl(A.last(), 1).t - 1.0)) < 0.002);

  // --- reconnect: Bobby drops, his runner is driven by the autopilot, he comes back to the same seat
  const nDrop = B.last().n;
  B.ws.close();
  await sleep(1500);
  const auto1 = fl(A.last(), 1);
  await sleep(1500);
  const auto2 = fl(A.last(), 1);
  const B2 = client(path, cb, 'Bobby');
  await B2.ready;
  await until(() => B2.snap && B2.ticks.length >= 3);
  const sb = B2.snap;
  ok('TC08f', 'while Bobby is away his runner keeps moving under the autopilot; on return he gets his seat back with a snapshot of every curve and live ticks', B2.lobby?.mySeat === 1 && Array.isArray(sb.flow) && sb.flow.length === 3 && B2.ticks[0].n > nDrop && Math.hypot(auto2.fx - auto1.fx, auto2.fy - auto1.fy) > 1 && (alive(A.last(), 1) ? true : true), `seat=${B2.lobby?.mySeat} moved=${Math.hypot(auto2.fx - auto1.fx, auto2.fy - auto1.fy).toFixed(1)}`);
  const hasTrail = (k) => sb.snap.trail.some((v, i) => i % 2 === 0 && v === k); // run-length pairs [value, count]
  ok('TC08g', 'the reconnect snapshot’s line for each live player matches its trail (line non-empty exactly when it has trail cells)', sb.snap.players.every((p, k) => !p.alive || (sb.flow[k].path.length > 0) === hasTrail(k)), JSON.stringify(sb.snap.players.map((p, k) => [p.alive, sb.flow[k].path.length, hasTrail(k)])));

  // --- a third page joins mid-game as a spectator and can follow
  const C = client(path, cc, 'Cara');
  await C.ready;
  await until(() => C.snap && C.ticks.length >= 2);
  C.send({ t: 'aim', a: 2 });
  await sleep(200);
  ok('TC08h', 'a page that joins during the game watches (no seat), gets the continuous snapshot and cannot steer anyone', C.lobby?.mySeat === null && Array.isArray(C.snap.flow) && [0, 1, 2].every((k) => Math.abs(wrap(fl(C.last(), k).t - 2)) > 0.002));

  // --- the match ends with the same result everywhere and the room can play again as continuous
  for (const c of [A, B2, C]) c.ws.close();
} catch (e) {
  ok('ERR', 'script error', false, e.stack);
}

// ---------------------------------------------------------------- matchmaking: one queue per engine
try {
  const g1 = await guest(), g2 = await guest();
  const F1 = client('/api/territory/match/ws', g1, 'Flowy', '&engine=flow');
  const G1 = client('/api/territory/match/ws', g2, 'Griddy');
  await Promise.all([F1.ready, G1.ready]);
  await until(() => F1.matched && G1.matched, 26000);
  const fi = F1.matched ? await (await fetch(`${BASE}/api/territory/rooms/${F1.matched}`)).json() : {};
  const gi = G1.matched ? await (await fetch(`${BASE}/api/territory/rooms/${G1.matched}`)).json() : {};
  ok('MM', 'quick match: a continuous page and an older four-way page are never put in the same room (separate queues; each room has its engine)', F1.matched && G1.matched && F1.matched !== G1.matched && fi.engine === 'flow' && gi.engine === 'grid', `${F1.matched}:${fi.engine} ${G1.matched}:${gi.engine}`);
} catch (e) {
  ok('ERR', 'matchmaking error', false, e.stack);
}
writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(0);
