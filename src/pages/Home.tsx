import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { LinkButton } from '../components/ui';
import { DiscPiece, ChessPieceImg } from '../components/board/pieces';
import { TerritoryPreview } from '../territory/pages';
import { SnakePreview } from '../snake/pages';
import { BlocksPreview } from '../blocks/pages';
import { SudokuPreview } from '../sudoku/preview';
import { DoodlePreview } from '../doodle/preview';
import { IslandArt } from '../math/art';
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

// Home = game catalogue (HOME_SHARED_UI_V1 §2). Task: pick a game and go straight in.
// Primary action per game: "Play" (its own entry); secondary: "How to play" (its tutorial).
export function Home() {
  const { t, to } = useI18n();
  type AnyGame = GameId | 'territory' | 'snake' | 'blocks' | 'sudoku' | 'doodle' | 'math';
  const categories: { key: 'home.cat.board' | 'home.cat.realtime' | 'home.cat.puzzle' | 'home.cat.learn'; games: AnyGame[] }[] = [
    { key: 'home.cat.board', games: ['chess', 'xiangqi', 'banqi'] },
    { key: 'home.cat.realtime', games: ['territory', 'snake'] },
    { key: 'home.cat.puzzle', games: ['blocks', 'sudoku', 'doodle'] },
    { key: 'home.cat.learn', games: ['math'] },
  ];
  const preview = (g: AnyGame) => (g === 'territory' ? <TerritoryPreview /> : g === 'snake' ? <SnakePreview /> : g === 'blocks' ? <BlocksPreview /> : g === 'sudoku' ? <SudokuPreview /> : g === 'doodle' ? <DoodlePreview /> : g === 'math' ? <IslandArt /> : <GamePreview game={g} />);
  return (
    <div className="pb-4" data-testid="home">
      <header className="py-6">
        <h1 className="font-serif text-[1.75rem] font-bold leading-[2.25rem] md:text-[2.25rem] md:leading-[2.75rem]" data-testid="tagline">
          {t('app.tagline')}
        </h1>
        <p className="mt-2 text-base text-[var(--muted)]">{t('home.v2.intro')}</p>
      </header>
      <div className="space-y-8">
        {categories.map((cat) => (
          <section key={cat.key} aria-labelledby={`h-${cat.key}`}>
            <h2 id={`h-${cat.key}`} className="mb-4 font-serif text-[1.375rem] font-bold leading-[1.875rem]">
              {t(cat.key)}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cat.games.map((g) => {
                const name = t(`game.${g}`);
                return (
                  <li key={g} className="@container rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4" data-testid={`home-card-${g}`}>
                    <div className="grid gap-4 @min-[17rem]:max-md:grid-cols-[7rem_minmax(0,1fr)]">
                      <div className="home-preview overflow-hidden rounded-md" aria-hidden="true">
                        {preview(g)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold leading-7">{name}</h3>
                        <p className="mt-1 text-base leading-6 text-[var(--muted)]">{t(`home.v2.${g}.desc`)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <LinkButton to={to(`/${g}`)} className="min-h-12 px-5" aria-label={t('home.v2.playLabel', { game: name })} data-testid={`play-${g}`}>
                        {t('home.v2.play')}
                      </LinkButton>
                      {g !== 'math' && (
                      <Link to={to(`/learn/${g}`)} className="ui-t inline-flex min-h-11 items-center rounded-md px-3 font-medium text-[var(--ui-accent-text)] underline underline-offset-4 hover:bg-[var(--surface-2)]" aria-label={t('home.v2.rulesLabel', { game: name })} data-testid={`rules-${g}`}>
                        {t('home.v2.rules')}
                      </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
