// Little Restaurant Owner — scene version (V2, ages 5–12). Picture cards and short prompts on the main path;
// costs, pack maths and manual buying live in the optional Little ledger. Rules: shared/restaurant/engine.ts.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { format, useI18n } from '../i18n';
import { Button, Modal } from '../components/ui';
import { BATCH_ORDERS, DAY_CAPACITY, DECOR, DISHES, DISH_IDS, FIXED_FEE, ITEMS, ITEM_IDS, dishCost, type DishId, type ItemId } from '../../shared/restaurant/data';
import { available, buyRows, currentOrders, maxAlone, needs, packsCost, readyCount, separateVsCombined, suitable, type State } from '../../shared/restaurant/engine';
import { RestaurantController, type Fx, type RView } from './game';
import { C } from './copy';
import './scene.css';
import bg from './assets/restaurant-background.svg';
import chef from './assets/chef.svg';
import bunny from './assets/bunny.svg';
import fox from './assets/fox.svg';
import coin from './assets/coin.svg';
import plant from './assets/plant.svg';
import dTomato from './assets/dish-tomato.svg';
import dVeg from './assets/dish-vegetable.svg';
import dToast from './assets/dish-toast.svg';
import iRice from './assets/rice.svg';
import iEgg from './assets/egg.svg';
import iTomato from './assets/tomato.svg';
import iVeg from './assets/vegetable.svg';
import iBread from './assets/bread.svg';
import iCheese from './assets/cheese.svg';
import iPack from './assets/packaging.svg';

const DISH_IMG: Record<DishId, string> = { tomato_egg_rice: dTomato, vegetable_egg_rice: dVeg, cheese_egg_toast: dToast };
const ITEM_IMG: Record<ItemId, string> = { rice: iRice, egg: iEgg, tomato: iTomato, vegetable: iVeg, bread: iBread, cheese: iCheese, packaging: iPack };
const ITEM_NAME_V2: Record<ItemId, { zh: string; en: string }> = { ...Object.fromEntries(ITEM_IDS.map((i) => [i, ITEMS[i].name])), vegetable: { zh: '青菜', en: 'Greens' }, packaging: { zh: '餐盒', en: 'Box' } } as Record<ItemId, { zh: string; en: string }>;
type L = { zh: string; en: string };

function useR() {
  const ctl = useMemo(() => new RestaurantController(), []);
  useEffect(() => () => ctl.dispose(), [ctl]);
  const v = useSyncExternalStore(ctl.subscribe, ctl.snapshot, ctl.snapshot);
  useEffect(() => {
    (window as unknown as { __restaurant?: RestaurantController }).__restaurant = ctl;
  }, [ctl]);
  return { ctl, v };
}
function useT() {
  const { lang } = useI18n();
  const tr = (l: L, vars?: Record<string, string | number>) => format(l[lang], vars);
  const join = (xs: string[]) => xs.join(lang === 'zh' ? '、' : ', ');
  return { lang, tr, join, name: (i: ItemId) => ITEM_NAME_V2[i][lang], dish: (d: DishId) => DISHES[d].name[lang] };
}

/** First ingredient that stops one more serving of a dish (for "No eggs" style labels). */
function missingItem(s: State, d: DishId): ItemId | null {
  const a = available(s);
  for (const [i, q] of Object.entries(DISHES[d].recipe)) if (a[i as ItemId] < (q ?? 0)) return i as ItemId;
  return null;
}

/** The guest on stage: during a serve / leave animation keep the guest just handled, then the next pending one. */
function stageGuest(s: State, fx: Fx, last: RView['last']): number | null {
  if ((fx === 'serve' || fx === 'nomatch') && last?.t === 'serve') return last.order;
  if (s.phase !== 'serve') return null;
  return currentOrders(s).find((o) => s.orders[o].status === 'pending') ?? null;
}

export function RestaurantPage() {
  const { ctl, v } = useR();
  const { tr, lang } = useT();
  const s = v.s;
  const [ledger, setLedger] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const guest = stageGuest(s, v.fx, v.last);
  const prompt = promptFor(s, guest);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(tr(prompt));
      u.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech is optional */
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && v.fx) ctl.skipFx();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl, v.fx]);
  const sold = s.orders.filter((o) => o.status === 'sold').length;

  return (
    <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--card-shadow)]" data-testid="restaurant" data-phase={s.phase} data-batch={s.batch} data-cash={s.cash} data-fx={v.fx ?? ''} data-paused={v.paused} aria-label={tr(C.title)}>
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h1 className="text-xl font-extrabold">
          {tr(C.title)} <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--muted)]">{tr(C.proto)}</span>
        </h1>
        <p className="flex items-center gap-1 text-2xl font-extrabold tabular-nums" data-testid="r-cash" aria-label={`${tr(C.cashNow, { n: s.cash })}`}>
          <img src={coin} alt="" className="h-8 w-8" />
          {s.cash}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" aria-expanded={ledger} aria-controls="rs-ledger" onClick={() => setLedger((x) => !x)} data-testid="r-ledger-toggle">
            📒 {tr(C.ledger)}
          </Button>
          <Button variant="secondary" aria-pressed={v.paused} onClick={() => ctl.pause(!v.paused)} data-testid="r-pause">
            {v.paused ? `▶ ${tr(C.resume)}` : `⏸ ${tr(C.pause)}`}
          </Button>
        </div>
      </div>

      {/* stage */}
      <div className="rs-stage" data-fx={v.fx ?? ''} data-night={s.phase === 'closed' || s.phase === 'done'} key={v.fxKey}>
        <div className="rs-canvas" aria-hidden="true">
          <img className="rs-bg" src={bg} alt="" />
          <img className="rs-chef" src={chef} alt="" />
          <div className="rs-steam">
            <i />
            <i />
            <i />
          </div>
          {s.decor.includes(DECOR.id) && <img className="rs-plant" src={plant} alt="" data-testid="r-plant" />}
          {guest !== null && <img className={`rs-guest ${guest % 2 ? 'flip' : ''}`} src={guest % 2 ? fox : bunny} alt="" />}
          {guest !== null && v.fx === null && (
            <div className="rs-bubble">
              {[s.customers[guest].likes, s.customers[guest].alsoAccepts]
                .filter((d): d is DishId => !!d)
                .map((d, k) => (
                  <span key={d} className="flex items-center gap-1">
                    {k > 0 && <span>{tr(C.or)}</span>}
                    <img src={DISH_IMG[d]} alt="" />
                  </span>
                ))}
            </div>
          )}
          {v.fx === 'serve' && v.last?.t === 'serve' && v.last.dish && <img className="rs-counter-dish" src={DISH_IMG[v.last.dish]} alt="" />}
          {v.fx === 'serve' && v.last?.t === 'serve' && v.last.dish && <div className="rs-coins">+{DISHES[v.last.dish].price}</div>}
          <div className="rs-night" />
        </div>
        {/* overlays (always inside the visible stage) */}
        <div className="rs-overlay rs-prompt" role="status" aria-live="polite" data-testid="r-prompt">
          <span>{tr(prompt)}</span>
          {canSpeak && (
            <button type="button" onClick={speak} className="min-h-11 min-w-11 rounded-full bg-[#f4e4c8] px-2 text-sm text-[#3e4636]" aria-label={tr(C.listen)}>
              🔊
            </button>
          )}
        </div>
        <div className="rs-overlay rs-progress" aria-label={tr(C.served, { n: sold })}>
          {s.orders.map((o, i) => (
            <span key={i} data-s={o.status}>
              {o.status === 'sold' ? '✓' : o.status === 'no_match' ? '–' : ''}
            </span>
          ))}
        </div>
        <Tray s={s} />
        <div className="rs-overlay rs-truck" aria-hidden="true">
          {ITEM_IDS.filter((i) => i !== 'packaging' && s.lots.some((l) => l.item === i)).map((i) => (
            <img key={i} src={ITEM_IMG[i]} alt="" />
          ))}
        </div>
        {v.fx && !v.paused && (
          <button type="button" className="rs-overlay rs-skip min-h-11 rounded-full bg-[#fff7e9] px-3 text-sm font-bold text-[#3e4636]" onClick={() => ctl.skipFx()} data-testid="r-skip">
            ⏭ {tr(C.skipAnim)}
          </button>
        )}
        {v.paused && (
          <div className="rs-pause" data-testid="r-paused">
            <span>{tr(C.rest)}</span>
            <Button size="lg" onClick={() => ctl.pause(false)}>
              ▶ {tr(C.resume)}
            </Button>
          </div>
        )}
      </div>

      {/* dock */}
      <div className="space-y-3 p-4">
        {v.invalid && <Chip kind="warn">⚠ {tr(C.invalid)}</Chip>}
        {v.otherTab && <Chip kind="info">🔄 {tr(C.otherTab)}</Chip>}
        {v.error && C.err[v.error as keyof typeof C.err] && (
          <Chip kind="warn" testid="r-error">
            ⚠ {tr(C.err[v.error as keyof typeof C.err])}
          </Chip>
        )}
        <fieldset disabled={v.paused || v.fx !== null} className="min-w-0 space-y-3">
          {s.phase === 'plan' && <PlanDock ctl={ctl} s={s} />}
          {s.phase === 'buy' && <BuyDock ctl={ctl} v={v} />}
          {s.phase === 'prep' && <PrepDock ctl={ctl} s={s} />}
          {s.phase === 'serve' && <ServeDock ctl={ctl} s={s} guest={guest} />}
          {(s.phase === 'closed' || s.phase === 'done') && <CloseDock ctl={ctl} s={s} onRestart={() => setConfirm(true)} />}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span aria-live="polite">{v.saveState === 'saved' ? `✓ ${tr(C.saved)}` : v.saveState === 'failed' ? `⚠ ${tr(C.saveFailed)}` : ''}</span>
          {s.phase !== 'done' && (
            <button type="button" className="min-h-11 px-2 underline" onClick={() => setConfirm(true)} data-testid="r-restart">
              ↺ {tr(C.yes)}
            </button>
          )}
        </div>
      </div>

      {ledger && <Ledger ctl={ctl} v={v} />}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={tr(C.restartQ)}>
        <div className="space-y-4" data-testid="r-restart-dialog">
          <p>{tr(C.restartD)}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {tr(C.no)}
            </Button>
            <Button onClick={() => (setConfirm(false), setLedger(false), ctl.restart())} data-testid="r-restart-yes">
              {tr(C.yes)}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function promptFor(s: State, guest: number | null): L {
  switch (s.phase) {
    case 'plan':
      return C.pickMenu;
    case 'buy':
      return C.shareBuy;
    case 'prep':
      return C.tapCook;
    case 'serve':
      return guest === null ? (s.batch === 1 ? C.nextBatch : C.closeShop) : suitable(s, guest).length ? C.tapServe : C.wantsNothing;
    default:
      return C.wellDone;
  }
}

function Chip({ kind, children, testid }: { kind: 'warn' | 'info'; children: ReactNode; testid?: string }) {
  return (
    <p className={`rounded-xl px-3 py-2 font-semibold ${kind === 'warn' ? 'bg-[var(--warn-bg)] text-[var(--warn-text)]' : 'bg-[var(--info-bg)] text-[var(--info-text)]'}`} role={kind === 'warn' ? 'alert' : 'status'} data-testid={testid}>
      {children}
    </p>
  );
}

/** Stock tray on the stage: plan → needs of shared items; later → usable stock (empty boxes crossed out). */
function Tray({ s }: { s: State }) {
  const { name } = useT();
  const a = available(s);
  const n = needs(s);
  const items =
    s.phase === 'plan' || s.phase === 'buy'
      ? ITEM_IDS.filter((i) => i !== 'packaging' && n[i] > 0).map((i) => ({ i, q: n[i] }))
      : ITEM_IDS.filter((i) => i !== 'packaging' && (a[i] > 0 || s.menu.some((d) => (DISHES[d].recipe[i] ?? 0) > 0))).map((i) => ({ i, q: a[i] }));
  if (!items.length) return null;
  return (
    <div className="rs-overlay rs-tray" data-testid="r-tray">
      {items.map(({ i, q }) => (
        <span key={i} className={q === 0 ? 'empty' : ''} data-item={i} data-qty={q} aria-label={`${name(i)} ${q}`}>
          <img src={ITEM_IMG[i]} alt="" />
          {q}
        </span>
      ))}
    </div>
  );
}

// ---------- plan ----------
function PlanDock({ ctl, s }: { ctl: RestaurantController; s: State }) {
  const { tr, join, name, dish } = useT();
  const total = DISH_IDS.reduce((n, d) => n + (s.menu.includes(d) ? s.plan[d] : 0), 0);
  const shared = ITEM_IDS.filter((i) => i !== 'packaging' && s.menu.filter((d) => s.plan[d] > 0 && (DISHES[d].recipe[i] ?? 0) > 0).length >= 2);
  const sharedBy = shared.length ? s.menu.filter((d) => s.plan[d] > 0 && (DISHES[d].recipe[shared[0]] ?? 0) > 0).length : 0;
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {DISH_IDS.map((d) => {
          const on = s.menu.includes(d);
          return (
            <div key={d} className={`relative flex items-center gap-2 rounded-2xl border-2 p-1 sm:flex-col sm:gap-0 ${on ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`} data-testid={`dish-${d}`} data-on={on}>
              <button type="button" aria-pressed={on} onClick={() => ctl.dispatch({ t: 'setMenu', dish: d, on: !on }, 'select')} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 font-bold sm:w-full sm:flex-col sm:gap-0 sm:pt-1">
                <img src={DISH_IMG[d]} alt="" className="h-12 w-16 shrink-0 object-contain sm:h-16 sm:w-24" />
                <span className="flex min-w-0 flex-col items-start sm:items-center">
                  <span className="text-base leading-tight">
                    {on ? '✓ ' : ''}
                    {dish(d)}
                  </span>
                  <span className="mt-0.5 flex gap-0.5" aria-hidden="true">
                    {Object.keys(DISHES[d].recipe)
                      .filter((i) => i !== 'packaging')
                      .map((i) => (
                        <img key={i} src={ITEM_IMG[i as ItemId]} alt="" className={`h-5 w-5 ${shared.includes(i as ItemId) && on ? 'rounded-full ring-2 ring-[var(--gold)]' : ''}`} />
                      ))}
                  </span>
                </span>
              </button>
              {on && (
                <div className="flex shrink-0 items-center gap-1" role="group" aria-label={dish(d)} data-testid={`plan-${d}`} data-value={s.plan[d]}>
                  <button type="button" className="h-11 w-11 rounded-xl bg-[var(--surface-2)] text-2xl disabled:opacity-40" aria-label="−" disabled={s.plan[d] <= 0} onClick={() => ctl.dispatch({ t: 'setPlan', dish: d, n: s.plan[d] - 1 })}>
                    −
                  </button>
                  <output className="w-6 text-center text-lg font-bold tabular-nums">{s.plan[d]}</output>
                  <button type="button" className="h-11 w-11 rounded-xl bg-[var(--surface-2)] text-2xl disabled:opacity-40" aria-label="+" disabled={s.plan[d] >= DAY_CAPACITY} onClick={() => ctl.dispatch({ t: 'setPlan', dish: d, n: s.plan[d] + 1 })}>
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="min-h-6 text-sm" data-testid="r-shared">
        {shared.length ? tr(C.sharedNote, { items: join(shared.map(name)), n: sharedBy }) : s.menu.length > 1 ? tr(C.noShared) : ''}
      </p>
      {total > DAY_CAPACITY && <Chip kind="warn">⚠ {tr(C.max8)}（{total}）</Chip>}
      {!s.menu.length && <Chip kind="info">👆 {tr(C.pickOne)}</Chip>}
      <Button size="lg" className="min-h-14 w-full text-xl" disabled={!s.menu.length} onClick={() => ctl.dispatch({ t: 'toBuy' })} data-testid="r-to-buy">
        🛒 {tr(C.goBuy)}
      </Button>
    </>
  );
}

// ---------- buy ----------
function draftPacks(s: State, draft: RView['draft']): Record<ItemId, number> {
  const rows = buyRows(s);
  return Object.fromEntries(rows.map((r) => [r.item, draft?.[r.item] ?? r.suggested])) as Record<ItemId, number>;
}

function BuyDock({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, name, join, dish } = useT();
  const s = v.s;
  const rows = buyRows(s);
  const packs = draftPacks(s, v.draft);
  const cost = packsCost(packs);
  const lack = cost - (s.cash - FIXED_FEE);
  const shortAfter = rows.filter((r) => r.need > r.have + packs[r.item] * r.packSize);
  return (
    <>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7" data-testid="r-buy">
        {rows
          .filter((r) => r.need > 0)
          .map((r) => {
            const shared = r.usedBy.length >= 2;
            return (
              <li key={r.item} className={`flex flex-col items-center rounded-xl border p-1 text-center text-xs font-bold ${shared ? 'border-[var(--gold)] bg-[var(--warn-bg)]/40' : 'border-[var(--border)]'}`} data-item={r.item} data-need={r.need} data-have={r.have} data-packs={packs[r.item]}>
                <img src={ITEM_IMG[r.item]} alt="" className="h-11 w-11" />
                <span>{name(r.item)}</span>
                <span className="font-normal">
                  {tr(C.need, { n: r.need })} · {tr(C.have, { n: r.have })}
                </span>
                <span>{packs[r.item] ? `🛒 ${tr(C.packs, { n: packs[r.item] })}` : tr(C.noNeed)}</span>
                {shared && <span className="text-[10px] font-normal">🔗 ×{r.usedBy.length}</span>}
              </li>
            );
          })}
      </ul>
      {shortAfter.map((r) => (
        <Chip key={r.item} kind="warn">
          ⚠ {tr(C.short, { item: name(r.item) })} → {join(r.usedBy.map(dish))}
        </Chip>
      ))}
      {lack > 0 && <Chip kind="warn">⚠ {tr(C.noCash)}</Chip>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" className="min-h-14" onClick={() => ctl.dispatch({ t: 'toPlan' })} data-testid="r-back">
          ← {tr(C.back)}
        </Button>
        <Button size="lg" className="min-h-14 flex-1 text-xl" disabled={lack > 0} onClick={() => ctl.dispatch({ t: 'purchase', packs }, 'deliver')} data-testid="r-confirm-buy">
          🛒 {tr(C.buyFor, { cost })}
        </Button>
      </div>
    </>
  );
}

// ---------- cook ----------
function PrepDock({ ctl, s }: { ctl: RestaurantController; s: State }) {
  const { tr, name, dish } = useT();
  const preview = BATCH_ORDERS[s.batch - 1];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold" data-testid="r-preview">
        <span>👀 {tr(C.nextGuests)}</span>
        {preview.map((o) => (
          <img key={o} src={DISH_IMG[s.customers[o].likes]} alt={dish(s.customers[o].likes)} className="h-9 w-12 rounded-lg bg-[var(--surface-2)] object-contain" />
        ))}
        <span className="ml-auto rounded-lg bg-[var(--surface-2)] px-2 py-1 tabular-nums">🍳 {tr(C.cap, { n: s.madeThisBatch })}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {s.menu.map((d) => {
          const miss = missingItem(s, d);
          const why = miss ? tr(C.short, { item: name(miss) }) : s.madeThisBatch >= 4 ? tr(C.batchFull) : s.madeToday >= DAY_CAPACITY ? tr(C.dayFull) : null;
          return (
            <button
              key={d}
              type="button"
              disabled={!!why || maxAlone(s, d) < 1}
              onClick={() => ctl.dispatch({ t: 'prepare', dish: d, qty: 1 }, 'cook')}
              className="relative flex min-h-24 flex-col items-center rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 font-bold disabled:opacity-60"
              data-testid={`make1-${d}`}
              aria-label={`${dish(d)} +1${why ? ` (${why})` : ''}`}
            >
              <img src={DISH_IMG[d]} alt="" className="h-14 w-20 object-contain sm:h-16 sm:w-24" />
              <span className="text-sm leading-tight sm:text-base">{dish(d)}</span>
              <span className="text-xs">{tr(C.ready, { n: readyCount(s, d) })}</span>
              {why && <span className="mt-0.5 rounded bg-[var(--warn-bg)] px-1 text-xs text-[var(--warn-text)]">⚠ {why}</span>}
            </button>
          );
        })}
      </div>
      <Button size="lg" className="min-h-14 w-full text-xl" onClick={() => ctl.dispatch({ t: 'openService' }, 'arrive')} data-testid="r-open">
        {s.madeThisBatch > 0 ? `🔔 ${tr(C.serveGuests)}` : `⏭ ${tr(C.skipCook)}`}
      </Button>
    </>
  );
}

// ---------- serve ----------
function ServeDock({ ctl, s, guest }: { ctl: RestaurantController; s: State; guest: number | null }) {
  const { tr, dish } = useT();
  const ok = guest !== null ? suitable(s, guest) : [];
  if (guest === null)
    return (
      <Button size="lg" className="min-h-14 w-full text-xl" onClick={() => ctl.dispatch({ t: 'endBatch' }, s.batch === 2 ? 'night' : null)} data-testid="r-end-batch">
        {s.batch === 1 ? `🍳 ${tr(C.nextBatch)}` : `🌙 ${tr(C.closeShop)}`}
      </Button>
    );
  const c = s.customers[guest];
  return (
    <>
      <p className="text-sm font-bold" data-testid="r-guest" data-guest={guest}>
        🙂 {[c.likes, c.alsoAccepts]
          .filter((d): d is DishId => !!d)
          .map(dish)
          .join(` ${tr(C.or)} `)}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {s.menu.map((d) => {
          const n = readyCount(s, d);
          const can = ok.includes(d);
          return (
            <button key={d} type="button" disabled={!can} onClick={() => ctl.dispatch({ t: 'serve', order: guest, dish: d }, 'serve')} className={`flex min-h-24 flex-col items-center rounded-2xl border-2 p-1 font-bold disabled:opacity-50 ${can ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`} data-testid={`plate-${d}`} aria-label={`${dish(d)} ×${n}`}>
              <img src={DISH_IMG[d]} alt="" className="h-14 w-20 object-contain sm:h-16 sm:w-24" />
              <span className="text-sm sm:text-base">{dish(d)}</span>
              <span className="text-xs tabular-nums">
                ×{n} {!can && (n === 0 ? '· ∅' : '· ✕')}
              </span>
            </button>
          );
        })}
      </div>
      {!ok.length && (
        <Button size="lg" variant="secondary" className="min-h-14 w-full text-xl" onClick={() => ctl.dispatch({ t: 'serve', order: guest, dish: null }, 'nomatch')} data-testid="r-nomatch">
          🙇 {tr(C.notToday)}
        </Button>
      )}
    </>
  );
}

// ---------- closing ----------
function CloseDock({ ctl, s, onRestart }: { ctl: RestaurantController; s: State; onRestart: () => void }) {
  const { tr, join, name } = useT();
  const r = s.results[s.results.length - 1];
  const [reflect, setReflect] = useState(true);
  const tomorrow = ITEM_IDS.filter((i) => i !== 'packaging' && s.lots.some((l) => l.item === i && (l.lastDay === null || l.lastDay >= s.day + 1)));
  const missed = s.orders.filter((o) => o.status === 'no_match').length;
  const question = tomorrow.length ? tr(C.reflectStock, { items: join(tomorrow.map(name)) }) : r.wastedServings ? tr(C.reflectWaste, { n: r.wastedServings }) : missed ? tr(C.reflectMissed, { n: missed }) : tr(C.reflectGood);
  return (
    <>
      <div className="flex flex-wrap gap-2 text-lg font-bold" data-testid="r-result" data-result={r.result} data-cash={r.cashClose} data-sold={r.soldCount}>
        <span className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3">🙂 {tr(C.served, { n: r.soldCount })}</span>
        <span className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3">📈 {tr(C.result, { n: r.result })}</span>
        <span className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3">💰 {tr(C.cashNow, { n: s.cash })}</span>
      </div>
      {reflect && (
        <div className="flex items-center gap-2 rounded-xl bg-[var(--info-bg)] px-3 py-2 text-[var(--info-text)]" data-testid="r-reflect">
          <span className="flex-1">🤔 {question}</span>
          <Button size="sm" variant="secondary" onClick={() => setReflect(false)}>
            {tr(C.skip)}
          </Button>
        </div>
      )}
      {s.phase === 'closed' ? (
        <div className="space-y-2" data-testid="r-decor">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="min-h-14 flex-1 text-xl" disabled={s.cash < DECOR.price} onClick={() => ctl.dispatch({ t: 'decor', buy: true }, 'plant')} data-testid="r-decor-buy">
              🪴 {tr(C.buyPlant)}
            </Button>
            <Button size="lg" variant="secondary" className="min-h-14 flex-1 text-xl" onClick={() => ctl.dispatch({ t: 'decor', buy: false })} data-testid="r-decor-skip">
              🐷 {tr(C.saveCoins)}
            </Button>
          </div>
          <p className="text-sm">
            🪴 {tr(C.plantNote)} · {tr(C.after, { n: s.cash - DECOR.price })}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="r-done">
          <p className="text-sm">💡 {tr(C.tryNew)}</p>
          <Button size="lg" className="min-h-14 w-full text-xl" onClick={onRestart} data-testid="r-replay">
            ↺ {tr(C.playAgain)}
          </Button>
        </div>
      )}
    </>
  );
}

// ---------- Little ledger (optional, full detail) ----------
function Ledger({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, lang, name, dish, join } = useT();
  const s = v.s;
  const L = C.L;
  const rows = buyRows(s);
  const packs = draftPacks(s, v.draft);
  const cost = packsCost(packs);
  const cmp = separateVsCombined(s);
  const r = s.results[s.results.length - 1];
  const editable = s.phase === 'buy' && !v.paused && v.fx === null;
  const a = available(s);
  const line = (k: L, val: ReactNode, strong = false) => (
    <>
      <dt className={strong ? 'font-bold' : ''}>{tr(k)}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{val}</dd>
    </>
  );
  const neg = (n: number) => (n > 0 ? `−${n}` : '0');
  return (
    <aside id="rs-ledger" className="m-4 mt-0 space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm" data-testid="r-ledger" aria-label={tr(L.title)}>
      <h2 className="text-lg font-extrabold">📒 {tr(L.title)}</h2>
      <section className="space-y-1">
        <h3 className="font-bold">{tr(L.recipes)}</h3>
        <ul className="space-y-1">
          {DISH_IDS.map((d) => (
            <li key={d}>
              <strong>{dish(d)}</strong>：
              {Object.entries(DISHES[d].recipe)
                .map(([i, q]) => `${name(i as ItemId)}×${q}`)
                .join(' + ')}{' '}
              · {tr(L.cost)} {dishCost(d)} · {tr(L.price)} {DISHES[d].price} · {tr(L.left)} {DISHES[d].price - dishCost(d)}
            </li>
          ))}
        </ul>
        <p className="text-[var(--muted)]">{tr(L.leftNote)}</p>
      </section>
      {(s.phase === 'plan' || s.phase === 'buy') && (
        <section className="space-y-2" data-testid="r-ledger-buy">
          <h3 className="font-bold">{tr(L.buy)}</h3>
          <div className="space-y-2">
            {rows
              .filter((x) => x.need > 0 || x.have > 0)
              .map((x) => (
                <div key={x.item} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--surface)] p-2" data-item={x.item}>
                  <img src={ITEM_IMG[x.item]} alt="" className="h-8 w-8" />
                  <strong className="w-12">{name(x.item)}</strong>
                  <span>
                    {tr(L.needCol)} {x.need} · {tr(L.haveCol)} {x.have} · {tr(L.shortCol)} {x.short}
                  </span>
                  <span className="text-[var(--muted)]">
                    {tr(L.packCol)} {x.packSize}/{ITEMS[x.item].packPrice}
                  </span>
                  <span className="ml-auto flex items-center gap-1" role="group" aria-label={`${name(x.item)} ${tr(L.buyCol)}`} data-testid={`pack-${x.item}`} data-value={packs[x.item]}>
                    <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)] text-xl disabled:opacity-40" aria-label="−" disabled={!editable || packs[x.item] <= 0} onClick={() => ctl.setDraft({ ...packs, [x.item]: packs[x.item] - 1 })}>
                      −
                    </button>
                    <output className="w-6 text-center font-bold tabular-nums">{packs[x.item]}</output>
                    <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)] text-xl disabled:opacity-40" aria-label="+" disabled={!editable || packs[x.item] >= 20} onClick={() => ctl.setDraft({ ...packs, [x.item]: packs[x.item] + 1 })}>
                      +
                    </button>
                  </span>
                  <span className="w-full text-[var(--muted)] sm:w-auto">
                    {tr(L.extraCol)} {Math.max(0, x.have + packs[x.item] * x.packSize - x.need)}
                  </span>
                </div>
              ))}
          </div>
          <p>{tr(L.spend, { n: cost, m: s.cash - cost })}</p>
          <p data-testid="r-compare">
            {cmp.separate > cmp.combined
              ? tr(L.compare, { sep: cmp.separate, comb: cmp.combined, value: cmp.extraValue, extra: join(Object.entries(cmp.extra).map(([i, q]) => `${name(i as ItemId)} ${q}`)) })
              : tr(L.same, { comb: cmp.combined })}
          </p>
        </section>
      )}
      <section className="space-y-1">
        <h3 className="font-bold">{tr(L.stock)}</h3>
        <ul className="grid gap-1 sm:grid-cols-2">
          {ITEM_IDS.filter((i) => a[i] > 0).map((i) => (
            <li key={i}>
              {name(i)} {a[i]}（
              {[...new Set(s.lots.filter((l) => l.item === i && (l.lastDay === null || l.lastDay >= s.day)).map((l) => (l.lastDay === null ? tr(L.never) : tr(L.useBy, { n: l.lastDay }))))].join('；')}）
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1" data-testid="r-books" data-revenue={r?.revenue} data-cogs={r?.cogs} data-waste={r ? r.wasteCooked + r.wasteRaw : undefined} data-result={r?.result} data-cash={r?.cashClose}>
        <h3 className="font-bold">{tr(L.day)}</h3>
        {r ? (
          <>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
              {line(L.revenue, r.revenue)}
              {line(L.cogs, neg(r.cogs))}
              {line(L.wasteCooked, neg(r.wasteCooked))}
              {line(L.wasteRaw, neg(r.wasteRaw))}
              {line(L.fixed, neg(r.fixed))}
              {line(L.result, r.result, true)}
            </dl>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-[var(--border)] pt-1">
              {line(L.cashOpen, r.cashOpen)}
              {line(L.purchases, neg(r.purchases))}
              {line(L.revenue, `+${r.revenue}`)}
              {line(L.fixed, neg(r.fixed))}
              {line(L.cashClose, r.cashClose, true)}
              {r.decor > 0 && line(L.decor, neg(r.decor))}
              {line(L.inv, r.inventoryValue)}
            </dl>
            <p className="text-[var(--muted)]">{tr(L.note)}</p>
          </>
        ) : (
          <p className="text-[var(--muted)]">{tr(L.notYet)}</p>
        )}
      </section>
      <p className="sr-only">{lang}</p>
    </aside>
  );
}
