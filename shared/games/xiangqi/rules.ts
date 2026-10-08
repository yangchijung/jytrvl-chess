// Xiangqi (中國象棋) rules engine — written from scratch for JY Chess.
// Rule set: see docs/rules/xiangqi.md ("JY Chess 台灣象棋規則 v1.0").
//
// Coordinates: files a–i (0–8) from Red's left, ranks 1–10 (index 0–9) from Red's side.
// Square index = rank * 9 + file. Red pieces upper-case, Black lower-case:
//   K/k 帥將  A/a 仕士  B/b 相象  R/r 俥車  N/n 傌馬  C/c 炮砲(包)  P/p 兵卒
// FEN uses the same convention as Fairy-Stockfish / UCCI (rank 10 first, side "w" = Red).
import type { GameResult, MoveRecord, Seat, DrawClaim } from '../../types';

export const XQ_START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
export const FILES = 'abcdefghi';

export type XqPiece = 'K' | 'A' | 'B' | 'R' | 'N' | 'C' | 'P' | 'k' | 'a' | 'b' | 'r' | 'n' | 'c' | 'p';
export type XqBoard = (XqPiece | null)[]; // 90

export interface XiangqiOptions {
  /** plies without capture before automatic draw; 0 disables. Default 120 (= 60 rounds, 「60 回合自然限著」). */
  noCaptureLimit: number;
  /** repetition count that triggers adjudication. Default 3. */
  repetitionLimit: number;
}

export const DEFAULT_XQ_OPTIONS: XiangqiOptions = { noCaptureLimit: 120, repetitionLimit: 3 };

export interface XiangqiState {
  startFen: string;
  moves: string[];
  options?: Partial<XiangqiOptions>;
}

export const sq = (file: number, rank: number) => rank * 9 + file;
export const fileOf = (s: number) => s % 9;
export const rankOf = (s: number) => Math.floor(s / 9);
export const sqName = (s: number) => `${FILES[fileOf(s)]}${rankOf(s) + 1}`;
export function parseSq(n: string): number {
  const f = FILES.indexOf(n[0]);
  const r = Number(n.slice(1)) - 1;
  if (f < 0 || !(r >= 0 && r <= 9) || !Number.isInteger(r)) return -1;
  return sq(f, r);
}
export const isRed = (p: XqPiece) => p === p.toUpperCase();
export const sideOf = (p: XqPiece): Seat => (isRed(p) ? 0 : 1);
const inBoard = (f: number, r: number) => f >= 0 && f < 9 && r >= 0 && r < 10;
const inPalace = (f: number, r: number, side: Seat) => f >= 3 && f <= 5 && (side === 0 ? r >= 0 && r <= 2 : r >= 7 && r <= 9);
const ownHalf = (r: number, side: Seat) => (side === 0 ? r <= 4 : r >= 5);

export function parseFen(fen: string): { board: XqBoard; turn: Seat; halfmove: number; fullmove: number } {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  if (rows.length !== 10) throw new Error('bad xiangqi fen');
  const board: XqBoard = new Array(90).fill(null);
  rows.forEach((row, i) => {
    const rank = 9 - i;
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        if (!/[KABRNCPkabrncp]/.test(ch) || f > 8) throw new Error('bad xiangqi fen');
        board[sq(f, rank)] = ch as XqPiece;
        f++;
      }
    }
    if (f !== 9) throw new Error('bad xiangqi fen');
  });
  const turn: Seat = parts[1] === 'b' ? 1 : 0;
  return { board, turn, halfmove: Number(parts[4] ?? 0) || 0, fullmove: Number(parts[5] ?? 1) || 1 };
}

export function boardToFen(board: XqBoard, turn: Seat, halfmove = 0, fullmove = 1): string {
  const rows: string[] = [];
  for (let r = 9; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 9; f++) {
      const p = board[sq(f, r)];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn === 0 ? 'w' : 'b'} - - ${halfmove} ${fullmove}`;
}

const ORTH = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
// horse: [leg df, leg dr, target df, target dr]
const HORSE = [
  [0, 1, 1, 2],
  [0, 1, -1, 2],
  [0, -1, 1, -2],
  [0, -1, -1, -2],
  [1, 0, 2, 1],
  [1, 0, 2, -1],
  [-1, 0, -2, 1],
  [-1, 0, -2, -1],
];

export interface XqMove {
  from: number;
  to: number;
}

/** Pseudo-legal destinations for the piece on `from` (ignores own-king safety). */
export function pseudoTargets(board: XqBoard, from: number): number[] {
  const p = board[from];
  if (!p) return [];
  const side = sideOf(p);
  const f0 = fileOf(from);
  const r0 = rankOf(from);
  const out: number[] = [];
  const canLand = (t: number) => {
    const q = board[t];
    return !q || sideOf(q) !== side;
  };
  switch (p.toUpperCase()) {
    case 'K':
      for (const [df, dr] of ORTH) {
        const f = f0 + df,
          r = r0 + dr;
        if (inPalace(f, r, side) && canLand(sq(f, r))) out.push(sq(f, r));
      }
      break;
    case 'A':
      for (const [df, dr] of DIAG) {
        const f = f0 + df,
          r = r0 + dr;
        if (inPalace(f, r, side) && canLand(sq(f, r))) out.push(sq(f, r));
      }
      break;
    case 'B':
      for (const [df, dr] of DIAG) {
        const f = f0 + 2 * df,
          r = r0 + 2 * dr;
        if (!inBoard(f, r) || !ownHalf(r, side)) continue;
        if (board[sq(f0 + df, r0 + dr)]) continue; // 塞象眼
        if (canLand(sq(f, r))) out.push(sq(f, r));
      }
      break;
    case 'N':
      for (const [lf, lr, tf, tr] of HORSE) {
        const f = f0 + tf,
          r = r0 + tr;
        if (!inBoard(f, r)) continue;
        if (board[sq(f0 + lf, r0 + lr)]) continue; // 蹩馬腿
        if (canLand(sq(f, r))) out.push(sq(f, r));
      }
      break;
    case 'R':
      for (const [df, dr] of ORTH) {
        let f = f0 + df,
          r = r0 + dr;
        while (inBoard(f, r)) {
          const t = sq(f, r);
          if (!board[t]) out.push(t);
          else {
            if (sideOf(board[t]!) !== side) out.push(t);
            break;
          }
          f += df;
          r += dr;
        }
      }
      break;
    case 'C':
      for (const [df, dr] of ORTH) {
        let f = f0 + df,
          r = r0 + dr;
        let screen = false;
        while (inBoard(f, r)) {
          const t = sq(f, r);
          if (!screen) {
            if (!board[t]) out.push(t);
            else screen = true;
          } else if (board[t]) {
            if (sideOf(board[t]!) !== side) out.push(t); // 炮打隔子
            break;
          }
          f += df;
          r += dr;
        }
      }
      break;
    case 'P': {
      const fwd = side === 0 ? 1 : -1;
      const cand: [number, number][] = [[f0, r0 + fwd]];
      if (!ownHalf(r0, side)) cand.push([f0 - 1, r0], [f0 + 1, r0]);
      for (const [f, r] of cand) if (inBoard(f, r) && canLand(sq(f, r))) out.push(sq(f, r));
      break;
    }
  }
  return out;
}

export function findKing(board: XqBoard, side: Seat): number {
  const k = side === 0 ? 'K' : 'k';
  // palace squares only
  for (const r of side === 0 ? [0, 1, 2] : [7, 8, 9]) for (let f = 3; f <= 5; f++) if (board[sq(f, r)] === k) return sq(f, r);
  return -1;
}

/** Kings on the same file with nothing between — 將帥照面. */
export function kingsFacing(board: XqBoard): boolean {
  const rk = findKing(board, 0);
  const bk = findKing(board, 1);
  if (rk < 0 || bk < 0 || fileOf(rk) !== fileOf(bk)) return false;
  for (let r = rankOf(rk) + 1; r < rankOf(bk); r++) if (board[sq(fileOf(rk), r)]) return false;
  return true;
}

/** Is square `target` attacked by pieces of `by`? (pseudo-legal attacks; king facing handled separately) */
export function isAttacked(board: XqBoard, target: number, by: Seat): boolean {
  return attackersOf(board, target, by).length > 0;
}

export function attackersOf(board: XqBoard, target: number, by: Seat): number[] {
  const res: number[] = [];
  for (let s = 0; s < 90; s++) {
    const p = board[s];
    if (!p || sideOf(p) !== by) continue;
    // fast reject by geometry
    const df = Math.abs(fileOf(s) - fileOf(target));
    const dr = Math.abs(rankOf(s) - rankOf(target));
    const t = p.toUpperCase();
    if ((t === 'R' || t === 'C' || t === 'K' || t === 'P') && df !== 0 && dr !== 0) continue;
    if (t === 'N' && !((df === 1 && dr === 2) || (df === 2 && dr === 1))) continue;
    if (t === 'A' && !(df === 1 && dr === 1)) continue;
    if (t === 'B' && !(df === 2 && dr === 2)) continue;
    // treat target as enemy-occupied for capture geometry
    const saved = board[target];
    const dummy: XqPiece = by === 0 ? 'p' : 'P';
    board[target] = saved && sideOf(saved) !== by ? saved : dummy;
    const hits = pseudoTargets(board, s).includes(target);
    board[target] = saved;
    if (hits) res.push(s);
  }
  return res;
}

export function inCheck(board: XqBoard, side: Seat): boolean {
  const k = findKing(board, side);
  if (k < 0) return true;
  return isAttacked(board, k, side === 0 ? 1 : 0) || kingsFacing(board);
}

export function legalMovesOf(board: XqBoard, side: Seat): XqMove[] {
  const out: XqMove[] = [];
  for (let s = 0; s < 90; s++) {
    const p = board[s];
    if (!p || sideOf(p) !== side) continue;
    for (const t of pseudoTargets(board, s)) {
      if (moveIsSafe(board, s, t, side)) out.push({ from: s, to: t });
    }
  }
  return out;
}

export function moveIsSafe(board: XqBoard, from: number, to: number, side: Seat): boolean {
  const cap = board[to];
  const p = board[from];
  board[to] = p;
  board[from] = null;
  const ok = !inCheck(board, side);
  board[from] = p;
  board[to] = cap;
  return ok;
}

export const XQ_VALUE: Record<string, number> = { K: 10000, R: 900, C: 450, N: 400, B: 200, A: 200, P: 100 };

/** Pieces that a move by `side` newly threatens in the sense of 捉 (chase), per docs/rules/xiangqi.md §6. */
export function chasedTargets(board: XqBoard, side: Seat, movedTo: number): number[] {
  const p = board[movedTo];
  if (!p) return [];
  const t = p.toUpperCase();
  if (t === 'K' || t === 'P') return []; // 將（帥）、兵（卒）捉子不算
  const opp: Seat = side === 0 ? 1 : 0;
  const res: number[] = [];
  for (const target of pseudoTargets(board, movedTo)) {
    const victim = board[target];
    if (!victim || sideOf(victim) !== opp) continue;
    const vt = victim.toUpperCase();
    if (vt === 'K') continue; // that is a check, not a chase
    if (vt === 'P' && ownHalf(rankOf(target), opp)) continue; // 未過河兵卒不算被捉
    // capture must be legal
    if (!moveIsSafe(board, movedTo, target, side)) continue;
    const protectedBy = defendersAfterCapture(board, movedTo, target, opp);
    if (!protectedBy || XQ_VALUE[t] < XQ_VALUE[vt]) res.push(target); // 捉無根子，或以小捉大
  }
  return res;
}

function defendersAfterCapture(board: XqBoard, from: number, to: number, defSide: Seat): boolean {
  const cap = board[to];
  const p = board[from];
  board[to] = p;
  board[from] = null;
  // a defender only counts if recapturing is legal
  let def = false;
  for (const d of attackersOf(board, to, defSide)) {
    if (moveIsSafe(board, d, to, defSide)) {
      def = true;
      break;
    }
  }
  board[from] = p;
  board[to] = cap;
  return def;
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const AR_NUM = ['１', '２', '３', '４', '５', '６', '７', '８', '９'];
const CN_NAME: Record<XqPiece, string> = {
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
export const PIECE_NAME_ZH = CN_NAME;
export const PIECE_NAME_EN: Record<string, string> = {
  K: 'General',
  A: 'Advisor',
  B: 'Elephant',
  R: 'Chariot',
  N: 'Horse',
  C: 'Cannon',
  P: 'Soldier',
};

/** Traditional Chinese notation, e.g. 炮二平五 / 馬８進７, used in Taiwan score sheets. */
export function chineseNotation(board: XqBoard, from: number, to: number): string {
  const p = board[from]!;
  const side = sideOf(p);
  const num = side === 0 ? CN_NUM : AR_NUM;
  // Files are counted from each player's right-hand side.
  const colNo = (f: number) => (side === 0 ? 9 - f : f + 1);
  const f0 = fileOf(from),
    r0 = rankOf(from),
    f1 = fileOf(to),
    r1 = rankOf(to);
  const t = p.toUpperCase();
  let prefix = CN_NAME[p] + num[colNo(f0) - 1];
  // same piece type on same file → 前/後 (中 for three)
  const same: number[] = [];
  for (let r = 0; r < 10; r++) if (board[sq(f0, r)] === p) same.push(r);
  if (same.length >= 2 && t !== 'A' && t !== 'B') {
    const order = side === 0 ? [...same].sort((a, b) => b - a) : [...same].sort((a, b) => a - b); // front first
    const idx = order.indexOf(r0);
    const label = same.length === 2 ? ['前', '後'][idx] : (['前', '中', '後'][idx] ?? String(idx + 1));
    prefix = label + CN_NAME[p];
  }
  const forward = side === 0 ? r1 > r0 : r1 < r0;
  if (r0 === r1) return `${prefix}平${num[colNo(f1) - 1]}`;
  const dir = forward ? '進' : '退';
  if (t === 'N' || t === 'B' || t === 'A') return `${prefix}${dir}${num[colNo(f1) - 1]}`;
  return `${prefix}${dir}${num[Math.abs(r1 - r0) - 1]}`;
}

interface PlyInfo {
  key: string;
  check: boolean;
  chase: number[]; // chased squares after the move
  capture: boolean;
}

export class XiangqiRules {
  board: XqBoard;
  turn: Seat;
  readonly startFen: string;
  readonly opts: XiangqiOptions;
  readonly uci: string[] = [];
  readonly records: MoveRecord[] = [];
  private plies: PlyInfo[] = [];
  private keys: string[] = [];
  private halfmove: number;
  private fullmove: number;
  private adjudicated: GameResult | null = null;

  constructor(state: XiangqiState = { startFen: XQ_START_FEN, moves: [] }) {
    this.startFen = state.startFen;
    this.opts = { ...DEFAULT_XQ_OPTIONS, ...(state.options ?? {}) };
    const p = parseFen(state.startFen);
    this.board = p.board;
    this.turn = p.turn;
    this.halfmove = p.halfmove;
    this.fullmove = p.fullmove;
    if (findKing(this.board, 0) < 0 || findKing(this.board, 1) < 0) throw new Error('missing general');
    this.keys.push(this.key());
    for (const m of state.moves) if (!this.play(m)) throw new Error(`illegal move in history: ${m}`);
  }

  state(): XiangqiState {
    return { startFen: this.startFen, moves: [...this.uci], options: this.opts };
  }

  key(): string {
    return boardToFen(this.board, this.turn).split(' ').slice(0, 2).join(' ');
  }

  fen(): string {
    return boardToFen(this.board, this.turn, this.halfmove, this.fullmove);
  }

  sideToMove(): Seat {
    return this.turn;
  }

  legalMoves(): string[] {
    if (this.result()) return [];
    return legalMovesOf(this.board, this.turn).map((m) => sqName(m.from) + sqName(m.to));
  }

  legalMovesFrom(square: string): string[] {
    const s = parseSq(square);
    if (s < 0) return [];
    return this.legalMoves().filter((m) => this.splitMove(m)?.[0] === s);
  }

  inCheck(): boolean {
    return inCheck(this.board, this.turn);
  }

  splitMove(m: string): [number, number] | null {
    const mm = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(m.toLowerCase());
    if (!mm) return null;
    return [parseSq(mm[1]), parseSq(mm[2])];
  }

  play(move: string): MoveRecord | null {
    if (this.result()) return null;
    const sp = this.splitMove(move);
    if (!sp) return null;
    const [from, to] = sp;
    const p = this.board[from];
    if (!p || sideOf(p) !== this.turn) return null;
    if (!pseudoTargets(this.board, from).includes(to)) return null;
    if (!moveIsSafe(this.board, from, to, this.turn)) return null;
    const notation = chineseNotation(this.board, from, to);
    const cap = this.board[to];
    const seat = this.turn;
    this.board[to] = p;
    this.board[from] = null;
    this.turn = seat === 0 ? 1 : 0;
    if (seat === 1) this.fullmove++;
    this.halfmove = cap ? 0 : this.halfmove + 1;
    const check = inCheck(this.board, this.turn);
    const chase = check ? [] : chasedTargets(this.board, seat, to);
    const k = this.key();
    this.plies.push({ key: k, check, chase, capture: !!cap });
    this.keys.push(k);
    const mv = sqName(from) + sqName(to);
    this.uci.push(mv);
    const rec: MoveRecord = { move: mv, notation, seat, capture: cap ?? undefined };
    this.records.push(rec);
    this.adjudicated = this.adjudicateRepetition();
    return rec;
  }

  /** §6 of the rule document: perpetual check / perpetual chase lose, otherwise repetition is a draw. */
  private adjudicateRepetition(): GameResult | null {
    const k = this.keys[this.keys.length - 1];
    const occurrences: number[] = [];
    this.keys.forEach((x, i) => x === k && occurrences.push(i));
    if (occurrences.length < this.opts.repetitionLimit) return null;
    // cycle = plies from first occurrence (exclusive) to now — ply i produced keys[i+1]
    const startKeyIdx = occurrences[0];
    const cycle = this.plies.slice(startKeyIdx); // ply index j produced keys[j+1]
    const bySeat: [PlyInfo[], PlyInfo[]] = [[], []];
    // seat of ply j: the side to move at keys[j]
    const firstSeat = parseFen(this.startFen).turn;
    cycle.forEach((pl, idx) => {
      const plyIndex = startKeyIdx + idx;
      const seat = ((firstSeat + plyIndex) % 2) as Seat;
      bySeat[seat].push(pl);
    });
    const allCheck = (s: Seat) => bySeat[s].length > 0 && bySeat[s].every((p) => p.check);
    // 長捉: every move checks or chases, and the chased piece is continually the same target set (simplified: any chase each ply)
    const allViolate = (s: Seat) => bySeat[s].length > 0 && bySeat[s].every((p) => p.check || p.chase.length > 0);
    const c0 = allCheck(0),
      c1 = allCheck(1);
    if (c0 && !c1) return { kind: 'win', winner: 1, reason: 'perpetual_check' };
    if (c1 && !c0) return { kind: 'win', winner: 0, reason: 'perpetual_check' };
    if (c0 && c1) return { kind: 'draw', reason: 'repetition' };
    const v0 = allViolate(0),
      v1 = allViolate(1);
    if (v0 && !v1) return { kind: 'win', winner: 1, reason: 'perpetual_chase' };
    if (v1 && !v0) return { kind: 'win', winner: 0, reason: 'perpetual_chase' };
    return { kind: 'draw', reason: 'repetition' };
  }

  result(): GameResult | null {
    if (this.adjudicated) return this.adjudicated;
    const moves = legalMovesOf(this.board, this.turn);
    if (moves.length === 0) {
      return { kind: 'win', winner: this.turn === 0 ? 1 : 0, reason: inCheck(this.board, this.turn) ? 'checkmate' : 'stalemate_loss' };
    }
    if (this.noAttackers()) return { kind: 'draw', reason: 'insufficient_material' };
    if (this.opts.noCaptureLimit > 0 && this.halfmove >= this.opts.noCaptureLimit) return { kind: 'draw', reason: 'no_capture_limit' };
    return null;
  }

  claimableDraw(): DrawClaim | null {
    return null; // xiangqi draws are adjudicated automatically
  }

  /** Neither side has a piece able to cross the river (俥傌炮兵) → no mate possible. */
  noAttackers(): boolean {
    return !this.board.some((p) => p && 'RNCP'.includes(p.toUpperCase()));
  }

  hasAttackers(seat: Seat): boolean {
    return this.board.some((p) => p && sideOf(p) === seat && 'RNCP'.includes(p.toUpperCase()));
  }

  /** Explain why a piece has no legal move (used by the coach). Returns i18n key + params. */
  explainNoMove(square: string): { key: string } | null {
    const s = parseSq(square);
    const p = this.board[s];
    if (!p) return { key: 'coach.empty_square' };
    if (sideOf(p) !== this.turn) return { key: 'coach.not_your_piece' };
    const pseudo = pseudoTargets(this.board, s);
    const legal = pseudo.filter((t) => moveIsSafe(this.board, s, t, this.turn));
    if (legal.length > 0) return null;
    if (pseudo.length > 0) {
      if (this.inCheck()) return { key: 'coach.must_answer_check' };
      // moving would expose king or face kings
      return { key: 'coach.pinned_xq' };
    }
    const t = p.toUpperCase();
    if (t === 'N') return { key: 'coach.horse_blocked' };
    if (t === 'B') return { key: 'coach.elephant_blocked' };
    if (t === 'K' || t === 'A') return { key: 'coach.palace_limit' };
    return { key: 'coach.blocked' };
  }
}
