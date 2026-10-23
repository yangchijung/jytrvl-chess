/// <reference types="node" />
// Post-build: writes per-route HTML shells with correct <head> metadata for SEO and link previews,
// plus sitemap.xml and robots.txt. The SPA takes over on load.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PAGES, ORIGIN } from '../src/lib/seo';

const base = readFileSync('dist/index.html', 'utf8');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const loc = (lang: 'zh' | 'en', p: string) => (lang === 'zh' ? p : p === '/' ? '/en' : `/en${p}`);

const urls: string[] = [];
// Sketch Coaster is one self-contained page at /coaster/ (public/coaster/index.html, kept as a single file by
// design). The site CSP allows no inline script, so this page gets the same policy plus the hash of its one
// inline script, computed from the built file at every build.
const coasterHtml = readFileSync('dist/coaster/index.html', 'utf8');
const coasterScript = coasterHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!coasterScript) throw new Error('coaster: inline script not found');
const coasterHash = createHash('sha256').update(coasterScript, 'utf8').digest('base64');
appendFileSync(
  'dist/_headers',
  `\n/coaster/*\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-${coasterHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'\n`,
);
const COASTER_URL = `  <url><loc>${ORIGIN}/coaster/</loc></url>\n`;
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
    .join('\n')}\n${COASTER_URL}</urlset>\n`,
);
writeFileSync(
  'dist/robots.txt',
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /room/\nDisallow: /en/room/\nDisallow: /profile\nDisallow: /history\nDisallow: /settings\nDisallow: /matchmaking\nDisallow: /play\nDisallow: /territory/room/\nDisallow: /en/territory/room/\nDisallow: /territory/play\nDisallow: /territory/flow\nDisallow: /en/territory/flow\nDisallow: /territory/match\nDisallow: /territory/new-room\nDisallow: /snake/room/\nDisallow: /en/snake/room/\nDisallow: /snake/play\nDisallow: /snake/match\nDisallow: /snake/new-room\nDisallow: /blocks/room/\nDisallow: /en/blocks/room/\nDisallow: /blocks/play\nDisallow: /blocks/match\nDisallow: /blocks/ranked\nDisallow: /blocks/new-room\nDisallow: /restaurant\nDisallow: /en/restaurant\nDisallow: /robot\nDisallow: /en/robot\nDisallow: /trail\nDisallow: /en/trail\nDisallow: /rescue\nDisallow: /en/rescue\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
);
console.log(`prerendered ${Object.keys(PAGES).length * 2} pages, sitemap ${urls.length} urls`);
