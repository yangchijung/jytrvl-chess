import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Dir } from '../../shared/snake/engine';
import { useI18n, type StringKey } from '../i18n';
import { useSettings } from '../lib/settings';
import { playSound } from '../lib/sound';
import { PALETTE, readTheme, type Theme } from '../territory/render';
import type { SnakeClient } from './client';
import { drawSnakeArena, fitView } from './render';

const KEYS: Record<string, [slot: number, d: Dir]> = {
  KeyW: [0, 0],
  KeyD: [0, 1],
  KeyS: [0, 2],
  KeyA: [0, 3],
  ArrowUp: [1, 0],
  ArrowRight: [1, 1],
  ArrowDown: [1, 2],
  ArrowLeft: [1, 3],
};

export function useSnakeClient(c: SnakeClient) {
  const sub = useCallback((f: () => void) => c.subscribe(f), [c]);
  return useSyncExternalStore(sub, () => c.version);
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function SnakeCanvas({ client, overlay, best }: { client: SnakeClient; overlay?: ReactNode; best?: number }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  useSnakeClient(client);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useRef<Theme | null>(null);
  const [dpad, setDpad] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const soundRef = useRef(settings.sound);
  soundRef.current = settings.sound;
  const animRef = useRef(settings.animation);
  animRef.current = settings.animation;

  // sounds
  const lastEv = useRef(0);
  const lastScore = useRef(0);
  useEffect(() => {
    const g = client.game;
    if (!g) return;
    const me = client.me[0];
    const sc = me !== undefined ? g.snakes[me]?.foods ?? 0 : 0;
    if (sc > lastScore.current) playSound('eat', soundRef.current);
    lastScore.current = sc;
    for (const f of client.feed) {
      if (f.id <= lastEv.current) continue;
      lastEv.current = f.id;
      if (f.ev.type === 'death') playSound(client.me.includes(f.ev.snake) ? 'error' : 'capture', soundRef.current);
      if (f.ev.type === 'eat' && f.ev.gold) playSound('gold', soundRef.current);
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
    let lastTheme = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      client.update(now);
      const cv = canvas.current,
        el = wrap.current;
      const g = client.game;
      if (!cv || !el || !g) return;
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
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSnakeArena(ctx, w, h, client, fitView(w, h, g), theme.current, now, animRef.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') && client.canPause()) {
        e.preventDefault();
        client.togglePause();
        return;
      }
      const m = KEYS[e.code];
      if (!m) return;
      e.preventDefault();
      client.steer(client.me.length === 2 ? m[0] : 0, m[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  // swipe (two-player: left half = player 1, right half = player 2)
  const swipe = useRef(new Map<number, { x: number; y: number; slot: number }>());
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const r = wrap.current!.getBoundingClientRect();
    swipe.current.set(e.pointerId, { x: e.clientX, y: e.clientY, slot: client.me.length === 2 && e.clientX - r.left > r.width / 2 ? 1 : 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    const s = swipe.current.get(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x,
      dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    client.steer(s.slot, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    swipe.current.set(e.pointerId, { ...s, x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => swipe.current.delete(e.pointerId);

  const g = client.game;
  const now = performance.now();
  const mine = g ? client.me.map((i) => g.snakes[i]).filter(Boolean) : [];
  const ranking = g ? [...g.snakes].sort((a, b) => Number(b.alive) - Number(a.alive) || b.body.length - a.body.length || b.score - a.score) : [];
  const remaining = client.remainingSec();
  const feed = client.feed.filter((f) => now - f.at < 3000).slice(-3);
  const nameOf = (i: number | null | undefined) => (i !== null && i !== undefined && g?.snakes[i] ? g.snakes[i].name : '?');
  const versus = g?.cfg.mode === 'versus';

  return (
    <div
      ref={wrap}
      className="relative h-[calc(100dvh-8.5rem)] min-h-[360px] w-full touch-none select-none overflow-hidden rounded-2xl border border-[var(--border)]"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="application"
      aria-label={t('game.snake')}
      data-status={client.status}
      data-tick={g?.tick}
      data-dir={mine[0]?.dir}
      data-alive={mine[0] ? String(mine[0].alive) : undefined}
      data-score={mine[0]?.score}
      data-len={mine[0]?.body.length}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
        {mine.map((s) => (
          <div key={s.idx} className="rounded-xl bg-black/55 px-3 py-1.5 text-white backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[(client.colors[s.idx] ?? s.color) % 8].base }} />
              {s.name}
              {!s.alive && <span className="text-xs text-red-300">✕</span>}
            </div>
            <div className="text-2xl font-bold tabular-nums leading-tight" data-testid="score">
              {s.score}
            </div>
            <div className="text-xs opacity-80">
              {t('sn.hud.len')} {s.body.length}
              {versus ? ` · ${t('tr.hud.kills')} ${s.kills}` : ''}
              {g?.cfg.mode === 'timeattack' ? ` · ${t('sn.hud.crashes')} ${s.deaths}` : ''}
            </div>
          </div>
        ))}
        {best !== undefined && !versus && <div className="w-fit rounded-lg bg-black/45 px-3 py-1 text-xs text-white">{t('sn.hud.best', { n: Math.max(best, mine[0]?.score ?? 0) })}</div>}
        {remaining !== null && (
          <div className="w-fit rounded-lg bg-black/55 px-3 py-1 font-mono text-sm text-white tabular-nums" role="timer" aria-label={t('tr.hud.time')}>
            ⏱ {fmt(remaining)}
          </div>
        )}
      </div>

      {versus && (
        <div className="pointer-events-none absolute right-2 top-2 w-44 rounded-xl bg-black/55 p-2 text-xs text-white backdrop-blur-sm sm:w-52">
          <div className="mb-1 font-semibold opacity-80">{t('tr.hud.rank')}</div>
          <ol className="space-y-0.5">
            {ranking.slice(0, 8).map((s, i) => (
              <li key={s.idx} className={`flex items-center gap-1.5 ${client.me.includes(s.idx) ? 'font-bold' : ''} ${s.alive ? '' : 'line-through opacity-50'}`}>
                <span className="w-4 tabular-nums opacity-70">{i + 1}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[(client.colors[s.idx] ?? s.color) % 8].base }} />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="tabular-nums">{s.alive ? s.body.length : '—'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-14 flex flex-col items-center gap-1 sm:top-3" aria-live="polite">
        {feed.map((f) => {
          if (f.ev.type === 'eat') return (
              <div key={f.id} className="rounded-full bg-[var(--gold)] px-3 py-1 text-sm font-semibold text-black shadow">
                ⭐ {t('sn.ev.gold', { name: nameOf(f.ev.snake) })}
              </div>
            );
          if (f.ev.type !== 'death') return null;
          const mineDied = client.me.includes(f.ev.snake);
          const byMe = f.ev.by !== null && client.me.includes(f.ev.by);
          const text = f.ev.by !== null && f.ev.by !== f.ev.snake ? (byMe ? t('tr.ev.youKilled', { name: nameOf(f.ev.snake) }) : t('tr.ev.killed', { killer: nameOf(f.ev.by), name: nameOf(f.ev.snake) })) : t(`sn.ev.died.${f.ev.reason ?? 'wall'}` as StringKey, { name: nameOf(f.ev.snake) });
          return (
            <div key={f.id} className={`rounded-full px-3 py-1 text-sm font-semibold shadow ${byMe ? 'bg-[var(--gold)] text-black' : mineDied ? 'bg-red-600 text-white' : 'bg-black/60 text-white'}`}>
              {text}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <span className="pointer-events-none hidden rounded-lg bg-black/45 px-2 py-1 text-xs text-white sm:inline">{client.me.length === 2 ? t('tr.hud.controls2p') : t('sn.hud.controls')}</span>
        {client.me.length === 1 && (
          <button type="button" onClick={() => setDpad((d) => !d)} className="rounded-lg bg-black/45 px-2 py-1 text-xs text-white" aria-pressed={dpad}>
            ✚ {t('sn.hud.dpad')}
          </button>
        )}
        {client.canPause() && (client.status === 'playing' || client.status === 'paused') && (
          <button type="button" onClick={() => client.togglePause()} className="rounded-lg bg-black/55 px-3 py-1 text-xs font-semibold text-white" aria-pressed={client.status === 'paused'}>
            {client.status === 'paused' ? `▶ ${t('sn.hud.resume')}` : `⏸ ${t('sn.hud.pause')}`}
          </button>
        )}
      </div>

      {dpad && client.me.length === 1 && (
        <div className="absolute bottom-12 right-4 grid h-40 w-40 grid-cols-3 grid-rows-3 gap-1" aria-label={t('sn.hud.dpad')}>
          {(
            [
              [0, '▲', 'col-start-2 row-start-1'],
              [3, '◀', 'col-start-1 row-start-2'],
              [1, '▶', 'col-start-3 row-start-2'],
              [2, '▼', 'col-start-2 row-start-3'],
            ] as [Dir, string, string][]
          ).map(([d, label, pos]) => (
            <button
              key={d}
              type="button"
              aria-label={label}
              className={`${pos} rounded-xl bg-black/45 text-2xl text-white active:bg-black/70`}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                client.steer(0, d);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(client.status === 'countdown' || client.status === 'paused') && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="rounded-2xl bg-black/60 px-8 py-4 text-center text-white">
            {client.status === 'paused' ? (
              <div className="text-3xl font-bold">⏸ {t('sn.hud.paused')}</div>
            ) : (
              <>
                <div className="text-lg">{t('tr.hud.countdown')}</div>
                <div className="text-6xl font-bold tabular-nums">{Math.max(1, Math.ceil((client.countdownEnd - now) / 1000))}</div>
              </>
            )}
          </div>
        </div>
      )}
      {overlay}
    </div>
  );
}
