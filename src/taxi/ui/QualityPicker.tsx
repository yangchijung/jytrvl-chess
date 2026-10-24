// Rush Taxi — the pause menu's 畫質 control: one segmented row 自動 / 流暢 / 標準 / 精緻 (auto, low, mid, high). A
// radio group (arrow keys move the choice, one tab stop); the chosen segment is filled ink with a check mark, so it is
// not told by colour alone. With 自動 the row says which tier is in use right now. Saved per browser (fx/quality.ts).
import { useRef, type KeyboardEvent } from 'react';
import type { Lang } from '../../i18n';
import { QUALITY_PREFS, type Quality, type QualityPref } from '../fx/quality';

const NAME: Record<QualityPref, { zh: string; en: string }> = {
  auto: { zh: '自動', en: 'Auto' },
  low: { zh: '流暢', en: 'Smooth' },
  mid: { zh: '標準', en: 'Standard' },
  high: { zh: '精緻', en: 'Detailed' },
};
const T = {
  title: { zh: '畫質', en: 'Graphics' },
  now: { zh: '目前', en: 'Now' },
};

export function QualityPicker({ lang, pref, tier, onChange }: { lang: Lang; pref: QualityPref; tier: Quality | null; onChange: (p: QualityPref) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + QUALITY_PREFS.length) % QUALITY_PREFS.length;
    onChange(QUALITY_PREFS[j]);
    refs.current[j]?.focus();
  };
  return (
    <div className="tc-quality">
      <span id="tc-quality-title" className="tc-quality-title">
        {T.title[lang]}
        {pref === 'auto' && tier && (
          <span className="tc-quality-now" data-testid="taxi-quality-now">
            {T.now[lang]} {NAME[tier][lang]}
          </span>
        )}
      </span>
      <div role="radiogroup" aria-labelledby="tc-quality-title" className="tc-segments" data-testid="taxi-quality">
        {QUALITY_PREFS.map((p, i) => (
          <button
            key={p}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={pref === p}
            tabIndex={pref === p ? 0 : -1}
            className="tc-segment"
            onClick={() => onChange(p)}
            onKeyDown={(e) => onKey(e, i)}
            data-testid={`taxi-quality-${p}`}
          >
            <svg className="tc-segment-check" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {NAME[p][lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
