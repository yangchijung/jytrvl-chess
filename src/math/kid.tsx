// Math Island for children who cannot read yet: the icon bar, progress dots, the hand that shows what to drag,
// the otter and star for a right answer, and short synthesised sounds. Pages built from these show at most six
// Chinese characters; every instruction is a picture + a spoken prompt + a looping finger demo.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useTr, type L } from './shell';

const A11Y = {
  home: { zh: '回到島上', en: 'Back to the island' },
  site: { zh: '回到 JY Games 首頁', en: 'Back to JY Games' },
  speak: { zh: '再聽一次', en: 'Hear it again' },
  soundOn: { zh: '聲音開著，按一下關掉', en: 'Sound is on; press to turn it off' },
  soundOff: { zh: '聲音關著，按一下打開', en: 'Sound is off; press to turn it on' },
  restart: { zh: '這一題重來', en: 'Start this problem again' },
  adults: { zh: '給大人看', en: 'For adults' },
  dots: { zh: '第 {n} 題，共 {t} 題', en: 'Problem {n} of {t}' },
} satisfies Record<string, L>;

// ---------------------------------------------------------------- icons (24 px grid, drawn, no emoji)
const Svg = ({ children, size = 36 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
export const HomeIcon = () => (
  <Svg>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h5v-5h3v5h5V10" />
  </Svg>
);
export const SpeakerIcon = ({ off = false }: { off?: boolean }) => (
  <Svg>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    {off ? (
      <path d="M16 9l5 6M21 9l-5 6" />
    ) : (
      <>
        <path d="M15.5 9a4 4 0 0 1 0 6" />
        <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
      </>
    )}
  </Svg>
);
/** sound on / off: a music note, crossed out when off */
export const NoteIcon = ({ off = false }: { off?: boolean }) => (
  <Svg>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
    <circle cx="16.5" cy="16" r="2.5" fill="currentColor" />
    {off && <path d="M3 3l18 18" strokeWidth="2.8" />}
  </Svg>
);
export const RestartIcon = () => (
  <Svg>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);
export const AdultIcon = () => (
  <Svg>
    <circle cx="8.5" cy="6.5" r="2.5" />
    <path d="M4.5 20v-6.5a4 4 0 0 1 8 0V20" />
    <circle cx="17" cy="11" r="2" />
    <path d="M14 20v-3.5a3 3 0 0 1 6 0V20" />
  </Svg>
);
export const NextIcon = ({ size = 48 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 12h15" />
    <path d="M13 6l6 6-6 6" />
  </Svg>
);

// ---------------------------------------------------------------- the top bar
export function KidBar({
  back,
  total,
  index,
  done,
  voice,
  onSpeak,
  onVoice,
  onRestart,
  dotRef,
}: {
  back: 'island' | 'site';
  total?: number;
  index?: number;
  /** problem indexes already solved */
  done?: number[];
  voice: boolean;
  onSpeak: () => void;
  onVoice: () => void;
  onRestart?: () => void;
  /** the current dot, where the star flies to */
  dotRef?: RefObject<HTMLSpanElement | null>;
}) {
  const { tr, to } = useTr();
  const btn = 'kid-btn';
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 sm:flex-nowrap sm:px-5" data-testid="kid-bar">
      {back === 'island' ? (
        <Link to={to('/math')} className={btn} aria-label={tr(A11Y.home)} data-testid="mi-back">
          <HomeIcon />
        </Link>
      ) : (
        <Link to={to('/')} className={btn} aria-label={tr(A11Y.site)} data-testid="mi-site">
          <HomeIcon />
        </Link>
      )}
      <div className="order-last flex w-full items-center justify-center gap-3 sm:order-none sm:w-auto sm:flex-1" role="img" aria-label={total ? tr(A11Y.dots, { n: Math.min((index ?? 0) + 1, total), t: total }) : undefined} data-testid="mi-dots">
        {total
          ? Array.from({ length: total }, (_, k) => {
              const state = done?.includes(k) ? 'done' : k === index ? 'now' : 'todo';
              return <span key={k} ref={k === index ? dotRef : undefined} className="kid-dot" data-state={state} />;
            })
          : null}
      </div>
      <span className="flex-1 sm:hidden" aria-hidden="true" />
      <button type="button" className={btn} onClick={onSpeak} aria-label={tr(A11Y.speak)} data-testid="mi-listen">
        <SpeakerIcon />
      </button>
      <button type="button" className={btn} onClick={onVoice} aria-pressed={!voice} aria-label={tr(voice ? A11Y.soundOn : A11Y.soundOff)} data-testid="mi-voice">
        <NoteIcon off={!voice} />
      </button>
      {onRestart ? (
        <button type="button" className={btn} onClick={onRestart} aria-label={tr(A11Y.restart)} data-testid="mi-restart">
          <RestartIcon />
        </button>
      ) : (
        <Link to={to('/math/parent')} className={btn} aria-label={tr(A11Y.adults)} data-testid="mi-adults">
          <AdultIcon />
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the otter (波波) and the star
/** 波波 the otter: original flat drawing; `jump` changes → one short hop. */
export function Otter({ jump, size = 120 }: { jump: number; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!jump || !ref.current || reduced()) return;
    ref.current.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-28px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
  }, [jump]);
  return (
    <svg ref={ref} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false" data-testid="mi-otter" data-jump={jump}>
      <path d="M84 98c16 4 28-2 32-14" fill="none" stroke="#6B4A2E" strokeWidth="12" strokeLinecap="round" />
      <ellipse cx="60" cy="82" rx="30" ry="30" fill="#8A5F3B" stroke="#23303F" strokeWidth="3" />
      <ellipse cx="60" cy="90" rx="18" ry="20" fill="#E9C893" />
      <circle cx="60" cy="42" r="26" fill="#8A5F3B" stroke="#23303F" strokeWidth="3" />
      <circle cx="37" cy="34" r="5" fill="#8A5F3B" stroke="#23303F" strokeWidth="3" />
      <circle cx="83" cy="34" r="5" fill="#8A5F3B" stroke="#23303F" strokeWidth="3" />
      <ellipse cx="60" cy="52" rx="16" ry="12" fill="#E9C893" />
      <circle cx="50" cy="38" r="4" fill="#23303F" />
      <circle cx="70" cy="38" r="4" fill="#23303F" />
      <ellipse cx="60" cy="48" rx="5" ry="3.5" fill="#23303F" />
      <path d="M54 56q6 5 12 0" fill="none" stroke="#23303F" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M46 50l-12-2M46 54l-12 2M74 50l12-2M74 54l12 2" stroke="#23303F" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="44" cy="74" rx="7" ry="9" fill="#6B4A2E" />
      <ellipse cx="76" cy="74" rx="7" ry="9" fill="#6B4A2E" />
    </svg>
  );
}

export function StarShape({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M24 3l6.2 13.4 14.6 1.6-10.9 9.9 3 14.4L24 35l-12.9 7.3 3-14.4L3.2 18l14.6-1.6z" fill="#E2B93B" stroke="#23303F" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** A star that flies from `from` to `to` once each time `go` changes (no flight when motion is reduced). */
export function StarFlight({ go, from, to }: { go: number; from: RefObject<HTMLElement | null>; to: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current,
      a = from.current,
      b = to.current;
    if (!go || !el || !a || !b) return;
    const ra = a.getBoundingClientRect(),
      rb = b.getBoundingClientRect();
    const x0 = ra.left + ra.width / 2 - 24,
      y0 = ra.top + ra.height / 2 - 24,
      x1 = rb.left + rb.width / 2 - 24,
      y1 = rb.top + rb.height / 2 - 24;
    el.style.display = 'block';
    if (reduced()) {
      el.style.transform = `translate(${x1}px, ${y1}px)`;
      const t = setTimeout(() => (el.style.display = 'none'), 400);
      return () => clearTimeout(t);
    }
    const anim = el.animate([{ transform: `translate(${x0}px, ${y0}px) scale(1.4)` }, { transform: `translate(${x1}px, ${y1}px) scale(0.6)` }], { duration: 220, easing: 'ease-in' });
    anim.onfinish = () => (el.style.display = 'none');
    return () => anim.cancel();
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-50" style={{ display: 'none' }} data-testid="mi-star" data-go={go}>
      <StarShape />
    </div>
  );
}

// ---------------------------------------------------------------- the demo hand
export function HandShape({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M24 8c3 0 5 2 5 5v17l2-1c1-4 7-4 8 0 2-3 7-2 8 2 2-2 7-1 7 3v12c0 10-7 16-16 16h-4c-6 0-10-3-13-8l-9-14c-2-3 1-7 5-5l2 2V13c0-3 2-5 5-5z"
        fill="#FFF4E3"
        stroke="#23303F"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A finger that drags from `from` to `to` again and again until `show` turns false (the child touched the
 * stage). With reduced motion the hand stays still on `from` with a dashed line to `to`. The demo is longer than
 * a UI transition on purpose: it shows a whole drag, which a child copies.
 */
export function HandDemo({ show, from, to, stage }: { show: boolean; from: RefObject<HTMLElement | null>; to: RefObject<HTMLElement | null>; stage: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const measure = useCallback(() => {
    const a = from.current,
      b = to.current,
      s = stage.current;
    if (!a || !b || !s) return setPts(null);
    const rs = s.getBoundingClientRect(),
      ra = a.getBoundingClientRect(),
      rb = b.getBoundingClientRect();
    setPts({ x0: ra.left - rs.left + ra.width / 2, y0: ra.top - rs.top + ra.height / 2, x1: rb.left - rs.left + rb.width / 2, y1: rb.top - rs.top + rb.height / 2 });
  }, [from, to, stage]);
  useLayoutEffect(() => {
    if (!show) return;
    measure();
    // the page may still be settling (a lazy route, fonts, images): measure again once it has laid out
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [show, measure]);
  useEffect(() => {
    const el = ref.current;
    if (!show || !pts || !el || reduced()) return;
    const anim = el.animate(
      [
        { transform: `translate(${pts.x0}px, ${pts.y0}px)`, opacity: 0, offset: 0 },
        { transform: `translate(${pts.x0}px, ${pts.y0}px)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${pts.x1}px, ${pts.y1}px)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${pts.x1}px, ${pts.y1}px)`, opacity: 0, offset: 1 },
      ],
      { duration: 1800, iterations: Infinity, easing: 'ease-in-out' },
    );
    return () => anim.cancel();
  }, [show, pts]);
  if (!show || !pts) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true" data-testid="mi-hand">
      {reduced() && (
        <svg className="absolute inset-0 h-full w-full">
          <line x1={pts.x0} y1={pts.y0} x2={pts.x1} y2={pts.y1} stroke="#23303F" strokeWidth="4" strokeDasharray="10 10" />
        </svg>
      )}
      <div ref={ref} className="absolute left-0 top-0" style={{ transform: `translate(${pts.x0}px, ${pts.y0}px)` }}>
        <div style={{ transform: 'translate(-12px, -6px)' }}>
          <HandShape />
        </div>
      </div>
    </div>
  );
}

/** One short shake (a wrong card going back); nothing when motion is reduced. */
export function shake(el: HTMLElement | null) {
  if (!el || reduced()) return;
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 220 });
}

export const reduced = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion');
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- sounds (synthesised; no files)
let ctx: AudioContext | null = null;
const ac = () => {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx ??= new C();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};
function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator(),
    g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + at;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
export const sfx = {
  /** an apple lands */
  pop: () => tone(660, 0, 0.12, 'triangle', 0.12),
  /** right answer: a bright two-note chime */
  ding: () => {
    tone(880, 0, 0.35);
    tone(1320, 0.12, 0.45);
  },
  /** not this one: a soft low bump, not a buzzer */
  bump: () => tone(220, 0, 0.18, 'sine', 0.12),
};
