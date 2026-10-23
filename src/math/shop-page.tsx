// Math Island batch A — Coin Shop (/math/g1/shop). Task: a customer buys one thing; move coins from the purse
// onto the tray to pay exactly the price, then press "pay". The tray is the answer (no multiple choice); too
// little or too much is told by how much and the coins stay put so the child can fix it. Drag, tap-then-tap and
// keyboard all go through moveCoin() and the shared drag controller (drag.ts).
import { useEffect, useMemo, useState } from 'react';
import {
  PURSE,
  SHOP_KEY,
  SHOP_PROBLEMS,
  TRAY,
  blankShop,
  finishedS,
  moveCoin,
  nextShop,
  payShop,
  playAgainS,
  problemOfS,
  readShop,
  restartShop,
  validShop,
  type ShopSave,
} from '../../shared/math/shop';
import { CLIPS } from './audio';
import { CoinArt } from './art';
import { useDragPlace, useZones } from './drag';
import { Feedback, Header, Notices, Page, S, SoundBar, useGame, useGreeting, useTr, type L } from './shell';
import { IslandLink } from './train-page';
import './math.css';

const T = {
  title: { zh: '零錢小商店', en: 'Coin Shop' },
  sub: { zh: '一、二年級．用錢幣湊出價錢', en: 'Grades 1–2 · pay the exact price with coins' },
  price: { zh: '{item}　{p} 元', en: '{item}: {p} dollars' },
  purse: { zh: '錢包', en: 'Purse' },
  tray: { zh: '托盤', en: 'Tray' },
  dropHere: { zh: '放這裡', en: 'Put here' },
  coin: { zh: '{v} 元硬幣，{w}', en: '{v}-dollar coin, {w}' },
  inPurse: { zh: '在錢包', en: 'in the purse' },
  onTray: { zh: '在托盤', en: 'on the tray' },
  held: { zh: '拿起了一個硬幣，要放哪裡？', en: 'You picked up a coin. Where should it go?' },
  toTray: { zh: '放到托盤', en: 'Put on the tray' },
  toPurse: { zh: '放回錢包', en: 'Back to the purse' },
  demo: { zh: '按住硬幣拖到托盤；也可以先點硬幣，再點托盤。放好了按「付錢」。', en: 'Hold a coin and drag it onto the tray, or tap a coin and then the tray. Press Pay when it is ready.' },
  pay: { zh: '付錢', en: 'Pay' },
  short: { zh: '錢還不夠喔，還差 {d} 元。', en: 'Not enough yet: {d} dollars short.' },
  over: { zh: '付太多了喔，多了 {d} 元。', en: 'That is too much: {d} dollars over.' },
  trayEmpty: { zh: '托盤上還沒有錢', en: 'Nothing on the tray yet' },
  trayCount: { zh: '托盤上有 {n} 個硬幣', en: '{n} coins on the tray' },
  paidList: { zh: '{item} {p} 元', en: '{item} {p} dollars' },
} satisfies Record<string, L>;

type Zone = 'purse' | 'tray';
const spotOf = (z: Zone) => (z === 'purse' ? PURSE : TRAY);

export function ShopPage() {
  const { tr } = useTr();
  const g = useGame<ShopSave>({ key: SHOP_KEY, read: readShop, blank: () => blankShop(), valid: validShop });
  const { prog, audio, say, commit, viewer } = g;
  const s = prog.v;
  const p = problemOfS(s);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'hint' | 'ok' } | null>(null);
  const [demoSeen, setDemoSeen] = useState(false);

  const currentClip = () => {
    if (finishedS(s)) return 'shop_done';
    if (!p) return '';
    return s.solved ? `shop_right_${p.id.slice(-2)}` : `shop_task_${p.id.slice(-2)}`;
  };
  useGreeting(() => prog.v.voice && say(currentClip()));

  const move = (i: number, spot: number) => {
    if (viewer) return;
    const r = moveCoin(s, i, spot);
    setSel(null);
    if (r.r !== 'moved' || !commit(r.s)) return;
    setDemoSeen(true);
    setMsg(null);
  };
  const pay = () => {
    if (viewer || !p) return;
    const r = payShop(s);
    if (r.r === 'empty') {
      setMsg({ text: CLIPS.shop_empty, kind: 'hint' });
      say('shop_empty');
    } else if (r.r === 'short') {
      setMsg({ text: tr(T.short, { d: r.diff }), kind: 'hint' });
      say('shop_short');
    } else if (r.r === 'over') {
      setMsg({ text: tr(T.over, { d: r.diff }), kind: 'hint' });
      say('shop_over');
    } else if (r.r === 'right' && commit(r.s)) {
      const id = `shop_right_${p.id.slice(-2)}`;
      setMsg({ text: CLIPS[id], kind: 'ok' });
      say(id);
    }
  };
  const goNext = () => {
    if (viewer) return;
    const n = nextShop(s);
    if (n === s || !commit(n)) return;
    setMsg(null);
    setSel(null);
    g.speaker.stop();
    const q = problemOfS(n);
    say(finishedS(n) || !q ? 'shop_done' : `shop_task_${q.id.slice(-2)}`);
  };
  const restart = () => {
    if (viewer) return;
    if (!commit(finishedS(s) ? playAgainS(s) : restartShop(s))) return;
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
  const allZones = useMemo<Zone[]>(() => ['purse', 'tray'], []);
  const dragger = useDragPlace<Zone>({
    enabled: !viewer && !s.solved,
    targets: () => zones.measure(allZones),
    onDrop: (i, z) => move(i, spotOf(z)),
    onAmbiguous: (i) => {
      setSel(i);
      setMsg({ text: CLIPS.shop_where, kind: 'info' });
      say('shop_where');
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
  const coin = (i: number) => {
    const v = p ? p.purse[i] : 1;
    return (
      <button
        key={i}
        type="button"
        className="mi-apple mi-coin"
        data-testid={`mi-item-${i}`}
        data-value={v}
        data-at={s.at[i]}
        aria-pressed={sel === i}
        aria-label={tr(T.coin, { v, w: s.at[i] === PURSE ? tr(T.inPurse) : tr(T.onTray) })}
        disabled={viewer || s.solved}
        {...dragger.bind(i)}
        onClick={(e) => {
          e.stopPropagation();
          if (dragger.wasDrag(i) || viewer || s.solved) return;
          if (sel !== null && sel !== i && s.at[i] !== s.at[sel]) return move(sel, s.at[i]);
          setSel((x) => (x === i ? null : i));
        }}
      >
        <CoinArt value={v} />
      </button>
    );
  };
  const onTray = s.at.map((a, i) => (a === TRAY ? i : -1)).filter((i) => i >= 0);
  // coins sorted by value so the same kinds sit together, as a child would lay them out
  const byValue = (ids: number[]) => (p ? [...ids].sort((x, y) => p.purse[y] - p.purse[x] || x - y) : ids);

  return (
    <Page testid="mi-shop" data={{ index: s.index, solved: s.solved, role: prog.role }}>
      <Header title={tr(T.title)} sub={tr(T.sub)} index={s.index} total={SHOP_PROBLEMS.length} finished={finishedS(s)} />
      <Notices prog={prog} audio={audio} />
      {finishedS(s) ? (
        <section className="flex flex-col gap-4" data-testid="mi-finished">
          <h2 className="mi-task">{tr(S.allDone)}</h2>
          <p className="text-lg font-bold">{tr(S.doneList)}</p>
          <ul className="grid gap-2 text-2xl font-bold sm:grid-cols-2" lang="zh-Hant">
            {SHOP_PROBLEMS.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] px-4 py-2">
                {tr(T.paidList, { item: q.item, p: q.price })}
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
                {tr(T.price, { item: p.item, p: p.price })}
              </p>
              <SoundBar voice={s.voice} viewer={viewer} onListen={() => say(currentClip(), true)} onVoice={toggleVoice} onRestart={restart} />
            </div>

            <section className="flex flex-col gap-4 md:flex-row" aria-label={tr(T.title)} data-testid="mi-stage">
              <div {...zoneAttrs('tray')} className="mi-zone mi-box flex min-h-[12rem] flex-1 flex-col p-3" role="group" aria-label={onTray.length ? tr(T.trayCount, { n: onTray.length }) : tr(T.trayEmpty)}>
                <p className="mb-2 text-center text-lg font-extrabold">{tr(T.tray)}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">{byValue(onTray).map((i) => coin(i))}</div>
                {lit('tray') && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
              </div>
              <div {...zoneAttrs('purse')} className="mi-zone bg-[var(--mi-surface)] p-3 md:w-[22rem]" role="group" aria-label={tr(T.purse)}>
                <p className="mb-2 text-center text-lg font-extrabold">{tr(T.purse)}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">{byValue(s.at.map((a, i) => (a === PURSE ? i : -1)).filter((i) => i >= 0)).map((i) => coin(i))}</div>
                {lit('purse') && <span className="absolute right-3 top-2 text-sm font-bold">{tr(T.dropHere)}</span>}
              </div>
            </section>

            {s.index === 0 && !demoSeen && s.at.every((x) => x === PURSE) && (
              <p className="rounded-lg border-2 border-dashed border-[var(--mi-sea)] p-3 text-lg font-bold" data-testid="mi-demo">
                {tr(T.demo)}
              </p>
            )}

            {sel !== null && !s.solved && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-sea)] bg-[var(--mi-surface)] p-3" data-testid="mi-held">
                <p className="w-full font-bold sm:w-auto sm:flex-1">{tr(T.held)}</p>
                <button type="button" className="mi-btn mi-btn-primary" onClick={() => move(sel, TRAY)} disabled={s.at[sel] === TRAY} data-testid="mi-to-tray">
                  {tr(T.toTray)}
                </button>
                <button type="button" className="mi-btn" onClick={() => move(sel, PURSE)} disabled={s.at[sel] === PURSE} data-testid="mi-to-purse">
                  {tr(T.toPurse)}
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
                <button type="button" className="mi-btn mi-btn-primary mi-big px-8 text-2xl" onClick={pay} disabled={viewer} data-testid="mi-pay">
                  {tr(T.pay)}
                </button>
              )}
            </div>
          </>
        )
      )}
    </Page>
  );
}
