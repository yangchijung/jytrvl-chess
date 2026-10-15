import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { format, useI18n } from '../i18n';
import { Button, Card, Notice, PageTitle } from '../components/ui';
import { BATCH_ORDERS, DECOR, DISHES, DISH_IDS, FIXED_FEE, ITEMS, ITEM_IDS, dishCost, type ItemId } from '../../shared/restaurant/data';
import { available, buyRows, currentOrders, inventoryValue, maxAlone, needs, packsCost, readyCount, separateVsCombined, suitable, type State } from '../../shared/restaurant/engine';
import { RestaurantController, type RView } from './game';
import { C } from './copy';

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
  return { lang, tr: (l: L, vars?: Record<string, string | number>) => format(l[lang], vars) };
}

const STEP_KEYS = ['plan', 'buy', 'prep1', 'prep2', 'closed', 'done'] as const;
function stepOf(s: State): (typeof STEP_KEYS)[number] {
  if (s.phase === 'plan') return 'plan';
  if (s.phase === 'buy') return 'buy';
  if (s.phase === 'prep' || s.phase === 'serve') return s.batch === 1 ? 'prep1' : 'prep2';
  return s.phase;
}

export function RestaurantPage() {
  const { ctl, v } = useR();
  const { tr } = useT();
  const s = v.s;
  const step = stepOf(s);
  return (
    <div className="space-y-5" data-testid="restaurant" data-phase={s.phase} data-batch={s.batch} data-cash={s.cash}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle sub={`${tr(C.proto)} · ${tr(C.sub)}`}>🏪 {tr(C.title)}</PageTitle>
        <div className="text-right">
          <p className="text-sm text-[var(--muted)]">{tr(C.day, { n: s.day })}</p>
          <p className="font-serif text-2xl tabular-nums" data-testid="r-cash">
            💰 {tr(C.cash)} {s.cash}
          </p>
          <p className="text-xs text-[var(--muted)]" aria-live="polite">
            {v.saveState === 'saved' ? `✓ ${tr(C.saved)}` : v.saveState === 'failed' ? `⚠ ${tr(C.saveFailed)}` : ''}
          </p>
        </div>
      </div>
      {v.invalid && <Notice kind="error">{tr(C.invalid)}</Notice>}
      <ol className="flex flex-wrap gap-1 text-sm" aria-label="steps">
        {STEP_KEYS.map((k, i) => {
          const cur = k === step;
          const done = STEP_KEYS.indexOf(step) > i;
          return (
            <li key={k} aria-current={cur ? 'step' : undefined} className={`rounded-full border px-3 py-1 ${cur ? 'border-[var(--accent-text)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-text)]' : done ? 'border-[var(--border)] text-[var(--muted)]' : 'border-[var(--border)]'}`}>
              {done ? '✓ ' : `${i + 1}. `}
              {tr(C.steps[k])}
            </li>
          );
        })}
      </ol>
      {v.error && C.err[v.error as keyof typeof C.err] && (
        <Notice kind="warning" actions={<Button variant="secondary" size="sm" onClick={() => ctl.clearError()}>✕</Button>}>
          <span data-testid="r-error">{tr(C.err[v.error as keyof typeof C.err])}</span>
        </Notice>
      )}
      {s.phase === 'plan' && <PlanStep ctl={ctl} v={v} />}
      {s.phase === 'buy' && <BuyStep ctl={ctl} v={v} />}
      {s.phase === 'prep' && <PrepStep ctl={ctl} v={v} />}
      {s.phase === 'serve' && <ServeStep ctl={ctl} v={v} />}
      {(s.phase === 'closed' || s.phase === 'done') && <CloseStep ctl={ctl} v={v} />}
      {s.phase !== 'done' && s.phase !== 'plan' && (
        <Button variant="ghost" className="w-full" onClick={() => ctl.restart()} data-testid="r-restart">
          ↺ {tr(C.restart)}
        </Button>
      )}
    </div>
  );
}

function Money({ n, minus }: { n: number; minus?: boolean }) {
  const v = Math.round(n * 100) / 100;
  return <span className="tabular-nums">{minus && v > 0 ? `−${v}` : v}</span>;
}

// ---------- 1 menu ----------
function PlanStep({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, lang } = useT();
  const s = v.s;
  const [focus, setFocus] = useState<ItemId | null>(null);
  const n = needs(s);
  return (
    <div className="space-y-4">
      <Card className="space-y-1">
        <p>👥 {tr(C.guests)}</p>
        <p className="text-sm text-[var(--muted)]">🏠 {tr(C.fixedNote)}</p>
      </Card>
      <h2 className="font-serif text-xl font-bold">{tr(C.menuTitle)}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {DISH_IDS.map((d) => {
          const on = s.menu.includes(d);
          const dish = DISHES[d];
          const cost = dishCost(d);
          const hit = focus && (dish.recipe[focus] ?? 0) > 0;
          return (
            <Card key={d} className={`space-y-3 ${hit ? 'ring-4 ring-[var(--gold)]' : ''}`} data-testid={`dish-${d}`} data-on={on}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  <span aria-hidden="true">{dish.icon}</span> {dish.name[lang]}
                </h3>
                <Button variant={on ? 'primary' : 'secondary'} size="sm" aria-pressed={on} onClick={() => ctl.dispatch({ t: 'setMenu', dish: d, on: !on })}>
                  {on ? `✓ ${tr(C.onMenu)}` : tr(C.offMenu)}
                </Button>
              </div>
              <p className="text-sm">
                {tr(C.recipe)}：
                {Object.entries(dish.recipe)
                  .map(([i, q]) => `${ITEMS[i as ItemId].icon}${ITEMS[i as ItemId].name[lang]}×${q}`)
                  .join(' + ')}
              </p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-2 text-sm">
                <dt>{tr(C.price)}</dt>
                <dd className="text-right tabular-nums">{dish.price}</dd>
                <dt>{tr(C.costPer)}</dt>
                <dd className="text-right tabular-nums">
                  {Object.entries(dish.recipe)
                    .map(([i, q]) => (ITEMS[i as ItemId].packPrice / ITEMS[i as ItemId].packSize) * (q ?? 0))
                    .join('+')}
                  ={cost}
                </dd>
                <dt className="font-semibold">{tr(C.leftPer)}</dt>
                <dd className="text-right font-semibold tabular-nums">{dish.price - cost}</dd>
              </dl>
              {on && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{tr(C.servings)}</span>
                  <Stepper value={s.plan[d]} min={0} max={8} onChange={(x) => ctl.dispatch({ t: 'setPlan', dish: d, n: x })} label={`${dish.name[lang]} ${tr(C.servings)}`} testid={`plan-${d}`} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-[var(--muted)]">{tr(C.leftNote)}</p>
      <Card className="space-y-3">
        <h3 className="font-semibold">{tr(C.shared)}</h3>
        <div className="flex flex-wrap gap-2">
          {ITEM_IDS.filter((i) => i !== 'packaging').map((i) => (
            <Button key={i} variant={focus === i ? 'primary' : 'secondary'} size="sm" aria-pressed={focus === i} onClick={() => setFocus(focus === i ? null : i)}>
              {ITEMS[i].icon} {ITEMS[i].name[lang]}
            </Button>
          ))}
        </div>
        {focus && (
          <p data-testid="r-usedby">
            {(() => {
              const ds = s.menu.filter((d) => (DISHES[d].recipe[focus] ?? 0) > 0);
              const all = DISH_IDS.filter((d) => (DISHES[d].recipe[focus] ?? 0) > 0);
              return ds.length ? tr(C.usedBy, { item: ITEMS[focus].name[lang], dishes: all.map((d) => DISHES[d].name[lang] + (s.menu.includes(d) ? '' : lang === 'zh' ? '（未上架）' : ' (not on menu)')).join(lang === 'zh' ? '、' : ', ') }) : tr(C.usedByNone, { item: ITEMS[focus].name[lang] });
            })()}
          </p>
        )}
        <h3 className="font-semibold">{tr(C.needTitle)}</h3>
        <ul className="flex flex-wrap gap-2 text-sm" data-testid="r-needs">
          {ITEM_IDS.filter((i) => n[i] > 0).map((i) => (
            <li key={i} className="rounded-lg border border-[var(--border)] px-2 py-1" data-item={i} data-need={n[i]}>
              {ITEMS[i].icon} {ITEMS[i].name[lang]} {n[i]} {ITEMS[i].unit[lang]}
            </li>
          ))}
        </ul>
      </Card>
      {!s.menu.length && <Notice kind="info">{tr(C.emptyMenu)}</Notice>}
      <Button size="lg" className="w-full" disabled={!s.menu.length} onClick={() => ctl.dispatch({ t: 'toBuy' })} data-testid="r-to-buy">
        {tr(C.toBuy)} →
      </Button>
    </div>
  );
}

function Stepper({ value, min, max, onChange, label, testid }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; testid?: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label} data-testid={testid} data-value={value}>
      <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)] text-xl disabled:opacity-40" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="−">
        −
      </button>
      <span className="w-8 text-center text-lg tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className="h-11 w-11 rounded-lg border border-[var(--border)] text-xl disabled:opacity-40" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="+">
        +
      </button>
    </div>
  );
}

// ---------- 2 shopping ----------
function BuyStep({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, lang } = useT();
  const s = v.s;
  const rows = buyRows(s);
  const [packs, setPacks] = useState<Record<ItemId, number>>(() => Object.fromEntries(rows.map((r) => [r.item, r.suggested])) as Record<ItemId, number>);
  const total = packsCost(packs);
  const after = s.cash - total;
  const lackCash = total - (s.cash - FIXED_FEE);
  const cmp = separateVsCombined(s);
  const join = (xs: string[]) => xs.join(lang === 'zh' ? '、' : ', ');
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-bold">{tr(C.buyTitle)}</h2>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[640px] text-sm" data-testid="r-buy-table">
          <thead className="bg-[var(--surface-2)] text-left">
            <tr>
              {(['item', 'need', 'have', 'short', 'pack', 'suggest', 'buy', 'extra'] as const).map((k) => (
                <th key={k} className="px-2 py-2 font-semibold">
                  {tr(C.col[k])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.need > 0 || r.have > 0)
              .map((r) => {
                const bought = (packs[r.item] ?? 0) * r.packSize;
                return (
                  <tr key={r.item} className="border-t border-[var(--border)]" data-item={r.item} data-need={r.need} data-have={r.have} data-short={r.short} data-suggest={r.suggested}>
                    <td className="px-2 py-1">
                      {ITEMS[r.item].icon} {ITEMS[r.item].name[lang]}
                    </td>
                    <td className="px-2 tabular-nums">{r.need}</td>
                    <td className="px-2 tabular-nums">{r.have}</td>
                    <td className="px-2 tabular-nums">{r.short ? <strong>{r.short}</strong> : 0}</td>
                    <td className="px-2 tabular-nums">
                      {r.packSize} / {ITEMS[r.item].packPrice}
                    </td>
                    <td className="px-2 tabular-nums">{r.suggested}</td>
                    <td className="px-2">
                      <Stepper value={packs[r.item] ?? 0} min={0} max={20} onChange={(x) => setPacks({ ...packs, [r.item]: x })} label={`${ITEMS[r.item].name[lang]} ${tr(C.col.buy)}`} testid={`buy-${r.item}`} />
                    </td>
                    <td className="px-2 tabular-nums">{Math.max(0, r.have + bought - r.need)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {rows
        .filter((r) => r.need > r.have + (packs[r.item] ?? 0) * r.packSize)
        .map((r) => (
          <Notice key={r.item} kind="warning">
            {tr(C.shortWarn, { item: ITEMS[r.item].name[lang], n: r.need - r.have - (packs[r.item] ?? 0) * r.packSize, dishes: join(r.usedBy.map((d) => DISHES[d].name[lang])) })}
          </Notice>
        ))}
      <Card className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <span>{tr(C.spend)}</span>
        <strong className="text-right tabular-nums" data-testid="r-spend">
          {total}
        </strong>
        <span>{tr(C.reserve)}</span>
        <span className="text-right tabular-nums">{FIXED_FEE}</span>
        <span>{tr(C.after)}</span>
        <span className="text-right tabular-nums">{after}</span>
      </Card>
      {lackCash > 0 && <Notice kind="error">{tr(C.notEnoughCash, { n: lackCash })}</Notice>}
      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" data-testid="r-compare">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">💡 {tr(C.compareTitle)}</summary>
        <p className="mt-2">
          {cmp.separate > cmp.combined
            ? tr(C.compareBody, {
                sep: cmp.separate,
                comb: cmp.combined,
                value: cmp.extraValue,
                extra: join(Object.entries(cmp.extra).map(([i, q]) => `${ITEMS[i as ItemId].name[lang]} ${q} ${ITEMS[i as ItemId].unit[lang]}`)),
              })
            : tr(C.compareSame, { comb: cmp.combined })}
        </p>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => ctl.dispatch({ t: 'toPlan' })}>
          ← {tr(C.back)}
        </Button>
        <Button variant="secondary" onClick={() => setPacks(Object.fromEntries(rows.map((r) => [r.item, r.suggested])) as Record<ItemId, number>)}>
          {tr(C.useSuggested)}
        </Button>
        <Button size="lg" className="flex-1" disabled={lackCash > 0} onClick={() => ctl.dispatch({ t: 'purchase', packs })} data-testid="r-confirm-buy">
          {tr(C.confirmBuy)}（{total}）
        </Button>
      </div>
    </div>
  );
}

// ---------- 3/4 cooking ----------
function StockPanel({ s }: { s: State }) {
  const { tr, lang } = useT();
  const a = available(s);
  return (
    <Card className="space-y-2">
      <h3 className="font-semibold">{tr(C.stockTitle)}</h3>
      <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="r-stock">
        {ITEM_IDS.filter((i) => a[i] > 0).map((i) => {
          const lots = s.lots.filter((l) => l.item === i && (l.lastDay === null || l.lastDay >= s.day));
          return (
            <li key={i} data-item={i} data-qty={a[i]}>
              {ITEMS[i].icon} {ITEMS[i].name[lang]} <strong>{a[i]}</strong> {ITEMS[i].unit[lang]}{' '}
              <span className="text-[var(--muted)]">（{[...new Set(lots.map((l) => (l.lastDay === null ? tr(C.noExpiry) : tr(C.lastDay, { n: l.lastDay }))))].join('；')}）</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ReadyPanel({ s }: { s: State }) {
  const { tr, lang } = useT();
  return (
    <Card className="space-y-2">
      <h3 className="font-semibold">{tr(C.readyTitle)}</h3>
      <ul className="flex flex-wrap gap-2 text-sm" data-testid="r-ready">
        {s.menu.map((d) => (
          <li key={d} className="rounded-lg border border-[var(--border)] px-2 py-1" data-dish={d} data-ready={readyCount(s, d)}>
            {DISHES[d].icon} {DISHES[d].name[lang]} × {readyCount(s, d)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OrderLine({ s, o }: { s: State; o: number }) {
  const { tr, lang } = useT();
  const c = s.customers[o];
  return (
    <span>
      {tr(C.guest, { n: o + 1 })}：{tr(C.likes)} {DISHES[c.likes].name[lang]}；{c.alsoAccepts ? `${tr(C.accepts)} ${DISHES[c.alsoAccepts].name[lang]}` : tr(C.acceptsNone)}；{tr(C.budget, { n: c.budget })}
    </span>
  );
}

function PrepStep({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, lang } = useT();
  const s = v.s;
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-bold">{tr(C.prepTitle, { b: s.batch })}</h2>
      <div className="flex flex-wrap gap-3 text-sm" data-testid="r-capacity">
        <span className="rounded-lg bg-[var(--surface-2)] px-3 py-2">🍳 {tr(C.capBatch, { n: s.madeThisBatch })}</span>
        <span className="rounded-lg bg-[var(--surface-2)] px-3 py-2">📅 {tr(C.capDay, { n: s.madeToday })}</span>
      </div>
      {s.batch === 1 ? (
        <Card>👥 {tr(C.guests)}</Card>
      ) : (
        <Card className="space-y-1">
          <p className="font-semibold">{tr(C.batch2Orders)}</p>
          <ul className="text-sm">
            {BATCH_ORDERS[1].map((o) => (
              <li key={o}>
                <OrderLine s={s} o={o} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {s.menu.map((d) => {
          const m = maxAlone(s, d);
          return (
            <Card key={d} className="space-y-2" data-testid={`prep-${d}`} data-max={m}>
              <h3 className="font-semibold">
                {DISHES[d].icon} {DISHES[d].name[lang]}
              </h3>
              <p className="text-sm">{tr(C.planLeft, { n: s.plan[d] })}</p>
              <p className="text-sm text-[var(--muted)]">{tr(C.maxAlone, { n: m })}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => ctl.dispatch({ t: 'prepare', dish: d, qty: 1 })} data-testid={`make1-${d}`}>
                  {tr(C.make, { n: 1 })}
                </Button>
                {s.plan[d] > 1 && Math.min(s.plan[d], m) > 1 && (
                  <Button size="sm" variant="secondary" onClick={() => ctl.dispatch({ t: 'prepare', dish: d, qty: Math.min(s.plan[d], m) })}>
                    {tr(C.make, { n: Math.min(s.plan[d], m) })}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <StockPanel s={s} />
        <ReadyPanel s={s} />
      </div>
      <p className="text-sm text-[var(--muted)]">{tr(C.keepRaw)}</p>
      <Button size="lg" className="w-full" onClick={() => ctl.dispatch({ t: 'openService' })} data-testid="r-open">
        🔔 {tr(C.open)}
      </Button>
    </div>
  );
}

// ---------- serving ----------
function ServeStep({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, lang } = useT();
  const s = v.s;
  const orders = currentOrders(s);
  const pending = orders.some((o) => s.orders[o].status === 'pending');
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-bold">{tr(C.serveTitle, { b: s.batch })}</h2>
      <ReadyPanel s={s} />
      <div className="space-y-3">
        {orders.map((o) => {
          const st = s.orders[o];
          const c = s.customers[o];
          const ok = suitable(s, o);
          return (
            <Card key={o} className="space-y-2" data-testid={`order-${o}`} data-status={st.status}>
              <p>
                🙂 <OrderLine s={s} o={o} />
              </p>
              {st.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  {s.menu.map((d) => {
                    const why = readyCount(s, d) === 0 ? 'not_ready' : d !== c.likes && d !== c.alsoAccepts ? 'not_accepted' : DISHES[d].price > c.budget ? 'over_budget' : null;
                    return (
                      <Button key={d} size="sm" variant={ok.includes(d) ? 'primary' : 'secondary'} disabled={!!why} onClick={() => ctl.dispatch({ t: 'serve', order: o, dish: d })} data-dish={d}>
                        {tr(C.sell, { dish: DISHES[d].name[lang], price: DISHES[d].price })}
                        {why ? `（${tr(C.reason[why])}）` : ''}
                      </Button>
                    );
                  })}
                  <Button size="sm" variant="ghost" disabled={ok.length > 0} onClick={() => ctl.dispatch({ t: 'serve', order: o, dish: null })} data-nomatch>
                    {tr(C.noMatch)}
                  </Button>
                </div>
              ) : st.status === 'sold' ? (
                <p className="font-semibold text-[var(--accent-text)]">{tr(C.soldTo, { dish: DISHES[st.dish].name[lang], price: st.price })}</p>
              ) : (
                <p className="text-[var(--muted)]">{tr(C.noSale)}</p>
              )}
            </Card>
          );
        })}
      </div>
      {pending && <p className="text-sm text-[var(--muted)]">{tr(C.pending)}</p>}
      <Button size="lg" className="w-full" disabled={pending} onClick={() => ctl.dispatch({ t: 'endBatch' })} data-testid="r-end-batch">
        {s.batch === 1 ? tr(C.endBatch1) : `🌙 ${tr(C.close)}`}
      </Button>
    </div>
  );
}

// ---------- closing & decor ----------
function CloseStep({ ctl, v }: { ctl: RestaurantController; v: RView }) {
  const { tr, lang } = useT();
  const s = v.s;
  const r = s.results[s.results.length - 1];
  const row = (k: keyof typeof C.row, val: ReactNode, strong = false, test?: string) => (
    <>
      <dt className={strong ? 'font-semibold' : ''}>{tr(C.row[k])}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-semibold' : ''}`} data-testid={test}>
        {val}
      </dd>
    </>
  );
  const [reflect, setReflect] = useState(true);
  return (
    <div className="space-y-4">
      <Card className="space-y-3" data-testid="r-ledger" data-revenue={r.revenue} data-cogs={r.cogs} data-waste={r.wasteCooked + r.wasteRaw} data-result={r.result} data-cash={r.cashClose}>
        <h2 className="font-serif text-xl font-bold">📒 {tr(C.ledgerTitle)}</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          {row('revenue', <Money n={r.revenue} />)}
          {row('cogs', <Money n={r.cogs} minus />)}
          {row('wasteCooked', <Money n={r.wasteCooked} minus />)}
          {row('wasteRaw', <Money n={r.wasteRaw} minus />)}
          {row('fixed', <>−{r.fixed}</>)}
          {row('result', <Money n={r.result} />, true, 'r-result')}
        </dl>
        <hr className="border-[var(--border)]" />
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {row('cashOpen', r.cashOpen)}
          {row('purchases', <Money n={r.purchases} minus />)}
          {row('revenue', <>+<Money n={r.revenue} /></>)}
          {row('fixed', <>−{r.fixed}</>)}
          {row('cashClose', r.cashClose, true, 'r-cash-close')}
          {row('stock', <Money n={r.inventoryValue} />)}
        </dl>
        <p className="text-sm text-[var(--muted)]">{tr(C.ledgerNote)}</p>
      </Card>
      {reflect && (
        <Notice kind="info" actions={<Button variant="secondary" size="sm" onClick={() => setReflect(false)}>✕</Button>}>
          🤔 {tr(C.reflect)}
        </Notice>
      )}
      {s.phase === 'closed' ? (
        <Card className="space-y-3" data-testid="r-decor">
          <h2 className="font-serif text-xl font-bold">
            {DECOR.icon} {tr(C.decorTitle)}
          </h2>
          <p>{tr(C.decorBody, { n: s.cash - DECOR.price })}</p>
          {s.cash < DECOR.price && <Notice kind="warning">{tr(C.decorCash)}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={s.cash < DECOR.price} onClick={() => ctl.dispatch({ t: 'decor', buy: true })} data-testid="r-decor-buy">
              {tr(C.decorBuy)}（−{DECOR.price}）
            </Button>
            <Button variant="secondary" onClick={() => ctl.dispatch({ t: 'decor', buy: false })} data-testid="r-decor-skip">
              {tr(C.decorSkip)}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-3" data-testid="r-done">
          <h2 className="font-serif text-xl font-bold">🎉 {tr(C.doneTitle)}</h2>
          <p className="text-4xl" aria-hidden="true">
            🏪{s.decor.includes('plant') ? DECOR.icon : ''}
          </p>
          <p>
            💰 {tr(C.cash)} {s.cash}
          </p>
          <h3 className="font-semibold">{tr(C.tomorrow)}</h3>
          {s.lots.filter((l) => l.lastDay === null || l.lastDay >= s.day + 1).length ? (
            <ul className="text-sm" data-testid="r-tomorrow">
              {ITEM_IDS.map((i) => {
                const q = s.lots.filter((l) => l.item === i && (l.lastDay === null || l.lastDay >= s.day + 1)).reduce((n, l) => n + l.qty, 0);
                return q ? (
                  <li key={i}>
                    {ITEMS[i].icon} {ITEMS[i].name[lang]} {q} {ITEMS[i].unit[lang]}
                  </li>
                ) : null;
              })}
            </ul>
          ) : (
            <p className="text-sm">{tr(C.tomorrowNone)}</p>
          )}
          <p className="text-sm text-[var(--muted)]">{tr(C.sevenDayLater)}</p>
          <p className="text-xs text-[var(--muted)]">
            {tr(C.row.stock)}: <Money n={inventoryValue({ ...s, day: s.day + 1 })} />
          </p>
          <Button onClick={() => ctl.restart()} data-testid="r-replay">
            ↺ {tr(C.replay)}
          </Button>
        </Card>
      )}
    </div>
  );
}

