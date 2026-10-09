import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Dir } from '../../shared/territory/engine';
import type { TerritoryClient } from './client';
import { draw, drawMinimap, readTheme, PALETTE, headPos, type Camera, type Theme } from './render';
import { useI18n, type StringKey } from '../i18n';
import { useSettings } from '../lib/settings';
import { playSound } from '../lib/sound';

const KEYS: Record<string, [number, Dir]> = {
  KeyW: [0, 0],
  KeyD: [0, 1],
  KeyS: [0, 2],
  KeyA: [0, 3],
  ArrowUp: [1, 0],
  ArrowRight: [1, 1],
  ArrowDown: [1, 2],
  ArrowLeft: [1, 3],
};

export function useClient(c: TerritoryClient) {
  const sub = useCallback((f: () => void) => c.subscribe(f), [c]);
  return useSyncExternalStore(sub, () => c.version);
}

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function TerritoryCanvas({ client, overlay }: { client: TerritoryClient; overlay?: ReactNode }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  useClient(client);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ cx: 0, cy: 0, cell: 20 });
  const theme = useRef<Theme | null>(null);
  const [joystick, setJoystick] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250); // countdown digits, toast expiry
    return () => clearInterval(id);
  }, []);
  const [knob, setKnob] = useState<[number, number] | null>(null);
  const soundRef = useRef(settings.sound);
  soundRef.current = settings.sound;
  const animRef = useRef(settings.animation);
  animRef.current = settings.animation;

  // sound effects from the event feed
  const lastSound = useRef(0);
  useEffect(() => {
    const items = client.feed.filter((f) => f.id > lastSound.current);
    for (const it of items) {
      lastSound.current = it.id;
      if (it.ev.type === 'death') playSound(client.me.includes(it.ev.player) ? 'error' : 'capture', soundRef.current);
      else if (it.ev.type === 'capture') playSound('flip', soundRef.current);
    }
  });
  const prevStatus = useRef(client.status);
  useEffect(() => {
    if (client.status === 'ended' && prevStatus.current !== 'ended') playSound('end', soundRef.current);
    if (client.status === 'playing' && prevStatus.current === 'countdown') playSound('notify', soundRef.current);
    prevStatus.current = client.status;
  });

  // render loop
  useEffect(() => {
    let raf = 0;
    let lastMini = 0;
    let lastTheme = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      client.update(now);
      const cv = canvas.current,
        el = wrap.current;
      if (!cv || !el) return;
      if (!theme.current || now - lastTheme > 1000) {
        theme.current = readTheme(el);
        lastTheme = now;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth,
        h = el.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      const g = client.game;
      if (!ctx || !g) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // camera: follow the single local player while alive, otherwise fit the whole map
      const follow = client.me.length === 1 && g.players[client.me[0]]?.alive && client.status !== 'ended';
      let target: Camera;
      if (follow) {
        const [hx, hy] = headPos(client, g, client.me[0], client.frac(now));
        const across = w < 640 ? 26 : 38;
        target = { cx: hx + 0.5, cy: hy + 0.5, cell: Math.max(10, Math.min(w, h * 1.4) / across) };
      } else {
        const cell = Math.min((w - 16) / g.w, (h - 16) / g.h);
        target = { cx: g.w / 2, cy: g.h / 2, cell };
      }
      const c0 = cam.current;
      const jump = Math.abs(c0.cell - target.cell) > target.cell * 0.5 || c0.cx === 0;
      const k = jump || !animRef.current ? 1 : 0.25;
      cam.current = { cx: c0.cx + (target.cx - c0.cx) * k, cy: c0.cy + (target.cy - c0.cy) * k, cell: c0.cell + (target.cell - c0.cell) * k };
      client.screenHead = null;
      draw(ctx, w, h, client, cam.current, theme.current, now, animRef.current);
      if (mini.current && now - lastMini > 250) {
        lastMini = now;
        const m = mini.current;
        if (m.width !== g.w) {
          m.width = g.w;
          m.height = g.h;
        }
        const mctx = m.getContext('2d');
        if (mctx) drawMinimap(mctx, client, theme.current);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = KEYS[e.code];
      if (!m) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      const [slot, d] = m;
      client.steer(client.me.length === 2 ? slot : 0, d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  // mouse / touch
  const swipe = useRef<Map<number, { x: number; y: number; slot: number }>>(new Map());
  const lastMouseDir = useRef<Dir | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const rect = wrap.current!.getBoundingClientRect();
    const slot = client.me.length === 2 && e.clientX - rect.left > rect.width / 2 ? 1 : 0;
    swipe.current.set(e.pointerId, { x: e.clientX, y: e.clientY, slot });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const sh = client.screenHead;
      if (!sh || client.me.length !== 1) return;
      const rect = wrap.current!.getBoundingClientRect();
      const dx = e.clientX - rect.left - sh.x,
        dy = e.clientY - rect.top - sh.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < sh.cell * 1.2) return;
      const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      if (d !== lastMouseDir.current) {
        lastMouseDir.current = d;
        client.steer(0, d);
      }
      return;
    }
    const s = swipe.current.get(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x,
      dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    client.steer(s.slot, d);
    swipe.current.set(e.pointerId, { x: e.clientX, y: e.clientY, slot: s.slot });
  };
  const onPointerUp = (e: React.PointerEvent) => swipe.current.delete(e.pointerId);

  // virtual joystick
  const joyRef = useRef<HTMLDivElement>(null);
  const joyMove = (e: React.PointerEvent) => {
    const r = joyRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2),
      dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const max = r.width / 2 - 16;
    const kx = len > max ? (dx / len) * max : dx,
      ky = len > max ? (dy / len) * max : dy;
    setKnob([kx, ky]);
    if (len > 16) client.steer(0, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  };

  const g = client.game;
  const total = g ? g.w * g.h : 1;
  const mePlayers = g ? client.me.map((i) => g.players[i]).filter(Boolean) : [];
  const ranking = g ? [...g.players].filter((p) => p.alive).sort((a, b) => b.land - a.land) : [];
  const remaining = client.remainingSec();
  const now = performance.now();
  const feed = client.feed.filter((f) => now - f.at < 3500).slice(-3);
  const name = (i: number | null | undefined) => (i !== null && i !== undefined && g?.players[i] ? g.players[i].name : '?');

  return (
    <div
      ref={wrap}
      className="relative h-[calc(100dvh-8.5rem)] min-h-[360px] w-full touch-none select-none overflow-hidden rounded-2xl border border-[var(--border)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label={t('game.territory')}
      data-status={client.status}
      data-tick={g?.tick}
      data-dir={mePlayers[0]?.dir}
      data-alive={mePlayers[0] ? String(mePlayers[0].alive) : undefined}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />

      {/* HUD: own stats */}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
        {mePlayers.map((p) => (
          <div key={p.idx} className="rounded-xl bg-black/55 px-3 py-1.5 text-white backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-3 w-3 rounded-sm" style={{ background: PALETTE[p.color % 8].base }} />
              {p.name}
              {!p.alive && <span className="text-xs text-red-300">✕</span>}
            </div>
            <div className="text-2xl font-bold tabular-nums leading-tight">{((p.land / total) * 100).toFixed(1)}%</div>
            <div className="text-xs opacity-80">
              {t('tr.hud.kills')} {p.kills}
            </div>
          </div>
        ))}
        {remaining !== null && (
          <div className="w-fit rounded-lg bg-black/55 px-3 py-1 font-mono text-sm text-white tabular-nums" role="timer" aria-label={t('tr.hud.time')}>
            ⏱ {fmtTime(remaining)}
          </div>
        )}
      </div>

      {/* HUD: leaderboard */}
      <div className="pointer-events-none absolute right-2 top-2 w-44 rounded-xl bg-black/55 p-2 text-xs text-white backdrop-blur-sm sm:w-52" aria-live="off">
        <div className="mb-1 font-semibold opacity-80">{t('tr.hud.rank')}</div>
        <ol className="space-y-0.5">
          {ranking.slice(0, 5).map((p, i) => (
            <li key={p.idx} className={`flex items-center gap-1.5 ${client.me.includes(p.idx) ? 'font-bold' : ''}`}>
              <span className="w-4 tabular-nums opacity-70">{i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[p.color % 8].base }} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="tabular-nums">{((p.land / total) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ol>
        {ranking.length > 0 && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="flex h-full">
              {ranking.map((p) => (
                <div key={p.idx} style={{ width: `${(p.land / total) * 100}%`, background: PALETTE[p.color % 8].base }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* event toasts */}
      <div className="pointer-events-none absolute inset-x-0 top-14 flex flex-col items-center gap-1 sm:top-3" aria-live="polite">
        {feed.map((f) => {
          if (f.ev.type === 'capture')
            return (
              <div key={f.id} className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-white shadow">
                +{f.ev.cells}
              </div>
            );
          const mine = client.me.includes(f.ev.player);
          const byMe = f.ev.by !== null && f.ev.by !== undefined && client.me.includes(f.ev.by);
          const text =
            f.ev.reason === 'cut' || (f.ev.by !== null && f.ev.by !== undefined && f.ev.by !== f.ev.player && f.ev.reason !== 'collision')
              ? byMe
                ? t('tr.ev.youKilled', { name: name(f.ev.player) })
                : t('tr.ev.killed', { killer: name(f.ev.by), name: name(f.ev.player) })
              : t(`tr.ev.died.${f.ev.reason}` as StringKey, { name: name(f.ev.player) });
          return (
            <div key={f.id} className={`rounded-full px-3 py-1 text-sm font-semibold shadow ${byMe ? 'bg-[var(--gold)] text-black' : mine ? 'bg-red-600 text-white' : 'bg-black/60 text-white'}`}>
              {mine && !byMe ? `💥 ${t('tr.ev.youDied')} — ` : ''}
              {text}
            </div>
          );
        })}
      </div>

      {/* minimap */}
      <canvas ref={mini} className="pointer-events-none absolute bottom-2 right-2 h-24 w-24 rounded-lg border-2 border-white/70 shadow sm:h-32 sm:w-32" style={{ imageRendering: 'pixelated' }} aria-hidden="true" />

      {/* controls hint & joystick toggle */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <span className="pointer-events-none hidden rounded-lg bg-black/45 px-2 py-1 text-xs text-white sm:inline">{client.me.length === 2 ? t('tr.hud.controls2p') : t('tr.hud.controls')}</span>
        {client.me.length === 1 && (
          <button type="button" onClick={() => setJoystick((j) => !j)} className="rounded-lg bg-black/45 px-2 py-1 text-xs text-white" aria-pressed={joystick}>
            🕹 {t('tr.hud.joystick')}
          </button>
        )}
      </div>
      {joystick && client.me.length === 1 && (
        <div
          ref={joyRef}
          className="absolute bottom-12 left-4 h-32 w-32 rounded-full border-2 border-white/60 bg-black/25"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            joyMove(e);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.buttons || e.pointerType !== 'mouse') joyMove(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setKnob(null);
          }}
        >
          <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/80 shadow" style={{ transform: `translate(calc(-50% + ${knob?.[0] ?? 0}px), calc(-50% + ${knob?.[1] ?? 0}px))` }} />
        </div>
      )}

      {client.status === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="animate-pulse rounded-2xl bg-black/60 px-8 py-4 text-center text-white">
            <div className="text-lg">{t('tr.hud.countdown')}</div>
            <div className="text-6xl font-bold tabular-nums">{Math.max(1, Math.ceil((client.countdownEnd - now) / 1000))}</div>
          </div>
        </div>
      )}
      {overlay}
    </div>
  );
}
