// Try Again Trail — playable prototype. Race on an open map: three badges, then camp. Fair turns, open rules,
// gentle ending with "take a break / look back at one turn / try again", and a practice branch that never
// rewrites the real result. Art, maps and copy are provisional (docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format, useI18n } from '../i18n';
import { Button } from '../components/ui';
import { BADGES, apply, cost, easyPlan, legalMoves, normalPlan, replay, reviewTurns, turningPoint, undoTurn, type Action, type Game, type TrailMap } from '../../shared/trail/engine';
import { MAPS } from '../../shared/trail/maps';
import { BadgeIcon, EnergyIcon, ExplorerArt, NodeIcon, PLAYER_COLOR } from './art';
import './trail.css';

type L = { zh: string; en: string };
type Mode = 'easy' | 'normal' | 'duo';
const T = {
  title: { zh: '逆風探險賽', en: 'Try Again Trail' },
  proto: { zh: '試玩原型', en: 'Prototype' },
  goal: { zh: '集滿 3 個徽章，先到營地！', en: 'Get 3 badges, reach camp first!' },
  r1: { zh: '每回合', en: 'each turn' },
  r2: { zh: '泥巴', en: 'mud' },
  r3: { zh: '蘋果', en: 'apple' },
  r4: { zh: '最多存', en: 'save max' },
  who: { zh: '跟誰玩？', en: 'Play with?' },
  easy: { zh: '慢慢烏龜', en: 'Slow turtle' },
  normal: { zh: '快快狐狸', en: 'Quick fox' },
  duo: { zh: '兩人同機', en: 'Two players' },
  map: { zh: '選地圖', en: 'Pick a map' },
  start: { zh: '出發', en: 'Start' },
  resume: { zh: '繼續上一局', en: 'Continue last game' },
  firstIs: { zh: '這局 {p} 先走', en: '{p} goes first' },
  youFirst: { zh: '這局 你 先走', en: 'You go first' },
  you: { zh: '你', en: 'You' },
  cpu: { zh: '電腦', en: 'Computer' },
  p1: { zh: '橘隊', en: 'Orange' },
  p2: { zh: '紫隊', en: 'Purple' },
  yourTurn: { zh: '輪到 {p}：點發亮的路', en: "{p}'s turn: tap a glowing spot" },
  cpuTurn: { zh: '電腦正在走…', en: 'Computer is moving…' },
  noMove: { zh: '能量不夠走了，休息吧', en: 'Not enough energy, rest' },
  rest: { zh: '休息', en: 'Rest' },
  restSave: { zh: '休息（存 1）', en: 'Rest (save 1)' },
  undo: { zh: '這回合重來', en: 'Redo this turn' },
  round: { zh: '第 {n} 回合', en: 'Round {n}' },
  goTo: { zh: '走到', en: 'Go to' },
  win: { zh: '{p} 先到營地！', en: '{p} reached camp first!' },
  youWin: { zh: '你先到營地了！', en: 'You reached camp first!' },
  cpuWin: { zh: '這次電腦先到', en: 'The computer got there first this time' },
  tie: { zh: '同一回合到，平手！', en: 'Same round — a tie!' },
  brk: { zh: '休息一下', en: 'Take a break' },
  look: { zh: '回看一個轉折', en: 'Look back at one turn' },
  again: { zh: '再試一次', en: 'Try again' },
  thanks: { zh: '謝謝一起玩', en: 'Thanks for playing' },
  tpTitle: { zh: '第 {n} 回合：可以試試綠色虛線', en: 'Round {n}: try the green dashes' },
  tpGain: { zh: '這樣可以快 {n} 回合', en: 'That is {n} round(s) faster' },
  tpNone: { zh: '這局每一步都走得很好！', en: 'Every turn was a great choice!' },
  youWent: { zh: '橘線：你這回合走的路', en: 'Orange line: where you went' },
  ask: { zh: '下次想換哪個選擇？', en: 'What would you change next time?' },
  qApple: { zh: '去拿蘋果', en: 'Get an apple' },
  qShort: { zh: '走近路', en: 'Take a shortcut' },
  qSave: { zh: '存能量', en: 'Save energy' },
  qSame: { zh: '都不換', en: 'Keep it' },
  skip: { zh: '略過', en: 'Skip' },
  noted: { zh: '記下來了', en: 'Noted' },
  tryHere: { zh: '從這裡練習', en: 'Practise from here' },
  practice: { zh: '練習中：不改變原本結果', en: 'Practice: the real result stays the same' },
  pracDone: { zh: '練習：第 {a} 回合到營地（原本第 {b} 回合）', en: 'Practice: camp in round {a} (before: round {b})' },
  pracNot: { zh: '練習：第 {a} 回合到營地（原本沒到）', en: 'Practice: camp in round {a} (before: did not finish)' },
  back: { zh: '回到結果', en: 'Back to result' },
  listen: { zh: '聽', en: 'Listen' },
  saved: { zh: '已儲存在此瀏覽器', en: 'Saved in this browser' },
  badge: { forest: { zh: '森林章', en: 'Forest badge' }, mountain: { zh: '山峰章', en: 'Mountain badge' }, lake: { zh: '湖泊章', en: 'Lake badge' } } as Record<string, L>,
  kind: { plain: { zh: '小路', en: 'Path' }, mud: { zh: '泥巴', en: 'Mud' }, apple: { zh: '蘋果', en: 'Apple' }, camp: { zh: '營地', en: 'Camp' }, start: { zh: '起點', en: 'Start' } } as Record<string, L>,
};

// ------------------------------------------------------------ saving
const KEY = 'jy.trail.v1';
interface Practice {
  who: 0 | 1; // the explorer being practised; the other one replays what really happened
  baseLog: Action[];
  from: number; // log index where practice starts
  rest: Action[][]; // opponent's recorded turns still to replay
}
interface Saved {
  mode: Mode;
  mapId: string;
  nextFirst: 0 | 1;
  game: { first: 0 | 1; log: Action[] } | null;
  practice: Practice | null;
  notes: string[];
}
const blank = (): Saved => ({ mode: 'easy', mapId: MAPS[0].id, nextFirst: 0, game: null, practice: null, notes: [] });
function load(): Saved {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (x && ['easy', 'normal', 'duo'].includes(x.mode) && MAPS.some((m) => m.id === x.mapId) && Array.isArray(x.notes)) return { ...blank(), ...x };
  } catch {
    /* ignore */
  }
  return blank();
}
function store(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
const reduced = () => typeof window !== 'undefined' && (document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** turns of one explorer recorded in a log after a given index */
function recordedTurns(map: TrailMap, first: 0 | 1, log: Action[], from: number, opp: 0 | 1): Action[][] {
  let g = replay(map, first, log.slice(0, from));
  const turns: Action[][] = [];
  let cur: Action[] = [];
  for (let i = from; i < log.length && g.status === 'playing'; i++) {
    const who = g.turn;
    g = apply(g, log[i]);
    if (who === opp) cur.push(log[i]);
    if (g.turnStart === i + 1 || g.status === 'over') {
      if (who === opp) turns.push(cur);
      cur = [];
    }
  }
  return turns;
}

type Screen = 'setup' | 'game' | 'review';

export function TrailPage() {
  const { lang } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => format(l[lang], v);
  const [saved, setSaved] = useState<Saved>(load);
  const map = MAPS.find((m) => m.id === saved.mapId) ?? MAPS[0];
  const [screen, setScreen] = useState<Screen>(() => (load().game ? 'game' : 'setup'));
  const game: Game | null = useMemo(() => (saved.game ? replay(map, saved.game.first, saved.game.log) : null), [saved.game, map]);
  const [fx, setFx] = useState<{ id: number; text: string; x: number; y: number } | null>(null);
  const [thanks, setThanks] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (n: Saved) => {
    setSaved(n);
    store(n);
  };
  const vsCpu = saved.mode !== 'duo';
  const name = (p: 0 | 1) => (vsCpu ? (p === 0 ? tr(T.you) : tr(T.cpu)) : p === 0 ? tr(T.p1) : tr(T.p2));
  const cpuSide: 0 | 1 | null = saved.practice ? ((1 - saved.practice.who) as 0 | 1) : vsCpu ? 1 : null;
  const cpuTurn = !!game && game.status === 'playing' && cpuSide !== null && game.turn === cpuSide;

  useEffect(() => {
    (window as unknown as { __trail?: unknown }).__trail = { saved, game, screen };
  });
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const setLog = (log: Action[]) => {
    if (!saved.game) return;
    update({ ...saved, game: { ...saved.game, log } });
  };
  const act = (a: Action) => {
    if (!game || !saved.game) return;
    const before = game.players[game.turn];
    let next: Game;
    try {
      next = apply(game, a);
    } catch {
      return;
    }
    if (a.t === 'move') {
      const after = next.players[game.turn];
      const n = map.nodes[a.to];
      const gotBadge = after.badges.length > before.badges.length;
      const gotApple = after.apples.length > before.apples.length;
      if ((gotBadge || gotApple) && !reduced()) setFx({ id: Date.now(), text: gotBadge ? '+🏅' : '+2⚡', x: n.x, y: n.y });
    }
    setLog(next.log);
  };

  // computer (and recorded opponent in practice) moves one step at a time
  useEffect(() => {
    if (!cpuTurn || !game || !saved.game || screen !== 'game') return;
    const delay = reduced() ? 0 : 600;
    const me = game.players[game.turn];
    let nextAction: Action;
    if (saved.practice && saved.practice.rest.length) {
      // replay what the opponent really did, turn by turn
      const done = game.log.length - game.turnStart;
      const turn = saved.practice.rest[0];
      nextAction = turn[done] ?? { t: 'end' };
    } else {
      const plan = saved.mode === 'easy' ? easyPlan(map, me) : normalPlan(map, me);
      nextAction = plan.length ? { t: 'move', to: plan[0] } : { t: 'end' };
    }
    timer.current = setTimeout(() => {
      let log: Action[];
      try {
        log = apply(game, nextAction).log;
      } catch {
        log = apply(game, { t: 'end' }).log;
      }
      const after = replay(map, saved.game!.first, log);
      let practice = saved.practice;
      if (practice && practice.rest.length && (after.turnStart === log.length || after.status !== 'playing')) practice = { ...practice, rest: practice.rest.slice(1) };
      update({ ...saved, practice, game: { ...saved.game!, log } });
    }, delay);
    return () => void (timer.current && clearTimeout(timer.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpuTurn, game?.log.length, screen]);

  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setFx(null), 900);
    return () => clearTimeout(t);
  }, [fx]);

  const startGame = (mode = saved.mode, mapId = saved.mapId) => {
    const first = saved.nextFirst;
    update({ ...saved, mode, mapId, nextFirst: (1 - first) as 0 | 1, game: { first, log: [] }, practice: null });
    setThanks(false);
    setNote(null);
    setScreen('game');
  };
  const takeBreak = () => {
    update({ ...saved, game: null, practice: null });
    setScreen('setup');
  };

  // review data (computed from the real game, never the practice branch)
  const realLog = saved.practice ? saved.practice.baseLog : saved.game?.log ?? [];
  const realGame = useMemo(() => (saved.game ? replay(map, saved.game.first, realLog) : null), [saved.game, realLog, map]);
  const [reviewWho, setReviewWho] = useState<0 | 1>(0);
  const review = useMemo(() => {
    if (!realGame || realGame.status !== 'over' || !saved.game) return null;
    const who = vsCpu ? 0 : reviewWho;
    const turns = reviewTurns(map, saved.game.first, realLog, who);
    return { who, tp: turningPoint(turns), turns };
  }, [realGame, saved.game, realLog, map, vsCpu, reviewWho]);

  const practiseFrom = () => {
    if (!review?.tp || !saved.game) return;
    const from = review.tp.logStart;
    const who = review.who;
    const rest = recordedTurns(map, saved.game.first, realLog, from, (1 - who) as 0 | 1);
    update({ ...saved, practice: { who, baseLog: realLog, from, rest }, game: { ...saved.game, log: realLog.slice(0, from) } });
    setScreen('game');
  };
  const backToResult = () => {
    if (!saved.practice || !saved.game) return;
    update({ ...saved, game: { ...saved.game, log: saved.practice.baseLog }, practice: null });
    setScreen('review');
  };

  const speakText = (s: string) => {
    try {
      const u = new SpeechSynthesisUtterance(s.replace(/[🏅⚡🍎]/gu, ''));
      u.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* optional */
    }
  };
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const Listen = ({ text }: { text: string }) =>
    canSpeak ? (
      <button type="button" onClick={() => speakText(text)} className="h-11 w-11 shrink-0 rounded-full bg-black/5" aria-label={tr(T.listen)}>
        🔊
      </button>
    ) : null;

  const shell = (children: ReactNode, extra = '') => (
    <section className={`mx-auto max-w-4xl overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--card-shadow)] ${extra}`} data-testid="trail" data-screen={screen}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h1 className="text-xl font-extrabold">
          🏕️ {tr(T.title)} <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--muted)]">{tr(T.proto)}</span>
        </h1>
        {game && screen !== 'setup' && <span className="text-sm font-bold text-[var(--muted)]">{tr(T.round, { n: game.round })}</span>}
      </div>
      {children}
    </section>
  );

  // ------------------------------------------------------------ setup
  if (screen === 'setup' || !game || !saved.game) {
    const modes: { m: Mode; icon: string; l: L }[] = [
      { m: 'easy', icon: '🐢', l: T.easy },
      { m: 'normal', icon: '🦊', l: T.normal },
      { m: 'duo', icon: '👥', l: T.duo },
    ];
    return shell(
      <div className="space-y-4 px-4 pb-5">
        <div className="flex items-center gap-2 rounded-2xl bg-[#fff7e9] px-4 py-3 text-lg font-extrabold text-[#3e4636]" data-testid="trail-prompt">
          <span className="flex-1">🏅🏅🏅 → 🏕️ {tr(T.goal)}</span>
          <Listen text={tr(T.goal)} />
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="rules">
          {[
            [<EnergyIcon key="e" />, '+2', T.r1],
            [<NodeIcon key="m" kind="mud" />, '2', T.r2],
            [<NodeIcon key="a" kind="apple" />, '+2', T.r3],
            [<EnergyIcon key="s" off />, '1', T.r4],
          ].map(([icon, n, l], i) => (
            <li key={i} className="flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] p-2 text-sm font-bold">
              <span className="h-10 w-10 shrink-0">{icon as ReactNode}</span>
              <span>
                <span className="text-lg">{n as string}⚡</span> <span className="text-[var(--muted)]">{tr(l as L)}</span>
              </span>
            </li>
          ))}
        </ul>
        <h2 className="font-bold">{tr(T.who)}</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tr(T.who)}>
          {modes.map(({ m, icon, l }) => (
            <button key={m} type="button" role="radio" aria-checked={saved.mode === m} onClick={() => update({ ...saved, mode: m })} className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-4 text-sm font-bold sm:text-base ${saved.mode === m ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-transparent bg-[var(--surface-2)]'}`} data-testid={`mode-${m}`}>
              <span className="text-3xl">{icon}</span>
              {tr(l)}
            </button>
          ))}
        </div>
        <h2 className="font-bold">{tr(T.map)}</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tr(T.map)}>
          {MAPS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={saved.mapId === m.id} onClick={() => update({ ...saved, mapId: m.id })} className={`overflow-hidden rounded-2xl border-4 text-sm font-bold ${saved.mapId === m.id ? 'border-[var(--accent-text)]' : 'border-transparent'}`} data-testid={`map-${m.id}`}>
              <MiniMap map={m} />
              <span className="block bg-[var(--surface-2)] py-1">{m.name[lang]}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-bold text-[var(--muted)]">{vsCpu && saved.nextFirst === 0 ? tr(T.youFirst) : tr(T.firstIs, { p: name(saved.nextFirst) })}</p>
        <Button size="lg" className="min-h-14 w-full text-xl" onClick={() => startGame()} data-testid="trail-start">
          ▶ {tr(T.start)}
        </Button>
      </div>,
    );
  }

  // ------------------------------------------------------------ review
  if (screen === 'review' && review && realGame) {
    const tp = review.tp;
    const at = tp ? replay(map, saved.game.first, realLog.slice(0, tp.logStart)) : realGame;
    const startAt = at.players[review.who].at;
    return shell(
      <div className="space-y-3 px-4 pb-5">
        {!vsCpu && (
          <div className="flex gap-2" role="radiogroup">
            {([0, 1] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={reviewWho === p} onClick={() => setReviewWho(p)} className={`flex h-12 items-center gap-2 rounded-full border-4 px-3 font-bold ${reviewWho === p ? 'border-[var(--accent-text)]' : 'border-transparent bg-[var(--surface-2)]'}`}>
                <span className="h-8 w-8">
                  <ExplorerArt p={p} />
                </span>
                {name(p)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl bg-[#fff7e9] px-4 py-3 text-lg font-extrabold text-[#3e4636]" data-testid="trail-prompt">
          <span className="flex-1">
            {tp ? `🔍 ${tr(T.tpTitle, { n: tp.round })}` : `🌟 ${tr(T.tpNone)}`}
            {tp && <span className="block text-sm font-bold opacity-80">{tr(T.tpGain, { n: tp.after - tp.before })}</span>}
          </span>
          <Listen text={tp ? `${tr(T.tpTitle, { n: tp.round })}，${tr(T.tpGain, { n: tp.after - tp.before })}` : tr(T.tpNone)} />
        </div>
        <Board map={map} game={at} lines={tp ? [{ from: startAt, path: tp.path, color: PLAYER_COLOR[review.who], dashed: false }, { from: startAt, path: tp.better, color: '#2e9d57', dashed: true }] : []} />
        {tp && <p className="text-sm font-bold" style={{ color: PLAYER_COLOR[review.who] }}>━ {tr(T.youWent)}</p>}
        <div className="rounded-2xl bg-[var(--surface-2)] p-3" data-testid="trail-ask">
          <p className="mb-2 font-bold">{tr(T.ask)}</p>
          {note ? (
            <p className="font-bold text-[var(--ok-text)]">✓ {tr(T.noted)}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ['apple', '🍎', T.qApple],
                ['short', '🛤️', T.qShort],
                ['save', '⚡', T.qSave],
                ['same', '🙂', T.qSame],
              ].map(([id, icon, l]) => (
                <button key={id as string} type="button" className="min-h-12 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-2 font-bold" onClick={() => (setNote(id as string), update({ ...saved, notes: [...saved.notes, `${map.id}:${id}`].slice(-30) }))} data-testid={`note-${id}`}>
                  {icon as string} {tr(l as L)}
                </button>
              ))}
              <button type="button" className="min-h-12 rounded-xl px-2 font-bold text-[var(--muted)]" onClick={() => setNote('skip')}>
                {tr(T.skip)}
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tp && (
            <Button size="lg" className="min-h-14" onClick={practiseFrom} data-testid="trail-practise">
              ▶ {tr(T.tryHere)}
            </Button>
          )}
          <Button size="lg" variant="secondary" className="min-h-14" onClick={() => startGame()} data-testid="trail-again">
            🔁 {tr(T.again)}
          </Button>
          <Button size="lg" variant="ghost" className="min-h-14" onClick={takeBreak} data-testid="trail-break">
            ☕ {tr(T.brk)}
          </Button>
        </div>
      </div>,
    );
  }

  // ------------------------------------------------------------ game
  const me = game.players[game.turn];
  const moves = cpuTurn ? [] : legalMoves(game);
  const over = game.status === 'over';
  const practiceOver = over && !!saved.practice;
  const resultText = !over
    ? ''
    : game.winner === 'tie'
      ? tr(T.tie)
      : vsCpu
        ? game.winner === 0
          ? tr(T.youWin)
          : tr(T.cpuWin)
        : tr(T.win, { p: name(game.winner as 0 | 1) });
  const pw = saved.practice?.who ?? 0;
  const realDone = realGame?.players[pw].doneRound ?? null;
  const pracText = practiceOver ? (realDone !== null ? tr(T.pracDone, { a: game.players[pw].doneRound ?? '-', b: realDone }) : tr(T.pracNot, { a: game.players[pw].doneRound ?? '-' })) : '';
  const prompt = over ? (practiceOver ? pracText : resultText) : cpuTurn ? tr(T.cpuTurn) : moves.length ? tr(T.yourTurn, { p: name(game.turn) }) : tr(T.noMove);

  return shell(
    <div className="space-y-3 px-4 pb-5" data-turn={game.turn} data-status={game.status} data-winner={String(game.winner)} data-practice={!!saved.practice}>
      {saved.practice && <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-center text-sm font-bold" data-testid="trail-practice">🧪 {tr(T.practice)}</p>}
      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as const).map((p) => {
          const pl = game.players[p];
          const active = !over && game.turn === p;
          return (
            <div key={p} className={`flex items-center gap-2 rounded-2xl border-4 p-2 transition-colors ${active ? 'bg-[var(--surface-2)]' : 'border-transparent bg-[var(--surface-2)] opacity-80'}`} style={active ? { borderColor: PLAYER_COLOR[p] } : undefined} data-testid={`panel-${p}`}>
              <span className={`h-11 w-11 shrink-0 ${active ? 'motion-safe:animate-bounce' : ''}`}>
                <ExplorerArt p={p} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold">{name(p)}</div>
                <div className="flex gap-0.5" aria-label={pl.badges.map((b) => tr(T.badge[b])).join(', ') || '0'}>
                  {BADGES.map((b) => (
                    <span key={b} className="h-6 w-6">
                      <BadgeIcon b={b} dim={!pl.badges.includes(b)} />
                    </span>
                  ))}
                </div>
              </div>
              {active && (
                <div className="ml-auto flex flex-wrap justify-end gap-0.5" aria-label={`⚡ ${pl.energy}`} data-testid={`energy-${p}`} data-energy={pl.energy}>
                  {Array.from({ length: Math.max(pl.energy, 0) }, (_, i) => (
                    <span key={i} className="h-6 w-6">
                      <EnergyIcon />
                    </span>
                  ))}
                  {pl.energy === 0 && (
                    <span className="h-6 w-6">
                      <EnergyIcon off />
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-lg font-extrabold ${over ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]' : 'bg-[#fff7e9] text-[#3e4636]'}`} role="status" aria-live="polite" data-testid="trail-prompt">
        <span className="flex-1">
          {over ? (game.winner === 'tie' ? '🤝 ' : '🏁 ') : ''}
          {prompt}
        </span>
        <Listen text={prompt} />
      </div>

      <Board map={map} game={game} moves={moves} onMove={(to) => act({ t: 'move', to })} fx={fx} tr={tr} lang={lang} celebrate={over} />

      {!over && !cpuTurn && (
        <>
          {moves.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={tr(T.goTo)}>
              {moves.map((n) => {
                const node = map.nodes[n];
                const label = node.kind === 'badge' ? tr(T.badge[node.badge!]) : tr(T.kind[node.kind]);
                return (
                  <button key={n} type="button" onClick={() => act({ t: 'move', to: n })} className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-bold" data-testid={`go-${n}`}>
                    <span className="h-7 w-7">{node.kind === 'plain' ? '👣' : <NodeIcon kind={node.kind} badge={node.badge} appleUsed={me.apples.includes(n)} />}</span>
                    {label}
                    <span className="rounded-full bg-[#f6c453] px-1.5 text-xs text-[#3e4636]">{cost(map, n)}⚡</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" className="min-h-14" onClick={() => act({ t: 'end' })} data-testid="trail-rest">
              ✋ {me.energy > 0 ? tr(T.restSave) : tr(T.rest)}
            </Button>
            <Button size="lg" variant="secondary" className="min-h-14" disabled={game.log.length === game.turnStart || (saved.practice !== null && game.log.length <= saved.practice.from)} onClick={() => setLog(undoTurn(game).log)} data-testid="trail-undo">
              ↺ {tr(T.undo)}
            </Button>
          </div>
        </>
      )}

      {over && !saved.practice && (
        <div className="space-y-2" data-testid="trail-end">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button size="lg" variant="secondary" className="min-h-14" onClick={takeBreak} data-testid="trail-break">
              ☕ {tr(T.brk)}
            </Button>
            <Button size="lg" variant="secondary" className="min-h-14" onClick={() => (setNote(null), setScreen('review'))} data-testid="trail-look">
              🔍 {tr(T.look)}
            </Button>
            <Button size="lg" className="min-h-14" onClick={() => startGame()} data-testid="trail-again">
              🔁 {tr(T.again)}
            </Button>
          </div>
          <button type="button" className="mx-auto block min-h-11 rounded-full px-4 text-sm font-bold text-[var(--muted)]" onClick={() => setThanks(true)} data-testid="trail-thanks">
            {thanks ? <span className="motion-safe:animate-[jy-pop_0.5s] inline-block">👋 {tr(T.thanks)}!</span> : `👋 ${tr(T.thanks)}`}
          </button>
        </div>
      )}
      {saved.practice && (
        <Button size="lg" variant="secondary" className="min-h-14 w-full" onClick={backToResult} data-testid="trail-back">
          ↩ {tr(T.back)}
        </Button>
      )}
      <p className="text-xs text-[var(--muted)]">✓ {tr(T.saved)}</p>
    </div>,
  );
}

// ------------------------------------------------------------ board
interface Line {
  from: number;
  path: number[];
  color: string;
  dashed: boolean;
}
function Board({ map, game, moves = [], onMove, fx, tr, lang, lines = [], celebrate = false }: { map: TrailMap; game: Game; moves?: number[]; onMove?: (to: number) => void; fx?: { id: number; text: string; x: number; y: number } | null; tr?: (l: L) => string; lang?: 'zh' | 'en'; lines?: Line[]; celebrate?: boolean }) {
  const H = 64;
  const pct = (x: number, y: number) => ({ left: `${x}%`, top: `${(y / H) * 100}%` });
  const together = game.players[0].at === game.players[1].at;
  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border-4 border-[#c79a5b] bg-[#f1dcae]" style={{ aspectRatio: `100 / ${H}` }} data-testid="trail-map">
      <svg viewBox={`0 0 100 ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* hills */}
        <ellipse cx="18" cy="70" rx="40" ry="22" fill="#e3c487" />
        <ellipse cx="80" cy="-4" rx="36" ry="18" fill="#e3c487" />
        <ellipse cx="62" cy="72" rx="30" ry="14" fill="#cfe2a8" />
        {map.edges.map(([a, b], i) => {
          const A = map.nodes[a],
            B = map.nodes[b];
          return (
            <g key={i}>
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#b88b4a" strokeWidth="3.2" strokeLinecap="round" />
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#f7e6c1" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 2.4" />
            </g>
          );
        })}
        {lines.map((l, i) => {
          const pts = [l.from, ...l.path].map((n) => `${map.nodes[n].x},${map.nodes[n].y}`).join(' ');
          return l.path.length ? <polyline key={i} points={pts} fill="none" stroke={l.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.dashed ? '2.5 2' : undefined} className={l.dashed ? 'motion-safe:animate-[trail-dash_1.2s_linear_infinite]' : ''} data-testid={l.dashed ? 'line-better' : 'line-actual'} /> : null;
        })}
        {map.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r="4.2" fill={n.kind === 'plain' ? '#f7e6c1' : '#fffaf0'} stroke="#b88b4a" strokeWidth="0.8" />
        ))}
      </svg>
      {map.nodes.map((n) =>
        n.kind === 'plain' ? null : (
          <div key={n.id} className="pointer-events-none absolute h-[11%] w-[7.5%] -translate-x-1/2 -translate-y-1/2" style={pct(n.x, n.y)}>
            <NodeIcon kind={n.kind} badge={n.badge} appleUsed={game.players[game.turn].apples.includes(n.id)} />
          </div>
        ),
      )}
      {moves.map((n) => {
        const node = map.nodes[n];
        return (
          <button key={n} type="button" onClick={() => onMove?.(n)} className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#2e9d57] bg-[#2e9d5733] motion-safe:animate-pulse" style={pct(node.x, node.y)} aria-label={`${tr && lang ? (node.kind === 'badge' ? tr(T.badge[node.badge!]) : tr(T.kind[node.kind])) : ''} ${cost(map, n)}⚡`} data-testid={`node-${n}`}>
            <span className="absolute -right-2 -top-2 rounded-full bg-[#f6c453] px-1 text-[10px] font-bold text-[#3e4636]">{cost(map, n)}⚡</span>
          </button>
        );
      })}
      {([0, 1] as const).map((p) => {
        const n = map.nodes[game.players[p].at];
        const off = together ? (p === 0 ? -3 : 3) : 0;
        return (
          <div key={p} className="pointer-events-none absolute h-[17%] w-[11%] -translate-x-1/2 -translate-y-[80%] transition-[left,top] duration-500 ease-out motion-reduce:transition-none" style={pct(n.x + off, n.y)} data-testid={`token-${p}`} data-at={n.id}>
            <div key={n.id} className="h-full w-full motion-safe:animate-[trail-hop_0.5s_ease-out]">
              <ExplorerArt p={p} />
            </div>
          </div>
        );
      })}
      {fx && (
        <div key={fx.id} className="pointer-events-none absolute -translate-x-1/2 text-2xl font-extrabold motion-safe:animate-[trail-float_0.9s_ease-out_forwards]" style={pct(fx.x, fx.y - 6)} data-testid="trail-fx">
          {fx.text}
        </div>
      )}
      {celebrate && <div className="pointer-events-none absolute inset-0 grid place-items-center text-6xl motion-safe:animate-[jy-pop_0.6s]">🎉</div>}
    </div>
  );
}

function MiniMap({ map }: { map: TrailMap }) {
  return (
    <svg viewBox="0 0 100 64" className="block w-full bg-[#f1dcae]" aria-hidden="true">
      {map.edges.map(([a, b], i) => (
        <line key={i} x1={map.nodes[a].x} y1={map.nodes[a].y} x2={map.nodes[b].x} y2={map.nodes[b].y} stroke="#b88b4a" strokeWidth="3" strokeLinecap="round" />
      ))}
      {map.nodes.map((n) => (
        <circle key={n.id} cx={n.x} cy={n.y} r={n.kind === 'plain' ? 3 : 5} fill={n.kind === 'badge' ? '#d9a63a' : n.kind === 'camp' ? '#2f8f5b' : n.kind === 'apple' ? '#e2483d' : n.kind === 'mud' ? '#7a5233' : '#fff'} stroke="#7a5c3a" strokeWidth="1" />
      ))}
    </svg>
  );
}

