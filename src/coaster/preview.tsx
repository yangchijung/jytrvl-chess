// Static home-card preview for Sketch Coaster: a hand-drawn track with one loop, two stations and the train.
// Flat colours only (DESIGN.md): no gradients or shadows. The game itself lives at /coaster/ as one page.
export function CoasterPreview() {
  const rail = 'M8 74 H44 C58 74 62 62 70 52 C78 42 90 34 92 22 C94 10 80 6 74 16 C68 26 80 40 96 40 C116 40 122 20 140 20 C158 20 160 60 176 66 H194';
  return (
    <svg viewBox="0 0 200 100" className="block aspect-[2/1] w-full rounded-xl" aria-hidden="true">
      <rect width="200" height="100" fill="#cfe8f6" />
      <path d="M0 86 C40 80 70 84 100 82 C140 79 170 84 200 81 V100 H0Z" fill="#a8d39a" />
      <rect y="88" width="200" height="12" fill="#7dbb5f" />
      {[52, 60, 104, 112, 120, 150, 158, 166].map((x) => (
        <line key={x} x1={x} x2={x} y1={x < 100 ? 60 : x < 140 ? 36 : 40} y2="88" stroke="#c4c9d2" strokeWidth="1.2" />
      ))}
      <path d={rail} fill="none" stroke="#b02c25" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 2.2)" />
      <path d={rail} fill="none" stroke="#e2493e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="64" width="34" height="2" fill="#2f6db5" />
      <rect x="160" y="56" width="34" height="2" fill="#2f6db5" />
      {[
        ['#43b05c', 14],
        ['#3d82dd', 23],
        ['#f4c430', 32],
      ].map(([c, x]) => (
        <g key={x as number}>
          <rect x={x as number} y="69" width="8" height="4" rx="1" fill={c as string} />
          <circle cx={(x as number) + 4} cy="67" r="1.6" fill="#f2c9a0" />
        </g>
      ))}
    </svg>
  );
}
