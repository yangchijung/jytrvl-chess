// Math Island — small pieces shared by the batch-A games (train, shop, balance). Pure and deterministic.

export type Read<T> = { kind: 'ok'; save: T } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };

/** Read a save through a validator: storage errors, empty, broken JSON and wrong shape are told apart. */
export function readWith<T>(get: () => string | null, valid: (x: unknown) => x is T): Read<T> {
  let raw: string | null;
  try {
    raw = get();
  } catch {
    return { kind: 'noStorage' };
  }
  if (raw === null) return { kind: 'empty' };
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { kind: 'broken', raw, cause: 'json' };
  }
  return valid(x) ? { kind: 'ok', save: x } : { kind: 'broken', raw, cause: 'schema' };
}

/** Three different whole-number choices around the answer (never below min), in an order that varies by problem. */
export function choicesAround(answer: number, index: number, min = 0): number[] {
  const set = [answer - 1, answer, answer + 1].filter((n) => n >= min);
  while (set.length < 3) set.push(Math.max(...set) + 1);
  const rot = [1, 2, 0, 2, 0][index % 5];
  return [...set.slice(rot), ...set.slice(0, rot)];
}

/** The fields every batch-A save has in common; checked before each game checks its own. */
export function validBase(x: unknown, game: string, total: number): x is { schemaVersion: 1; game: string; index: number; at: number[]; solved: boolean; done: string[]; voice: boolean } {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== 1 || s.game !== game || typeof s.solved !== 'boolean' || typeof s.voice !== 'boolean') return false;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) > total) return false;
  if (!Array.isArray(s.done) || !s.done.every((d) => typeof d === 'string') || new Set(s.done).size !== s.done.length) return false;
  if (!Array.isArray(s.at) || !s.at.every((a) => Number.isInteger(a))) return false;
  if ((s.index as number) === total && (s.at.length !== 0 || s.solved)) return false;
  return true;
}
