import { DiscPiece, XQ_CHARS } from './pieces';
import { useStablePieces, PieceSprite, type PlacedPiece } from './PieceLayer';
import { useBoardSelection, type BoardApi } from './useBoard';
import { useI18n } from '../../i18n';
import { useSettings } from '../../lib/settings';
import type { BqCell } from '../../../shared/games/banqi/rules';

const COLS = 'abcdefgh';
const EN: Record<string, string> = { K: 'general', A: 'advisor', B: 'elephant', R: 'chariot', N: 'horse', C: 'cannon', P: 'soldier' };
const idx = (n: string) => (Number(n[1]) - 1) * 8 + COLS.indexOf(n[0]);

export interface BanqiBoardProps {
  cells: BqCell[];
  positionKey: string;
  api: BoardApi;
  flipped?: boolean;
  lastMove?: [string, string] | null;
  hint?: [string, string] | null;
  interactive?: boolean;
  onInfo?: (key: string | null) => void;
}

export function BanqiBoard({ cells, positionKey, api, flipped, lastMove, hint, interactive = true, onInfo }: BanqiBoardProps) {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const sel = useBoardSelection(api, positionKey, onInfo);
  const xy = (i: number) => {
    const c = i % 8;
    const r = Math.floor(i / 8);
    const col = flipped ? 7 - c : c;
    const row = flipped ? r : 3 - r;
    return { x: ((col + 0.5) / 8) * 100, y: ((row + 0.5) / 4) * 100 };
  };
  const pieces: PlacedPiece[] = [];
  cells.forEach((c, i) => c && pieces.push({ sq: i, code: c }));
  const tracked = useStablePieces(pieces, lastMove && lastMove[0] !== lastMove[1] ? [idx(lastMove[0]), idx(lastMove[1])] : null);

  const buttons = [];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 8; col++) {
      const c = flipped ? 7 - col : col;
      const r = flipped ? row : 3 - row;
      const name = `${COLS[c]}${r + 1}`;
      const cell = cells[r * 8 + c];
      const isTarget = sel.targets.includes(name);
      const label =
        cell === 'X'
          ? `${name} ${t('board.hidden')}`
          : cell
            ? `${name} ${lang === 'zh' ? XQ_CHARS[cell] : `${cell === cell.toUpperCase() ? 'red' : 'black'} ${EN[cell.toUpperCase()]}`}`
            : `${name} ${t('board.empty')}`;
      const mark =
        (sel.selected === name && 'var(--selected)') ||
        (hint && hint.includes(name) && 'var(--hint)') ||
        (lastMove && lastMove.includes(name) && 'var(--last-move)') ||
        null;
      buttons.push(
        <button
          key={name}
          type="button"
          disabled={!interactive}
          aria-label={label + (isTarget ? `, ${t('board.legalHint')}` : '')}
          aria-pressed={sel.selected === name}
          onClick={() => sel.click(name)}
          className="relative flex items-center justify-center border border-[var(--bq-line)] outline-none focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
        >
          {mark && <span className="absolute inset-0" style={{ background: mark }} />}
          {isTarget && settings.hints && (
            <span className={cell ? 'absolute inset-[5%] rounded-full border-[0.3rem]' : 'absolute h-[24%] w-[24%] rounded-full'} style={cell ? { borderColor: 'var(--target)' } : { background: 'var(--target)' }} />
          )}
        </button>,
      );
    }

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: '2 / 1' }}>
      <div
        role="grid"
        aria-label={t('board.aria', { game: t('game.banqi') })}
        className="absolute inset-0 grid overflow-hidden rounded-md shadow-[var(--board-shadow)]"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', background: 'var(--bq-board)' }}
      >
        {buttons}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {tracked.map((p) => {
          const { x, y } = xy(p.sq);
          return (
            <PieceSprite key={p.id} x={x} y={y} size={11} animate={settings.animation}>
              <div className={settings.animation && p.code !== 'X' ? 'h-full w-full animate-[jy-flip_260ms_ease-out]' : 'h-full w-full'} key={p.code === 'X' ? 'back' : 'face'}>
                <DiscPiece code={p.code === 'X' ? undefined : p.code} hidden={p.code === 'X'} />
              </div>
            </PieceSprite>
          );
        })}
      </div>
    </div>
  );
}
