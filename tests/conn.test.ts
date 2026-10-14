import { describe, it, expect } from 'vitest';
import { ConnTracker, MAX_RETRIES } from '../src/lib/conn';

describe('connection phases', () => {
  it('first connect: connecting → syncing → synced, without a "recovered" notice', () => {
    const c = new ConnTracker();
    expect(c.phase).toBe('connecting');
    c.opened();
    expect(c.phase).toBe('syncing');
    c.synced();
    expect(c.phase).toBe('synced');
    expect(c.recoveredAt).toBe(0);
  });
  it('drop: reconnecting → syncing → synced only after a snapshot is applied', () => {
    const c = new ConnTracker();
    c.opened();
    c.synced();
    expect(c.dropped()).toBeGreaterThan(0);
    expect(c.phase).toBe('reconnecting');
    c.opened();
    expect(c.phase).toBe('syncing'); // connected, but the room state is not applied yet
    expect(c.recovering).toBe(true);
    c.synced();
    expect(c.phase).toBe('synced');
    expect(c.recoveredAt).toBeGreaterThan(0);
  });
  it('gives up after the retry limit and allows a manual retry', () => {
    const c = new ConnTracker();
    for (let i = 0; i < MAX_RETRIES; i++) expect(c.dropped()).not.toBeNull();
    expect(c.dropped()).toBeNull();
    expect(c.phase).toBe('failed');
    c.manualRetry();
    expect(c.phase).toBe('reconnecting');
    expect(c.dropped()).not.toBeNull();
  });
});
