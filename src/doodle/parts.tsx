// Color Doodle — shared pieces of the drawing page: copy, icons, the Canvas 2D paper, the stamp grid and the
// RYB wheel. Moved out of pages.tsx unchanged for the V2 workbench (DOODLE_WORKBENCH_V2.md).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react';
import { MAX_PTS, WHEEL, colorOf, inkOn, type ColorId, type FreeOp, type Mark, type Shape, type Size } from '../../shared/doodle/model';
import { RATIO, drawOp, renderFree } from './draw';

type L = { zh: string; en: string };
export const X: Record<string, L> = {
  // picture play (B1, docs/product/DOODLE_PLAYFUL_V1_1.md §3)
  picture: { zh: '玩圖畫', en: 'Picture play' },
  fishName: { zh: '我的小魚', en: 'My fish' },
  fishFirst: { zh: '選個顏色，塗看看', en: 'Pick a colour and paint' },
  tryMix: { zh: '試試混色', en: 'Try mixing' },
  tapBody: { zh: '點身體來上色', en: 'Tap the body to colour' },
  paintThis: { zh: '用這色畫', en: 'Paint with this' },
  move: { zh: '動一下', en: 'Make it move' },
  tryAnother: { zh: '換個顏色試試', en: 'Try another colour' },
  body: { zh: '身體', en: 'Body' },
  tail: { zh: '尾巴', en: 'Tail' },
  fin: { zh: '魚鰭', en: 'Fin' },
  fishDone: { zh: '橙色用在小魚上了', en: 'You used orange on your fish' },
  alsoOrange: { zh: '也試試混出的橙色', en: 'Also try the orange you mixed' },
  noColour: { zh: '還沒上色', en: 'Not coloured yet' },
  regions: { zh: '小魚的部位', en: 'Parts of the fish' },
  fishTask: { zh: '小任務：混出橙色，塗在小魚上', en: 'Short task: mix orange and paint it on the fish' },
  moved: { zh: '小魚擺了擺尾巴', en: 'The fish wagged its tail' },
  fishLabel: { zh: '小魚：身體{body}、尾巴{tail}、魚鰭{fin}', en: 'Fish: body {body}, tail {tail}, fin {fin}' },
  preview: { zh: '預覽版', en: 'Preview' },
  allColours: { zh: '全部顏色', en: 'All colours' },
  pickTwo: { zh: '選兩個顏色', en: 'Pick two colours' },
  slot: { zh: '第 {n} 個顏色', en: 'Colour {n}' },
  emptySlot: { zh: '還沒選', en: 'Not chosen' },
  clearSlots: { zh: '重選', en: 'Pick again' },
  size: { zh: '粗細', en: 'Size' },
  s: { zh: '細', en: 'Thin' },
  m: { zh: '中', en: 'Medium' },
  l: { zh: '粗', en: 'Thick' },
  shape: { zh: '印章形狀', en: 'Stamp shape' },
  tasks: { zh: '小任務', en: 'Short tasks' },
  task: { zh: '任務 {n}', en: 'Task {n}' },
  level: { zh: '提示多寡', en: 'Hints' },
  guess: { zh: '先猜猜看', en: 'Guess first' },
  guessOptional: { zh: '可以先猜，也可以直接混', en: 'Guess, or just mix' },
  next: { zh: '下一個任務', en: 'Next task' },
  backFree: { zh: '回自由畫', en: 'Back to drawing' },
  pickWarm: { zh: '哪個是暖色？', en: 'Which one is warm?' },
  notYet: { zh: '再想想，看看提示。', en: 'Not quite. Look again.' },
  draw: { zh: '畫畫看', en: 'Draw' },
  paper: { zh: '畫紙', en: 'Drawing paper' },
  gridLabel: { zh: '格子畫紙，方向鍵移動，Enter 蓋章', en: 'Stamp grid: arrow keys to move, Enter to stamp' },
  savedLocal: { zh: '畫作只存在這個瀏覽器', en: 'Your picture stays in this browser' },
  broken: { zh: '舊的存檔讀不出來，已另外保留一份；這是一張新畫紙。', en: 'The old save could not be read. A copy was kept aside; this is a fresh page.' },
  brokenFuture: { zh: '這份存檔來自較新的版本，這裡讀不出來，已另外保留一份；這是一張新畫紙。', en: 'This save comes from a newer version and cannot be read here. A copy was kept aside; this is a fresh page.' },
  brokenNoBackup: { zh: '舊的存檔讀不出來，也沒辦法另外備份。為了不蓋掉它，這次的畫存在另一個位置。', en: 'The old save could not be read or copied. To keep it safe, this drawing is saved in a separate place.' },
  brokenNoSave: { zh: '舊的存檔讀不出來，也沒辦法另外備份。為了不蓋掉它，這次不會存檔；離開前請先存成圖片。', en: 'The old save could not be read or copied. To keep it safe, nothing is saved this time. Save a picture before you leave.' },
  downloadOld: { zh: '下載舊存檔', en: 'Download the old save' },
  downloadAlt: { zh: '下載之前的畫', en: 'Download the earlier drawing' },
  restored: { zh: '舊的存檔讀不出來，已另外保留一份；接著畫上次存在另一個位置的畫。', en: 'The old save could not be read. A copy was kept aside; you are continuing the drawing saved in the separate place.' },
  altKept: { zh: '另一個位置還留著一份之前的畫，沒有蓋掉現在這張；需要的話可以下載。', en: 'An earlier drawing is still kept in a separate place. It did not replace this one; you can download it.' },
  noStorage: { zh: '這個瀏覽器不能存畫作；離開前請先存成圖片。', en: 'This browser cannot keep drawings. Save a picture before you leave.' },
  full: { zh: '這張畫紙滿了。先存成圖片，再換一張新畫紙。', en: 'This paper is full. Save a picture, then start a new paper.' },
  fullClear: { zh: '這張畫紙已經滿了，換新後不能復原。想留下來，請先存成圖片。', en: 'This paper is full, so a new paper cannot be undone. Save a picture first if you want to keep it.' },
  goStamp: { zh: '去蓋印章', en: 'Go stamp' },
  goDraw: { zh: '用這色畫', en: 'Draw with it' },
  wheel: { zh: '色環', en: 'Colour wheel' },
  need: { zh: '還要：', en: 'Still need:' },
  stampHere: { zh: '在這格蓋章', en: 'Stamp here' },
  eraseHere: { zh: '擦掉這格', en: 'Erase this cell' },
  done: { zh: '完成', en: 'Done' },
};
export const reduced = () => typeof window !== 'undefined' && (document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function downloadText(text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `color-doodle-old-save-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function MarkIcon({ mark, className = 'h-4 w-4' }: { mark?: Mark; className?: string }) {
  if (!mark) return null;
  const p: Record<Mark, ReactNode> = {
    circle: <circle cx="8" cy="8" r="5" />,
    triangle: <path d="M8 2.5 14 13H2z" />,
    square: <rect x="3" y="3" width="10" height="10" />,
    cross: <path d="M3 3l10 10M13 3 3 13" fill="none" strokeWidth="2.4" />,
    diamond: <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" />,
    leaf: <path d="M3 13C3 6 7 3 13 3c0 6-3 10-10 10z" />,
    star: <path d="M8 1.5l1.9 4.3 4.6.4-3.5 3 1.1 4.6L8 11.4l-4.1 2.4 1.1-4.6-3.5-3 4.6-.4z" />,
    'square-outline': <rect x="3" y="3" width="10" height="10" fill="none" strokeWidth="2.4" />,
  };
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="0">
      {p[mark]}
    </svg>
  );
}
export const markColour = (id: ColorId) => inkOn(colorOf(id).hex);

export const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
export const ICONS = {
  brush: 'M4 20c3 0 4-2 4-4l9-9 3 3-9 9c-2 0-4 1-7 1zM14 5l5 5',
  eraser: 'M8 20h12M5 15l8-8 6 6-6 6H9z',
  stamp: 'M9 4h6v5l3 3v3H6v-3l3-3zM5 19h14',
  undo: 'M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12',
  save: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  paper: 'M6 3h9l4 4v14H6zM15 3v4h4',
  why: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01',
};

// ------------------------------------------------------------------ paper (Canvas 2D)
export function Paper({ canvasRef, ops, tool, color, size, shape, onCommit, label }: { canvasRef: RefObject<HTMLCanvasElement | null>; ops: FreeOp[]; tool: 'brush' | 'eraser' | 'stamp'; color: ColorId; size: Size; shape: Shape; onCommit: (op: FreeOp) => void; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = canvasRef;
  const live = useRef<{ id: number; pts: [number, number][] } | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, dpr: 1 });

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setDim({ w, h: Math.round(w * RATIO), dpr: Math.min(2, window.devicePixelRatio || 1) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // redraw from the replayable ops whenever size or content changes (rotation never clears the picture)
  useEffect(() => {
    const c = cv.current;
    if (!c || !dim.w) return;
    c.width = Math.round(dim.w * dim.dpr);
    c.height = Math.round(dim.h * dim.dpr);
    renderFree(c.getContext('2d')!, ops, c.width, c.height);
  }, [ops, dim]);

  const pos = (e: RPointerEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (live.current || (e.pointerType === 'mouse' && e.button !== 0)) return; // ignore a second finger / other buttons
    const p = pos(e);
    if (tool === 'stamp') {
      onCommit({ t: 'stamp', color, shape, size, x: p[0], y: p[1] });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = { id: e.pointerId, pts: [p] };
    const c = cv.current!;
    drawOp(c.getContext('2d')!, { t: 'stroke', color, size, erase: tool === 'eraser', pts: [p] }, c.width, c.height);
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    const p = pos(e);
    const last = l.pts[l.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return;
    l.pts.push(p);
    // D4: a very long stroke continues as the next stroke, so no saved stroke exceeds MAX_PTS points
    if (l.pts.length >= MAX_PTS) {
      onCommit({ t: 'stroke', color, size, erase: tool === 'eraser', pts: l.pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
      l.pts = [p];
    }
    const c = cv.current!;
    drawOp(c.getContext('2d')!, { t: 'stroke', color, size, erase: tool === 'eraser', pts: [last, p] }, c.width, c.height);
  };
  const end = (e: RPointerEvent<HTMLCanvasElement>, cancel = false) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    live.current = null;
    if (cancel) {
      // drop the unfinished stroke (no sticky line); redraw what was committed
      const c = cv.current!;
      renderFree(c.getContext('2d')!, ops, c.width, c.height);
      return;
    }
    onCommit({ t: 'stroke', color, size, erase: tool === 'eraser', pts: l.pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
  };
  return (
    <div ref={wrap} className="mx-auto w-full" style={{ maxWidth: 'max(18rem, calc((100dvh - 8rem) * 4 / 3))' }}>
      <canvas
        ref={cv}
        tabIndex={-1}
        role="img"
        aria-label={label}
        className="block w-full touch-none rounded-md border border-[var(--ui-control-border)] bg-white"
        style={{ height: dim.h || undefined, aspectRatio: '4 / 3' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => end(e)}
        data-testid="paper"
      />
    </div>
  );
}

// ------------------------------------------------------------------ stamp grid (keyboard / screen reader path)
export function StampGrid({ boxRef, cells, focus, setFocus, onStamp, lang, label, c, erase }: { boxRef: RefObject<HTMLDivElement | null>; cells: ({ color: ColorId; shape: Shape } | null)[]; focus: number; setFocus: (i: number) => void; onStamp: (i: number) => void; lang: 'zh' | 'en'; label: string; c: (k: string, v?: Record<string, string | number>) => string; erase: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
    if (e.key in moves) {
      e.preventDefault();
      let n = i + moves[e.key];
      if ((e.key === 'ArrowRight' && i % 3 === 2) || (e.key === 'ArrowLeft' && i % 3 === 0)) n = i;
      if (n < 0 || n > 8) n = i;
      setFocus(n);
      refs.current[n]?.focus();
    }
  };
  return (
    <div ref={boxRef} className="mx-auto w-full max-w-md" role="group" aria-label={label} data-testid="stamp-grid">
      <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-md border border-[var(--ui-control-border)] bg-white">
        {cells.map((cell, i) => {
          const content = cell ? `${colorOf(cell.color).name[lang]}${lang === 'zh' ? '' : ' '}${c(cell.shape)}` : c('empty');
          return (
            <button
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focus ? 0 : -1}
              onFocus={() => setFocus(i)}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onStamp(i)}
              aria-label={`${c('gridAnnouncement', { row: Math.floor(i / 3) + 1, column: (i % 3) + 1, content })} ${erase ? X.eraseHere[lang] : X.stampHere[lang]}`}
              className="relative aspect-square border border-[#d8d9d1] focus-visible:z-10"
              data-testid={`cell-${i}`}
              data-content={cell ? `${cell.color}-${cell.shape}` : ''}
            >
              {cell && (
                <svg viewBox="0 0 16 16" className="absolute inset-[18%]" aria-hidden="true">
                  <g fill={colorOf(cell.color).hex} stroke={cell.color === 'white' ? '#8a8a8a' : 'none'} strokeWidth="0.6">
                    {cell.shape === 'circle' ? <circle cx="8" cy="8" r="6.5" /> : cell.shape === 'square' ? <rect x="1.5" y="1.5" width="13" height="13" /> : <path d="M8 1.5 15 14H1z" />}
                  </g>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ RYB teaching wheel (L06)
export function Wheel({ lang }: { lang: 'zh' | 'en' }) {
  return (
    <figure className="flex flex-wrap items-center gap-3" data-testid="wheel">
      <svg viewBox="-50 -50 100 100" className="h-32 w-32" role="img" aria-label={`${X.wheel[lang]}：${WHEEL.map((w) => colorOf(w).name[lang]).join('、')}`}>
        {WHEEL.map((id, k) => {
          const a0 = ((k - 0.5) / 6) * Math.PI * 2 - Math.PI / 2,
            a1 = ((k + 0.5) / 6) * Math.PI * 2 - Math.PI / 2;
          const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
          const am = (a0 + a1) / 2;
          return (
            <g key={id}>
              <path d={`M${p(a0, 46)} A46 46 0 0 1 ${p(a1, 46)} L${p(a1, 20)} A20 20 0 0 0 ${p(a0, 20)}Z`} fill={colorOf(id).hex} stroke="#fff" strokeWidth="1.5" />
              <g transform={`translate(${p(am, 33).replace(' ', ',')}) scale(0.9) translate(-8,-8)`} style={{ color: markColour(id) }}>
                <MarkIcon mark={colorOf(id).mark} className="" />
              </g>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-[var(--muted)]">{WHEEL.map((w) => colorOf(w).name[lang]).join(' → ')}</figcaption>
    </figure>
  );
}
