// Server-side verification of solo records (Snake Arena & Block Puzzle Battle).
// A record is accepted only if replaying the submitted inputs from the server-issued seed produces the
// result, and the wall-clock time is consistent with the game's own clock (no fast-forwarding).
import { replay as replayBlocks, TPS, type BlocksMode, type InputRecord } from './blocks/engine';
import { replaySolo, stepsPerSecond, type SnakeMode, type SnakeConfig } from './snake/engine';

export const SNAKE_SOLO_MODES = ['classic', 'survival', 'timeattack'] as const;
export const BLOCKS_SOLO_MODES = ['classic', 'marathon', 'sprint', 'ultra'] as const;
export const TIMEATTACK_SECONDS = 120;
/** standard settings used for the public snake leaderboards */
export const SNAKE_STANDARD = { size: 24, map: 'open' as const, walls: true, speed: 'normal' as const };

export function snakeSoloConfig(mode: SnakeMode, seed: number): SnakeConfig {
  const durationSteps = mode === 'timeattack' ? TIMEATTACK_SECONDS * stepsPerSecond(mode, SNAKE_STANDARD.speed, 0) : 0;
  return { width: SNAKE_STANDARD.size, height: SNAKE_STANDARD.size, seed, mode, map: SNAKE_STANDARD.map, walls: SNAKE_STANDARD.walls, durationSteps };
}

export interface Verified {
  score: number;
  /** sprint: time in ms; others: game length in ms */
  ms: number;
  lines: number;
  /** minimum real time the game must have taken */
  minRealMs: number;
}

export function verifySnake(mode: SnakeMode, seed: number, inputs: [number, number][]): Verified {
  const cfg = snakeSoloConfig(mode, seed);
  const maxSteps = 60 * 60 * 18; // one hour at the top speed
  const g = replaySolo(cfg, inputs, maxSteps);
  if (!g.result) throw new Error('unfinished');
  // minimum real duration: sum of step durations at the speed in force (survival speeds up)
  // we replay food counts per step coarsely: use final foods spread evenly (lower bound)
  const s = g.snakes[0];
  let ms = 0;
  const steps = g.tick;
  for (let i = 0; i < steps; i++) {
    const foodsSoFar = Math.floor((s.foods * i) / Math.max(1, steps));
    ms += 1000 / stepsPerSecond(mode, SNAKE_STANDARD.speed, foodsSoFar);
  }
  return { score: s.score, ms: Math.round(ms), lines: s.maxLen, minRealMs: Math.round(ms * 0.85) };
}

export function verifyBlocks(mode: BlocksMode, seed: number, inputs: InputRecord[], endTick: number): Verified {
  const maxTicks = Math.min(3 * 3600 * TPS, Math.max(0, Math.floor(endTick)) + 2);
  const g = replayBlocks({ seed, mode }, inputs, maxTicks);
  if (g.status !== 'over') throw new Error('unfinished');
  if (mode === 'sprint' && g.result !== 'goal') throw new Error('sprint not completed');
  const ms = Math.round((g.endTick * 1000) / TPS);
  return { score: g.score, ms, lines: g.lines, minRealMs: Math.round(ms * 0.9) };
}
