// Territory Rush — continuous steering preview (T1, docs/product/TERRITORY_POINTER_V1.md). Task: leave your land,
// loop back and claim what you enclose, steering by pointing (mouse), touching (tap turns at once, drag keeps
// steering) or the keyboard. Local only: the online game keeps its own rules until T3.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from '../components/ui';
import { botThink, newBotMemory } from '../../shared/territory/ai';
import { rng, type Dir } from '../../shared/territory/engine';
import { FlowGame, STEP_MS } from '../../shared/territory/flow';
import { PALETTE, readTheme, type Theme } from './render';

type L = { zh: string; en: string };
const T = {
  title: { zh: '領地爭奪戰：連續轉向', en: 'Territory Rush: free steering' },
  tag: { zh: '試玩預覽', en: 'Preview' },
  mouse: { zh: '滑鼠指向哪裡，就往哪裡走', en: 'Point to steer' },
  touch: { zh: '點一下轉向，拖著改方向', en: 'Touch to turn. Drag to steer.' },
  keys: { zh: '方向鍵或 WASD 也可以', en: 'Arrow keys or WASD work too' },
  land: { zh: '領地', en: 'Land' },
  kills: { zh: '淘汰', en: 'Knock-outs' },
  time: { zh: '剩餘', en: 'Time' },
  ready: { zh: '準備', en: 'Ready' },
  out: { zh: '出局了', en: 'You are out' },
  won: { zh: '你贏了', en: 'You won' },
  over: { zh: '時間到', en: "Time's up" },
  again: { zh: '再玩一次', en: 'Play again' },
  reason: { wall: { zh: '撞到邊界', en: 'Hit the edge' }, self: { zh: '碰到自己的線', en: 'Touched your own line' }, cut: { zh: '線被切斷', en: 'Your line was cut' }, collision: { zh: '正面相撞', en: 'Head-on crash' }, land: { zh: '領地被吃光', en: 'Lost all land' }, left: { zh: '離開', en: 'Left' } } as Record<string, L>,
  board: { zh: '遊戲區：移動滑鼠或觸碰來轉向', en: 'Game area: move the mouse or touch to steer' },
};
const KEY_DIR: Record<string, Dir> = { KeyW: 0, ArrowUp: 0, KeyD: 1, ArrowRight: 1, KeyS: 2, ArrowDown: 2, KeyA: 3, ArrowLeft: 3 };
const BOTS = ['Nova', 'Pixel', 'Mochi'];
const DURATION_MS = 3 * 60 * 1000;
const COUNTDOWN_MS = 2000;

interface Run {
  g: FlowGame;
  bots: { idx: number; mem: ReturnType<typeof newBotMemory>; rand: () => number }[];
  status: 'countdown' | 'playing' | 'ended';
  startAt: number;
  acc: number;
  last: number;
  prev: [number, number][];
  /** when the page went to the background (null while visible) */
  hiddenAt: number | null;
}

/**
 * Background pause (Issue #8 P2), same meaning as the classic local game: while the page is hidden nothing
 * moves, in the countdown or in play. On return the countdown keeps the time it had left and play resumes from
 * this moment with an empty step budget, so there is no catch-up burst.
 */
export function setHidden(R: Pick<Run, 'status' | 'startAt' | 'acc' | 'last' | 'hiddenAt'>, hidden: boolean, now: number) {
  if (hidden) {
    if (R.hiddenAt === null) R.hiddenAt = now;
    return;
  }
  if (R.hiddenAt === null) return;
  if (R.status === 'countdown') R.startAt += now - R.hiddenAt;
  R.last = now;
  R.acc = 0;
  R.hiddenAt = null;
}
function newRun(now: number): Run {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const g = new FlowGame({ width: 56, height: 56, durationTicks: DURATION_MS / STEP_MS, seed });
  g.addPlayer('me', 'You', false);
  const r = rng(seed ^ 0x51ed);
  const bots = BOTS.map((name) => ({ idx: g.addPlayer(`b-${name}`, name, true).idx, mem: newBotMemory(), rand: rng(Math.floor(r() * 2 ** 31)) }));
  g.start();
  return { g, bots, status: 'countdown', startAt: now + COUNTDOWN_MS, acc: 0, last: now, prev: g.flow.map((f) => [f.fx, f.fy]), hiddenAt: typeof document !== 'undefined' && document.hidden ? now : null };
}

export function TerritoryFlowPage() {
  const { lang } = useI18n();
  const tr = (l: L) => l[lang];
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run>(newRun(performance.now()));
  const view = useRef({ cx: 0, cy: 0, cell: 20, w: 0, h: 0 });
  const active = useRef<number | null>(null); // the one touch that steers
  const theme = useRef<Theme | null>(null);
  const [hint, setHint] = useState<'mouse' | 'touch'>(() => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse'));
  const [, setTick] = useState(0);
  const rerender = useMemo(() => () => setTick((n) => n + 1), []);

  // fixed-step simulation + drawing
  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const R = run.current;
      const g = R.g;
      if (R.hiddenAt !== null) {
        draw(now);
        return;
      }
      if (R.status === 'countdown' && now >= R.startAt) {
        R.status = 'playing';
        R.last = now;
        rerender();
      }
      if (R.status === 'playing') {
        R.acc += Math.min(250, now - R.last); // a hidden tab does not fast-forward
        R.last = now;
        while (R.acc >= STEP_MS && R.status === 'playing') {
          R.acc -= STEP_MS;
          R.prev = g.flow.map((f) => [f.fx, f.fy]);
          for (const b of R.bots) if (g.players[b.idx].alive) botThink(g, b.idx, b.mem, 'easy', b.rand);
          g.step();
          if (g.result || !g.players[0].alive) {
            R.status = 'ended';
            rerender();
          }
        }
      }
      draw(now);
      if (now - lastHud > 250) {
        lastHud = now;
        rerender();
      }
      (window as unknown as { __flow?: Run }).__flow = R;
    };
    const draw = (now: number) => {
      const cv = canvas.current,
        el = wrap.current;
      if (!cv || !el) return;
      if (!theme.current) theme.current = readTheme(el);
      const th = theme.current;
      const R = run.current;
      const g = R.g;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth,
        h = el.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = R.status === 'playing' ? Math.min(1, R.acc / STEP_MS) : 1;
      const pos = (i: number): [number, number] => {
        const f = g.flow[i];
        const p = R.prev[i] ?? [f.fx, f.fy];
        return Math.hypot(p[0] - f.fx, p[1] - f.fy) > 2 ? [f.fx, f.fy] : [p[0] + (f.fx - p[0]) * k, p[1] + (f.fy - p[1]) * k];
      };
      const me = g.players[0];
      const cell = Math.max(10, Math.min(w, h * 1.4) / (w < 640 ? 24 : 36));
      const [hx, hy] = me.alive ? pos(0) : [g.w / 2, g.h / 2];
      view.current = { cx: hx, cy: hy, cell, w, h };
      const sx = (x: number) => (x - hx) * cell + w / 2;
      const sy = (y: number) => (y - hy) * cell + h / 2;
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, w, h);
      // land (only visible cells)
      const x0 = Math.max(0, Math.floor(hx - w / 2 / cell) - 1),
        x1 = Math.min(g.w - 1, Math.ceil(hx + w / 2 / cell) + 1);
      const y0 = Math.max(0, Math.floor(hy - h / 2 / cell) - 1),
        y1 = Math.min(g.h - 1, Math.ceil(hy + h / 2 / cell) + 1);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const o = g.owner[g.idx(x, y)];
          if (o < 0) continue;
          ctx.fillStyle = PALETTE[g.players[o].color % 8].land;
          ctx.fillRect(sx(x), sy(y), cell + 0.5, cell + 0.5);
        }
      ctx.strokeStyle = th.edge;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(0), sy(0), g.w * cell, g.h * cell);
      // trails: continuous lines that follow the actual path
      for (const p of g.players) {
        if (!p.alive) continue;
        const f = g.flow[p.idx];
        if (!f.path.length) continue;
        const [px, py] = pos(p.idx);
        ctx.strokeStyle = PALETTE[p.color % 8].base;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = cell * 0.45;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(sx(f.path[0][0]), sy(f.path[0][1]));
        for (const [x, y] of f.path) ctx.lineTo(sx(x), sy(y));
        ctx.lineTo(sx(px), sy(py));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // heads with a direction mark
      for (const p of g.players) {
        if (!p.alive) continue;
        const [px, py] = pos(p.idx);
        const a = g.flow[p.idx].heading;
        const c = PALETTE[p.color % 8];
        ctx.fillStyle = c.base;
        ctx.strokeStyle = c.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx(px), sy(py), cell * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx(px + Math.cos(a) * 0.25), sy(py + Math.sin(a) * 0.25), cell * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      void now;
    };
    const onVis = () => {
      setHidden(run.current, document.hidden, performance.now());
      rerender();
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [rerender]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEY_DIR[e.code];
      if (d === undefined || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (run.current.status === 'playing') run.current.g.steer(0, d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Points the player at a screen position, relative to the player's drawn head (dead zone near it). */
  const aim = (clientX: number, clientY: number) => {
    const R = run.current;
    if (R.status !== 'playing' || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const v = view.current;
    const dx = clientX - r.left - v.w / 2,
      dy = clientY - r.top - v.h / 2; // the camera keeps the head at the centre
    if (Math.hypot(dx, dy) < v.cell * 0.6) return; // on top of the player: keep the heading
    R.g.setTarget(0, Math.atan2(dy, dx));
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return aim(e.clientX, e.clientY);
    if (active.current !== null) return; // a second finger never takes over
    active.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHint('touch');
    aim(e.clientX, e.clientY); // turn at once, no swipe needed
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (hint !== 'mouse') setHint('mouse');
      return aim(e.clientX, e.clientY);
    }
    if (e.pointerId === active.current) aim(e.clientX, e.clientY);
  };
  const onEnd = (e: React.PointerEvent) => {
    if (e.pointerId === active.current) active.current = null; // the last heading is kept
  };

  const R = run.current;
  const g = R.g;
  const me = g.players[0];
  const total = g.w * g.h;
  const left = Math.max(0, Math.ceil(((g.cfg.durationTicks - g.tick) * STEP_MS) / 1000));
  const restart = () => {
    run.current = newRun(performance.now());
    active.current = null;
    rerender();
  };
  const f0 = g.flow[0];
  return (
    <section className="space-y-3" data-testid="flow">
      <h1 className="font-serif text-[1.75rem] font-bold leading-9">
        {tr(T.title)} <span className="align-middle text-sm font-medium text-[var(--muted)]">· {tr(T.tag)}</span>
      </h1>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums" data-testid="flow-hud">
        <span>
          {tr(T.land)} <strong>{((me.land / total) * 100).toFixed(1)}%</strong>
        </span>
        <span>
          {tr(T.kills)} <strong>{me.kills}</strong>
        </span>
        <span>
          {tr(T.time)} <strong>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</strong>
        </span>
      </div>
      <div
        ref={wrap}
        className="relative h-[calc(100dvh-14rem)] min-h-[320px] w-full touch-none select-none overflow-hidden rounded-md border border-[var(--border)]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onLostPointerCapture={onEnd}
        role="application"
        aria-label={tr(T.board)}
        data-testid="flow-board"
        data-status={R.status}
        data-tick={g.tick}
        data-alive={String(me.alive)}
        data-heading={f0.heading.toFixed(4)}
        data-target={f0.target.toFixed(4)}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {R.status === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-md bg-[var(--surface)] px-6 py-3 text-2xl font-bold">{tr(T.ready)}</p>
          </div>
        )}
        {R.status === 'ended' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40" data-testid="flow-end">
            <div className="space-y-3 rounded-md bg-[var(--surface)] p-5 text-center">
              <p className="text-2xl font-bold">{!me.alive ? tr(T.out) : g.result?.winner === 0 ? tr(T.won) : tr(T.over)}</p>
              {!me.alive && me.reason && <p>{tr(T.reason[me.reason])}</p>}
              <Button size="lg" className="min-h-14" onClick={restart} data-testid="flow-again">
                {tr(T.again)}
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-base font-medium" data-testid="flow-hint" data-mode={hint}>
        {tr(hint === 'touch' ? T.touch : T.mouse)} · <span className="text-[var(--muted)]">{tr(T.keys)}</span>
      </p>
    </section>
  );
}
