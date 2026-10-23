// Color Doodle V2 — drawn pieces of the workbench: paint dabs, the hand-held palette and the tool icons.
// Vector shapes with a clear ink outline; colour comes only from the paints themselves (no gradients/shadows).
import type { ReactNode } from 'react';

/** A dab of paint: a slightly irregular round blob (each colour gets one of three outlines so they read as paint). */
const DABS = [
  'M24 4c7 0 13 3 16 8s4 11 2 17-6 11-12 13-13 2-18-2-8-10-7-16 3-12 8-16 6-4 11-4z',
  'M25 4c6 1 12 4 15 10 3 5 3 12 0 17-3 6-9 10-16 11-6 0-12-3-16-8S3 22 5 16s7-10 12-11c3-1 5-1 8-1z',
  'M23 5c6-1 13 1 17 6s5 12 3 18-7 11-13 13-12 1-17-3-7-9-7-15 2-11 6-15 7-4 11-4z',
];
export function Dab({ hex, k = 0, size = 48, selected = false }: { hex: string; k?: number; size?: number; selected?: boolean }) {
  const white = hex.toUpperCase() === '#FFFFFF';
  const dark = lum(hex) < 0.06; // black / dark blue need a light rim to show on a dark page
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false" className="block">
      {selected && <path d={DABS[k % 3]} fill="none" stroke="var(--text)" strokeWidth="7" strokeLinejoin="round" />}
      <path d={DABS[k % 3]} fill={hex} stroke={white ? '#5f6368' : dark ? '#9aa0a6' : 'rgba(31,35,40,0.55)'} strokeWidth={white || dark ? 2.4 : 1.6} strokeLinejoin="round" />
      {selected && <path d="M15 25l6 6 12-13" fill="none" stroke={inkFor(hex)} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
function lum(hex: string) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const inkFor = (hex: string) => (lum(hex) > 0.3 ? '#1f2328' : '#ffffff');

/** The palette board outline (a wooden artist's palette with a thumb hole), viewBox 0 0 320 200. */
export const BOARD_PATH =
  'M36 58C52 24 104 10 168 12c70 2 124 30 136 76 10 40-14 82-70 100-44 14-98 12-138-4C58 172 34 150 30 124c-2-14 6-22 20-24 14-2 24-8 24-20 0-12-12-14-26-12-12 2-16-2-12-10z';
export const THUMB = { cx: 70, cy: 78, rx: 12, ry: 16 };
export function BoardShape() {
  return (
    <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path d={BOARD_PATH} fill="var(--dw-board)" stroke="var(--dw-board-line)" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx={THUMB.cx} cy={THUMB.cy} rx={THUMB.rx} ry={THUMB.ry} fill="var(--bg)" stroke="var(--dw-board-line)" strokeWidth="3" />
      <path d="M58 150c40 18 92 22 136 10" fill="none" stroke="var(--dw-board-line)" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** Tool icons drawn in one style: 24×24, 2px round strokes. */
const TOOL: Record<string, ReactNode> = {
  brush: (
    <>
      <path d="M14.5 4.5l5 5-8.5 8.5-5-5z" />
      <path d="M6 13l-1.6 1.6c-1.3 1.3-1.3 3.4 0 4.7.4.4-1.4 1.2-2.4 1.2 3 .6 5.6-.4 7-1.8L11 17" />
    </>
  ),
  fill: (
    <>
      <path d="M5 11l7-7 7 7-7 7z" />
      <path d="M5 11h14" />
      <path d="M20 15c1 1.6 1.5 2.6 1.5 3.3a1.5 1.5 0 0 1-3 0c0-.7.5-1.7 1.5-3.3z" />
    </>
  ),
  stamp: (
    <>
      <path d="M9 4h6v4l-1 3h4a2 2 0 0 1 2 2v3H4v-3a2 2 0 0 1 2-2h4L9 8z" />
      <path d="M5 20h14" />
    </>
  ),
  eraser: (
    <>
      <path d="M4 15l8-8a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L14 19H8z" />
      <path d="M9 10l6 6M8 19h12" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  save: (
    <>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  paper: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
    </>
  ),
  move: <path d="M8 5l11 7-11 7z" />,
  mix: (
    <>
      <path d="M5 12a7 7 0 0 0 14 0" />
      <path d="M9 9l6-6M3 12h18" />
    </>
  ),
};
export function ToolIcon({ name, className = 'h-6 w-6' }: { name: keyof typeof TOOL | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {TOOL[name]}
    </svg>
  );
}
