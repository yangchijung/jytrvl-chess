// Math Island batch A — Make-Ten Train (/math/g1/train). Task: move the riders on the platform onto the train,
// filling car 1 (a ten-frame) before car 2, then pick how many riders there are altogether. The train is the
// main content: the child sees "10 and 3" before saying 13. Drag, tap-then-tap and keyboard all go through
// moveRider() and the shared drag controller (drag.ts).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CAR,
  PLATFORM,
  TRAIN_KEY,
  TRAIN_PROBLEMS,
  allBoarded,
  answerTrain,
  blankTrain,
  cars,
  choicesOfT,
  finishedT,
  moveRider,
  nextTrain,
  playAgainT,
  problemOfT,
  readTrain,
  restartTrain,
  validTrain,
  type TrainSave,
} from '../../shared/math/train';
import { CLIPS } from './audio';
import { RiderArt } from './art';
import { useDragPlace, useZones } from './drag';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import './math.css';

const T = {
  title: { zh: '湊十小火車', en: 'Make-Ten Train' },
  sub: { zh: '一年級．先湊成 10', en: 'Grade 1 · make ten first' },
  platform: { zh: '月台', en: 'Platform' },
  car: { zh: '第 {n} 節', en: 'Car {n}' },
  full: { zh: '坐滿 10 人', en: '10 riders, full' },
  seats: { zh: '{n} 人', en: '{n} riders' },
  dropHere: { zh: '放這裡', en: 'Put here' },
  rider: { zh: '乘客，第 {n} 位，{w}', en: 'Rider {n}, {w}' },
  onPlatform: { zh: '在月台', en: 'on the platform' },
  inCar: { zh: '在第 {n} 節', en: 'in car {n}' },
  seated: { zh: '第 1 節已經坐了 {n} 人', en: 'Car 1 already has {n} riders' },
  held: { zh: '選了一位乘客，要坐哪裡？', en: 'You picked a rider. Where should they sit?' },
  toCar: { zh: '坐第 {n} 節', en: 'Sit in car {n}' },
  toPlatform: { zh: '回月台', en: 'Back to the platform' },
  demo: { zh: '按住月台上的人拖進車廂；也可以先點人，再點車廂。第一節坐滿 10 人，才能坐第二節。', en: 'Hold a rider and drag them into a car, or tap a rider and then a car. Car 1 fills up to 10 before car 2.' },
  answers: { zh: '一共有幾個人？選一個數字', en: 'How many riders altogether? Pick a number' },
} satisfies Record<string, L>;

type Zone = 'platform' | 'car-0' | 'car-1';
const zoneOf = (spot: number): Zone => (spot === PLATFORM ? 'platform' : spot === 0 ? 'car-0' : 'car-1');
const spotOf = (z: Zone): number => (z === 'platform' ? PLATFORM : z === 'car-0' ? 0 : 1);

export function TrainPage() {
  const { tr } = useTr();
  const g = useGame<TrainSave>({ key: TRAIN_KEY, read: readTrain, blank: () => blankTrain(), valid: validTrain });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfT(s);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);
  const [c1, c2] = cars(s);

  const currentClip = () => {
    if (finishedT(s)) return 'train_done';
    if (s.solved && p) return `train_right_${p.id.slice(-2)}`;
    return allBoarded(s) ? 'train_ask' : 'train_task';
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const hint = (id: string, kind: 'info' | 'hint' | 'ok') => {
    setMsg({ text: CLIPS[id], kind });
    say(id);
  };
  const move = (i: number, spot: number) => {
    if (viewer) return;
    const before = allBoarded(s);
    const r = moveRider(s, i, spot);
    setSel(null);
    if (r.r === 'full') return hint('train_full', 'hint');
    if (r.r === 'fillFirst') return hint('train_fill_first', 'hint');
    if (r.r !== 'moved' || !commit(r.s)) return;
    setDemoSeen(true);
    setMsg(null);
    if (!before && allBoarded(r.s)) say('train_ask');
  };
  const answer = (n: number) => {
    if (viewer) return;
    const r = answerTrain(s, n);
    if (r.r === 'notAll') hint('train_not_all', 'hint');
    else if (r.r === 'fillFirst') hint('train_fill_first', 'hint');
    else if (r.r === 'wrong') hint('train_again', 'hint');
    else if (r.r === 'right' && p && commit(r.s)) hint(`train_right_${p.id.slice(-2)}`, 'ok');
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextTrain(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    setSel(null);
    g.speaker.stop();
    say(finishedT(n) ? 'train_done' : 'train_task');
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedT(s) ? playAgainT(s) : restartTrain(s))) return;
    setMsg(null);
    setSel(null);
    g.speaker.stop();
  };
  const toggleVoice = () => {
    if (viewer) return;
    if (s.voice) g.speaker.stop();
    commit({ ...s, voice: !s.voice });
  };

  const zones = useZones<Zone>();
  const allZones = useMemo<Zone[]>(() => ['platform', 'car-0', 'car-1'], []);
  const dragger = useDragPlace<Zone>({
    enabled: !viewer && !s.solved,
    targets: () => zones.measure(allZones),
    onDrop: (i, z) => move(i, spotOf(z)),
    onAmbiguous: (i) => {
      setSel(i);
      hint('train_where', 'info');
    },
    onStart: () => setSel(null),
  });
  const hot = dragger.hot;
  const cancelDrag = dragger.cancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSel(null);
        cancelDrag();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelDrag]);

  const canGo = (z: Zone) => sel !== null && s.at[sel] !== spotOf(z);
  const lit = (z: Zone) => hot === z || (sel !== null && hot === null && canGo(z));
  const zoneAttrs = (z: Zone) => ({
    ref: zones.ref(z),
    'data-target': z,
    'data-testid': `mi-zone-${z}`,
    'data-hot': lit(z) ? 'true' : 'false',
    onClick: () => sel !== null && canGo(z) && move(sel, spotOf(z)),
  });
  const rider = (i: number) => (
    <button
      key={i}
      type="button"
      className="mi-apple mi-rider"
      data-testid={`mi-item-${i}`}
      data-at={s.at[i]}
      aria-pressed={sel === i}
      aria-label={tr(T.rider, { n: i + 1, w: s.at[i] === PLATFORM ? tr(T.onPlatform) : tr(T.inCar, { n: s.at[i] + 1 }) })}
      disabled={viewer || s.solved}
      {...dragger.bind(i)}
      onClick={(e) => {
        e.stopPropagation();
        if (dragger.wasDrag(i) || viewer || s.solved) return;
        // holding another rider: tapping a rider in a car (or on the platform) seats the held one there
        if (sel !== null && sel !== i && canGo(zoneOf(s.at[i]))) return move(sel, s.at[i]);
        setSel((v) => (v === i ? null : i));
      }}
    >
      <RiderArt />
    </button>
  );

  /** a car is a ten-frame: 2 rows of 5 seats, the riders already seated first, then the ones who boarded */
  const car = (k: 0 | 1) => {
    if (!p) return null;
    const z = zoneOf(k);
    const fixed = k === 0 ? p.a : 0;
    const boarded = s.at.map((spot, i) => (spot === k ? i : -1)).filter((i) => i >= 0);
    const n = fixed + boarded.length;
    return (
      <div {...zoneAttrs(z)} className="mi-zone mi-car flex flex-col p-3" aria-label={`${tr(T.car, { n: k + 1 })}，${tr(T.seats, { n })}`}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-lg font-extrabold">{tr(T.car, { n: k + 1 })}</p>
          <p className="text-base font-bold" data-testid={`mi-car-${k}-count`}>
            {n === CAR ? tr(T.full) : tr(T.seats, { n })}
          </p>
        </div>
        <div className="mx-auto grid w-fit grid-cols-5 gap-1.5">
          {Array.from({ length: CAR }, (_, seat) => {
            const filled = seat < n;
            return (
              <div key={seat} className="mi-seat" data-filled={filled}>
                {seat < fixed ? <RiderArt fixed size={40} /> : seat < n ? rider(boarded[seat - fixed]) : null}
              </div>
            );
          })}
        </div>
        {lit(z) && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
      </div>
    );
  };

  return (
    <Page testid="mi-train" data={{ index: s.index, solved: s.solved, role: prog.role }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={TRAIN_PROBLEMS.length} finished={finishedT(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedT(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2">
            {TRAIN_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {q.a} + {q.b} = {q.a + q.b}
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
              <p className="mi-task" data-testid="mi-task" lang="zh-Hant">
                {s.solved ? (p.a + p.b === 10 ? `${p.a} + ${p.b} = 10` : `${p.a} + ${p.b} = 10 + ${p.a + p.b - 10} = ${p.a + p.b}`) : allBoarded(s) ? CLIPS.train_ask : `${p.a} + ${p.b} = ?`}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>
            {!s.solved && !allBoarded(s) && (
              <p className="text-lg font-bold" lang="zh-Hant">
                {CLIPS.train_task}
              </p>
            )}

            <section className="flex flex-col gap-4" aria-label={tr(T.title)} data-testid="mi-stage">
              <div className="grid gap-4 md:grid-cols-2" data-c1={c1} data-c2={c2}>
                {car(0)}
                {car(1)}
              </div>
              <p className="sr-only">{tr(T.seated, { n: p.a })}</p>
              <div {...zoneAttrs('platform')} className="mi-zone bg-[var(--mi-surface)] p-3">
                <p className="mb-2 text-center text-lg font-extrabold">{tr(T.platform)}</p>
                <div className="mx-auto grid min-h-[56px] w-fit grid-cols-4 gap-2 sm:grid-cols-8">
                  {s.at.map((spot, i) => (
                    <div key={i} className="mi-cslot">
                      {spot === PLATFORM ? rider(i) : null}
                    </div>
                  ))}
                </div>
                {lit('platform') && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
              </div>
            </section>

            {s.index === 0 && !demoSeen && s.at.every((x) => x === PLATFORM) && (
              <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                {tr(T.demo)}
              </p>
            )}

            {sel !== null && !s.solved && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-sea)] bg-[var(--mi-surface)] p-3" data-testid="mi-held">
                <p className="w-full font-bold sm:w-auto sm:flex-1">{tr(T.held)}</p>
                {[0, 1].map((k) => (
                  <button key={k} type="button" className="mi-btn mi-btn-primary" onClick={() => move(sel, k)} disabled={s.at[sel] === k} data-testid={`mi-to-car-${k}`}>
                    {tr(T.toCar, { n: k + 1 })}
                  </button>
                ))}
                <button type="button" className="mi-btn" onClick={() => move(sel, PLATFORM)} disabled={s.at[sel] === PLATFORM} data-testid="mi-to-platform">
                  {tr(T.toPlatform)}
                </button>
                <button type="button" className="mi-btn" onClick={() => setSel(null)}>
                  {tr(S.cancel)}
                </button>
              </div>
            )}

            <Feedback msg={msg} />

            {s.solved ? (
              <div>
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={goNext} disabled={viewer} data-testid="mi-next">
                  {tr(S.next)}
                </button>
              </div>
            ) : (
              <fieldset className="flex flex-col gap-2" disabled={viewer}>
                <legend className="mb-2 text-lg font-bold">{tr(T.answers)}</legend>
                <div className="flex flex-wrap gap-4">
                  {choicesOfT(p, s.index).map((n) => (
                    <button key={n} type="button" className="mi-btn mi-big w-20 text-3xl" onClick={() => answer(n)} data-testid={`mi-answer-${n}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )
      )}
    </Page>
  );
}

export function IslandLink() {
  const { tr, to } = useTr();
  return (
    <Link to={to('/math')} className="mi-btn">
      {tr(S.island)}
    </Link>
  );
}
