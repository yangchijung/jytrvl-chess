// PROVISIONAL original SVG art for Try Again Trail (engineering placeholders until the product-side art arrives).
import type { Badge, Kind } from '../../shared/trail/engine';

export const PLAYER_COLOR = ['#e8833a', '#7b5fc9'] as const;
export const PLAYER_DARK = ['#a85413', '#4d3592'] as const;

export function ExplorerArt({ p }: { p: 0 | 1 }) {
  const c = PLAYER_COLOR[p],
    d = PLAYER_DARK[p];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <ellipse cx="50" cy="93" rx="26" ry="5" fill="#0003" />
      {/* backpack */}
      <rect x={p ? 60 : 22} y="48" width="18" height="26" rx="6" fill={d} />
      {/* body */}
      <path d="M30 90q0-36 20-36t20 36z" fill={c} stroke={d} strokeWidth="3" />
      {/* face */}
      <circle cx="50" cy="42" r="20" fill="#ffe0bd" stroke="#c99a6b" strokeWidth="2" />
      <circle cx="43" cy="44" r="3" fill="#3a2a1a" />
      <circle cx="57" cy="44" r="3" fill="#3a2a1a" />
      <path d="M44 51q6 5 12 0" stroke="#3a2a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="38" cy="50" r="3" fill="#f5a3a3" opacity=".7" />
      <circle cx="62" cy="50" r="3" fill="#f5a3a3" opacity=".7" />
      {/* hat */}
      <ellipse cx="50" cy="28" rx="30" ry="7" fill={d} />
      <path d="M34 28q2-18 16-18t16 18z" fill={c} stroke={d} strokeWidth="2" />
      <rect x="35" y="22" width="30" height="5" fill="#fff6" />
    </svg>
  );
}

const BADGE_FILL: Record<Badge, string> = { forest: '#3f9a5b', mountain: '#8a6d4f', lake: '#3b82c4' };
export function BadgeIcon({ b, dim = false }: { b: Badge; dim?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" opacity={dim ? 0.28 : 1}>
      <circle cx="50" cy="50" r="44" fill="#fff4d6" stroke="#d9a63a" strokeWidth="8" />
      <circle cx="50" cy="50" r="32" fill={BADGE_FILL[b]} />
      {b === 'forest' && <path d="M50 22 66 46H58l10 16H32l10-16h-8zM46 62h8v12h-8z" fill="#e9ffe9" />}
      {b === 'mountain' && <path d="M22 70 42 36l10 14 8-10 18 30zM42 36l6 10-6-2-4 4z" fill="#fff4e6" />}
      {b === 'lake' && <path d="M24 46q7-8 13 0t13 0 13 0 13 0M24 60q7-8 13 0t13 0 13 0 13 0" stroke="#e6f4ff" strokeWidth="6" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

export function AppleIcon({ used = false }: { used?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" opacity={used ? 0.35 : 1}>
      <path d="M50 30q-8-10-20-6-14 6-10 28 4 22 18 28 6 2 12-2 6 4 12 2 14-6 18-28 4-22-10-28-12-4-20 6z" fill="#e2483d" stroke="#a3271f" strokeWidth="3" />
      <path d="M50 30q2-12 12-16" stroke="#6b4423" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M56 20q12-6 18 2-10 6-18-2z" fill="#4caf50" />
      <ellipse cx="36" cy="44" rx="5" ry="8" fill="#fff6" />
    </svg>
  );
}

export function MudIcon() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <ellipse cx="50" cy="56" rx="40" ry="24" fill="#7a5233" />
      <ellipse cx="44" cy="52" rx="24" ry="12" fill="#946642" />
      <circle cx="66" cy="46" r="5" fill="#a87a52" />
      <circle cx="30" cy="64" r="4" fill="#a87a52" />
    </svg>
  );
}

export function CampIcon() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <path d="M12 84 50 22l38 62z" fill="#2f8f5b" stroke="#1d5e3b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M40 84 50 60l10 24z" fill="#fff3d1" />
      <path d="M50 22V6" stroke="#5b3b20" strokeWidth="4" />
      <path d="M50 6h22l-6 6 6 6H50z" fill="#f2c94c" />
    </svg>
  );
}

export function StartIcon() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="#fff" stroke="#3e4636" strokeWidth="6" />
      <path d="M38 30v40M38 32h28l-8 9 8 9H38" fill="#e2483d" stroke="#3e4636" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function EnergyIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill={off ? '#d9d4c7' : '#f6c453'} stroke={off ? '#b5ae9d' : '#c8952a'} strokeWidth="6" />
      <path d="M56 14 28 56h20l-6 30 30-44H52z" fill={off ? '#f1ede3' : '#fff'} />
    </svg>
  );
}

export function NodeIcon({ kind, badge, appleUsed }: { kind: Kind; badge?: Badge; appleUsed?: boolean }) {
  if (kind === 'badge' && badge) return <BadgeIcon b={badge} />;
  if (kind === 'apple') return <AppleIcon used={appleUsed} />;
  if (kind === 'mud') return <MudIcon />;
  if (kind === 'camp') return <CampIcon />;
  if (kind === 'start') return <StartIcon />;
  return null;
}
