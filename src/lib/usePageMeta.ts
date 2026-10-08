import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metaFor, ORIGIN } from './seo';
import { langFromPath, stripLang, localizedPath } from '../i18n';

function setMeta(selector: string, attr: string, value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/** Keeps <title>, description, canonical, hreflang and robots in sync during client-side navigation. */
export function usePageMeta() {
  const loc = useLocation();
  useEffect(() => {
    const lang = langFromPath(loc.pathname);
    const bare = stripLang(loc.pathname).replace(/\/$/, '') || '/';
    const m = metaFor(bare);
    document.title = m.title[lang];
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant-TW' : 'en';
    const meta = (name: string) => () => {
      const e = document.createElement('meta');
      e.setAttribute('name', name);
      return e;
    };
    setMeta('meta[name="description"]', 'content', m.description[lang], meta('description'));
    setMeta('meta[name="robots"]', 'content', m.index ? 'index,follow' : 'noindex,nofollow', meta('robots'));
    const link = (rel: string, hreflang?: string) => () => {
      const e = document.createElement('link');
      e.setAttribute('rel', rel);
      if (hreflang) e.setAttribute('hreflang', hreflang);
      return e;
    };
    setMeta('link[rel="canonical"]', 'href', ORIGIN + localizedPath(lang, bare), link('canonical'));
    setMeta('link[hreflang="zh-Hant-TW"]', 'href', ORIGIN + localizedPath('zh', bare), link('alternate', 'zh-Hant-TW'));
    setMeta('link[hreflang="en"]', 'href', ORIGIN + localizedPath('en', bare), link('alternate', 'en'));
  }, [loc.pathname]);
}
