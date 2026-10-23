// Crazy Bumper — our own vector icons (no emoji): star, clock, lightning, replay, play, crown, plus the small
// controls (home, pause, sound) and the picture buttons for the six animals and six cars.
import type { AnimalSpec, CarSpec } from '../entities/roster';

const INK = '#1E2A44';
type P = { size?: number; className?: string };

export function StarIcon({ size = 40, fill = '#FFD600', stroke = INK, className }: P & { fill?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <path d="M24 4.5l5.9 12.2 13.4 1.9-9.7 9.4 2.3 13.3L24 35l-11.9 6.3 2.3-13.3-9.7-9.4 13.4-1.9z" fill={fill} stroke={stroke} strokeWidth="3.2" strokeLinejoin="round" />
      {fill !== 'none' && <path d="M17.5 19.5l3-1" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.85" />}
    </svg>
  );
}

export function ClockIcon({ size = 40, className }: P) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <rect x="19" y="2.5" width="10" height="6" rx="2" fill={INK} />
      <circle cx="24" cy="27" r="17" fill="#FFFFFF" stroke={INK} strokeWidth="3.4" />
      <path d="M24 15.5V27l7.5 5" fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 11.5l3.5-3.5" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export function LightningIcon({ size = 48, className }: P) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <path d="M27.5 3 9 27.5h12.5L18.5 45 39 18.5H26z" fill="#FFD600" stroke={INK} strokeWidth="3.4" strokeLinejoin="round" />
      <path d="M24.5 11.5l-6.5 9" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export function ReplayIcon({ size = 44, className }: P) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 24a13.5 13.5 0 1 0 4-9.6" />
      <path d="M12 5.5v10h10" />
    </svg>
  );
}

export function PlayIcon({ size = 44, className }: P) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <path d="M14 8.5v31a2 2 0 0 0 3 1.7l25.5-15.5a2 2 0 0 0 0-3.4L17 6.8a2 2 0 0 0-3 1.7z" fill="currentColor" />
    </svg>
  );
}

/** P2: the leader's crown (also used in 3D) */
export function CrownIcon({ size = 44, className }: P) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <path d="M6 16l9 9 9-15 9 15 9-9-4 22H10z" fill="#FFC400" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M10 38h28" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="24" cy="29" r="3" fill="#FF4081" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

export function HomeIcon({ size = 34 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h5v-5h3v5h5V10" />
    </svg>
  );
}

export function PauseIcon({ size = 34 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <rect x="5.5" y="4.5" width="4.5" height="15" rx="1.5" />
      <rect x="14" y="4.5" width="4.5" height="15" rx="1.5" />
    </svg>
  );
}

export function SoundIcon({ size = 34, on }: P & { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
      {on ? <path d="M16.5 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16.5 9.5l5 5m0-5-5 5" />}
    </svg>
  );
}

/** a small car seen from the side, for "choose again" */
export function CarIcon({ size = 36 }: P) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <ellipse cx="24" cy="34" rx="20" ry="6" fill="#FF6D00" stroke={INK} strokeWidth="3" />
      <path d="M8 31c0-8 6-12 16-12s16 4 16 12z" fill="#FFD600" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="22" cy="15" r="7" fill="#B9784A" stroke={INK} strokeWidth="3" />
      <path d="M34 22V9" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="34" cy="8" r="3" fill="#FF6D00" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

export function CheckBadge() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" className="bump-check">
      <circle cx="12" cy="12" r="10.5" fill="#13893A" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** the animal's face as a picture button */
export function AnimalFace({ a, size = 52 }: { a: AnimalSpec; size?: number }) {
  const s = 2.6;
  const ears = () => {
    switch (a.ears) {
      case 'round':
        return (
          <>
            <circle cx="12" cy="13" r="7" fill={a.fur} stroke={INK} strokeWidth={s} />
            <circle cx="36" cy="13" r="7" fill={a.fur} stroke={INK} strokeWidth={s} />
            <circle cx="12" cy="13" r="3" fill={a.ear} />
            <circle cx="36" cy="13" r="3" fill={a.ear} />
          </>
        );
      case 'panda':
        return (
          <>
            <circle cx="12" cy="13" r="7" fill={a.ear} stroke={INK} strokeWidth={s} />
            <circle cx="36" cy="13" r="7" fill={a.ear} stroke={INK} strokeWidth={s} />
          </>
        );
      case 'long':
        return (
          <>
            <rect x="13" y="1" width="8" height="20" rx="4" fill={a.fur} stroke={INK} strokeWidth={s} transform="rotate(-10 17 12)" />
            <rect x="27" y="1" width="8" height="20" rx="4" fill={a.fur} stroke={INK} strokeWidth={s} transform="rotate(10 31 12)" />
            <rect x="15.5" y="4" width="3" height="13" rx="1.5" fill={a.ear} transform="rotate(-10 17 12)" />
            <rect x="29.5" y="4" width="3" height="13" rx="1.5" fill={a.ear} transform="rotate(10 31 12)" />
          </>
        );
      case 'pointy':
        return (
          <>
            <path d="M8 21 10 5l11 9z" fill={a.fur} stroke={INK} strokeWidth={s} strokeLinejoin="round" />
            <path d="M40 21 38 5l-11 9z" fill={a.fur} stroke={INK} strokeWidth={s} strokeLinejoin="round" />
          </>
        );
      case 'none':
        return (
          <>
            <circle cx="15" cy="14" r="7.5" fill={a.fur} stroke={INK} strokeWidth={s} />
            <circle cx="33" cy="14" r="7.5" fill={a.fur} stroke={INK} strokeWidth={s} />
            <circle cx="15" cy="14" r="4.5" fill="#FFFFFF" />
            <circle cx="33" cy="14" r="4.5" fill="#FFFFFF" />
            <circle cx="15.5" cy="14.5" r="2.4" fill={INK} />
            <circle cx="33.5" cy="14.5" r="2.4" fill={INK} />
          </>
        );
      default:
        return null;
    }
  };
  const frog = a.id === 'frog';
  const penguin = a.id === 'penguin';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      {!frog && ears()}
      <circle cx="24" cy="27" r="17" fill={a.fur} stroke={INK} strokeWidth={s} />
      {frog && ears()}
      {penguin && <path d="M11 29c0-8 5-12 13-9 8-3 13 1 13 9 0 7-6 11-13 11s-13-4-13-11z" fill={a.face} />}
      {a.id === 'panda' && (
        <>
          <ellipse cx="17.5" cy="25" rx="4.5" ry="5.5" fill={a.ear} transform="rotate(25 17.5 25)" />
          <ellipse cx="30.5" cy="25" rx="4.5" ry="5.5" fill={a.ear} transform="rotate(-25 30.5 25)" />
        </>
      )}
      {!frog && !penguin && <ellipse cx="24" cy="33" rx="8" ry="6" fill={a.face} />}
      {!frog && (
        <>
          <circle cx="18" cy="25" r="2.6" fill={a.id === 'panda' ? '#FFFFFF' : INK} />
          <circle cx="30" cy="25" r="2.6" fill={a.id === 'panda' ? '#FFFFFF' : INK} />
        </>
      )}
      {penguin ? <path d="M20 31h8l-4 5z" fill={a.nose} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" /> : !frog && <ellipse cx="24" cy="30.5" rx="2.6" ry="2" fill={a.nose} />}
      {frog && <path d="M15 31q9 7 18 0" fill="none" stroke={a.nose} strokeWidth="2.6" strokeLinecap="round" />}
      <circle cx="12.5" cy="32" r="2.6" fill="#FF9EB5" opacity="0.8" />
      <circle cx="35.5" cy="32" r="2.6" fill="#FF9EB5" opacity="0.8" />
    </svg>
  );
}

/** the car's shape and colours as a picture button (side view) */
export function CarSwatch({ c, size = 52 }: { c: CarSpec; size?: number }) {
  const s = 2.6;
  const shell = (() => {
    switch (c.shell) {
      case 'bubble':
        return <path d="M7 32c0-12 7-19 17-19s17 7 17 19z" fill={c.body} stroke={INK} strokeWidth={s} strokeLinejoin="round" />;
      case 'rocket':
        return <path d="M5 32c0-8 4-12 13-12h14l11 12z" fill={c.body} stroke={INK} strokeWidth={s} strokeLinejoin="round" />;
      case 'boxy':
        return <rect x="7" y="18" width="34" height="14" rx="3" fill={c.body} stroke={INK} strokeWidth={s} />;
      case 'teardrop':
        return <path d="M6 32c0-9 9-14 22-12 8 1 14 6 15 12z" fill={c.body} stroke={INK} strokeWidth={s} strokeLinejoin="round" />;
      case 'racer':
        return <path d="M5 32l2-8h20l16 4v4z" fill={c.body} stroke={INK} strokeWidth={s} strokeLinejoin="round" />;
      default:
        return <path d="M7 32c0-9 7-14 17-14s17 5 17 14z" fill={c.body} stroke={INK} strokeWidth={s} strokeLinejoin="round" />;
    }
  })();
  const fin = (() => {
    switch (c.fins) {
      case 'tail':
        return <path d="M6 26 4 14l7 8z" fill={c.trim} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
      case 'spoiler':
        return (
          <>
            <path d="M8 24v-6" stroke={INK} strokeWidth="2.2" />
            <rect x="2" y="14" width="12" height="4" rx="1.5" fill={c.trim} stroke={INK} strokeWidth="2" />
          </>
        );
      case 'side':
        return <path d="M16 30l-6 6h12z" fill={c.trim} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
      case 'twin':
        return <path d="M9 24l-2-9 6 6z" fill={c.trim} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
      default:
        return null;
    }
  })();
  const h = c.antenna === 'tall' ? 4 : 9;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d={`M12 ${h + 3}V24`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      {c.antenna === 'curly' && <circle cx="12" cy={(h + 24) / 2} r="2.4" fill="none" stroke={INK} strokeWidth="1.8" />}
      <circle cx="12" cy={h + 1} r="3" fill={c.ring} stroke={INK} strokeWidth="2" />
      {fin}
      {shell}
      <rect x="3" y="31" width="42" height="8" rx="4" fill={c.ring} stroke={INK} strokeWidth={s} />
    </svg>
  );
}
