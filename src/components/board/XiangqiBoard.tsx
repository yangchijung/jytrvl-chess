import { DiscPiece, XQ_CHARS } from './pieces';
import { useStablePieces, PieceSprite, type PlacedPiece } from './PieceLayer';
import { useBoardSelection, type BoardApi } from './useBoard';
import { useI18n } from '../../i18n';
import { useSettings } from '../../lib/settings';
import type { XqBoard } from '../../../shared/games/xiangqi/rules';

const FILES = 'abcdefghi';
const EN: Record<string, string> = { K: 'general', A: 'advisor', B: 'elephant', R: 'chariot', N: 'horse', C: 'cannon', P: 'soldier' };

export interface XiangqiBoardProps {
  board: XqBoard;
  positionKey: string;
  api: BoardApi;
  flipped?: boolean;
  lastMove?: [string, string] | null;
  checkSquare?: string | null;
  hint?: [string, string] | null;
  interactive?: boolean;
  onInfo?: (key: string | null) => void;
}

const sqIndex = (name: string) => (Number(name.slice(1)) - 1) * 9 + FILES.indexOf(name[0]);

/** The traditional board: lines, river, palace diagonals and position marks. Pure SVG, scales with the container. */
function XiangqiGrid({ flipped }: { flipped?: boolean }) {
  const W = 900,
    H = 1000;
  const cx = (c: number) => (c + 0.5) * 100;
  const cy = (r: number) => (r + 0.5) * 100;
  const lines = [];
  for (let r = 0; r < 10; r++) lines.push(<line key={`h${r}`} x1={cx(0)} y1={cy(r)} x2={cx(8)} y2={cy(r)} />);
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) lines.push(<line key={`v${c}`} x1={cx(c)} y1={cy(0)} x2={cx(c)} y2={cy(9)} />);
    else {
      lines.push(<line key={`vt${c}`} x1={cx(c)} y1={cy(0)} x2={cx(c)} y2={cy(4)} />);
      lines.push(<line key={`vb${c}`} x1={cx(c)} y1={cy(5)} x2={cx(c)} y2={cy(9)} />);
    }
  }
  // palaces
  lines.push(<line key="p1" x1={cx(3)} y1={cy(0)} x2={cx(5)} y2={cy(2)} />, <line key="p2" x1={cx(5)} y1={cy(0)} x2={cx(3)} y2={cy(2)} />);
  lines.push(<line key="p3" x1={cx(3)} y1={cy(7)} x2={cx(5)} y2={cy(9)} />, <line key="p4" x1={cx(5)} y1={cy(7)} x2={cx(3)} y2={cy(9)} />);
  // position marks for soldiers and cannons
  const marks: [number, number][] = [
    [1, 2],
    [7, 2],
    [0, 3],
    [2, 3],
    [4, 3],
    [6, 3],
    [8, 3],
    [1, 7],
    [7, 7],
    [0, 6],
    [2, 6],
    [4, 6],
    [6, 6],
    [8, 6],
  ];
  const tick = (c: number, r: number) => {
    const x = cx(c),
      y = cy(r),
      g = 8,
      l = 18;
    const parts = [];
    for (const sx of [-1, 1]) {
      if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
      for (const sy of [-1, 1])
        parts.push(<polyline key={`${c}${r}${sx}${sy}`} points={`${x + sx * g},${y + sy * (g + l)} ${x + sx * g},${y + sy * g} ${x + sx * (g + l)},${y + sy * g}`} fill="none" />);
    }
    return parts;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} fill="var(--xq-board)" rx="18" />
      <rect x={cx(0) - 14} y={cy(0) - 14} width={800 + 28} height={900 + 28} fill="none" stroke="var(--xq-line)" strokeWidth="5" />
      <g stroke="var(--xq-line)" strokeWidth="2.5">{lines}</g>
      <g stroke="var(--xq-line)" strokeWidth="2.5">{marks.flatMap(([c, r]) => tick(c, r))}</g>
      <g
        fontFamily="'Noto Serif TC', 'Songti TC', serif"
        fontSize="58"
        fill="var(--xq-line)"
        opacity="0.75"
        textAnchor="middle"
        dominantBaseline="central"
        transform={flipped ? `rotate(180 ${W / 2} ${H / 2})` : undefined}
      >
        <text x={cx(2)} y={500}>楚 河</text>
        <text x={cx(6)} y={500}>漢 界</text>
      </g>
    </svg>
  );
}

export function XiangqiBoard({ board, positionKey, api, flipped, lastMove, checkSquare, hint, interactive = true, onInfo }: XiangqiBoardProps) {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const sel = useBoardSelection(api, positionKey, onInfo);

  const xy = (i: number) => {
    const f = i % 9;
    const r = Math.floor(i / 9);
    const col = flipped ? 8 - f : f;
    const row = flipped ? r : 9 - r;
    return { x: ((col + 0.5) / 9) * 100, y: ((row + 0.5) / 10) * 100 };
  };

  const pieces: PlacedPiece[] = [];
  board.forEach((p, i) => p && pieces.push({ sq: i, code: p }));
  const tracked = useStablePieces(pieces, lastMove ? [sqIndex(lastMove[0]), sqIndex(lastMove[1])] : null);

  const cells = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const f = flipped ? 8 - col : col;
      const r = flipped ? row : 9 - row;
      const name = `${FILES[f]}${r + 1}`;
      const p = board[r * 9 + f];
      const isTarget = sel.targets.includes(name);
      const label = p
        ? `${name} ${lang === 'zh' ? XQ_CHARS[p] : `${p === p.toUpperCase() ? 'red' : 'black'} ${EN[p.toUpperCase()]}`}`
        : `${name} ${t('board.empty')}`;
      const mark =
        (sel.selected === name && 'var(--selected)') ||
        (hint && hint.includes(name) && 'var(--hint)') ||
        (lastMove && lastMove.includes(name) && 'var(--last-move)') ||
        null;
      cells.push(
        <button
          key={name}
          type="button"
          disabled={!interactive}
          aria-label={label + (isTarget ? `, ${t('board.legalHint')}` : '')}
          aria-pressed={sel.selected === name}
          onClick={() => sel.click(name)}
          className="relative flex items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
        >
          {mark && <span className="absolute inset-[6%] rounded-full" style={{ background: mark }} />}
          {checkSquare === name && <span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, var(--check) 0%, transparent 72%)' }} />}
          {isTarget && settings.hints && (
            <span className={p ? 'absolute inset-[4%] rounded-full border-[0.3rem]' : 'absolute h-[26%] w-[26%] rounded-full'} style={p ? { borderColor: 'var(--target)' } : { background: 'var(--target)' }} />
          )}
        </button>,
      );
    }
  }

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: '9 / 10' }}>
      <XiangqiGrid flipped={flipped} />
      {settings.coords && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex text-[0.55rem] font-semibold opacity-60 sm:text-[0.7rem]" style={{ color: 'var(--xq-line)' }} aria-hidden="true">
          {Array.from({ length: 9 }, (_, c) => (
            <span key={c} className="flex-1 text-center">
              {flipped ? 9 - (8 - c) : 9 - c}
            </span>
          ))}
        </div>
      )}
      <div
        role="grid"
        aria-label={t('board.aria', { game: t('game.xiangqi') })}
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: 'repeat(9, 1fr)', gridTemplateRows: 'repeat(10, 1fr)' }}
      >
        {cells}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {tracked.map((p) => {
          const { x, y } = xy(p.sq);
          return (
            <PieceSprite key={p.id} x={x} y={y} size={10.4} animate={settings.animation}>
              <DiscPiece code={p.code} />
            </PieceSprite>
          );
        })}
      </div>
    </div>
  );
}
