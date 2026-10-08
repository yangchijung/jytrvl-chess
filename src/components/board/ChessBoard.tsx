import { useMemo } from 'react';
import { Chess } from 'chess.js';
import { ChessPieceImg } from './pieces';
import { useStablePieces, PieceSprite, type PlacedPiece } from './PieceLayer';
import { useBoardSelection, type BoardApi } from './useBoard';
import { useI18n } from '../../i18n';
import { useSettings } from '../../lib/settings';

const FILES = 'abcdefgh';
const NAMES: Record<string, { zh: string; en: string }> = {
  k: { zh: '國王', en: 'king' },
  q: { zh: '皇后', en: 'queen' },
  r: { zh: '城堡', en: 'rook' },
  b: { zh: '主教', en: 'bishop' },
  n: { zh: '騎士', en: 'knight' },
  p: { zh: '士兵', en: 'pawn' },
};

export interface ChessBoardProps {
  fen: string;
  api: BoardApi;
  flipped?: boolean;
  lastMove?: [string, string] | null;
  checkSquare?: string | null;
  hint?: [string, string] | null;
  interactive?: boolean;
  onInfo?: (key: string | null) => void;
}

export function ChessBoard({ fen, api, flipped, lastMove, checkSquare, hint, interactive = true, onInfo }: ChessBoardProps) {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const sel = useBoardSelection(api, fen, onInfo);
  const board = useMemo(() => new Chess(fen).board(), [fen]);

  const idx = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    return r * 8 + f;
  };
  const xy = (i: number) => {
    const f = i % 8;
    const r = Math.floor(i / 8);
    const col = flipped ? 7 - f : f;
    const row = flipped ? r : 7 - r;
    return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
  };

  const pieces: PlacedPiece[] = [];
  board.forEach((row) =>
    row.forEach((p) => {
      if (p) pieces.push({ sq: idx(p.square), code: `${p.color}${p.type.toUpperCase()}` });
    }),
  );
  const tracked = useStablePieces(pieces, lastMove ? [idx(lastMove[0]), idx(lastMove[1])] : null);

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = flipped ? 7 - col : col;
      const r = flipped ? row : 7 - row;
      const name = `${FILES[f]}${r + 1}`;
      const dark = (f + r) % 2 === 0;
      const piece = board[7 - r][f];
      const isSel = sel.selected === name;
      const isTarget = sel.targets.includes(name);
      const isLast = lastMove && (lastMove[0] === name || lastMove[1] === name);
      const isHint = hint && (hint[0] === name || hint[1] === name);
      const label = piece
        ? `${name} ${piece.color === 'w' ? (lang === 'zh' ? '白' : 'white') : lang === 'zh' ? '黑' : 'black'} ${NAMES[piece.type][lang]}`
        : `${name} ${t('board.empty')}`;
      squares.push(
        <button
          key={name}
          type="button"
          disabled={!interactive}
          aria-label={label + (isTarget ? `, ${t('board.legalHint')}` : '')}
          aria-pressed={isSel}
          onClick={() => sel.click(name)}
          className="relative flex items-center justify-center outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] focus-visible:z-10"
          style={{ background: dark ? 'var(--sq-dark)' : 'var(--sq-light)' }}
        >
          {isLast && <span className="absolute inset-0" style={{ background: 'var(--last-move)' }} />}
          {isHint && <span className="absolute inset-0" style={{ background: 'var(--hint)' }} />}
          {isSel && <span className="absolute inset-0" style={{ background: 'var(--selected)' }} />}
          {checkSquare === name && <span className="absolute inset-0" style={{ background: 'radial-gradient(circle, var(--check) 0%, transparent 70%)' }} />}
          {isTarget && settings.hints && (
            <span
              className={piece ? 'absolute inset-[6%] rounded-full border-[0.35rem]' : 'absolute h-[28%] w-[28%] rounded-full'}
              style={piece ? { borderColor: 'var(--target)' } : { background: 'var(--target)' }}
            />
          )}
          {settings.coords && col === 0 && (
            <span className="absolute left-0.5 top-0.5 text-[0.6rem] font-semibold leading-none sm:text-xs" style={{ color: dark ? 'var(--sq-light)' : 'var(--sq-dark)' }}>
              {r + 1}
            </span>
          )}
          {settings.coords && row === 7 && (
            <span className="absolute bottom-0.5 right-1 text-[0.6rem] font-semibold leading-none sm:text-xs" style={{ color: dark ? 'var(--sq-light)' : 'var(--sq-dark)' }}>
              {FILES[f]}
            </span>
          )}
        </button>,
      );
    }
  }

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: '1 / 1' }}>
      <div
        role="grid"
        aria-label={t('board.aria', { game: t('game.chess') })}
        className="grid h-full w-full overflow-hidden rounded-md shadow-[var(--board-shadow)]"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
      >
        {squares}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {tracked.map((p) => {
          const { x, y } = xy(p.sq);
          return (
            <PieceSprite key={p.id} x={x} y={y} size={12.5} animate={settings.animation}>
              <ChessPieceImg code={p.code} />
            </PieceSprite>
          );
        })}
      </div>
      {sel.promotion && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40" role="dialog" aria-label={t('board.promote')}>
          <div className="flex gap-2 rounded-xl bg-[var(--surface)] p-3 shadow-xl">
            {['q', 'r', 'b', 'n'].map((p) => {
              const m = sel.promotion!.options.find((o) => o.endsWith(p));
              if (!m) return null;
              const color = fen.split(' ')[1];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => sel.choosePromotion(m)}
                  aria-label={NAMES[p][lang]}
                  className="h-16 w-16 rounded-lg bg-[var(--sq-light)] p-1 hover:bg-[var(--sq-dark)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
                >
                  <ChessPieceImg code={`${color}${p.toUpperCase()}`} />
                </button>
              );
            })}
            <button type="button" className="px-2 text-sm underline" onClick={() => sel.choosePromotion(null)}>
              {t('ctl.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
