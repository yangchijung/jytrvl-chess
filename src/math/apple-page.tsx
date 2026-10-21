// Math Island M0-A — Apple Basket page (/math/g1/apple). Task: move both piles of apples into one basket, then
// pick how many there are altogether. The scene (two piles + basket) is the main content; one short task line,
// "listen again" and "start over" are always in reach, "next" appears only after a correct answer.
// Drag, tap-then-tap and keyboard all end in the same moveApple() action; release position uses place.ts.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import {
  APPLE_KEY,
  APPLE_PROBLEMS,
  allIn,
  answerApple,
  blankApple,
  choicesOf,
  finished,
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
import { useDragPlace, useZones } from './drag';
import { Progress } from './save';
import { CLIPS, Speaker } from './audio';
import { AppleArt } from './art';
import './math.css';

type L = { zh: string; en: string };
const T = {
  island: { zh: '回到島上', en: 'Back to the island' },
  title: { zh: '蘋果籃', en: 'Apple Basket' },
  sub: { zh: '一年級．兩堆合起來', en: 'Grade 1 · put two groups together' },
  progress: { zh: '第 {n} 題／共 {t} 題', en: 'Problem {n} of {t}' },
  zhOnly: { zh: '', en: 'Preview: the questions and voice are in Traditional Chinese for now.' },
  listen: { zh: '聽一遍', en: 'Listen' },
  soundOn: { zh: '聲音：開', en: 'Sound: on' },
  soundOff: { zh: '聲音：關', en: 'Sound: off' },
  restart: { zh: '重來', en: 'Start over' },
  next: { zh: '下一題', en: 'Next' },
  pileA: { zh: '第一堆', en: 'Group 1' },
  pileB: { zh: '第二堆', en: 'Group 2' },
  basket: { zh: '籃子', en: 'Basket' },
  dropHere: { zh: '放這裡', en: 'Put here' },
  apple: { zh: '{g}的蘋果，第 {n} 顆，{w}', en: 'Apple {n} from {g}, {w}' },
  inPile: { zh: '在原處', en: 'in its group' },
  inBasket: { zh: '在籃子裡', en: 'in the basket' },
  held: { zh: '拿起了一顆蘋果，要放哪裡？', en: 'You picked up an apple. Where should it go?' },
  toBasket: { zh: '放進籃子', en: 'Put in basket' },
  toPile: { zh: '放回原處', en: 'Put back' },
  cancel: { zh: '不拿了', en: 'Never mind' },
  demo: { zh: '按住蘋果拖進籃子；也可以先點蘋果，再點籃子。', en: 'Hold an apple and drag it into the basket, or tap an apple and then the basket.' },
  answers: { zh: '一共有幾顆？選一個數字', en: 'How many altogether? Pick a number' },
  viewOnly: { zh: '這一局正在另一個分頁玩，這裡先只看不改。', en: 'This game is open in another tab, so this tab only shows it.' },
  takeOver: { zh: '改在這裡玩', en: 'Play here instead' },
  uncoord: { zh: '這個瀏覽器無法協調多個分頁，請只開一個分頁玩。', en: 'This browser cannot coordinate tabs; please play in one tab only.' },
  saveFailed: { zh: '剛才的進度沒有存好，可以繼續玩；重新整理可能回到上一步。', en: 'Progress was not saved just now. You can keep playing; a reload may go back a step.' },
  noStorage: { zh: '這個瀏覽器現在不能存進度，可以照常玩，重新整理會從第一題開始。', en: 'This browser cannot save progress right now. Play on; a reload starts from problem 1.' },
  broken: { zh: '之前的進度讀不出來，已另外保留一份；這裡從第一題開始。', en: 'The earlier progress could not be read. A copy was kept; this starts from problem 1.' },
  brokenFuture: { zh: '之前的進度來自較新的版本，已另外保留一份；這裡從第一題開始。', en: 'The earlier progress is from a newer version. A copy was kept; this starts from problem 1.' },
  brokenNoBackup: { zh: '之前的進度讀不出來，也沒辦法另存一份，所以不會覆蓋它；這次的進度存在另一個位置。', en: 'The earlier progress could not be read or copied, so it is left untouched; this session saves elsewhere.' },
  brokenNoSave: { zh: '之前的進度讀不出來，也沒辦法另存一份，所以不會覆蓋它；這次的進度不會保存。', en: 'The earlier progress could not be read or copied, so it is left untouched; this session is not saved.' },
  restored: { zh: '找回了上次的進度。', en: 'Your last progress was found.' },
  noAudio: { zh: '這段聲音還沒準備好，可以看字；按「聽一遍」再試。', en: 'This sound is not ready yet. Read the words, or press Listen to try again.' },
  blocked: { zh: '按「聽一遍」就會播放。', en: 'Press Listen to hear it.' },
  allDone: { zh: '五題都完成了', en: 'All five problems done' },
  again: { zh: '再玩一次', en: 'Play again' },
  doneList: { zh: '你算出來的', en: 'What you worked out' },
};

const slotsOf = (items: AppleItem[], group: Group, n: number) => {
  const out: (AppleItem | null)[] = Array(n).fill(null);
  for (const it of items) if (it.group === group) out[it.slot] = it;
  return out;
};

type Zone = 'pile-a' | 'pile-b' | 'basket';

export function ApplePage() {
  const { lang, to } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => l[lang].replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''));

  const prog = useMemo(() => new Progress<AppleSave>({ key: APPLE_KEY, read: readApple, blank: () => blankApple(), valid: validApple }), []);
  const speaker = useMemo(() => new Speaker(), []);
  const subP = useCallback((f: () => void) => prog.subscribe(f), [prog]);
  const subS = useCallback((f: () => void) => speaker.subscribe(f), [speaker]);
  const ver = useRef(0);
  useSyncExternalStore(
    subP,
    () => `${prog.role}|${prog.status}|${JSON.stringify(prog.v)}|${ver.current}`,
    () => '',
  );
  const audio = useSyncExternalStore(subS, () => speaker.state, () => 'idle' as const);
  const s = prog.v;

  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);

  useEffect(() => {
    prog.start();
    return () => prog.stop();
  }, [prog]);
  useEffect(() => () => speaker.stop(), [speaker]);

  const p = problemOf(s);
  const items = useMemo(() => (p ? itemsOf(p) : []), [p]);
  const viewer = prog.role === 'viewer';

  const say = useCallback(
    (id: string, force = false) => {
      if (!(id in CLIPS)) return;
      if (!force && !prog.v.voice) return;
      speaker.play(id);
    },
    [prog, speaker],
  );
  const currentClip = () => {
    if (finished(s)) return 'apple_done';
    if (s.solved && p) return `apple_right_${p.id.slice(-2)}`;
    return allIn(s) ? 'apple_ask' : 'apple_task';
  };

  // the first prompt plays by itself only after the child has already tapped on this page or the island
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua?.hasBeenActive && prog.v.voice) say(currentClip());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: AppleSave) => {
    const ok = prog.commit(next);
    ver.current++;
    return ok;
  };

  const move = (i: number, place: Place) => {
    if (viewer) return;
    const before = allIn(s);
    const r = moveApple(s, i, place);
    setSel(null);
    if (r.r !== 'moved') return;
    if (!commit(r.s)) return;
    setDemoSeen(true);
    setMsg(null);
    if (!before && allIn(r.s)) say('apple_ask');
  };

  const answer = (n: number) => {
    if (viewer) return;
    const r = answerApple(s, n);
    if (r.r === 'notReady') {
      setMsg({ id: 'apple_not_ready', text: CLIPS.apple_not_ready, kind: 'hint' });
      say('apple_not_ready');
    } else if (r.r === 'wrong') {
      setMsg({ id: 'apple_again', text: CLIPS.apple_again, kind: 'hint' });
      say('apple_again');
    } else if (r.r === 'right' && p) {
      if (!commit(r.s)) return;
      const id = `apple_right_${p.id.slice(-2)}`;
      setMsg({ id, text: CLIPS[id], kind: 'ok' });
      say(id);
    }
  };

  const goNext = () => {
    if (viewer) return;
    const n = nextApple(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    setSel(null);
    speaker.stop();
    say(finished(n) ? 'apple_done' : 'apple_task');
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finished(s) ? playAgain(s) : restartApple(s))) return;
    setMsg(null);
    setSel(null);
    speaker.stop();
  };
  const toggleVoice = () => {
    if (viewer) return;
    const voice = !s.voice;
    if (!voice) speaker.stop();
    commit({ ...s, voice });
  };

  // ---------- drag: the shared controller (first finger only; cancel returns to the last committed place) ----------
  const zones = useZones<Zone>();
  const dragger = useDragPlace<Zone>({
    enabled: !viewer && !s.solved,
    targets: (i) => {
      const it = items[i];
      return it ? zones.measure([it.group === 'a' ? 'pile-a' : 'pile-b', 'basket']) : [];
    },
    onDrop: (i, z) => move(i, z === 'basket' ? 'basket' : 'pile'),
    onAmbiguous: (i) => {
      setSel(i);
      setMsg({ id: 'apple_where', text: CLIPS.apple_where, kind: 'info' });
      say('apple_where');
    },
    onStart: () => setSel(null),
  });
  const hot = dragger.hot;
  const cancelDrag = dragger.cancel;

  const onAppleClick = (e: React.MouseEvent, it: AppleItem) => {
    e.stopPropagation();
    if (dragger.wasDrag(it.i)) return;
    if (viewer || s.solved) return;
    // holding another apple: tapping anywhere in a place it can go (even on an apple already there) puts it there
    if (sel !== null && sel !== it.i) {
      const z: Zone = s.at[it.i] === 'basket' ? 'basket' : it.group === 'a' ? 'pile-a' : 'pile-b';
      if (canGo(z)) return onZoneClick(z);
    }
    setSel((v) => (v === it.i ? null : it.i));
  };
  const onZoneClick = (z: Zone) => {
    if (sel === null) return;
    const it = items[sel];
    if (!it) return;
    if (z === 'basket') move(sel, 'basket');
    else if ((z === 'pile-a' && it.group === 'a') || (z === 'pile-b' && it.group === 'b')) move(sel, 'pile');
  };

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

  // ---------- render ----------
  const groupName = (g: Group) => tr(g === 'a' ? T.pileA : T.pileB);
  const appleBtn = (it: AppleItem) => (
    <button
      key={it.i}
      type="button"
      className="mi-apple"
      data-testid={`mi-apple-${it.i}`}
      data-group={it.group}
      data-at={s.at[it.i]}
      aria-pressed={sel === it.i}
      aria-label={tr(T.apple, { g: groupName(it.group), n: it.slot + 1, w: tr(s.at[it.i] === 'basket' ? T.inBasket : T.inPile) })}
      disabled={viewer || s.solved}
      {...dragger.bind(it.i)}
      onClick={(e) => onAppleClick(e, it)}
    >
      <AppleArt />
    </button>
  );
  const holding = sel !== null || hot !== null;
  const zoneAttrs = (z: Zone) => ({
    ref: zones.ref(z),
    'data-target': z,
    'data-testid': `mi-zone-${z}`,
    'data-hot': hot === z || (sel !== null && hot === null && canGo(z)) ? 'true' : 'false',
    onClick: () => onZoneClick(z),
  });
  function canGo(z: Zone) {
    if (sel === null) return false;
    const it = items[sel];
    if (!it) return false;
    if (z === 'basket') return s.at[sel] !== 'basket';
    return s.at[sel] !== 'pile' && ((z === 'pile-a' && it.group === 'a') || (z === 'pile-b' && it.group === 'b'));
  }

  const pile = (g: Group) => {
    if (!p) return null;
    const z: Zone = g === 'a' ? 'pile-a' : 'pile-b';
    const n = g === 'a' ? p.a : p.b;
    return (
      <div {...zoneAttrs(z)} className="mi-zone bg-[var(--mi-surface)] p-2">
        <p className="mb-1 text-center text-base font-bold">{groupName(g)}</p>
        <div className="mx-auto grid w-fit grid-cols-2 gap-3">
          {slotsOf(items, g, Math.max(n, 2)).map((it, k) =>
            it ? <div key={k} className="mi-slot">{s.at[it.i] === 'pile' ? appleBtn(it) : <span className="mi-empty" aria-hidden="true" />}</div> : <div key={k} className="mi-slot" aria-hidden="true" />,
          )}
        </div>
        {(hot === z || (sel !== null && hot === null && canGo(z))) && <span className="absolute right-2 top-1 text-sm font-bold text-[var(--mi-ink)]">{tr(T.dropHere)}</span>}
      </div>
    );
  };
  const half = (g: Group) => (
    <div className="flex flex-col items-center">
      <p className="mb-1 text-sm font-bold">{groupName(g)}</p>
      <div className="grid grid-cols-2 gap-3">
        {slotsOf(items, g, MAXS).map((it, k) => (
          <div key={k} className="mi-slot">
            {it && s.at[it.i] === 'basket' ? appleBtn(it) : null}
          </div>
        ))}
      </div>
    </div>
  );

  const notices: { key: string; text: string }[] = [];
  const nmap: Record<string, L> = { broken: T.broken, brokenFuture: T.brokenFuture, brokenNoBackup: T.brokenNoBackup, brokenNoSave: T.brokenNoSave, noStorage: T.noStorage, restored: T.restored, altKept: T.restored };
  if (prog.notice && nmap[prog.notice]) notices.push({ key: `notice-${prog.notice}`, text: tr(nmap[prog.notice]) });
  if (prog.status === 'failed') notices.push({ key: 'save-failed', text: tr(T.saveFailed) });
  if (prog.role === 'uncoordinated') notices.push({ key: 'uncoord', text: tr(T.uncoord) });

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={to('/math')} className="mi-btn" data-testid="mi-back">
          <span aria-hidden="true">←</span> {tr(T.island)}
        </Link>
        {!finished(s) && (
          <p className="text-lg font-bold" data-testid="mi-progress">
            {tr(T.progress, { n: s.index + 1, t: APPLE_PROBLEMS.length })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-extrabold">{tr(T.title)}</h1>
        <p className="text-base">{tr(T.sub)}</p>
      </div>
    </div>
  );

  const audioBar = (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="mi-btn" onClick={() => say(currentClip(), true)} data-testid="mi-listen">
        {tr(T.listen)}
      </button>
      <button type="button" className="mi-btn" aria-pressed={s.voice} onClick={toggleVoice} disabled={viewer} data-testid="mi-voice">
        {tr(s.voice ? T.soundOn : T.soundOff)}
      </button>
      {!finished(s) && (
        <button type="button" className="mi-btn" onClick={restart} disabled={viewer} data-testid="mi-restart">
          {tr(T.restart)}
        </button>
      )}
    </div>
  );

  return (
    <div className="mi rounded-lg px-3 py-4 sm:px-6 sm:py-6" data-testid="mi-apple" data-index={s.index} data-solved={s.solved} data-role={prog.role}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {header}
        {lang === 'en' && <p className="text-base">{tr(T.zhOnly)}</p>}
        {viewer && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-3" role="status" data-testid="mi-view-only">
            <p className="flex-1 font-bold">{tr(T.viewOnly)}</p>
            <button type="button" className="mi-btn mi-btn-primary" onClick={() => prog.takeOver()} data-testid="mi-take-over">
              {tr(T.takeOver)}
            </button>
          </div>
        )}
        {notices.map((n) => (
          <p key={n.key} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-3 text-base" role="status" data-testid={`mi-${n.key}`}>
            {n.text}
          </p>
        ))}

        {finished(s) ? (
          <section className="flex flex-col gap-4" data-testid="mi-finished">
            <h2 className="mi-task">{tr(T.allDone)}</h2>
            <p className="text-lg font-bold">{tr(T.doneList)}</p>
            <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2">
              {APPLE_PROBLEMS.map((q) => (
                <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                  {q.a} + {q.b} = {q.a + q.b}
                </li>
              ))}
            </ul>
            {audioBar}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="mi-btn mi-btn-primary" onClick={restart} disabled={viewer} data-testid="mi-again">
                {tr(T.again)}
              </button>
              <Link to={to('/math')} className="mi-btn">
                {tr(T.island)}
              </Link>
            </div>
          </section>
        ) : (
          p && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="mi-task" data-testid="mi-task" lang="zh-Hant">
                  {s.solved ? `${p.a} + ${p.b} = ${p.a + p.b}` : allIn(s) ? CLIPS.apple_ask : CLIPS.apple_task}
                </p>
                {audioBar}
              </div>
              {audio === 'missing' && (
                <p className="text-base" role="status" data-testid="mi-audio-missing">
                  {tr(T.noAudio)}
                </p>
              )}
              {audio === 'blocked' && (
                <p className="text-base" role="status" data-testid="mi-audio-blocked">
                  {tr(T.blocked)}
                </p>
              )}

              <section className="flex flex-col gap-4 lg:flex-row lg:items-stretch" aria-label={tr(T.title)} data-testid="mi-stage">
                <div className="grid grid-cols-2 gap-4 lg:w-[22rem] lg:grid-cols-1">
                  {pile('a')}
                  {pile('b')}
                </div>
                <div {...zoneAttrs('basket')} className="mi-zone mi-basket flex flex-1 flex-col p-3">
                  <p className="mb-2 text-center text-lg font-extrabold">{tr(T.basket)}</p>
                  <div className="flex flex-1 items-start justify-center gap-4">
                    {half('a')}
                    <span className="w-0 self-stretch border-l-2 border-dashed border-[var(--mi-basket-line)]" aria-hidden="true" />
                    {half('b')}
                  </div>
                  {(hot === 'basket' || (sel !== null && hot === null && canGo('basket'))) && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
                </div>
              </section>

              {s.index === 0 && !demoSeen && s.at.every((x) => x === 'pile') && (
                <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                  {tr(T.demo)}
                </p>
              )}

              {sel !== null && !s.solved && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-sea)] bg-[var(--mi-surface)] p-3" data-testid="mi-held">
                  <p className="flex-1 font-bold">{tr(T.held)}</p>
                  <button type="button" className="mi-btn mi-btn-primary" onClick={() => move(sel, 'basket')} disabled={s.at[sel] === 'basket'} data-testid="mi-to-basket">
                    {tr(T.toBasket)}
                  </button>
                  <button type="button" className="mi-btn" onClick={() => move(sel, 'pile')} disabled={s.at[sel] === 'pile'} data-testid="mi-to-pile">
                    {tr(T.toPile)}
                  </button>
                  <button type="button" className="mi-btn" onClick={() => setSel(null)}>
                    {tr(T.cancel)}
                  </button>
                </div>
              )}

              {msg && (
                <p
                  className={`rounded-lg p-3 text-2xl font-bold ${msg.kind === 'hint' ? 'bg-[var(--mi-coral-bg)] text-[var(--mi-coral-text)]' : 'border-2 border-[var(--mi-line)] bg-[var(--mi-surface)]'}`}
                  role="status"
                  lang="zh-Hant"
                  data-testid="mi-msg"
                  data-kind={msg.kind}
                >
                  {msg.kind === 'hint' && <span aria-hidden="true">↺ </span>}
                  {msg.text}
                </p>
              )}

              {s.solved ? (
                <div>
                  <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={goNext} disabled={viewer} data-testid="mi-next">
                    {tr(T.next)}
                  </button>
                </div>
              ) : (
                <fieldset className="flex flex-col gap-2" disabled={viewer}>
                  <legend className="mb-2 text-lg font-bold">{tr(T.answers)}</legend>
                  <div className="flex flex-wrap gap-4">
                    {choicesOf(p, s.index).map((n) => (
                      <button key={n} type="button" className="mi-btn mi-big w-20 text-3xl" onClick={() => answer(n)} data-testid={`mi-answer-${n}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {holding && <span className="sr-only" aria-live="polite">{tr(T.held)}</span>}
            </>
          )
        )}
      </div>
    </div>
  );
}
const MAXS = 4;
