// Math Island batch B — Number-Line Frog (/math/g3/frog). Task: "start at 30, jump right 4 times, 10 each time":
// mark the lily pad where the frog will land (tap the line — it snaps to the nearest mark — or use the ‹ › buttons
// or arrow keys), then press "jump". A wrong mark is answered by how many jumps it would take; a right one shows
// the frog's jumps as arcs labelled +10. The line always starts at 0 (N-3-11).
import { useEffect, useRef, useState } from 'react';
import {
  FROG_KEY,
  FROG_PROBLEMS,
  blankFrog,
  checkFrog,
  finishedF2,
  landing,
  nextFrog,
  nudgePick,
  pickAt,
  playAgainF2,
  problemOfF2,
  readFrog,
  restartFrog,
  taskOf,
  ticksOf,
  validFrog,
  type FrogSave,
} from '../../shared/math/frog';
import { CLIPS } from './audio';
import { FrogArt } from './art';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import { IslandLink } from './train-page';
import './math.css';

const T = {
  title: { zh: '數線青蛙', en: 'Number-Line Frog' },
  sub: { zh: '三年級．數線上的位置', en: 'Grade 3 · places on a number line' },
  line: { zh: '數線，點一下選青蛙會停的地方', en: 'Number line: tap where the frog will land' },
  left: { zh: '往左一格', en: 'One mark left' },
  right: { zh: '往右一格', en: 'One mark right' },
  go: { zh: '跳！', en: 'Jump!' },
  marked: { zh: '選了第 {n} 格', en: 'Mark {n} chosen' },
  none: { zh: '還沒有選', en: 'Nothing chosen yet' },
  jumps: { zh: '跳到你選的地方要跳 {n} 次，題目是跳 {t} 次。', en: 'Reaching your mark takes {n} jumps; the task says {t}.' },
  demo: { zh: '點數線上的位置，選青蛙會停在哪裡；選錯了可以用「往左一格／往右一格」調整，再按「跳！」。', en: 'Tap the line where the frog will land; adjust with “one mark left / right”, then press Jump!' },
} satisfies Record<string, L>;

const X0 = 40;
const Y = 150;
/** a narrower drawing on phones, so marks, numbers and the frog are drawn larger */
function useNarrow() {
  const q = '(max-width: 639px)';
  const [n, setN] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setN(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return n;
}

export function FrogPage() {
  const { tr } = useTr();
  const g = useGame<FrogSave>({ key: FROG_KEY, read: readFrog, blank: () => blankFrog(), valid: validFrog });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfF2(s);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);
  /** jumps shown so far after a right answer (animates one by one unless motion is reduced) */
  const [hops, setHops] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const enabled = !viewer && !!p && !s.solved;
  const W = useNarrow() ? 600 : 1000;
  const X1 = W - 40;

  useEffect(() => {
    if (!s.solved || !p) {
      setHops(0);
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion');
    if (reduce) {
      setHops(p.times);
      return;
    }
    setHops(0);
    let k = 0;
    const id = setInterval(() => {
      k++;
      setHops(k);
      if (k >= p.times) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
  }, [s.solved, s.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentClip = () => {
    if (finishedF2(s)) return 'frog_done';
    if (!p) return '';
    return s.solved ? `frog_right_${p.id.slice(-2)}` : `frog_task_${p.id.slice(-2)}`;
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const setTo = (next: FrogSave) => {
    if (!enabled || next === s) return;
    if (commit(next)) {
      setDemoSeen(true);
      setMsg(null);
    }
  };
  const hint = (id: string, text?: string) => {
    setMsg({ text: text ?? CLIPS[id], kind: 'hint' });
    say(id);
  };
  const go = () => {
    if (viewer || !p) return;
    const r = checkFrog(s);
    if (r.r === 'noPick') hint('frog_no_pick');
    else if (r.r === 'start') hint('frog_start');
    else if (r.r === 'otherWay') hint('frog_other_way');
    else if (r.r === 'notOnPath') hint('frog_not_on_path');
    else if (r.r === 'jumps') hint('frog_jumps', tr(T.jumps, { n: r.jumps ?? 0, t: p.times }));
    else if (r.r === 'right' && commit(r.s)) {
      const id = `frog_right_${p.id.slice(-2)}`;
      setMsg({ text: CLIPS[id], kind: 'ok' });
      say(id);
    }
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextFrog(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    g.speaker.stop();
    const q = problemOfF2(n);
    say(finishedF2(n) || !q ? 'frog_done' : `frog_task_${q.id.slice(-2)}`);
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedF2(s) ? playAgainF2(s) : restartFrog(s))) return;
    setMsg(null);
    g.speaker.stop();
  };
  const toggleVoice = () => {
    if (viewer) return;
    if (s.voice) g.speaker.stop();
    commit({ ...s, voice: !s.voice });
  };

  const xOf = (v: number) => (p ? X0 + (v / p.max) * (X1 - X0) : X0);
  const onTap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!enabled || !p || !svg.current) return;
    const b = svg.current.getBoundingClientRect();
    const vx = ((e.clientX - b.left) / b.width) * W;
    setTo(pickAt(s, ((vx - X0) / (X1 - X0)) * p.max));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!enabled) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), setTo(nudgePick(s, -1)));
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), setTo(nudgePick(s, 1)));
    else if (e.key === 'Enter') (e.preventDefault(), go());
  };

  const frogAt = p ? (s.solved ? p.start + p.jump * hops : p.start) : 0;
  const ticks = p ? ticksOf(p) : [];
  const markIndex = p && s.pick !== null ? s.pick / p.tick : null;

  return (
    <Page testid="mi-frog" data={{ index: s.index, solved: s.solved, role: prog.role, pick: s.pick ?? 'none' }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={FROG_PROBLEMS.length} finished={finishedF2(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedF2(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2">
            {FROG_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {q.start} {q.jump > 0 ? '+' : '−'} {Math.abs(q.jump)} × {q.times} = {landing(q)}
              </li>
            ))}
          </ul>
          <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="mi-btn mi-btn-primary" onClick={restart} disabled={viewer} data-testid="mi-again">
              {tr(S.again)}
            </button>
            <IslandLink />
          </div>
        </section>
      ) : (
        p && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-2xl font-extrabold leading-snug sm:text-3xl" data-testid="mi-task" lang="zh-Hant">
                {taskOf(p)}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>

            <section className="flex flex-col gap-3" aria-label={tr(T.title)} data-testid="mi-stage">
              <svg
                ref={svg}
                viewBox={`0 0 ${W} 220`}
                data-w={W}
                className="w-full touch-manipulation select-none rounded-lg border-[3px] border-[var(--mi-sea)] bg-[var(--mi-surface)]"
                role="slider"
                tabIndex={enabled ? 0 : -1}
                aria-label={tr(T.line)}
                aria-valuemin={0}
                aria-valuemax={p.max}
                aria-valuenow={s.pick ?? undefined}
                aria-valuetext={markIndex === null ? tr(T.none) : tr(T.marked, { n: markIndex })}
                aria-disabled={!enabled}
                onPointerDown={onTap}
                onKeyDown={onKey}
                data-testid="mi-line"
                style={{ cursor: enabled ? 'pointer' : 'default' }}
              >
                <line x1={X0 - 20} y1={Y} x2={X1 + 20} y2={Y} stroke="var(--mi-ink)" strokeWidth="4" />
                <path d={`M${X1 + 24} ${Y}l-14 -9v18z`} fill="var(--mi-ink)" />
                {ticks.map((v) => {
                  const big = p.labels.includes(v);
                  return (
                    <g key={v}>
                      <line x1={xOf(v)} y1={Y - (big ? 16 : 10)} x2={xOf(v)} y2={Y + (big ? 16 : 10)} stroke="var(--mi-ink)" strokeWidth={big ? 4 : 2.5} />
                      {big && (
                        <text x={xOf(v)} y={Y + 48} textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--mi-ink)">
                          {v}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* the jumps already made after a right answer */}
                {s.solved &&
                  Array.from({ length: hops }, (_, k) => {
                    const a = xOf(p.start + p.jump * k),
                      b = xOf(p.start + p.jump * (k + 1));
                    const mid = (a + b) / 2;
                    return (
                      <g key={k} data-testid="mi-hop">
                        <path d={`M${a} ${Y - 18} Q${mid} ${Y - 110} ${b} ${Y - 18}`} fill="none" stroke="var(--mi-sea)" strokeWidth="4" />
                        <text x={mid} y={Y - 76} textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--mi-ink)">
                          {p.jump > 0 ? '+' : '−'}
                          {Math.abs(p.jump)}
                        </text>
                      </g>
                    );
                  })}
                {/* the child's mark: a lily pad above the tick with a pointer, never a number */}
                {s.pick !== null && (
                  <g data-testid="mi-mark">
                    <ellipse cx={xOf(s.pick)} cy={Y + 4} rx="22" ry="9" fill="var(--mi-leaf)" opacity="0.85" />
                    <path d={`M${xOf(s.pick)} ${Y + 28}l-12 18h24z`} fill="var(--mi-sea)" stroke="var(--mi-ink)" strokeWidth="2" />
                  </g>
                )}
                <g transform={`translate(${xOf(frogAt) - 24} ${Y - 54})`} data-testid="mi-frog-at" data-v={frogAt}>
                  <FrogArt size={48} />
                </g>
              </svg>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button type="button" className="mi-btn" onClick={() => setTo(nudgePick(s, -1))} disabled={!enabled} data-testid="mi-pick-left">
                  ‹ {tr(T.left)}
                </button>
                <button type="button" className="mi-btn" onClick={() => setTo(nudgePick(s, 1))} disabled={!enabled} data-testid="mi-pick-right">
                  {tr(T.right)} ›
                </button>
              </div>
            </section>

            {s.index === 0 && !demoSeen && s.pick === null && (
              <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                {tr(T.demo)}
              </p>
            )}

            <Feedback msg={msg} />

            <div>
              {s.solved ? (
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={goNext} disabled={viewer} data-testid="mi-next">
                  {tr(S.next)}
                </button>
              ) : (
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={go} disabled={viewer} data-testid="mi-go">
                  {tr(T.go)}
                </button>
              )}
            </div>
          </>
        )
      )}
    </Page>
  );
}
