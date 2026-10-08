import { useRef, type ReactNode } from 'react';

export interface PlacedPiece {
  sq: number;
  code: string; // piece identity, e.g. "wK", "R", "X"
}

interface Tracked extends PlacedPiece {
  id: number;
}

/**
 * Gives pieces stable identities across positions so that a moved piece animates
 * from its old square to its new one (CSS transition on left/top), whatever the game.
 */
export function useStablePieces(pieces: PlacedPiece[], lastMove: [number, number] | null): Tracked[] {
  const prev = useRef<Tracked[]>([]);
  const nextId = useRef(1);
  const prevKey = useRef('');
  const key = pieces.map((p) => `${p.sq}:${p.code}`).join(',') + `|${lastMove?.join('-') ?? ''}`;
  if (key === prevKey.current) return prev.current;
  prevKey.current = key;

  const old = [...prev.current];
  const used = new Set<number>();
  const result: (Tracked | null)[] = pieces.map(() => null);
  const takeOld = (pred: (o: Tracked) => boolean) => {
    const i = old.findIndex((o) => !used.has(o.id) && pred(o));
    if (i < 0) return null;
    used.add(old[i].id);
    return old[i];
  };
  // 1) the moved piece: from lastMove[0] to lastMove[1]
  if (lastMove && lastMove[0] !== lastMove[1]) {
    const i = pieces.findIndex((p) => p.sq === lastMove[1]);
    if (i >= 0) {
      const o = takeOld((o) => o.sq === lastMove[0]);
      if (o) result[i] = { ...pieces[i], id: o.id };
    }
  }
  // 2) unchanged squares (including a face-down piece that was just flipped)
  pieces.forEach((p, i) => {
    if (result[i]) return;
    const o = takeOld((o) => o.sq === p.sq && (o.code === p.code || o.code === 'X'));
    if (o) result[i] = { ...p, id: o.id };
  });
  // 3) same piece type nearby (castling rook, undo, etc.)
  pieces.forEach((p, i) => {
    if (result[i]) return;
    const o = takeOld((o) => o.code === p.code);
    result[i] = { ...p, id: o ? o.id : nextId.current++ };
  });
  prev.current = result as Tracked[];
  return prev.current;
}

export function PieceSprite({
  x,
  y,
  size,
  children,
  animate,
  z,
}: {
  x: number;
  y: number;
  size: number;
  children: ReactNode;
  animate: boolean;
  z?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
        transform: 'translate(-50%, -50%)',
        transition: animate ? 'left 180ms ease-out, top 180ms ease-out' : 'none',
        zIndex: z ?? 2,
        aspectRatio: '1 / 1',
      }}
    >
      {children}
    </div>
  );
}
