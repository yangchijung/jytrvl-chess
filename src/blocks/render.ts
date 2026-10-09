// Canvas 2D renderer for Block Puzzle Battle (original JY Games look: rounded tiles with a soft top
// highlight, dotted ghost piece, garbage meter beside the well).
import { W, H, HIDDEN, cells, PIECE_ID, GARBAGE, type PieceType } from '../../shared/blocks/engine';
import type { BPlayer } from './session';

export const BLOCK_COLORS: Record<number, [string, string]> = {
  1: ['#22a6b3', '#13707a'], // I teal
  2: ['#f0b429', '#a77a0c'], // O amber
  3: ['#8e5cd9', '#5d3699'], // T violet
  4: ['#1f9d6b', '#126645'], // S jade
  5: ['#e4572e', '#9c3415'], // Z coral
  6: ['#2e86de', '#1a5a9a'], // J azure
  7: ['#f08c2e', '#a65a12'], // L orange
  [GARBAGE]: ['#8a8f98', '#5c616a'],
};

export interface BoardTheme {
  dark: boolean;
}

const ROWS = H - HIDDEN;

/** Layout of one board inside its canvas: well in the middle, hold on the left, next on the right. */
export function boardLayout(w: number, h: number, compact: boolean) {
  const colsTotal = compact ? W + 1.2 : W + 10.4; // well + side panels (in cells)
  const cell = Math.max(6, Math.floor(Math.min(w / colsTotal, (h - 4) / ROWS)));
  const wellW = cell * W;
  const side = compact ? 0 : cell * 4.6;
  const meter = Math.max(4, Math.round(cell * 0.45));
  const totalW = side * 2 + wellW + meter + (compact ? 0 : cell * 0.6);
  const ox = Math.floor((w - totalW) / 2);
  return { cell, side, meter, wellX: ox + side + meter + (compact ? 0 : cell * 0.3), wellY: Math.floor((h - cell * ROWS) / 2), holdX: ox, nextX: ox + side + meter + wellW + cell * 0.6 };
}

function tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, id: number, alpha = 1) {
  const [c, d] = BLOCK_COLORS[id] ?? BLOCK_COLORS[GARBAGE];
  const r = Math.max(1.5, s * 0.16);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = d;
  rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, r);
  ctx.fill();
  ctx.fillStyle = c;
  rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3 - Math.max(1, s * 0.08), r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  rr(ctx, x + s * 0.18, y + s * 0.14, s * 0.64, s * 0.18, r * 0.6);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function miniPiece(ctx: CanvasRenderingContext2D, type: PieceType, cx: number, cy: number, s: number, dim = false) {
  const cs = cells(type, 0);
  const xs = cs.map((c) => c[0]),
    ys = cs.map((c) => c[1]);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * s,
    h = (Math.max(...ys) - Math.min(...ys) + 1) * s;
  for (const [x, y] of cs) tile(ctx, cx - w / 2 + (x - Math.min(...xs)) * s, cy - h / 2 + (y - Math.min(...ys)) * s, s, PIECE_ID[type], dim ? 0.35 : 1);
}

export function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, p: BPlayer, theme: BoardTheme, now: number, anim: boolean, compact: boolean, label: { hold: string; next: string }) {
  const g = p.game;
  const L = boardLayout(w, h, compact);
  const s = L.cell;
  ctx.clearRect(0, 0, w, h);
  // well background
  ctx.fillStyle = theme.dark ? '#0d141f' : '#1b2a41';
  rr(ctx, L.wellX - 3, L.wellY - 3, s * W + 6, s * ROWS + 6, 8);
  ctx.fill();
  ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.05)';
  for (let x = 1; x < W; x++) ctx.fillRect(L.wellX + x * s, L.wellY, 1, s * ROWS);
  for (let y = 1; y < ROWS; y++) ctx.fillRect(L.wellX, L.wellY + y * s, s * W, 1);
  // garbage shake
  const shake = anim && now - p.garbageAt < 220 ? Math.sin((now - p.garbageAt) / 18) * 3 : 0;
  ctx.save();
  ctx.translate(0, shake);
  // settled cells
  const flashing = anim && now - p.flashAt < 260 ? p.flashRows : [];
  for (let y = HIDDEN; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = g.board[y * W + x];
      if (v) tile(ctx, L.wellX + x * s, L.wellY + (y - HIDDEN) * s, s, v);
    }
  // line clear flash (rows already removed from the board: draw white bars where they were)
  if (flashing.length) {
    const k = 1 - (now - p.flashAt) / 260;
    ctx.fillStyle = `rgba(255,255,255,${0.75 * k})`;
    for (const y of flashing) if (y >= HIDDEN) ctx.fillRect(L.wellX, L.wellY + (y - HIDDEN) * s, s * W, s);
  }
  // ghost + active piece
  const pc = g.piece;
  if (pc && g.status === 'playing') {
    const gy = g.ghostY();
    for (const [cx, cy] of cells(pc.type, pc.rot)) {
      const yy = gy + cy - HIDDEN;
      if (yy < 0) continue;
      const [c] = BLOCK_COLORS[PIECE_ID[pc.type]];
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 2;
      ctx.strokeRect(L.wellX + (pc.x + cx) * s + 2, L.wellY + yy * s + 2, s - 4, s - 4);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    for (const [cx, cy] of cells(pc.type, pc.rot)) {
      const yy = pc.y + cy - HIDDEN;
      if (yy < 0) continue;
      tile(ctx, L.wellX + (pc.x + cx) * s, L.wellY + yy * s, s, PIECE_ID[pc.type]);
    }
  }
  ctx.restore();
  // garbage meter
  const pend = Math.min(ROWS, g.pendingGarbageLines());
  ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(27,42,65,0.12)';
  ctx.fillRect(L.wellX - L.meter - 4, L.wellY, L.meter, s * ROWS);
  if (pend) {
    ctx.fillStyle = pend >= 6 ? '#e03131' : '#f08c00';
    ctx.fillRect(L.wellX - L.meter - 4, L.wellY + s * (ROWS - pend), L.meter, s * pend);
  }
  // side panels
  if (!compact) {
    const txt = theme.dark ? '#d8dee9' : '#1b2a41';
    ctx.fillStyle = txt;
    ctx.font = `700 ${Math.max(10, s * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label.hold, L.holdX + L.side / 2, L.wellY + s * 0.8);
    ctx.fillText(label.next, L.nextX + L.side / 2, L.wellY + s * 0.8);
    const box = (x: number, y: number, hh: number) => {
      ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(27,42,65,0.07)';
      rr(ctx, x, y, L.side - s * 0.4, hh, 8);
      ctx.fill();
    };
    box(L.holdX, L.wellY + s * 1.2, s * 3.2);
    if (g.hold) miniPiece(ctx, g.hold, L.holdX + (L.side - s * 0.4) / 2, L.wellY + s * 2.8, s * 0.8, g.holdUsed);
    box(L.nextX, L.wellY + s * 1.2, s * 13.4);
    g.queue.slice(0, 5).forEach((t, i) => miniPiece(ctx, t, L.nextX + (L.side - s * 0.4) / 2, L.wellY + s * (2.8 + i * 2.6), i === 0 ? s * 0.8 : s * 0.65));
  }
  // top-out veil
  if (g.status === 'over') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(L.wellX, L.wellY, s * W, s * ROWS);
  }
  return L;
}
