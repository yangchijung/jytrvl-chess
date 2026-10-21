// Math Island — the one placement rule shared by drag, tap-tap and keyboard (spec §3 共用操作契約, MR04).
// James 2026-10-21: "到籃子的範圍內就算" — anywhere in the area counts, no exact spot. A drop goes, in order:
//  1. to the area under the finger;
//  2. else to the area the object overlaps (the one with the larger overlap; an exact tie is ambiguous);
//  3. else to the nearest area within 48 CSS px of the object's centre (never scaled by DPR).
// An ambiguous drop asks the child to tap where it should go. This only helps positioning; it never reveals or
// changes the maths answer.

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

/** Where a dragged object lands: finger first, then any overlap, then the 48 px rule on the object's centre. */
export function dropTo<T extends string>(finger: { x: number; y: number } | null, obj: Box, targets: Target<T>[], radius = SNAP_PX): Snap<T> {
  if (finger && Number.isFinite(finger.x) && Number.isFinite(finger.y)) {
    const under = targets.filter((t) => distToBox(finger.x, finger.y, t.box) === 0);
    if (under.length === 1) return { kind: 'target', id: under[0].id, d: 0 };
    if (under.length > 1) return { kind: 'ambiguous', ids: under.map((t) => t.id) };
  }
  let best = 0;
  let ids: T[] = [];
  for (const t of targets) {
    const w = Math.min(obj.right, t.box.right) - Math.max(obj.left, t.box.left);
    const h = Math.min(obj.bottom, t.box.bottom) - Math.max(obj.top, t.box.top);
    const a = w > 0 && h > 0 ? w * h : 0;
    if (a <= 0) continue;
    if (a > best + 1e-6) {
      best = a;
      ids = [t.id];
    } else if (Math.abs(a - best) <= 1e-6) ids.push(t.id);
  }
  if (ids.length === 1) return { kind: 'target', id: ids[0], d: 0 };
  if (ids.length > 1) return { kind: 'ambiguous', ids };
  return snapTo((obj.left + obj.right) / 2, (obj.top + obj.bottom) / 2, targets, radius);
}

/** A DOMRect in the same client coordinates as pointer events (already includes scroll and page zoom). */
export const boxOf = (r: { left: number; top: number; right: number; bottom: number }): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
