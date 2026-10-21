// Math Island — the one placement rule shared by drag, tap-tap and keyboard (spec §3 共用操作契約, MR04).
// On release, the object's centre is compared with each legal target area: inside an area the distance is 0,
// otherwise the shortest distance to its edge. The nearest target within 48 CSS px wins (never scaled by DPR);
// an exact tie between two targets is ambiguous and the page asks the child to tap where it should go.
// This only helps positioning; it never reveals or changes the maths answer.

export const SNAP_PX = 48;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Target<T extends string = string> {
  id: T;
  box: Box;
}
export type Snap<T extends string = string> = { kind: 'target'; id: T; d: number } | { kind: 'none' } | { kind: 'ambiguous'; ids: T[] };

/** Distance from a point to a rectangle (0 inside or on the edge). */
export function distToBox(x: number, y: number, b: Box): number {
  const dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0;
  const dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
  return Math.hypot(dx, dy);
}

export function snapTo<T extends string>(x: number, y: number, targets: Target<T>[], radius = SNAP_PX): Snap<T> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { kind: 'none' };
  let best = Infinity;
  let ids: T[] = [];
  for (const t of targets) {
    const d = distToBox(x, y, t.box);
    if (d > radius) continue;
    if (d < best - 1e-6) {
      best = d;
      ids = [t.id];
    } else if (Math.abs(d - best) <= 1e-6) ids.push(t.id);
  }
  if (!ids.length) return { kind: 'none' };
  if (ids.length > 1) return { kind: 'ambiguous', ids };
  return { kind: 'target', id: ids[0], d: best };
}

/** A DOMRect in the same client coordinates as pointer events (already includes scroll and page zoom). */
export const boxOf = (r: { left: number; top: number; right: number; bottom: number }): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
