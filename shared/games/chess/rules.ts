// Chess rules — FIDE Laws of Chess (2023 edition, art. 5 & 9).
// Move generation, check, mate, castling, en passant and promotion come from chess.js (BSD-2-Clause).
// This wrapper adds what chess.js leaves to the arbiter:
//   * automatic draws (stalemate, dead position/insufficient material, fivefold repetition, 75-move rule)
//   * claimable draws (threefold repetition, fifty-move rule) which a player must claim
//   * a serialisable state for the server-authoritative multiplayer engine.
import { Chess, type Move } from 'chess.js';
import type { GameResult, MoveRecord, Seat, DrawClaim } from '../../types';

export const CHESS_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface ChessState {
  startFen: string;
  moves: string[]; // UCI, e.g. e2e4, e7e8q
}

export function createChess(startFen = CHESS_START_FEN): ChessState {
  // validate
  new Chess(startFen);
  return { startFen, moves: [] };
}

/** Position identity for repetition (FIDE 9.2.3): placement, side to move, castling rights, *legal* en passant. */
function positionKey(c: Chess): string {
  const f = c.fen().split(' ');
  let ep = f[3];
  if (ep !== '-') {
    const legalEp = c.moves({ verbose: true }).some((m) => m.flags.includes('e'));
    if (!legalEp) ep = '-';
  }
  return `${f[0]} ${f[1]} ${f[2]} ${ep}`;
}

export class ChessRules {
  readonly game: Chess;
  readonly startFen: string;
  readonly uci: string[] = [];
  readonly records: MoveRecord[] = [];
  private counts = new Map<string, number>();

  constructor(state: ChessState = createChess()) {
    this.startFen = state.startFen;
    this.game = new Chess(state.startFen);
    this.bump();
    for (const m of state.moves) {
      if (!this.play(m)) throw new Error(`illegal move in history: ${m}`);
    }
  }

  private bump() {
    const k = positionKey(this.game);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  state(): ChessState {
    return { startFen: this.startFen, moves: [...this.uci] };
  }

  fen(): string {
    return this.game.fen();
  }

  sideToMove(): Seat {
    return this.game.turn() === 'w' ? 0 : 1;
  }

  legalMoves(): string[] {
    return this.game.moves({ verbose: true }).map(toUci);
  }

  legalMovesFrom(square: string): string[] {
    return this.game.moves({ square: square as never, verbose: true }).map(toUci);
  }

  verboseMoves(): Move[] {
    return this.game.moves({ verbose: true });
  }

  isLegal(uci: string): boolean {
    return this.legalMoves().includes(uci.toLowerCase());
  }

  /** Plays a UCI move. Returns the record, or null if illegal (state unchanged). */
  play(uci: string): MoveRecord | null {
    if (this.result()) return null;
    const u = uci.toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return null;
    const seat = this.sideToMove();
    let mv: Move;
    try {
      mv = this.game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as never });
    } catch {
      return null;
    }
    // chess.js auto-promotes to queen if promotion omitted — refuse ambiguous promotion input
    if (mv.promotion && !u[4]) {
      this.game.undo();
      return null;
    }
    this.uci.push(toUci(mv));
    this.bump();
    const rec: MoveRecord = { move: toUci(mv), notation: mv.san, seat, capture: mv.captured };
    this.records.push(rec);
    return rec;
  }

  repetitionCount(): number {
    return this.counts.get(positionKey(this.game)) ?? 0;
  }

  halfmoveClock(): number {
    return Number(this.game.fen().split(' ')[4]);
  }

  inCheck(): boolean {
    return this.game.inCheck();
  }

  /** Automatic game end (no claim needed). */
  result(): GameResult | null {
    const g = this.game;
    if (g.isCheckmate()) return { kind: 'win', winner: this.sideToMove() === 0 ? 1 : 0, reason: 'checkmate' };
    if (g.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
    if (g.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient_material' };
    if (this.repetitionCount() >= 5) return { kind: 'draw', reason: 'fivefold_repetition' };
    // FIDE 9.6.2: 75 moves by each side without capture/pawn move — unless the last move gave mate (handled above)
    if (this.halfmoveClock() >= 150) return { kind: 'draw', reason: 'seventyfive_move' };
    return null;
  }

  /** Draw the side to move may claim (FIDE 9.2 / 9.3). The claim is validated server side. */
  claimableDraw(): DrawClaim | null {
    if (this.result()) return null;
    if (this.repetitionCount() >= 3) return { reason: 'threefold_repetition' };
    if (this.halfmoveClock() >= 100) return { reason: 'fifty_move' };
    return null;
  }

  /** Sufficient mating material for a seat — used for timeout adjudication (FIDE 6.9). */
  hasMatingMaterial(seat: Seat): boolean {
    const color = seat === 0 ? 'w' : 'b';
    const pieces = this.game.board().flat().filter((p) => p && p.color === color).map((p) => p!.type);
    const nonKing = pieces.filter((t) => t !== 'k');
    if (nonKing.length === 0) return false;
    if (nonKing.some((t) => t === 'q' || t === 'r' || t === 'p')) return true;
    // lone minor piece can't force or even help mate in most cases; FIDE requires "any series of legal moves",
    // a lone knight or bishop *can* mate a king boxed by its own pieces, so check opponent material too.
    const oppHasMore = this.game.board().flat().filter((p) => p && p.color !== color && p.type !== 'k').length > 0;
    if (nonKing.length === 1) return oppHasMore;
    return true;
  }

  pgn(headers: Record<string, string> = {}): string {
    const g = new Chess(this.startFen);
    for (const [k, v] of Object.entries(headers)) g.setHeader(k, v);
    if (this.startFen !== CHESS_START_FEN) {
      g.setHeader('SetUp', '1');
      g.setHeader('FEN', this.startFen);
    }
    for (const u of this.uci) g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as never });
    return g.pgn();
  }

  static fromPgn(pgn: string): ChessRules {
    const g = new Chess();
    g.loadPgn(pgn);
    const start = g.getHeaders()['FEN'] ?? CHESS_START_FEN;
    const moves = g.history({ verbose: true }).map(toUci);
    return new ChessRules({ startFen: start, moves });
  }
}

export function toUci(m: { from: string; to: string; promotion?: string }): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}
