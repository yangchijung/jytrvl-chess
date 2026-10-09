// Territory Rush multiplayer protocol tests against a running JY Chess (local wrangler or production).
// Requires: npm i ws (outside the project). Usage: node territory-ws-test.mjs <baseUrl> [cookieA] [cookieB]
// cookieA/B: optional signed-in session cookies (e.g. "jy_sid=…") to verify stats recording.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const WS = BASE.replace(/^http/, 'ws');
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function guest() {
  const r = await fetch(`${BASE}/api/me`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
function client(path, cookie, name) {
  const ws = new WebSocket(`${WS}${path}?name=${name}`, { headers: { cookie } });
  const c = { ws, lobby: null, snap: null, ticks: [], end: null, errors: [], matched: null, queue: 0, tickTimes: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'tick') {
      c.ticks.push(m);
      c.tickTimes.push(Date.now());
    }
    if (m.t === 'end') c.end = m;
    if (m.t === 'error') c.errors.push(m.code);
    if (m.t === 'matched') c.matched = m.room;
    if (m.t === 'queue') c.queue = m.waiting;
  });
  c.ready = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}
async function until(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(40);
  }
  return false;
}
const pos = (tick, seat) => [tick.pl[seat * 7], tick.pl[seat * 7 + 1], tick.pl[seat * 7 + 2], tick.pl[seat * 7 + 3]];

try {
  const ca = process.argv[3] ?? (await guest());
  const cb = process.argv[4] ?? (await guest());
  const cc = await guest();
  // ---- private room lifecycle ----
  const { id } = await (await fetch(`${BASE}/api/territory/rooms`, { method: 'POST', headers: { cookie: ca, 'content-type': 'application/json' }, body: '{"minutes":2}' })).json();
  ok('private room created', /^[A-HJ-NP-Z2-9]{6}$/.test(id ?? ''), id);
  const path = `/api/territory/rooms/${id}/ws`;
  const A = client(path, ca, 'Alice');
  await A.ready;
  await until(() => A.lobby);
  ok('creator is host in lobby', A.lobby?.hostSeat === 0 && A.lobby?.mySeat === 0);
  const B = client(path, cb, 'Bobby');
  await B.ready;
  await until(() => B.lobby?.seats.length === 2);
  ok('second player seated', B.lobby?.mySeat === 1 && A.lobby?.seats.length === 2);
  B.send({ t: 'start' });
  await until(() => B.errors.length);
  ok('non-host cannot start', B.errors.includes('not_host'));
  A.send({ t: 'bot', op: 'add', level: 'hard' });
  await until(() => A.lobby?.seats.length === 3);
  ok('host adds a bot', A.lobby?.seats[2]?.bot === true && A.lobby?.seats[2]?.level === 'hard');
  A.send({ t: 'bot', op: 'remove', seat: 2 });
  await until(() => A.lobby?.seats.length === 2);
  ok('host removes a bot', A.lobby?.seats.length === 2);
  A.send({ t: 'start' });
  ok('snapshot sent at countdown', await until(() => A.snap && B.snap));
  ok('snapshot has map and two players', A.snap?.snap.players.length === 2 && A.snap?.snap.w === 48);
  ok('ticks start after countdown', await until(() => A.ticks.length >= 10, 8000));
  // tick rate ≈ 10 Hz
  const tt = A.tickTimes.slice(-10);
  const rate = (tt.length - 1) / ((tt.at(-1) - tt[0]) / 1000);
  ok('tick rate ~10/s', rate > 7 && rate < 13, rate.toFixed(1));
  // speed is server-fixed: one cell per tick
  const t1 = A.ticks.at(-2),
    t2 = A.ticks.at(-1);
  const [ax1, ay1] = pos(t1, 0),
    [ax2, ay2] = pos(t2, 0);
  ok('server moves exactly one cell per tick', Math.abs(ax2 - ax1) + Math.abs(ay2 - ay1) === 1);
  // flooding inputs cannot speed anyone up
  const before = A.ticks.length;
  const p0 = pos(A.ticks.at(-1), 0);
  for (let i = 0; i < 200; i++) A.send({ t: 'dir', d: i % 4 });
  await until(() => A.ticks.length >= before + 5);
  const p5 = pos(A.ticks[before + 4], 0);
  const moved = Math.abs(p5[0] - p0[0]) + Math.abs(p5[1] - p0[1]);
  ok('input flood cannot increase speed', moved <= 5, `moved ${moved} cells in 5 ticks`);
  // forged messages are ignored
  A.send({ t: 'dir', d: 9 });
  A.send({ t: 'move', x: 1, y: 1 });
  await sleep(300);
  ok('forged messages ignored (connection stays up)', A.ws.readyState === 1);
  // spectator joins mid-game
  const C = client(path, cc, 'Carol');
  await C.ready;
  ok('late joiner receives snapshot as spectator', await until(() => C.snap && C.snap.mySeat === null));
  // reconnect: B drops and comes back to the same seat
  B.ws.close();
  await sleep(500);
  const B2 = client(path, cb, 'Bobby');
  await B2.ready;
  ok('reconnect restores seat with snapshot', await until(() => B2.snap?.mySeat === 1));
  // B drives into the wall → the match ends by last standing (A may also crash after the random input flood)
  const dirToWall = (() => {
    const [bx, by] = pos(A.ticks.at(-1), 1);
    return bx < 24 ? 3 : 1;
  })();
  for (let i = 0; i < 40 && !A.end; i++) {
    B2.send({ t: 'dir', d: dirToWall });
    await sleep(120);
  }
  ok('match ends when one player is left', await until(() => A.end, 15000), JSON.stringify(A.end?.result));
  ok('winner is the survivor', A.end?.result.reason === 'last_standing' && A.end?.result.ranking[0] === A.end?.result.winner && A.end?.result.ranking.length === 2);
  if (process.argv[3]) ok('stats recorded for signed-in players', A.end?.recorded === true);
  // rematch back to lobby
  A.send({ t: 'again' });
  ok('host can start a rematch lobby', await until(() => A.lobby?.status === 'lobby'));
  for (const x of [A, B2, C]) x.ws.close();

  // ---- matchmaking ----
  const M1 = client('/api/territory/match/ws', ca, 'Alice');
  const M2 = client('/api/territory/match/ws', cb, 'Bobby');
  await Promise.all([M1.ready, M2.ready]);
  ok('matchmaking pairs players', await until(() => M1.matched && M2.matched && M1.matched === M2.matched, 16000), M1.matched ?? '');
  if (M1.matched) {
    const R1 = client(`/api/territory/rooms/${M1.matched}/ws`, ca, 'Alice');
    await R1.ready;
    ok('matched room filled with bots to 4 and starts', await until(() => R1.snap && R1.snap.snap.players.length === 4, 8000));
    R1.ws.close();
  }
} catch (e) {
  ok('unexpected exception', false, String(e?.stack ?? e));
} finally {
  writeFileSync(`docs/test-results/territory-multiplayer-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
