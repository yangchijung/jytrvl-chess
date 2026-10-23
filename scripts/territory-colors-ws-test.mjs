// Territory Rush player colours — protocol test: colour asked for on join (?color=), lobby change ({t:'color'}),
// server validation, first-come clash resolution, bots, old pages without a colour, snapshots/reconnect, quick match.
// Requires (outside the project): npm i ws. Usage: node territory-colors-ws-test.mjs <baseUrl> [out.json]
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const OUT = process.argv[3] ?? 'docs/test-results/territory-colors-ws.json';
const WS = BASE.replace(/^http/, 'ws');
const N = 9; // palette size (shared/territory/colors.ts)
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
  const c = { ws, lobby: null, snap: null, matched: null, pong: 0, errors: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'matched') c.matched = m.room;
    if (m.t === 'pong') c.pong++;
    if (m.t === 'error') c.errors.push(m.code);
  });
  c.ready = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  c.send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
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
const room = async (cookie, body = { minutes: 2, engine: 'flow' }) =>
  (await (await fetch(`${BASE}/api/territory/rooms`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()).id;
const colors = (l) => l.seats.map((s) => s.color);
const valid = (cs) => cs.every((c) => Number.isInteger(c) && c >= 0 && c < N);
const unique = (cs) => new Set(cs).size === cs.length;

try {
  const [ca, cb, cc, cd] = [await guest(), await guest(), await guest(), await guest()];

  // ---------------------------------------------------------------- old pages (no colour) still work
  {
    const id = await room(ca, { minutes: 2 }); // old page: no engine, no colour
    const path = `/api/territory/rooms/${id}/ws`;
    const A = client(path, ca, 'OldA'),
      B = client(path, cb, 'OldB');
    await Promise.all([A.ready, B.ready]);
    await until(() => A.lobby?.seats.length === 2 && B.lobby?.seats.length === 2);
    const cs = colors(A.lobby);
    ok('C1', 'pages that send no colour are seated with valid, different colours (server assigns)', valid(cs) && unique(cs) && A.lobby.engine === 'grid', JSON.stringify(cs));
    A.send({ t: 'start' });
    await until(() => A.snap && B.snap);
    const sc = A.snap?.snap.players.map((p) => p.color);
    ok('C2', 'four-way room: snapshot colours equal the lobby colours for both pages', JSON.stringify(sc) === JSON.stringify(cs) && JSON.stringify(B.snap?.snap.players.map((p) => p.color)) === JSON.stringify(cs), JSON.stringify(sc));
    A.ws.close();
    B.ws.close();
  }

  // ---------------------------------------------------------------- requested colours, clashes, lobby changes
  const id = await room(ca);
  const path = `/api/territory/rooms/${id}/ws`;
  const A = client(path, ca, 'Alice', '&color=3');
  await A.ready;
  await until(() => A.lobby?.seats.length === 1);
  const B = client(path, cb, 'Bobby', '&color=3');
  await B.ready;
  await until(() => A.lobby?.seats.length === 2 && B.lobby?.seats.length === 2);
  ok('C3', 'same colour asked twice: the first keeps it, the second gets the nearest free one (3 → 4)', JSON.stringify(colors(B.lobby)) === '[3,4]' && B.lobby.mySeat === 1, JSON.stringify(colors(B.lobby)));

  const C = client(path, cc, 'Carol', '&color=99');
  await C.ready;
  await until(() => A.lobby?.seats.length === 3);
  ok('C4', 'an invalid colour (99) is not trusted: the server assigns a valid unused one', valid(colors(A.lobby)) && unique(colors(A.lobby)), JSON.stringify(colors(A.lobby)));

  B.send({ t: 'color', c: 3 }); // Alice's
  await sleep(250);
  const afterClash = colors(A.lobby);
  ok('C5', 'changing to a colour someone holds moves you to the nearest free one; the holder keeps it', afterClash[0] === 3 && afterClash[1] !== 3 && unique(afterClash), JSON.stringify(afterClash));

  B.send({ t: 'color', c: 7 });
  await until(() => A.lobby?.seats[1]?.color === 7);
  ok('C6', 'changing to a free colour in the lobby is shown to every page', A.lobby.seats[1].color === 7 && B.lobby.seats[1].color === 7 && C.lobby.seats[1].color === 7, JSON.stringify(colors(C.lobby)));

  const before = JSON.stringify(colors(A.lobby));
  for (const bad of [{ t: 'color', c: 12 }, { t: 'color', c: -1 }, { t: 'color', c: 2.5 }, { t: 'color', c: '4' }, { t: 'color' }]) B.send(bad);
  await sleep(300);
  ok('C7', 'out-of-range / non-integer / missing colours are ignored, the connection stays open', JSON.stringify(colors(A.lobby)) === before && B.ws.readyState === 1, JSON.stringify(colors(A.lobby)));

  A.send({ t: 'bot', op: 'add', level: 'easy' });
  A.send({ t: 'bot', op: 'add', level: 'easy' });
  await until(() => A.lobby?.seats.length === 5);
  ok('C8', 'computer players added by the host never take a colour already in the room', valid(colors(A.lobby)) && unique(colors(A.lobby)), JSON.stringify(colors(A.lobby)));

  A.send({ t: 'start' });
  await until(() => A.snap && B.snap && C.snap);
  const lobbyCs = JSON.stringify(colors(A.lobby));
  const snapCs = (x) => JSON.stringify(x.snap.snap.players.map((p) => p.color));
  ok('C9', 'every page gets the same colours in the game snapshot as in the lobby', snapCs(A) === lobbyCs && snapCs(B) === lobbyCs && snapCs(C) === lobbyCs, snapCs(A));

  B.send({ t: 'color', c: 0 });
  await sleep(250);
  ok('C10', 'no colour changes once the game has started', JSON.stringify(colors(A.lobby)) === lobbyCs, JSON.stringify(colors(A.lobby)));

  // reconnect mid-game asking for a different colour: the seat keeps its colour
  B.ws.close();
  await sleep(300);
  const B2 = client(path, cb, 'Bobby', '&color=0');
  await B2.ready;
  await until(() => B2.snap && B2.lobby);
  ok('C11', 'reconnect (refresh) mid-game keeps the seat and the colours, even with another ?color', B2.snap.mySeat === 1 && snapCs(B2) === lobbyCs && JSON.stringify(colors(B2.lobby)) === lobbyCs, snapCs(B2));
  for (const x of [A, B2, C]) x.ws.close();

  // ---------------------------------------------------------------- quick match
  {
    const M1 = client('/api/territory/match/ws', cc, 'Match1', '&engine=flow&color=5');
    await M1.ready;
    M1.send({ t: 'ping' });
    await until(() => M1.pong > 0, 3000);
    M1.send({ t: 'color', c: 2 }); // changed while waiting
    await sleep(200);
    const M2 = client('/api/territory/match/ws', cd, 'Match2', '&engine=flow&color=2');
    await M2.ready;
    const matched = await until(() => M1.matched && M2.matched, 20000);
    let cs = null,
      cs2 = null;
    if (matched && M1.matched === M2.matched) {
      const P1 = client(`/api/territory/rooms/${M1.matched}/ws`, cc, 'Match1', '&color=8');
      const P2 = client(`/api/territory/rooms/${M1.matched}/ws`, cd, 'Match2');
      await Promise.all([P1.ready, P2.ready]);
      await until(() => P1.snap && P2.snap && P1.lobby && P2.lobby);
      cs = P1.snap?.snap.players.map((p) => p.color);
      cs2 = P2.snap?.snap.players.map((p) => p.color);
      P1.ws.close();
      P2.ws.close();
    }
    ok('C12', 'quick match: ping still answered; the waiting player\'s colour change counts; same colour asked later → nearest (2, 3); bots unique', M1.pong > 0 && cs && cs[0] === 2 && cs[1] === 3 && valid(cs) && unique(cs) && JSON.stringify(cs) === JSON.stringify(cs2), JSON.stringify({ cs, cs2, room: M1.matched }));
  }
} catch (e) {
  ok('X', 'unexpected error', false, e.stack ?? e);
}
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
writeFileSync(OUT, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
process.exit(pass === results.length ? 0 : 1);
