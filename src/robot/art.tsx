// PROVISIONAL original SVG art for Robot Delivery Lab (engineering placeholders until the product-side art arrives).
import type { ReactElement } from 'react';
import type { Block, Color } from '../../shared/robot/engine';

export const COLOR_FILL: Record<Color, string> = { blue: '#3b82c4', red: '#d9534f', yellow: '#e8b923' };

export function RobotArt({ carrying }: { carrying: Color | null }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <ellipse cx="50" cy="92" rx="30" ry="6" fill="#0003" />
      {/* body (front = up) */}
      <rect x="22" y="34" width="56" height="50" rx="14" fill="#2f9e8f" stroke="#1d6e63" strokeWidth="3" />
      <rect x="32" y="44" width="36" height="22" rx="8" fill="#e8fffa" />
      <circle cx="42" cy="55" r="5" fill="#1d3b37" />
      <circle cx="58" cy="55" r="5" fill="#1d3b37" />
      <path d="M43 62q7 5 14 0" stroke="#1d3b37" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="47" y="18" width="6" height="16" rx="3" fill="#1d6e63" />
      <circle cx="50" cy="15" r="7" fill="#f6c453" stroke="#c79a2e" strokeWidth="2" />
      <rect x="14" y="52" width="10" height="20" rx="5" fill="#1d6e63" />
      <rect x="76" y="52" width="10" height="20" rx="5" fill="#1d6e63" />
      {carrying && (
        <g transform="translate(30 66)">
          <rect width="40" height="22" rx="4" fill={COLOR_FILL[carrying]} stroke="#0004" strokeWidth="2" />
          <rect x="17" width="6" height="22" fill="#fff8" />
        </g>
      )}
    </svg>
  );
}

export function ParcelArt({ color }: { color: Color }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <ellipse cx="50" cy="84" rx="28" ry="5" fill="#0002" />
      <rect x="24" y="36" width="52" height="44" rx="6" fill={COLOR_FILL[color]} stroke="#0004" strokeWidth="3" />
      <rect x="46" y="36" width="8" height="44" fill="#fff9" />
      <path d="M36 30q14 10 14 6q0 4 14-6" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function DoorArt({ color }: { color: Color }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <path d="M22 90V40a28 28 0 0 1 56 0v50z" fill={COLOR_FILL[color]} stroke="#0004" strokeWidth="3" />
      <path d="M32 90V44a18 18 0 0 1 36 0v46z" fill="#fff6e3" />
      <circle cx="60" cy="66" r="4" fill={COLOR_FILL[color]} />
      <path d="M18 92h64" stroke="#0004" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function WallArt() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <rect x="6" y="10" width="88" height="80" rx="10" fill="#9a7b5c" />
      <path d="M6 37h88M6 63h88M36 10v27M66 37v26M30 63v27M70 63v27" stroke="#7a5c40" strokeWidth="4" />
    </svg>
  );
}

const ICON_PATHS: Record<Block, ReactElement> = {
  forward: <path d="M50 18 78 50H60v32H40V50H22z" fill="currentColor" />,
  left: <path d="M58 82V52q0-12-12-12H38v14L14 32 38 10v14h8q28 0 28 28v30z" fill="currentColor" />,
  right: <path d="M42 82V52q0-12 12-12h8v14l24-22-24-22v14h-8q-28 0-28 28v30z" fill="currentColor" />,
  pick: (
    <g fill="currentColor">
      <rect x="30" y="52" width="40" height="30" rx="5" />
      <path d="M50 10 70 32H58v14H42V32H30z" />
    </g>
  ),
  drop: (
    <g fill="currentColor">
      <rect x="30" y="10" width="40" height="28" rx="5" />
      <path d="M50 88 70 66H58V46H42v20H30z" />
    </g>
  ),
};
export function BlockIcon({ b }: { b: Block }) {
  return (
    <svg viewBox="0 0 100 100" className="h-8 w-8" aria-hidden="true">
      {ICON_PATHS[b]}
    </svg>
  );
}
