// Math Island batch A — Balance Scale (/math/g1/balance). Task: put blocks in the pan with the box until both
// sides weigh the same, then press "done". The scale tilts by how much one side is heavier (capped), so "how
// far off" is visible without a number. The equation shows □ until the scale is level. Drag, tap-then-tap and
// keyboard all go through moveBlock() and the shared drag controller (drag.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BALANCE_KEY,
  BALANCE_PROBLEMS,
  BIN,
  PAN,
  blankBalance,
  checkBalance,
  equation,
  finishedB,
  inPan,
  moveBlock,
  nextBalance,
  playAgainB,
  problemOfB,
  readBalance,
  restartBalance,
  validBalance,
  weights,
  type BalanceSave,
  type Term,
} from '../../shared/math/balance';
import { CLIPS } from './audio';
import { BlockArt } from './art';
import { useDragPlace, useZones } from './drag';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import { IslandLink } from './train-page';
import './math.css';

const T = {
  title: { zh: '天平等一等', en: 'Balance Scale' },
  sub: { zh: '一、二年級．等號兩邊一樣多', en: 'Grades 1–2 · both sides of = are the same' },
  left: { zh: '左邊', en: 'Left' },
  right: { zh: '右邊', en: 'Right' },
  box: { zh: '□ 放這裡', en: 'Fill □ here' },
  bin: { zh: '積木箱', en: 'Block box' },
  dropHere: { zh: '放這裡', en: 'Put here' },
  block: { zh: '積木，第 {n} 塊，{w}', en: 'Block {n}, {w}' },
  inBin: { zh: '在積木箱', en: 'in the block box' },
  inPanW: { zh: '在盤子裡', en: 'in the pan' },
  held: { zh: '拿起了一塊積木，要放哪裡？', en: 'You picked up a block. Where should it go?' },
  toPan: { zh: '放進盤子', en: 'Put in the pan' },
  toBin: { zh: '放回積木箱', en: 'Back to the box' },
  demo: { zh: '按住積木拖到有 □ 的盤子；也可以先點積木，再點盤子。兩邊一樣重時按「秤好了」。', en: 'Hold a block and drag it into the pan with □, or tap a block and then the pan. Press Done when both sides are level.' },
  done: { zh: '秤好了', en: 'Done' },
  tilt: { zh: '天平：{s}', en: 'Scale: {s}' },
  level: { zh: '兩邊一樣重', en: 'level' },
  heavyL: { zh: '左邊比較重', en: 'left side is heavier' },
  heavyR: { zh: '右邊比較重', en: 'right side is heavier' },
  group: { zh: '{n} 塊', en: '{n} blocks' },
} satisfies Record<string, L>;

type Zone = 'pan' | 'bin';
const spotOf = (z: Zone) => (z === 'pan' ? PAN : BIN);
/** degrees per block of difference, and the cap, so a big difference does not throw the pans off screen */
const DEG = 3;
const MAX_DEG = 12;

export function BalancePage() {
  const { tr } = useTr();
  const g = useGame<BalanceSave>({ key: BALANCE_KEY, read: readBalance, blank: () => blankBalance(), valid: validBalance });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfB(s);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);
  const scaleRef = useRef<HTMLDivElement>(null);
  const [scaleW, setScaleW] = useState(480);
  useEffect(() => {
    const el = scaleRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setScaleW(el.clientWidth));
    ro.observe(el);
    setScaleW(el.clientWidth);
    return () => ro.disconnect();
  }, [p?.id]);

  const currentClip = () => {
    if (finishedB(s)) return 'balance_done';
    if (s.solved && p) return `balance_right_${p.id.slice(-2)}`;
    return 'balance_task';
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const move = (i: number, spot: number) => {
    if (viewer) return;
    const r = moveBlock(s, i, spot);
    setSel(null);
    if (r.r !== 'moved' || !commit(r.s)) return;
    setDemoSeen(true);
    setMsg(null);
  };
  const check = () => {
    if (viewer || !p) return;
    const r = checkBalance(s);
    if (r.r === 'leftHeavy' || r.r === 'rightHeavy') {
      setMsg({ text: CLIPS.balance_not_level, kind: 'hint' });
      say('balance_not_level');
    } else if (r.r === 'right' && commit(r.s)) {
      const id = `balance_right_${p.id.slice(-2)}`;
      setMsg({ text: CLIPS[id], kind: 'ok' });
      say(id);
    }
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextBalance(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    setSel(null);
    g.speaker.stop();
    say(finishedB(n) ? 'balance_done' : 'balance_task');
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedB(s) ? playAgainB(s) : restartBalance(s))) return;
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
  const allZones = useMemo<Zone[]>(() => ['pan', 'bin'], []);
  const dragger = useDragPlace<Zone>({
    enabled: !viewer && !s.solved,
    targets: () => zones.measure(allZones),
    onDrop: (i, z) => move(i, spotOf(z)),
    onAmbiguous: (i) => {
      setSel(i);
      setMsg({ text: CLIPS.balance_where, kind: 'info' });
      say('balance_where');
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
  const block = (i: number) => (
    <button
      key={i}
      type="button"
      className="mi-apple mi-block"
      data-testid={`mi-item-${i}`}
      data-at={s.at[i]}
      aria-pressed={sel === i}
      aria-label={tr(T.block, { n: i + 1, w: s.at[i] === BIN ? tr(T.inBin) : tr(T.inPanW) })}
      disabled={viewer || s.solved}
      {...dragger.bind(i)}
      onClick={(e) => {
        e.stopPropagation();
        if (dragger.wasDrag(i) || viewer || s.solved) return;
        if (sel !== null && sel !== i && s.at[i] !== s.at[sel]) return move(sel, s.at[i]);
        setSel((x) => (x === i ? null : i));
      }}
    >
      <BlockArt size={40} />
    </button>
  );

  const w = weights(s);
  const diff = w.left - w.right;
  const deg = Math.max(-MAX_DEG, Math.min(MAX_DEG, -diff * DEG)); // left heavier: the left end goes down
  // the beam runs between the two pan centres (a quarter of the width from each side), so its ends move by sin·W/4
  const drop = Math.round(Math.sin((deg * Math.PI) / 180) * (scaleW / 4));
  /** room above and below for the largest tilt, so a raised or lowered pan never covers the text around it */
  const room = Math.ceil(Math.sin((MAX_DEG * Math.PI) / 180) * (scaleW / 4));
  const tiltText = diff === 0 ? tr(T.level) : diff > 0 ? tr(T.heavyL) : tr(T.heavyR);
  const pans = s.at.map((a, i) => (a === PAN ? i : -1)).filter((i) => i >= 0);

  /** one fixed number on a pan: its blocks in rows of five, with the number under them */
  const fixedGroup = (n: number, k: number) => (
    <div key={k} className="flex flex-col items-center gap-1" aria-label={tr(T.group, { n })} role="img">
      <div className="grid grid-cols-5 gap-0.5">
        {Array.from({ length: n }, (_, j) => (
          <BlockArt key={j} size={20} fixed />
        ))}
      </div>
      <span className="text-xl font-extrabold">{n}</span>
    </div>
  );
  const pan = (side: 'left' | 'right') => {
    if (!p) return null;
    const terms: Term[] = side === 'left' ? p.left : p.right;
    const dy = side === 'left' ? -drop : drop;
    return (
      <div className="mi-pan relative z-10 flex min-w-0 flex-col items-center" style={{ transform: `translateY(${dy}px)` }} data-testid={`mi-pan-${side}`}>
        {/* the hanger: from the beam end down to the pan */}
        <div className="h-10 w-[3px] bg-[var(--mi-ink)]" aria-hidden="true" />
        <div className="h-[3px] w-4/5 bg-[var(--mi-ink)]" aria-hidden="true" />
        <div className="flex min-h-[8.5rem] w-full flex-wrap items-end justify-center gap-2 rounded-b-[2.5rem] border-[3px] border-t-0 border-[var(--mi-basket-line)] bg-[var(--mi-basket)] px-1.5 pb-3 pt-2">
          {terms.map((t, k) =>
            t === 'x' ? (
              <div key={k} {...zoneAttrs('pan')} className="mi-zone flex min-h-[6.5rem] w-[9.25rem] max-w-full flex-col items-center bg-[var(--mi-surface)] p-1" role="group" aria-label={`${tr(T.box)}，${tr(T.group, { n: pans.length })}`}>
                <span className="text-2xl font-extrabold leading-tight">{s.solved ? inPan(s) : '□'}</span>
                <div className="grid grid-cols-3 gap-1">{pans.map((i) => block(i))}</div>
                {lit('pan') && <span className="absolute -top-6 right-0 text-sm font-bold">{tr(T.dropHere)}</span>}
              </div>
            ) : (
              fixedGroup(t, k)
            ),
          )}
        </div>
        <p className="mt-1 text-base font-bold">{tr(side === 'left' ? T.left : T.right)}</p>
      </div>
    );
  };

  return (
    <Page testid="mi-balance" data={{ index: s.index, solved: s.solved, role: prog.role, tilt: diff }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={BALANCE_PROBLEMS.length} finished={finishedB(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedB(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2">
            {BALANCE_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {equation(q, true)}
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
              <p className="mi-task" data-testid="mi-task">
                {equation(p, s.solved)}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>

            <section className="flex flex-col gap-4" aria-label={tr(T.title)} data-testid="mi-stage">
              <div className="relative px-1" role="group" aria-label={tr(T.tilt, { s: tiltText })}>
                <p className="sr-only" aria-live="polite" data-testid="mi-tilt">
                  {tr(T.tilt, { s: tiltText })}
                </p>
                {/* a post in the middle, the beam between the two pan centres, the pans hanging from its ends */}
                <div ref={scaleRef} className="relative grid grid-cols-2 gap-3" style={{ paddingTop: room + 12, paddingBottom: room + 40 }}>
                  <div className="absolute bottom-0 left-1/2 w-3 -translate-x-1/2 bg-[var(--mi-ink)]" style={{ top: room + 12 }} aria-hidden="true" />
                  <div className="absolute bottom-0 left-1/2 h-3 w-40 -translate-x-1/2 rounded bg-[var(--mi-ink)]" aria-hidden="true" />
                  <div className="mi-beam absolute left-1/4 h-3 w-1/2 rounded bg-[var(--mi-ink)]" style={{ top: room + 6, transform: `rotate(${deg}deg)` }} aria-hidden="true" />
                  <div className="absolute left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-[3px] border-[var(--mi-ink)] bg-[var(--mi-sand)]" style={{ top: room }} aria-hidden="true" />
                  {pan('left')}
                  {pan('right')}
                </div>
              </div>
              <div {...zoneAttrs('bin')} className="mi-zone bg-[var(--mi-surface)] p-3" role="group" aria-label={tr(T.bin)}>
                <p className="mb-2 text-center text-lg font-extrabold">{tr(T.bin)}</p>
                <div className="mx-auto grid w-fit grid-cols-5 gap-2">
                  {s.at.map((a, i) => (
                    <div key={i} className="flex h-12 w-12 items-center justify-center">
                      {a === BIN ? block(i) : null}
                    </div>
                  ))}
                </div>
                {lit('bin') && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
              </div>
            </section>

            {s.index === 0 && !demoSeen && s.at.every((x) => x === BIN) && (
              <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                {tr(T.demo)}
              </p>
            )}

            {sel !== null && !s.solved && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-sea)] bg-[var(--mi-surface)] p-3" data-testid="mi-held">
                <p className="w-full font-bold sm:w-auto sm:flex-1">{tr(T.held)}</p>
                <button type="button" className="mi-btn mi-btn-primary" onClick={() => move(sel, PAN)} disabled={s.at[sel] === PAN} data-testid="mi-to-pan">
                  {tr(T.toPan)}
                </button>
                <button type="button" className="mi-btn" onClick={() => move(sel, BIN)} disabled={s.at[sel] === BIN} data-testid="mi-to-bin">
                  {tr(T.toBin)}
                </button>
                <button type="button" className="mi-btn" onClick={() => setSel(null)}>
                  {tr(S.cancel)}
                </button>
              </div>
            )}

            <Feedback msg={msg} />

            <div>
              {s.solved ? (
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={goNext} disabled={viewer} data-testid="mi-next">
                  {tr(S.next)}
                </button>
              ) : (
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={check} disabled={viewer} data-testid="mi-check">
                  {tr(T.done)}
                </button>
              )}
            </div>
          </>
        )
      )}
    </Page>
  );
}
