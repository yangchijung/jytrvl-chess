// Math Island batch B — Multiplication Garden (/math/g2/garden). Task: pull out a rectangle of flowers from the
// top-left corner (press a square and drag; a tap plants up to that square), then press "plant". For "rows of
// so many" problems the total is picked after; the equation is "flowers in each row × rows" (Taiwanese textbook
// order). The steppers and the arrow keys change the rectangle too. After a right answer "turn" shows 3 × 4 = 4 × 3.
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  GARDEN_KEY,
  GARDEN_PROBLEMS,
  GRID,
  answerGarden,
  blankGarden,
  choicesOfG,
  expr,
  finishedG,
  nextGarden,
  plant,
  playAgainG,
  problemOfG,
  readGarden,
  restartGarden,
  sizeTo,
  validGarden,
  waysOf,
  type GardenSave,
} from '../../shared/math/garden';
import { CLIPS } from './audio';
import { FlowerArt } from './art';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import { IslandLink } from './train-page';
import './math.css';

const T = {
  title: { zh: '乘法花圃', en: 'Multiplication Garden' },
  sub: { zh: '二年級．幾個一樣多', en: 'Grade 2 · equal rows' },
  bed: { zh: '花圃，按住左上角往外拉', en: 'Flower bed: press and pull out from the top-left corner' },
  size: { zh: '每排 {c} 朵，{r} 排', en: '{c} in each row, {r} rows' },
  empty: { zh: '還沒有種花', en: 'Nothing planted yet' },
  perRow: { zh: '每排朵數', en: 'In each row' },
  rows: { zh: '排數', en: 'Rows' },
  less: { zh: '少一', en: 'One less' },
  more: { zh: '多一', en: 'One more' },
  plant: { zh: '種下去', en: 'Plant' },
  demo: { zh: '按住花圃左上角的格子往右下拉，拉到哪裡就種到哪裡；也可以直接點一格，或用下面的「多一／少一」。', en: 'Press the top-left square and pull towards the bottom right; or tap a square, or use “one more / one less” below.' },
  answers: { zh: '一共有幾朵花？選一個數字', en: 'How many flowers? Pick a number' },
  found: { zh: '找到的種法：', en: 'Ways found:' },
  turn: { zh: '轉一下', en: 'Turn it' },
  same: { zh: '轉過來是 {e} = {n}，花一樣多。', en: 'Turned round it is {e} = {n}: the same number of flowers.' },
} satisfies Record<string, L>;

const CELL = 'min(40px, calc((100vw - 72px) / 8))';

export function GardenPage() {
  const { tr } = useTr();
  const g = useGame<GardenSave>({ key: GARDEN_KEY, read: readGarden, blank: () => blankGarden(), valid: validGarden });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfG(s);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);
  const [live, setLive] = useState<{ r: number; c: number } | null>(null);
  const [turned, setTurned] = useState(false);
  const pulling = useRef<number | null>(null);
  const bed = useRef<HTMLDivElement>(null);
  const rows = live?.r ?? s.rows;
  const cols = live?.c ?? s.cols;
  const enabled = !viewer && !!p && !s.solved && !s.planted;

  const currentClip = () => {
    if (finishedG(s)) return 'garden_done';
    if (!p) return '';
    if (s.solved) return `garden_right_${p.id.slice(-2)}`;
    return s.planted ? 'garden_ask' : `garden_task_${p.id.slice(-2)}`;
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const hint = (id: string, kind: 'info' | 'hint' | 'ok') => {
    setMsg({ text: CLIPS[id], kind });
    say(id);
  };
  const resize = (r: number, c: number) => {
    if (!enabled) return;
    const x = sizeTo(s, r, c);
    if (x.r !== 'sized' || !commit(x.s)) return;
    setDemoSeen(true);
    setMsg(null);
  };
  const doPlant = () => {
    if (viewer || !p) return;
    const x = plant(s);
    if (x.r === 'notYet') hint('garden_not_planted', 'hint');
    else if (x.r === 'shape') hint('garden_shape', 'hint');
    else if (x.r === 'notEqual') hint('garden_not_equal', 'hint');
    else if (x.r === 'again') hint('garden_again', 'hint');
    else if (x.r === 'found' && commit(x.s)) hint(p.kind === 'make' ? 'garden_ask' : 'garden_found', 'info');
    else if (x.r === 'right' && commit(x.s)) hint(`garden_right_${p.id.slice(-2)}`, 'ok');
  };
  const answer = (n: number) => {
    if (viewer || !p) return;
    const x = answerGarden(s, n);
    if (x.r === 'notPlanted') hint('garden_not_planted', 'hint');
    else if (x.r === 'wrong') hint('garden_wrong', 'hint');
    else if (x.r === 'right' && commit(x.s)) hint(`garden_right_${p.id.slice(-2)}`, 'ok');
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextGarden(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    setTurned(false);
    g.speaker.stop();
    const q = problemOfG(n);
    say(finishedG(n) || !q ? 'garden_done' : `garden_task_${q.id.slice(-2)}`);
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedG(s) ? playAgainG(s) : restartGarden(s))) return;
    setMsg(null);
    setTurned(false);
    g.speaker.stop();
  };
  const toggleVoice = () => {
    if (viewer) return;
    if (s.voice) g.speaker.stop();
    commit({ ...s, voice: !s.voice });
  };

  // ---------- pulling the rectangle: the square under the finger is the bottom-right corner ----------
  const cellAt = (e: { clientX: number; clientY: number }) => {
    const el = bed.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const w = b.width / GRID,
      h = b.height / GRID;
    const c = Math.floor((e.clientX - b.left) / w) + 1,
      r = Math.floor((e.clientY - b.top) / h) + 1;
    return { r: Math.max(1, Math.min(GRID, r)), c: Math.max(1, Math.min(GRID, c)) };
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!enabled || pulling.current !== null || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pulling.current = e.pointerId;
    setLive(cellAt(e));
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (pulling.current !== e.pointerId) return;
    const c = cellAt(e);
    if (c && (c.r !== live?.r || c.c !== live?.c)) setLive(c);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (pulling.current !== e.pointerId) return;
    pulling.current = null;
    const c = cellAt(e);
    setLive(null);
    if (c) resize(c.r, c.c);
  };
  const onCancel = () => {
    pulling.current = null;
    setLive(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!enabled) return;
    const d: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const k = d[e.key];
    if (!k) return;
    e.preventDefault();
    resize(Math.max(1, Math.max(s.rows, 1) + k[0]), Math.max(1, Math.max(s.cols, 1) + k[1]));
  };

  // what is drawn: after "turn" the bed shows the same flowers the other way round
  const dr = turned ? cols : rows;
  const dc = turned ? rows : cols;
  const split = p && p.kind === 'make' && p.split && s.planted && !turned ? p.split : 0;

  const stepper = (label: string, v: number, set: (n: number) => void, id: string) => (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="min-w-[4.5rem] text-base font-bold">{label}</span>
      <button type="button" className="mi-btn" onClick={() => set(v - 1)} disabled={!enabled || v <= 0} aria-label={`${label}${tr(T.less)}`} data-testid={`mi-${id}-less`}>
        −
      </button>
      <span className="w-8 text-center text-2xl font-extrabold" data-testid={`mi-${id}`}>
        {v}
      </span>
      <button type="button" className="mi-btn" onClick={() => set(v + 1)} disabled={!enabled || v >= GRID} aria-label={`${label}${tr(T.more)}`} data-testid={`mi-${id}-more`}>
        +
      </button>
    </div>
  );

  return (
    <Page testid="mi-garden" data={{ index: s.index, solved: s.solved, planted: s.planted, role: prog.role, rows, cols }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={GARDEN_PROBLEMS.length} finished={finishedG(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedG(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2">
            {GARDEN_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {q.kind === 'make' ? `${expr(q.cols, q.rows)} = ${q.cols * q.rows}` : `${q.total} = ${waysOf(q.total).map((w) => expr(Number(w.split('x')[0]), Number(w.split('x')[1]))).join(' = ')}`}
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
                {s.solved && p.kind === 'make'
                  ? turned
                    ? `${expr(p.rows, p.cols)} = ${p.cols * p.rows}`
                    : `${expr(p.cols, p.rows)} = ${p.cols * p.rows}`
                  : s.planted && p.kind === 'make'
                    ? `${expr(p.cols, p.rows)} = ?`
                    : CLIPS[`garden_task_${p.id.slice(-2)}`]}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>

            <section className="flex flex-col items-center gap-3 md:flex-row md:items-start md:justify-center md:gap-8" aria-label={tr(T.title)} data-testid="mi-stage">
              <div className="flex flex-col items-center gap-2">
                <p className="text-lg font-bold" data-testid="mi-size" aria-live="polite">
                  {rows && cols ? tr(T.size, { c: cols, r: rows }) : tr(T.empty)}
                </p>
                <div
                  ref={bed}
                  className="relative grid touch-none select-none rounded-lg border-[3px] border-[var(--mi-basket-line)] bg-[var(--mi-soil)] p-0.5"
                  style={{ gridTemplateColumns: `repeat(${GRID}, ${CELL})`, gridAutoRows: CELL, cursor: enabled ? 'crosshair' : 'default' }}
                  role="application"
                  aria-label={`${tr(T.bed)}。${rows && cols ? tr(T.size, { c: cols, r: rows }) : tr(T.empty)}`}
                  tabIndex={enabled ? 0 : -1}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onCancel}
                  onLostPointerCapture={onCancel}
                  onKeyDown={onKey}
                  data-testid="mi-bed"
                >
                  {Array.from({ length: GRID * GRID }, (_, k) => {
                    const r = Math.floor(k / GRID),
                      c = k % GRID;
                    const on = r < dr && c < dc;
                    const fence = split > 0 && c === split && r < dr;
                    return (
                      <div key={k} className={`flex items-center justify-center ${fence ? 'border-l-[3px] border-dashed border-[var(--mi-ink)]' : ''}`} style={{ outline: '1px solid color-mix(in srgb, var(--mi-basket-line) 45%, transparent)', outlineOffset: '-1px' }} data-on={on}>
                        {on ? <FlowerArt size={28} /> : null}
                      </div>
                    );
                  })}
                </div>
                {split > 0 && p.kind === 'make' && (
                  <p className="text-lg font-bold" data-testid="mi-split">
                    {expr(split, p.rows)} ＋ {expr(p.cols - split, p.rows)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {stepper(tr(T.perRow), s.cols, (n) => resize(Math.max(s.rows, n > 0 ? 1 : 0), n), 'cols')}
                {stepper(tr(T.rows), s.rows, (n) => resize(n, Math.max(s.cols, n > 0 ? 1 : 0)), 'rows')}
                {p.kind === 'ways' && (
                  <div data-testid="mi-found">
                    <p className="text-base font-bold">{tr(T.found)}</p>
                    <p className="text-2xl font-extrabold">{s.found.map((f) => expr(Number(f.split('x')[0]), Number(f.split('x')[1]))).join('、') || '—'}</p>
                  </div>
                )}
              </div>
            </section>

            {s.index === 0 && !demoSeen && s.rows === 0 && (
              <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                {tr(T.demo)}
              </p>
            )}

            <Feedback msg={msg} />
            {s.solved && turned && p.kind === 'make' && (
              <p className="text-xl font-bold" data-testid="mi-same">
                {tr(T.same, { e: expr(p.rows, p.cols), n: p.cols * p.rows })}
              </p>
            )}

            {s.solved ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={goNext} disabled={viewer} data-testid="mi-next">
                  {tr(S.next)}
                </button>
                {p.kind === 'make' && (
                  <button type="button" className="mi-btn mi-big px-6 text-2xl" aria-pressed={turned} onClick={() => setTurned((t) => !t)} data-testid="mi-turn">
                    {tr(T.turn)}
                  </button>
                )}
              </div>
            ) : s.planted && p.kind === 'make' ? (
              <fieldset className="flex flex-col gap-2" disabled={viewer}>
                <legend className="mb-2 text-lg font-bold">{tr(T.answers)}</legend>
                <div className="flex flex-wrap gap-4">
                  {choicesOfG(p, s.index).map((n) => (
                    <button key={n} type="button" className="mi-btn mi-big w-20 text-3xl" onClick={() => answer(n)} data-testid={`mi-answer-${n}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div>
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={doPlant} disabled={viewer} data-testid="mi-plant">
                  {tr(T.plant)}
                </button>
              </div>
            )}
          </>
        )
      )}
    </Page>
  );
}
