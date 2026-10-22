// Math Island M0 placeholder art: original flat shapes drawn in code (no emoji, no gradients, no shadows).
// Listed as unfinished assets in docs/ACCEPTANCE.md §25 until the reviewed illustrations replace them (MA09).

/** One countable apple: a single clear silhouette so every apple is easy to tell apart and count. */
export function AppleArt() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <path d="M32 18c-4-4-12-5-17 0-6 6-5 18 0 26 4 7 10 11 17 8 7 3 13-1 17-8 5-8 6-20 0-26-5-5-13-4-17 0z" fill="var(--mi-apple)" stroke="var(--mi-apple-line)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 18c0-5 1-8 4-11" fill="none" stroke="var(--mi-apple-line)" strokeWidth="3" strokeLinecap="round" />
      <path d="M36 11c4-4 10-4 13-2-3 4-8 6-13 2z" fill="var(--mi-leaf)" stroke="var(--mi-apple-line)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** The island (same colours in both themes, like a printed map): sea, one sandy island, the apple tree and the factory where the two playable games are. */
export function IslandArt() {
  return (
    <svg viewBox="0 0 320 160" className="block h-auto w-full" aria-hidden="true" focusable="false">
      <rect width="320" height="160" fill="#3A7BD5" />
      <path d="M40 112c10-34 60-56 120-56s110 22 120 56c-20 22-70 32-120 32S60 134 40 112z" fill="#FFF4E3" stroke="#23303F" strokeWidth="3" />
      <rect x="96" y="70" width="10" height="30" fill="#7A5A2E" />
      <circle cx="101" cy="62" r="22" fill="#3D7A3F" stroke="#23303F" strokeWidth="3" />
      <circle cx="93" cy="58" r="5" fill="#C8402F" />
      <circle cx="108" cy="66" r="5" fill="#C8402F" />
      <path d="M118 100h30l-4 16h-22z" fill="#E9C893" stroke="#23303F" strokeWidth="3" strokeLinejoin="round" />
      <path d="M196 74h44v38h-44z" fill="#E9C893" stroke="#23303F" strokeWidth="3" strokeLinejoin="round" />
      <path d="M204 74V62h10v12" fill="none" stroke="#23303F" strokeWidth="3" />
      <path d="M204 96h28" stroke="#23303F" strokeWidth="3" />
    </svg>
  );
}

/** One countable cookie for the packing factory: a round biscuit with three chocolate chips. */
export function CookieArt() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="24" fill="var(--mi-cookie)" stroke="var(--mi-apple-line)" strokeWidth="2.5" />
      <circle cx="24" cy="26" r="3.5" fill="var(--mi-chip)" />
      <circle cx="38" cy="24" r="3.5" fill="var(--mi-chip)" />
      <circle cx="31" cy="39" r="3.5" fill="var(--mi-chip)" />
    </svg>
  );
}

/** One rider for the make-ten train: a round head and a body, one clear silhouette per person. */
export function RiderArt({ fixed = false, size = 44 }: { fixed?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="24" cy="15" r="9" fill={fixed ? 'var(--mi-rider-old)' : 'var(--mi-rider)'} stroke="var(--mi-apple-line)" strokeWidth="2.5" />
      <path d="M9 44c0-11 7-18 15-18s15 7 15 18z" fill={fixed ? 'var(--mi-rider-old)' : 'var(--mi-rider)'} stroke="var(--mi-apple-line)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** New Taiwan dollar coins, simplified: size in proportion to the real coins, the value printed large. */
const COIN_LOOK: Record<number, { d: number; fill: string }> = {
  1: { d: 56, fill: '#C98A4B' }, // 20 mm, bronze
  5: { d: 62, fill: '#C9CED3' }, // 22 mm, cupronickel
  10: { d: 70, fill: '#C9CED3' }, // 26 mm, cupronickel
  50: { d: 76, fill: '#E2B93B' }, // 28 mm, brass
};
export const coinSize = (v: number) => COIN_LOOK[v]?.d ?? 56;
export function CoinArt({ value }: { value: number }) {
  const c = COIN_LOOK[value] ?? COIN_LOOK[1];
  return (
    <svg viewBox="0 0 64 64" width={c.d} height={c.d} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" fill={c.fill} stroke="#23303F" strokeWidth="3" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#23303F" strokeWidth="1.5" opacity="0.55" />
      <text x="32" y="38" textAnchor="middle" fontSize={value >= 10 ? 20 : 24} fontWeight="800" fill="#23303F">
        {value}
      </text>
      <text x="32" y="52" textAnchor="middle" fontSize="9" fontWeight="700" fill="#23303F">
        元
      </text>
    </svg>
  );
}

/** One block for the balance scale: a plain cube face. */
export function BlockArt({ size = 40, fixed = false }: { size?: number; fixed?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="34" height="34" rx="4" fill={fixed ? 'var(--mi-block-old)' : 'var(--mi-block)'} stroke="var(--mi-apple-line)" strokeWidth="2.5" />
    </svg>
  );
}
