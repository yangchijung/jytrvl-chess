// Online game controller — a thin client of the server-authoritative GameRoom.
import type { GameController, Snapshot } from './controller';
import type { RoomStateMsg, ServerMsg, ClientMsg } from '../../realtime/src/protocol';
import { restoreRules, type AnyState, type Rules } from '../../shared/games/registry';
import { determinize } from '../../shared/ai/banqi-ai';
import { CHESS_START_FEN } from '../../shared/games/chess/rules';
import { XQ_START_FEN } from '../../shared/games/xiangqi/rules';
import type { Seat } from '../../shared/types';

type Room = RoomStateMsg['room'];

export class OnlineController implements GameController {
  private ws: WebSocket | null = null;
  private room: Room | null = null;
  private receivedAt = 0;
  private listeners = new Set<() => void>();
  private status: 'connecting' | 'open' | 'reconnecting' | 'closed' = 'connecting';
  private retry = 0;
  private disposed = false;
  private pendingPly: number | null = null;
  private mirror: Rules | null = null;
  private mirrorKey = '';
  private error: string | null = null;
  private cached: Snapshot | null = null;
  private timer: ReturnType<typeof setInterval>;
  private ping: ReturnType<typeof setInterval>;

  constructor(
    public readonly roomId: string,
    private guestName: string,
    private onMatchedElsewhere?: (room: string) => void,
  ) {
    this.connect();
    this.timer = setInterval(() => {
      if (this.room?.clock.ms && this.room.clock.running !== null && !this.room.result) this.emit();
    }, 250);
    this.ping = setInterval(() => this.send({ t: 'ping' }), 25000);
    void this.onMatchedElsewhere;
  }

  private connect() {
    if (this.disposed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${this.roomId}/ws?name=${encodeURIComponent(this.guestName)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.status = 'open';
      this.retry = 0;
      this.emit();
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'state') {
        this.room = m.room;
        this.receivedAt = performance.now();
        this.pendingPly = null;
        this.error = null;
        this.syncMirror();
        this.emit();
      } else if (m.t === 'error') {
        this.pendingPly = null;
        this.error = m.code;
        this.emit();
      }
    };
    ws.onclose = (e) => {
      if (this.disposed) return;
      if (e.code === 1000 && e.reason === 'expired') {
        this.status = 'closed';
        this.error = 'room_not_found';
        this.emit();
        return;
      }
      if (!this.room && this.retry >= 2) {
        this.status = 'closed';
        this.error = 'room_not_found';
        this.emit();
        return;
      }
      this.status = 'reconnecting';
      this.emit();
      const delay = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private syncMirror() {
    const r = this.room;
    if (!r || !r.position) {
      this.mirror = null;
      return;
    }
    if (r.final) {
      this.mirror = restoreRules(r.final);
      return;
    }
    if (r.position.game === 'banqi') {
      // Hidden identities are unknown to us; legal moves don't depend on them, so any consistent
      // assignment of the public pool gives the correct legal move list.
      const g = determinize(r.position.view, () => 0.5);
      this.mirror = { ...fakeBanqiRules(g), position: () => r.position! } as unknown as Rules;
      return;
    }
    const key = r.moves.join(' ');
    if (key === this.mirrorKey && this.mirror) return;
    this.mirrorKey = key;
    const state: AnyState =
      r.position.game === 'chess'
        ? { game: 'chess', state: { startFen: r.position.startFen ?? CHESS_START_FEN, moves: r.moves } }
        : { game: 'xiangqi', state: { startFen: r.position.startFen ?? XQ_START_FEN, moves: r.moves } };
    try {
      this.mirror = restoreRules(state);
    } catch {
      this.mirror = null;
    }
  }

  private send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private emit() {
    this.cached = null;
    this.listeners.forEach((f) => f());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): Snapshot {
    if (this.cached) return this.cached;
    const r = this.room;
    const mySeat = r?.mySeat ?? null;
    let ms: [number, number] | null = r?.clock.ms ? [...r.clock.ms] : null;
    if (ms && r && r.clock.running !== null && !r.result && r.status === 'playing') {
      const el = performance.now() - this.receivedAt;
      ms[r.clock.running] = Math.max(0, ms[r.clock.running] - el);
    }
    const game = r?.game ?? 'chess';
    const placeholder = this.mirror?.position() ??
      (game === 'banqi'
        ? { game: 'banqi' as const, view: { cells: new Array(32).fill('X'), turn: 0 as Seat, seatColor: [null, null] as [null, null], hiddenPool: {}, captured: [], chainFrom: null, options: { cannonJump: true, pawnCapturesKing: true, kingCapturesPawn: false, chainCapture: false, rookSlide: false, noProgressLimit: 50, repetitionLimit: 3 }, noProgress: 0, moveCount: 0 } }
        : game === 'xiangqi'
          ? restoreRules({ game: 'xiangqi', state: { startFen: XQ_START_FEN, moves: [] } }).position()
          : { game: 'chess' as const, fen: CHESS_START_FEN, startFen: CHESS_START_FEN });
    const seatInfo = (i: Seat) => {
      const s = r?.seats[i];
      return s ? { name: s.name, rating: s.rating ?? undefined, connected: s.connected } : { name: '…', connected: false };
    };
    const playing = r?.status === 'playing';
    this.cached = {
      game,
      mode: 'online',
      position: r?.position ?? placeholder,
      sideToMove: r?.sideToMove ?? 0,
      mySeats: playing && mySeat !== null && !r?.result ? [mySeat] : [],
      players: [seatInfo(0), seatInfo(1)],
      records: r?.records ?? [],
      result: r?.result ?? null,
      lastMove: r?.lastMove ?? null,
      checkSquare: r?.checkSquare ?? null,
      clock: { ms, running: playing && !r?.result ? (r?.clock.running ?? null) : null, paused: false },
      canUndo: !!r && playing && !r.rated && mySeat !== null && r.records.some((x) => x.seat === mySeat) && !r.offer,
      canRedo: false,
      canPause: false,
      claimable: r && mySeat === r.sideToMove ? r.claimable : null,
      thinking: false,
      offer: r?.offer ?? null,
      coachAllowed: !!r && !r.rated,
      rated: !!r?.rated,
      online: {
        roomId: this.roomId,
        status: this.status,
        mySeat,
        spectator: !!r && r.status !== 'waiting' && mySeat === null,
        waiting: !r || r.status === 'waiting',
        opponentAwaySec: r?.awayDeadline && r.awaySeat !== mySeat ? Math.max(0, Math.round((r.awayDeadline - (r.clock.serverNow + (performance.now() - this.receivedAt))) / 1000)) : null,
        ratingChange: r?.ratingChange && mySeat !== null ? r.ratingChange[mySeat] : null,
        error: this.error,
      },
    };
    return this.cached;
  }

  legalFrom(sq: string) {
    const r = this.room;
    if (!r || !this.mirror || r.result || r.mySeat !== r.sideToMove || this.pendingPly !== null) return [];
    return this.mirror.legalFrom(sq);
  }

  move(m: string) {
    const r = this.room;
    if (!r || r.mySeat !== r.sideToMove || this.pendingPly !== null) return false;
    if (this.mirror && !this.mirror.legalMoves().includes(m)) return false;
    this.pendingPly = r.moves.length;
    this.send({ t: 'move', m, ply: r.moves.length });
    this.emit();
    return true;
  }

  undo() {
    this.send({ t: 'offer', kind: 'undo' });
  }
  redo() {}
  resign() {
    this.send({ t: 'resign' });
  }
  offerDraw() {
    this.send({ t: 'offer', kind: 'draw' });
  }
  claimDraw() {
    this.send({ t: 'claim' });
  }
  respondOffer(accept: boolean) {
    this.send({ t: 'respond', accept });
  }
  pause() {}
  resume() {}
  restart() {}
  explain(sq: string) {
    return this.mirror?.explainNoMove(sq) ?? null;
  }
  exportState(): AnyState | null {
    const r = this.room;
    if (!r) return null;
    if (r.final) return r.final;
    if (r.game === 'banqi') return null;
    return this.mirror?.serialize() ?? null;
  }
  currentRules() {
    return this.mirror ?? undefined!;
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    clearInterval(this.ping);
    this.ws?.close();
    this.listeners.clear();
  }
}

/** Wrap a determinized BanqiRules so that only rule queries (not hidden identities) are used. */
function fakeBanqiRules(g: ReturnType<typeof determinize>) {
  return {
    game: 'banqi',
    sideToMove: () => g.sideToMove(),
    legalMoves: () => g.legalMoves(),
    legalFrom: (sq: string) => g.legalMovesFrom(sq),
    play: () => null,
    result: () => null,
    claimableDraw: () => null,
    records: () => g.records,
    moveList: () => g.moves,
    serialize: () => {
      throw new Error('hidden');
    },
    lastMove: () => null,
    checkSquare: () => null,
    timeoutResult: () => ({ kind: 'draw', reason: 'timeout' }),
    explainNoMove: (sq: string) => g.explainNoMove(sq),
  };
}
