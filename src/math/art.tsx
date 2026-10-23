// Math Island M0 placeholder art: original flat shapes drawn in code (no emoji, no gradients, no shadows).
import type { ReactNode } from 'react';
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

/** One flower for the multiplication garden: five round petals and a centre, one clear unit to count. */
export function FlowerArt({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={16 + Math.sin((a * Math.PI) / 180) * 7} cy={16 - Math.cos((a * Math.PI) / 180) * 7} r="5.5" fill="var(--mi-petal)" stroke="var(--mi-apple-line)" strokeWidth="1.5" />
      ))}
      <circle cx="16" cy="16" r="4.5" fill="#E2B93B" stroke="var(--mi-apple-line)" strokeWidth="1.5" />
    </svg>
  );
}

/** The frog on the number line: a simple round body with two eyes. */
export function FrogArt({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 32" width={size} height={(size * 32) / 40} aria-hidden="true" focusable="false">
      <ellipse cx="20" cy="20" rx="15" ry="10" fill="var(--mi-leaf)" stroke="var(--mi-apple-line)" strokeWidth="2" />
      <circle cx="13" cy="9" r="5" fill="var(--mi-leaf)" stroke="var(--mi-apple-line)" strokeWidth="2" />
      <circle cx="27" cy="9" r="5" fill="var(--mi-leaf)" stroke="var(--mi-apple-line)" strokeWidth="2" />
      <circle cx="13" cy="9" r="2" fill="var(--mi-apple-line)" />
      <circle cx="27" cy="9" r="2" fill="var(--mi-apple-line)" />
    </svg>
  );
}

/** 上午 / 下午 marker for the clock: a sun or a setting sun over a line, drawn as plain shapes. */
export function DayPartArt({ pm, size = 36 }: { pm: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden="true" focusable="false">
      {pm ? (
        <>
          <path d="M6 24a12 12 0 0 1 24 0z" fill="#E9853B" stroke="var(--mi-apple-line)" strokeWidth="2" />
          <path d="M3 26h30" stroke="var(--mi-apple-line)" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="18" cy="18" r="7" fill="#E2B93B" stroke="var(--mi-apple-line)" strokeWidth="2" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path key={a} d={`M${18 + Math.sin((a * Math.PI) / 180) * 11} ${18 - Math.cos((a * Math.PI) / 180) * 11}L${18 + Math.sin((a * Math.PI) / 180) * 15} ${18 - Math.cos((a * Math.PI) / 180) * 15}`} stroke="var(--mi-apple-line)" strokeWidth="2.5" strokeLinecap="round" />
          ))}
        </>
      )}
    </svg>
  );
}

/** Island-map pictures for the eight games (original flat drawings, same palette in both themes like a printed map). */
export type GameId = 'apple' | 'train' | 'shop' | 'balance' | 'clock' | 'garden' | 'factory' | 'frog';
const INK = '#23303F';
export function GameArt({ game, size = 140 }: { game: GameId; size?: number }) {
  const s = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const body: Record<GameId, ReactNode> = {
    apple: (
      <>
        <rect x="52" y="56" width="16" height="36" fill="#7A5A2E" {...s} />
        <circle cx="60" cy="40" r="32" fill="#3D7A3F" {...s} />
        {[
          [44, 30],
          [70, 26],
          [58, 48],
          [78, 46],
          [40, 50],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill="#C8402F" stroke={INK} strokeWidth="2" />
        ))}
        <path d="M84 72h28l-4 20H88z" fill="#E9C893" {...s} />
      </>
    ),
    train: (
      <>
        <rect x="10" y="36" width="44" height="38" rx="6" fill="#3A7BD5" {...s} />
        <rect x="58" y="36" width="44" height="38" rx="6" fill="#E9853B" {...s} />
        {[18, 34, 66, 82].map((x) => (
          <rect key={x} x={x} y="44" width="12" height="12" rx="2" fill="#FFF4E3" stroke={INK} strokeWidth="2" />
        ))}
        {[22, 44, 70, 92].map((x) => (
          <circle key={x} cx={x} cy="80" r="7" fill={INK} />
        ))}
        <path d="M54 58h4" {...s} />
        <path d="M4 90h112" {...s} />
      </>
    ),
    shop: (
      <>
        <rect x="18" y="40" width="84" height="50" fill="#FFF4E3" {...s} />
        <path d="M12 40l10-22h76l10 22z" fill="#C8402F" {...s} />
        <path d="M34 18l-6 22M52 18l-2 22M68 18l2 22M86 18l6 22" stroke="#FFF4E3" strokeWidth="5" />
        <rect x="30" y="56" width="26" height="34" fill="#3A7BD5" {...s} />
        <circle cx="80" cy="66" r="10" fill="#E2B93B" {...s} />
        <circle cx="80" cy="66" r="5" fill="none" stroke={INK} strokeWidth="2" />
      </>
    ),
    balance: (
      <>
        <path d="M60 22v62M40 90h40" {...s} strokeWidth="5" />
        <path d="M20 34h80" {...s} strokeWidth="5" />
        <path d="M20 34l-12 26h24zM100 34l-12 26h24z" fill="none" {...s} />
        <path d="M6 60h28q-2 12-14 12T6 60zM86 60h28q-2 12-14 12T86 60z" fill="#E9C893" {...s} />
        <rect x="12" y="48" width="10" height="10" fill="#3D7A3F" stroke={INK} strokeWidth="2" />
        <rect x="92" y="48" width="10" height="10" fill="#3D7A3F" stroke={INK} strokeWidth="2" />
        <circle cx="60" cy="22" r="6" fill="#FFF4E3" {...s} />
      </>
    ),
    clock: (
      <>
        <circle cx="60" cy="52" r="38" fill="#FFF4E3" {...s} strokeWidth="5" />
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k * 30 * Math.PI) / 180;
          return <path key={k} d={`M${60 + Math.sin(a) * 30} ${52 - Math.cos(a) * 30}L${60 + Math.sin(a) * 35} ${52 - Math.cos(a) * 35}`} stroke={INK} strokeWidth="3" />;
        })}
        <path d="M60 52V28M60 52l14 8" {...s} strokeWidth="5" />
        <circle cx="60" cy="52" r="4" fill={INK} />
      </>
    ),
    garden: (
      <>
        <rect x="12" y="30" width="96" height="62" rx="6" fill="#C9A46C" {...s} />
        {[0, 1, 2].flatMap((r) =>
          [0, 1, 2, 3].map((c) => (
            <g key={`${r}${c}`}>
              <circle cx={28 + c * 22} cy={44 + r * 18} r="7" fill="#E8889A" stroke={INK} strokeWidth="2" />
              <circle cx={28 + c * 22} cy={44 + r * 18} r="2.5" fill="#E2B93B" />
            </g>
          )),
        )}
      </>
    ),
    factory: (
      <>
        <path d="M12 90V46l26 14V46l26 14V46l26 14V28h16v62z" fill="#E9C893" {...s} />
        <rect x="24" y="72" width="16" height="18" fill="#3A7BD5" {...s} />
        <rect x="56" y="70" width="34" height="12" fill="#F3E3C4" {...s} />
        {[62, 72, 82].map((x) => (
          <circle key={x} cx={x} cy="76" r="4" fill="#D9A35B" stroke={INK} strokeWidth="1.5" />
        ))}
      </>
    ),
    frog: (
      <>
        <path d="M6 86h108" {...s} />
        {[18, 46, 74, 102].map((x) => (
          <path key={x} d={`M${x} 80v12`} {...s} />
        ))}
        <path d="M30 72q30-50 60 0" fill="none" stroke="#3A7BD5" strokeWidth="4" strokeDasharray="6 6" />
        <ellipse cx="60" cy="40" rx="22" ry="15" fill="#3D7A3F" {...s} />
        <circle cx="49" cy="26" r="7" fill="#3D7A3F" {...s} />
        <circle cx="71" cy="26" r="7" fill="#3D7A3F" {...s} />
        <circle cx="49" cy="26" r="2.5" fill={INK} />
        <circle cx="71" cy="26" r="2.5" fill={INK} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 120 100" width={size} height={(size * 100) / 120} aria-hidden="true" focusable="false">
      {body[game]}
    </svg>
  );
}
