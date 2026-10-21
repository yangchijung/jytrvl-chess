// Math Island M0 — /math. Task: pick a game and start (or continue). Only playable games are shown (spec §2:
// no "coming soon" cards). Parent information is one level down.
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { APPLE_KEY, APPLE_PROBLEMS, finished, readApple } from '../../shared/math/apple';
import { FACTORY_KEY, FACTORY_PROBLEMS, SOURCE, finishedF, readFactory } from '../../shared/math/factory';
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
