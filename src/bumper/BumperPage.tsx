// Crazy Bumper (/bumper) — full-screen page like /taxi (no site header). The 3D engine (Three.js + Rapier) loads
// only here. The title UI is usable at once: a tap on 「開始遊戲」 before the engine is ready starts the round as
// soon as it is. Sound starts after the first tap or key (iOS).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { BumperGame, GameStats, HudState } from './game';
import type { Phase } from './rules/ScoreManager';
import { AudioSynth } from './core/AudioSynth';
import { loadPick, savePick, type AnimalId, type CarId } from './entities/roster';
import { DashButton, IconButton, Joystick, LABELS, PauseIcon, PauseScreen, PlayHud, ResultScreen, SoundIcon, TitleScreen } from './ui/KidsHUD';
import { HomeIcon } from './ui/icons';
import './bumper.css';

declare global {
  interface Window {
    __GAME_STATS__?: GameStats;
    __bumper?: BumperGame;
  }
}

/** the spec section 8 test hook, alive from the first paint */
function installStats(): { stats: GameStats; restore: () => void } {
  const stats: GameStats = { phase: 'title', fps: 0, avgFps: 0, frameCount: 0, playerPosition: { x: 0, y: 0, z: 0 }, playerScore: 0, totalCollisions: 0, dashCount: 0, activePowerUp: null, consoleErrors: [] };
  window.__GAME_STATS__ = stats;
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    stats.consoleErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 300));
    orig.apply(console, args);
  };
  const onErr = (e: ErrorEvent) => stats.consoleErrors.push(String(e.message).slice(0, 300));
  const onRej = (e: PromiseRejectionEvent) => stats.consoleErrors.push(String(e.reason).slice(0, 300));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);
  return {
    stats,
    restore() {
      console.error = orig;
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    },
  };
}

const roundFromUrl = () => {
  const n = Number(new URLSearchParams(location.search).get('round'));
  return Number.isFinite(n) && n >= 3 && n <= 600 ? n : undefined;
};

export function BumperPage() {
  const { lang, to } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<BumperGame | null>(null);
  const [audio] = useState(() => new AudioSynth());
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [phase, setPhase] = useState<Phase>('title');
  const [showResult, setShowResult] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [pick, setPickState] = useState<{ animal: AnimalId; car: CarId }>(() => loadPick());
  const [muted, setMuted] = useState(audio.muted);
  const pendingStart = useRef(false);

  useEffect(() => {
    let alive = true;
    const { stats, restore } = installStats();
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    (async () => {
      try {
        const { startBumper } = await import('./game');
        if (!alive || !canvas.current) return;
        const g = await startBumper(canvas.current, { pick, roundSeconds: roundFromUrl(), lowPower, motion: reduced ? 0.3 : 1, audio, stats, onPhase: (p) => setPhase(p) });
        if (!alive) return g.dispose();
        game.current = g;
        window.__bumper = g;
        setState('ready');
        if (pendingStart.current) {
          pendingStart.current = false;
          g.start();
        }
      } catch (e) {
        console.error(e);
        if (alive) setState('failed');
      }
    })();
    const onResize = () => game.current?.resize();
    const unlock = () => audio.unlock();
    const onVis = () => audio.suspend(document.hidden);
    // iOS Safari counts touchend and click (not touchstart / pointerdown) as the gesture that may start audio
    const gestures = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
    for (const ev of gestures) window.addEventListener(ev, unlock);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    // the HUD reads the game ~16 times a second (the 3D scene itself runs every frame)
    const poll = window.setInterval(() => {
      const g = game.current;
      if (g) setHud(g.hud());
    }, 60);
    return () => {
      alive = false;
      window.clearInterval(poll);
      for (const ev of gestures) window.removeEventListener(ev, unlock);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      game.current?.dispose();
      game.current = null;
      audio.dispose();
      restore();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the result card comes in after the slow-motion has begun
  useEffect(() => {
    if (phase !== 'result') return setShowResult(false);
    const t = window.setTimeout(() => setShowResult(true), 700);
    return () => window.clearTimeout(t);
  }, [phase]);

  const start = () => {
    audio.unlock();
    setPaused(false);
    if (game.current) {
      game.current.setPaused(false);
      game.current.start();
    } else {
      pendingStart.current = true;
      setPhase('playing');
      if (window.__GAME_STATS__) window.__GAME_STATS__.phase = 'title';
    }
  };
  const toTitle = () => {
    setPaused(false);
    game.current?.setPaused(false);
    game.current?.toTitle();
    setPhase('title');
  };
  const onPick = (p: { animal: AnimalId; car: CarId }) => {
    audio.unlock();
    audio.tick();
    setPickState(p);
    savePick(p);
    game.current?.setPick(p);
  };
  const pause = (p: boolean) => {
    setPaused(p);
    game.current?.setPaused(p);
  };
  const sound = () => {
    audio.unlock();
    audio.setMuted(!muted);
    setMuted(!muted);
  };

  const playing = phase === 'playing' && !paused;
  return (
    <div className="bump" data-testid="bumper" data-state={state} data-phase={phase} lang={lang === 'zh' ? 'zh-Hant-TW' : 'en'}>
      <canvas ref={canvas} className="bump-canvas" data-testid="bumper-canvas" />
      {state === 'failed' && (
        <div className="bump-failed" role="alert">
          {LABELS.failed[lang]}
        </div>
      )}
      {phase === 'title' && state !== 'failed' && (
        <>
          <Link to={to('/')} className="bump-icon-btn bump-tl" aria-label={LABELS.home[lang]} title={LABELS.home[lang]} data-testid="bumper-home">
            <HomeIcon />
          </Link>
          <IconButton label={muted ? LABELS.soundOff[lang] : LABELS.soundOn[lang]} onClick={sound} className="bump-tr" testid="bumper-sound">
            <SoundIcon on={!muted} />
          </IconButton>
          <TitleScreen lang={lang} pick={pick} onPick={onPick} onStart={start} ready={state === 'ready'} />
        </>
      )}
      {phase === 'playing' && hud && hud.phase === 'playing' && (
        <>
          <PlayHud hud={hud} lang={lang} />
          {!paused && (
            <IconButton label={LABELS.pause[lang]} onClick={() => pause(true)} className="bump-tr" testid="bumper-pause">
              <PauseIcon />
            </IconButton>
          )}
        </>
      )}
      {playing && game.current && (
        <>
          <Joystick input={game.current.input} lang={lang} />
          <DashButton input={game.current.input} cooldown={hud?.cooldown ?? 0} lang={lang} />
        </>
      )}
      {phase === 'playing' && state === 'loading' && <div className="bump-loading" role="status" aria-label="…" />}
      {phase === 'playing' && paused &&<PauseScreen lang={lang} muted={muted} onResume={() => pause(false)} onTitle={toTitle} onSound={sound} />}
      {phase === 'result' && showResult && hud && <ResultScreen lang={lang} score={hud.score} trophies={hud.trophies} onAgain={start} onTitle={toTitle} />}
    </div>
  );
}
