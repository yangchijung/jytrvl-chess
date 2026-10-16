// Shared page frame (HOME_SHARED_UI_V1 §3): opaque header with a divider, short desktop links, one site
// menu on every width (a plain disclosure, not role="menu"), skip link, footer.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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

const GAMES = ['chess', 'xiangqi', 'banqi', 'territory', 'snake', 'blocks', 'sudoku'] as const;
const iconBtn = 'ui-t flex h-11 min-w-11 items-center justify-center rounded-md px-2 hover:bg-[var(--surface-2)]';
const navLink = ({ isActive }: { isActive: boolean }) =>
  `ui-t flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-[var(--surface-2)] ${isActive ? 'underline decoration-2 underline-offset-[6px]' : ''}`;
const menuLink = ({ isActive }: { isActive: boolean }) =>
  `ui-t flex min-h-11 items-center rounded-md px-3 font-medium hover:bg-[var(--surface-2)] ${isActive ? 'border-l-4 border-[var(--ui-accent-text)] bg-[var(--surface-2)] pl-2' : ''}`;

export function Layout({ children }: { children: ReactNode }) {
  usePageMeta();
  const { t, to, switchTo, lang } = useI18n();
  const { me, login, logout } = useAuth();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const menuId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // close the menu on navigation (route or language change)
  useEffect(() => setOpen(false), [loc.pathname]);
  // Esc closes and returns focus to the button; a click outside closes without moving focus
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

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
  const user = me?.kind === 'user' ? me : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only rounded-md bg-[var(--surface)] px-3 py-2 font-medium focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50">
        {t('nav.skip')}
      </a>
      <header ref={headerRef} className={`${open ? 'relative' : 'sticky top-0'} z-30 border-b border-[var(--border)] bg-[var(--header-bg)]`} data-testid="site-header">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1 md:px-6">
          <Link to={to('/')} className="flex min-h-11 items-center gap-2 rounded-md" aria-label="JY Games">
            <Logo />
            <span className="font-serif text-lg font-bold tracking-wide">JY Games</span>
          </Link>
          <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label={t('nav.primaryLabel')}>
            <NavLink to={to('/')} end className={navLink}>
              {t('nav.allGames')}
            </NavLink>
            <NavLink to={to('/leaderboard')} className={navLink}>
              {t('nav.leaderboard')}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link to={switchTo} className={`${iconBtn} text-sm font-medium`} hrefLang={lang === 'zh' ? 'en' : 'zh-Hant-TW'} aria-label={t('lang.label')} data-testid="lang-switch">
              {t('lang.switch')}
            </Link>
            <button
              type="button"
              className={iconBtn}
              onClick={() => update({ theme: nextTheme })}
              aria-label={t('theme.changeLabel', { current: t(`theme.${settings.theme}`), next: t(`theme.${nextTheme}`) })}
              title={t(`theme.${settings.theme}`)}
              data-testid="theme-toggle"
              data-theme-setting={settings.theme}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                {themeIcon}
              </svg>
            </button>
            {user ? (
              <Link to={to('/profile')} className={`${iconBtn} hidden max-w-40 text-sm font-medium lg:flex`}>
                <span className="truncate">{user.nickname}</span>
              </Link>
            ) : (
              <button type="button" onClick={() => login()} className={`${iconBtn} hidden text-sm font-medium lg:flex`}>
                {t('auth.login')}
              </button>
            )}
            <button
              ref={btnRef}
              type="button"
              className={iconBtn}
              aria-expanded={open}
              aria-controls={menuId}
              aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
              onClick={() => setOpen((o) => !o)}
              data-testid="menu-button"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                {open ? <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
        </div>
        <nav id={menuId} hidden={!open} aria-label={t('nav.menuLabel')} className="border-t border-[var(--border)]" data-testid="site-menu">
          <div className="mx-auto grid max-w-6xl gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
            <section aria-labelledby={`${menuId}-g`}>
              <h2 id={`${menuId}-g`} className="mb-1 px-3 text-sm font-semibold text-[var(--muted)]">
                {t('nav.group.games')}
              </h2>
              <ul>
                <li>
                  <NavLink to={to('/')} end className={menuLink}>
                    {t('nav.allGames')}
                  </NavLink>
                </li>
                {GAMES.map((g) => (
                  <li key={g}>
                    <NavLink to={to(`/${g}`)} className={menuLink}>
                      {t(`game.${g}`)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby={`${menuId}-m`}>
              <h2 id={`${menuId}-m`} className="mb-1 px-3 text-sm font-semibold text-[var(--muted)]">
                {t('nav.group.more')}
              </h2>
              <ul>
                {(
                  [
                    ['/leaderboard', 'nav.leaderboard'],
                    ['/history', 'nav.history'],
                    ['/settings', 'nav.settings'],
                  ] as const
                ).map(([p, k]) => (
                  <li key={p}>
                    <NavLink to={to(p)} className={menuLink}>
                      {t(k)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby={`${menuId}-a`}>
              <h2 id={`${menuId}-a`} className="mb-1 px-3 text-sm font-semibold text-[var(--muted)]">
                {t('nav.group.account')}
              </h2>
              <ul>
                <li>
                  <NavLink to={to('/profile')} className={menuLink}>
                    {user ? user.nickname : t('nav.profile')}
                  </NavLink>
                </li>
                <li>
                  {user ? (
                    <button type="button" className="ui-t flex min-h-11 w-full items-center rounded-md px-3 text-left font-medium hover:bg-[var(--surface-2)]" onClick={() => void logout()} data-testid="menu-logout">
                      {t('auth.logout')}
                    </button>
                  ) : (
                    <button type="button" className="ui-t flex min-h-11 w-full items-center rounded-md px-3 text-left font-medium hover:bg-[var(--surface-2)]" onClick={() => login()} data-testid="menu-login">
                      {t('auth.login')}
                    </button>
                  )}
                </li>
              </ul>
            </section>
          </div>
        </nav>
      </header>
      {authError && (
        <div className="bg-[var(--ui-alert-bg)] px-4 py-2 text-center text-sm text-[var(--ui-alert-text)]" role="alert">
          {t('auth.error')}
        </div>
      )}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 scroll-mt-16 px-4 py-4 sm:py-6 md:px-6">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-4 text-sm text-[var(--muted)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-4 md:px-6">
          <span className="py-3 pr-2">{t('footer.copyright', { y: new Date().getFullYear() })}</span>
          {(
            [
              ['/about', 'nav.about'],
              ['/privacy', 'nav.privacy'],
              ['/terms', 'nav.terms'],
              ['/settings', 'nav.settings'],
            ] as const
          ).map(([p, k]) => (
            <Link key={p} to={to(p)} className="ui-t inline-flex min-h-11 items-center rounded-md px-2 underline-offset-4 hover:underline">
              {t(k)}
            </Link>
          ))}
          <span className="py-3 sm:ml-auto">{t('footer.license')}</span>
        </div>
      </footer>
    </div>
  );
}
