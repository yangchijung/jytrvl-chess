import { describe, it, expect } from 'vitest';
import { BlocksGame, W, H, PIECES, ACTIONS, replay, cells, TPS, LOCK_DELAY, type Action, type PieceType, type InputRecord } from '../shared/blocks/engine';
import { BlocksBot, placements } from '../shared/blocks/ai';
import { rng } from '../shared/blocks/engine';

const fill = (g: BlocksGame, rows: string[]) => {
  // rows given bottom-up-aligned: last string = bottom row; '#' = filled
  g.board.fill(0);
  rows.forEach((r, i) => {
    const y = H - rows.length + i;
    for (let x = 0; x < W; x++) if (r[x] === '#') g.board[y * W + x] = 8;
  });
};
const setPiece = (g: BlocksGame, type: PieceType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
  g.piece = { type, x, y, rot };
};

describe('blocks — randomizer', () => {
  it('7-bag: every 7 pieces contain each type exactly once', () => {
    const g = new BlocksGame({ seed: 42, mode: 'marathon' });
    const seq: PieceType[] = [g.piece!.type];
    while (seq.length < 70) {
      g.input('HD');
      if (g.status !== 'playing') break;
      seq.push(g.piece!.type);
      g.board.fill(0); // keep the board empty
    }
    for (let i = 0; i + 7 <= seq.length; i += 7) expect(new Set(seq.slice(i, i + 7)).size).toBe(7);
  });
  it('same seed gives the same sequence', () => {
    const a = new BlocksGame({ seed: 7, mode: 'marathon' });
    const b = new BlocksGame({ seed: 7, mode: 'marathon' });
    expect([a.piece!.type, ...a.queue]).toEqual([b.piece!.type, ...b.queue]);
  });
});

describe('blocks — movement and rotation', () => {
  it('spawns inside the hidden rows and shows 5 next pieces', () => {
    const g = new BlocksGame({ seed: 1, mode: 'marathon' });
    expect(g.piece!.y).toBe(1);
    expect(g.queue.length).toBe(5);
  });
  it('moves left/right until walls', () => {
    const g = new BlocksGame({ seed: 1, mode: 'marathon' });
    setPiece(g, 'O', 3, 5);
    for (let i = 0; i < 10; i++) g.input('L');
    expect(g.piece!.x).toBe(-1); // O occupies box columns 1–2
    for (let i = 0; i < 20; i++) g.input('R');
    expect(g.piece!.x + 2).toBe(W - 1);
  });
  it('SRS: I piece kicks off the right wall', () => {
    const g = new BlocksGame({ seed: 1, mode: 'marathon' });
    setPiece(g, 'I', 6, 5, 1); // vertical at column 8
    g.input('R'); // column 9
    expect(g.piece!.x).toBe(7);
    expect(g.input('CCW')).toBe(true); // R -> 0 needs a kick to stay inside
    for (const [cx] of cells('I', g.piece!.rot)) expect(g.piece!.x + cx).toBeLessThan(W);
  });
  it('T-spin double is detected and scored (TSD = 1200 × level)', () => {
    const g = new BlocksGame({ seed: 1, mode: 'marathon' });
    // TSD slot: overhang at column 3, slot cols 3–5 on row H-2, hole col 4 on row H-1
    fill(g, ['...#......', '###...####', '####.#####']);
    g.piece = { type: 'T', rot: 1, x: 3, y: H - 3 };
    const before = g.score;
    expect(g.input('CW')).toBe(true); // rotate into the slot (pointing down)
    g.input('HD');
    const clear = g.drainEvents().find((e) => e.type === 'clear');
    expect(clear && clear.type === 'clear' && clear.info.tspin).toBe('full');
    expect(clear && clear.type === 'clear' && clear.info.lines).toBe(2);
    expect(g.score - before).toBeGreaterThanOrEqual(1200);
  });
});

describe('blocks — locking, clearing, scoring', () => {
  it('hard drop locks immediately and scores 2 per row', () => {
    const g = new BlocksGame({ seed: 3, mode: 'marathon' });
    const y0 = g.piece!.y;
    const ghost = g.ghostY();
    g.input('HD');
    expect(g.score).toBe((ghost - y0) * 2);
    expect(g.pieces).toBe(1);
  });
  it('lock delay: a grounded piece locks after 0.5 s', () => {
    const g = new BlocksGame({ seed: 3, mode: 'marathon' });
    const p = g.piece!;
    p.y = g.ghostY();
    for (let i = 0; i < LOCK_DELAY - 1; i++) g.step();
    expect(g.pieces).toBe(0);
    g.step();
    expect(g.pieces).toBe(1);
  });
  it('move resets are capped at 15', () => {
    const g = new BlocksGame({ seed: 3, mode: 'marathon' });
    setPiece(g, 'O', 3, 0);
    g.piece!.y = g.ghostY();
    let ticks = 0;
    while (g.pieces === 0 && ticks < 1000) {
      g.input(ticks % 2 ? 'L' : 'R');
      g.step();
      ticks++;
    }
    expect(ticks).toBeLessThan(40);
  });
  it('single, double, triple and quad scores (level 1) and line counting', () => {
    const scores: number[] = [];
    for (const n of [1, 2, 3, 4]) {
      const g = new BlocksGame({ seed: 5, mode: 'marathon' });
      const rows = [...Array.from({ length: n }, () => '#########.'), '#.########'];
      fill(g, rows);
      setPiece(g, 'I', 7, 0, 1); // vertical I at column 9
      const s0 = g.score;
      g.input('HD');
      const drop = g.score - s0;
      const ev = g.drainEvents().find((e) => e.type === 'clear');
      scores.push(ev && ev.type === 'clear' ? ev.info.points : 0);
      expect(g.lines).toBe(n);
      expect(drop).toBeGreaterThan(0);
    }
    expect(scores).toEqual([100, 300, 500, 800]);
  });
  it('back-to-back quad gets ×1.5 and combo adds 50 × combo', () => {
    const g = new BlocksGame({ seed: 5, mode: 'marathon' });
    fill(g, Array.from({ length: 8 }, () => '#########.'));
    setPiece(g, 'I', 7, 0, 1);
    g.input('HD');
    g.drainEvents();
    setPiece(g, 'I', 7, 0, 1);
    g.input('HD');
    const ev = g.drainEvents().find((e) => e.type === 'clear');
    expect(ev && ev.type === 'clear' && ev.info.b2b).toBe(true);
    // 800 × 1.5 = 1200, plus combo 1 × 50; this also clears the board → perfect clear bonus
    expect(ev && ev.type === 'clear' && ev.info.perfect).toBe(true);
    expect(ev && ev.type === 'clear' && ev.info.points).toBe(1200 + 50 + 2000 * 2);
  });
  it('hold swaps once per piece', () => {
    const g = new BlocksGame({ seed: 9, mode: 'marathon' });
    const first = g.piece!.type;
    const next = g.queue[0];
    expect(g.input('HOLD')).toBe(true);
    expect(g.hold).toBe(first);
    expect(g.piece!.type).toBe(next);
    expect(g.input('HOLD')).toBe(false);
    g.input('HD');
    expect(g.input('HOLD')).toBe(true);
    expect(g.piece!.type).toBe(first);
  });
  it('level rises every 10 lines in marathon; sprint ends at 40 lines', () => {
    const g = new BlocksGame({ seed: 5, mode: 'marathon' });
    for (let k = 0; k < 3; k++) {
      fill(g, Array.from({ length: 4 }, () => '#########.'));
      setPiece(g, 'I', 7, 0, 1);
      g.input('HD');
    }
    expect(g.lines).toBe(12);
    expect(g.level).toBe(2);
    const s = new BlocksGame({ seed: 5, mode: 'sprint' });
    for (let k = 0; k < 10 && s.status === 'playing'; k++) {
      fill(s, Array.from({ length: 4 }, () => '#########.'));
      setPiece(s, 'I', 7, 0, 1);
      s.input('HD');
    }
    expect(s.status).toBe('over');
    expect(s.result).toBe('goal');
    expect(s.level).toBe(1);
  });
  it('ultra ends after 2 minutes', () => {
    const g = new BlocksGame({ seed: 5, mode: 'ultra' });
    g.board.fill(0);
    for (let i = 0; i < 120 * TPS + 5 && g.status === 'playing'; i++) {
      g.step();
      if (g.board.some((v, idx) => v && idx < 12 * W)) g.board.fill(0); // keep from topping out
    }
    expect(g.result).toBe('time');
    expect(g.tick).toBe(120 * TPS);
  });
  it('tops out when a new piece cannot spawn', () => {
    const g = new BlocksGame({ seed: 5, mode: 'marathon' });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x !== 0) g.board[y * W + x] = 8;
    g.board.fill(0, 0, 2 * W);
    for (let i = 0; i < 5 && g.status === 'playing'; i++) g.input('HD');
    expect(g.status).toBe('over');
    expect(g.result).toBe('topout');
  });
});

describe('blocks — versus garbage', () => {
  it('attack cancels pending garbage before it rises', () => {
    const g = new BlocksGame({ seed: 5, mode: 'versus' });
    g.addGarbage(3, 0);
    fill(g, [...Array.from({ length: 4 }, () => '#########.'), '#.########']);
    setPiece(g, 'I', 7, 0, 1);
    g.input('HD'); // quad = 4 attack, cancels 3, sends 1
    expect(g.pendingGarbageLines()).toBe(0);
    expect(g.lastAttack).toBe(1);
  });
  it('garbage rises on a non-clearing lock with one hole per batch', () => {
    const g = new BlocksGame({ seed: 5, mode: 'versus' });
    g.board.fill(0);
    g.addGarbage(2, 4);
    setPiece(g, 'O', 0, 0);
    g.input('HD');
    for (const y of [H - 1, H - 2]) {
      for (let x = 0; x < W; x++) expect(g.board[y * W + x] === 0).toBe(x === 4);
    }
    expect(g.stats.garbageReceived).toBe(2);
  });
});

describe('blocks — determinism and replay', () => {
  it('snapshot round-trip continues identically', () => {
    const a = new BlocksGame({ seed: 77, mode: 'marathon' });
    const bot = new BlocksBot('medium', rng(1));
    for (let t = 0; t < 600; t++) {
      for (const x of bot.update(a)) a.input(x);
      a.step();
    }
    const b = BlocksGame.fromSnapshot(JSON.parse(JSON.stringify(a.snapshot())));
    const acts: Action[] = ['L', 'CW', 'HD', 'R', 'R', 'HOLD', 'HD', 'CCW', 'HD'];
    for (const x of acts) {
      a.input(x);
      b.input(x);
      for (let i = 0; i < 20; i++) {
        a.step();
        b.step();
      }
    }
    expect(b.hash()).toBe(a.hash());
  });
  it('server replay reproduces a recorded game exactly', () => {
    const cfg = { seed: 2024, mode: 'sprint' as const };
    const g = new BlocksGame(cfg);
    const bot = new BlocksBot('hard', rng(3));
    const log: InputRecord[] = [];
    while (g.status === 'playing' && g.tick < 60 * TPS * 5) {
      for (const x of bot.update(g)) {
        log.push([g.tick, ACTIONS.indexOf(x)]);
        g.input(x);
      }
      g.step();
    }
    const r = replay(cfg, log, g.tick + 1);
    expect(r.score).toBe(g.score);
    expect(r.lines).toBe(g.lines);
    expect(r.hash()).toBe(g.hash());
    // tampering with the log changes the outcome
    const bad = log.slice(0, -5);
    expect(replay(cfg, bad, g.tick + 1).hash()).not.toBe(g.hash());
  });
});

describe('blocks — AI', () => {
  it('placement enumeration covers every column for each rotation', () => {
    const b = new Uint8Array(W * H);
    for (const t of PIECES) {
      const ps = placements(b, t, 3, 1, 0);
      expect(ps.length).toBeGreaterThanOrEqual(t === 'O' ? 9 : 17);
    }
  });
  it('hard AI clears lines and survives 300 pieces in marathon', () => {
    const g = new BlocksGame({ seed: 11, mode: 'marathon' });
    const bot = new BlocksBot('hard', rng(5));
    while (g.status === 'playing' && g.pieces < 300) {
      for (const x of bot.update(g)) g.input(x);
      g.step();
    }
    expect(g.status).toBe('playing');
    expect(g.lines).toBeGreaterThan(100);
  });
});
