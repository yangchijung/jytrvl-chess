import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { zh, en, type StringKey } from './strings';

export type Lang = 'zh' | 'en';
const DICTS: Record<Lang, Record<StringKey, string>> = { zh, en };

/** Language is part of the URL: Traditional Chinese at "/…", English at "/en/…" (shareable & SEO friendly). */
export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'zh';
}

export function stripLang(pathname: string): string {
  if (pathname === '/en') return '/';
  if (pathname.startsWith('/en/')) return pathname.slice(3);
  return pathname;
}

export function localizedPath(lang: Lang, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'zh') return p;
  return p === '/' ? '/en' : `/en${p}`;
}

export function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

interface I18n {
  lang: Lang;
  t: (k: StringKey, vars?: Record<string, string | number>) => string;
  /** pick between inline bilingual text */
  pick: <T>(v: { zh: T; en: T }) => T;
  to: (path: string) => string;
  switchTo: string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const lang = langFromPath(loc.pathname);
  const value = useMemo<I18n>(() => {
    const d = DICTS[lang];
    const bare = stripLang(loc.pathname);
    return {
      lang,
      t: (k, vars) => format(d[k] ?? zh[k] ?? k, vars),
      pick: (v) => v[lang],
      to: (p) => localizedPath(lang, p),
      switchTo: localizedPath(lang === 'zh' ? 'en' : 'zh', bare) + loc.search,
    };
  }, [lang, loc.pathname, loc.search]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}

export type { StringKey };
