import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, PageTitle } from '../components/ui';
import { GamePreview } from './Home';
import type { GameId } from '../../shared/types';

export function GameHub({ game }: { game: GameId }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const options = [
    { icon: '🤖', title: 'hub.vsAi', desc: 'hub.vsAi.desc', href: `/play?game=${game}&mode=ai` },
    { icon: '👨‍👩‍👧', title: 'hub.local', desc: 'hub.local.desc', href: `/play?game=${game}&mode=local` },
    { icon: '⚡', title: 'hub.match', desc: 'hub.match.desc', href: `/matchmaking?game=${game}` },
    { icon: '🔗', title: 'hub.room', desc: 'hub.room.desc', href: `/play?game=${game}&mode=room` },
    { icon: '🎓', title: 'hub.practice', desc: 'hub.practice.desc', href: `/play?game=${game}&mode=practice` },
    { icon: '📖', title: 'hub.learn', desc: 'hub.learn.desc', href: `/learn/${game}` },
  ] as const;
  const join = () => {
    const c = code.trim().toUpperCase();
    if (/^[A-HJ-NP-Z2-9]{6}$/.test(c)) nav(to(`/room/${c}`));
  };
  return (
    <div className="space-y-8">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_20rem]">
        <PageTitle sub={t(`game.${game}.desc`)}>
          {t(`game.${game}`)} <span className="text-xl font-normal text-[var(--muted)]">{t(`game.${game}.en`)}</span>
        </PageTitle>
        <GamePreview game={game} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <Link
            key={o.title}
            to={to(o.href)}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)] outline-none transition hover:-translate-y-0.5 hover:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
          >
            <div className="text-3xl" aria-hidden="true">
              {o.icon}
            </div>
            <h2 className="mt-2 text-lg font-semibold group-hover:text-[var(--accent-text)]">{t(o.title)}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t(o.desc)}</p>
          </Link>
        ))}
      </div>
      <form
        className="flex max-w-md flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-sm font-semibold text-[var(--muted)]">{t('hub.join')}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-mono text-lg tracking-widest uppercase outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
            placeholder="ABCD12"
            autoComplete="off"
            inputMode="text"
            aria-label={t('online.code')}
          />
        </label>
        <Button type="submit">{t('hub.join.btn')}</Button>
      </form>
    </div>
  );
}
