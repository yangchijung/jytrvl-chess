import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, type StringKey } from '../i18n';

type Game = 'chess' | 'xiangqi' | 'banqi' | 'territory' | 'snake' | 'blocks';
const KEY = (g: Game) => `jychess.onboarded.${g}`;

/**
 * First-visit guide for a game hub (onboarding.<game>). Dismissed guides stay one tap away
 * ("How to play") so the text can be re-read at any time.
 */
export function Onboarding({ game }: { game: Game }) {
  const { t, to } = useI18n();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY(game)) !== '1';
    } catch {
      return true;
    }
  });
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY(game), '1');
    } catch {
      /* storage unavailable: the guide simply shows again next time */
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[var(--accent-text)] underline-offset-2 hover:underline" aria-expanded="false">
        ℹ {t('onb.show')}
      </button>
    );
  return (
    <section aria-label={t('onb.title')} className="rounded-2xl border border-[var(--border)] bg-[var(--info-bg)] p-4 text-[var(--info-text)]" data-testid="onboarding">
      <h2 className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true">ℹ</span>
        {t('onb.title')}
      </h2>
      <p className="mt-1 leading-relaxed">{t(`onboarding.${game}` as StringKey)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={to(`/learn/${game}`)} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent-fill)] px-4 font-medium text-[var(--on-accent)]">
          {t('home.cta.learn')}
        </Link>
        <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-lg border border-current px-4 font-medium">
          {t('onb.dismiss')}
        </button>
      </div>
    </section>
  );
}
