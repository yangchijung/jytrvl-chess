// Rush Taxi — 操作說明: the three control schemes as pictures. One row per action (icon + two characters), the
// keyboard keys as key caps and the gamepad buttons beside it; the touch layout as a small map of the screen.
// Esc or the close button returns to the pause menu (Esc does not resume the game while this is open).
import { useEffect, useRef, type ReactNode } from 'react';
import type { Lang } from '../../i18n';

type L = { zh: string; en: string };
const T = {
  title: { zh: '操作說明', en: 'Controls' },
  close: { zh: '關閉', en: 'Close' },
  keyboard: { zh: '鍵盤', en: 'Keys' },
  pad: { zh: '手把', en: 'Pad' },
  touch: { zh: '觸控', en: 'Touch' },
  tilt: { zh: '傾斜轉向', en: 'Tilt to steer' },
  autoGas: { zh: '自動油門', en: 'Auto gas' },
};
const ACTIONS: { id: Action; label: L; keys: string[]; pad: Pad[] }[] = [
  { id: 'gas', label: { zh: '油門', en: 'Gas' }, keys: ['W', '↑'], pad: ['RT'] },
  { id: 'brake', label: { zh: '煞車', en: 'Brake' }, keys: ['S', '↓'], pad: ['LT'] },
  { id: 'steer', label: { zh: '轉向', en: 'Steer' }, keys: ['A', 'D', '←', '→'], pad: ['L'] },
  { id: 'drift', label: { zh: '甩尾', en: 'Drift' }, keys: ['Space'], pad: ['A'] },
  { id: 'rush', label: { zh: '衝刺', en: 'Rush' }, keys: ['Shift'], pad: ['X'] },
  { id: 'reset', label: { zh: '翻正', en: 'Reset' }, keys: ['R'], pad: ['Y'] },
  { id: 'pause', label: { zh: '暫停', en: 'Pause' }, keys: ['Esc'], pad: ['Start'] },
];
type Action = 'gas' | 'brake' | 'steer' | 'drift' | 'rush' | 'reset' | 'pause';
type Pad = 'RT' | 'LT' | 'L' | 'A' | 'X' | 'Y' | 'Start';

export function ActionIcon({ id, size = 28 }: { id: Action; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (id) {
    case 'gas':
      return (
        <svg {...s}>
          <path d="M12 3 4 13h5v8h6v-8h5z" fill="#2E7D32" />
        </svg>
      );
    case 'brake':
      return (
        <svg {...s}>
          <path d="M12 21 4 11h5V3h6v8h5z" fill="#C62828" />
        </svg>
      );
    case 'steer':
      return (
        <svg {...s} {...line}>
          <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
        </svg>
      );
    case 'drift':
      return (
        <svg {...s} {...line}>
          <path d="M4 18c4 0 6-3 6-6s2-6 6-6" />
          <path d="M6 21c3-1 4-2 5-4M14 8c1-2 2-3 5-4" />
        </svg>
      );
    case 'rush':
      return (
        <svg {...s}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#FFC72C" stroke="#23303F" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'reset':
      return (
        <svg {...s} {...line}>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
          <path d="M4 4v4.5h4.5" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...s} fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
  }
}

function PadButton({ b }: { b: Pad }) {
  if (b === 'RT' || b === 'LT') return <span className="tc-pad tc-pad-trigger">{b}</span>;
  if (b === 'Start')
    return (
      <span className="tc-pad tc-pad-start" aria-label="Start">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M5 7h14M5 12h14M5 17h14" />
        </svg>
      </span>
    );
  if (b === 'L')
    return (
      <span className="tc-pad tc-pad-stick" aria-label="Left stick">
        L
      </span>
    );
  return <span className="tc-pad tc-pad-face">{b}</span>;
}

function SchemeHead({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <th scope="col">
      <span className="tc-head">
        {icon}
        <span>{label}</span>
      </span>
    </th>
  );
}

const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10" strokeLinecap="round" strokeWidth="2.2" />
  </svg>
);
const PadIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    <path d="M7 7h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13v-1a5 5 0 0 1 5-5z" />
    <path d="M7 10v4M5 12h4" />
    <circle cx="16.5" cy="10.5" r="0.6" fill="currentColor" />
    <circle cx="18" cy="13" r="0.6" fill="currentColor" />
  </svg>
);
const TabletIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="19.5" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

const TiltSmall = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
    <rect x="5" y="7" width="14" height="10" rx="1.5" transform="rotate(-15 12 12)" />
    <path d="M3 8.5A10 10 0 0 1 6 4.5M21 15.5a10 10 0 0 1-3 4" />
  </svg>
);

/** the touch layout as a small picture of the landscape screen, in the same places as the real buttons */
function TouchMap({ lang, tilt }: { lang: Lang; tilt: boolean }) {
  const tr = (l: L) => l[lang];
  const lab = (id: Action) => tr(ACTIONS.find((a) => a.id === id)!.label);
  const font = lang === 'zh' ? 15 : 13;
  return (
    <svg className="tc-touchmap" viewBox="0 0 320 200" role="img" aria-label={`${tr(T.touch)}: ${lab('steer')} ←→, ${lab('gas')}, ${lab('brake')}, ${lab('drift')}, ${lab('rush')}`}>
      <rect x="2" y="2" width="316" height="196" rx="14" fill="#FFFFFF" stroke="#23303F" strokeWidth="3" />
      {/* the left half is the steering stick */}
      <rect x="10" y="80" width="146" height="110" rx="8" fill="#E9EEF3" stroke="#5C7A99" strokeWidth="2" strokeDasharray="6 5" />
      <rect x="30" y="140" width="96" height="36" rx="18" fill="#FFFFFF" stroke="#23303F" strokeWidth="2.5" />
      <circle cx="78" cy="158" r="14" fill="#FFFAF2" stroke="#23303F" strokeWidth="2.5" />
      <path d="M54 152l-8 6 8 6M102 152l8 6-8 6" fill="none" stroke="#23303F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="78" y="110" textAnchor="middle" fontSize={font} fontWeight="800" fill="#23303F">
        {lab('steer')}
      </text>
      {/* top left: home, reset, pause */}
      {[14, 44, 74].map((x) => (
        <rect key={x} x={x} y="12" width="24" height="24" rx="5" fill="#FFFAF2" stroke="#23303F" strokeWidth="2" />
      ))}
      <path d="M80 18v12M90 18v12" stroke="#23303F" strokeWidth="2.6" strokeLinecap="round" />
      {/* right: gas, brake, drift, rush */}
      <circle cx="282" cy="146" r="22" fill="#4CAF50" stroke="#23303F" strokeWidth="2.5" />
      <path d="M282 133l-9 11h6v10h6v-10h6z" fill="#23303F" />
      <circle cx="230" cy="154" r="18" fill="#E57373" stroke="#23303F" strokeWidth="2.5" />
      <path d="M230 165l-8-10h5v-9h6v9h5z" fill="#23303F" />
      <circle cx="284" cy="96" r="17" fill="#FFFAF2" stroke="#23303F" strokeWidth="2.5" />
      <path d="M276 104c4 0 5-3 5-6s2-6 6-6" fill="none" stroke="#23303F" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="236" cy="106" r="16" fill="#FFFAF2" stroke="#23303F" strokeWidth="2.5" />
      <path d="M238 96l-7 10h5l-1 8 7-10h-5z" fill="#FFC72C" stroke="#23303F" strokeWidth="1.4" strokeLinejoin="round" />
      <text x="282" y="188" textAnchor="middle" fontSize={font - 2} fontWeight="800" fill="#23303F">
        {lab('gas')}
      </text>
      <text x="226" y="190" textAnchor="middle" fontSize={font - 2} fontWeight="800" fill="#23303F">
        {lab('brake')}
      </text>
      <text x="284" y="72" textAnchor="middle" fontSize={font - 2} fontWeight="800" fill="#23303F">
        {lab('drift')}
      </text>
      <text x="236" y="84" textAnchor="middle" fontSize={font - 2} fontWeight="800" fill="#23303F">
        {lab('rush')}
      </text>
      {tilt && (
        <g aria-hidden="true">
          {/* tilt: the device turned like a steering wheel */}
          <g transform="rotate(-12 200 40)">
            <rect x="172" y="22" width="56" height="36" rx="5" fill="#FFFAF2" stroke="#23303F" strokeWidth="2.5" />
          </g>
          <path d="M160 64a44 44 0 0 1 12-22M240 42a44 44 0 0 1 12 22" fill="none" stroke="#23303F" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M158 56l2 9 8-3M254 56l-2 9-8-3" fill="none" stroke="#23303F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

export function Help({ lang, onClose, tilt, autoGas }: { lang: Lang; onClose: () => void; tilt: boolean; autoGas: boolean }) {
  const tr = (l: L) => l[lang];
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    // capture phase on window runs before the game's key listener: Esc closes this panel, it does not resume
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="tc-help taxi-scroll" role="dialog" aria-modal="true" aria-labelledby="tc-help-title" data-testid="taxi-help">
      <div className="tc-help-top">
        <h2 id="tc-help-title">{tr(T.title)}</h2>
        <button ref={close} type="button" className="tc-close" onClick={onClose} aria-label={tr(T.close)} data-testid="taxi-help-close">
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="tc-help-body">
        <table className="tc-table">
          <thead>
            <tr>
              <td />
              <SchemeHead icon={<KeyboardIcon />} label={tr(T.keyboard)} />
              <SchemeHead icon={<PadIcon />} label={tr(T.pad)} />
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a.id} data-action={a.id}>
                <th scope="row">
                  <span className="tc-action">
                    <ActionIcon id={a.id} />
                    <span>{tr(a.label)}</span>
                  </span>
                </th>
                <td>
                  <span className="tc-keys">
                    {a.keys.map((k) => (
                      <kbd key={k} className={`tc-key${k.length > 2 ? ' tc-key-wide' : ''}`}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                </td>
                <td>
                  <span className="tc-keys">
                    {a.pad.map((b) => (
                      <PadButton key={b} b={b} />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <figure className="tc-touch">
          <figcaption className="tc-head">
            <TabletIcon />
            <span>{tr(T.touch)}</span>
          </figcaption>
          <TouchMap lang={lang} tilt={tilt} />
          {(tilt || autoGas) && (
            <p className="tc-touch-notes">
              {tilt && (
                <span>
                  <TiltSmall />
                  {tr(T.tilt)}
                </span>
              )}
              {autoGas && (
                <span>
                  <ActionIcon id="gas" size={22} />
                  {tr(T.autoGas)}
                </span>
              )}
            </p>
          )}
        </figure>
      </div>
    </div>
  );
}
