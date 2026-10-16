// Robot Delivery Lab — rules engine (sequence stage). Pure and deterministic.
// Coordinates: (0,0) top-left, x right, y down. A program is a list of blocks run in order.
// Success = every parcel dropped on the door of its colour. Reaching a door without delivering is not success.

export type Dir = 'N' | 'E' | 'S' | 'W';
export type Block = 'forward' | 'left' | 'right' | 'pick' | 'drop';
export type Color = 'blue' | 'red' | 'yellow';
export const BLOCKS: Block[] = ['forward', 'left', 'right', 'pick', 'drop'];
export const COLORS: Color[] = ['blue', 'red', 'yellow'];

export interface Level {
  id: string;
  w: number;
  h: number;
  start: { x: number; y: number; dir: Dir };
  walls: [number, number][];
  parcels: { color: Color; x: number; y: number }[];
  doors: { color: Color; x: number; y: number }[];
  blocks: Block[];
  maxBlocks: number;
  hint?: { zh: string; en: string };
}

export interface Robot {
  x: number;
  y: number;
  dir: Dir;
  carrying: Color | null;
}

export type StepEvent = 'move' | 'turn' | 'pick' | 'drop' | 'bump' | 'nothing_to_pick' | 'hands_full' | 'not_carrying' | 'wrong_door';
export interface Step {
  /** index of the block in the program */
  pc: number;
  block: Block;
  event: StepEvent;
  robot: Robot;
  /** parcels still on the floor and parcels delivered, after this step */
  floor: Level['parcels'];
  delivered: Color[];
}
export interface RunResult {
  steps: Step[];
  outcome: 'success' | 'incomplete' | 'error';
  /** step index (0-based) of the error */
  errorAt: number | null;
  error: StepEvent | null;
}

const DX: Record<Dir, number> = { N: 0, E: 1, S: 0, W: -1 };
const DY: Record<Dir, number> = { N: -1, E: 0, S: 1, W: 0 };
const ORDER: Dir[] = ['N', 'E', 'S', 'W'];
export const turn = (d: Dir, side: 'left' | 'right'): Dir => ORDER[(ORDER.indexOf(d) + (side === 'right' ? 1 : 3)) % 4];
const ERRORS: StepEvent[] = ['bump', 'nothing_to_pick', 'hands_full', 'not_carrying', 'wrong_door'];

export function blocked(lv: Level, x: number, y: number): boolean {
  return x < 0 || y < 0 || x >= lv.w || y >= lv.h || lv.walls.some(([wx, wy]) => wx === x && wy === y);
}

/** Runs a program; stops at the first error (the robot does not move into walls). */
export function run(lv: Level, program: Block[]): RunResult {
  let r: Robot = { ...lv.start, carrying: null };
  let floor = lv.parcels.map((p) => ({ ...p }));
  let delivered: Color[] = [];
  const steps: Step[] = [];
  for (let pc = 0; pc < program.length; pc++) {
    const b = program[pc];
    let ev: StepEvent;
    if (b === 'forward') {
      const nx = r.x + DX[r.dir],
        ny = r.y + DY[r.dir];
      if (blocked(lv, nx, ny)) ev = 'bump';
      else {
        r = { ...r, x: nx, y: ny };
        ev = 'move';
      }
    } else if (b === 'left' || b === 'right') {
      r = { ...r, dir: turn(r.dir, b) };
      ev = 'turn';
    } else if (b === 'pick') {
      const i = floor.findIndex((p) => p.x === r.x && p.y === r.y);
      if (r.carrying) ev = 'hands_full';
      else if (i < 0) ev = 'nothing_to_pick';
      else {
        r = { ...r, carrying: floor[i].color };
        floor = floor.filter((_, k) => k !== i);
        ev = 'pick';
      }
    } else {
      const door = lv.doors.find((d) => d.x === r.x && d.y === r.y);
      if (!r.carrying) ev = 'not_carrying';
      else if (!door || door.color !== r.carrying) ev = 'wrong_door';
      else {
        delivered = [...delivered, r.carrying];
        r = { ...r, carrying: null };
        ev = 'drop';
      }
    }
    steps.push({ pc, block: b, event: ev, robot: r, floor, delivered });
    if (ERRORS.includes(ev)) return { steps, outcome: 'error', errorAt: pc, error: ev };
  }
  const done = floor.length === 0 && r.carrying === null && delivered.length === lv.parcels.length;
  return { steps, outcome: done ? 'success' : 'incomplete', errorAt: null, error: null };
}

/** Shortest solving program (breadth-first search over robot states), or null when none fits maxBlocks. */
export function solve(lv: Level): Block[] | null {
  type Node = { r: Robot; floor: number; prog: Block[] };
  const key = (n: Node) => `${n.r.x},${n.r.y},${n.r.dir},${n.r.carrying ?? '-'},${n.floor}`;
  const all = (1 << lv.parcels.length) - 1; // bit set = parcel still on the floor
  const start: Node = { r: { ...lv.start, carrying: null }, floor: all, prog: [] };
  const seen = new Set([key(start)]);
  let q = [start];
  while (q.length) {
    const next: Node[] = [];
    for (const n of q) {
      if (n.prog.length >= lv.maxBlocks) continue;
      for (const b of lv.blocks) {
        let r = { ...n.r };
        let floor = n.floor;
        let ok = true;
        if (b === 'forward') {
          const nx = r.x + DX[r.dir],
            ny = r.y + DY[r.dir];
          if (blocked(lv, nx, ny)) ok = false;
          else r = { ...r, x: nx, y: ny };
        } else if (b === 'left' || b === 'right') r = { ...r, dir: turn(r.dir, b) };
        else if (b === 'pick') {
          const i = lv.parcels.findIndex((p, k) => floor & (1 << k) && p.x === r.x && p.y === r.y);
          if (r.carrying || i < 0) ok = false;
          else {
            r = { ...r, carrying: lv.parcels[i].color };
            floor &= ~(1 << i);
          }
        } else {
          const door = lv.doors.find((d) => d.x === r.x && d.y === r.y);
          if (!r.carrying || !door || door.color !== r.carrying) ok = false;
          else r = { ...r, carrying: null };
        }
        if (!ok) continue;
        const nn: Node = { r, floor, prog: [...n.prog, b] };
        if (floor === 0 && r.carrying === null) return nn.prog;
        const k = key(nn);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(nn);
      }
    }
    q = next;
  }
  return null;
}

/** Shape check for authored levels (JSON from the product side). */
export function validLevel(x: unknown): x is Level {
  const l = x as Level;
  const inside = (a: number, b: number) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < l.w && b < l.h;
  return (
    !!l &&
    typeof l.id === 'string' &&
    Number.isInteger(l.w) &&
    Number.isInteger(l.h) &&
    l.w >= 2 &&
    l.h >= 2 &&
    l.w <= 10 &&
    l.h <= 10 &&
    inside(l.start?.x, l.start?.y) &&
    ORDER.includes(l.start.dir) &&
    Array.isArray(l.walls) &&
    l.walls.every(([a, b]) => inside(a, b) && !(a === l.start.x && b === l.start.y)) &&
    Array.isArray(l.parcels) &&
    l.parcels.length >= 1 &&
    l.parcels.every((p) => COLORS.includes(p.color) && inside(p.x, p.y) && !blocked(l, p.x, p.y)) &&
    Array.isArray(l.doors) &&
    l.parcels.every((p) => l.doors.some((d) => d.color === p.color)) &&
    l.doors.every((d) => COLORS.includes(d.color) && inside(d.x, d.y) && !blocked(l, d.x, d.y)) &&
    Array.isArray(l.blocks) &&
    l.blocks.every((b) => BLOCKS.includes(b)) &&
    Number.isInteger(l.maxBlocks) &&
    l.maxBlocks >= 1 &&
    l.maxBlocks <= 40
  );
}
