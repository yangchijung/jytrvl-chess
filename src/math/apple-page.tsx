// Math Island — Apple Basket (/math/g1/apple) for children who cannot read yet. Two trees hold the two groups;
// the child drags every apple into the basket (each one is counted aloud), then drags the right number card
// onto the basket (a tap on a card works too). No words on screen: a looping finger shows the first drag, the
// otter hops and a star flies to the progress dots for a right answer, a wrong card bounces back with a small
// shake, and after three wrong cards the finger shows the right one. Same save and rules as before
// (shared/math/apple.ts): the answer only counts once both groups are in the basket.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLE_KEY,
  APPLE_PROBLEMS,
  allIn,
  answerApple,
  blankApple,
  choicesOf,
  finished,
  inBasket,
  itemsOf,
  moveApple,
  nextApple,
  playAgain,
  problemOf,
  readApple,
  restartApple,
  validApple,
  type AppleItem,
  type AppleSave,
  type Group,
  type Place,
} from '../../shared/math/apple';
import { AppleArt } from './art';
import { useDragPlace, useZones } from './drag';
import { HandDemo, KidBar, NextIcon, Otter, RestartIcon, StarFlight, StarShape, sfx, shake } from './kid';
import { Notices, useGame, useTr, type L } from './shell';
import './math.css';

const A11Y = {
  title: { zh: '蘋果籃', en: 'Apple Basket' },
  treeA: { zh: '第一棵樹', en: 'First tree' },
  treeB: { zh: '第二棵樹', en: 'Second tree' },
  basket: { zh: '籃子，裡面有 {n} 顆', en: 'Basket, {n} inside' },
  apple: { zh: '蘋果，{w}', en: 'Apple, {w}' },
  onTree: { zh: '在樹上', en: 'on the tree' },
  inBasketW: { zh: '在籃子裡', en: 'in the basket' },
  card: { zh: '數字卡 {n}', en: 'Number card {n}' },
  cards: { zh: '一共幾顆？選一張數字卡', en: 'How many altogether? Pick a number card' },
  next: { zh: '下一題', en: 'Next' },
  again: { zh: '再玩一次', en: 'Play again' },
  done: { zh: '五題都完成了', en: 'All five done' },
} satisfies Record<string, L>;

type Zone = 'tree-a' | 'tree-b' | 'basket';
const MAXS = 4;
/** where the apples hang on a tree canopy (percent of the canopy box) */
const HANG = [
  [29, 29],
  [71, 29],
  [29, 71],
  [71, 71],
];

export function ApplePage() {
  const { tr } = useTr();
  const g = useGame<AppleSave>({ key: APPLE_KEY, read: readApple, blank: () => blankApple(), valid: validApple });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOf(s);
  const items = useMemo(() => (p ? itemsOf(p) : []), [p]);
  const [sel, setSel] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [star, setStar] = useState(0);
  const [hop, setHop] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const basketRef = useRef<HTMLDivElement | null>(null);
  const firstApple = useRef<HTMLButtonElement | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightCard = useRef<HTMLButtonElement | null>(null);
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const queued = useRef<string | null>(null);

  // a clip that should follow the one playing now (the count, then "how many?")
  useEffect(() => {
    if (audio !== 'playing' && queued.current) {
      const id = queued.current;
      queued.current = null;
      say(id);
    }
  }, [audio, say]);

  const taskClip = () => (finished(s) ? 'apple_done' : s.solved && p ? `apple_right_${p.id.slice(-2)}` : allIn(s) ? 'apple_card' : 'apple_task');
  // the first prompt plays by itself when the child has just tapped (on the island or here)
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua?.hasBeenActive && prog.v.voice) say(taskClip());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (i: number, place: Place) => {
    if (viewer) return;
    const before = allIn(s);
    const r = moveApple(s, i, place);
    setSel(null);
    if (r.r !== 'moved' || !commit(r.s)) return;
    if (place === 'basket') {
      if (r.s.voice) sfx.pop();
      say(`n_${inBasket(r.s)}`);
      if (!before && allIn(r.s)) queued.current = 'apple_card';
    }
  };
  const answer = (n: number, el: HTMLElement | null) => {
    if (viewer || !p) return;
    const r = answerApple(s, n);
    if (r.r === 'wrong') {
      shake(el);
      if (s.voice) sfx.bump();
      say('apple_again');
      setWrong((w) => w + 1);
    } else if (r.r === 'right' && commit(r.s)) {
      if (s.voice) sfx.ding();
      setStar((k) => k + 1);
      setHop((k) => k + 1);
      setWrong(0);
      queued.current = null;
      say(`apple_right_${p.id.slice(-2)}`);
    }
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextApple(s);
    if (n === s || !commit(n)) return;
    setSel(null);
    setWrong(0);
    g.speaker.stop();
    say(finished(n) ? 'apple_done' : 'apple_task');
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finished(s) ? playAgain(s) : restartApple(s))) return;
    setSel(null);
    setWrong(0);
    g.speaker.stop();
  };
  const toggleVoice = () => {
    if (viewer) return;
    if (s.voice) g.speaker.stop();
    commit({ ...s, voice: !s.voice });
  };

  // ---------- apples: drag to the basket or back to their own tree; tap-then-tap and keyboard do the same ----------
  const zones = useZones<Zone>();
  const appleDrag = useDragPlace<Zone>({
    enabled: !viewer && !s.solved,
    targets: (i) => {
      const it = items[i];
      return it ? zones.measure([it.group === 'a' ? 'tree-a' : 'tree-b', 'basket']) : [];
    },
    onDrop: (i, z) => move(i, z === 'basket' ? 'basket' : 'pile'),
    onAmbiguous: (i) => setSel(i),
    onStart: () => {
      setSel(null);
      setTouched(true);
    },
  });
  const canGo = (z: Zone) => {
    if (sel === null) return false;
    const it = items[sel];
    if (!it) return false;
    if (z === 'basket') return s.at[sel] !== 'basket';
    return s.at[sel] === 'basket' && ((z === 'tree-a' && it.group === 'a') || (z === 'tree-b' && it.group === 'b'));
  };
  const onZone = (z: Zone) => sel !== null && canGo(z) && move(sel, z === 'basket' ? 'basket' : 'pile');
  const lit = (z: Zone) => appleDrag.hot === z || (sel !== null && appleDrag.hot === null && canGo(z));

  // ---------- number cards: drag onto the basket, or just tap one ----------
  const choices = p ? choicesOf(p, s.index) : [];
  const cardDrag = useDragPlace<'basket'>({
    enabled: !viewer && !s.solved && allIn(s),
    targets: () => zones.measure(['basket']) as { id: 'basket'; box: { left: number; top: number; right: number; bottom: number } }[],
    onDrop: (i) => answer(choices[i], cardRefs.current[i]),
    onAmbiguous: () => undefined,
    onStart: () => setTouched(true),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSel(null);
        appleDrag.cancel();
        cardDrag.cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appleDrag, cardDrag]);

  const apple = (it: AppleItem) => (
    <button
      key={it.i}
      ref={it.i === 0 ? firstApple : undefined}
      type="button"
      className="mi-apple"
      data-testid={`mi-apple-${it.i}`}
      data-group={it.group}
      data-at={s.at[it.i]}
      aria-pressed={sel === it.i}
      aria-label={tr(A11Y.apple, { w: tr(s.at[it.i] === 'basket' ? A11Y.inBasketW : A11Y.onTree) })}
      disabled={viewer || s.solved}
      {...appleDrag.bind(it.i)}
      onClick={(e) => {
        e.stopPropagation();
        setTouched(true);
        if (appleDrag.wasDrag(it.i) || viewer || s.solved) return;
        if (sel !== null && sel !== it.i) {
          const z: Zone = s.at[it.i] === 'basket' ? 'basket' : it.group === 'a' ? 'tree-a' : 'tree-b';
          if (canGo(z)) return onZone(z);
        }
        setSel((v) => (v === it.i ? null : it.i));
      }}
    >
      <AppleArt />
    </button>
  );
  const zoneProps = (z: Zone, label: string) => ({
    ref: (el: HTMLDivElement | null) => {
      zones.ref(z)(el);
      if (z === 'basket') basketRef.current = el;
    },
    'data-target': z,
    'data-testid': `mi-zone-${z}`,
    'data-hot': lit(z) ? 'true' : 'false',
    role: 'button',
    tabIndex: sel !== null && canGo(z) ? 0 : -1,
    'aria-label': label,
    onClick: () => onZone(z),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // a key on an apple inside belongs to the apple
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onZone(z);
      }
    },
  });

  const tree = (grp: Group) => {
    if (!p) return null;
    const z: Zone = grp === 'a' ? 'tree-a' : 'tree-b';
    const mine = items.filter((it) => it.group === grp);
    return (
      <div className="flex flex-col items-center">
        <div {...zoneProps(z, tr(grp === 'a' ? A11Y.treeA : A11Y.treeB))} className="mi-tree relative h-[160px] w-[160px] rounded-full sm:h-[240px] sm:w-[240px] border-[3px] border-[#23303F] bg-[#3D7A3F]">
          {mine.map((it) => (
            <div key={it.i} className="absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ left: `${HANG[it.slot][0]}%`, top: `${HANG[it.slot][1]}%` }}>
              {s.at[it.i] === 'pile' ? apple(it) : <span className="h-10 w-10 rounded-full border-[3px] border-dashed border-[#FFF4E3] opacity-60" aria-hidden="true" />}
            </div>
          ))}
        </div>
        <div className="h-12 w-7 border-x-[3px] sm:h-20 sm:w-9 border-b-[3px] border-[#23303F] bg-[#7A5A2E]" aria-hidden="true" />
      </div>
    );
  };
  const half = (grp: Group) => (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: MAXS }, (_, k) => {
        const it = items.find((x) => x.group === grp && x.slot === k);
        return (
          <div key={k} className="mi-slot">
            {it && s.at[it.i] === 'basket' ? apple(it) : null}
          </div>
        );
      })}
    </div>
  );

  const doneIdx = APPLE_PROBLEMS.map((q, k) => (s.done.includes(q.id) ? k : -1)).filter((k) => k >= 0);
  const firstDemo = !touched && s.index === 0 && !s.solved && s.at.every((x) => x === 'pile');
  const correctIdx = p ? choices.indexOf(p.a + p.b) : -1;

  return (
    <div className="mi min-h-dvh" data-testid="mi-apple" data-index={s.index} data-solved={s.solved} data-role={prog.role} data-wrong={wrong}>
      <h1 className="sr-only">{tr(A11Y.title)}</h1>
      <KidBar back="island" total={APPLE_PROBLEMS.length} index={s.index} done={doneIdx} voice={s.voice} onSpeak={() => say(taskClip(), true)} onVoice={toggleVoice} onRestart={finished(s) ? undefined : restart} dotRef={dotRef} />
      <div className="mx-auto max-w-[1180px] px-3 sm:px-5">
        <Notices prog={prog} audio={audio === 'missing' || audio === 'blocked' ? 'idle' : audio} />
      </div>
      <div ref={stage} className="relative mx-auto flex max-w-[1180px] flex-col justify-center px-3 pb-6 sm:px-5 lg:min-h-[calc(100dvh-96px)]" onPointerDown={() => setTouched(true)}>
        {finished(s) ? (
          <section className="flex flex-col items-center gap-6 py-6" data-testid="mi-finished" aria-label={tr(A11Y.done)}>
            <div className="flex gap-3">
              {APPLE_PROBLEMS.map((q) => (
                <StarShape key={q.id} size={64} />
              ))}
            </div>
            <ul className="grid gap-3 text-4xl font-extrabold sm:grid-cols-2">
              {APPLE_PROBLEMS.map((q) => (
                <li key={q.id} className="rounded-2xl border-[3px] border-[var(--mi-line)] bg-[var(--mi-surface)] px-6 py-3 text-center">
                  {q.a} + {q.b} = {q.a + q.b}
                </li>
              ))}
            </ul>
            <button type="button" className="kid-btn h-24 w-24" onClick={restart} disabled={viewer} aria-label={tr(A11Y.again)} data-testid="mi-again">
              <RestartIcon />
            </button>
            <Otter jump={hop} />
          </section>
        ) : (
          p && (
            <>
              <section className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-10" aria-label={tr(A11Y.title)} data-testid="mi-stage">
                <div className="flex gap-3 sm:gap-6">
                  {tree('a')}
                  {tree('b')}
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div {...zoneProps('basket', tr(A11Y.basket, { n: inBasket(s) }))} className="mi-zone mi-basket flex min-h-[230px] w-full max-w-[400px] items-center justify-center gap-3 rounded-b-[70px] p-3 sm:min-h-[270px] sm:gap-5 sm:p-5 lg:w-[400px]" style={{ borderTopWidth: 10 }}>
                    {half('a')}
                    <span className="w-0 self-stretch border-l-[3px] border-dashed border-[var(--mi-basket-line)]" aria-hidden="true" />
                    {half('b')}
                  </div>
                  <p className="min-h-[3rem] text-5xl font-extrabold" data-testid="mi-task" aria-live="polite">
                    {s.solved ? `${p.a} + ${p.b} = ${p.a + p.b}` : allIn(s) ? `${p.a} + ${p.b} = ?` : ''}
                  </p>
                </div>
              </section>

              <div className="mt-2 flex min-h-[140px] items-end justify-between gap-4">
                <div className="flex flex-1 justify-center gap-5" role="group" aria-label={allIn(s) && !s.solved ? tr(A11Y.cards) : undefined} data-testid="mi-cards">
                  {allIn(s) &&
                    !s.solved &&
                    choices.map((n, k) => (
                      <button
                        key={n}
                        ref={(el) => {
                          cardRefs.current[k] = el;
                          if (k === correctIdx) rightCard.current = el;
                        }}
                        type="button"
                        className="kid-card"
                        data-testid={`mi-answer-${n}`}
                        aria-label={tr(A11Y.card, { n })}
                        disabled={viewer}
                        {...cardDrag.bind(k)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTouched(true);
                          if (cardDrag.wasDrag(k)) return;
                          answer(n, e.currentTarget);
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  {s.solved && (
                    <button ref={nextRef} type="button" className="kid-btn h-28 w-44" style={{ background: 'var(--mi-ink)', color: 'var(--mi-sand)', borderColor: 'var(--mi-ink)' }} onClick={goNext} disabled={viewer} aria-label={tr(A11Y.next)} data-testid="mi-next">
                      <NextIcon size={64} />
                    </button>
                  )}
                </div>
                <Otter jump={hop} />
              </div>

              {/* the finger: the first drag; after three wrong cards, the right card onto the basket */}
              <HandDemo show={firstDemo} from={firstApple} to={basketRef} stage={stage} />
              <HandDemo show={wrong >= 3 && allIn(s) && !s.solved} from={rightCard} to={basketRef} stage={stage} />
              <StarFlight go={star} from={basketRef} to={dotRef} />
            </>
          )
        )}
      </div>
    </div>
  );
}
