// Piece artwork.
// Chess: Colin M.L. Burnett "cburnett" set (GPLv2+), bundled in src/assets/pieces.
// Xiangqi / Banqi: drawn here as lacquered wooden discs with Traditional Chinese characters.
import wK from '../../assets/pieces/wK.svg';
import wQ from '../../assets/pieces/wQ.svg';
import wR from '../../assets/pieces/wR.svg';
import wB from '../../assets/pieces/wB.svg';
import wN from '../../assets/pieces/wN.svg';
import wP from '../../assets/pieces/wP.svg';
import bK from '../../assets/pieces/bK.svg';
import bQ from '../../assets/pieces/bQ.svg';
import bR from '../../assets/pieces/bR.svg';
import bB from '../../assets/pieces/bB.svg';
import bN from '../../assets/pieces/bN.svg';
import bP from '../../assets/pieces/bP.svg';

const CHESS: Record<string, string> = { wK, wQ, wR, wB, wN, wP, bK, bQ, bR, bB, bN, bP };

export function ChessPieceImg({ code }: { code: string }) {
  return <img src={CHESS[code]} alt="" draggable={false} className="h-full w-full select-none drop-shadow-sm" />;
}

export const XQ_CHARS: Record<string, string> = {
  K: '帥',
  A: '仕',
  B: '相',
  R: '俥',
  N: '傌',
  C: '炮',
  P: '兵',
  k: '將',
  a: '士',
  b: '象',
  r: '車',
  n: '馬',
  c: '包',
  p: '卒',
};

/** A round piece: red or black lettering on a wooden disc. `hidden` draws the back of a banqi piece. */
export function DiscPiece({ code, hidden, dim }: { code?: string; hidden?: boolean; dim?: boolean }) {
  const red = code ? code === code.toUpperCase() : false;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full select-none" aria-hidden="true" style={{ opacity: dim ? 0.55 : 1 }}>
      <defs>
        <radialGradient id="disc-face" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="var(--disc-hi)" />
          <stop offset="100%" stopColor="var(--disc-lo)" />
        </radialGradient>
        <radialGradient id="disc-back" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="var(--back-hi)" />
          <stop offset="100%" stopColor="var(--back-lo)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="53" r="45" fill="rgba(0,0,0,0.28)" />
      <circle cx="50" cy="50" r="45" fill={hidden ? 'url(#disc-back)' : 'url(#disc-face)'} stroke="var(--disc-edge)" strokeWidth="2.5" />
      {hidden ? (
        <>
          <circle cx="50" cy="50" r="33" fill="none" stroke="var(--back-ring)" strokeWidth="2" />
          <path d="M50 30 L57 50 L50 70 L43 50 Z" fill="var(--back-ring)" opacity="0.7" />
        </>
      ) : (
        <>
          <circle cx="50" cy="50" r="37" fill="none" stroke={red ? 'var(--xq-red)' : 'var(--xq-black)'} strokeWidth="2.2" />
          <text
            x="50"
            y="51"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="46"
            fontFamily="'Noto Serif TC', 'Songti TC', 'PMingLiU', serif"
            fontWeight="700"
            fill={red ? 'var(--xq-red)' : 'var(--xq-black)'}
          >
            {code ? XQ_CHARS[code] : ''}
          </text>
        </>
      )}
    </svg>
  );
}
