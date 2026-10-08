import { useCallback, useEffect, useState } from 'react';

export interface BoardApi {
  legalFrom: (sq: string) => string[];
  move: (m: string) => boolean;
  explain?: (sq: string) => { key: string } | null;
}

/** Splits a move string into [from, to] square names for any of the three games. */
export function moveSquares(m: string): [string, string] | null {
  if (m.startsWith('f:')) return [m.slice(2), m.slice(2)];
  if (m.includes('-')) {
    const [a, b] = m.split('-');
    return [a, b];
  }
  const mm = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))([qrbn])?$/.exec(m);
  return mm ? [mm[1], mm[2]] : null;
}

export function useBoardSelection(api: BoardApi, positionKey: string, onInfo?: (key: string | null) => void) {
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [promotion, setPromotion] = useState<{ from: string; to: string; options: string[] } | null>(null);

  useEffect(() => {
    setSelected(null);
    setTargets([]);
    setPromotion(null);
  }, [positionKey]);

  const click = useCallback(
    (sq: string) => {
      if (promotion) return;
      // banqi flip on a face-down piece
      const own = api.legalFrom(sq);
      if (selected) {
        const candidates = api.legalFrom(selected).filter((m) => moveSquares(m)?.[1] === sq && !m.startsWith('f:'));
        if (candidates.length === 1) {
          api.move(candidates[0]);
          setSelected(null);
          setTargets([]);
          onInfo?.(null);
          return;
        }
        if (candidates.length > 1) {
          setPromotion({ from: selected, to: sq, options: candidates });
          return;
        }
      }
      if (own.length === 1 && own[0] === `f:${sq}`) {
        api.move(own[0]);
        setSelected(null);
        setTargets([]);
        onInfo?.(null);
        return;
      }
      const moves = own.filter((m) => !m.startsWith('f:'));
      if (moves.length) {
        if (selected === sq) {
          setSelected(null);
          setTargets([]);
          return;
        }
        setSelected(sq);
        setTargets([...new Set(moves.map((m) => moveSquares(m)![1]))]);
        onInfo?.(null);
        return;
      }
      setSelected(null);
      setTargets([]);
      const why = api.explain?.(sq);
      onInfo?.(why ? why.key : null);
    },
    [api, selected, promotion, onInfo],
  );

  const choosePromotion = (m: string | null) => {
    if (m) api.move(m);
    setPromotion(null);
    setSelected(null);
    setTargets([]);
  };

  return { selected, targets, click, promotion, choosePromotion };
}
