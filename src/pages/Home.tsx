import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { LinkButton, Card } from '../components/ui';
import { DiscPiece, ChessPieceImg } from '../components/board/pieces';
import type { GameId } from '../../shared/types';

export function GamePreview({ game }: { game: GameId }) {
  if (game === 'chess') {
    const row = ['bR', 'bN', 'bB', 'bQ'];
    return (
      <div className="grid aspect-[2/1] grid-cols-4 grid-rows-2 overflow-hidden rounded-xl" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="relative" style={{ background: (i + Math.floor(i / 4)) % 2 ? 'var(--sq-dark)' : 'var(--sq-light)' }}>
            <div className="absolute inset-[8%]">
              <ChessPieceImg code={i < 4 ? row[i] : ['wP', 'wK', 'wP', 'wN'][i - 4]} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (game === 'xiangqi') {
    return (
      <div className="relative flex aspect-[2/1] items-center justify-center gap-[3%] overflow-hidden rounded-xl bg-[var(--xq-board)] px-[4%]" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 100" preserveAspectRatio="none">
          {[20, 50, 80].map((y) => (
            <line key={y} x1="0" x2="200" y1={y} y2={y} stroke="var(--xq-line)" strokeWidth="0.8" />
          ))}
          {[25, 75, 125, 175].map((x) => (
            <line key={x} x1={x} x2={x} y1="0" y2="100" stroke="var(--xq-line)" strokeWidth="0.8" />
          ))}
        </svg>
        {['K', 'R', 'c', 'n'].map((p) => (
          <div key={p} className="relative w-[20%]">
            <DiscPiece code={p} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid aspect-[2/1] grid-cols-4 grid-rows-2 gap-[2%] overflow-hidden rounded-xl bg-[var(--bq-board)] p-[3%]" aria-hidden="true">
      {['X', 'C', 'X', 'p', 'X', 'X', 'K', 'X'].map((p, i) => (
        <div key={i} className="mx-auto aspect-square h-full">
          <DiscPiece code={p === 'X' ? undefined : p} hidden={p === 'X'} />
        </div>
      ))}
    </div>
  );
}

export function Home() {
  const { t, to } = useI18n();
  const games: GameId[] = ['chess', 'xiangqi', 'banqi'];
  const features = [
    ['🤖', 'home.features.ai', 'home.features.ai.desc'],
    ['🌐', 'home.features.online', 'home.features.online.desc'],
    ['🧩', 'home.features.learn', 'home.features.learn.desc'],
    ['🎓', 'home.features.coach', 'home.features.coach.desc'],
  ] as const;
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl px-6 py-12 text-[var(--hero-text)] sm:px-10 sm:py-16" style={{ background: 'var(--hero-bg)' }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full border-[18px] border-[var(--gold)] opacity-15" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full border-[12px] border-[var(--gold)] opacity-10" aria-hidden="true" />
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gold)]">Chess · Xiangqi · Banqi</p>
        <h1 className="max-w-2xl font-serif text-4xl font-bold leading-tight sm:text-5xl">{t('home.hero.title')}</h1>
        <p className="mt-4 max-w-xl text-lg opacity-90">{t('home.hero.sub')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to={to('/play')} className="!bg-[var(--gold)] !text-[#1b2a41]">
            {t('home.cta.play')}
          </LinkButton>
          <LinkButton to={to('/learn/chess')} variant="secondary" className="!border-white/30 !bg-white/10 !text-white">
            {t('home.cta.learn')}
          </LinkButton>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3" aria-label={t('nav.play')}>
        {games.map((g) => (
          <Card key={g} className="flex flex-col gap-4">
            <GamePreview game={g} />
            <div>
              <h2 className="font-serif text-2xl font-bold">
                {t(`game.${g}`)} <span className="text-base font-normal text-[var(--muted)]">{t(`game.${g}.en`)}</span>
              </h2>
              <p className="mt-2 text-[var(--muted)]">{t(`game.${g}.desc`)}</p>
            </div>
            <div className="mt-auto flex gap-2">
              <LinkButton to={to(`/${g}`)} className="flex-1">
                {t('home.cta.play')}
              </LinkButton>
              <LinkButton to={to(`/learn/${g}`)} variant="secondary" className="flex-1">
                {t('home.cta.learn')}
              </LinkButton>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(([icon, h, d]) => (
          <div key={h} className="rounded-2xl border border-[var(--border)] p-5">
            <div className="text-3xl" aria-hidden="true">
              {icon}
            </div>
            <h3 className="mt-2 font-semibold">{t(h)}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{t(d)}</p>
          </div>
        ))}
      </section>
      <p className="text-center text-sm text-[var(--muted)]">
        <Link to={to('/about')} className="underline">
          {t('nav.about')}
        </Link>
      </p>
    </div>
  );
}
