// Online Snake Arena client: mirrors the authoritative SnakeRoom. Only turn input is sent.
// Bodies are rebuilt from per-step head/length deltas; rendering interpolates between steps.
import { SnakeGame, type Dir } from '../../shared/snake/engine';
import { SNAKE_FIELDS, type ArenaServerMsg } from '../../realtime/src/arena/protocol';
import { ArenaSocket } from '../arena/socket';
import { SnakeClient } from './client';

export class OnlineSnake extends SnakeClient {
  readonly sock: ArenaSocket;
  recorded = false;
  private lastSent: Dir | null = null;

  constructor(path: string, name: string) {
    super();
    this.stepMs = 100;
    this.sock = new ArenaSocket(path, name, (m) => this.onMessage(m), () => this.emit());
  }

  private onMessage(m: ArenaServerMsg) {
    const now = performance.now();
    switch (m.t) {
      case 'lobby':
        if (m.status === 'lobby') {
          this.status = 'lobby';
          this.game = null;
          this.end = null;
        } else if (m.status === 'playing' && this.status === 'countdown') {
          this.status = 'playing';
          this.lastStepAt = now;
        }
        this.me = m.mySeat !== null ? [m.mySeat] : [];
        break;
      case 'ssnap': {
        const g = SnakeGame.fromSnapshot(m.snap as ReturnType<SnakeGame['snapshot']>);
        this.game = g;
        this.colors = g.snakes.map((s) => s.color);
        this.prevHead = g.snakes.map((s) => s.body[0] ?? -1);
        this.prevTail = g.snakes.map(() => -1);
        this.me = m.mySeat !== null ? [m.mySeat] : [];
        this.status = m.status === 'lobby' ? 'lobby' : m.status;
        this.countdownEnd = now + m.countdownMs;
        this.lastStepAt = now;
        break;
      }
      case 'sstep': {
        const g = this.game;
        if (!g) return;
        if (this.status === 'countdown') this.status = 'playing';
        this.beforeStep(g);
        g.step_ = m.n;
        g.snakes.forEach((s, k) => {
          const o = k * SNAKE_FIELDS;
          const alive = m.sn[o] === 1;
          const head = m.sn[o + 1];
          const len = m.sn[o + 2];
          if (!alive) {
            for (const c of s.body) if (g.occ[c] === k) g.occ[c] = -1;
            s.body = [];
            s.alive = false;
          } else {
            if (s.body[0] !== head) {
              s.body.unshift(head);
              g.occ[head] = k;
            }
            while (s.body.length > len) {
              const c = s.body.pop()!;
              if (g.occ[c] === k) g.occ[c] = -1;
            }
          }
          s.dir = m.sn[o + 3] as Dir;
          s.score = m.sn[o + 4];
          s.kills = m.sn[o + 5];
          s.maxLen = Math.max(s.maxLen, s.body.length);
        });
        for (let i = 0; i < m.fa.length; i += 2) g.food.set(m.fa[i], m.fa[i + 1]);
        for (const c of m.fr) g.food.delete(c);
        for (const ev of m.ev) if (ev.type === 'death') g.snakes[ev.snake].reason = ev.reason;
        this.afterStep(now, m.ev);
        this.lastSent = null;
        break;
      }
      case 'end':
        if (this.game && m.result) this.game.result = m.result;
        if (m.result) this.end = { result: m.result, saved: m.recorded };
        this.recorded = m.recorded;
        this.status = 'ended';
        break;
      default:
        return;
    }
    this.emit();
  }

  steer(_slot: number, d: Dir) {
    if (this.status !== 'playing' && this.status !== 'countdown') return;
    const g = this.game;
    const me = this.me[0];
    if (!g || me === undefined || !g.snakes[me]?.alive) return;
    const cur = this.lastSent ?? g.snakes[me].dir;
    if (d === cur || (d + 2) % 4 === cur) return;
    this.lastSent = d;
    this.sock.send({ t: 'dir', d });
  }

  update() {
    /* server-driven */
  }
  dispose() {
    this.sock.dispose();
  }
}
