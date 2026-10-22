// Math Island M0 — /math. Task: pick a game and start (or continue). Only playable games are shown (spec §2:
// no "coming soon" cards). Parent information is one level down.
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { APPLE_KEY, APPLE_PROBLEMS, finished, readApple } from '../../shared/math/apple';
import { FACTORY_KEY, FACTORY_PROBLEMS, SOURCE, finishedF, readFactory } from '../../shared/math/factory';
import { TRAIN_KEY, TRAIN_PROBLEMS, PLATFORM, finishedT, readTrain } from '../../shared/math/train';
import { SHOP_KEY, SHOP_PROBLEMS, PURSE, finishedS, readShop } from '../../shared/math/shop';
import { BALANCE_KEY, BALANCE_PROBLEMS, BIN, finishedB, readBalance } from '../../shared/math/balance';
import { CLOCK_KEY, CLOCK_PROBLEMS, finishedC, readClock } from '../../shared/math/clock';
import { GARDEN_KEY, GARDEN_PROBLEMS, finishedG, readGarden } from '../../shared/math/garden';
import { FROG_KEY, FROG_PROBLEMS, finishedF2, readFrog } from '../../shared/math/frog';
import { peek } from './save';
import { IslandArt } from './art';
import './math.css';

type L = { zh: string; en: string };
const T = {
  title: { zh: '數學遊樂島', en: 'Math Island' },
  tag: { zh: '試玩版', en: 'Early version' },
  zhOnly: { zh: '', en: 'The questions and voice are in Traditional Chinese for now.' },
  apple: { zh: '蘋果籃', en: 'Apple Basket' },
  appleWhat: { zh: '一年級．把兩堆蘋果放一起，數一數一共幾顆。5 題。', en: 'Grade 1 · put two groups of apples together and count them. 5 problems.' },
  factory: { zh: '分裝工廠', en: 'Packing Factory' },
  factoryWhat: { zh: '三年級．把餅乾平分到每一盒，再說每盒有幾個。5 題。', en: 'Grade 3 · share cookies equally into boxes and say how many are in each. 5 problems.' },
  train: { zh: '湊十小火車', en: 'Make-Ten Train' },
  trainWhat: { zh: '一年級．請乘客上火車，第一節坐滿 10 人再坐第二節，數一數一共幾人。5 題。', en: 'Grade 1 · board the riders, filling car 1 to ten first, then count them all. 5 problems.' },
  shop: { zh: '零錢小商店', en: 'Coin Shop' },
  shopWhat: { zh: '一、二年級．用 1、5、10、50 元硬幣付剛好的錢。5 題。', en: 'Grades 1–2 · pay the exact price with 1, 5, 10 and 50 dollar coins. 5 problems.' },
  balance: { zh: '天平等一等', en: 'Balance Scale' },
  balanceWhat: { zh: '一、二年級．放積木讓天平兩邊一樣重，看懂等號的意思。5 題。', en: 'Grades 1–2 · add blocks until both sides weigh the same, and see what = means. 5 problems.' },
  clock: { zh: '時鐘修理站', en: 'Clock Repair' },
  clockWhat: { zh: '一、二年級．轉長針撥時鐘，看短針怎麼跟著走，分清上午、下午。5 題。', en: 'Grades 1–2 · turn the minute hand, watch the hour hand follow, and tell morning from afternoon. 5 problems.' },
  garden: { zh: '乘法花圃', en: 'Multiplication Garden' },
  gardenWhat: { zh: '二年級．拉出每排一樣多的花圃，看懂乘法。5 題。', en: 'Grade 2 · pull out a bed of equal rows and see what multiplying means. 5 problems.' },
  frog: { zh: '數線青蛙', en: 'Number-Line Frog' },
  frogWhat: { zh: '三年級．青蛙在數線上跳，選出牠會停在哪裡。5 題。', en: 'Grade 3 · the frog jumps along the number line; pick where it lands. 5 problems.' },
  start: { zh: '開始玩', en: 'Start' },
  cont: { zh: '接著玩：第 {n} 題', en: 'Continue: problem {n}' },
  again: { zh: '再玩一次（5 題都完成了）', en: 'Play again (all 5 done)' },
  adults: { zh: '給大人看', en: 'For adults' },
  a1: { zh: '目前是試玩版：每款 5 題固定題目，不計時、不扣分，答錯可以再數一次。', en: 'Early version: 5 fixed problems per game, no timer, no penalties; a wrong answer can be counted again.' },
  a2: { zh: '不需要登入，不收集姓名、Email 或生日；進度只存在這台裝置的瀏覽器裡。', en: 'No sign-in; no names, emails or birthdays. Progress stays in this browser on this device.' },
  a3: { zh: '沒有廣告、付費或第三方追蹤。朗讀使用預先錄好的聲音檔，可以關掉。', en: 'No ads, payments or third-party tracking. Spoken prompts use pre-made audio and can be turned off.' },
};

export function MathIslandPage() {
  const { lang, to } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => l[lang].replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''));
  const s = peek({ key: APPLE_KEY, read: readApple });
  const label = !s ? tr(T.start) : finished(s) ? tr(T.again) : s.index === 0 && s.at.every((x) => x === 'pile') ? tr(T.start) : tr(T.cont, { n: Math.min(s.index + 1, APPLE_PROBLEMS.length) });
  const f = peek({ key: FACTORY_KEY, read: readFactory });
  const flabel = !f ? tr(T.start) : finishedF(f) ? tr(T.again) : f.index === 0 && f.at.every((x) => x === SOURCE) ? tr(T.start) : tr(T.cont, { n: Math.min(f.index + 1, FACTORY_PROBLEMS.length) });
  const lab = (v: { index: number; at: number[] } | null, total: number, done: boolean, untouched: (a: number[]) => boolean) =>
    !v ? tr(T.start) : done ? tr(T.again) : v.index === 0 && untouched(v.at) ? tr(T.start) : tr(T.cont, { n: Math.min(v.index + 1, total) });
  const t = peek({ key: TRAIN_KEY, read: readTrain });
  const sh = peek({ key: SHOP_KEY, read: readShop });
  const b = peek({ key: BALANCE_KEY, read: readBalance });
  const more = [
    { id: 'train', path: '/math/g1/train', name: T.train, what: T.trainWhat, label: lab(t, TRAIN_PROBLEMS.length, !!t && finishedT(t), (a) => a.every((x) => x === PLATFORM)) },
    { id: 'shop', path: '/math/g1/shop', name: T.shop, what: T.shopWhat, label: lab(sh, SHOP_PROBLEMS.length, !!sh && finishedS(sh), (a) => a.every((x) => x === PURSE)) },
    { id: 'balance', path: '/math/g1/balance', name: T.balance, what: T.balanceWhat, label: lab(b, BALANCE_PROBLEMS.length, !!b && finishedB(b), (a) => a.every((x) => x === BIN)) },
  ];
  const ck = peek({ key: CLOCK_KEY, read: readClock });
  const gd = peek({ key: GARDEN_KEY, read: readGarden });
  const fr = peek({ key: FROG_KEY, read: readFrog });
  const lab2 = (v: { index: number } | null, total: number, done: boolean, untouched: boolean) => (!v ? tr(T.start) : done ? tr(T.again) : v.index === 0 && untouched ? tr(T.start) : tr(T.cont, { n: Math.min(v.index + 1, total) }));
  more.push({ id: 'clock', path: '/math/g1/clock', name: T.clock, what: T.clockWhat, label: lab2(ck, CLOCK_PROBLEMS.length, !!ck && finishedC(ck), !!ck && ck.minutes === CLOCK_PROBLEMS[0].start) });
  more.push({ id: 'garden', path: '/math/g2/garden', name: T.garden, what: T.gardenWhat, label: lab2(gd, GARDEN_PROBLEMS.length, !!gd && finishedG(gd), !!gd && gd.rows === 0 && gd.cols === 0) });
  const late = [{ id: 'frog', path: '/math/g3/frog', name: T.frog, what: T.frogWhat, label: lab2(fr, FROG_PROBLEMS.length, !!fr && finishedF2(fr), !!fr && fr.pick === null) }];
  return (
    <div className="mi rounded-lg px-3 py-4 sm:px-6 sm:py-6" data-testid="mi-island">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-extrabold">{tr(T.title)}</h1>
          <span className="text-base font-bold">{tr(T.tag)}</span>
        </div>
        {lang === 'en' && <p className="text-base">{tr(T.zhOnly)}</p>}
        <div className="overflow-hidden rounded-lg border-2 border-[var(--mi-ink)]">
          <IslandArt />
        </div>
        <section className="flex flex-col gap-3 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-4" aria-labelledby="mi-apple-h">
          <h2 id="mi-apple-h" className="text-2xl font-extrabold">
            {tr(T.apple)}
          </h2>
          <p className="text-lg">{tr(T.appleWhat)}</p>
          <div>
            <Link to={to('/math/g1/apple')} className="mi-btn mi-btn-primary mi-big px-6 text-xl" data-testid="mi-start-apple">
              {label}
            </Link>
          </div>
        </section>
        {more.map((m) => (
          <section key={m.id} className="flex flex-col gap-3 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-4" aria-labelledby={`mi-${m.id}-h`}>
            <h2 id={`mi-${m.id}-h`} className="text-2xl font-extrabold">
              {tr(m.name)}
            </h2>
            <p className="text-lg">{tr(m.what)}</p>
            <div>
              <Link to={to(m.path)} className="mi-btn mi-btn-primary mi-big px-6 text-xl" data-testid={`mi-start-${m.id}`}>
                {m.label}
              </Link>
            </div>
          </section>
        ))}
        <section className="flex flex-col gap-3 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-4" aria-labelledby="mi-factory-h">
          <h2 id="mi-factory-h" className="text-2xl font-extrabold">
            {tr(T.factory)}
          </h2>
          <p className="text-lg">{tr(T.factoryWhat)}</p>
          <div>
            <Link to={to('/math/g3/factory')} className="mi-btn mi-btn-primary mi-big px-6 text-xl" data-testid="mi-start-factory">
              {flabel}
            </Link>
          </div>
        </section>
        {late.map((m) => (
          <section key={m.id} className="flex flex-col gap-3 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-4" aria-labelledby={`mi-${m.id}-h`}>
            <h2 id={`mi-${m.id}-h`} className="text-2xl font-extrabold">
              {tr(m.name)}
            </h2>
            <p className="text-lg">{tr(m.what)}</p>
            <div>
              <Link to={to(m.path)} className="mi-btn mi-btn-primary mi-big px-6 text-xl" data-testid={`mi-start-${m.id}`}>
                {m.label}
              </Link>
            </div>
          </section>
        ))}
        <details className="rounded-lg border-2 border-[var(--mi-line)] p-4">
          <summary className="min-h-11 cursor-pointer text-lg font-bold">{tr(T.adults)}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
            <li>{tr(T.a1)}</li>
            <li>{tr(T.a2)}</li>
            <li>{tr(T.a3)}</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
