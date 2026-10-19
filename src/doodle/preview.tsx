// Static home-card preview for Color Doodle: paper with three strokes and the mixing colours (no animation).
export function DoodlePreview() {
  return (
    <svg viewBox="0 0 200 100" className="block aspect-[2/1] w-full rounded-xl bg-white" aria-hidden="true">
      <rect x="0.5" y="0.5" width="199" height="99" fill="#fff" stroke="#d8d9d1" />
      <path d="M18 70c18-30 34-34 50-10s32 20 46-8" fill="none" stroke="#D64034" strokeWidth="7" strokeLinecap="round" />
      <path d="M30 34c22 8 40 2 58-12" fill="none" stroke="#F5C43C" strokeWidth="7" strokeLinecap="round" />
      <path d="M96 82c14-18 30-22 44-14" fill="none" stroke="#2864B4" strokeWidth="7" strokeLinecap="round" />
      <circle cx="160" cy="26" r="11" fill="#E8792D" />
      <circle cx="182" cy="50" r="11" fill="#5B8F45" />
      <circle cx="160" cy="74" r="11" fill="#8053A0" />
    </svg>
  );
}
