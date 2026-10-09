// Canvas 2D renderer for Snake Arena (original JY Games style: rounded tube snakes with a lighter
// belly stripe, round "berry" food with a leaf, a gold star bonus, soft tiled floor).
import type { SnakeGame } from '../../shared/snake/engine';
import { PALETTE, type Theme } from '../territory/render';
import type { SnakeClient } from './client';

export interface View {
  ox: number;
  oy: number;
  cell: number;
}

export function fitView(w: number, h: number, g: SnakeGame): View {
  const cell = Math.max(4, Math.floor(Math.min((w - 8) / g.w, (h - 8) / g.h)));
  return { cell, ox: Math.floor((w - cell * g.w) / 2), oy: Math.floor((h - cell * g.h) / 2) };
}

function cellCenter(g: SnakeGame, v: View, c: number): [number, number] {
  const x = c % g.w,
    y = Math.floor(c / g.w);
  return [v.ox + (x + 0.5) * v.cell, v.oy + (y + 0.5) * v.cell];
}

/** interpolated point between cells a → b (no interpolation across a wrap-around) */
function lerpCell(g: SnakeGame, v: View, a: number, b: number, t: number): [number, number] {
  const [ax, ay] = cellCenter(g, v, a);
  const [bx, by] = cellCenter(g, v, b);
  if (Math.abs(ax - bx) > v.cell * 1.5 || Math.abs(ay - by) > v.cell * 1.5) return t < 0.5 ? [ax, ay] : [bx, by];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

export function drawSnakeArena(ctx: CanvasRenderingContext2D, w: number, h: number, client: SnakeClient, v: View, theme: Theme, now: number, anim: boolean) {
  const g = client.game!;
  const t = anim ? client.frac(now) : 1;
  ctx.fillStyle = theme.dark ? '#0f1622' : '#ece5d6';
  ctx.fillRect(0, 0, w, h);
  // floor
  ctx.fillStyle = theme.bg;
  ctx.fillRect(v.ox, v.oy, v.cell * g.w, v.cell * g.h);
  ctx.fillStyle = theme.grid;
  for (let y = 0; y < g.h; y++) for (let x = (y % 2); x < g.w; x += 2) ctx.fillRect(v.ox + x * v.cell, v.oy + y * v.cell, v.cell, v.cell);
  // border
  ctx.strokeStyle = g.cfg.walls ? theme.edge : theme.dark ? 'rgba(255,255,255,0.25)' : 'rgba(27,42,65,0.25)';
  ctx.lineWidth = g.cfg.walls ? 3 : 1.5;
  if (!g.cfg.walls) ctx.setLineDash([6, 6]);
  ctx.strokeRect(v.ox - 1.5, v.oy - 1.5, v.cell * g.w + 3, v.cell * g.h + 3);
  ctx.setLineDash([]);
  // walls / obstacles
  const r = Math.max(2, v.cell * 0.18);
  for (let i = 0; i < g.wall.length; i++) {
    if (!g.wall[i]) continue;
    const x = v.ox + (i % g.w) * v.cell,
      y = v.oy + Math.floor(i / g.w) * v.cell;
    ctx.fillStyle = theme.dark ? '#3c4a60' : '#7b6a52';
    roundRect(ctx, x + 0.5, y + 0.5, v.cell - 1, v.cell - 1, r);
    ctx.fill();
    ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 2, y + 2, v.cell - 4, Math.max(1, v.cell * 0.2));
  }
  // food
  for (const [c, kind] of g.food) {
    const [x, y] = cellCenter(g, v, c);
    const born = client.popAt.get(c);
    const pulse = anim ? 1 + Math.sin(now / 260 + c) * 0.06 : 1;
    if (kind === 2) drawStar(ctx, x, y, v.cell * 0.46 * pulse, '#f5b301', '#a87500');
    else {
      const rad = v.cell * 0.34 * pulse;
      ctx.fillStyle = '#e4572e';
      ctx.beginPath();
      ctx.arc(x, y + rad * 0.1, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(x - rad * 0.35, y - rad * 0.2, rad * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.ellipse(x + rad * 0.35, y - rad * 0.95, rad * 0.4, rad * 0.18, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (born && now - born < 300) client.popAt.delete(c);
  }
  // eat pops
  for (const [c, at] of client.popAt) {
    const k = (now - at) / 320;
    if (k > 1 || !anim) {
      client.popAt.delete(c);
      continue;
    }
    const [x, y] = cellCenter(g, v, c);
    ctx.strokeStyle = `rgba(245,179,1,${1 - k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, v.cell * (0.4 + k * 0.9), 0, Math.PI * 2);
    ctx.stroke();
  }
  // snakes
  g.snakes.forEach((s, k) => {
    if (!s.alive || !s.body.length) return;
    const col = PALETTE[(client.colors[k] ?? s.color) % 8];
    const pts: [number, number][] = [];
    const prevHead = client.prevHead[k];
    const head = s.body[0];
    // head moves from its previous cell towards the current one
    pts.push(prevHead !== undefined && prevHead >= 0 && prevHead !== head ? lerpCell(g, v, prevHead, head, t) : cellCenter(g, v, head));
    for (let i = 1; i < s.body.length; i++) pts.push(cellCenter(g, v, s.body[i]));
    // tail: retracting from the cell it left
    const pt = client.prevTail[k];
    if (pt !== undefined && pt >= 0 && pt !== s.body[s.body.length - 1] && !s.body.includes(pt)) {
      const last = s.body[s.body.length - 1];
      pts.push(lerpCell(g, v, pt, last, t));
    }
    const width = v.cell * 0.78;
    drawTube(ctx, g, v, pts, width, col.dark);
    drawTube(ctx, g, v, pts, width * 0.82, col.base);
    drawTube(ctx, g, v, pts, width * 0.3, col.land);
    // head
    const [hx, hy] = pts[0];
    ctx.fillStyle = col.base;
    ctx.beginPath();
    ctx.arc(hx, hy, width * 0.55, 0, Math.PI * 2);
    ctx.fill();
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][s.dir];
    const ex = -dy,
      ey = dx;
    for (const side of [-1, 1]) {
      const cx = hx + dx * width * 0.18 + ex * side * width * 0.24,
        cy = hy + dy * width * 0.18 + ey * side * width * 0.24;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, width * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b2a41';
      ctx.beginPath();
      ctx.arc(cx + dx * width * 0.05, cy + dy * width * 0.05, width * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    if (g.snakes.length > 1 && v.cell >= 10) {
      ctx.font = `600 ${Math.max(10, Math.min(13, v.cell * 0.7))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = theme.text;
      ctx.fillText(s.name, hx, hy - width * 0.9);
    }
  });
  // death bursts
  for (const f of client.feed) {
    if (f.ev.type !== 'death' || !anim) continue;
    const k = (now - f.at) / 600;
    if (k > 1) continue;
    const [x, y] = cellCenter(g, v, Math.max(0, f.ev.cell));
    const col = PALETTE[(client.colors[f.ev.snake] ?? f.ev.snake) % 8];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.fillStyle = col.base;
      ctx.globalAlpha = 1 - k;
      ctx.fillRect(x + Math.cos(a) * k * v.cell * 2.2 - 2, y + Math.sin(a) * k * v.cell * 2.2 - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}

function drawTube(ctx: CanvasRenderingContext2D, g: SnakeGame, v: View, pts: [number, number][], width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    // break the line across a wrap-around
    if (Math.abs(px - x) > v.cell * 1.5 || Math.abs(py - y) > v.cell * 1.5) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
  ctx.stroke();
  void g;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
