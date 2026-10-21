import { describe, expect, it } from 'vitest';
import { setHidden } from '../src/territory/flow-page';

const run = (status: 'countdown' | 'playing' | 'ended') => ({ status, startAt: 2000, acc: 40, last: 1000, hiddenAt: null as number | null });

describe('Territory free steering: background pause (Issue #8 P2)', () => {
  it('in play: no catch-up after returning; the step budget starts empty from the return moment', () => {
    const R = run('playing');
    setHidden(R, true, 1100);
    expect(R.hiddenAt).toBe(1100);
    setHidden(R, true, 1500); // a repeated hidden event keeps the first moment
    expect(R.hiddenAt).toBe(1100);
    setHidden(R, false, 61100);
    expect(R).toMatchObject({ hiddenAt: null, last: 61100, acc: 0 });
  });
  it('in the countdown: the time left is kept (start moves by the hidden time)', () => {
    const R = run('countdown');
    setHidden(R, true, 1500); // 500 ms left
    setHidden(R, false, 9500);
    expect(R.startAt - 9500).toBe(500);
  });
  it('a visible event without a hidden one changes nothing', () => {
    const R = run('playing');
    setHidden(R, false, 5000);
    expect(R).toMatchObject({ last: 1000, acc: 40, hiddenAt: null });
  });
});
