// Taiwan Banqi (台灣暗棋) — configurable rules engine.
// Default rule set ("台灣常見版") is documented in docs/rules/banqi.md and shown in-game.
//
// Board: 4 rows × 8 columns. Square index = row * 8 + col, named a1…h4 (col letter, row number).
// Pieces use the xiangqi letters: upper-case Red (帥仕相俥傌炮兵), lower-case Black (將士象車馬包卒).
//
// Hidden information: `layout` holds the real identity of every face-down piece and must never be sent
// to a client in online play. Use publicView() for anything that leaves the server.
import type { GameResult, MoveRecord, Seat } from '../../types';

export type BqPiece = 'K' | 'A' | 'B' | 'R' | 'N' | 'C' | 'P' | 'k' | 'a' | 'b' | 'r' | 'n' | 'c' | 'p';
export type BqColor = 'red' | 'black';

export interface BanqiOptions {
  /** 炮可隔一子跳吃（任意距離），吃子不受階級限制 */
  cannonJump: boolean;
  /** 兵卒可吃將帥 */
  pawnCapturesKing: boolean;
  /** 將帥可吃兵卒 */
  kingCapturesPawn: boolean;
  /** 吃子後可用同一子連續吃子 */
  chainCapture: boolean;
  /** 俥車可直走多格（部分地方玩法） */
  rookSlide: boolean;
  /** 連續多少「步」（單方一步）未吃子也未翻棋即判和；0 = 關閉 */
  noProgressLimit: number;
  /** 同一明面局面重複幾次判和；0 = 關閉 */
  repetitionLimit: number;
}

export const BANQI_PRESETS: Record<string, BanqiOptions> = {
  taiwan: {
    cannonJump: true,
    pawnCapturesKing: true,
    kingCapturesPawn: false,
    chainCapture: false,
    rookSlide: false,
    noProgressLimit: 50,
    repetitionLimit: 3,
  },
  taiwan_chain: {
    cannonJump: true,
    pawnCapturesKing: true,
    kingCapturesPawn: false,
    chainCapture: true,
    rookSlide: false,
    noProgressLimit: 50,
    repetitionLimit: 3,
  },
  strict_rank: {
    cannonJump: false,
    pawnCapturesKing: false,
    kingCapturesPawn: true,
    chainCapture: false,
    rookSlide: false,
    noProgressLimit: 50,
    repetitionLimit: 3,
  },
};
export const DEFAULT_BANQI_OPTIONS = BANQI_PRESETS.taiwan;

export const BQ_RANK: Record<string, number> = { K: 7, A: 6, B: 5, R: 4, N: 3, C: 2, P: 1 };
export const BQ_COUNTS: Record<string, number> = { K: 1, A: 2, B: 2, R: 2, N: 2, C: 2, P: 5 };
export const COLS = 'abcdefgh';
const POOL_ORDER = ['K', 'A', 'B', 'R', 'N', 'C', 'P', 'k', 'a', 'b', 'r', 'n', 'c', 'p'];

export const bqSq = (col: number, row: number) => row * 8 + col;
export const bqCol = (s: number) => s % 8;
export const bqRow = (s: number) => Math.floor(s / 8);
export const bqName = (s: number) => `${COLS[bqCol(s)]}${bqRow(s) + 1}`;
export function bqParse(n: string): number {
  const c = COLS.indexOf(n[0]);
  const r = Number(n.slice(1)) - 1;
  if (c < 0 || !(r >= 0 && r <= 3) || n.length !== 2) return -1;
  return bqSq(c, r);
}
export const colorOf = (p: BqPiece): BqColor => (p === p.toUpperCase() ? 'red' : 'black');

export function fullSet(): BqPiece[] {
  const out: BqPiece[] = [];
  for (const [t, n] of Object.entries(BQ_COUNTS)) {
    for (let i = 0; i < n; i++) out.push(t as BqPiece, t.toLowerCase() as BqPiece);
  }
  return out;
}

/** Fisher–Yates with an injectable random source (crypto on server). */
export function shuffledLayout(rand: () => number = secureRandom): BqPiece[] {
  const a = fullSet();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function secureRandom(): number {
  const g = globalThis.crypto;
  if (g?.getRandomValues) {
    const b = new Uint32Array(1);
    g.getRandomValues(b);
    return b[0] / 2 ** 32;
  }
  return Math.random();
}

export interface BanqiState {
  layout: BqPiece[]; // secret
  moves: string[];
  options?: Partial<BanqiOptions>;
}

/** Cell as seen by a player: a known piece, 'X' for face-down, or null for empty. */
export type BqCell = BqPiece | 'X' | null;

export interface BanqiView {
  cells: BqCell[];
  turn: Seat;
  seatColor: [BqColor | null, BqColor | null];
  /** face-down pieces still unknown to everybody, by piece letter */
  hiddenPool: Record<string, number>;
  captured: BqPiece[];
  chainFrom: number | null;
  options: BanqiOptions;
  noProgress: number;
  moveCount: number;
}

export class BanqiRules {
  readonly opts: BanqiOptions;
  readonly layout: BqPiece[];
  board: (BqPiece | null)[];
  faceUp: boolean[];
  turn: Seat = 0;
  seatColor: [BqColor | null, BqColor | null] = [null, null];
  captured: BqPiece[] = [];
  chainFrom: number | null = null;
  noProgress = 0;
  readonly moves: string[] = [];
  readonly records: MoveRecord[] = [];
  private keys = new Map<string, number>();
  private lastKeyCount = 0;

  constructor(state: BanqiState) {
    if (state.layout.length !== 32) throw new Error('bad banqi layout');
    this.opts = { ...DEFAULT_BANQI_OPTIONS, ...(state.options ?? {}) };
    this.layout = [...state.layout];
    this.board = [...state.layout];
    this.faceUp = new Array(32).fill(false);
    for (const m of state.moves) if (!this.play(m)) throw new Error(`illegal move in history: ${m}`);
  }

  static create(options?: Partial<BanqiOptions>, rand?: () => number): BanqiRules {
    return new BanqiRules({ layout: shuffledLayout(rand), moves: [], options });
  }

  state(): BanqiState {
    return { layout: [...this.layout], moves: [...this.moves], options: this.opts };
  }

  sideToMove(): Seat {
    return this.turn;
  }

  colorOfSeat(s: Seat): BqColor | null {
    return this.seatColor[s];
  }

  seatOfColor(c: BqColor): Seat | null {
    if (this.seatColor[0] === c) return 0;
    if (this.seatColor[1] === c) return 1;
    return null;
  }

  cell(s: number): BqCell {
    const p = this.board[s];
    if (!p) return null;
    return this.faceUp[s] ? p : 'X';
  }

  publicView(): BanqiView {
    // Canonical key order — iterating the board here would leak hidden identities through key order.
    const counts: Record<string, number> = {};
    for (let s = 0; s < 32; s++) {
      const p = this.board[s];
      if (p && !this.faceUp[s]) counts[p] = (counts[p] ?? 0) + 1;
    }
    const pool: Record<string, number> = {};
    for (const k of POOL_ORDER) if (counts[k]) pool[k] = counts[k];
    return {
      cells: Array.from({ length: 32 }, (_, s) => this.cell(s)),
      turn: this.turn,
      seatColor: [...this.seatColor] as [BqColor | null, BqColor | null],
      hiddenPool: pool,
      captured: [...this.captured],
      chainFrom: this.chainFrom,
      options: this.opts,
      noProgress: this.noProgress,
      moveCount: this.moves.length,
    };
  }

  private myColor(): BqColor | null {
    return this.seatColor[this.turn];
  }

  canCapture(attacker: BqPiece, target: BqPiece): boolean {
    if (colorOf(attacker) === colorOf(target)) return false;
    const a = attacker.toUpperCase();
    const t = target.toUpperCase();
    if (a === 'C' && this.opts.cannonJump) return false; // cannon captures only by jumping
    if (a === 'K' && t === 'P') return this.opts.kingCapturesPawn;
    if (a === 'P' && t === 'K') return this.opts.pawnCapturesKing;
    return BQ_RANK[a] >= BQ_RANK[t];
  }

  /** Legal destination squares for a face-up piece at s (moves + captures). */
  targetsFrom(s: number, capturesOnly = false): number[] {
    const p = this.board[s];
    if (!p || !this.faceUp[s]) return [];
    const out: number[] = [];
    const c0 = bqCol(s),
      r0 = bqRow(s);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const isCannon = p.toUpperCase() === 'C';
    const slide = p.toUpperCase() === 'R' && this.opts.rookSlide;
    for (const [dc, dr] of dirs) {
      let c = c0 + dc,
        r = r0 + dr;
      // ordinary step / slide
      while (c >= 0 && c < 8 && r >= 0 && r < 4) {
        const t = bqSq(c, r);
        const q = this.board[t];
        if (!q) {
          if (!capturesOnly) out.push(t);
        } else {
          if (this.faceUp[t] && this.canCapture(p, q)) out.push(t);
          break;
        }
        if (!slide) break;
        c += dc;
        r += dr;
      }
      // cannon jump capture: exactly one screen, any distance, target must be face-up enemy
      if (isCannon && this.opts.cannonJump) {
        let c2 = c0 + dc,
          r2 = r0 + dr;
        let screens = 0;
        while (c2 >= 0 && c2 < 8 && r2 >= 0 && r2 < 4) {
          const t = bqSq(c2, r2);
          if (this.board[t]) {
            if (screens === 1) {
              const q = this.board[t]!;
              if (this.faceUp[t] && colorOf(q) !== colorOf(p)) out.push(t);
              break;
            }
            screens++;
          }
          c2 += dc;
          r2 += dr;
        }
      }
    }
    return out;
  }

  legalMoves(): string[] {
    if (this.result()) return [];
    const out: string[] = [];
    if (this.chainFrom !== null) {
      for (const t of this.targetsFrom(this.chainFrom, true)) out.push(`${bqName(this.chainFrom)}-${bqName(t)}`);
      out.push('pass');
      return out;
    }
    const color = this.myColor();
    for (let s = 0; s < 32; s++) {
      if (!this.board[s]) continue;
      if (!this.faceUp[s]) {
        out.push(`f:${bqName(s)}`);
        continue;
      }
      if (color && colorOf(this.board[s]!) === color) {
        for (const t of this.targetsFrom(s)) out.push(`${bqName(s)}-${bqName(t)}`);
      }
    }
    return out;
  }

  legalMovesFrom(square: string): string[] {
    return this.legalMoves().filter((m) => m === `f:${square}` || m.startsWith(`${square}-`));
  }

  isLegal(m: string): boolean {
    return this.legalMoves().includes(m);
  }

  play(m: string): MoveRecord | null {
    if (!this.isLegal(m)) return null;
    const seat = this.turn;
    let rec: MoveRecord;
    let endTurn = true;
    if (m === 'pass') {
      this.chainFrom = null;
      rec = { move: m, notation: '—', seat };
    } else if (m.startsWith('f:')) {
      const s = bqParse(m.slice(2));
      this.faceUp[s] = true;
      const p = this.board[s]!;
      if (!this.seatColor[0] && !this.seatColor[1]) {
        const c = colorOf(p);
        this.seatColor[seat] = c;
        this.seatColor[seat === 0 ? 1 : 0] = c === 'red' ? 'black' : 'red';
      }
      this.noProgress = 0;
      rec = { move: m, notation: `翻 ${bqName(s)}`, seat, reveal: p };
    } else {
      const [a, b] = m.split('-').map(bqParse);
      const p = this.board[a]!;
      const cap = this.board[b];
      this.board[b] = p;
      this.board[a] = null;
      this.faceUp[b] = true;
      this.faceUp[a] = false;
      if (cap) {
        this.captured.push(cap);
        this.noProgress = 0;
        if (this.opts.chainCapture && this.targetsFrom(b, true).length > 0) {
          this.chainFrom = b;
          endTurn = false;
        } else this.chainFrom = null;
      } else {
        this.noProgress++;
        this.chainFrom = null;
      }
      rec = { move: m, notation: `${bqName(a)}${cap ? '×' : '-'}${bqName(b)}`, seat, capture: cap ?? undefined };
    }
    if (endTurn) this.turn = seat === 0 ? 1 : 0;
    this.moves.push(m);
    this.records.push(rec);
    const k = this.visibleKey();
    this.lastKeyCount = (this.keys.get(k) ?? 0) + 1;
    this.keys.set(k, this.lastKeyCount);
    return rec;
  }

  private visibleKey(): string {
    return `${Array.from({ length: 32 }, (_, s) => this.cell(s) ?? '.').join('')}|${this.turn}|${this.chainFrom ?? ''}`;
  }

  remaining(color: BqColor): number {
    return this.board.filter((p) => p && colorOf(p) === color).length;
  }

  result(): GameResult | null {
    for (const color of ['red', 'black'] as BqColor[]) {
      if (this.remaining(color) === 0) {
        const loser = this.seatOfColor(color);
        if (loser !== null) return { kind: 'win', winner: loser === 0 ? 1 : 0, reason: 'all_captured' };
      }
    }
    // no legal move for side to move → loses (計算前不呼叫 legalMoves 以免遞迴)
    if (!this.hasAnyMove()) return { kind: 'win', winner: this.turn === 0 ? 1 : 0, reason: 'no_moves' };
    if (this.opts.noProgressLimit > 0 && this.noProgress >= this.opts.noProgressLimit) return { kind: 'draw', reason: 'no_progress' };
    if (this.opts.repetitionLimit > 0 && this.lastKeyCount >= this.opts.repetitionLimit) return { kind: 'draw', reason: 'repetition' };
    return null;
  }

  private hasAnyMove(): boolean {
    if (this.chainFrom !== null) return true; // pass is always possible
    const color = this.myColor();
    for (let s = 0; s < 32; s++) {
      if (!this.board[s]) continue;
      if (!this.faceUp[s]) return true;
      if (color && colorOf(this.board[s]!) === color && this.targetsFrom(s).length > 0) return true;
    }
    return false;
  }

  explainNoMove(square: string): { key: string } | null {
    const s = bqParse(square);
    const p = this.board[s];
    if (!p) return { key: 'coach.empty_square' };
    if (!this.faceUp[s]) return null; // can flip
    if (colorOf(p) !== this.myColor()) return { key: 'coach.not_your_piece' };
    if (this.targetsFrom(s).length > 0) return null;
    if (p.toUpperCase() === 'K') return { key: 'coach.bq_king_blocked' };
    return { key: 'coach.bq_blocked' };
  }
}
