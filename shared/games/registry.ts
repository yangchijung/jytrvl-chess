// Uniform facade over the three rule engines. Used by the browser (local games, tutorials)
// and by the realtime server (authoritative online games). Adding a new game = one new adapter here.
import { ChessRules, CHESS_START_FEN, type ChessState } from './chess/rules';
import { XiangqiRules, XQ_START_FEN, sqName, findKing, type XiangqiState, type XqBoard } from './xiangqi/rules';
import { BanqiRules, type BanqiState, type BanqiView, type BanqiOptions, BANQI_PRESETS } from './banqi/rules';
import type { GameId, GameResult, MoveRecord, Seat, DrawClaim } from '../types';

export type AnyState =
  | { game: 'chess'; state: ChessState }
  | { game: 'xiangqi'; state: XiangqiState }
  | { game: 'banqi'; state: BanqiState };

/** What a client is allowed to see. */
export type PublicPosition =
  | { game: 'chess'; fen: string; startFen: string }
  | { game: 'xiangqi'; fen: string; board: XqBoard; startFen: string }
  | { game: 'banqi'; view: BanqiView };

export interface Rules {
  readonly game: GameId;
  sideToMove(): Seat;
  legalMoves(): string[];
  legalFrom(square: string): string[];
  play(move: string): MoveRecord | null;
  result(): GameResult | null;
  claimableDraw(): DrawClaim | null;
  records(): MoveRecord[];
  moveList(): string[];
  position(): PublicPosition;
  serialize(): AnyState;
  lastMove(): [string, string] | null;
  checkSquare(): string | null;
  /** result when `seat` runs out of time (FIDE 6.9 / xiangqi §8) */
  timeoutResult(seat: Seat): GameResult;
  explainNoMove(square: string): { key: string } | null;
}

class ChessAdapter implements Rules {
  readonly game = 'chess' as const;
  constructor(public r: ChessRules) {}
  sideToMove() {
    return this.r.sideToMove();
  }
  legalMoves() {
    return this.r.result() ? [] : this.r.legalMoves();
  }
  legalFrom(sq: string) {
    return this.r.result() ? [] : this.r.legalMovesFrom(sq);
  }
  play(m: string) {
    return this.r.play(m);
  }
  result() {
    return this.r.result();
  }
  claimableDraw() {
    return this.r.claimableDraw();
  }
  records() {
    return this.r.records;
  }
  moveList() {
    return [...this.r.uci];
  }
  position(): PublicPosition {
    return { game: 'chess', fen: this.r.fen(), startFen: this.r.startFen };
  }
  serialize(): AnyState {
    return { game: 'chess', state: this.r.state() };
  }
  lastMove(): [string, string] | null {
    const u = this.r.uci.at(-1);
    return u ? [u.slice(0, 2), u.slice(2, 4)] : null;
  }
  checkSquare() {
    if (!this.r.inCheck()) return null;
    const turn = this.r.game.turn();
    for (const row of this.r.game.board()) for (const p of row) if (p && p.type === 'k' && p.color === turn) return p.square;
    return null;
  }
  timeoutResult(seat: Seat): GameResult {
    const opp: Seat = seat === 0 ? 1 : 0;
    if (!this.r.hasMatingMaterial(opp)) return { kind: 'draw', reason: 'timeout_draw' };
    return { kind: 'win', winner: opp, reason: 'timeout' };
  }
  explainNoMove(sq: string) {
    const p = this.r.game.get(sq as never);
    if (!p) return { key: 'coach.empty_square' };
    if ((p.color === 'w' ? 0 : 1) !== this.sideToMove()) return { key: 'coach.not_your_piece' };
    if (this.r.legalMovesFrom(sq).length > 0) return null;
    if (this.r.inCheck()) return { key: 'coach.must_answer_check' };
    // pseudo-legal check: would the piece have moves if the king were not a concern?
    return { key: 'coach.no_moves_chess' };
  }
}

class XiangqiAdapter implements Rules {
  readonly game = 'xiangqi' as const;
  constructor(public r: XiangqiRules) {}
  sideToMove() {
    return this.r.sideToMove();
  }
  legalMoves() {
    return this.r.legalMoves();
  }
  legalFrom(sq: string) {
    return this.r.legalMovesFrom(sq);
  }
  play(m: string) {
    return this.r.play(m);
  }
  result() {
    return this.r.result();
  }
  claimableDraw() {
    return null;
  }
  records() {
    return this.r.records;
  }
  moveList() {
    return [...this.r.uci];
  }
  position(): PublicPosition {
    return { game: 'xiangqi', fen: this.r.fen(), board: [...this.r.board], startFen: this.r.startFen };
  }
  serialize(): AnyState {
    return { game: 'xiangqi', state: this.r.state() };
  }
  lastMove(): [string, string] | null {
    const u = this.r.uci.at(-1);
    if (!u) return null;
    const sp = this.r.splitMove(u)!;
    return [sqName(sp[0]), sqName(sp[1])];
  }
  checkSquare() {
    if (!this.r.inCheck()) return null;
    return sqName(findKing(this.r.board, this.r.sideToMove()));
  }
  timeoutResult(seat: Seat): GameResult {
    const opp: Seat = seat === 0 ? 1 : 0;
    if (!this.r.hasAttackers(opp)) return { kind: 'draw', reason: 'timeout_draw' };
    return { kind: 'win', winner: opp, reason: 'timeout' };
  }
  explainNoMove(sq: string) {
    return this.r.explainNoMove(sq);
  }
}

class BanqiAdapter implements Rules {
  readonly game = 'banqi' as const;
  constructor(public r: BanqiRules) {}
  sideToMove() {
    return this.r.sideToMove();
  }
  legalMoves() {
    return this.r.legalMoves();
  }
  legalFrom(sq: string) {
    return this.r.legalMovesFrom(sq);
  }
  play(m: string) {
    return this.r.play(m);
  }
  result() {
    return this.r.result();
  }
  claimableDraw() {
    return null;
  }
  records() {
    return this.r.records;
  }
  moveList() {
    return [...this.r.moves];
  }
  position(): PublicPosition {
    return { game: 'banqi', view: this.r.publicView() };
  }
  serialize(): AnyState {
    return { game: 'banqi', state: this.r.state() };
  }
  lastMove(): [string, string] | null {
    const m = this.r.moves.at(-1);
    if (!m || m === 'pass') return null;
    if (m.startsWith('f:')) return [m.slice(2), m.slice(2)];
    const [a, b] = m.split('-');
    return [a, b];
  }
  checkSquare() {
    return null;
  }
  timeoutResult(seat: Seat): GameResult {
    return { kind: 'win', winner: seat === 0 ? 1 : 0, reason: 'timeout' };
  }
  explainNoMove(sq: string) {
    return this.r.explainNoMove(sq);
  }
}

export interface NewGameOptions {
  startFen?: string;
  banqiPreset?: keyof typeof BANQI_PRESETS;
  banqiOptions?: Partial<BanqiOptions>;
  rand?: () => number;
}

export function newRules(game: GameId, o: NewGameOptions = {}): Rules {
  switch (game) {
    case 'chess':
      return new ChessAdapter(new ChessRules({ startFen: o.startFen ?? CHESS_START_FEN, moves: [] }));
    case 'xiangqi':
      return new XiangqiAdapter(new XiangqiRules({ startFen: o.startFen ?? XQ_START_FEN, moves: [] }));
    case 'banqi':
      return new BanqiAdapter(BanqiRules.create({ ...BANQI_PRESETS[o.banqiPreset ?? 'taiwan'], ...(o.banqiOptions ?? {}) }, o.rand));
  }
}

export function restoreRules(s: AnyState): Rules {
  switch (s.game) {
    case 'chess':
      return new ChessAdapter(new ChessRules(s.state));
    case 'xiangqi':
      return new XiangqiAdapter(new XiangqiRules(s.state));
    case 'banqi':
      return new BanqiAdapter(new BanqiRules(s.state));
  }
}

/** Replays the first `n` moves of a state (used for undo / redo / replays). */
export function truncateState(s: AnyState, n: number): AnyState {
  return { ...s, state: { ...s.state, moves: s.state.moves.slice(0, n) } } as AnyState;
}

export { BANQI_PRESETS };

/** Wrap an already-configured BanqiRules (tutorial setups). */
export function wrapBanqi(r: BanqiRules): Rules {
  return new BanqiAdapter(r);
}
