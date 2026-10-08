import { describe, it, expect } from 'vitest';
import { updateElo, ratingIneligible, expected, kFactor } from '../server/elo';
import { roomCode, isRoomCode } from '../server/crypto';
import { validNickname, cleanGuestName } from '../server/session';

describe('rating system', () => {
  it('expected score is symmetric', () => {
    expect(expected(1500, 1500)).toBeCloseTo(0.5);
    expect(expected(1600, 1400) + expected(1400, 1600)).toBeCloseTo(1);
  });
  it('winner gains, loser loses, zero-sum for equal K', () => {
    const [a, b] = updateElo({ rating: 1500, games: 30 }, { rating: 1500, games: 30 }, 1);
    expect(a).toBeGreaterThan(1500);
    expect(b).toBeLessThan(1500);
    expect(a - 1500).toBeCloseTo(1500 - b, 5);
  });
  it('provisional players move faster', () => {
    expect(kFactor(0, 1200)).toBeGreaterThan(kFactor(50, 1200));
  });
  it('anti-abuse eligibility', () => {
    const base = { rated: true, user0: 'a', user1: 'b', ipHash0: 'x', ipHash1: 'y', plies: 40, reason: 'checkmate', pairGamesToday: 0 };
    expect(ratingIneligible(base)).toBeNull();
    expect(ratingIneligible({ ...base, rated: false })).toBe('unrated');
    expect(ratingIneligible({ ...base, user1: null })).toBe('guest');
    expect(ratingIneligible({ ...base, user1: 'a' })).toBe('same_user');
    expect(ratingIneligible({ ...base, ipHash1: 'x' })).toBe('same_network');
    expect(ratingIneligible({ ...base, plies: 4, reason: 'resign' })).toBe('too_short');
    expect(ratingIneligible({ ...base, pairGamesToday: 3 })).toBe('pair_limit');
  });
});

describe('identifiers', () => {
  it('room codes are 6 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const c = roomCode();
      expect(isRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[01IO]/);
    }
    expect(isRoomCode('ABCD1O')).toBe(false);
  });
  it('nicknames', () => {
    expect(validNickname('小明')).toBe(true);
    expect(validNickname('Chess_Kid-9')).toBe(true);
    expect(validNickname('a')).toBe(false);
    expect(validNickname('<script>')).toBe(false);
    expect(cleanGuestName('<b>x</b>', 'Guest-1')).toBe('Guest-1');
  });
});
