// Requires: npm i ws. Usage: node ws-test.mjs <baseUrl> [--timeout]
// Multiplayer protocol tests (server-authoritative behaviour) against a running JY Chess.
// Usage: node ws-test.mjs [baseUrl] [--timeout]
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const WITH_TIMEOUT = process.argv.includes('--timeout');
const WS = BASE.replace(/^http/, 'ws');
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function guest() {
  const r = await fetch(`${BASE}/api/me`);
  const set = r.headers.getSetCookie?.() ?? [];
  return set.map((c) => c.split(';')[0]).join('; ');
}

function client(roomId, cookie, name) {
  const ws = new WebSocket(`${WS}/api/rooms/${roomId}/ws?name=${name}`, { headers: { cookie } });
  const c = { ws, state: null, errors: [], name };
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
async function until(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
}
async function room(cookie, body) {
  const r = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json()).id;
}

try {
  const [ca, cb, cc] = [await guest(), await guest(), await guest()];
  ok('guest cookies issued', !!ca && !!cb && ca !== cb);

  // ---- chess room: turn order, duplicates, illegal, spectators ----
  const id = await room(ca, { game: 'chess', minutes: 5, inc: 0, side: 'first' });
  const A = client(id, ca, 'Alice');
  await A.ready;
  await until(() => A.state);
  ok('creator seated as white', A.state?.mySeat === 0, JSON.stringify(A.state?.mySeat));
  ok('room waiting', A.state?.status === 'waiting');
  const B = client(id, cb, 'Bob');
  await B.ready;
  ok('game starts when second player joins', await until(() => A.state?.status === 'playing' && B.state?.mySeat === 1));
  const C = client(id, cc, 'Carol');
  await C.ready;
  await until(() => C.state);
  ok('third person is spectator', C.state?.mySeat === null);
  C.send({ t: 'move', m: 'e2e4', ply: 0 });
  await until(() => C.errors.length > 0);
  ok('spectator cannot move', C.errors.includes('spectator') && A.state.moves.length === 0);
  B.send({ t: 'move', m: 'e7e5', ply: 0 });
  await until(() => B.errors.length > 0);
  ok('out-of-turn move rejected', B.errors.includes('not_your_turn'));
  A.send({ t: 'move', m: 'e2e5', ply: 0 });
  await until(() => A.errors.length > 0);
  ok('illegal move rejected', A.errors.includes('illegal') && A.state.moves.length === 0);
  // duplicate submission of the same move
  A.send({ t: 'move', m: 'e2e4', ply: 0 });
  A.send({ t: 'move', m: 'e2e4', ply: 0 });
  await until(() => A.state.moves.length === 1);
  await sleep(500);
  ok('duplicate submission applied once', A.state.moves.length === 1 && A.errors.some((e) => e === 'stale' || e === 'not_your_turn'), A.errors.join(','));
  // simultaneous submissions from both players
  B.send({ t: 'move', m: 'e7e5', ply: 1 });
  A.send({ t: 'move', m: 'g1f3', ply: 1 });
  await until(() => A.state.moves.length >= 2);
  await sleep(400);
  ok('simultaneous submissions resolved by server', A.state.moves.join(' ') === 'e2e4 e7e5' && B.state.moves.join(' ') === 'e2e4 e7e5', A.state.moves.join(' '));
  // undo request + accept
  A.send({ t: 'move', m: 'g1f3', ply: 2 });
  await until(() => A.state.moves.length === 3);
  A.send({ t: 'offer', kind: 'undo' });
  await until(() => B.state.offer?.kind === 'undo');
  B.send({ t: 'respond', accept: true });
  ok('undo with consent', await until(() => A.state.moves.length === 2 && A.state.sideToMove === 0));
  // reconnect keeps seat
  B.ws.close();
  await until(() => A.state.awaySeat === 1, 4000);
  ok('disconnect detected', A.state.awaySeat === 1);
  const B2 = client(id, cb, 'Bob');
  await B2.ready;
  ok('reconnect restores seat and state', await until(() => B2.state?.mySeat === 1 && B2.state.moves.length === 2 && A.state.awaySeat === null));
  // draw offer accepted
  A.send({ t: 'offer', kind: 'draw' });
  await until(() => B2.state.offer?.kind === 'draw');
  B2.send({ t: 'respond', accept: true });
  ok('draw by agreement', await until(() => A.state.result?.reason === 'agreement'));
  A.send({ t: 'move', m: 'g1f3', ply: 2 });
  await until(() => A.errors.includes('game_over'));
  ok('no moves after game end', A.errors.includes('game_over'));
  for (const c of [A, B2, C]) c.ws.close();

  // ---- banqi: hidden information never leaves the server ----
  const bid = await room(ca, { game: 'banqi', minutes: 0, inc: 0, side: 'first' });
  const P = client(bid, ca, 'P1');
  const Q = client(bid, cb, 'P2');
  await Promise.all([P.ready, Q.ready]);
  await until(() => P.state?.status === 'playing' && Q.state?.status === 'playing');
  ok('banqi initial state has no hidden identities', !JSON.stringify(P.state).includes('layout') && P.state.position.view.cells.every((c) => c === 'X') && P.state.final === null);
  const first = P.state.mySeat === 0 ? P : Q;
  first.send({ t: 'move', m: 'f:a1', ply: 0 });
  await until(() => P.state.moves.length === 1 && Q.state.moves.length === 1);
  ok('banqi flip reveals exactly one piece to both', P.state.position.view.cells.filter((c) => c !== 'X').length === 1 && Q.state.position.view.cells.filter((c) => c !== 'X').length === 1);
  ok('banqi colours assigned by first flip', P.state.position.view.seatColor.every(Boolean));
  first.send({ t: 'resign' });
  await until(() => P.state.result && P.state.final);
  ok('banqi full layout revealed only after the game', !!P.state.final?.state?.layout && P.state.final.state.layout.length === 32);
  P.ws.close();
  Q.ws.close();

  // ---- rated rooms require sign-in ----
  const rid = await room(ca, { game: 'chess', minutes: 5, inc: 0, rated: true });
  const R1 = client(rid, ca, 'G1');
  await R1.ready;
  await until(() => R1.state);
  ok('guest cannot create rated room (falls back to unrated)', R1.state.rated === false);
  R1.ws.close();

  // ---- matchmaking pairs two guests into the same room ----
  const mm = (cookie) =>
    new Promise((res) => {
      const w = new WebSocket(`${WS}/api/match/ws?game=xiangqi&rated=0&minutes=5&inc=3`, { headers: { cookie } });
      w.on('message', (d) => {
        const m = JSON.parse(String(d));
        if (m.t === 'matched') res(m.room);
      });
      setTimeout(() => res(null), 10000);
    });
  const [m1, m2] = await Promise.all([mm(ca), mm(cb)]);
  ok('matchmaking pairs players into one room', !!m1 && m1 === m2, `${m1} ${m2}`);
  if (m1) {
    const X = client(m1, ca, 'X');
    const Y = client(m1, cb, 'Y');
    await Promise.all([X.ready, Y.ready]);
    ok('matched room starts with both seats', await until(() => X.state?.status === 'playing' && X.state.mySeat !== null && Y.state?.mySeat !== null && X.state.mySeat !== Y.state.mySeat));
    X.ws.close();
    Y.ws.close();
  }
  const rated = await new Promise((res) => {
    const w = new WebSocket(`${WS}/api/match/ws?game=chess&rated=1&minutes=5&inc=3`, { headers: { cookie: ca } });
    w.on('unexpected-response', (_q, r) => res(r.statusCode));
    w.on('open', () => res('open'));
  });
  ok('rated matchmaking requires sign-in', rated === 401, String(rated));

  // ---- bad room ----
  const status = await new Promise((res) => {
    const w = new WebSocket(`${WS}/api/rooms/ZZZZZZ/ws`, { headers: { cookie: ca } });
    w.on('unexpected-response', (_req, r) => res(r.statusCode));
    w.on('open', () => res('open'));
    w.on('error', () => res('error'));
  });
  ok('unknown room rejected', status === 404, String(status));

  // ---- clock timeout via alarm (optional, ~65 s) ----
  if (WITH_TIMEOUT) {
    const tid = await room(ca, { game: 'chess', minutes: 1, inc: 0, side: 'first' });
    const T2 = client(tid, cb, 'T2'); // joiner first: creator must still get the side they chose
    await T2.ready;
    await sleep(300);
    const T1 = client(tid, ca, 'T1');
    await T1.ready;
    await until(() => T1.state && T2.state);
    ok('creator keeps chosen side when guest joins first', T1.state.mySeat === 0 && T2.state.mySeat === 1);
    await until(() => T1.state?.status === 'playing');
    T1.send({ t: 'move', m: 'e2e4', ply: 0 });
    await until(() => T1.state.moves.length === 1);
    ok('timeout adjudicated by server alarm', await until(() => T1.state.result?.reason === 'timeout' && T1.state.result.winner === 0, 75000), JSON.stringify(T1.state.result));
    T1.ws.close();
    T2.ws.close();
  }
} catch (e) {
  ok('unexpected exception', false, String(e?.stack ?? e));
} finally {
  writeFileSync(`docs/test-results/multiplayer-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
