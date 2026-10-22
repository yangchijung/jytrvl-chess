// Math Island batch B — Clock Repair (/math/g1/clock). Task: set the clock to the time on the task card by turning
// the minute hand; the hour hand follows like gears and passing 12 switches 上午/下午. The clock face is the main
// content; "set" checks it. Turning: drag anywhere on the face (the angle change is unwrapped so going round
// many times works), the step buttons, or the arrow keys on the clock (PageUp/PageDown for an hour).
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  CLOCK_KEY,
  CLOCK_PROBLEMS,
  blankClock,
  checkClock,
  finishedC,
  hourAngle,
  isPM,
  minuteAngle,
  nextClock,
  nudge,
  playAgainC,
  problemOfC,
  readClock,
  restartClock,
  sayTime,
  turnTo,
  validClock,
  type ClockSave,
} from '../../shared/math/clock';
import { CLIPS } from './audio';
import { DayPartArt } from './art';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import { IslandLink } from './train-page';
import './math.css';

const T = {
  title: { zh: '時鐘修理站', en: 'Clock Repair' },
  sub: { zh: '一、二年級．撥時鐘', en: 'Grades 1–2 · set the clock' },
  clock: { zh: '時鐘，轉長針（分針）來撥時間', en: 'Clock: turn the long (minute) hand to set the time' },
  back: { zh: '往回 1 格', en: 'Back 1 step' },
  fwd: { zh: '往前 1 格', en: 'Forward 1 step' },
  set: { zh: '撥好了', en: 'Done' },
  am: { zh: '上午', en: 'a.m. (上午)' },
  pm: { zh: '下午', en: 'p.m. (下午)' },
  demo: { zh: '用手指按住鐘面，順著時鐘的方向轉，長針就會走，短針也會跟著慢慢走。走過 12 點，上午會變成下午。', en: 'Hold the clock face and turn it clockwise: the long hand moves and the short hand follows slowly. Past 12 o’clock, morning turns into afternoon.' },
  now: { zh: '現在時鐘是 {t}。', en: 'The clock now shows {t}.' },
  stepNote: { zh: '每格 {n} 分鐘', en: 'Each step is {n} minutes' },
} satisfies Record<string, L>;

const R = 120; // face radius in the SVG
const C = 140; // centre

export function ClockPage() {
  const { tr } = useTr();
  const g = useGame<ClockSave>({ key: CLOCK_KEY, read: readClock, blank: () => blankClock(), valid: validClock });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfC(s);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);
  /** the time shown while a finger is turning; committed on release */
  const [live, setLive] = useState<number | null>(null);
  const turn = useRef<{ pid: number; from: number; last: number; acc: number } | null>(null);
  const face = useRef<SVGSVGElement>(null);
  const shown = live ?? s.minutes;

  const currentClip = () => {
    if (finishedC(s)) return 'clock_done';
    if (!p) return '';
    return s.solved ? `clock_right_${p.id.slice(-2)}` : `clock_task_${p.id.slice(-2)}`;
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const setTo = (next: ClockSave) => {
    if (viewer || next === s) return;
    if (commit(next)) {
      setDemoSeen(true);
      setMsg(null);
    }
  };
  const check = () => {
    if (viewer || !p) return;
    const r = checkClock(s);
    if (r.r === 'wrongPart') {
      setMsg({ text: `${CLIPS.clock_wrong_part}（${tr(T.now, { t: sayTime(s.minutes, p.step === 30) })}）`, kind: 'hint' });
      say('clock_wrong_part');
    } else if (r.r === 'wrong') {
      setMsg({ text: `${tr(T.now, { t: sayTime(s.minutes, p.step === 30) })}${CLIPS.clock_wrong}`, kind: 'hint' });
      say('clock_wrong');
    } else if (r.r === 'right' && commit(r.s)) {
      const id = `clock_right_${p.id.slice(-2)}`;
      setMsg({ text: CLIPS[id], kind: 'ok' });
      say(id);
    }
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextClock(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    g.speaker.stop();
    const q = problemOfC(n);
    say(finishedC(n) || !q ? 'clock_done' : `clock_task_${q.id.slice(-2)}`);
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedC(s) ? playAgainC(s) : restartClock(s))) return;
    setMsg(null);
    g.speaker.stop();
  };
  const toggleVoice = () => {
    if (viewer) return;
    if (s.voice) g.speaker.stop();
    commit({ ...s, voice: !s.voice });
  };

  // ---------- turning the minute hand ----------
  const angleAt = (e: { clientX: number; clientY: number }) => {
    const el = face.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); // 0 at 12, clockwise
  };
  const enabled = !viewer && !s.solved && !!p;
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!enabled || turn.current || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    turn.current = { pid: e.pointerId, from: s.minutes, last: angleAt(e), acc: 0 };
  };
  /** add the angle turned since the last event (the shorter way round) */
  const follow = (t: { last: number; acc: number }, e: { clientX: number; clientY: number }) => {
    const a = angleAt(e);
    let d = a - t.last;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    t.last = a;
    t.acc += d;
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const t = turn.current;
    if (!t || t.pid !== e.pointerId) return;
    follow(t, e);
    const next = turnTo(s, t.from, (t.acc / (2 * Math.PI)) * 60);
    setLive(next.minutes);
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    const t = turn.current;
    if (!t || t.pid !== e.pointerId) return;
    follow(t, e); // the release point counts even when no move event came before it
    turn.current = null;
    const next = turnTo(s, t.from, (t.acc / (2 * Math.PI)) * 60);
    setLive(null);
    setTo(next);
  };
  const onCancel = () => {
    turn.current = null;
    setLive(null);
  };
  useEffect(() => {
    const h = () => document.visibilityState === 'hidden' && onCancel();
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (!enabled) return;
    const k = e.key;
    const map: Record<string, [number, boolean]> = { ArrowUp: [1, false], ArrowRight: [1, false], ArrowDown: [-1, false], ArrowLeft: [-1, false], PageUp: [1, true], PageDown: [-1, true] };
    if (!map[k]) return;
    e.preventDefault();
    setTo(nudge(s, map[k][0], map[k][1]));
  };

  const pm = isPM(shown);
  const hand = (deg: number, len: number, w: number, id: string) => (
    <line
      x1={C}
      y1={C}
      x2={C + Math.sin((deg * Math.PI) / 180) * len}
      y2={C - Math.cos((deg * Math.PI) / 180) * len}
      stroke="var(--mi-ink)"
      strokeWidth={w}
      strokeLinecap="round"
      data-testid={id}
      data-deg={Math.round(deg * 10) / 10}
    />
  );

  return (
    <Page testid="mi-clock" data={{ index: s.index, solved: s.solved, role: prog.role, minutes: shown }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={CLOCK_PROBLEMS.length} finished={finishedC(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedC(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2" lang="zh-Hant">
            {CLOCK_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {sayTime(q.goal, q.step === 30)}
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
                {p.task}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>

            <section className="flex flex-col items-center gap-3" aria-label={tr(T.title)} data-testid="mi-stage">
              <div className="flex items-center gap-2 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-1" data-testid="mi-daypart" data-pm={pm}>
                <DayPartArt pm={pm} />
                <span className="text-2xl font-extrabold" lang="zh-Hant">
                  {tr(pm ? T.pm : T.am)}
                </span>
              </div>
              <svg
                ref={face}
                viewBox="0 0 280 280"
                className="w-full max-w-[320px] touch-none select-none"
                role="slider"
                tabIndex={enabled ? 0 : -1}
                aria-label={tr(T.clock)}
                aria-valuemin={0}
                aria-valuemax={1439}
                aria-valuenow={shown}
                aria-valuetext={sayTime(shown, p.step === 30)}
                aria-disabled={!enabled}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onCancel}
                onLostPointerCapture={onCancel}
                onKeyDown={onKey}
                data-testid="mi-face"
                style={{ cursor: enabled ? 'grab' : 'default' }}
              >
                <circle cx={C} cy={C} r={R + 12} fill="var(--mi-face)" stroke="var(--mi-ink)" strokeWidth="5" />
                {Array.from({ length: 60 }, (_, k) => {
                  const a = (k * 6 * Math.PI) / 180;
                  const big = k % 5 === 0;
                  return <line key={k} x1={C + Math.sin(a) * (R + 4)} y1={C - Math.cos(a) * (R + 4)} x2={C + Math.sin(a) * (R - (big ? 10 : 4))} y2={C - Math.cos(a) * (R - (big ? 10 : 4))} stroke="var(--mi-ink)" strokeWidth={big ? 3 : 1.5} />;
                })}
                {Array.from({ length: 12 }, (_, k) => {
                  const n = k + 1;
                  const a = (n * 30 * Math.PI) / 180;
                  return (
                    <text key={n} x={C + Math.sin(a) * (R - 28)} y={C - Math.cos(a) * (R - 28) + 9} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--mi-ink)">
                      {n}
                    </text>
                  );
                })}
                {hand(hourAngle(shown), R - 52, 10, 'mi-hour-hand')}
                {hand(minuteAngle(shown), R - 16, 6, 'mi-minute-hand')}
                <circle cx={C} cy={C} r="9" fill="var(--mi-ink)" />
              </svg>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button type="button" className="mi-btn" onClick={() => setTo(nudge(s, -1))} disabled={!enabled} data-testid="mi-back-step">
                  <span aria-hidden="true">↺</span> {tr(T.back)}
                </button>
                <button type="button" className="mi-btn" onClick={() => setTo(nudge(s, 1))} disabled={!enabled} data-testid="mi-fwd-step">
                  {tr(T.fwd)} <span aria-hidden="true">↻</span>
                </button>
              </div>
              <p className="text-base">{tr(T.stepNote, { n: p.step })}</p>
            </section>

            {s.index === 0 && !demoSeen && s.minutes === p.start && (
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
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={check} disabled={viewer} data-testid="mi-check">
                  {tr(T.set)}
                </button>
              )}
            </div>
          </>
        )
      )}
    </Page>
  );
}
