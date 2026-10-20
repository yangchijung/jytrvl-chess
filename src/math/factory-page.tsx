// Math Island M0-B — Packing Factory page (/math/g3/factory). Task: share every cookie on the conveyor into the
// boxes so each box has the same number, then pick how many are in each box. The conveyor and boxes are the
// main content; the answer is only accepted after everything is shared out and every box is equal (spec §3).
// Drag, tap-then-tap and keyboard all go through moveItem() and the shared drag controller (drag.ts).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FACTORY_KEY,
  FACTORY_PROBLEMS,
  SOURCE,
  allShared,
  answerFactory,
  blankFactory,
  choicesOfF,
  finishedF,
  moveItem,
  nextFactory,
  playAgainF,
  problemOfF,
  readFactory,
  restartFactory,
  validFactory,
  type FactorySave,
} from '../../shared/math/factory';
import { CLIPS } from './audio';
import { CookieArt } from './art';
import { useDragPlace, useZones } from './drag';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import './math.css';

const T = {
  title: { zh: '分裝工廠', en: 'Packing Factory' },
  sub: { zh: '三年級．平分到每一盒', en: 'Grade 3 · share equally into boxes' },
  belt: { zh: '輸送帶', en: 'Conveyor' },
  box: { zh: '第 {n} 盒', en: 'Box {n}' },
  dropHere: { zh: '放這裡', en: 'Put here' },
  cookie: { zh: '餅乾，第 {n} 片，{w}', en: 'Cookie {n}, {w}' },
  onBelt: { zh: '在輸送帶上', en: 'on the conveyor' },
  inBox: { zh: '在第 {n} 盒', en: 'in box {n}' },
  held: { zh: '拿起了一片餅乾，要放哪裡？', en: 'You picked up a cookie. Where should it go?' },
  toBox: { zh: '放進第 {n} 盒', en: 'Put in box {n}' },
  toBelt: { zh: '放回輸送帶', en: 'Back to the conveyor' },
  demo: { zh: '按住餅乾拖進盒子；也可以先點餅乾，再點盒子。每盒要一樣多。', en: 'Hold a cookie and drag it into a box, or tap a cookie and then a box. Every box gets the same number.' },
  answers: { zh: '每盒有幾個？選一個數字', en: 'How many in each box? Pick a number' },
  boxesLabel: { zh: '{n} 個盒子', en: '{n} boxes' },
} satisfies Record<string, L>;

type Zone = 'belt' | `box-${number}`;
const zoneOf = (spot: number): Zone => (spot === SOURCE ? 'belt' : `box-${spot}`);
const spotOf = (z: Zone): number => (z === 'belt' ? SOURCE : Number(z.slice(4)));

export function FactoryPage() {
  const { tr } = useTr();
  const g = useGame<FactorySave>({ key: FACTORY_KEY, read: readFactory, blank: () => blankFactory(), valid: validFactory });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfF(s);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);

  const currentClip = () => {
    if (finishedF(s)) return 'factory_done';
    if (s.solved && p) return `factory_right_${p.id.slice(-2)}`;
    return allShared(s) ? 'factory_ask' : 'factory_task';
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const hint = (id: string, kind: 'info' | 'hint' | 'ok') => {
    setMsg({ text: CLIPS[id], kind });
    say(id);
  };
  const move = (i: number, spot: number) => {
    if (viewer) return;
    const before = allShared(s);
    const r = moveItem(s, i, spot);
    setSel(null);
    if (r.r !== 'moved' || !commit(r.s)) return;
    setDemoSeen(true);
    setMsg(null);
    if (!before && allShared(r.s)) say('factory_ask');
  };
  const answer = (n: number) => {
    if (viewer) return;
    const r = answerFactory(s, n);
    if (r.r === 'notAll') hint('factory_not_all', 'hint');
    else if (r.r === 'unequal') hint('factory_unequal', 'hint');
    else if (r.r === 'wrong') hint('factory_again', 'hint');
    else if (r.r === 'right' && p && commit(r.s)) hint(`factory_right_${p.id.slice(-2)}`, 'ok');
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextFactory(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    setSel(null);
    g.speaker.stop();
    say(finishedF(n) ? 'factory_done' : 'factory_task');
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedF(s) ? playAgainF(s) : restartFactory(s))) return;
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
  const allZones = useMemo<Zone[]>(() => (p ? ['belt', ...Array.from({ length: p.boxes }, (_, k) => `box-${k}` as Zone)] : []), [p]);
  const dragger = useDragPlace<Zone>({
    enabled: !viewer && !s.solved,
    targets: () => zones.measure(allZones),
    onDrop: (i, z) => move(i, spotOf(z)),
    onAmbiguous: (i) => {
      setSel(i);
      hint('factory_where', 'info');
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
  const cookie = (i: number) => (
    <button
      key={i}
      type="button"
      className="mi-apple mi-cookie"
      data-testid={`mi-item-${i}`}
      data-at={s.at[i]}
      aria-pressed={sel === i}
      aria-label={tr(T.cookie, { n: i + 1, w: s.at[i] === SOURCE ? tr(T.onBelt) : tr(T.inBox, { n: s.at[i] + 1 }) })}
      disabled={viewer || s.solved}
      {...dragger.bind(i)}
      onClick={(e) => {
        e.stopPropagation();
        if (dragger.wasDrag(i) || viewer || s.solved) return;
        setSel((v) => (v === i ? null : i));
      }}
    >
      <CookieArt />
    </button>
  );

  return (
    <Page testid="mi-factory" data={{ index: s.index, solved: s.solved, role: prog.role }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={FACTORY_PROBLEMS.length} finished={finishedF(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedF(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2">
            {FACTORY_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {q.total} ÷ {q.boxes} = {q.total / q.boxes}
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
                {s.solved ? `${p.total} ÷ ${p.boxes} = ${p.total / p.boxes}` : allShared(s) ? CLIPS.factory_ask : CLIPS.factory_task}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>

            <section className="flex flex-col gap-4" aria-label={tr(T.title)} data-testid="mi-stage">
              <div {...zoneAttrs('belt')} className="mi-zone bg-[var(--mi-surface)] p-3">
                <p className="mb-2 text-center text-lg font-extrabold">{tr(T.belt)}</p>
                <div className="mx-auto grid w-fit grid-cols-4 gap-2 sm:grid-cols-6">
                  {s.at.map((spot, i) => (
                    <div key={i} className="mi-cslot">
                      {spot === SOURCE ? cookie(i) : null}
                    </div>
                  ))}
                </div>
                {lit('belt') && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
              </div>
              <div className={`grid gap-4 ${p.boxes === 3 ? 'sm:grid-cols-3' : 'grid-cols-2'}`} aria-label={tr(T.boxesLabel, { n: p.boxes })}>
                {Array.from({ length: p.boxes }, (_, k) => {
                  const z = zoneOf(k);
                  const inside = s.at.map((spot, i) => (spot === k ? i : -1)).filter((i) => i >= 0);
                  return (
                    <div key={k} {...zoneAttrs(z)} className="mi-zone mi-box flex min-h-[13rem] flex-col p-3">
                      <p className="mb-2 text-center text-lg font-extrabold">{tr(T.box, { n: k + 1 })}</p>
                      <div className="mx-auto grid w-fit grid-cols-3 gap-2">
                        {inside.map((i) => (
                          <div key={i} className="mi-cslot">
                            {cookie(i)}
                          </div>
                        ))}
                      </div>
                      {lit(z) && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
                    </div>
                  );
                })}
              </div>
            </section>

            {s.index === 0 && !demoSeen && s.at.every((x) => x === SOURCE) && (
              <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                {tr(T.demo)}
              </p>
            )}

            {sel !== null && !s.solved && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-sea)] bg-[var(--mi-surface)] p-3" data-testid="mi-held">
                <p className="w-full font-bold sm:w-auto sm:flex-1">{tr(T.held)}</p>
                {Array.from({ length: p.boxes }, (_, k) => (
                  <button key={k} type="button" className="mi-btn mi-btn-primary" onClick={() => move(sel, k)} disabled={s.at[sel] === k} data-testid={`mi-to-box-${k}`}>
                    {tr(T.toBox, { n: k + 1 })}
                  </button>
                ))}
                <button type="button" className="mi-btn" onClick={() => move(sel, SOURCE)} disabled={s.at[sel] === SOURCE} data-testid="mi-to-belt">
                  {tr(T.toBelt)}
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
                  {choicesOfF(p, s.index).map((n) => (
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

function IslandLink() {
  const { tr, to } = useTr();
  return (
    <Link to={to('/math')} className="mi-btn">
      {tr(S.island)}
    </Link>
  );
}
