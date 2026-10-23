// Rush Taxi — the game screen must not scroll or zoom under a child's fingers: touch-action: none in CSS, plus
// preventDefault for touchmove (older iOS ignores touch-action for some gestures), iOS pinch (`gesture*`) and
// double-tap zoom. Taps still become clicks, and sliders and scrollable panels (.taxi-scroll) keep working.
import { useEffect, type RefObject } from 'react';

const keep = (t: EventTarget | null) => t instanceof Element && !!t.closest('input[type=range], .taxi-scroll');

export function useTouchGuard(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1 || !keep(e.target)) e.preventDefault();
    };
    const stop = (e: Event) => e.preventDefault();
    // double-tap zoom: a second touchend within 300 ms on something that is not a control
    let lastEnd = 0;
    const onEnd = (e: TouchEvent) => {
      const now = e.timeStamp;
      const control = e.target instanceof Element && !!e.target.closest('button, a, input, [role=switch], [role=slider]');
      if (now - lastEnd < 300 && !control && e.cancelable) e.preventDefault();
      lastEnd = now;
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('dblclick', stop);
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    document.addEventListener('gestureend', stop);
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('dblclick', stop);
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('gestureend', stop);
    };
  }, [root]);
}
