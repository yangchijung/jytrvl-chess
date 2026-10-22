// Territory Rush — continuous steering (T1 local preview, docs/product/TERRITORY_POINTER_V1.md).
//
// Same board, land, trail, capture and end rules as TerritoryGame; only movement changes:
//  * Each player has a continuous position (cell units, cell centres at i + 0.5), a heading and a target
//    heading. Every fixed step (STEP_MS) the heading turns towards the target by at most TURN radians along
//    the shorter side, then the player moves SPEED cells along it — the same speed in every direction
//    (diagonals are not faster) and the same result at any display frame rate.
//  * The move is swept: every cell the segment passes is visited in order (4-connected, so a diagonal move
//    never slips between two trail cells and captures never leak through corners).
//  * Entering a trail cell kills its owner (your own trail kills you), except your PROTECT newest trail
//    cells: a sharp turn can graze the cell just left. Leaving the map kills. Heads closer than HEAD_HIT:
//    a player inside its own land (no trail) survives, players outside both die.
//  * Coming home with a trail captures the trail and everything it encloses (TerritoryGame.capture).
//
// Inputs are target headings only (validated, finite); positions and scores are never taken from input.
import { DIRS, TerritoryGame, type Dir, type TPlayer, type TerritorySnapshot } from './engine';

export const STEP_MS = 50; // fixed simulation step (20 per second)
export const SPEED = 0.5; // cells per step = 10 cells per second, as before
export const TURN = (270 * Math.PI) / 180 / (1000 / STEP_MS); // 270°/s → 13.5° per step
export const PROTECT = 3; // newest own trail cells that a tight turn may touch
export const HEAD_HIT = 0.9; // cells
const SUB = 5; // sub-samples per step for the sweep

export interface FlowState {
  fx: number;
  fy: number;
  heading: number;
  target: number;
  /** trail polyline for drawing (positions since leaving land) */
  path: [number, number][];
}

export const wrapAngle = (a: number) => {
  let r = (a + Math.PI) % (2 * Math.PI);
  if (r <= 0) r += 2 * Math.PI;
  return r - Math.PI; // (-π, π]
};
export const dirAngle = (d: Dir) => Math.atan2(DIRS[d][1], DIRS[d][0]);
/** Nearest of the four directions (for bots and the minimap, which read p.dir). */
export const nearestDir = (a: number): Dir => (((Math.round(a / (Math.PI / 2)) % 4) + 4 + 1) % 4) as Dir;

/** Network form of one player's continuous state (T3): position, heading, target and the drawn trail line. */
export interface FlowPublic {
  fx: number;
  fy: number;
  h: number;
  t: number;
  path: [number, number][];
}
/** Numbers per player in a tick's `fl` array: fx, fy, heading, target (×FL_SCALE, integers). */
export const FL_FIELDS = 4;
export const FL_SCALE = 1000;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class FlowGame extends TerritoryGame {
  flow: FlowState[] = [];

  /** Snapshot plus every player's continuous state (reconnects and late joiners see the same curves). */
  flowPublic(): FlowPublic[] {
    return this.flow.map((f) => ({ fx: r3(f.fx), fy: r3(f.fy), h: r3(f.heading), t: r3(f.target), path: f.path.map(([x, y]) => [r3(x), r3(y)] as [number, number]) }));
  }
  /** Compact per-tick continuous state: [fx, fy, heading, target] × FL_SCALE per player. */
  flowTick(): number[] {
    const out: number[] = [];
    for (const f of this.flow) out.push(Math.round(f.fx * FL_SCALE), Math.round(f.fy * FL_SCALE), Math.round(f.heading * FL_SCALE), Math.round(f.target * FL_SCALE));
    return out;
  }
  static fromFlowSnapshot(s: TerritorySnapshot, flow: FlowPublic[]): FlowGame {
    const g = TerritoryGame.fromSnapshot(s, (cfg) => new FlowGame(cfg));
    g.flow = g.players.map((p, k) => {
      const f = flow[k];
      if (f && [f.fx, f.fy, f.h, f.t].every(Number.isFinite)) return { fx: f.fx, fy: f.fy, heading: f.h, target: f.t, path: Array.isArray(f.path) ? f.path.slice() : [] };
      const a = dirAngle(p.dir);
      return { fx: p.x + 0.5, fy: p.y + 0.5, heading: a, target: a, path: [] };
    });
    return g;
  }
  /**
   * Mirror one server tick on a client copy (positions only; land and trail cells arrive separately).
   * The drawn line grows while the player is out and resets when it is home or dead.
   */
  applyFlowTick(fl: number[]) {
    this.flow.forEach((f, k) => {
      const o = k * FL_FIELDS;
      if (o + 3 >= fl.length) return;
      f.fx = fl[o] / FL_SCALE;
      f.fy = fl[o + 1] / FL_SCALE;
      f.heading = fl[o + 2] / FL_SCALE;
      f.target = fl[o + 3] / FL_SCALE;
      const p = this.players[k];
      if (p?.alive && p.trail.length) {
        if (!f.path.length) f.path.push([f.fx, f.fy]);
        f.path.push([f.fx, f.fy]);
      } else f.path = [];
    });
  }

  start() {
    super.start();
    this.flow = this.players.map((p) => {
      const a = dirAngle(p.dir);
      return { fx: p.x + 0.5, fy: p.y + 0.5, heading: a, target: a, path: [] };
    });
  }

  /** Cardinal input (keyboard, bots): the target becomes that direction. */
  steer(playerIdx: number, d: Dir): boolean {
    if (d < 0 || d > 3) return false;
    return this.setTarget(playerIdx, dirAngle(d));
  }

  /** Pointer input: any angle (radians, screen coordinates: 0 = right, π/2 = down). */
  setTarget(playerIdx: number, angle: number): boolean {
    const p = this.players[playerIdx];
    const f = this.flow[playerIdx];
    if (!p || !f || !p.alive || this.result || typeof angle !== 'number' || !Number.isFinite(angle)) return false;
    f.target = wrapAngle(angle);
    return true;
  }

  /** Cells touched moving from (x0,y0) to (x1,y1), in order, 4-connected, excluding the start cell. */
  private sweep(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const out: [number, number][] = [];
    let cx = Math.floor(x0),
      cy = Math.floor(y0);
    for (let k = 1; k <= SUB; k++) {
      const x = x0 + ((x1 - x0) * k) / SUB,
        y = y0 + ((y1 - y0) * k) / SUB;
      const nx = Math.floor(x),
        ny = Math.floor(y);
      if (nx === cx && ny === cy) continue;
      if (nx !== cx && ny !== cy) {
        // crossed a corner: visit the side cell the segment actually passes first
        const tx = (x1 - x0 !== 0 ? ((nx > cx ? cx + 1 : cx) - x0) / (x1 - x0) : Infinity);
        const ty = (y1 - y0 !== 0 ? ((ny > cy ? cy + 1 : cy) - y0) / (y1 - y0) : Infinity);
        out.push(tx < ty ? [nx, cy] : [cx, ny]);
      }
      out.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    return out;
  }

  step(): void {
    this.ownerChanges = [];
    this.trailChanges = [];
    this.events = [];
    if (!this.started || this.result) return;
    this.tick++;
    const movers = this.alivePlayers();
    for (const p of movers) {
      if (!p.alive) continue; // killed earlier this step
      const f = this.flow[p.idx];
      const diff = wrapAngle(f.target - f.heading);
      f.heading = wrapAngle(f.heading + Math.max(-TURN, Math.min(TURN, diff)));
      const x1 = f.fx + Math.cos(f.heading) * SPEED,
        y1 = f.fy + Math.sin(f.heading) * SPEED;
      for (const [cx, cy] of this.sweep(f.fx, f.fy, x1, y1)) {
        if (!this.enter(p, cx, cy)) break;
      }
      if (!p.alive) continue;
      f.fx = x1;
      f.fy = y1;
      p.x = Math.floor(x1);
      p.y = Math.floor(y1);
      p.dir = nearestDir(f.heading);
      if (p.trail.length) f.path.push([x1, y1]);
      else f.path = [];
    }
    // heads meeting
    const alive = this.alivePlayers();
    for (let a = 0; a < alive.length; a++)
      for (let b = a + 1; b < alive.length; b++) {
        const pa = alive[a],
          pb = alive[b];
        const fa = this.flow[pa.idx],
          fb = this.flow[pb.idx];
        if (Math.hypot(fa.fx - fb.fx, fa.fy - fb.fy) >= HEAD_HIT) continue;
        const aSafe = pa.trail.length === 0,
          bSafe = pb.trail.length === 0;
        if (aSafe && !bSafe) this.kill(pb, 'collision', pa.idx);
        else if (bSafe && !aSafe) this.kill(pa, 'collision', pb.idx);
        else if (!aSafe && !bSafe) {
          this.kill(pa, 'collision', pb.idx);
          this.kill(pb, 'collision', pa.idx);
        }
      }
    for (const p of this.players)
      if (!p.alive && p.diedAt === this.tick) {
        this.clearPlayer(p);
        this.flow[p.idx].path = [];
      }
    for (const p of this.players) if (p.land > p.bestLand) p.bestLand = p.land;
    this.checkEnd();
  }

  /** One cell entered by p's head. Returns false when p stops (died). */
  private enter(p: TPlayer, cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) {
      this.kill(p, 'wall', null);
      return false;
    }
    const c = this.idx(cx, cy);
    const t = this.trail[c];
    if (t >= 0) {
      if (t === p.idx) {
        if (!p.trail.slice(-PROTECT).includes(c)) {
          this.kill(p, 'self', null);
          return false;
        }
      } else if (this.players[t].alive) this.kill(this.players[t], 'cut', p.idx);
    }
    if (this.owner[c] === p.idx) {
      if (p.trail.length) {
        this.capture(p);
        this.flow[p.idx].path = [];
      }
    } else if (this.trail[c] !== p.idx) {
      if (!p.trail.length) {
        const f = this.flow[p.idx];
        f.path = [[f.fx, f.fy]]; // the line starts where the player left its land
      }
      p.trail.push(c);
      this.setTrail(c, p.idx);
    }
    return true;
  }
}

/** A turn counts once the heading has changed by more than this since the last counted turn (tutorial, T2). */
export const BIG_TURN = (70 * Math.PI) / 180;
/** Counts big turns from a stream of headings (tiny per-frame changes never add up to a turn by themselves). */
export function turnCounter(start: number) {
  let ref = start;
  return (heading: number) => {
    if (Math.abs(wrapAngle(heading - ref)) < BIG_TURN) return false;
    ref = heading;
    return true;
  };
}
