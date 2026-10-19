// Little Restaurant Owner V3 (guided play, R1). Task: welcome one guest at a time — see the dish they want,
// put its ingredients in the pan, cook one, serve it and watch the wallet grow. Planning stays, but in small
// steps: pick 1–2 dishes, the shop works out portions, buy everything together.
// Spec: docs/product/RESTAURANT_PLAYFUL_V3.md. Rules: shared/restaurant/engine.ts (guided actions).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { format, useI18n } from '../i18n';
import { Button, Modal } from '../components/ui';
import { DECOR, DISHES, DISH_IDS, FIXED_FEE, ITEMS, ITEM_IDS, type DishId, type ItemId } from '../../shared/restaurant/data';
import { available, buyRows, cookable, currentOrders, packsCost, panItems, readyCount, suitable, type State } from '../../shared/restaurant/engine';
import { V3Controller, type V3Save, type V3View } from './v3';
import './v3.css';
import bg from './assets/restaurant-background.svg';
import bunny from './assets/bunny.svg';
import fox from './assets/fox.svg';
import coin from './assets/coin.svg';
import plantImg from './assets/plant.svg';
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
const ITEM_NAME: Record<ItemId, L> = { ...Object.fromEntries(ITEM_IDS.map((i) => [i, ITEMS[i].name])), vegetable: { zh: '青菜', en: 'Greens' }, packaging: { zh: '餐盒', en: 'Box' } } as Record<ItemId, L>;
type L = { zh: string; en: string };

// short bilingual copy (V3 §5 table + states)
const T = {
  title: { zh: '餐廳當老闆', en: 'Little Restaurant Owner' },
  newTag: { zh: '新版試玩', en: 'New playtest' },
  menuQ: { zh: '今天賣什麼', en: "What's on the menu?" },
  pickTwo: { zh: '先選兩道', en: 'Pick up to two' },
  pickOne: { zh: '至少選一道', en: 'Pick at least one' },
  portions: { zh: '幫你算好份量', en: 'Portions worked out for you' },
  shareEgg: { zh: '兩道菜，同一箱蛋', en: 'Two dishes, one box of eggs' },
  goBuy: { zh: '去買食材', en: 'Go shopping' },
  buyTogether: { zh: '一起買齊 {n}', en: 'Buy together: {n}' },
  changeMenu: { zh: '換菜單', en: 'Change menu' },
  walletAfter: { zh: '錢包 {a} → {b}', en: 'Wallet {a} → {b}' },
  feeKept: { zh: '店租 {n} 先留著', en: '{n} kept for rent' },
  noCash: { zh: '錢不夠，少選一道', en: 'Not enough coins. Pick fewer dishes.' },
  wants: { zh: '想吃', en: 'Wants' },
  or: { zh: '或', en: 'or' },
  guest: { zh: '客人 {k}/6', en: 'Guest {k}/6' },
  whichDish: { zh: '做哪一道', en: 'Which dish' },
  putIn: { zh: '把食材放進鍋', en: 'Put ingredients in the pan' },
  pan: { zh: '鍋子', en: 'Pan' },
  emptySlot: { zh: '空位', en: 'Empty' },
  takeOut: { zh: '拿出{item}', en: 'Take out {item}' },
  cook: { zh: '煮一份', en: 'Cook one' },
  quick: { zh: '直接做一份', en: 'Quick cook' },
  plates: { zh: '做好的餐', en: 'Ready dishes' },
  noPlates: { zh: '還沒有做好的餐', en: 'Nothing ready yet' },
  serve: { zh: '送上桌', en: 'Serve' },
  pickPlate: { zh: '點一盤，再送上桌', en: 'Pick a dish, then serve' },
  keep: { zh: '這份先留著', en: 'Keep this dish for later' },
  needItem: { zh: '還缺{item}', en: '{item} needed' },
  notThis: { zh: '這道不用{item}', en: 'This dish has no {item}' },
  outOf: { zh: '{item}用完了', en: 'Out of {item}' },
  full: { zh: '這一輪做滿了', en: 'No room for more now' },
  notToday: { zh: '今天沒有', en: 'Not available today' },
  stock: { zh: '{n} {u}', en: '{n} {u}' },
  shared: { zh: '{dishes}都用', en: 'Used by {dishes}' },
  closed: { zh: '今天打烊了', en: 'Closed for today' },
  served: { zh: '服務 {n} 位', en: 'Served {n}' },
  today: { zh: '看看今天', en: "Today's results" },
  revenue: { zh: '收入', en: 'Sales' },
  cogs: { zh: '賣出餐點的食材', en: 'Ingredients of meals sold' },
  waste: { zh: '沒賣掉', en: 'Not sold' },
  fee: { zh: '店租', en: 'Rent' },
  result: { zh: '今天結餘', en: 'Day result' },
  cash: { zh: '錢包', en: 'Wallet' },
  stockLeft: { zh: '還能用的食材', en: 'Ingredients still usable' },
  hintEgg: { zh: '兩道菜，都用了蛋', en: 'Both dishes used eggs' },
  hintLeft: { zh: '有 {n} 份沒賣掉', en: '{n} dish(es) not sold' },
  hintMissed: { zh: '{n} 位客人今天沒吃到', en: '{n} guest(s) missed out today' },
  hintAll: { zh: '每位客人都吃到了', en: 'Every guest got a meal' },
  plant: { zh: '盆栽', en: 'Plant' },
  buyPlant: { zh: '買 {n}', en: 'Buy for {n}' },
  decoOnly: { zh: '只是裝飾', en: 'Decoration only' },
  cancel: { zh: '取消', en: 'Cancel' },
  saveCoins: { zh: '先存起來', en: 'Save the coins' },
  notEnough: { zh: '錢不夠買', en: 'Not enough coins' },
  again: { zh: '再玩一次', en: 'Play again' },
  againQ: { zh: '再玩一次？', en: 'Play again?' },
  againD: { zh: '會開新的一天，錢包回到 500。舊版的那一局不受影響。', en: 'A new day starts with 500 coins. The classic game is not affected.' },
  keepPlaying: { zh: '先不要', en: 'Not now' },
  saved: { zh: '已存好', en: 'Saved' },
  notSaved: { zh: '還沒存好，先別關掉', en: 'Not saved yet. Keep this page open.' },
  otherTab: { zh: '另一個分頁更新了進度', en: 'Updated from another tab' },
  tapAgain: { zh: '另一個分頁先更新了，這是最新進度，請再點一次', en: 'Another tab updated first. This is the latest game; please tap again.' },
  classic: { zh: '回到舊版這一局', en: 'Back to the classic game' },
  listen: { zh: '聽', en: 'Listen' },
  download: { zh: '下載舊進度', en: 'Download old progress' },
  broken: { zh: '舊進度讀不出來，已另外保留一份；這是新的一天。', en: 'The old progress could not be read. A copy was kept; this is a new day.' },
  brokenFuture: { zh: '這份進度來自較新的版本，已另外保留；這是新的一天。', en: 'This progress is from a newer version and was kept aside; this is a new day.' },
  brokenNoBackup: { zh: '舊進度讀不出來，也沒辦法備份；為了不蓋掉它，這次存在另一個位置。', en: 'The old progress could not be read or copied; this time it is saved in a separate place.' },
  brokenNoSave: { zh: '舊進度讀不出來，也沒辦法備份；這次不會存檔。', en: 'The old progress could not be read or copied; nothing is saved this time.' },
  noStorage: { zh: '這個瀏覽器不能存進度。', en: 'This browser cannot keep progress.' },
  restored: { zh: '接著玩上次存在另一個位置的進度。', en: 'Continuing the progress kept in the separate place.' },
  altKept: { zh: '另一個位置還留著一份舊進度，沒有蓋掉現在這局。', en: 'Older progress is still kept in a separate place; it did not replace this game.' },
};

function useV3() {
  const ctl = useMemo(() => new V3Controller(), []);
  useEffect(() => () => ctl.dispose(), [ctl]);
  const view = useSyncExternalStore(ctl.subscribe, ctl.snapshot, ctl.snapshot);
  useEffect(() => {
    (window as unknown as { __r3?: V3Controller }).__r3 = ctl;
  }, [ctl]);
  return { ctl, view };
}
function useT() {
  const { lang } = useI18n();
  const tr = (l: L, vars?: Record<string, string | number>) => format(l[lang], vars);
  return { lang, tr, unit: (i: ItemId) => ITEMS[i].unit[lang], item: (i: ItemId) => ITEM_NAME[i][lang], dish: (d: DishId) => DISHES[d].name[lang], join: (xs: string[]) => xs.join(lang === 'zh' ? '、' : ', ') };
}

/** The guest at the counter: the first unhandled order of the current group. */
const guestNow = (s: State) => (s.phase === 'serve' ? (currentOrders(s).find((o) => s.orders[o].status === 'pending') ?? null) : null);
/** Dish the pan suggests for a guest: their first choice if it is on the menu, else their alternative. */
function suggestDish(s: State, g: number | null): DishId | null {
  if (g === null) return s.menu[0] ?? null;
  const c = s.customers[g];
  return s.menu.includes(c.likes) ? c.likes : c.alsoAccepts && s.menu.includes(c.alsoAccepts) ? c.alsoAccepts : (s.menu[0] ?? null);
}

export function RestaurantV3({ hasClassic, onClassic }: { hasClassic: boolean; onClassic: () => void }) {
  const { ctl, view } = useV3();
  const { tr, lang } = useT();
  const { v } = view;
  const s = v.state;
  const [again, setAgain] = useState(false);
  const g = guestNow(s);
  const prompt = promptFor(view, g);
  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(tr(prompt));
      u.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech is optional; the game never needs sound */
    }
  };
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return (
    <section className="mx-auto max-w-5xl space-y-3" data-testid="r3" data-phase={s.phase} data-batch={s.batch} data-cash={s.cash} data-fx={view.fx ?? ''}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-[1.75rem] font-bold leading-9">
          {tr(T.title)} <span className="align-middle text-sm font-medium text-[var(--muted)]">· {tr(T.newTag)}</span>
        </h1>
        <p className={`r3-wallet flex items-center gap-2 text-2xl font-bold tabular-nums ${view.fx === 'serve' ? 'r3-pulse' : ''}`} data-testid="r3-cash" aria-label={`${tr(T.cash)} ${s.cash}`} key={`w${view.fxKey}`}>
          <img src={coin} alt="" className="h-8 w-8" />
          {s.cash}
        </p>
      </div>
      {view.notice && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert" data-testid="r3-notice" data-notice={view.notice}>
          <p>{tr(T[view.notice])}</p>
          {view.oldRaw && (
            <Button variant="secondary" size="sm" onClick={() => downloadText(view.oldRaw!)} data-testid="r3-download-old">
              {tr(T.download)}
            </Button>
          )}
        </div>
      )}
      {(view.otherTab || view.conflict) && (
        <p className="rounded-md bg-[var(--surface-2)] px-3 py-2" role="status" data-testid="r3-other-tab" data-conflict={view.conflict}>
          {tr(view.conflict ? T.tapAgain : T.otherTab)}
        </p>
      )}

      {/* stage: the guest and what they want (cropped scene, no dashboard) */}
      <Stage view={view} guest={g} />

      <div className="flex min-h-12 items-center gap-2" data-testid="r3-prompt">
        <p className="text-lg font-bold" role="status" aria-live="polite">
          {tr(prompt)}
        </p>
        {canSpeak && (
          <Button variant="secondary" size="sm" className="min-w-11" onClick={speak} data-testid="r3-listen">
            {tr(T.listen)}
          </Button>
        )}
      </div>

      {s.phase === 'plan' && <PlanStep ctl={ctl} view={view} />}
      {s.phase === 'buy' && <BuyStep ctl={ctl} s={s} />}
      {s.phase === 'serve' && <ServeStep ctl={ctl} view={view} guest={g} />}
      {(s.phase === 'closed' || s.phase === 'done') && <CloseStep ctl={ctl} view={view} onAgain={() => setAgain(true)} />}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
        <span aria-live="polite" data-testid="r3-save">
          {view.saveState === 'saved' ? tr(T.saved) : view.saveState === 'failed' ? <span className="font-medium text-[var(--ui-alert-text)]">{tr(T.notSaved)}</span> : ''}
        </span>
        {hasClassic && (
          <Button variant="ghost" size="sm" className="underline" onClick={onClassic} data-testid="r3-to-classic">
            {tr(T.classic)}
          </Button>
        )}
      </div>

      <Modal open={again} onClose={() => setAgain(false)} title={tr(T.againQ)}>
        <p className="mb-4">{tr(T.againD)}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" data-autofocus onClick={() => setAgain(false)}>
            {tr(T.keepPlaying)}
          </Button>
          <Button onClick={() => (setAgain(false), ctl.restart())} data-testid="r3-again-yes">
            {tr(T.again)}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function promptFor(view: V3View, g: number | null): L {
  const { v, error } = view;
  const s = v.state;
  if (s.phase === 'plan') return error === 'menu_limit' ? T.pickTwo : T.menuQ;
  if (s.phase === 'buy') return T.portions;
  if (s.phase === 'serve') {
    if (error === 'not_accepted') return T.keep;
    if (g !== null && suitable(s, g).length) return T.serve;
    if (g !== null && !cookable(s, g).length) return T.notToday;
    return T.putIn;
  }
  return T.closed;
}

function downloadText(text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `restaurant-old-progress-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- stage
function Stage({ view, guest }: { view: V3View; guest: number | null }) {
  const { tr, dish } = useT();
  const s = view.v.state;
  const c = guest !== null ? s.customers[guest] : null;
  const wants = c ? [c.likes, c.alsoAccepts].filter((d): d is DishId => !!d) : [];
  const showPlant = s.decor.includes(DECOR.id) || view.v.plantPreview;
  return (
    <div className="r3-stage relative overflow-hidden rounded-md border border-[var(--border)]" data-testid="r3-stage">
      <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      {showPlant && <img src={plantImg} alt={tr(T.plant)} className={`r3-plant absolute bottom-[8%] left-[6%] h-[46%] ${view.v.plantPreview ? 'opacity-70' : ''}`} data-testid="r3-plant" data-preview={view.v.plantPreview} />}
      {c && guest !== null && (
        <>
          <img src={guest % 2 ? fox : bunny} alt="" key={`g${guest}-${view.fx === 'serve' ? view.fxKey : 0}`} className={`r3-guest absolute bottom-0 right-[8%] h-[78%] ${view.fx === 'serve' ? 'r3-nod' : ''}`} aria-hidden="true" />
          <div className="absolute left-3 top-3 max-w-[70%] rounded-md bg-[#fffaf0] px-3 py-2 text-[#2f3a2a]" data-testid="r3-bubble" data-guest={guest} aria-label={`${tr(T.guest, { k: guest + 1 })}：${tr(T.wants)} ${wants.map(dish).join(` ${tr(T.or)} `)}`}>
            <p className="text-sm font-medium">{tr(T.guest, { k: guest + 1 })}</p>
            <div className="flex flex-wrap items-center gap-2">
              {wants.map((d, k) => (
                <span key={d} className="flex items-center gap-1 font-bold">
                  {k > 0 && <span className="text-sm font-medium">{tr(T.or)}</span>}
                  <img src={DISH_IMG[d]} alt="" className="h-12 w-16 object-contain" />
                  <span className="text-sm">{dish(d)}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- plan: pick 1–2 dishes
function PlanStep({ ctl, view }: { ctl: V3Controller; view: V3View }) {
  const { tr, dish } = useT();
  const s = view.v.state;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label={tr(T.menuQ)}>
        {DISH_IDS.map((d) => {
          const on = s.menu.includes(d);
          return (
            <button key={d} type="button" aria-pressed={on} onClick={() => ctl.dispatch({ t: 'gMenu', dish: d, on: !on })} className={`ui-t flex min-h-14 items-center gap-3 rounded-md border-2 p-2 text-left font-bold sm:flex-col sm:text-center ${on ? 'border-[var(--ui-accent-text)] bg-[var(--ui-accent-soft)]' : 'border-[var(--ui-control-border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'}`} data-testid={`r3-dish-${d}`}>
              <img src={DISH_IMG[d]} alt="" className="h-14 w-20 object-contain" />
              <span className="flex items-center gap-2">
                {on && <Check />}
                {dish(d)}
              </span>
            </button>
          );
        })}
      </div>
      {s.menu.length > 0 && (
        <div className="space-y-1" data-testid="r3-portions">
          <p className="font-medium">{tr(T.portions)}</p>
          <p className="flex flex-wrap gap-3">
            {s.menu.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 tabular-nums" data-dish={d} data-n={s.plan[d]}>
                <img src={DISH_IMG[d]} alt="" className="h-8 w-10 object-contain" />
                {dish(d)} × {s.plan[d]}
              </span>
            ))}
          </p>
          {s.menu.length === 2 && s.menu.every((d) => (DISHES[d].recipe.egg ?? 0) > 0) && <p className="text-sm">{tr(T.shareEgg)}</p>}
        </div>
      )}
      <Button size="lg" className="min-h-14 w-full text-xl" disabled={!s.menu.length} onClick={() => ctl.dispatch({ t: 'toBuy' })} data-testid="r3-to-buy">
        {s.menu.length ? tr(T.goBuy) : tr(T.pickOne)}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- buy everything together
function BuyStep({ ctl, s }: { ctl: V3Controller; s: State }) {
  const { tr, item, dish, join } = useT();
  const rows = buyRows(s).filter((r) => r.suggested > 0);
  const packs = Object.fromEntries(buyRows(s).map((r) => [r.item, r.suggested])) as Record<ItemId, number>;
  const cost = packsCost(packs);
  const short = cost > s.cash - FIXED_FEE;
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="r3-basket">
        {rows.map((r) => (
          <li key={r.item} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2" data-item={r.item} data-packs={r.suggested}>
            <img src={ITEM_IMG[r.item]} alt="" className="h-10 w-10" />
            <span className="min-w-0">
              <span className="block font-bold">
                {item(r.item)} × {r.suggested}
              </span>
              {r.usedBy.length >= 2 && <span className="block text-sm">{tr(T.shared, { dishes: join(r.usedBy.map(dish)) })}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="tabular-nums" data-testid="r3-wallet-after">
        {tr(T.walletAfter, { a: s.cash, b: s.cash - cost })} · {tr(T.feeKept, { n: FIXED_FEE })}
      </p>
      {short && (
        <p className="rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert">
          {tr(T.noCash)}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" className="min-h-14" onClick={() => ctl.dispatch({ t: 'toPlan' })} data-testid="r3-back">
          {tr(T.changeMenu)}
        </Button>
        <Button size="lg" className="min-h-14 flex-1 text-xl" disabled={short} onClick={() => ctl.dispatch({ t: 'purchase', packs })} data-testid="r3-buy">
          {tr(T.buyTogether, { n: cost })}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- serve: cook on demand, then serve
function ServeStep({ ctl, view, guest }: { ctl: V3Controller; view: V3View; guest: number | null }) {
  const { tr, item, dish, join, unit } = useT();
  const { v } = view;
  const s = v.state;
  const draft = v.draft;
  const active = draft.dish ?? suggestDish(s, guest);
  const want = active ? panItems(active) : [];
  const a = available(s);
  const bins = ITEM_IDS.filter((i) => i !== 'packaging' && s.menu.some((d) => (DISHES[d].recipe[i] ?? 0) > 0));
  const ok = guest !== null ? suitable(s, guest) : [];
  const canCook = guest !== null ? cookable(s, guest) : [];
  const [plate, setPlate] = useState<DishId | null>(null);
  const ready = s.menu.filter((d) => readyCount(s, d) > 0);
  const chosenPlate = plate && readyCount(s, plate) > 0 ? plate : ready.length === 1 ? ready[0] : (ready.find((d) => ok.includes(d)) ?? null);
  const setDraft = (patch: Partial<V3Save['draft']>, fx: 'pan' | null = null) => ctl.update({ draft: { dish: active, items: draft.items, ...patch } }, fx);
  const addItem = (i: ItemId) => {
    if (draft.items.includes(i) || draft.items.length >= 3) return;
    setDraft({ items: [...draft.items, i] }, 'pan');
  };
  // why "Cook one" would be refused, said before anything is used
  const missingStock = want.find((i) => a[i] < 1);
  const lacking = want.find((i) => !draft.items.includes(i));
  const extra = draft.items.find((i) => !want.includes(i));
  const cook = (items: ItemId[]) => {
    if (!active) return;
    ctl.dispatch({ t: 'cook', dish: active, items }, 'cook', (n) => ({ draft: { dish: active, items: [] }, cooks: n.cooks + (items === draft.items ? 1 : 0) }));
  };
  const err = view.error;
  const msg = extra ? tr(T.notThis, { item: item(extra) }) : err === 'missing' && missingStock ? tr(T.outOf, { item: item(missingStock) }) : err === 'wrong_items' && lacking ? tr(T.needItem, { item: item(lacking) }) : err === 'batch_capacity' || err === 'day_capacity' ? tr(T.full) : err === 'not_accepted' ? tr(T.keep) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* the pan */}
      <div className="space-y-3 rounded-md border border-[var(--border)] p-3" data-testid="r3-kitchen">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr(T.whichDish)}>
          <span className="text-sm font-medium">{tr(T.whichDish)}</span>
          {s.menu.map((d) => (
            <button key={d} type="button" aria-pressed={active === d} onClick={() => setDraft({ dish: d, items: draft.items.filter((i) => panItems(d).includes(i)) })} className={`ui-t inline-flex min-h-11 items-center gap-1 rounded-md border-2 px-2 text-sm font-bold ${active === d ? 'border-[var(--ui-accent-text)] bg-[var(--ui-accent-soft)]' : 'border-[var(--ui-control-border)] bg-[var(--surface)]'}`} data-testid={`r3-pick-${d}`}>
              <img src={DISH_IMG[d]} alt="" className="h-7 w-9 object-contain" />
              {dish(d)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={tr(T.pan)} data-testid="r3-pan" data-items={draft.items.join(',')}>
          {[0, 1, 2].map((k) => {
            const it = draft.items[k];
            const ghost = want.filter((i) => !draft.items.includes(i))[k - draft.items.length];
            return it ? (
              <button key={`${k}-${it}`} type="button" onClick={() => setDraft({ items: draft.items.filter((x) => x !== it) })} className="r3-pan-item ui-t flex h-16 w-16 items-center justify-center rounded-md border-2 border-[var(--ui-control-border)] bg-[var(--surface)]" aria-label={tr(T.takeOut, { item: item(it) })} data-testid={`r3-slot-${k}`}>
                <img src={ITEM_IMG[it]} alt="" className="h-11 w-11" />
              </button>
            ) : (
              <span key={k} className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-dashed border-[var(--ui-control-border)]" aria-label={tr(T.emptySlot)} data-testid={`r3-slot-${k}`}>
                {ghost && <img src={ITEM_IMG[ghost]} alt="" className="h-9 w-9 opacity-30" />}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr(T.putIn)}>
          {bins.map((i) => {
            const users = s.menu.filter((d) => (DISHES[d].recipe[i] ?? 0) > 0);
            return (
              <button key={i} type="button" aria-pressed={draft.items.includes(i)} disabled={a[i] < 1 && !draft.items.includes(i)} onClick={() => addItem(i)} className="ui-t flex min-h-14 min-w-20 items-center gap-2 rounded-md border-2 border-[var(--ui-control-border)] bg-[var(--surface)] px-2 text-left hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:bg-[var(--ui-disabled-bg)] disabled:text-[var(--ui-disabled-fg)]" aria-label={`${item(i)}，${tr(T.stock, { n: a[i], u: unit(i) })}${users.length > 1 ? `，${tr(T.shared, { dishes: join(users.map(dish)) })}` : ''}`} data-testid={`r3-bin-${i}`} data-qty={a[i]}>
                <img src={ITEM_IMG[i]} alt="" className="h-9 w-9" />
                <span className="text-sm">
                  <span className="block font-bold">{item(i)}</span>
                  <span className="block tabular-nums">{tr(T.stock, { n: a[i], u: unit(i) })}</span>
                  {users.length > 1 && (
                    <span className="flex gap-0.5" aria-hidden="true">
                      {users.map((d) => (
                        <img key={d} src={DISH_IMG[d]} alt="" className="h-4 w-5 object-contain" />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {msg && (
          <p className="r3-wrong rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 font-medium text-[var(--ui-alert-text)]" role="alert" data-testid="r3-msg" key={view.fxKey}>
            {msg}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="min-h-14 flex-1 text-xl" variant={ok.length ? 'secondary' : 'primary'} disabled={!active || draft.items.length === 0} onClick={() => cook(draft.items)} data-testid="r3-cook">
            {tr(T.cook)}
          </Button>
          {v.cooks >= 2 && (
            <Button variant="secondary" className="min-h-14" disabled={!active} onClick={() => cook(panItems(active!))} data-testid="r3-quick">
              {tr(T.quick)}
            </Button>
          )}
        </div>
      </div>
      {/* the plates */}
      <div className="space-y-3 rounded-md border border-[var(--border)] p-3" data-testid="r3-plates">
        <p className="font-medium">{tr(T.plates)}</p>
        {ready.length ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={tr(T.pickPlate)}>
            {ready.map((d) => (
              <button type="button" aria-pressed={chosenPlate === d} onClick={() => setPlate(d)} className={`r3-plate ui-t flex min-h-14 items-center gap-2 rounded-md border-2 px-2 font-bold ${chosenPlate === d ? 'border-[var(--ui-accent-text)] bg-[var(--ui-accent-soft)]' : 'border-[var(--ui-control-border)] bg-[var(--surface)]'}`} data-testid={`r3-plate-${d}`} data-n={readyCount(s, d)} key={`${d}-${readyCount(s, d)}`}>
                <img src={DISH_IMG[d]} alt="" className="h-10 w-14 object-contain" />
                {dish(d)} × {readyCount(s, d)}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)]">{tr(T.noPlates)}</p>
        )}
        <Button size="lg" className="min-h-14 w-full text-xl" variant={ok.length ? 'primary' : 'secondary'} disabled={guest === null || !chosenPlate} onClick={() => guest !== null && chosenPlate && ctl.dispatch({ t: 'serve', order: guest, dish: chosenPlate }, 'serve', () => ({ draft: { dish: null, items: [] } }))} data-testid="r3-serve">
          {tr(T.serve)}
        </Button>
        {guest !== null && !ok.length && !canCook.length && (
          <Button variant="secondary" className="min-h-14 w-full" onClick={() => ctl.dispatch({ t: 'serve', order: guest, dish: null }, null, () => ({ draft: { dish: null, items: [] } }))} data-testid="r3-not-today">
            {tr(T.notToday)}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- closing: one choice
function CloseStep({ ctl, view, onAgain }: { ctl: V3Controller; view: V3View; onAgain: () => void }) {
  const { tr } = useT();
  const { v } = view;
  const s = v.state;
  const r = s.results[s.results.length - 1];
  const [open, setOpen] = useState(false);
  if (!r) return null;
  const missed = s.orders.filter((o) => o.status === 'no_match').length;
  const hint = r.wastedServings ? tr(T.hintLeft, { n: r.wastedServings }) : missed ? tr(T.hintMissed, { n: missed }) : s.menu.length === 2 ? tr(T.hintEgg) : tr(T.hintAll);
  const row = (k: L, val: string | number, strong = false) => (
    <>
      <dt className={strong ? 'font-bold' : ''}>{tr(k)}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{val}</dd>
    </>
  );
  return (
    <div className="space-y-3" data-testid="r3-close" data-result={r.result} data-cash={s.cash} data-sold={r.soldCount}>
      <p className="text-xl font-bold">
        {tr(T.served, { n: r.soldCount })} · {tr(T.cash)} {s.cash}
      </p>
      <p data-testid="r3-hint">{hint}</p>
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((x) => !x)} data-testid="r3-today">
        {tr(T.today)}
      </Button>
      {open && (
        <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-md border border-[var(--border)] p-3" data-testid="r3-books" data-revenue={r.revenue} data-cogs={r.cogs} data-waste={r.wasteCooked + r.wasteRaw}>
          {row(T.revenue, r.revenue)}
          {row(T.cogs, r.cogs ? `−${r.cogs}` : 0)}
          {row(T.waste, r.wasteCooked + r.wasteRaw ? `−${r.wasteCooked + r.wasteRaw}` : 0)}
          {row(T.fee, `−${r.fixed}`)}
          {row(T.result, r.result, true)}
          {row(T.stockLeft, r.inventoryValue)}
        </dl>
      )}
      {s.phase === 'closed' ? (
        <div className="space-y-2" data-testid="r3-decor">
          {v.plantPreview ? (
            <>
              <p>
                {tr(T.plant)} · {tr(T.decoOnly)} · {tr(T.walletAfter, { a: s.cash, b: s.cash - DECOR.price })}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" className="min-h-14 flex-1 text-xl" disabled={s.cash < DECOR.price} onClick={() => ctl.dispatch({ t: 'decor', buy: true }, 'plant', () => ({ plantPreview: false }))} data-testid="r3-plant-buy">
                  {s.cash < DECOR.price ? tr(T.notEnough) : tr(T.buyPlant, { n: DECOR.price })}
                </Button>
                <Button variant="secondary" className="min-h-14 flex-1" onClick={() => ctl.update({ plantPreview: false })} data-testid="r3-plant-cancel">
                  {tr(T.cancel)}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="min-h-14 flex-1" onClick={() => ctl.update({ plantPreview: true })} data-testid="r3-plant-preview">
                <img src={plantImg} alt="" className="h-8 w-8" />
                {tr(T.plant)} {DECOR.price}
              </Button>
              <Button size="lg" className="min-h-14 flex-1 text-xl" onClick={() => ctl.dispatch({ t: 'decor', buy: false })} data-testid="r3-save-coins">
                {tr(T.saveCoins)}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Button size="lg" className="min-h-14 w-full text-xl" onClick={onAgain} data-testid="r3-again">
          {tr(T.again)}
        </Button>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
