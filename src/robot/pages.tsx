// Robot Delivery Lab — playable prototype (sequence stage). Picture blocks, animated robot, step-by-step debugging.
// Art and levels are provisional until the product-side handoff (docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md).
import { useEffect, useMemo, useRef, useState } from 'react';
import { format, useI18n } from '../i18n';
import { Button } from '../components/ui';
import { run, solve, type Block, type Dir, type Robot, type RunResult, type Level } from '../../shared/robot/engine';
import { LEVELS } from '../../shared/robot/levels';
import { BlockIcon, DoorArt, ParcelArt, RobotArt, WallArt } from './art';

type L = { zh: string; en: string };
const T = {
  title: { zh: '機器人快遞站', en: 'Robot Delivery Lab' },
  proto: { zh: '試玩原型', en: 'Prototype' },
  build: { zh: '排好指令，送包裹', en: 'Line up blocks, deliver' },
  running: { zh: '機器人出發！', en: 'Off it goes!' },
  win: { zh: '送到了！', en: 'Delivered!' },
  short: { zh: '還沒送到喔', en: 'Not delivered yet' },
  run: { zh: '出發', en: 'Go' },
  step: { zh: '一步', en: 'One step' },
  reset: { zh: '回起點', en: 'Restart' },
  clear: { zh: '清空', en: 'Clear' },
  next: { zh: '下一關', en: 'Next level' },
  again: { zh: '再試一次', en: 'Try again' },
  listen: { zh: '聽', en: 'Listen' },
  remove: { zh: '拿掉', en: 'Remove' },
  moveL: { zh: '往前移', en: 'Move earlier' },
  moveR: { zh: '往後移', en: 'Move later' },
  blocks: { zh: '指令 {n}/{max}', en: 'Blocks {n}/{max}' },
  best: { zh: '最短也只要 {n} 步！', en: 'Shortest possible: {n}!' },
  star: { zh: '🌟 最短路線', en: '🌟 Shortest route' },
  saved: { zh: '已儲存在此瀏覽器', en: 'Saved in this browser' },
  level: { zh: '第 {n} 關', en: 'Level {n}' },
  locked: { zh: '還沒解鎖', en: 'Locked' },
  b: {
    forward: { zh: '前進', en: 'Forward' },
    left: { zh: '左轉', en: 'Turn left' },
    right: { zh: '右轉', en: 'Turn right' },
    pick: { zh: '拿取', en: 'Pick up' },
    drop: { zh: '放下', en: 'Drop' },
  } as Record<Block, L>,
  err: {
    bump: { zh: '第 {n} 步：前面有牆', en: 'Step {n}: a wall is ahead' },
    nothing_to_pick: { zh: '第 {n} 步：這裡沒有包裹', en: 'Step {n}: no parcel here' },
    hands_full: { zh: '第 {n} 步：手上已經有包裹', en: 'Step {n}: hands are full' },
    not_carrying: { zh: '第 {n} 步：手上沒有包裹', en: 'Step {n}: nothing to drop' },
    wrong_door: { zh: '第 {n} 步：不是這個顏色的門', en: 'Step {n}: wrong colour door' },
  } as Record<string, L>,
};

const KEY = 'jy.robot.v1';
interface Saved {
  unlocked: number;
  programs: Record<string, Block[]>;
  done: Record<string, number>;
}
function load(): Saved {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (x && Number.isInteger(x.unlocked) && x.programs && x.done) return x;
  } catch {
    /* ignore */
  }
  return { unlocked: 1, programs: {}, done: {} };
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const ROT: Record<Dir, number> = { N: 0, E: 90, S: 180, W: 270 };
const reduced = () => typeof window !== 'undefined' && (document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function RobotPage() {
  const { lang } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => format(l[lang], v);
  const [saved, setSaved] = useState<Saved>(load);
  const [li, setLi] = useState(() => Math.min(load().unlocked, LEVELS.length) - 1);
  const lv: Level = LEVELS[li];
  const [prog, setProg] = useState<Block[]>(() => saved.programs[lv.id] ?? []);
  const [sel, setSel] = useState<number | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [shown, setShown] = useState(-1); // index of the last step shown (-1 = at start)
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortest = useMemo(() => solve(lv)?.length ?? null, [lv]);

  useEffect(() => {
    setProg(saved.programs[lv.id] ?? []);
    setResult(null);
    setShown(-1);
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [li]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    (window as unknown as { __robot?: unknown }).__robot = { level: lv, prog, result, shown, playing };
  });

  const persist = (p: Block[], extra?: Partial<Saved>) => {
    const n = { ...saved, ...extra, programs: { ...saved.programs, [lv.id]: p } };
    setSaved(n);
    save(n);
  };
  const edit = (p: Block[]) => {
    stop();
    setProg(p);
    setResult(null);
    setShown(-1);
    persist(p);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };

  const finished = (r: RunResult) => {
    setPlaying(false);
    if (r.outcome === 'success') {
      const done = { ...saved.done, [lv.id]: Math.min(saved.done[lv.id] ?? Infinity, prog.length) };
      const unlocked = Math.max(saved.unlocked, Math.min(LEVELS.length, li + 2));
      persist(prog, { done, unlocked });
    }
  };
  const go = () => {
    stop();
    const r = run(lv, prog);
    setResult(r);
    if (reduced() || !r.steps.length) {
      setShown(r.steps.length - 1);
      finished(r);
      return;
    }
    setShown(-1);
    setPlaying(true);
    let i = -1;
    const tick = () => {
      i++;
      setShown(i);
      if (i >= r.steps.length - 1) {
        timer.current = setTimeout(() => finished(r), 450);
        return;
      }
      timer.current = setTimeout(tick, 480);
    };
    timer.current = setTimeout(tick, 200);
  };
  const stepOnce = () => {
    stop();
    const r = result ?? run(lv, prog);
    if (!result) setResult(r);
    const i = Math.min(shown + 1, r.steps.length - 1);
    setShown(i);
    if (i === r.steps.length - 1) finished(r);
  };
  const resetRobot = () => {
    stop();
    setResult(null);
    setShown(-1);
  };

  const robot: Robot = result && shown >= 0 ? result.steps[shown].robot : { ...lv.start, carrying: null };
  const floor = result && shown >= 0 ? result.steps[shown].floor : lv.parcels;
  const delivered = result && shown >= 0 ? result.steps[shown].delivered : [];
  const atEnd = result !== null && shown === result.steps.length - 1 && !playing;
  const curPc = result && shown >= 0 ? result.steps[shown].pc : null;
  const errorNow = result?.outcome === 'error' && atEnd;
  const winNow = result?.outcome === 'success' && atEnd;
  const prompt = winNow ? T.win : errorNow ? null : playing ? T.running : result?.outcome === 'incomplete' && atEnd ? T.short : T.build;
  const promptText = errorNow ? tr(T.err[result!.error!], { n: result!.errorAt! + 1 }) : tr(prompt!);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(promptText);
      u.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* optional */
    }
  };

  return (
    <section className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--card-shadow)]" data-testid="robot" data-level={lv.id} data-outcome={atEnd ? result?.outcome : ''} data-playing={playing}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h1 className="text-xl font-extrabold">
          🤖 {tr(T.title)} <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--muted)]">{tr(T.proto)}</span>
        </h1>
        <nav className="flex flex-wrap gap-1" aria-label="levels">
          {LEVELS.map((l, i) => {
            const open = i < saved.unlocked;
            return (
              <button key={l.id} type="button" disabled={!open || playing} onClick={() => setLi(i)} aria-current={i === li ? 'true' : undefined} aria-label={open ? tr(T.level, { n: i + 1 }) : `${tr(T.level, { n: i + 1 })} · ${tr(T.locked)}`} className={`h-11 w-11 rounded-full border-2 text-sm font-bold disabled:opacity-40 ${i === li ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`} data-testid={`lv-${i + 1}`}>
                {saved.done[l.id] !== undefined ? '✓' : open ? i + 1 : '🔒'}
              </button>
            );
          })}
        </nav>
      </div>

      {/* prompt */}
      <div className={`mx-4 flex items-center gap-2 rounded-2xl px-4 py-2 text-lg font-extrabold ${errorNow ? 'bg-[var(--warn-bg)] text-[var(--warn-text)]' : winNow ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]' : 'bg-[#fff7e9] text-[#3e4636]'}`} role="status" aria-live="polite" data-testid="robot-prompt">
        <span className="flex-1">
          {errorNow ? '⚠ ' : winNow ? '🎉 ' : ''}
          {promptText}
          {lv.hint && !result && <span className="ml-2 text-sm font-semibold opacity-80">· {lv.hint[lang]}</span>}
        </span>
        {canSpeak && (
          <button type="button" onClick={speak} className="h-11 w-11 rounded-full bg-black/5" aria-label={tr(T.listen)}>
            🔊
          </button>
        )}
      </div>

      {/* map */}
      <div className="p-4">
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border-4 border-[#c9a77a] bg-[#f3e2c3]" style={{ aspectRatio: `${lv.w} / ${lv.h}` }} data-testid="robot-map">
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${lv.w}, 1fr)`, gridTemplateRows: `repeat(${lv.h}, 1fr)` }}>
            {Array.from({ length: lv.w * lv.h }, (_, k) => {
              const x = k % lv.w,
                y = Math.floor(k / lv.w);
              const wall = lv.walls.some(([a, b]) => a === x && b === y);
              const door = lv.doors.find((d) => d.x === x && d.y === y);
              return (
                <div key={k} className={`relative border border-[#e6cfa6] ${(x + y) % 2 ? 'bg-[#f7ead2]' : ''}`}>
                  {wall && <WallArt />}
                  {door && (
                    <div className="absolute inset-0">
                      <DoorArt color={door.color} />
                      {delivered.includes(door.color) && <span className="absolute inset-x-0 top-0 text-center text-xl">✅</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {floor.map((p, i) => (
            <div key={`${p.color}-${i}`} className="absolute" style={{ left: `${(p.x / lv.w) * 100}%`, top: `${(p.y / lv.h) * 100}%`, width: `${100 / lv.w}%`, height: `${100 / lv.h}%` }}>
              <ParcelArt color={p.color} />
            </div>
          ))}
          <div
            className={`absolute transition-[left,top] duration-300 ease-out motion-reduce:transition-none ${errorNow && result?.error === 'bump' ? 'animate-[jy-shake_0.4s]' : ''} ${winNow ? 'animate-[jy-pop_0.5s]' : ''}`}
            style={{ left: `${(robot.x / lv.w) * 100}%`, top: `${(robot.y / lv.h) * 100}%`, width: `${100 / lv.w}%`, height: `${100 / lv.h}%` }}
            data-testid="robot-bot"
            data-x={robot.x}
            data-y={robot.y}
            data-dir={robot.dir}
          >
            <div className="absolute inset-[12%]">
              <RobotArt carrying={robot.carrying} />
            </div>
            {/* facing arrow: the robot stays upright, the arrow turns */}
            <div className="pointer-events-none absolute inset-0 transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `rotate(${ROT[robot.dir]}deg)` }} data-testid="robot-facing">
              <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
                <path d="M50 1 63 12H37z" fill="#f6c453" stroke="#b8860b" strokeWidth="3" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          {winNow && <div className="pointer-events-none absolute inset-0 grid place-items-center text-6xl motion-safe:animate-[jy-pop_0.6s]">🎉</div>}
        </div>
      </div>

      {/* program */}
      <div className="space-y-3 px-4 pb-4">
        <div className="flex items-center justify-between text-sm font-bold">
          <span>{tr(T.blocks, { n: prog.length, max: lv.maxBlocks })}</span>
          {winNow && shortest !== null && <span>{prog.length <= shortest ? tr(T.star) : tr(T.best, { n: shortest })}</span>}
        </div>
        <ol className="flex min-h-16 flex-wrap gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] p-2" aria-label="program" data-testid="robot-program">
          {prog.map((b, i) => {
            const cur = curPc === i;
            const bad = errorNow && result?.errorAt === i;
            return (
              <li key={i} className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={playing}
                  onClick={() => setSel(sel === i ? null : i)}
                  aria-pressed={sel === i}
                  aria-label={`${i + 1}. ${tr(T.b[b])}`}
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl border-2 text-[10px] font-bold ${bad ? 'border-[var(--warn-text)] bg-[var(--warn-bg)] text-[var(--warn-text)]' : cur ? 'border-[var(--gold)] bg-[#fff1c9] text-[#3e4636] scale-110' : sel === i ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface-2)]'} transition-transform`}
                  data-block={b}
                >
                  <BlockIcon b={b} />
                  {i + 1}
                </button>
                {sel === i && !playing && (
                  <span className="mt-1 flex gap-1">
                    <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)]" aria-label={tr(T.moveL)} disabled={i === 0} onClick={() => (edit(prog.map((x, k) => (k === i - 1 ? prog[i] : k === i ? prog[i - 1] : x))), setSel(i - 1))}>
                      ◀
                    </button>
                    <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)]" aria-label={tr(T.remove)} onClick={() => (edit(prog.filter((_, k) => k !== i)), setSel(null))}>
                      ✕
                    </button>
                    <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)]" aria-label={tr(T.moveR)} disabled={i === prog.length - 1} onClick={() => (edit(prog.map((x, k) => (k === i + 1 ? prog[i] : k === i ? prog[i + 1] : x))), setSel(i + 1))}>
                      ▶
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="blocks">
          {lv.blocks.map((b) => (
            <button key={b} type="button" disabled={playing || prog.length >= lv.maxBlocks} onClick={() => edit(sel === null ? [...prog, b] : [...prog.slice(0, sel + 1), b, ...prog.slice(sel + 1)])} className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-[#2f9e8f] text-xs font-bold text-white shadow-[0_4px_0_#1d6e63] active:translate-y-0.5 disabled:opacity-40 sm:text-sm" data-testid={`add-${b}`}>
              <BlockIcon b={b} />
              {tr(T.b[b])}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="lg" className="min-h-14 text-xl" disabled={!prog.length || playing} onClick={go} data-testid="robot-run">
            ▶ {tr(T.run)}
          </Button>
          <Button size="lg" variant="secondary" className="min-h-14" disabled={!prog.length || playing || atEnd} onClick={stepOnce} data-testid="robot-step">
            ⏭ {tr(T.step)}
          </Button>
          <Button size="lg" variant="secondary" className="min-h-14" onClick={resetRobot} data-testid="robot-reset">
            ↺ {tr(T.reset)}
          </Button>
          <Button size="lg" variant="ghost" className="min-h-14" disabled={!prog.length || playing} onClick={() => edit([])} data-testid="robot-clear">
            🗑 {tr(T.clear)}
          </Button>
        </div>
        {winNow && li < LEVELS.length - 1 && (
          <Button size="lg" className="min-h-14 w-full text-xl" onClick={() => setLi(li + 1)} data-testid="robot-next">
            ➜ {tr(T.next)}
          </Button>
        )}
        <p className="text-xs text-[var(--muted)]">✓ {tr(T.saved)}</p>
      </div>
    </section>
  );
}
