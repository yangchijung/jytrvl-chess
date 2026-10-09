import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Action } from '../../shared/blocks/engine';
import { useI18n } from '../i18n';
import { useSettings } from '../lib/settings';
import { playSound } from '../lib/sound';
import type { BlocksSession, BPlayer } from './session';
import { drawBoard } from './render';
import { CONTROLS, P1_KEYS, P2_KEYS, loadHandling, loadKeys, type Control, type KeyMap } from './keys';

export function useBlocks(s: BlocksSession) {
  const sub = useCallback((f: () => void) => s.subscribe(f), [s]);
  return useSyncExternalStore(sub, () => s.version);
}

const ACTION: Record<Exclude<Control, 'left' | 'right' | 'soft'>, Action> = { hard: 'HD', cw: 'CW', ccw: 'CCW', r180: '180', hold: 'HOLD' };

/** auto-repeat state for one slot */
interface Rep {
  dir: -1 | 0 | 1;
  since: number;
  last: number;
}

function Board({ p, idx, session, compact, now }: { p: BPlayer; idx: number; session: BlocksSession; compact: boolean; now: number }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef(settings.animation);
  anim.current = settings.animation;
  const labels = useRef({ hold: t('bl.hud.hold'), next: t('bl.hud.next') });
  useEffect(() => {
    let raf = 0;
    const loop = (tm: number) => {
      raf = requestAnimationFrame(loop);
      const cv = canvas.current,
        el = wrap.current;
      const player = session.players[idx];
      if (!cv || !el || !player) return;
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
      const dark = document.documentElement.getAttribute('data-theme') === 'dark' || getComputedStyle(el).colorScheme.includes('dark');
      drawBoard(ctx, w, h, player, { dark }, tm, anim.current, compact, labels.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [session, idx, compact]);
  const g = p.game;
  const pop = p.popup && now - p.popup.at < 1400 ? p.popup.info : null;
  const popText = pop
    ? [
        pop.tspin !== 'none' ? `${pop.tspin === 'mini' ? 'Mini ' : ''}T-Spin` : '',
        ['', t('bl.clear.1'), t('bl.clear.2'), t('bl.clear.3'), t('bl.clear.4')][pop.lines] ?? '',
        pop.perfect ? t('bl.clear.pc') : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 px-1 text-sm">
        <span className="truncate font-semibold">
          {p.name}
          {p.rating ? <span className="ml-1 text-xs text-[var(--muted)]">({p.rating})</span> : null}
          {p.connected === false && <span className="ml-1 text-[var(--danger)]">⚠</span>}
        </span>
        <span className="tabular-nums text-[var(--muted)]">
          {t('bl.hud.lines')} <b className="text-[var(--text)]">{g.lines}</b> · Lv <b className="text-[var(--text)]">{g.level}</b>
        </span>
      </div>
      <div ref={wrap} className="relative min-h-0 flex-1" data-board={idx} data-lines={g.lines} data-score={g.score} data-status={g.status} data-pieces={g.pieces}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {pop && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-1 text-center" aria-live="polite" style={settings.animation ? { animation: 'jy-pop 0.35s ease-out' } : undefined}>
            {popText && <span className="rounded-full bg-black/65 px-3 py-1 text-lg font-bold text-white">{popText}</span>}
            {pop.b2b && <span className="rounded-full bg-[var(--gold)] px-2 text-xs font-bold text-black">Back-to-Back</span>}
            {pop.combo > 0 && <span className="rounded-full bg-[var(--accent)] px-2 text-xs font-bold text-white">{t('bl.hud.combo', { n: pop.combo })}</span>}
            {pop.attack > 0 && <span className="text-xs font-bold text-orange-400">⚔ {pop.attack}</span>}
          </div>
        )}
      </div>
      <div className="px-1 text-center font-mono text-xl font-bold tabular-nums" data-testid={`score-${idx}`}>
        {g.score.toLocaleString()}
      </div>
    </div>
  );
}

/** big touch button; moves auto-repeat through the shared DAS/ARR logic */
function TouchButton({ c, label, aria, className = '', press, accent }: { c: Control; label: string; aria: string; className?: string; accent?: boolean; press: (slot: number, c: Control, down: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={aria}
      className={`flex h-14 min-w-14 select-none items-center justify-center rounded-2xl px-3 text-xl font-bold shadow active:scale-95 ${accent ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-2)] active:bg-[var(--accent-soft)]'} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        press(0, c, true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        press(0, c, false);
      }}
      onPointerCancel={() => press(0, c, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function BlocksView({ session, overlay, extraHud }: { session: BlocksSession; overlay?: ReactNode; extraHud?: ReactNode }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  useBlocks(session);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  const sound = useRef(settings.sound);
  sound.current = settings.sound;

  // sounds
  const heard = useRef(0);
  useEffect(() => {
    for (const s of session.sounds) {
      if (s.at <= heard.current) continue;
      const mine = session.players[s.player]?.slot >= 0;
      if (!mine && s.kind === 'drop') continue;
      playSound(s.kind === 'level' ? 'notify' : s.kind, sound.current);
    }
    heard.current = session.sounds.at(-1)?.at ?? heard.current;
  });
  const prevStatus = useRef(session.status);
  useEffect(() => {
    if (session.status === 'ended' && prevStatus.current !== 'ended') playSound('end', sound.current);
    if (session.status === 'playing' && prevStatus.current === 'countdown') playSound('notify', sound.current);
    prevStatus.current = session.status;
  });

  // game loop + keyboard auto-repeat (DAS / ARR)
  const reps = useRef<Rep[]>([
    { dir: 0, since: 0, last: 0 },
    { dir: 0, since: 0, last: 0 },
  ]);
  const held = useRef<Set<string>>(new Set());
  const handling = useRef(loadHandling());
  const local2 = session.players.filter((p) => p.slot >= 0).length === 2;
  const maps = useRef<KeyMap[]>(local2 ? [P1_KEYS, P2_KEYS] : [loadKeys()]);
  maps.current = local2 ? [P1_KEYS, P2_KEYS] : [loadKeys()];

  const shift = useCallback(
    (slot: number, dir: -1 | 1) => {
      session.input(slot, dir < 0 ? 'L' : 'R');
    },
    [session],
  );
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      session.update(now);
      const h = handling.current;
      reps.current.forEach((r, slot) => {
        if (!r.dir) return;
        if (now - r.since < h.das) return;
        if (h.arr === 0) {
          for (let i = 0; i < 10; i++) shift(slot, r.dir as -1 | 1);
          return;
        }
        while (now - r.last >= h.arr) {
          shift(slot, r.dir as -1 | 1);
          r.last += h.arr;
        }
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [session, shift]);

  const press = useCallback(
    (slot: number, c: Control, down: boolean) => {
      const r = reps.current[slot];
      const now = performance.now();
      if (c === 'left' || c === 'right') {
        const dir = c === 'left' ? -1 : 1;
        if (down) {
          if (r.dir !== dir) {
            r.dir = dir;
            r.since = now;
            r.last = now + handling.current.das;
            shift(slot, dir);
          }
        } else if (r.dir === dir) r.dir = 0;
        return;
      }
      if (c === 'soft') {
        session.input(slot, down ? 'SD1' : 'SD0');
        return;
      }
      if (down) session.input(slot, ACTION[c]);
    },
    [session, shift],
  );

  useEffect(() => {
    const find = (code: string): [number, Control] | null => {
      for (let slot = 0; slot < maps.current.length; slot++) for (const c of CONTROLS) if (maps.current[slot][c].includes(code)) return [slot, c];
      return null;
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if ((e.code === 'Escape' || e.code === 'KeyP' || e.code === 'F1') && session.canPause()) {
        e.preventDefault();
        session.togglePause();
        return;
      }
      const m = find(e.code);
      if (!m) return;
      e.preventDefault();
      if (held.current.has(e.code)) return; // ignore OS key repeat; we do our own DAS/ARR
      held.current.add(e.code);
      press(m[0], m[1], true);
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      const m = find(e.code);
      if (m) press(m[0], m[1], false);
    };
    const blur = () => {
      held.current.clear();
      reps.current.forEach((r) => (r.dir = 0));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [session, press]);

  // touch gestures on the board area (single local player): tap = rotate, horizontal drag = move by cells,
  // quick flick down = hard drop, slow drag down = soft drop
  const gesture = useRef<{ x: number; y: number; t: number; cells: number; moved: boolean; soft: boolean } | null>(null);
  const cellPx = 24;
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || local2) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), cells: 0, moved: false, soft: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const gs = gesture.current;
    if (!gs) return;
    const dx = e.clientX - gs.x,
      dy = e.clientY - gs.y;
    const want = Math.trunc(dx / cellPx);
    while (gs.cells < want) {
      shift(0, 1);
      gs.cells++;
      gs.moved = true;
    }
    while (gs.cells > want) {
      shift(0, -1);
      gs.cells--;
      gs.moved = true;
    }
    if (dy > cellPx * 1.5 && Math.abs(dx) < cellPx && !gs.soft) {
      gs.soft = true;
      gs.moved = true;
      session.input(0, 'SD1');
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const gs = gesture.current;
    gesture.current = null;
    if (!gs) return;
    const dt = performance.now() - gs.t;
    const dy = e.clientY - gs.y,
      dx = e.clientX - gs.x;
    if (gs.soft) session.input(0, 'SD0');
    if (dy > 60 && dt < 220 && Math.abs(dx) < 40) session.input(0, 'HD');
    else if (dy < -50 && dt < 300) session.input(0, 'HOLD');
    else if (!gs.moved && dt < 250 && Math.hypot(dx, dy) < 12) session.input(0, 'CW');
  };

  const now = performance.now();
  const mine = session.players.map((p, i) => ({ p, i }));
  const compactOthers = mine.length > 1 && typeof window !== 'undefined' && window.innerWidth < 720;

  return (
    <div className="space-y-2">
      <div
        className={`relative flex ${touch && !local2 ? 'h-[calc(100dvh-19rem)]' : 'h-[calc(100dvh-12rem)]'} min-h-[340px] touch-none select-none gap-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="application"
        aria-label={t('game.blocks')}
        data-status={session.status}
      >
        {mine.map(({ p, i }) => (
          <div key={i} className={`flex min-w-0 ${compactOthers && p.slot < 0 ? 'w-[34%] flex-none' : 'flex-1'}`}>
            <Board p={p} idx={i} session={session} compact={compactOthers && p.slot < 0} now={now} />
          </div>
        ))}
        {(session.status === 'countdown' || session.status === 'paused') && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="rounded-2xl bg-black/65 px-8 py-4 text-center text-white">
              {session.status === 'paused' ? (
                <div className="text-3xl font-bold">⏸ {t('sn.hud.paused')}</div>
              ) : (
                <>
                  <div className="text-lg">{t('tr.hud.countdown')}</div>
                  <div className="text-6xl font-bold tabular-nums">{Math.max(1, Math.ceil((session.countdownEnd - now) / 1000))}</div>
                </>
              )}
            </div>
          </div>
        )}
        {overlay}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        {extraHud}
        {session.canPause() && (session.status === 'playing' || session.status === 'paused') && (
          <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-1 font-semibold text-[var(--text)]" onClick={() => session.togglePause()} aria-pressed={session.status === 'paused'}>
            {session.status === 'paused' ? `▶ ${t('sn.hud.resume')}` : `⏸ ${t('sn.hud.pause')}`}
          </button>
        )}
        {!local2 && (
          <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-1" onClick={() => setTouch((v) => !v)} aria-pressed={touch}>
            📱 {t('bl.hud.touch')}
          </button>
        )}
        <span className="hidden sm:inline">{local2 ? t('bl.hud.controls2p') : t('bl.hud.controls')}</span>
      </div>
      {touch && !local2 && (
        <div className="grid grid-cols-2 gap-3 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <TouchButton press={press} c="left" label="◀" aria={t('bl.ctl.left')} />
            <TouchButton press={press} c="soft" label="▼" aria={t('bl.ctl.soft')} />
            <TouchButton press={press} c="right" label="▶" aria={t('bl.ctl.right')} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TouchButton press={press} c="hold" label="H" aria={t('bl.ctl.hold')} className="text-base" />
            <TouchButton press={press} c="ccw" label="⟲" aria={t('bl.ctl.ccw')} />
            <TouchButton press={press} c="cw" label="⟳" aria={t('bl.ctl.cw')} />
            <TouchButton press={press} c="hard" label="⤓" aria={t('bl.ctl.hard')} accent />
          </div>
        </div>
      )}
    </div>
  );
}
