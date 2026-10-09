import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { usePageMeta } from '../lib/usePageMeta';

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="var(--navy)" />
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="11" fill="var(--paper)" stroke="var(--gold)" strokeWidth="1.5" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="var(--navy)" fontFamily="Inter, sans-serif">
        JY
      </text>
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  usePageMeta();
  const { t, to, switchTo, lang } = useI18n();
  const { me, login, logout } = useAuth();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const links = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/chess', label: t('game.chess') },
    { to: '/xiangqi', label: t('game.xiangqi') },
    { to: '/banqi', label: t('game.banqi') },
    { to: '/territory', label: t('game.territory') },
    { to: '/snake', label: t('game.snake') },
    { to: '/blocks', label: t('game.blocks') },
    { to: '/leaderboard', label: t('nav.leaderboard') },
  ];
  const nextTheme = settings.theme === 'dark' ? 'light' : settings.theme === 'light' ? 'system' : 'dark';
  const themeIcon =
    settings.theme === 'dark' ? (
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor" />
    ) : settings.theme === 'light' ? (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </g>
    ) : (
      <g>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
      </g>
    );
  const authError = new URLSearchParams(loc.search).get('auth_error');

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:p-2">
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--header-bg)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to={to('/')} className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]" aria-label="JY Games">
            <Logo />
            <span className="font-serif text-lg font-bold tracking-wide">JY Games</span>
          </Link>
          <nav className="ml-2 hidden items-center gap-0.5 xl:flex" aria-label="main">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={to(l.to)}
                end={l.end}
                className={({ isActive }) => `whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-[var(--surface-2)] ${isActive ? 'text-[var(--accent-text)]' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link to={switchTo} className="rounded-lg px-2 py-2 text-sm font-medium hover:bg-[var(--surface-2)]" hrefLang={lang === 'zh' ? 'en' : 'zh-Hant-TW'} aria-label={t('lang.label')}>
              {t('lang.switch')}
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--surface-2)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
              onClick={() => update({ theme: nextTheme })}
              aria-label={`${t('settings.theme')}: ${t(`theme.${settings.theme}`)}`}
              title={t(`theme.${settings.theme}`)}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                {themeIcon}
              </svg>
            </button>
            {me?.kind === 'user' ? (
              <Link to={to('/profile')} className="hidden max-w-32 truncate rounded-lg px-2 py-2 text-sm font-medium hover:bg-[var(--surface-2)] sm:block">
                {me.nickname}
              </Link>
            ) : (
              <button type="button" onClick={() => login()} className="hidden rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)] sm:block">
                {t('auth.login')}
              </button>
            )}
            <button
              type="button"
              className="h-10 w-10 rounded-lg text-xl hover:bg-[var(--surface-2)] focus-visible:ring-4 focus-visible:ring-[var(--focus)] xl:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={t('nav.menu')}
              onClick={() => setOpen((o) => !o)}
            >
              ☰
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" className="grid grid-cols-2 border-t border-[var(--border)] px-4 py-2 sm:grid-cols-3 xl:hidden" aria-label="mobile">
            {[...links, { to: '/history', label: t('nav.history') }, { to: '/settings', label: t('nav.settings') }, { to: '/profile', label: t('nav.profile') }].map((l) => (
              <NavLink key={l.to} to={to(l.to)} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-medium hover:bg-[var(--surface-2)]">
                {l.label}
              </NavLink>
            ))}
            {me?.kind === 'user' ? (
              <button type="button" className="block w-full rounded-lg px-3 py-3 text-left font-medium hover:bg-[var(--surface-2)]" onClick={() => void logout()}>
                {t('auth.logout')}
              </button>
            ) : (
              <button type="button" className="block w-full rounded-lg px-3 py-3 text-left font-medium hover:bg-[var(--surface-2)]" onClick={() => login()}>
                {t('auth.login')}
              </button>
            )}
          </nav>
        )}
      </header>
      {authError && (
        <div className="bg-[var(--warn-bg)] px-4 py-2 text-center text-sm" role="alert">
          {t('auth.error')}
        </div>
      )}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-6 text-sm text-[var(--muted)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4">
          <span>{t('footer.copyright', { y: new Date().getFullYear() })}</span>
          <Link to={to('/about')} className="hover:underline">
            {t('nav.about')}
          </Link>
          <Link to={to('/privacy')} className="hover:underline">
            {t('nav.privacy')}
          </Link>
          <Link to={to('/terms')} className="hover:underline">
            {t('nav.terms')}
          </Link>
          <Link to={to('/settings')} className="hover:underline">
            {t('nav.settings')}
          </Link>
          <span className="ml-auto">{t('footer.license')}</span>
        </div>
      </footer>
    </div>
  );
}
