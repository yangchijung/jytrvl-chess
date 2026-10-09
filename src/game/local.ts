// Local game controller: vs AI, two players on one device, and AI practice.
import { newRules, restoreRules, truncateState, type AnyState, type Rules } from '../../shared/games/registry';
import type { GameResult, Seat } from '../../shared/types';
import type { GameController, LocalOptions, Snapshot, Offer } from './controller';
import { aiMove, banqiAiMove } from '../engines/ai';
import { visibleKey } from '../../shared/ai/banqi-ai';

export interface LocalSave {
  v: 1;
  options: LocalOptions;
  state: AnyState;
  redo: string[];
  clock: [number, number] | null;
  result: GameResult | null;
  savedAt: number;
}

export class LocalController implements GameController {
  private rules: Rules;
  private redoStack: string[] = [];
  private listeners = new Set<() => void>();
  private forcedResult: GameResult | null = null;
  private clockMs: [number, number] | null;
  private clockRunningSince: number | null = null;
  private paused = false;
  private thinking = false;
  private aiToken = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offer: Offer | null = null;
  private cached: Snapshot | null = null;

  constructor(
    public readonly opts: LocalOptions,
    save?: LocalSave,
  ) {
    if (save) {
      this.rules = restoreRules(save.state);
      this.redoStack = save.redo;
      this.clockMs = save.clock;
      this.forcedResult = save.result;
    } else {
      this.rules = newRules(opts.game, { banqiPreset: opts.banqiPreset });
      this.clockMs = opts.time.minutes > 0 ? [opts.time.minutes * 60000, opts.time.minutes * 60000] : null;
    }
    if (this.clockMs) this.timer = setInterval(() => this.tick(), 250);
    this.startClock();
    queueMicrotask(() => this.maybeAi());
  }

  private emit() {
    this.cached = null;
    this.listeners.forEach((f) => f());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  result(): GameResult | null {
    return this.forcedResult ?? this.rules.result();
  }

  private remaining(): [number, number] | null {
    if (!this.clockMs) return null;
    const ms: [number, number] = [...this.clockMs];
    if (this.clockRunningSince !== null) ms[this.rules.sideToMove()] -= performance.now() - this.clockRunningSince;
    return [Math.max(0, ms[0]), Math.max(0, ms[1])];
  }

  private startClock() {
    if (!this.clockMs || this.result() || this.paused) {
      this.clockRunningSince = null;
      return;
    }
    // clocks start after each side has made a first move? Keep it simple: start immediately.
    this.clockRunningSince = performance.now();
  }

  private stopClock(addIncrement: boolean) {
    if (!this.clockMs || this.clockRunningSince === null) return;
    const side = this.rules.sideToMove();
    this.clockMs[side] -= performance.now() - this.clockRunningSince;
    if (addIncrement) this.clockMs[side] += this.opts.time.incrementSec * 1000;
    this.clockRunningSince = null;
  }

  private tick() {
    if (!this.clockMs || this.result() || this.paused) return;
    const rem = this.remaining()!;
    const side = this.rules.sideToMove();
    if (rem[side] <= 0) {
      this.stopClock(false);
      this.clockMs[side] = 0;
      this.forcedResult = this.rules.timeoutResult(side);
      this.aiToken++;
      this.thinking = false;
    }
    this.emit();
  }

  snapshot(): Snapshot {
    if (this.cached) return this.cached;
    const r = this.rules;
    const res = this.result();
    const aiSeat = this.opts.aiSeat;
    const humanSeats: Seat[] = aiSeat === null ? [0, 1] : [aiSeat === 0 ? 1 : 0];
    const names = this.opts.playerNames;
    this.cached = {
      game: r.game,
      mode: this.opts.mode,
      position: r.position(),
      sideToMove: r.sideToMove(),
      mySeats: res ? [] : humanSeats,
      players: [
        { name: names[0], isAi: aiSeat === 0 },
        { name: names[1], isAi: aiSeat === 1 },
      ],
      records: [...r.records()],
      result: res,
      lastMove: r.lastMove(),
      checkSquare: r.checkSquare(),
      clock: { ms: this.remaining(), running: res || this.paused ? null : r.sideToMove(), paused: this.paused },
      canUndo: this.opts.allowUndo && r.moveList().length > 0 && !this.thinking,
      canRedo: this.opts.allowUndo && this.redoStack.length > 0 && !this.thinking,
      canPause: !res,
      claimable: r.claimableDraw()?.reason ?? null,
      thinking: this.thinking,
      offer: this.offer,
      coachAllowed: this.opts.coach || this.opts.mode === 'practice',
      rated: false,
    };
    return this.cached;
  }

  legalFrom(sq: string) {
    if (this.paused || this.thinking || this.result()) return [];
    const humanSeats = this.snapshot().mySeats;
    if (!humanSeats.includes(this.rules.sideToMove())) return [];
    return this.rules.legalFrom(sq);
  }

  private applyMove(m: string): boolean {
    this.stopClock(true);
    const rec = this.rules.play(m);
    if (!rec) {
      this.startClock();
      return false;
    }
    this.startClock();
    this.offer = null;
    return true;
  }

  move(m: string): boolean {
    if (this.paused || this.thinking || this.result()) return false;
    const humanSeats = this.snapshot().mySeats;
    if (!humanSeats.includes(this.rules.sideToMove())) return false;
    if (!this.applyMove(m)) return false;
    this.redoStack = [];
    this.emit();
    this.maybeAi();
    return true;
  }

  private async maybeAi() {
    const seat = this.opts.aiSeat;
    if (seat === null || this.result() || this.paused || this.rules.sideToMove() !== seat) return;
    const token = ++this.aiToken;
    this.thinking = true;
    this.emit();
    const started = performance.now();
    try {
      let mv: string;
      const pos = this.rules.position();
      if (pos.game === 'banqi') mv = await banqiAiMove(pos.view, seat, this.opts.level, this.banqiSeen());
      else mv = await aiMove(pos.game, pos.fen, this.rules.legalMoves(), this.opts.level);
      // small minimum delay so moves don't appear instantly (better for children)
      const wait = 350 - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (token !== this.aiToken || this.paused) return;
      this.thinking = false;
      if (!this.applyMove(mv)) {
        // should not happen — engine output is validated — fall back to the first legal move
        this.applyMove(this.rules.legalMoves()[0]);
      }
    } catch (e) {
      console.error('[JY] AI error', e);
      if (token !== this.aiToken) return;
      this.thinking = false;
      const legal = this.rules.legalMoves();
      if (legal.length) this.applyMove(legal[Math.floor(Math.random() * legal.length)]);
    }
    this.emit();
    // banqi chain captures keep the same side to move
    this.maybeAi();
  }

  private rebuild(n: number) {
    const st = truncateState(this.rules.serialize(), n);
    this.rules = restoreRules(st);
  }

  undo() {
    if (!this.opts.allowUndo || this.thinking) return;
    const moves = this.rules.moveList();
    if (!moves.length) return;
    this.aiToken++;
    this.forcedResult = null;
    const human = this.snapshot().mySeats.length ? this.snapshot().mySeats : this.opts.aiSeat === null ? [0, 1] : [this.opts.aiSeat === 0 ? 1 : 0];
    let n = moves.length;
    const records = this.rules.records();
    // remove moves until the last removed move was played by a human (vs AI: undo AI reply + own move)
    do {
      n--;
      this.redoStack.unshift(moves[n]);
    } while (n > 0 && this.opts.aiSeat !== null && !(human as Seat[]).includes(records[n].seat));
    this.rebuild(n);
    this.offer = null;
    this.startClock();
    this.emit();
    this.maybeAi();
  }

  redo() {
    if (!this.opts.allowUndo || this.thinking || !this.redoStack.length) return;
    const human = this.opts.aiSeat === null ? null : this.opts.aiSeat === 0 ? 1 : 0;
    // redo one human move plus the AI reply that followed it
    do {
      const m = this.redoStack.shift()!;
      if (!this.applyMove(m)) {
        this.redoStack = [];
        break;
      }
    } while (this.redoStack.length && human !== null && this.rules.sideToMove() !== human);
    this.emit();
    this.maybeAi();
  }

  resign() {
    if (this.result()) return;
    const side = this.opts.aiSeat === null ? this.rules.sideToMove() : ((this.opts.aiSeat === 0 ? 1 : 0) as Seat);
    this.stopClock(false);
    this.forcedResult = { kind: 'win', winner: side === 0 ? 1 : 0, reason: 'resign' };
    this.aiToken++;
    this.thinking = false;
    this.emit();
  }

  offerDraw() {
    if (this.result()) return;
    if (this.opts.aiSeat !== null) {
      // The computer accepts a draw only if it is not clearly winning: simple material heuristic not
      // available for all games, so the AI accepts in long, balanced games (move count ≥ 60) only.
      if (this.rules.moveList().length >= 60) {
        this.stopClock(false);
        this.forcedResult = { kind: 'draw', reason: 'agreement' };
      } else {
        this.offer = { kind: 'draw', from: this.opts.aiSeat === 0 ? 1 : 0 };
        setTimeout(() => {
          this.offer = null;
          this.emit();
        }, 1500);
      }
    } else {
      this.offer = { kind: 'draw', from: this.rules.sideToMove() };
    }
    this.emit();
  }

  respondOffer(accept: boolean) {
    if (!this.offer) return;
    if (accept && this.offer.kind === 'draw') {
      this.stopClock(false);
      this.forcedResult = { kind: 'draw', reason: 'agreement' };
    }
    this.offer = null;
    this.emit();
  }

  claimDraw() {
    const c = this.rules.claimableDraw();
    if (!c || this.result()) return;
    this.stopClock(false);
    this.forcedResult = { kind: 'draw', reason: c.reason };
    this.aiToken++;
    this.thinking = false;
    this.emit();
  }

  pause() {
    if (this.paused || this.result()) return;
    this.stopClock(false);
    this.paused = true;
    this.aiToken++;
    this.thinking = false;
    this.emit();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.startClock();
    this.emit();
    this.maybeAi();
  }

  restart() {
    this.aiToken++;
    this.thinking = false;
    this.rules = newRules(this.opts.game, { banqiPreset: this.opts.banqiPreset });
    this.redoStack = [];
    this.forcedResult = null;
    this.paused = false;
    this.offer = null;
    this.clockMs = this.opts.time.minutes > 0 ? [this.opts.time.minutes * 60000, this.opts.time.minutes * 60000] : null;
    this.startClock();
    this.emit();
    this.maybeAi();
  }

  explain(sq: string) {
    return this.rules.explainNoMove(sq);
  }

  /** Visible positions of this banqi game so far (public information only). */
  private banqiSeen(): string[] {
    const st = this.rules.serialize();
    const out: string[] = [];
    for (let n = 0; n <= st.state.moves.length; n++) {
      const p = restoreRules(truncateState(st, n)).position();
      if (p.game === 'banqi') out.push(visibleKey(p.view));
    }
    return out;
  }

  /** Current rules object (read-only use by the coach). */
  currentRules(): Rules {
    return this.rules;
  }

  exportState() {
    return this.rules.serialize();
  }

  save(): LocalSave {
    return {
      v: 1,
      options: this.opts,
      state: this.rules.serialize(),
      redo: this.redoStack,
      clock: this.remaining(),
      result: this.forcedResult,
      savedAt: Date.now(),
    };
  }

  dispose() {
    this.aiToken++;
    if (this.timer) clearInterval(this.timer);
    this.listeners.clear();
  }
}
