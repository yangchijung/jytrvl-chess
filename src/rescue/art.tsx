// PROVISIONAL original SVG art for Planet Rescue Crew (engineering placeholders until the product-side art arrives).
import type { ReactElement } from 'react';
import type { Item, Role, RouteKind } from '../../shared/rescue/engine';

const svg = (children: ReactElement | ReactElement[], cls = 'h-full w-full') => (
  <svg viewBox="0 0 100 100" className={cls} aria-hidden="true">
    {children}
  </svg>
);

export function ItemIcon({ i }: { i: Item }) {
  switch (i) {
    case 'battery':
      return svg([<rect key="a" x="26" y="22" width="48" height="66" rx="10" fill="#3f9a5b" stroke="#24633a" strokeWidth="5" />, <rect key="b" x="40" y="10" width="20" height="12" rx="3" fill="#24633a" />, <path key="c" d="M54 32 38 58h12l-4 20 16-28H50z" fill="#fff" />]);
    case 'panel':
      return svg([<rect key="a" x="12" y="20" width="76" height="50" rx="6" fill="#2f5fa8" stroke="#1d3d70" strokeWidth="5" />, <path key="b" d="M12 45h76M37 20v50M63 20v50" stroke="#8fb7ff" strokeWidth="3" />, <path key="c" d="M50 70v16M34 88h32" stroke="#555" strokeWidth="6" strokeLinecap="round" />]);
    case 'cable':
      return svg([<path key="a" d="M18 70q0-30 30-30t30-20" stroke="#e8833a" strokeWidth="9" fill="none" strokeLinecap="round" />, <rect key="b" x="70" y="10" width="20" height="18" rx="4" fill="#555" />, <rect key="c" x="8" y="66" width="20" height="18" rx="4" fill="#555" />]);
    case 'plank':
      return svg([<rect key="a" x="10" y="36" width="80" height="28" rx="5" fill="#c08a4e" stroke="#7a5229" strokeWidth="5" />, <path key="b" d="M20 50h20M52 44h28M30 58h30" stroke="#8f6232" strokeWidth="3" strokeLinecap="round" />]);
    case 'water':
      return svg([<path key="a" d="M50 10q30 36 30 54a30 30 0 0 1-60 0q0-18 30-54z" fill="#4aa8e8" stroke="#1f6fa8" strokeWidth="5" />, <ellipse key="b" cx="38" cy="62" rx="6" ry="10" fill="#fff8" />]);
  }
}

export function RoleArt({ r }: { r: Role }) {
  const fill = { navigator: '#3b82c4', engineer: '#e8833a', supplier: '#3f9a5b' }[r];
  return svg([
    <circle key="bg" cx="50" cy="50" r="46" fill={fill} opacity=".18" />,
    <path key="body" d="M24 92q0-30 26-30t26 30z" fill={fill} />,
    <circle key="face" cx="50" cy="40" r="18" fill="#ffe0bd" stroke="#c99a6b" strokeWidth="2" />,
    <circle key="e1" cx="44" cy="40" r="2.6" fill="#3a2a1a" />,
    <circle key="e2" cx="56" cy="40" r="2.6" fill="#3a2a1a" />,
    <path key="m" d="M45 47q5 4 10 0" stroke="#3a2a1a" strokeWidth="2.4" fill="none" strokeLinecap="round" />,
    <path key="helmet" d="M30 36q2-20 20-20t20 20z" fill="#fff" stroke={fill} strokeWidth="3" />,
    r === 'navigator' ? (
      <g key="tool">
        <circle cx="76" cy="74" r="14" fill="#fff" stroke="#1d3d70" strokeWidth="3" />
        <path d="M76 63l4 11-4 11-4-11z" fill="#d9534f" />
      </g>
    ) : r === 'engineer' ? (
      <path key="tool" d="M66 84l16-16m-4-8a8 8 0 1 0 8 8l-4 0-4-4z" stroke="#555" strokeWidth="5" fill="none" strokeLinecap="round" />
    ) : (
      <g key="tool">
        <rect x="62" y="64" width="26" height="22" rx="3" fill="#c08a4e" stroke="#7a5229" strokeWidth="3" />
        <path d="M62 72h26M75 64v8" stroke="#7a5229" strokeWidth="3" />
      </g>
    ),
  ]);
}

export function RouteKindIcon({ k }: { k: RouteKind }) {
  switch (k) {
    case 'open':
      return svg([<circle key="a" cx="50" cy="50" r="40" fill="#3f9a5b" />, <path key="b" d="M30 52l14 14 28-30" stroke="#fff" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />]);
    case 'long':
      return svg([<circle key="a" cx="50" cy="50" r="40" fill="#f6c453" />, <path key="b" d="M20 70q10-40 20 0t20 0 20-40" stroke="#7a5229" strokeWidth="7" fill="none" strokeLinecap="round" />]);
    case 'shortcut':
      return svg([<circle key="a" cx="50" cy="50" r="40" fill="#e9d6b0" />, <path key="b" d="M38 14v72M62 14v72" stroke="#7a5229" strokeWidth="6" />, <rect key="c" x="38" y="38" width="24" height="24" rx="4" fill="#3f9a5b" />, <path key="d" d="M20 20l60 60" stroke="#d9534f" strokeWidth="8" strokeLinecap="round" />]);
    case 'bridge':
      return svg([<circle key="a" cx="50" cy="50" r="40" fill="#bfe0f7" />, <path key="b" d="M10 56h28M62 56h28" stroke="#7a5229" strokeWidth="10" />, <path key="c" d="M40 66l6-10M54 56l6 10" stroke="#7a5229" strokeWidth="5" strokeDasharray="4 4" />]);
    case 'rocks':
      return svg([<circle key="a" cx="50" cy="50" r="40" fill="#d9d4c7" />, <path key="b" d="M18 76l14-26 14 10 10-22 26 38z" fill="#8a7a66" stroke="#5a4d3e" strokeWidth="4" />]);
  }
}

export function RoverArt({ cargo = 0 }: { cargo?: number }) {
  return svg([
    <ellipse key="sh" cx="50" cy="86" rx="38" ry="6" fill="#0003" />,
    <rect key="body" x="16" y="42" width="68" height="28" rx="8" fill="#f2f2f2" stroke="#4d5b6a" strokeWidth="4" />,
    <rect key="win" x="58" y="48" width="18" height="12" rx="3" fill="#8fd3ff" />,
    <path key="ant" d="M28 42V28" stroke="#4d5b6a" strokeWidth="3" />,
    <circle key="antb" cx="28" cy="26" r="4" fill="#e2483d" />,
    ...(cargo ? [<rect key="box" x="24" y="30" width="26" height="14" rx="3" fill="#c08a4e" stroke="#7a5229" strokeWidth="3" />] : []),
    <circle key="w1" cx="28" cy="74" r="10" fill="#4d5b6a" />,
    <circle key="w2" cx="72" cy="74" r="10" fill="#4d5b6a" />,
    <circle key="w3" cx="28" cy="74" r="4" fill="#ccc" />,
    <circle key="w4" cx="72" cy="74" r="4" fill="#ccc" />,
  ]);
}

export function BaseArt({ lit }: { lit: boolean }) {
  return svg([
    ...(lit ? [<circle key="glow" cx="50" cy="56" r="46" fill="#ffe27a" opacity=".55" />] : []),
    <path key="dome" d="M12 80a38 38 0 0 1 76 0z" fill={lit ? '#e6fbff' : '#b9c4cc'} stroke="#4d5b6a" strokeWidth="4" />,
    <rect key="door" x="42" y="62" width="16" height="18" rx="3" fill={lit ? '#ffd34d' : '#6b7884'} />,
    <circle key="l1" cx="30" cy="62" r="4" fill={lit ? '#ffd34d' : '#6b7884'} />,
    <circle key="l2" cx="70" cy="62" r="4" fill={lit ? '#ffd34d' : '#6b7884'} />,
    <path key="mast" d="M50 42V20" stroke="#4d5b6a" strokeWidth="4" />,
    <circle key="mb" cx="50" cy="18" r="5" fill={lit ? '#3f9a5b' : '#999'} />,
    <rect key="ground" x="4" y="80" width="92" height="6" rx="3" fill="#9bb07a" />,
  ]);
}

export function DepotArt() {
  return svg([
    <rect key="b" x="14" y="38" width="72" height="44" rx="4" fill="#d9c3a0" stroke="#7a5229" strokeWidth="4" />,
    <path key="r" d="M8 40 50 14l42 26z" fill="#b5523b" stroke="#7a2f1f" strokeWidth="4" strokeLinejoin="round" />,
    <rect key="d" x="38" y="56" width="24" height="26" fill="#7a5229" />,
    <rect key="g" x="4" y="82" width="92" height="6" rx="3" fill="#9bb07a" />,
  ]);
}
