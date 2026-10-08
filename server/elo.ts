// Elo rating with provisional K-factor and anti-abuse eligibility rules.
export const START_RATING = 1200;

export function kFactor(games: number, rating: number): number {
  if (games < 20) return 40; // provisional
  if (rating >= 2200) return 16;
  return 24;
}

export function expected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** score: 1 win, 0.5 draw, 0 loss for player A. Returns new ratings rounded to 1 decimal. */
export function updateElo(a: { rating: number; games: number }, b: { rating: number; games: number }, score: number): [number, number] {
  const ea = expected(a.rating, b.rating);
  const na = a.rating + kFactor(a.games, a.rating) * (score - ea);
  const nb = b.rating + kFactor(b.games, b.rating) * (1 - score - (1 - ea));
  return [Math.round(na * 10) / 10, Math.round(nb * 10) / 10];
}

export interface EligibilityInput {
  rated: boolean;
  user0: string | null;
  user1: string | null;
  ipHash0: string | null;
  ipHash1: string | null;
  plies: number;
  reason: string;
  /** rated games between the same two users in the last 24h, already counted */
  pairGamesToday: number;
}

export const MIN_PLIES = 10;
export const MAX_PAIR_GAMES_PER_DAY = 3;

/** Returns null if the game should count for rating, otherwise the reason it doesn't. */
export function ratingIneligible(e: EligibilityInput): string | null {
  if (!e.rated) return 'unrated';
  if (!e.user0 || !e.user1) return 'guest';
  if (e.user0 === e.user1) return 'same_user';
  if (e.ipHash0 && e.ipHash0 === e.ipHash1) return 'same_network';
  if (e.plies < MIN_PLIES && e.reason !== 'checkmate') return 'too_short';
  if (e.pairGamesToday >= MAX_PAIR_GAMES_PER_DAY) return 'pair_limit';
  return null;
}
