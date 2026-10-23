// Crazy Bumper — the children's interface (spec 3.2, 7.2): big picture buttons, numbers and icons only.
// Title: pick an animal and a car by tapping pictures, one big 「開始遊戲」 (4 characters on screen).
// Playing: no words at all — star + number, clock + number + bar, the stick, the lightning button.
// Result: 1–3 trophy stars, the score, one big 「再玩一次」 (4 characters).
import { useEffect, useRef, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { InputManager } from '../core/InputManager';
import type { HudState } from '../game';
import { ANIMALS, CARS, type AnimalId, type CarId } from '../entities/roster';
import { AnimalFace, CarIcon, CarSwatch, CheckBadge, ClockIcon, CrownIcon, LightningIcon, PauseIcon, PlayIcon, ReplayIcon, SoundIcon, StarIcon } from './icons';

type Lang = 'zh' | 'en';
export const LABELS = {
  start: { zh: '開始遊戲', en: 'Play' },
  again: { zh: '再玩一次', en: 'Again' },
  // screen-reader names only (never drawn on screen)
  home: { zh: '回到 JY Games', en: 'Back to JY Games' },
  pause: { zh: '暫停', en: 'Pause' },
  resume: { zh: '繼續', en: 'Resume' },
  title: { zh: '換車', en: 'Choose car' },
  soundOn: { zh: '聲音：開', en: 'Sound: on' },
  soundOff: { zh: '聲音：關', en: 'Sound: off' },
  dash: { zh: '衝刺', en: 'Dash' },
  stick: { zh: '方向搖桿', en: 'Steering stick' },
  stars: { zh: '星星', en: 'Stars' },
  leader: { zh: '第一名', en: 'Leader' },
  time: { zh: '剩下秒數', en: 'Seconds left' },
  animals: { zh: '選駕駛', en: 'Choose a driver' },
  cars: { zh: '選車子', en: 'Choose a car' },
  trophy: { zh: '獎盃星', en: 'Trophy stars' },
  failed: { zh: '無法顯示畫面', en: 'Cannot show the game' },
} as const;

export function IconButton({ label, onClick, className, children, testid }: { label: string; onClick: () => void; className: string; children: React.ReactNode; testid?: string }) {
  return (
    <button type="button" className={`bump-icon-btn ${className}`} aria-label={label} title={label} onClick={onClick} data-testid={testid}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- title
export function TitleScreen({ lang, pick, onPick, onStart, ready }: { lang: Lang; pick: { animal: AnimalId; car: CarId }; onPick: (p: { animal: AnimalId; car: CarId }) => void; onStart: () => void; ready: boolean }) {
  return (
    <div className="bump-title" data-testid="bumper-title">
      <p className="bump-logo" aria-hidden="true">
        Crazy Bumper
      </p>
      <div className="bump-panel">
        <div className="bump-pickers">
          <div className="bump-grid" role="group" aria-label={LABELS.animals[lang]}>
            {ANIMALS.map((a) => (
              <button key={a.id} type="button" className="bump-pick" aria-pressed={pick.animal === a.id} aria-label={a.name[lang]} onClick={() => onPick({ ...pick, animal: a.id })} data-testid={`bumper-animal-${a.id}`}>
                <AnimalFace a={a} />
                {pick.animal === a.id && <CheckBadge />}
              </button>
            ))}
          </div>
          <div className="bump-grid" role="group" aria-label={LABELS.cars[lang]}>
            {CARS.map((c) => (
              <button key={c.id} type="button" className="bump-pick" aria-pressed={pick.car === c.id} aria-label={c.name[lang]} onClick={() => onPick({ ...pick, car: c.id })} data-testid={`bumper-car-${c.id}`}>
                <CarSwatch c={c} />
                {pick.car === c.id && <CheckBadge />}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="bump-big" onClick={onStart} data-testid="bumper-start" data-ready={ready}>
          <PlayIcon size={44} />
          <span>{LABELS.start[lang]}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- playing
export function PlayHud({ hud, lang }: { hud: HudState; lang: Lang }) {
  const left = Math.ceil(hud.timeLeft);
  const hurry = left <= 10;
  const frac = Math.max(0, Math.min(1, hud.timeLeft / hud.roundLength));
  return (
    <>
      <div className="bump-score" data-pop={hud.starPulse > 0.5} aria-label={`${LABELS.stars[lang]} ${hud.score}${hud.crown ? `, ${LABELS.leader[lang]}` : ''}`} role="status" data-testid="bumper-score">
        <StarIcon size={44} />
        <span className="bump-num">{hud.score}</span>
        {hud.crown && <CrownIcon size={34} className="bump-crown" />}
      </div>
      <div className="bump-clock" data-hurry={hurry} role="timer" aria-label={`${LABELS.time[lang]} ${left}`} data-testid="bumper-clock" data-value={left}>
        <div className="bump-clock-row">
          <ClockIcon size={40} />
          <span className="bump-num" key={hurry ? left : 'n'}>
            {left}
          </span>
        </div>
        <div className="bump-bar" aria-hidden="true">
          <span style={{ width: `${frac * 100}%` }} />
        </div>
      </div>
    </>
  );
}

/** a floating stick: touch anywhere in the lower-left area and drag; up on the screen is away from the camera */
export function Joystick({ input, lang }: { input: InputManager; lang: Lang }) {
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLSpanElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const id = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const R = 56;
  const place = (x: number, y: number) => {
    if (base.current) base.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const home = () => {
    const z = zone.current;
    if (!z) return;
    const r = z.getBoundingClientRect();
    place(Math.min(110, r.width / 2), r.height - 110);
  };
  useEffect(() => {
    home();
    window.addEventListener('resize', home);
    return () => window.removeEventListener('resize', home);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (id.current !== null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    id.current = e.pointerId;
    const r = e.currentTarget.getBoundingClientRect();
    // keep the whole base on screen
    const x = Math.max(R + 8, Math.min(r.width - R - 8, e.clientX - r.left));
    const y = Math.max(R + 8, Math.min(r.height - R - 8, e.clientY - r.top));
    origin.current = { x: x + r.left, y: y + r.top };
    place(x, y);
    move(e);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (id.current !== e.pointerId) return;
    let dx = (e.clientX - origin.current.x) / R,
      dy = (e.clientY - origin.current.y) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    input.stick = { x: dx, y: -dy, active: true };
    if (knob.current) knob.current.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (id.current !== e.pointerId) return;
    id.current = null;
    input.stick = { x: 0, y: 0, active: false };
    if (knob.current) knob.current.style.transform = '';
    home();
  };
  return (
    <div ref={zone} className="bump-stick" data-testid="bumper-stick" data-touch-zone="" role="application" aria-label={LABELS.stick[lang]} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <span ref={base} className="bump-stick-base" aria-hidden="true">
        <span ref={knob} className="bump-stick-knob" />
      </span>
    </div>
  );
}

/** 88 × 88 lightning button; the ring fills back up while the dash recharges (2.5 s) */
export function DashButton({ input, cooldown, lang }: { input: InputManager; cooldown: number; lang: Lang }) {
  const C = 2 * Math.PI * 40;
  const ready = cooldown <= 0.001;
  const press = (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    input.pressDash();
  };
  const key = (e: RKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) input.pressDash();
    }
  };
  return (
    <button type="button" className="bump-dash" data-ready={ready} aria-label={LABELS.dash[lang]} onPointerDown={press} onKeyDown={key} data-testid="bumper-dash">
      <svg viewBox="0 0 88 88" width="88" height="88" className="bump-dash-ring" aria-hidden="true">
        <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(30,42,68,0.18)" strokeWidth="6" />
        <circle cx="44" cy="44" r="40" fill="none" stroke="#FFD600" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * (1 - cooldown)} ${C}`} transform="rotate(-90 44 44)" />
      </svg>
      <LightningIcon size={50} />
    </button>
  );
}

/** +1: a star flies from the bump on screen into the score plate */
export function FlyingStars({ list }: { list: { id: number; x: number; y: number }[] }) {
  return (
    <>
      {list.map((f) => (
        <span key={f.id} className="bump-fly" aria-hidden="true" style={{ left: f.x - 22, top: f.y - 22, '--dx': `${44 - f.x}px`, '--dy': `${48 - f.y}px` } as CSSProperties}>
          <StarIcon size={44} />
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- result
export function ResultScreen({ lang, score, trophies, onAgain, onTitle }: { lang: Lang; score: number; trophies: 1 | 2 | 3; onAgain: () => void; onTitle: () => void }) {
  return (
    <div className="bump-result" data-testid="bumper-result">
      <div className="bump-trophies" role="img" aria-label={`${LABELS.trophy[lang]} ${trophies}`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className="bump-trophy" data-on={n <= trophies} style={{ '--i': n } as CSSProperties}>
            <StarIcon size={n === 2 ? 104 : 84} fill={n <= trophies ? '#FFD600' : '#FFFFFF'} stroke={n <= trophies ? '#1E2A44' : '#9AA6BC'} />
          </span>
        ))}
      </div>
      <div className="bump-result-score" aria-label={`${LABELS.stars[lang]} ${score}`} data-testid="bumper-result-score">
        <StarIcon size={48} />
        <span className="bump-num">{score}</span>
      </div>
      <div className="bump-result-actions">
        <button type="button" className="bump-big" onClick={onAgain} data-testid="bumper-again">
          <ReplayIcon size={44} />
          <span>{LABELS.again[lang]}</span>
        </button>
        <IconButton label={LABELS.title[lang]} onClick={onTitle} className="bump-square" testid="bumper-to-title">
          <CarIcon size={44} />
        </IconButton>
      </div>
    </div>
  );
}

export function PauseScreen({ lang, muted, onResume, onTitle, onSound }: { lang: Lang; muted: boolean; onResume: () => void; onTitle: () => void; onSound: () => void }) {
  return (
    <div className="bump-pause" data-testid="bumper-paused">
      <button type="button" className="bump-resume" aria-label={LABELS.resume[lang]} onClick={onResume} data-testid="bumper-resume">
        <PlayIcon size={64} />
      </button>
      <div className="bump-pause-row">
        <IconButton label={LABELS.title[lang]} onClick={onTitle} className="bump-square">
          <CarIcon size={44} />
        </IconButton>
        <IconButton label={muted ? LABELS.soundOff[lang] : LABELS.soundOn[lang]} onClick={onSound} className="bump-square">
          <SoundIcon on={!muted} size={38} />
        </IconButton>
      </div>
    </div>
  );
}

export { PauseIcon, SoundIcon };
