// Color Doodle — canvas rendering shared by the live paper and PNG export. Coordinates are normalised (0..1).
import { colorOf, type Cell, type ColorId, type FreeOp, type Shape, type Size } from '../../shared/doodle/model';
import { FISH_ART, type Region } from '../../shared/doodle/scene';

export const LINE: Record<Size, number> = { s: 0.006, m: 0.014, l: 0.03 }; // fraction of paper width
export const STAMP: Record<Size, number> = { s: 0.035, m: 0.06, l: 0.095 };
export const RATIO = 3 / 4; // paper height / width

export function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
  else {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 1.05, y + r * 0.8);
    ctx.lineTo(x - r * 1.05, y + r * 0.8);
    ctx.closePath();
  }
}

/** Draws free-drawing ops onto a transparent canvas of w×h device pixels (erasing cuts through). */
export function renderFree(ctx: CanvasRenderingContext2D, ops: FreeOp[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  for (const op of ops) drawOp(ctx, op, w, h);
}

export function drawOp(ctx: CanvasRenderingContext2D, op: FreeOp, w: number, h: number) {
  if (op.t === 'clear') return;
  ctx.save();
  if (op.t === 'stroke') {
    ctx.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = op.erase ? '#000' : colorOf(op.color).hex;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = LINE[op.size] * w * (op.erase ? 2 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (op.pts.length === 1) {
      ctx.beginPath();
      ctx.arc(op.pts[0][0] * w, op.pts[0][1] * h, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(op.pts[0][0] * w, op.pts[0][1] * h);
      for (const [x, y] of op.pts.slice(1)) ctx.lineTo(x * w, y * h);
      ctx.stroke();
    }
  } else {
    const c = colorOf(op.color);
    shapePath(ctx, op.shape, op.x * w, op.y * h, STAMP[op.size] * w);
    ctx.fillStyle = c.hex;
    ctx.fill();
    // white stamps need an outline to be visible on white paper
    if (op.color === 'white') {
      ctx.lineWidth = Math.max(1, w * 0.003);
      ctx.strokeStyle = '#8a8a8a';
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderGrid(ctx: CanvasRenderingContext2D, cells: (Cell | null)[], size: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const s = size / 3;
  ctx.strokeStyle = '#c9c9c3';
  ctx.lineWidth = Math.max(1, size / 300);
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, size);
    ctx.moveTo(0, i * s);
    ctx.lineTo(size, i * s);
    ctx.stroke();
  }
  cells.forEach((c, i) => {
    if (!c) return;
    const x = (i % 3) * s + s / 2,
      y = Math.floor(i / 3) * s + s / 2;
    shapePath(ctx, c.shape, x, y, s * 0.32);
    ctx.fillStyle = colorOf(c.color).hex;
    ctx.fill();
    if (c.color === 'white') {
      ctx.strokeStyle = '#8a8a8a';
      ctx.stroke();
    }
  });
}

/** PNG of the free paper (white background, no interface) or of the stamp grid. */
export function exportPng(kind: 'free' | 'grid', ops: FreeOp[], cells: (Cell | null)[]): Promise<Blob | null> {
  const c = document.createElement('canvas');
  if (kind === 'free') {
    c.width = 1600;
    c.height = 1200;
    const layer = document.createElement('canvas');
    layer.width = c.width;
    layer.height = c.height;
    renderFree(layer.getContext('2d')!, ops, layer.width, layer.height);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(layer, 0, 0);
  } else {
    c.width = c.height = 1200;
    renderGrid(c.getContext('2d')!, cells, 1200);
  }
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** PNG of the picture-play fish: the child's region colours on white, outlines, no interface or motion frames. */
export function exportScenePng(colors: Record<Region, ColorId | null>): Promise<Blob | null> {
  const c = document.createElement('canvas');
  const k = 4; // 400×300 art → 1600×1200
  c.width = FISH_ART.viewBox.w * k;
  c.height = FISH_ART.viewBox.h * k;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2328';
  ctx.lineWidth = 4;
  for (const r of ['tail', 'fin', 'body'] as Region[]) {
    const p = new Path2D(FISH_ART[r]);
    ctx.fillStyle = colors[r] ? colorOf(colors[r]!).hex : '#ffffff';
    ctx.fill(p);
    ctx.stroke(p);
  }
  ctx.fillStyle = '#1f2328';
  ctx.beginPath();
  ctx.arc(FISH_ART.eye.cx, FISH_ART.eye.cy, FISH_ART.eye.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke(new Path2D(FISH_ART.mouth));
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}
