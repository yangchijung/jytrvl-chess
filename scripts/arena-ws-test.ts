/// <reference types="node" />
// Snake Arena & Block Puzzle Battle multiplayer protocol tests against a running JY Games
// (local wrangler or production). Usage:
//   npx tsx scripts/arena-ws-test.ts <baseUrl> [cookieA] [cookieB]
// cookieA/B: optional signed-in session cookies to verify stats / ranked / verified solo records.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
import { BlocksGame, ACTIONS, TPS, type Action } from '../shared/blocks/engine';
import { BlocksBot } from '../shared/blocks/ai';
import { rng } from '../shared/blocks/engine';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const WSB = BASE.replace(/^http/, 'ws');
const results: { name: string; pass: boolean; info: string }[] = [];
const ok = (name: string, pass: boolean, info = '') => {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => unknown, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(40);
  }
  return false;
}
async function guest() {
  const r = await fetch(`${BASE}/api/me`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = any;
function client(path: string, cookie: string, name: string) {
  const ws = new WebSocket(`${WSB}${path}${path.includes('?') ? '&' : '?'}name=${name}`, { headers: { cookie } });
  const c = {
    ws,
    lobby: null as Msg,
    msgs: [] as Msg[],
    steps: [] as Msg[],
    stepTimes: [] as number[],
    snap: null as Msg,
    bstart: null as Msg,
    bstate: new Map<number, Msg>(),
    end: null as Msg,
    errors: [] as string[],
    matched: null as string | null,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    ready: null as unknown as Promise<void>,
  };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    c.msgs.push(m);
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'ssnap') c.snap = m;
    if (m.t === 'sstep') {
      c.steps.push(m);
      c.stepTimes.push(Date.now());
    }
    if (m.t === 'bstart') c.bstart = m;
    if (m.t === 'bstate') c.bstate.set(m.seat, m);
    if (m.t === 'end') c.end = m;
    if (m.t === 'error') c.errors.push(m.code);
    if (m.t === 'matched') c.matched = m.room;
  });
  c.ready = new Promise((res, rej) => {
    ws.on('open', () => res());
    ws.on('error', rej);
  });
  return c;
}

async function snakeTests(ca: string, cb: string, cc: string, signed: boolean) {
  const { id } = (await (await fetch(`${BASE}/api/arena/snake/rooms`, { method: 'POST', headers: { cookie: ca, 'content-type': 'application/json' }, body: '{"minutes":2,"map":"open"}' })).json()) as { id: string };
  ok('snake: private room created', /^[A-HJ-NP-Z2-9]{6}$/.test(id ?? ''), id);
  const path = `/api/arena/snake/rooms/${id}/ws`;
  const A = client(path, ca, 'Alice');
  await A.ready;
  await until(() => A.lobby);
  ok('snake: creator is host', A.lobby?.hostSeat === 0 && A.lobby?.mySeat === 0 && A.lobby?.game === 'snake' && A.lobby?.maxSeats === 8);
  const B = client(path, cb, 'Bobby');
  await B.ready;
  await until(() => B.lobby?.seats.length === 2);
  ok('snake: second player seated', B.lobby?.mySeat === 1);
  B.send({ t: 'start' });
  await until(() => B.errors.length);
  ok('snake: non-host cannot start', B.errors.includes('not_host'));
  A.send({ t: 'bot', op: 'add', level: 'hard' });
  await until(() => A.lobby?.seats.length === 3);
  ok('snake: host adds a bot', A.lobby?.seats[2]?.bot === true);
  A.send({ t: 'start' });
  ok('snake: snapshot at countdown with all snakes', (await until(() => A.snap && B.snap)) && A.snap.snap.cfg.map === 'open' && A.snap.snap.snakes.length === 3);
  ok('snake: steps stream after countdown', await until(() => A.steps.length >= 3, 9000));
  // flood inputs right away while our snake is alive
  {
    const W0 = A.snap.snap.cfg.width;
    const h = (m: Msg) => m.sn[1];
    const n0 = A.steps.length;
    for (let i = 0; i < 200; i++) A.send({ t: 'dir', d: [0, 1][i % 2] });
    await until(() => A.steps.length >= n0 + 4);
    const a = A.steps[n0 - 1],
      b = A.steps[n0 + 3];
    const moved = Math.abs((h(b) % W0) - (h(a) % W0)) + Math.abs(Math.floor(h(b) / W0) - Math.floor(h(a) / W0));
    ok('snake: input flood cannot speed up', a.sn[0] === 1 && moved <= 4, `moved ${moved} in 4 steps`);
  }
  await until(() => A.steps.length >= 12, 9000);
  const tt = A.stepTimes.slice(-10);
  const rate = (tt.length - 1) / ((tt[tt.length - 1] - tt[0]) / 1000);
  ok('snake: server step rate ~10/s', rate > 7 && rate < 13, rate.toFixed(1));
  const W = A.snap.snap.cfg.width;
  const head = (m: Msg, k: number) => m.sn[k * 6 + 1];
  // the computer snake (seat 2) is alive: it moves exactly one cell per step
  const s1 = A.steps[A.steps.length - 2],
    s2 = A.steps[A.steps.length - 1];
  const d = Math.abs((head(s2, 2) % W) - (head(s1, 2) % W)) + Math.abs(Math.floor(head(s2, 2) / W) - Math.floor(head(s1, 2) / W));
  ok('snake: exactly one cell per step', s2.sn[12] === 1 && d === 1, `moved ${d}`);
  A.send({ t: 'dir', d: 7 });
  A.send({ t: 'move', to: 5 });
  A.send({ t: 'in', s: 1, k: 1, a: 7 });
  await sleep(300);
  ok('snake: forged messages ignored', A.ws.readyState === 1);
  const C = client(path, cc, 'Carol');
  await C.ready;
  ok('snake: late joiner gets snapshot as spectator', await until(() => C.snap && C.snap.mySeat === null));
  B.ws.close();
  await sleep(400);
  const B2 = client(path, cb, 'Bobby');
  await B2.ready;
  ok('snake: reconnect restores seat', await until(() => B2.snap?.mySeat === 1));
  ok('snake: match ends (last standing or time)', await until(() => A.end, 150000), JSON.stringify(A.end?.result?.reason));
  ok('snake: ranking lists every snake', A.end?.ranking?.length === 3);
  if (signed) ok('snake: stats recorded for signed-in players', A.end?.recorded === true);
  A.send({ t: 'again' });
  ok('snake: host can reopen the lobby', await until(() => A.lobby?.status === 'lobby'));
  for (const x of [A, B2, C]) x.ws.close();

  // matchmaking (2 players → bots fill to 4)
  const M1 = client('/api/arena/match/ws?pool=snake', ca, 'Alice');
  const M2 = client('/api/arena/match/ws?pool=snake', cb, 'Bobby');
  await Promise.all([M1.ready, M2.ready]);
  ok('snake: matchmaking pairs players', await until(() => M1.matched && M2.matched && M1.matched === M2.matched, 16000), M1.matched ?? '');
  if (M1.matched) {
    const R = client(`/api/arena/snake/rooms/${M1.matched}/ws`, ca, 'Alice');
    await R.ready;
    ok('snake: matched room has 4 snakes (bot fill)', await until(() => R.snap && R.snap.snap.snakes.length === 4, 8000));
    R.ws.close();
  }
}

/** a bot-driven online Block Puzzle Battle client with prediction + rollback (mirrors src/blocks/online.ts) */
function blocksPlayer(c: ReturnType<typeof client>, seat: number, level: 'medium' | 'hard', rttMs: number) {
  let game: BlocksGame | null = null;
  let clock0 = 0;
  let seq = 0;
  let pending: { s: number; k: number; a: Action }[] = [];
  const bot = new BlocksBot(level, rng(seat + 99));
  let corrections = 0;
  let stopped = false;
  let suicide = false;
  const timer = setInterval(() => {
    if (!c.bstart || stopped) return;
    if (!game) {
      game = BlocksGame.fromSnapshot(c.bstart.snaps[seat]);
      clock0 = Date.now() + c.bstart.countdownMs - rttMs / 2;
    }
    // reconcile with latest server state
    const st = c.bstate.get(seat);
    if (st && st.__seen !== true) {
      st.__seen = true;
      pending = pending.filter((x) => x.s > st.ack);
      const g2 = BlocksGame.fromSnapshot(st.snap);
      for (const x of pending) {
        g2.advanceTo(Math.max(g2.tick, x.k));
        if (g2.status !== 'playing') break;
        g2.input(x.a);
      }
      g2.advanceTo(game.tick);
      if (g2.hash() !== game.hash()) {
        game = g2;
        corrections++;
      }
    }
    const target = Math.floor(((Date.now() - clock0) * TPS) / 1000);
    while (game.status === 'playing' && game.tick < target) {
      const acts: Action[] = suicide ? (game.tick % 3 === 0 ? ['HD'] : []) : bot.update(game);
      for (const a of acts) {
        if (game.input(a)) {
          const x = { s: ++seq, k: game.tick, a };
          pending.push(x);
          c.send({ t: 'in', s: x.s, k: x.k, a: ACTIONS.indexOf(a) });
        }
      }
      game.step();
    }
  }, 16);
  return {
    get game() {
      return game;
    },
    get corrections() {
      return corrections;
    },
    stop() {
      stopped = true;
    },
    resume() {
      stopped = false;
    },
    suicide() {
      suicide = true;
    },
    dispose() {
      clearInterval(timer);
    },
  };
}

async function blocksTests(ca: string, cb: string, cc: string, signed: boolean) {
  const { id } = (await (await fetch(`${BASE}/api/arena/blocks/rooms`, { method: 'POST', headers: { cookie: ca, 'content-type': 'application/json' }, body: '{}' })).json()) as { id: string };
  ok('blocks: private room created', /^[A-HJ-NP-Z2-9]{6}$/.test(id ?? ''), id);
  const path = `/api/arena/blocks/rooms/${id}/ws`;
  const A = client(path, ca, 'Alice');
  await A.ready;
  await until(() => A.lobby);
  ok('blocks: room is 1 v 1', A.lobby?.maxSeats === 2 && A.lobby?.game === 'blocks');
  const B = client(path, cb, 'Bobby');
  await B.ready;
  await until(() => A.lobby?.seats.length === 2);
  const C = client(path, cc, 'Carol');
  await C.ready;
  await until(() => C.lobby);
  ok('blocks: third person is a spectator (room full)', C.lobby?.mySeat === null && C.lobby?.seats.length === 2);
  A.send({ t: 'start' });
  ok('blocks: both get the same seed and boards', (await until(() => A.bstart && B.bstart)) && A.bstart.seed === B.bstart.seed && A.bstart.snaps.length === 2);
  ok('blocks: identical piece sequence for both players', JSON.stringify(A.bstart.snaps[0].queue) === JSON.stringify(A.bstart.snaps[1].queue));
  const pa = blocksPlayer(A, 0, 'hard', 20);
  const pb = blocksPlayer(B, 1, 'medium', 20);
  await sleep(A.bstart.countdownMs + 25000);
  const sa = A.bstate.get(0),
    sb = A.bstate.get(1);
  ok('blocks: server applies inputs (acks advance)', (sa?.ack ?? 0) > 20 && (sb?.ack ?? 0) > 20, `acks ${sa?.ack}/${sb?.ack}`);
  ok('blocks: server and client agree on line count', !!pa.game && Math.abs((sa?.snap.lines ?? -1) - pa.game.lines) <= 4, `server ${sa?.snap.lines} client ${pa.game?.lines}`);
  ok('blocks: pieces locked server-side', (sa?.snap.pieces ?? 0) > 20, `pieces ${sa?.snap.pieces}`);
  const garbage = (sa?.snap.stats.garbageReceived ?? 0) + (sb?.snap.stats.garbageReceived ?? 0) + (sa?.snap.pendingGarbage.length ?? 0) + (sb?.snap.pendingGarbage.length ?? 0);
  ok('blocks: garbage exchanged between players', garbage > 0 || (sa?.snap.stats.attack ?? 0) + (sb?.snap.stats.attack ?? 0) > 0, `received ${garbage}`);
  ok('blocks: prediction rarely needs correction', pa.corrections < 40, `corrections ${pa.corrections}`);
  // stalling: B stops sending; the server keeps gravity running (max lag 0.5 s)
  pb.stop();
  const t1 = A.bstate.get(1)?.snap.tick ?? 0;
  await sleep(2500);
  const t2 = A.bstate.get(1)?.snap.tick ?? 0;
  ok('blocks: withholding input cannot freeze your gravity', t2 - t1 >= 100, `server ticks ${t1} → ${t2}`);
  // forged inputs
  const before = A.bstate.get(1)?.ack ?? 0;
  B.send({ t: 'in', s: before + 1000, k: 999999, a: 99 });
  B.send({ t: 'in', s: 1, k: 0, a: 7 });
  B.send({ t: 'dir', d: 1 });
  await sleep(500);
  ok('blocks: bad action / replayed seq ignored', (A.bstate.get(1)?.ack ?? 0) === before && B.ws.readyState === 1);
  // A tops out deliberately → B wins
  pb.resume();
  pa.suicide();
  ok('blocks: match ends on top-out', await until(() => A.end && B.end, 60000), JSON.stringify(A.end && { w: A.end.winner, r: A.end.reason }));
  ok('blocks: opponent of the topped-out player wins', A.end?.winner === 1 && A.end?.reason === 'topout');
  if (signed) ok('blocks: stats recorded', A.end?.recorded === true);
  pa.dispose();
  pb.dispose();
  for (const x of [A, B, C]) x.ws.close();

  // public quick match: pairs two players
  const M1 = client('/api/arena/match/ws?pool=blocks', ca, 'Alice');
  const M2 = client('/api/arena/match/ws?pool=blocks', cb, 'Bobby');
  await Promise.all([M1.ready, M2.ready]);
  ok('blocks: quick match pairs two players', await until(() => M1.matched && M1.matched === M2.matched, 8000), M1.matched ?? '');
  M1.ws.close();
  M2.ws.close();
  // lone player gets a computer opponent
  const S = client('/api/arena/match/ws?pool=blocks', cc, 'Solo');
  await S.ready;
  ok('blocks: lone player matched with a computer after ~20 s', await until(() => S.matched, 26000));
  if (S.matched) {
    const R = client(`/api/arena/blocks/rooms/${S.matched}/ws`, cc, 'Solo');
    await R.ready;
    await until(() => R.lobby);
    ok('blocks: computer seat present', R.lobby?.seats?.[1]?.bot === true);
    await sleep(6000);
    ok('blocks: server-side computer plays', (R.bstate.get(1)?.snap.pieces ?? 0) > 2, `pieces ${R.bstate.get(1)?.snap.pieces}`);
    R.ws.close();
  }
  S.ws.close();
  // ranked requires login
  const status = await new Promise<number>((res) => {
    const w = new WebSocket(`${WSB}/api/arena/match/ws?pool=blocks-ranked`, { headers: { cookie: cc } });
    w.on('unexpected-response', (_req, r) => res(r.statusCode ?? 0));
    w.on('open', () => {
      res(101);
      w.close();
    });
    w.on('error', () => res(-1));
  });
  ok('blocks: ranked requires sign-in', status === 401, String(status));
  if (signed) {
    const R1 = client('/api/arena/match/ws?pool=blocks-ranked', ca, 'Alice');
    const R2 = client('/api/arena/match/ws?pool=blocks-ranked', cb, 'Bobby');
    await Promise.all([R1.ready, R2.ready]);
    ok('blocks: ranked pairs signed-in players', await until(() => R1.matched && R1.matched === R2.matched, 10000));
    R1.ws.close();
    R2.ws.close();
  }
}

async function soloTests(ca: string) {
  // verified solo records
  const start = async (game: string, mode: string) => (await (await fetch(`${BASE}/api/solo/start`, { method: 'POST', headers: { cookie: ca, 'content-type': 'application/json' }, body: JSON.stringify({ game, mode }) })).json()) as { token: string; seed: number };
  const finish = async (body: unknown) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(`${BASE}/api/solo/finish`, { method: 'POST', headers: { cookie: ca, 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify(body) });
        return { status: r.status, body: (await r.json()) as Record<string, unknown> };
      } catch (e) {
        if (attempt >= 2) throw e;
        await sleep(500);
      }
    }
  };
  // blocks marathon: hard-drop until top-out (a few ticks long, so no real-time wait is needed)
  const t = await start('blocks', 'marathon');
  ok('solo: server issues a signed seed', !!t.token && Number.isInteger(t.seed));
  const g = new BlocksGame({ seed: t.seed, mode: 'marathon' });
  const inputs: [number, number][] = [];
  while (g.status === 'playing') {
    inputs.push([g.tick, ACTIONS.indexOf('HD')]);
    g.input('HD');
    g.step();
  }
  await sleep(Math.ceil((g.endTick / TPS) * 1000) + 300); // a real game takes real time
  const r1 = await finish({ token: t.token, inputs, endTick: g.endTick });
  ok('solo: valid replay accepted with the same score', r1.status === 200 && r1.body.score === g.score, JSON.stringify(r1.body));
  const r2 = await finish({ token: t.token, inputs, endTick: g.endTick });
  ok('solo: a token cannot be used twice', r2.status === 409);
  const t2 = await start('blocks', 'marathon');
  const r3 = await finish({ token: t2.token, inputs: inputs.slice(0, 3), endTick: g.endTick });
  ok('solo: incomplete / tampered input log rejected', r3.status === 422, JSON.stringify(r3.body));
  const [payload, sig] = t2.token.split('.');
  const forged = JSON.parse(Buffer.from(payload, 'base64url').toString());
  forged.seed = t.seed; // try to reuse a known seed
  const r4 = await finish({ token: `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`, inputs, endTick: g.endTick });
  ok('solo: forged token rejected', r4.status === 400);
  // a long ultra game submitted instantly is "too fast"
  const t3 = await start('blocks', 'ultra');
  const u = new BlocksGame({ seed: t3.seed, mode: 'ultra' });
  const bot = new BlocksBot('hard', rng(3));
  const log: [number, number][] = [];
  while (u.status === 'playing') {
    for (const a of bot.update(u)) {
      log.push([u.tick, ACTIONS.indexOf(a)]);
      u.input(a);
    }
    u.step();
  }
  const r5 = await finish({ token: t3.token, inputs: log, endTick: u.endTick });
  ok('solo: a 2-minute game submitted at once is rejected as too fast', r5.status === 422 && r5.body.error === 'too_fast', JSON.stringify(r5.body));
  const lb = (await (await fetch(`${BASE}/api/arena/blocks/leaderboard?board=solo&mode=marathon`)).json()) as { rows: unknown[] };
  ok('solo: leaderboard lists the verified record', Array.isArray(lb.rows) && lb.rows.length >= 1);
}

try {
  const signed = !!process.argv[3];
  const ca = process.argv[3] ?? (await guest());
  const cb = process.argv[4] ?? (await guest());
  const cc = await guest();
  await snakeTests(ca, cb, cc, signed);
  await blocksTests(ca, cb, cc, signed);
  if (signed) await soloTests(ca);
} catch (e) {
  ok('unexpected exception', false, String((e as Error)?.stack ?? e));
} finally {
  writeFileSync(`docs/test-results/arena-multiplayer-${BASE.includes('127.0.0.1') ? 'local' : 'production'}.json`, JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
