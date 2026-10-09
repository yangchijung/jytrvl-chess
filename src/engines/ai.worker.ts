/// <reference lib="webworker" />
// Off-main-thread AI for Banqi and the built-in xiangqi searcher, so the UI never freezes.
import { chooseBanqiMove } from '../../shared/ai/banqi-ai';
import { chooseEngineMove } from '../../shared/ai/choose';
import type { BanqiView } from '../../shared/games/banqi/rules';
import type { Level } from '../../shared/ai/uci';
import type { Seat } from '../../shared/types';

type Req =
  | { id: number; kind: 'banqi'; view: BanqiView; seat: Seat; level: Level; seen?: string[] }
  | { id: number; kind: 'xqlite'; fen: string; legal: string[]; level: Level };

self.onmessage = async (e: MessageEvent<Req>) => {
  const r = e.data;
  try {
    let move: string;
    if (r.kind === 'banqi') move = chooseBanqiMove(r.view, r.seat, { level: r.level, seen: new Set(r.seen ?? []) });
    else move = await chooseEngineMove('xiangqi', r.fen, r.legal, r.level, null);
    (self as unknown as Worker).postMessage({ id: r.id, move });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: r.id, error: String(err) });
  }
};
