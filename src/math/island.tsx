// Math Island — /math as an island map for children who cannot read yet. Each game is one big picture button
// with its name (≤ 5 characters) and a coloured flag for the grade (green 1, yellow 2, blue 3). Tapping says the
// game's name and what to do, then opens it. Everything written for adults is on /math/parent.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { APPLE_KEY, APPLE_PROBLEMS, readApple } from '../../shared/math/apple';
import { FACTORY_KEY, readFactory } from '../../shared/math/factory';
import { TRAIN_KEY, readTrain } from '../../shared/math/train';
import { SHOP_KEY, readShop } from '../../shared/math/shop';
import { BALANCE_KEY, readBalance } from '../../shared/math/balance';
import { CLOCK_KEY, readClock } from '../../shared/math/clock';
import { GARDEN_KEY, readGarden } from '../../shared/math/garden';
import { FROG_KEY, readFrog } from '../../shared/math/frog';
import { peek } from './save';
import { GameArt, type GameId } from './art';
import { Speaker } from './audio';
import { HandDemo, KidBar } from './kid';
import type { L } from './shell';
import './math.css';

type Grade = 1 | 2 | 3;
interface Game {
  id: GameId;
  path: string;
  name: L;
  grade: Grade;
  key: string;
  read: (get: () => string | null) => { kind: string; save?: unknown };
}
const GAMES: Game[] = [
  { id: 'apple', path: '/math/g1/apple', name: { zh: '蘋果籃', en: 'Apples' }, grade: 1, key: APPLE_KEY, read: readApple },
  { id: 'train', path: '/math/g1/train', name: { zh: '湊十小火車', en: 'Train' }, grade: 1, key: TRAIN_KEY, read: readTrain },
  { id: 'shop', path: '/math/g1/shop', name: { zh: '零錢小商店', en: 'Shop' }, grade: 1, key: SHOP_KEY, read: readShop },
  { id: 'balance', path: '/math/g1/balance', name: { zh: '天平等一等', en: 'Balance' }, grade: 1, key: BALANCE_KEY, read: readBalance },
  { id: 'clock', path: '/math/g1/clock', name: { zh: '時鐘修理站', en: 'Clock' }, grade: 1, key: CLOCK_KEY, read: readClock },
  { id: 'garden', path: '/math/g2/garden', name: { zh: '乘法花圃', en: 'Garden' }, grade: 2, key: GARDEN_KEY, read: readGarden },
  { id: 'factory', path: '/math/g3/factory', name: { zh: '分裝工廠', en: 'Factory' }, grade: 3, key: FACTORY_KEY, read: readFactory },
  { id: 'frog', path: '/math/g3/frog', name: { zh: '數線青蛙', en: 'Frog' }, grade: 3, key: FROG_KEY, read: readFrog },
];
const FLAG: Record<Grade, string> = { 1: '#3D7A3F', 2: '#E2B93B', 3: '#3A7BD5' };
const A11Y = {
  title: { zh: '數學遊樂島', en: 'Math Island' },
  grade: { zh: '{g} 年級', en: 'grade {g}' },
  done: { zh: '做完 {n} 題', en: '{n} done' },
};
const MENU_KEY = 'jy.math.menu.v1';

/** how many of a game's 5 problems are done, from its own save (read-only) */
function doneOf(g: Game): number {
  const s = peek({ key: g.key, read: g.read as never }) as { done?: string[] } | null;
  return Math.min(5, s?.done?.length ?? 0);
}
const readVoice = () => {
  try {
    return localStorage.getItem(MENU_KEY) !== '{"voice":false}';
  } catch {
    return true;
  }
};

export function MathIslandPage() {
  const { lang, to } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => l[lang].replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''));
  const navigate = useNavigate();
  const speaker = useMemo(() => new Speaker(), []);
  const sub = useCallback((f: () => void) => speaker.subscribe(f), [speaker]);
  const audio = useSyncExternalStore(sub, () => speaker.state, () => 'idle' as const);
  const [voice, setVoice] = useState(readVoice);
  const [going, setGoing] = useState<GameId | null>(null);
  const progress = useMemo(() => Object.fromEntries(GAMES.map((g) => [g.id, doneOf(g)])) as Record<GameId, number>, []);
  const firstVisit = useMemo(() => Object.values(progress).every((n) => n === 0) && !peek({ key: APPLE_KEY, read: readApple }), [progress]);
  const [touched, setTouched] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const appleBtn = useRef<HTMLAnchorElement>(null);

  useEffect(() => () => speaker.stop(), [speaker]);
  // the greeting plays by itself only when the child has already tapped (browsers block sound before that)
  useEffect(() => {
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua?.hasBeenActive && voice) speaker.play('menu_hello');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // open the game when its spoken name ends (or at once without sound); a second tap skips the wait
  const pending = useRef<{ path: string; t: ReturnType<typeof setTimeout> } | null>(null);
  const go = (path: string) => {
    if (pending.current) clearTimeout(pending.current.t);
    pending.current = null;
    navigate(to(path));
  };
  useEffect(() => {
    if (pending.current && audio !== 'playing') go(pending.current.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);
  const open = (e: React.MouseEvent, g: Game) => {
    e.preventDefault();
    setTouched(true);
    if (pending.current || !voice) return go(g.path);
    setGoing(g.id);
    speaker.play(`menu_${g.id}`);
    pending.current = { path: g.path, t: setTimeout(() => go(g.path), 4500) };
    if (speaker.state !== 'playing') go(g.path);
  };
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current.t);
    },
    [],
  );
  const toggleVoice = () => {
    const v = !voice;
    setVoice(v);
    if (!v) speaker.stop();
    try {
      localStorage.setItem(MENU_KEY, JSON.stringify({ voice: v }));
    } catch {
      /* the choice just is not remembered */
    }
  };

  return (
    <div className="mi min-h-dvh" data-testid="mi-island">
      <h1 className="sr-only">{tr(A11Y.title)}</h1>
      <KidBar back="site" voice={voice} onSpeak={() => speaker.play('menu_hello')} onVoice={toggleVoice} />
      <div ref={stage} className="relative mx-auto max-w-[1180px] px-3 pb-6 sm:px-5" onPointerDown={() => setTouched(true)}>
        {/* the island: sea all round, one sandy shape, the eight places on it */}
        <div className="relative overflow-hidden rounded-[28px] bg-[#3A7BD5] p-4 sm:p-8">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M6 22C10 6 34 3 52 5s40 1 43 18c3 14-2 30 1 46s-4 27-24 28-44 0-58-4S1 76 3 58 2 34 6 22z" fill="#FFF4E3" stroke="#23303F" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          </svg>
          <ul className="relative grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4" role="list">
            {GAMES.map((g) => (
              <li key={g.id}>
                <a
                  ref={g.id === 'apple' ? appleBtn : undefined}
                  href={to(g.path)}
                  onClick={(e) => open(e, g)}
                  className="kid-place flex flex-col items-center gap-1 rounded-[20px] border-[3px] border-[#23303F] bg-[#FFFAF2] px-2 pb-3 pt-2 text-[#23303F]"
                  data-testid={`mi-start-${g.id}`}
                  data-grade={g.grade}
                  data-going={going === g.id}
                  aria-label={`${tr(g.name)}，${tr(A11Y.grade, { g: g.grade })}${progress[g.id] ? `，${tr(A11Y.done, { n: progress[g.id] })}` : ''}`}
                >
                  <span className="flex w-full items-start justify-between">
                    <svg viewBox="0 0 28 32" width="28" height="32" aria-hidden="true">
                      <path d="M4 30V3" stroke="#23303F" strokeWidth="3" strokeLinecap="round" />
                      <path d="M5 4h19l-5 6 5 6H5z" fill={FLAG[g.grade]} stroke="#23303F" strokeWidth="2.5" strokeLinejoin="round" />
                    </svg>
                    <span className="flex gap-1 pt-1" aria-hidden="true">
                      {Array.from({ length: APPLE_PROBLEMS.length }, (_, k) => (
                        <span key={k} className="h-2.5 w-2.5 rounded-full border-2 border-[#23303F]" style={{ background: k < progress[g.id] ? '#3D7A3F' : 'transparent' }} />
                      ))}
                    </span>
                  </span>
                  <GameArt game={g.id} size={150} />
                  <span className="text-2xl font-extrabold leading-tight" lang={lang === 'zh' ? 'zh-Hant' : 'en'}>
                    {tr(g.name)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <HandDemo show={firstVisit && !touched} from={appleBtn} to={appleBtn} stage={stage} />
      </div>
    </div>
  );
}
