// Rush Taxi (/taxi) — stage 2: the arcade loop on the grey-box ground. Menu (arcade 50 s / practice), pick up
// passengers, follow the arrow, drop them off before their timer runs out, tips for stunts, results with a rank.
// Full screen, no site header. The 3D engine (Three.js + Rapier) loads only on this page.
// HUD is icons and big numbers; the dev panel (~) lists every tuning number with a slider.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { Game, HudState } from './game';
import type { Mode, Rating, RunEvent } from './gameplay/rules';
import { rankOf } from './gameplay/rules';
import { TUNING_RANGE, type Tuning } from './vehicle/tuning';
import { ClockIcon, CoinIcon, Hud, RiderIcon } from './ui/Hud';
import { BAND_COLOR } from './gameplay/view';
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
  arcade: { zh: '街機', en: 'Arcade' },
  practice: { zh: '練習', en: 'Practice' },
  time: { zh: '剩下時間', en: 'Time left' },
  money: { zh: '收入', en: 'Money' },
  dist: { zh: '距離', en: 'Distance' },
  again: { zh: '再玩一次', en: 'Play again' },
  menu: { zh: '回選單', en: 'Menu' },
  resume: { zh: '繼續', en: 'Resume' },
  pause: { zh: '暫停', en: 'Pause' },
  rides: { zh: '載客數', en: 'Rides' },
  combo: { zh: '最長連擊', en: 'Best combo' },
  rank: { zh: '評級', en: 'Rank' },
  slow: { zh: 'Slow', en: 'Slow' },
};
const RATING: Record<Rating, { text: string; color: string }> = { speedy: { text: 'Speedy!', color: '#43A047' }, normal: { text: 'Normal', color: '#FDD835' }, slow: { text: 'Slow', color: '#E53935' } };
type Pop = { id: number; kind: 'pickup' | 'drop' | 'tip' | 'timeout' | 'crash'; title: string; sub?: string; color?: string };

export function TaxiPage() {
  const { lang, to } = useI18n();
  const tr = (l: { zh: string; en: string }) => l[lang];
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [hud, setHud] = useState<HudState | null>(null);
  const [dev, setDev] = useState(false);
  const [screen, setScreen] = useState<'menu' | 'play' | 'over'>('menu');
  const [paused, setPaused] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const lastMode = useRef<Mode>('arcade');
  const popId = useRef(0);
  const pop = (p: Omit<Pop, 'id'>, ms = 1600) => {
    const id = ++popId.current;
    setPops((list) => [...list.filter((x) => x.kind !== p.kind || p.kind === 'tip'), { ...p, id }].slice(-4));
    setTimeout(() => setPops((list) => list.filter((x) => x.id !== id)), ms);
  };
  const onEvent = useRef<(e: RunEvent) => void>(() => undefined);
  onEvent.current = (e: RunEvent) => {
    if (e.t === 'pickup') pop({ kind: 'pickup', title: e.p.dest.name[lang], sub: `${e.p.limit}`, color: BAND_COLOR[e.p.band] }, 2200);
    else if (e.t === 'drop') pop({ kind: 'drop', title: RATING[e.rating].text, sub: `+${e.fare}${e.bonus ? `  +${e.bonus}s` : ''}`, color: RATING[e.rating].color }, 1800);
    else if (e.t === 'tip') pop({ kind: 'tip', title: `+${e.amount}`, sub: `×${e.combo}` }, 900);
    else if (e.t === 'timeout') pop({ kind: 'timeout', title: '…', color: '#E53935' }, 1400);
    else if (e.t === 'over') setScreen('over');
  };
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
        }, { lowPower: touchUi, lang, onEvent: (e) => onEvent.current(e), onPause: (p) => setPaused(p) });
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
  }, [touchUi]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const start = (mode: Mode) => {
    lastMode.current = mode;
    game.current?.startRun(mode);
    setPops([]);
    setPaused(false);
    setScreen('play');
  };
  const toMenu = () => {
    game.current?.startRun(null);
    setPaused(false);
    setScreen('menu');
  };
  const togglePause = (p: boolean) => {
    game.current?.setPaused(p);
    setPaused(p);
  };
  const result = screen === 'over' ? (game.current?.run() ?? null) : null;

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
      {hud && screen === 'play' && <Hud hud={hud} labels={{ time: tr(T.time), money: tr(T.money), dist: tr(T.dist) }} />}
      <div className="taxi-pops" aria-live="polite" data-testid="taxi-pops">
        {pops.map((p) => (
          <div key={p.id} className={`taxi-pop taxi-pop-${p.kind}`} data-kind={p.kind} style={{ borderColor: p.color }}>
            {p.kind === 'pickup' && <RiderIcon color={p.color ?? '#43A047'} size={40} />}
            <span className="taxi-pop-title">{p.title}</span>
            {p.sub && (
              <span className="taxi-pop-sub">
                {p.kind === 'pickup' && <ClockIcon size={26} />}
                {p.sub}
              </span>
            )}
          </div>
        ))}
      </div>
      {state === 'ready' && screen === 'play' && (
        <button type="button" className="taxi-btn taxi-pause" aria-label={tr(T.pause)} data-testid="taxi-pause" onClick={() => togglePause(true)}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </button>
      )}
      {state === 'ready' && screen === 'menu' && (
        <div className="taxi-overlay" data-testid="taxi-menu">
          <svg viewBox="0 0 120 60" width="220" height="110" aria-hidden="true">
            <rect x="10" y="22" width="100" height="24" rx="6" fill="#FFC72C" stroke="#23303F" strokeWidth="3" />
            <path d="M30 22l10-12h40l10 12" fill="#5C7A99" stroke="#23303F" strokeWidth="3" strokeLinejoin="round" />
            <rect x="50" y="4" width="20" height="7" rx="2" fill="#fff" stroke="#23303F" strokeWidth="2" />
            <circle cx="32" cy="48" r="8" fill="#23303F" />
            <circle cx="88" cy="48" r="8" fill="#23303F" />
          </svg>
          <div className="taxi-modes">
            <button type="button" className="taxi-mode" onClick={() => start('arcade')} data-testid="taxi-start-arcade">
              <ClockIcon size={56} />
              <span>{tr(T.arcade)}</span>
            </button>
            <button type="button" className="taxi-mode" onClick={() => start('practice')} data-testid="taxi-start-practice">
              <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 9c-3 0-4 2-4 3s1 3 4 3c4 0 8-6 12-6 3 0 4 2 4 3s-1 3-4 3c-4 0-8-6-12-6z" />
              </svg>
              <span>{tr(T.practice)}</span>
            </button>
          </div>
        </div>
      )}
      {paused && screen === 'play' && (
        <div className="taxi-overlay" data-testid="taxi-paused">
          <div className="taxi-modes">
            <button type="button" className="taxi-mode" onClick={() => togglePause(false)} data-testid="taxi-resume" aria-label={tr(T.resume)}>
              <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="currentColor">
                <path d="M7 4l13 8-13 8z" />
              </svg>
              <span>{tr(T.resume)}</span>
            </button>
            <button type="button" className="taxi-mode" onClick={() => start(lastMode.current)} data-testid="taxi-restart" aria-label={tr(T.again)}>
              <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
                <path d="M4 4v4.5h4.5" />
              </svg>
              <span>{tr(T.again)}</span>
            </button>
            <button type="button" className="taxi-mode" onClick={toMenu} data-testid="taxi-to-menu" aria-label={tr(T.menu)}>
              <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span>{tr(T.menu)}</span>
            </button>
          </div>
        </div>
      )}
      {screen === 'over' && result && (
        <div className="taxi-overlay" data-testid="taxi-over">
          <div className="taxi-rank" data-testid="taxi-rank">
            {rankOf(result.money)}
          </div>
          <dl className="taxi-results">
            <div>
              <dt aria-label={tr(T.money)}>
                <CoinIcon size={40} />
              </dt>
              <dd data-testid="taxi-result-money">{result.money}</dd>
            </div>
            <div>
              <dt aria-label={tr(T.rides)}>
                <RiderIcon color="#43A047" size={40} />
              </dt>
              <dd data-testid="taxi-result-rides">{result.rides}</dd>
            </div>
            <div>
              <dt aria-label={tr(T.combo)} className="taxi-results-x">
                ×
              </dt>
              <dd data-testid="taxi-result-combo">{result.bestCombo}</dd>
            </div>
          </dl>
          <div className="taxi-modes">
            <button type="button" className="taxi-mode" onClick={() => start(lastMode.current)} data-testid="taxi-again">
              <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
                <path d="M4 4v4.5h4.5" />
              </svg>
              <span>{tr(T.again)}</span>
            </button>
            <button type="button" className="taxi-mode" onClick={toMenu} data-testid="taxi-menu-btn">
              <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span>{tr(T.menu)}</span>
            </button>
          </div>
        </div>
      )}
      {touchUi && state === 'ready' && screen === 'play' && !paused && (
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
