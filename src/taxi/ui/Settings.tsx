// Rush Taxi — control settings in the pause menu: 自動油門 (auto gas, so small children only steer) and 傾斜轉向
// (steer by tilting the iPad) with 校正 (take the way it is held now as straight ahead). Saved per browser.
// useControlSettings owns the TiltInput and writes autoGas / tilt into the game's Input only while a run is played.
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Lang } from '../../i18n';
import type { Game } from '../game';
import { loadSettings, saveSettings, type TaxiSettings } from '../core/settings';
import { TiltInput, type TiltStatus } from '../core/tilt';
import { ActionIcon } from './Help';

type L = { zh: string; en: string };
const T = {
  autoGas: { zh: '自動油門', en: 'Auto gas' },
  tilt: { zh: '傾斜轉向', en: 'Tilt to steer' },
  calibrate: { zh: '校正', en: 'Center' },
  calibrated: { zh: '已校正', en: 'Centered' },
  denied: { zh: '未允許使用感應器', en: 'Motion sensor not allowed' },
  help: { zh: '操作說明', en: 'Controls' },
};

export interface ControlSettings {
  settings: TaxiSettings;
  tiltSupported: boolean;
  tiltStatus: TiltStatus;
  setAutoGas: (on: boolean) => void;
  /** call from a tap: iOS asks for permission there */
  setTilt: (on: boolean) => Promise<void>;
  calibrate: () => boolean;
}

/** `playing` = a run is on screen and not paused: only then may auto gas and tilt reach the car */
export function useControlSettings(game: RefObject<Game | null>, ready: boolean, playing: boolean, touchUi: boolean): ControlSettings {
  const [settings, setSettings] = useState<TaxiSettings>(loadSettings);
  const [tiltStatus, setTiltStatus] = useState<TiltStatus>('off');
  const tiltSupported = touchUi && TiltInput.supported();
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const tilt = useRef<TiltInput | null>(null);
  if (!tilt.current && tiltSupported)
    tilt.current = new TiltInput((v) => {
      const g = game.current;
      if (g) g.input.tilt = playingRef.current ? v : null;
    }, settings.tiltCentre);

  const update = useCallback((patch: Partial<TaxiSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // auto gas and tilt reach the car only while playing; menus and pause leave the car alone
  useEffect(() => {
    const g = game.current;
    if (!g) return;
    g.input.autoGas = settings.autoGas && playing;
    if (!playing || !settings.tilt || tiltStatus !== 'on') g.input.tilt = null; // otherwise the next sensor event fills it in
  }, [game, ready, playing, settings.autoGas, settings.tilt, tiltStatus]);

  // tilt was left on last time: listen again. iOS needs a tap for the permission, so the first tap does it.
  useEffect(() => {
    const t = tilt.current;
    if (!t || !settings.tilt || t.status === 'on') return;
    if (t.resume()) {
      setTiltStatus('on');
      return;
    }
    const onTap = () => {
      void t.enable().then(setTiltStatus);
      window.removeEventListener('touchend', onTap);
      window.removeEventListener('click', onTap);
    };
    window.addEventListener('touchend', onTap);
    window.addEventListener('click', onTap);
    return () => {
      window.removeEventListener('touchend', onTap);
      window.removeEventListener('click', onTap);
    };
  }, [settings.tilt]);
  useEffect(() => () => tilt.current?.disable(), []);

  const setAutoGas = useCallback((on: boolean) => update({ autoGas: on }), [update]);
  const setTilt = useCallback(
    async (on: boolean) => {
      const t = tilt.current;
      if (!t) return;
      if (!on) {
        t.disable();
        setTiltStatus('off');
        update({ tilt: false });
        return;
      }
      const st = await t.enable();
      setTiltStatus(st);
      update({ tilt: st === 'on' });
    },
    [update],
  );
  const calibrate = useCallback(() => {
    const c = tilt.current?.calibrate() ?? null;
    if (c) update({ tiltCentre: c });
    return !!c;
  }, [update]);
  return { settings, tiltSupported, tiltStatus, setAutoGas, setTilt, calibrate };
}

function Switch({ on, onChange, label, icon, testid }: { on: boolean; onChange: (on: boolean) => void; label: string; icon: ReactNode; testid: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="tc-switch" onClick={() => onChange(!on)} data-testid={testid}>
      {icon}
      <span className="tc-switch-label">{label}</span>
      <span className="tc-track" aria-hidden="true">
        <span className="tc-thumb" />
      </span>
    </button>
  );
}

const TiltIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
    <rect x="5" y="7" width="14" height="10" rx="1.5" transform="rotate(-15 12 12)" />
    <path d="M3 8.5A10 10 0 0 1 6 4.5M21 15.5a10 10 0 0 1-3 4" />
  </svg>
);
const CentreIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);
export const HelpIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10" strokeWidth="2.4" />
  </svg>
);

/** the settings row of the pause menu; the help button sits first so the row reads "how to play, then options" */
export function Settings({ lang, c, onHelp }: { lang: Lang; c: ControlSettings; onHelp: () => void }) {
  const tr = (l: L) => l[lang];
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(id);
  }, [done]);
  const tiltOn = c.settings.tilt && c.tiltStatus === 'on';
  return (
    <div className="tc-settings">
      <button type="button" className="tc-btn" onClick={onHelp} data-testid="taxi-help-open">
        <HelpIcon />
        <span>{tr(T.help)}</span>
      </button>
      <Switch on={c.settings.autoGas} onChange={c.setAutoGas} label={tr(T.autoGas)} icon={<ActionIcon id="gas" size={30} />} testid="taxi-auto-gas" />
      {c.tiltSupported && (
        <>
          <Switch on={tiltOn} onChange={(on) => void c.setTilt(on)} label={tr(T.tilt)} icon={<TiltIcon />} testid="taxi-tilt" />
          {tiltOn && (
            <button type="button" className="tc-btn" onClick={() => setDone(c.calibrate())} data-testid="taxi-tilt-calibrate" aria-describedby="tc-tilt-status">
              <CentreIcon />
              <span>{tr(T.calibrate)}</span>
            </button>
          )}
          <span id="tc-tilt-status" className="tc-status" role="status" data-testid="taxi-tilt-status">
            {c.tiltStatus === 'denied' ? tr(T.denied) : done ? tr(T.calibrated) : ''}
          </span>
        </>
      )}
    </div>
  );
}
