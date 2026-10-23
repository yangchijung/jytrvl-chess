// How to play Color Doodle: three picture steps, then straight to the paper.
import { useI18n } from '../i18n';
import { LinkButton, PageTitle } from '../components/ui';

const STEPS = [
  { zh: ['選一個顏色，在畫紙上畫畫', '手指、滑鼠或觸控筆都可以；畫錯就按「復原」。'], en: ['Pick a colour and draw on the paper', 'Use a finger, mouse or stylus; press Undo to take a mark back.'] },
  { zh: ['在調色盤上選兩色，按「混一混」', '紅加黃變橙、紅加白變粉紅，混好的顏色還能再加白；紅黃藍白黑五種顏料可以混出 24 種顏色。這裡用簡化的顏料混色模型，真實顏料會有差異。'], en: ['Put two paints on the palette and press Mix', 'Red and yellow make orange, red and white make pink, and a mixed colour can take more white: five paints make 24 more colours. This is a simplified paint model; real pigments may differ.'] },
  { zh: ['試試小任務', '先猜、再混、用新顏色畫一筆。猜錯沒關係，可以重試或跳過；也能用「格子蓋印章」只靠鍵盤完成。沒有分數，也不評作品好壞。'], en: ['Try a short task', 'Guess, mix, then make a mark with the new colour. Wrong guesses are fine; retry or skip any time. The stamp grid works with the keyboard alone. There are no scores and no judging of pictures.'] },
];

function StepArt({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 120 60" className="h-24 w-48 shrink-0 rounded-md border border-[var(--border)] bg-white" aria-hidden="true">
      {n === 0 && <path d="M12 44c14-22 28-24 40-6s26 14 40-10" fill="none" stroke="#D64034" strokeWidth="6" strokeLinecap="round" />}
      {n === 1 && (
        <g>
          <circle cx="24" cy="30" r="12" fill="#D64034" />
          <text x="44" y="35" fontSize="16" fill="#1f2328">+</text>
          <circle cx="66" cy="30" r="12" fill="#F5C43C" />
          <text x="84" y="35" fontSize="16" fill="#1f2328">=</text>
          <circle cx="104" cy="30" r="12" fill="#E8792D" />
        </g>
      )}
      {n === 2 && (
        <g>
          {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={36 + c * 16} y={6 + r * 16} width="16" height="16" fill="none" stroke="#c9c9c3" />))}
          <circle cx="60" cy="30" r="6" fill="#8053A0" />
        </g>
      )}
    </svg>
  );
}

export function DoodleLearn() {
  const { t, to, lang } = useI18n();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub={t('game.doodle.desc')}>{lang === 'zh' ? '色彩塗鴉樂玩法' : 'How to play Color Doodle'}</PageTitle>
      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <StepArt n={i} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-7">
                {i + 1}. {s[lang][0]}
              </h2>
              <p className="mt-1 text-base leading-6 text-[var(--muted)]">{s[lang][1]}</p>
            </div>
          </li>
        ))}
      </ol>
      <LinkButton to={to('/doodle')} className="min-h-12 px-6" data-testid="learn-doodle-start">
        {lang === 'zh' ? '開始畫' : 'Start drawing'}
      </LinkButton>
    </div>
  );
}
