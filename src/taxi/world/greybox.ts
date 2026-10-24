// Rush Taxi — stage 1 grey-box test ground: a flat 400 m square with a road grid, box buildings, kickers, a big
// jump with a landing slope, a hill, a long wall to slide along and knock-over cones. Described as data (like the
// city JSON later) and turned into Rapier colliders here; the renderer draws the same shapes.

/** `hidden` shapes only collide (their look is drawn elsewhere, e.g. a landmark's merged mesh) */
export type Shape =
  | { kind: 'box'; id: string; p: [number, number, number]; size: [number, number, number]; yaw?: number; color: string; dynamic?: boolean; hidden?: boolean; /** a building, drawn with windows: 0 house, 1 tower, 2 hall, 3 warehouse */ look?: number; /** drawn only, no collider (upper volumes, balconies, canopies the car cannot reach) */ nocollide?: boolean }
  | { kind: 'wedge'; id: string; p: [number, number, number]; size: [number, number, number]; yaw?: number; color: string }
  | { kind: 'cyl'; id: string; p: [number, number, number]; r: number; h: number; color: string; hidden?: boolean }
  | { kind: 'ball'; id: string; p: [number, number, number]; r: number; color: string; hidden?: boolean };

export const GROUND = 400;
export const ROAD = 14; // road width (m)
export const BLOCK = 46; // block size between roads (m)

const C = { building: '#9AA3AE', tall: '#7F8995', ramp: '#C9A86A', wall: '#B5BCC6', cone: '#E9853B', hill: '#8FAF7A' };

/** the test ground, deterministic (no randomness, so every run is the same) */
export function greybox(): Shape[] {
  const out: Shape[] = [];
  const half = GROUND / 2;
  // perimeter walls
  out.push({ kind: 'box', id: 'wall-n', p: [0, 2, half], size: [GROUND, 4, 2], color: C.wall });
  out.push({ kind: 'box', id: 'wall-s', p: [0, 2, -half], size: [GROUND, 4, 2], color: C.wall });
  out.push({ kind: 'box', id: 'wall-e', p: [half, 2, 0], size: [2, 4, GROUND], color: C.wall });
  out.push({ kind: 'box', id: 'wall-w', p: [-half, 2, 0], size: [2, 4, GROUND], color: C.wall });
  // blocks of buildings on a grid; the centre cross is left open as a plaza for the jumps
  const pitch = BLOCK + ROAD;
  let n = 0;
  for (let gx = -3; gx <= 3; gx++)
    for (let gz = -3; gz <= 3; gz++) {
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue; // open plaza in the middle
      const cx = gx * pitch,
        cz = gz * pitch;
      const h = 8 + ((gx * 7 + gz * 13 + 49) % 5) * 6;
      const s = BLOCK - 6 - ((gx + gz + 6) % 3) * 4;
      out.push({ kind: 'box', id: `b${n++}`, p: [cx, h / 2, cz], size: [s, h, s], color: h > 25 ? C.tall : C.building });
    }
  // plaza: a small kicker, a big jump with a landing slope, a long side wall to rub along
  out.push({ kind: 'wedge', id: 'kicker', p: [0, 0, 30], size: [8, 1.2, 6], color: C.ramp });
  out.push({ kind: 'wedge', id: 'jump', p: [-40, 0, -20], size: [10, 3.2, 14], color: C.ramp });
  out.push({ kind: 'wedge', id: 'landing', p: [-40, 0, 32], size: [10, 3.2, 22], yaw: Math.PI, color: C.ramp });
  out.push({ kind: 'box', id: 'rubwall', p: [45, 1, 0], size: [1.5, 2, 70], color: C.wall });
  // a hill: up slope, flat top, down slope
  out.push({ kind: 'wedge', id: 'hill-up', p: [30, 0, -60], size: [16, 4, 20], color: C.hill });
  out.push({ kind: 'box', id: 'hill-top', p: [30, 2, -42], size: [16, 4, 16], color: C.hill });
  out.push({ kind: 'wedge', id: 'hill-down', p: [30, 0, -24], size: [16, 4, 20], yaw: Math.PI, color: C.hill });
  // cones in a row (knock them over)
  for (let k = 0; k < 8; k++) out.push({ kind: 'box', id: `cone${k}`, p: [12 + k * 3, 0.5, -10], size: [0.6, 1, 0.6], color: C.cone, dynamic: true });
  return out;
}

/** wedge corner points (local): rises from the -z end (height 0) to the +z end (height h) */
export function wedgePoints(size: [number, number, number]): [number, number, number][] {
  const [w, h, l] = size;
  const x = w / 2,
    z = l / 2;
  return [
    [-x, 0, -z],
    [x, 0, -z],
    [-x, 0, z],
    [x, 0, z],
    [-x, h, z],
    [x, h, z],
  ];
}
