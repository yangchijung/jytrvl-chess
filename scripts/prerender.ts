/// <reference types="node" />
// Post-build: writes per-route HTML shells with correct <head> metadata for SEO and link previews,
// plus sitemap.xml and robots.txt. The SPA takes over on load.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PAGES, ORIGIN } from '../src/lib/seo';

const base = readFileSync('dist/index.html', 'utf8');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const loc = (lang: 'zh' | 'en', p: string) => (lang === 'zh' ? p : p === '/' ? '/en' : `/en${p}`);

const urls: string[] = [];
for (const [path, m] of Object.entries(PAGES)) {
  for (const lang of ['zh', 'en'] as const) {
    const href = ORIGIN + loc(lang, path);
    const head = [
      `<title>${esc(m.title[lang])}</title>`,
      `<meta name="description" content="${esc(m.description[lang])}" />`,
      `<meta name="robots" content="${m.index ? 'index,follow' : 'noindex,nofollow'}" />`,
      `<link rel="canonical" href="${href}" />`,
      `<link rel="alternate" hreflang="zh-Hant-TW" href="${ORIGIN + loc('zh', path)}" />`,
      `<link rel="alternate" hreflang="en" href="${ORIGIN + loc('en', path)}" />`,
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN + loc('zh', path)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="JY Games" />`,
      `<meta property="og:title" content="${esc(m.title[lang])}" />`,
      `<meta property="og:description" content="${esc(m.description[lang])}" />`,
      `<meta property="og:url" content="${href}" />`,
      `<meta property="og:image" content="${ORIGIN}/og-image.png" />`,
      `<meta property="og:locale" content="${lang === 'zh' ? 'zh_TW' : 'en_US'}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join('\n    ');
    let html = base.replace(/<!--jy:head-->[\s\S]*?<!--\/jy:head-->/, head);
    html = html.replace('<html lang="zh-Hant-TW">', `<html lang="${lang === 'zh' ? 'zh-Hant-TW' : 'en'}">`);
    // Cloudflare Pages serves /chess from chess.html (no trailing-slash redirect)
    const outPath = loc(lang, path);
    const file = outPath === '/' ? 'dist/index.html' : `dist${outPath}.html`;
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, html);
    if (m.index) urls.push(href);
  }
}

writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${Object.entries(PAGES)
    .filter(([, m]) => m.index)
    .flatMap(([p]) =>
      (['zh', 'en'] as const).map(
        (lang) =>
          `  <url><loc>${ORIGIN + loc(lang, p)}</loc><xhtml:link rel="alternate" hreflang="zh-Hant-TW" href="${ORIGIN + loc('zh', p)}"/><xhtml:link rel="alternate" hreflang="en" href="${ORIGIN + loc('en', p)}"/></url>`,
      ),
    )
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  'dist/robots.txt',
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /room/\nDisallow: /en/room/\nDisallow: /profile\nDisallow: /history\nDisallow: /settings\nDisallow: /matchmaking\nDisallow: /play\nDisallow: /territory/room/\nDisallow: /en/territory/room/\nDisallow: /territory/play\nDisallow: /territory/match\nDisallow: /territory/new-room\nDisallow: /snake/room/\nDisallow: /en/snake/room/\nDisallow: /snake/play\nDisallow: /snake/match\nDisallow: /snake/new-room\nDisallow: /blocks/room/\nDisallow: /en/blocks/room/\nDisallow: /blocks/play\nDisallow: /blocks/match\nDisallow: /blocks/ranked\nDisallow: /blocks/new-room\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
);
console.log(`prerendered ${Object.keys(PAGES).length * 2} pages, sitemap ${urls.length} urls`);
