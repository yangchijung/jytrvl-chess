// Math Island — the shared drag controller for every placement game (spec §3 共用操作契約, MR04).
// One finger only (a second pointer never takes over), the object follows the finger, and on release the
// finger and the object's rectangle go through place.ts (finger in an area, else overlap, else 48 px). pointercancel, lost capture, leaving the page, rotation/resize all
// return the object to its last committed place without counting anything. Taps are left to the click
// handler, so tap-then-tap and keyboard (Enter/Space) share the same move action as dragging.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { dropTo, type Target } from './place';

interface Drag {
  pid: number;
  i: number;
  x0: number;
  y0: number;
  moved: boolean;
  el: HTMLElement;
}
export interface DragOptions<Z extends string> {
  /** false while the tab is view-only or the problem is finished */
  enabled: boolean;
  /** the legal places for object i, measured now (client coordinates) */
  targets: (i: number) => Target<Z>[];
  onDrop: (i: number, zone: Z) => void;
  onAmbiguous: (i: number) => void;
  /** a real drag started (e.g. clear a tap selection) */
  onStart?: () => void;
}

const rectOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

export function useDragPlace<Z extends string>(opts: DragOptions<Z>) {
  const o = useRef(opts);
  o.current = opts;
  const drag = useRef<Drag | null>(null);
  const [hot, setHot] = useState<Z | null>(null);
  /** the click that follows a real drag is not a tap; ignored only for that object, only briefly */
  const suppress = useRef<{ i: number; until: number } | null>(null);

  const reset = (d: Drag) => {
    d.el.style.transform = '';
    d.el.removeAttribute('data-dragging');
    try {
      if (d.el.hasPointerCapture(d.pid)) d.el.releasePointerCapture(d.pid);
    } catch {
      /* ignore */
    }
  };
  const cancel = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    reset(d);
    setHot(null);
    if (d.moved) suppress.current = { i: d.i, until: performance.now() + 80 };
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && cancel();
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('orientationchange', cancel);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('orientationchange', cancel);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [cancel]);

  const bind = (i: number) => ({
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (!o.current.enabled || drag.current || !e.isPrimary) return; // a second finger never takes over
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      drag.current = { pid: e.pointerId, i, x0: e.clientX, y0: e.clientY, moved: false, el };
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pid !== e.pointerId) return;
      const dx = e.clientX - d.x0,
        dy = e.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) < 8) return;
      if (!d.moved) {
        d.moved = true;
        d.el.setAttribute('data-dragging', 'true');
        o.current.onStart?.();
      }
      d.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
      const sn = dropTo({ x: e.clientX, y: e.clientY }, rectOf(d.el), o.current.targets(d.i));
      const z = sn.kind === 'target' ? sn.id : null;
      setHot((h) => (h === z ? h : z));
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pid !== e.pointerId) return;
      drag.current = null;
      if (!d.moved) {
        reset(d);
        return; // a tap: the click handler selects
      }
      suppress.current = { i: d.i, until: performance.now() + 80 };
      const sn = dropTo({ x: e.clientX, y: e.clientY }, rectOf(d.el), o.current.targets(d.i));
      reset(d);
      setHot(null);
      if (sn.kind === 'target') o.current.onDrop(d.i, sn.id);
      else if (sn.kind === 'ambiguous') o.current.onAmbiguous(d.i);
    },
    onPointerCancel: (e: RPointerEvent<HTMLElement>) => {
      if (drag.current && drag.current.pid === e.pointerId) cancel();
    },
    onLostPointerCapture: (e: RPointerEvent<HTMLElement>) => {
      if (drag.current && drag.current.pid === e.pointerId) cancel();
    },
  });

  /** true when this click is the tail of a drag on the same object (and should not count as a tap) */
  const wasDrag = (i: number) => {
    const s = suppress.current;
    suppress.current = null;
    return !!s && s.i === i && performance.now() < s.until;
  };

  return { hot, bind, wasDrag, cancel };
}

/** Collects the drop areas' elements by id so their rectangles can be measured at release time. */
export function useZones<Z extends string>() {
  const els = useRef(new Map<Z, HTMLElement>());
  const ref = (z: Z) => (el: HTMLElement | null) => {
    if (el) els.current.set(z, el);
    else els.current.delete(z);
  };
  const measure = (ids: Z[]): Target<Z>[] =>
    ids.flatMap((id) => {
      const el = els.current.get(id);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ id, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }];
    });
  return { ref, measure };
}
