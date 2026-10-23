// Territory Rush colour picker: big swatches, chosen one marked with a check + ring (not colour alone),
// radio-group keyboard behaviour (arrow keys / Home / End move and select, taken colours are skipped).
import { useRef, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';
import { TERRITORY_COLORS, COLOR_COUNT, trColor } from '../../shared/territory/colors';
import { loadJSON, saveJSON } from '../lib/settings';

export interface ColorPrefs {
  p1: number;
  p2: number;
}
const KEY = 'jychess.territory.colors.v1';
const DEFAULT: ColorPrefs = { p1: 4, p2: 6 };

/** Remembered per browser (localStorage, failures ignored). Out-of-range values fall back to the defaults. */
export function loadColorPrefs(): ColorPrefs {
  const v = loadJSON<ColorPrefs>(KEY, DEFAULT);
  const ok = (c: unknown, d: number) => (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < COLOR_COUNT ? c : d);
  const p1 = ok(v.p1, DEFAULT.p1);
  let p2 = ok(v.p2, DEFAULT.p2);
  if (p2 === p1) p2 = (p1 + 3) % COLOR_COUNT;
  return { p1, p2 };
}
export function saveColorPrefs(p: ColorPrefs) {
  saveJSON(KEY, p);
}

export function colorName(c: number, lang: 'zh' | 'en') {
  return trColor(c)[lang];
}

export function ColorPicker({
  label,
  value,
  onChange,
  taken,
  testId,
}: {
  label: string;
  value: number;
  onChange: (c: number) => void;
  /** colour → who holds it (shown in the label, not selectable) */
  taken?: Map<number, string>;
  testId?: string;
}) {
  const { t, lang } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const free = (c: number) => !taken?.has(c);
  const move = (from: number, step: number) => {
    for (let k = 1; k <= COLOR_COUNT; k++) {
      const c = (((from + step * k) % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
      if (free(c)) return c;
    }
    return from;
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = move(i, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = move(i, -1);
    else if (e.key === 'Home') next = move(-1, 1);
    else if (e.key === 'End') next = move(COLOR_COUNT, -1);
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <fieldset data-testid={testId}>
      <legend className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold text-[var(--muted)]">
        <span>{label}</span>
        <span className="font-normal text-[var(--text)]" aria-live="polite">
          {t('tr.color.chosen', { name: colorName(value, lang) })}
        </span>
      </legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {TERRITORY_COLORS.map((c, i) => {
          const sel = value === i;
          const who = taken?.get(i);
          const name = c[lang];
          return (
            <button
              key={c.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-disabled={who ? true : undefined}
              aria-label={who ? t('tr.color.taken', { name, who }) : name}
              title={who ? t('tr.color.taken', { name, who }) : name}
              tabIndex={sel ? 0 : -1}
              data-color={i}
              onClick={() => !who && onChange(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`relative flex h-12 w-12 items-center justify-center rounded-lg border-2 outline-none transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-[var(--focus)] pointer-coarse:h-16 pointer-coarse:w-16 motion-reduce:transition-none ${
                sel ? 'ring-[3px] ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]' : ''
              } ${who ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ background: c.base, borderColor: c.dark }}
            >
              {sel && (
                <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={c.ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {who && (
                // taken: a diagonal bar in the colour's own ink, so it reads without relying on colour
                <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
                  <path d="M5 19L19 5" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
