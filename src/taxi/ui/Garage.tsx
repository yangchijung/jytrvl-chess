// Rush Taxi — the garage: pick a cab and a driver, then 出發. Children can't read much, so each cab is a picture
// drawn from its own roster shape (the same numbers the 3D model is built from), its name, its kind, and three
// icon rows of 1–5 pips (acceleration, handling, top speed). Drivers are portraits with a two-character name.
// Cards are toggle buttons (aria-pressed); the selected one turns yellow and gets a check mark (not colour alone).
import type { KeyboardEvent } from 'react';
import { CARS, DRIVERS, type CarLook, type CarSpec, type DriverLook, type DriverSpec } from '../vehicle/roster';
import type { Mode } from '../gameplay/rules';
import { ClockIcon } from './Hud';
import './garage.css';

type L = { zh: string; en: string };
export interface GarageLabels {
  cabs: string;
  drivers: string;
  accel: string;
  handling: string;
  top: string;
  go: string;
  back: string;
}
interface Props {
  lang: 'zh' | 'en';
  mode: Mode;
  car: string;
  driver: string;
  labels: GarageLabels;
  onPick(car: string, driver: string): void;
  onGo(): void;
  onBack(): void;
}

const INK = '#23303F';
const PAINT = '#FFC72C';

// ---------- the cab, side view, front to the right: z (m) → x, y (m) → up ----------
const X = (z: number) => 100 + z * 44;
const Y = (y: number) => 60 - y * 40;
const pts = (list: [number, number][]) => list.map(([z, y]) => `${X(z).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
const rect = (z0: number, y0: number, z1: number, y1: number) => ({ x: X(Math.min(z0, z1)), y: Y(Math.max(y0, y1)), width: Math.abs(X(z1) - X(z0)), height: Math.abs(Y(y1) - Y(y0)) });

export function CabPicture({ look, who, size }: { look: CarLook; who?: DriverLook; size?: number }) {
  const [gRb, gRt, gFt, gFb] = look.glass;
  const r = look.rearEnd;
  const roofZ = (gFt + gRt) / 2;
  const body = pts([
    [r, -0.24],
    [r - 0.06, 0.04],
    [r - 0.01, 0.27],
    [r + 0.12, 0.35],
    [Math.min(gRb, r + 0.2), 0.38],
    [1.0, 0.37],
    [1.78, 0.3],
    [2.05, 0.17],
    [2.08, -0.04],
    [2.02, -0.24],
  ]);
  return (
    <svg viewBox="0 0 200 100" width={size} className="taxi-cab-pic" aria-hidden="true">
      {/* glass house: yellow pillars and roof around tinted glass, a B pillar in the middle */}
      <polygon points={pts([[gRb - 0.04, 0.37], [gRt - 0.03, look.roofY + 0.05], [gFt + 0.03, look.roofY + 0.05], [gFb + 0.04, 0.37]])} fill={PAINT} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points={pts([[gRb + 0.06, 0.39], [gRt + 0.03, look.roofY - 0.04], [gFt - 0.04, look.roofY - 0.04], [gFb - 0.06, 0.39]])} fill="#2C4258" />
      {who && (
        <g>
          <circle cx={X(0.02)} cy={Y(0.58)} r="6.5" fill={who.skin} />
          <path d={`M${X(0.02) - 6.5} ${Y(0.58) - 0.5}a6.5 6.5 0 0 1 13 0z`} fill={who.cap ?? who.hair} />
        </g>
      )}
      <rect {...rect(-0.27, 0.37, -0.17, look.roofY)} fill={PAINT} />
      {/* roof sign */}
      <rect {...rect(roofZ - 0.36, look.roofY + 0.07, roofZ + 0.36, look.roofY + 0.31)} rx="2" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <text x={X(roofZ)} y={Y(look.roofY + 0.13)} textAnchor="middle" fontSize="8" fontWeight="900" fill={INK} fontFamily="system-ui, sans-serif">
        TAXI
      </text>
      {look.spoiler && (
        <g fill={INK}>
          <rect {...rect(r + 0.2, 0.34, r + 0.28, 0.52)} />
          <rect {...rect(r - 0.04, 0.5, r + 0.42, 0.58)} rx="1.5" />
        </g>
      )}
      <polygon points={body} fill={PAINT} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      {look.stripe && <rect {...rect(r + 0.02, -0.12, 1.95, -0.01)} fill={look.stripe} />}
      {/* door seams, lights, bumpers */}
      <path d={`M${X(0.28)} ${Y(0.35)}V${Y(-0.2)}M${X(-0.75)} ${Y(0.36)}V${Y(-0.2)}`} stroke={INK} strokeWidth="1.2" />
      <rect {...rect(1.92, 0.08, 2.07, 0.2)} rx="1.5" fill="#FFF4D6" stroke={INK} strokeWidth="1.2" />
      <rect {...rect(r - 0.05, 0.14, r + 0.06, 0.27)} rx="1.5" fill="#E53935" stroke={INK} strokeWidth="1.2" />
      <rect {...rect(1.96, -0.27, 2.14, -0.08)} rx="2" fill={INK} />
      <rect {...rect(r - 0.1, -0.27, r + 0.06, -0.08)} rx="2" fill={INK} />
      {/* wheel wells and wheels */}
      {[-1.35, 1.35].map((z) => (
        <g key={z}>
          <circle cx={X(z)} cy={Y(-0.47)} r="18" fill={INK} />
          <circle cx={X(z)} cy={Y(-0.47)} r="7" fill="#C9CED6" />
        </g>
      ))}
    </svg>
  );
}

// ---------- the driver, a front portrait ----------
export function DriverPicture({ look, size }: { look: DriverLook; size?: number }) {
  const line = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 100 100" width={size} className="taxi-driver-pic" aria-hidden="true">
      {look.hairStyle === 'perm' && (
        <g fill={look.hair} {...line}>
          {[
            [28, 48],
            [26, 36],
            [32, 25],
            [72, 48],
            [74, 36],
            [68, 25],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="9" />
          ))}
        </g>
      )}
      {look.hairStyle === 'ponytail' && (
        <g {...line}>
          <ellipse cx="76" cy="54" rx="8" ry="17" fill={look.hair} transform="rotate(-14 76 54)" />
          <circle cx="72" cy="36" r="4" fill={look.vest} />
        </g>
      )}
      {/* body: shirt with the vest on both sides */}
      <path d="M12 100C12 80 28 70 50 70S88 80 88 100Z" fill={look.shirt} {...line} />
      <path d="M12 100C12 82 24 73 38 71L43 100Z" fill={look.vest} {...line} />
      <path d="M88 100C88 82 76 73 62 71L57 100Z" fill={look.vest} {...line} />
      <rect x="44" y="60" width="12" height="12" fill={look.skin} />
      <circle cx="50" cy="45" r="22" fill={look.skin} {...line} />
      {look.hairStyle === 'short' && <path d="M28.5 44C27 24 73 24 71.5 44C66 34 34 34 28.5 44Z" fill={look.hair} {...line} />}
      {look.hairStyle === 'perm' && (
        <g fill={look.hair} {...line}>
          <circle cx="40" cy="26" r="9" />
          <circle cx="60" cy="26" r="9" />
          <circle cx="50" cy="22" r="9" />
        </g>
      )}
      {look.hairStyle === 'spiky' && <path d="M28 42L25 24L34 29L36 14L44 25L50 10L56 25L64 14L66 29L75 24L72 42C66 32 34 32 28 42Z" fill={look.hair} {...line} />}
      {look.hairStyle === 'ponytail' && <path d="M28.5 46C25 18 75 18 71.5 46C68 32 46 26 28.5 46Z" fill={look.hair} {...line} />}
      {look.cap && (
        <g {...line}>
          <path d="M27 36C27 14 73 14 73 36Z" fill={look.cap} />
          <ellipse cx="50" cy="36" rx="29" ry="5" fill={look.cap} />
          <rect x="44" y="21" width="12" height="8" rx="2" fill="#FFFFFF" strokeWidth="1.5" />
        </g>
      )}
      {look.glasses ? (
        <g fill="#1B1E23">
          <rect x="32" y="40" width="15" height="10" rx="3" />
          <rect x="53" y="40" width="15" height="10" rx="3" />
          <path d="M47 43h6" stroke="#1B1E23" strokeWidth="2.5" />
        </g>
      ) : (
        <g fill={INK}>
          <circle cx="42" cy="46" r="2.8" />
          <circle cx="58" cy="46" r="2.8" />
        </g>
      )}
      {look.mustache && <path d="M39 55Q45 50 50 54Q55 50 61 55Q56 60 50 57Q44 60 39 55Z" fill={look.hair} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />}
      <path d={look.mustache ? 'M44 61Q50 64 56 61' : 'M43 56Q50 62 57 56'} fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------- stat icons ----------
const StatIcon = ({ k }: { k: 'accel' | 'handling' | 'top' }) => (
  <svg viewBox="0 0 24 24" className="taxi-stat-icon" aria-hidden="true" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    {k === 'accel' && <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill={PAINT} strokeWidth="1.8" />}
    {k === 'handling' && (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2.2" fill={INK} />
        <path d="M4 11h6M14 11h6M12 14v6" />
      </>
    )}
    {k === 'top' && (
      <>
        <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
        <path d="M12 17l5-6" />
        <circle cx="12" cy="17" r="1.6" fill={INK} />
      </>
    )}
  </svg>
);
const Check = () => (
  <svg viewBox="0 0 24 24" className="taxi-garage-check" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill={INK} />
    <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** the game's keyboard handler cancels Space on window (it is the drift key), so buttons here activate on Space up */
const spaceUp = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

export function Garage({ lang, mode, car, driver, labels, onPick, onGo, onBack }: Props) {
  const t = (l: L) => l[lang];
  const kind = (c: CarSpec) => (lang === 'zh' ? `${c.kind.zh}型` : c.kind.en);
  const carLabel = (c: CarSpec) => `${t(c.name)}，${kind(c)}。${labels.accel} ${c.stats.accel}，${labels.handling} ${c.stats.handling}，${labels.top} ${c.stats.top}`;
  const who = DRIVERS.find((d) => d.id === driver)?.look;
  return (
    <div className="taxi-garage" data-testid="taxi-garage">
      <div className="taxi-garage-cabs" role="group" aria-label={labels.cabs}>
        {CARS.map((c) => {
          const on = c.id === car;
          return (
            <button key={c.id} type="button" className="taxi-garage-card taxi-cab-card" aria-pressed={on} aria-label={carLabel(c)} data-testid={`taxi-car-${c.id}`} onClick={() => onPick(c.id, driver)} onKeyUp={spaceUp(() => onPick(c.id, driver))}>
              {on && <Check />}
              <CabPicture look={c.look} who={who} />
              <span className="taxi-garage-name">
                {t(c.name)}
                <small>{kind(c)}</small>
              </span>
              <span className="taxi-stats" aria-hidden="true">
                {(['accel', 'handling', 'top'] as const).map((k) => (
                  <span key={k} className="taxi-stat">
                    <StatIcon k={k} />
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className="taxi-pip" data-on={n <= c.stats[k]} />
                    ))}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="taxi-garage-bottom">
        <div className="taxi-garage-drivers" role="group" aria-label={labels.drivers}>
          {DRIVERS.map((d: DriverSpec) => {
            const on = d.id === driver;
            return (
              <button key={d.id} type="button" className="taxi-garage-card taxi-driver-card" aria-pressed={on} data-testid={`taxi-driver-${d.id}`} onClick={() => onPick(car, d.id)} onKeyUp={spaceUp(() => onPick(car, d.id))}>
                {on && <Check />}
                <DriverPicture look={d.look} />
                <span className="taxi-garage-name">{t(d.name)}</span>
              </button>
            );
          })}
        </div>
        <div className="taxi-garage-actions">
          <button type="button" className="taxi-garage-back" aria-label={labels.back} data-testid="taxi-garage-back" onClick={onBack} onKeyUp={spaceUp(onBack)}>
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="taxi-garage-go" data-testid="taxi-go" data-mode={mode} onClick={onGo} onKeyUp={spaceUp(onGo)}>
            {mode === 'arcade' ? (
              <ClockIcon size={36} />
            ) : (
              <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 9c-3 0-4 2-4 3s1 3 4 3c4 0 8-6 12-6 3 0 4 2 4 3s-1 3-4 3c-4 0-8-6-12-6z" />
              </svg>
            )}
            <span>{labels.go}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
