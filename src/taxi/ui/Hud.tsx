// Rush Taxi — the in-run HUD: big numbers and icons, almost no words (children can read it).
// Top left: the clock (red and blinking in the last 10 s). Top right: money on a cartoon meter whose digits roll.
// Top centre: the big guide arrow and the distance (green to the destination, yellow to the nearest passenger).
// Bottom: the passenger's own timer bar with their ring colour, and the tip combo.
import { useEffect, useRef, useState } from 'react';
import type { HudState } from '../game';
import { BAND_COLOR } from '../gameplay/view';

export const ClockIcon = ({ size = 34 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l3 2M9 3h6" />
  </svg>
);
export const CoinIcon = ({ size = 34 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" fill="#FFC72C" stroke="#23303F" strokeWidth="2" />
    <circle cx="12" cy="12" r="6" fill="none" stroke="#23303F" strokeWidth="1.5" />
    <path d="M12 8.5v7" stroke="#23303F" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
export const RiderIcon = ({ color, size = 34 }: { color: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="12" cy="8" r="4.5" fill="#F1C9A5" stroke="#23303F" strokeWidth="2" />
    <path d="M4 21c0-5 3.5-7.5 8-7.5s8 2.5 8 7.5z" fill={color} stroke="#23303F" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

/** one digit wheel of the fare meter: rolls to the new digit */
function Digit({ d }: { d: number }) {
  return (
    <span className="taxi-digit" aria-hidden="true">
      <span className="taxi-digit-strip" style={{ transform: `translateY(${-d * 10}%)` }}>
        {Array.from({ length: 10 }, (_, k) => (
          <span key={k}>{k}</span>
        ))}
      </span>
    </span>
  );
}
export function Meter({ value, label }: { value: number; label: string }) {
  const digits = String(Math.max(0, Math.floor(value))).padStart(4, '0').split('').map(Number);
  return (
    <span className="taxi-meter" role="img" aria-label={label} data-testid="taxi-money" data-value={Math.floor(value)}>
      <CoinIcon />
      <span className="taxi-meter-face">
        {digits.map((d, i) => (
          <Digit key={i} d={d} />
        ))}
      </span>
    </span>
  );
}

export function Hud({ hud, labels }: { hud: HudState; labels: { time: string; money: string; dist: string } }) {
  const r = hud.run;
  const low = !!r && r.mode === 'arcade' && r.time <= 10;
  // the combo shows for a moment after it changes
  const [comboShow, setComboShow] = useState(false);
  const lastCombo = useRef(0);
  useEffect(() => {
    if (!r) return;
    if (r.combo !== lastCombo.current) {
      lastCombo.current = r.combo;
      if (r.combo > 0) {
        setComboShow(true);
        const t = setTimeout(() => setComboShow(false), 1800);
        return () => clearTimeout(t);
      }
      setComboShow(false);
    }
  }, [r, r?.combo]);
  if (!r) return null;
  return (
    <>
      {r.mode === 'arcade' && (
        <div className="taxi-time" data-low={low} role="timer" aria-label={labels.time} data-testid="taxi-time" data-value={Math.ceil(r.time)}>
          <ClockIcon size={40} />
          <span>{Math.ceil(r.time)}</span>
        </div>
      )}
      <div className="taxi-money-wrap">
        <Meter value={r.money} label={labels.money} />
      </div>
      {hud.arrow && (
        <div className="taxi-arrow" data-to={hud.arrow.to} data-testid="taxi-arrow" data-deg={Math.round(hud.arrow.deg)} aria-label={`${labels.dist} ${Math.round(hud.arrow.dist)} m`}>
          <svg viewBox="0 0 100 100" width="96" height="96" style={{ transform: `rotate(${hud.arrow.deg}deg)` }} aria-hidden="true">
            <path d="M50 6 88 52H64v42H36V52H12z" fill={hud.arrow.to === 'dest' ? '#43A047' : '#FDD835'} stroke="#23303F" strokeWidth="5" strokeLinejoin="round" />
          </svg>
          <span className="taxi-dist">{Math.round(hud.arrow.dist)} m</span>
        </div>
      )}
      {r.rider && (
        <div className="taxi-rider" data-testid="taxi-rider">
          <RiderIcon color={BAND_COLOR[r.rider.band]} size={44} />
          <span className="taxi-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(0, (r.rider.left / r.rider.limit) * 100)}%`, background: r.rider.left / r.rider.limit > 0.5 ? '#43A047' : r.rider.left / r.rider.limit > 0.2 ? '#FDD835' : '#E53935' }} />
          </span>
          <span className="taxi-rider-t">{Math.max(0, Math.ceil(r.rider.left))}</span>
        </div>
      )}
      {comboShow && r.combo > 0 && (
        <div className="taxi-combo" data-testid="taxi-combo" data-combo={r.combo}>
          ×{r.combo}
        </div>
      )}
    </>
  );
}
