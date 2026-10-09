// Canvas 2D renderer for Territory Rush (original JY Games art style: flat land tiles with a soft
// inner bevel, translucent trails, rounded "token" runners with direction eyes).
import { DIRS, type TerritoryGame } from '../../shared/territory/engine';
import type { TerritoryClient } from './client';

export const PALETTE = [
  { base: '#1f9d6b', land: '#8fd4b5', dark: '#126645' }, // jade
  { base: '#e4572e', land: '#f4ad97', dark: '#9c3415' }, // coral
  { base: '#2e86de', land: '#9cc6f0', dark: '#1a5a9a' }, // azure
  { base: '#e3a008', land: '#f3d482', dark: '#9a6b00' }, // amber
  { base: '#8e5cd9', land: '#c9b0ef', dark: '#5d3699' }, // violet
  { base: '#d6336c', land: '#efa3bf', dark: '#931f49' }, // rose
  { base: '#139fb3', land: '#90d6e0', dark: '#0b6c7a' }, // teal
  { base: '#6f9a1e', land: '#c0d98c', dark: '#4b6912' }, // olive
];

export interface Theme {
  bg: string;
  grid: string;
  edge: string;
  text: string;
  dark: boolean;
}

export function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el);
  const dark = cs.colorScheme.includes('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    bg: dark ? '#141c2a' : '#f7f3ea',
    grid: dark ? 'rgba(255,255,255,0.045)' : 'rgba(27,42,65,0.055)',
    edge: dark ? '#c8a24a' : '#1b2a41',
    text: cs.getPropertyValue('--text').trim() || '#1f2328',
    dark,
  };
}

export interface Camera {
  cx: number; // centre in cell units
  cy: number;
  cell: number; // px per cell (CSS px)
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
const particles: Particle[] = [];
let lastFeedId = 0;

export function headPos(c: TerritoryClient, g: TerritoryGame, k: number, f: number): [number, number] {
  const p = g.players[k];
  const px = c.prev[k * 2] ?? p.x,
    py = c.prev[k * 2 + 1] ?? p.y;
  // teleport guard (respawn/snapshot)
  if (Math.abs(px - p.x) + Math.abs(py - p.y) > 1.5) return [p.x, p.y];
  return [px + (p.x - px) * f, py + (p.y - py) * f];
}

export function draw(ctx: CanvasRenderingContext2D, wPx: number, hPx: number, c: TerritoryClient, cam: Camera, theme: Theme, now: number, animate: boolean) {
  const g = c.game;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, wPx, hPx);
  if (!g) return;
  const cs = cam.cell;
  const ox = wPx / 2 - cam.cx * cs,
    oy = hPx / 2 - cam.cy * cs;
  const x0 = Math.max(0, Math.floor(-ox / cs)),
    y0 = Math.max(0, Math.floor(-oy / cs));
  const x1 = Math.min(g.w - 1, Math.ceil((wPx - ox) / cs)),
    y1 = Math.min(g.h - 1, Math.ceil((hPx - oy) / cs));

  // map area + grid
  ctx.fillStyle = theme.dark ? '#1a2333' : '#fffdf8';
  ctx.fillRect(ox, oy, g.w * cs, g.h * cs);
  if (cs >= 8) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      ctx.moveTo(Math.round(ox + x * cs) + 0.5, oy + y0 * cs);
      ctx.lineTo(Math.round(ox + x * cs) + 0.5, oy + (y1 + 1) * cs);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      ctx.moveTo(ox + x0 * cs, Math.round(oy + y * cs) + 0.5);
      ctx.lineTo(ox + (x1 + 1) * cs, Math.round(oy + y * cs) + 0.5);
    }
    ctx.stroke();
  }

  // land: run-length per row
  for (let y = y0; y <= y1; y++) {
    let x = x0;
    while (x <= x1) {
      const o = g.owner[y * g.w + x];
      let e = x + 1;
      while (e <= x1 && g.owner[y * g.w + e] === o) e++;
      if (o >= 0) {
        const pal = PALETTE[g.players[o].color % PALETTE.length];
        ctx.fillStyle = pal.land;
        ctx.fillRect(ox + x * cs, oy + y * cs, (e - x) * cs + 0.5, cs + 0.5);
      }
      x = e;
    }
  }
  // land borders (darker edge where land meets a different owner)
  if (cs >= 6) {
    ctx.lineWidth = Math.max(1, cs * 0.12);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const o = g.owner[y * g.w + x];
        if (o < 0) continue;
        const pal = PALETTE[g.players[o].color % PALETTE.length];
        const up = y > 0 ? g.owner[(y - 1) * g.w + x] : -2;
        const dn = y < g.h - 1 ? g.owner[(y + 1) * g.w + x] : -2;
        const lf = x > 0 ? g.owner[y * g.w + x - 1] : -2;
        const rt = x < g.w - 1 ? g.owner[y * g.w + x + 1] : -2;
        if (up === o && dn === o && lf === o && rt === o) continue;
        ctx.strokeStyle = pal.base;
        ctx.beginPath();
        const px = ox + x * cs,
          py = oy + y * cs;
        if (up !== o) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + cs, py);
        }
        if (dn !== o) {
          ctx.moveTo(px, py + cs);
          ctx.lineTo(px + cs, py + cs);
        }
        if (lf !== o) {
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + cs);
        }
        if (rt !== o) {
          ctx.moveTo(px + cs, py);
          ctx.lineTo(px + cs, py + cs);
        }
        ctx.stroke();
      }
  }
  // capture animation: freshly claimed cells pop in brighter
  if (animate) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * g.w + x;
        const t = now - c.captureAt[i];
        if (t < 0 || t > 450 || !c.captureAt[i]) continue;
        const o = g.owner[i];
        if (o < 0) continue;
        const k = 1 - t / 450;
        ctx.fillStyle = `rgba(255,255,255,${0.55 * k})`;
        const inset = (cs * (1 - k)) / 2;
        ctx.fillRect(ox + x * cs + inset, oy + y * cs + inset, cs - inset * 2, cs - inset * 2);
      }
  }
  // trails
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const t = g.trail[y * g.w + x];
      if (t < 0) continue;
      const pal = PALETTE[g.players[t].color % PALETTE.length];
      ctx.fillStyle = pal.base;
      ctx.globalAlpha = 0.55;
      const inset = cs * 0.18;
      ctx.fillRect(ox + x * cs + inset, oy + y * cs + inset, cs - inset * 2, cs - inset * 2);
      ctx.globalAlpha = 1;
    }
  // map edge
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = Math.max(2, cs * 0.25);
  ctx.strokeRect(ox, oy, g.w * cs, g.h * cs);

  // heads
  const f = c.frac(now);
  g.players.forEach((p, k) => {
    if (!p.alive) return;
    const [hx, hy] = headPos(c, g, k, f);
    const pal = PALETTE[p.color % PALETTE.length];
    const px = ox + (hx + 0.5) * cs,
      py = oy + (hy + 0.5) * cs;
    const r = cs * 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, px - r, py - r + cs * 0.12, r * 2, r * 2, r * 0.45);
    ctx.fill();
    ctx.fillStyle = pal.base;
    roundRect(ctx, px - r, py - r, r * 2, r * 2, r * 0.45);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, cs * 0.1);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    // eyes looking in the move direction
    const [dx, dy] = DIRS[p.dir];
    const ex = dx * r * 0.32,
      ey = dy * r * 0.32;
    const sx = -dy * r * 0.36,
      sy = dx * r * 0.36;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px + ex + sx * s, py + ey + sy * s, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.arc(px + ex * 1.35 + sx * s, py + ey * 1.35 + sy * s, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    if (cs >= 10) {
      ctx.font = `600 ${Math.max(11, cs * 0.55)}px Inter, "Noto Sans TC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = theme.dark ? '#f1ece2' : '#1b2a41';
      ctx.fillText(p.name, px, py - r - 6);
    }
    if (c.me.includes(k) && c.me.length === 1) c.screenHead = { x: px, y: py, cell: cs };
  });

  // death particles from the event feed
  if (animate) {
    for (const item of c.feed) {
      if (item.id <= lastFeedId) continue;
      lastFeedId = item.id;
      if (item.ev.type !== 'death') continue;
      const p = g.players[item.ev.player];
      if (!p) continue;
      const color = PALETTE[p.color % PALETTE.length].base;
      for (let n = 0; n < 22; n++) {
        const a = Math.random() * Math.PI * 2,
          s = 0.03 + Math.random() * 0.09;
        particles.push({ x: p.x + 0.5, y: p.y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= 0.025;
      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(ox + pt.x * cs - cs * 0.18, oy + pt.y * cs - cs * 0.18, cs * 0.36, cs * 0.36);
      ctx.globalAlpha = 1;
    }
  } else {
    lastFeedId = c.feed.at(-1)?.id ?? lastFeedId;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Mini map: 1 px per cell into an ImageData, scaled by CSS. */
export function drawMinimap(ctx: CanvasRenderingContext2D, c: TerritoryClient, theme: Theme) {
  const g = c.game;
  if (!g) return;
  const img = ctx.createImageData(g.w, g.h);
  const bg = theme.dark ? [32, 42, 60] : [236, 230, 216];
  const rgb = PALETTE.map((p) => hexRgb(p.base));
  for (let i = 0; i < g.owner.length; i++) {
    const o = g.owner[i],
      t = g.trail[i];
    let col = bg;
    if (o >= 0) col = rgb[g.players[o].color % PALETTE.length];
    if (t >= 0) col = rgb[g.players[t].color % PALETTE.length].map((v) => Math.min(255, v + 60));
    img.data[i * 4] = col[0];
    img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = o >= 0 || t >= 0 ? 255 : 200;
  }
  ctx.putImageData(img, 0, 0);
  for (const p of g.players) {
    if (!p.alive) continue;
    ctx.fillStyle = c.me.includes(p.idx) ? '#ffffff' : '#000000';
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }
}

function hexRgb(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
