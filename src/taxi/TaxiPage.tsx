// Rush Taxi (/taxi) — stage 1 grey box: drive the car on a test ground to tune the feel (rush start, drift,
// jumps). Full screen, no site header. The 3D engine (Three.js + Rapier) loads only on this page.
// HUD is icons and big numbers; the dev panel (~) lists every tuning number with a slider.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { Game, HudState } from './game';
import { TUNING_RANGE, type Tuning } from './vehicle/tuning';
import './taxi.css';

const T = {
  home: { zh: '回到 JY Games', en: 'Back to JY Games' },
  loading: { zh: '載入中', en: 'Loading' },
  failed: { zh: '這台裝置無法開啟 3D 畫面', en: 'This device cannot show the 3D view' },
  gas: { zh: '油門', en: 'Gas' },
  brake: { zh: '煞車', en: 'Brake' },
  drift: { zh: '甩尾', en: 'Drift' },
  rush: { zh: '衝刺', en: 'Rush' },
  reset: { zh: '翻正', en: 'Reset' },
  steer: { zh: '方向盤：左右拖曳', en: 'Steering: drag left or right' },
};

export function TaxiPage() {
  const { lang, to } = useI18n();
  const tr = (l: { zh: string; en: string }) => l[lang];
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [hud, setHud] = useState<HudState | null>(null);
  const [dev, setDev] = useState(false);
  const [, force] = useState(0);
  const touchUi = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    let alive = true;
    let g: Game | null = null;
    let lastHud = 0;
    (async () => {
      try {
        const { startGame } = await import('./game');
        if (!alive || !canvas.current) return;
        g = await startGame(canvas.current, (h) => {
          const now = performance.now();
          if (now - lastHud > 80) {
            lastHud = now;
            setHud(h);
          }
        }, { lowPower: touchUi });
        if (!alive) return g.dispose();
        game.current = g;
        (window as unknown as { __taxi: Game }).__taxi = g;
        setState('ready');
      } catch (e) {
        console.error(e);
        if (alive) setState('failed');
      }
    })();
    const onResize = () => game.current?.resize();
    const onKey = (e: KeyboardEvent) => e.code === 'Backquote' && setDev((d) => !d);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      g?.dispose();
      game.current = null;
    };
  }, [touchUi]);

  // ---------- touch: left half = steering stick (drag sideways), buttons on the right ----------
  const stick = useRef<{ id: number; x0: number } | null>(null);
  const [knob, setKnob] = useState(0);
  const onStickDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (stick.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, x0: e.clientX };
  };
  const onStickMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId || !game.current) return;
    const v = Math.max(-1, Math.min(1, (e.clientX - s.x0) / 80));
    game.current.input.touch.steer = v;
    setKnob(v);
  };
  const onStickUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    if (game.current) game.current.input.touch.steer = 0;
    setKnob(0);
  };
  const hold = (key: 'gas' | 'brake' | 'drift') => ({
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (game.current) game.current.input.touch[key] = true;
    },
    onPointerUp: () => game.current && (game.current.input.touch[key] = false),
    onPointerCancel: () => game.current && (game.current.input.touch[key] = false),
    onLostPointerCapture: () => game.current && (game.current.input.touch[key] = false),
  });

  const tune = (k: keyof Tuning, v: number) => {
    const g = game.current;
    if (!g) return;
    g.tuning[k] = v;
    g.car.applyTuning();
    force((n) => n + 1);
  };

  return (
    <div className="taxi" data-testid="taxi" data-state={state}>
      <canvas ref={canvas} className="taxi-canvas" data-testid="taxi-canvas" />
      <Link to={to('/')} className="taxi-btn taxi-home" aria-label={tr(T.home)} data-testid="taxi-home">
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h5v-5h3v5h5V10" />
        </svg>
      </Link>
      {state === 'loading' && (
        <div className="taxi-center" role="status">
          {tr(T.loading)}
        </div>
      )}
      {state === 'failed' && (
        <div className="taxi-center" role="alert">
          {tr(T.failed)}
        </div>
      )}
      {hud && (
        <div className="taxi-hud" aria-live="off" data-testid="taxi-hud" data-kmh={Math.round(hud.kmh)} data-drift={hud.drifting} data-air={hud.airborne} data-rush={hud.rush}>
          <div className="taxi-speed">
            <span className="taxi-speed-n">{Math.round(hud.kmh)}</span>
            <span className="taxi-speed-u">km/h</span>
          </div>
          <div className="taxi-badges" aria-hidden="true">
            <span className="taxi-badge" data-on={hud.rush} title="rush">
              <svg viewBox="0 0 24 24" width="34" height="34">
                <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#FFC72C" stroke="#23303F" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="taxi-badge" data-on={hud.drifting} title="drift">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 18c4 0 6-3 6-6s2-6 6-6" />
                <path d="M6 21c3-1 4-2 5-4M14 8c1-2 2-3 5-4" />
              </svg>
            </span>
            <span className="taxi-badge" data-on={hud.airborne} title="air">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V5M6 11l6-6 6 6" />
              </svg>
            </span>
          </div>
          <div className="taxi-fps">{hud.fps} fps</div>
        </div>
      )}
      {touchUi && state === 'ready' && (
        <>
          <div className="taxi-stick" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} role="slider" aria-label={tr(T.steer)} aria-valuemin={-1} aria-valuemax={1} aria-valuenow={knob} data-testid="taxi-stick">
            <span className="taxi-stick-base" aria-hidden="true">
              <span className="taxi-stick-knob" style={{ transform: `translateX(${knob * 44}px)` }} />
            </span>
          </div>
          <button type="button" className="taxi-btn taxi-gas" aria-label={tr(T.gas)} data-testid="taxi-gas" {...hold('gas')}>
            <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" fill="currentColor">
              <path d="M12 3 4 13h5v8h6v-8h5z" />
            </svg>
          </button>
          <button type="button" className="taxi-btn taxi-brake" aria-label={tr(T.brake)} data-testid="taxi-brake" {...hold('brake')}>
            <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" fill="currentColor">
              <path d="M12 21 4 11h5V3h6v8h5z" />
            </svg>
          </button>
          <button type="button" className="taxi-btn taxi-drift" aria-label={tr(T.drift)} data-testid="taxi-drift" {...hold('drift')}>
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M4 18c4 0 6-3 6-6s2-6 6-6" />
              <path d="M6 21c3-1 4-2 5-4M14 8c1-2 2-3 5-4" />
            </svg>
          </button>
          <button type="button" className="taxi-btn taxi-rush" aria-label={tr(T.rush)} data-testid="taxi-rush" onPointerDown={() => game.current && (game.current.input.touch.rush = true)}>
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
              <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#FFC72C" stroke="#23303F" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="taxi-btn taxi-reset" aria-label={tr(T.reset)} data-testid="taxi-reset" onPointerDown={() => game.current && (game.current.input.touch.reset = true)}>
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
              <path d="M4 4v4.5h4.5" />
            </svg>
          </button>
        </>
      )}
      {dev && game.current && (
        <div className="taxi-dev" data-testid="taxi-dev">
          <p>tuning (~)</p>
          {(Object.keys(TUNING_RANGE) as (keyof Tuning)[]).map((k) => {
            const [lo, hi, st] = TUNING_RANGE[k]!;
            const v = game.current!.tuning[k];
            return (
              <label key={k}>
                <span>
                  {k} <b>{Number(v.toFixed(3))}</b>
                </span>
                <input type="range" min={lo} max={hi} step={st} value={v} onChange={(e) => tune(k, Number(e.target.value))} />
              </label>
            );
          })}
          <button type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(game.current!.tuning, null, 2))}>
            copy JSON
          </button>
        </div>
      )}
    </div>
  );
}
