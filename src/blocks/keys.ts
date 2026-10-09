// Keyboard bindings for Block Puzzle Battle (customisable for the single-player / online keymap).
import { loadJSON, saveJSON } from '../lib/settings';

export type Control = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'r180' | 'hold';
export const CONTROLS: Control[] = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold'];
export type KeyMap = Record<Control, string[]>;

export const DEFAULT_KEYS: KeyMap = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  soft: ['ArrowDown'],
  hard: ['Space'],
  cw: ['ArrowUp', 'KeyX'],
  ccw: ['KeyZ', 'ControlLeft'],
  r180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft'],
};
/** two players on one keyboard */
export const P1_KEYS: KeyMap = { left: ['KeyA'], right: ['KeyD'], soft: ['KeyS'], hard: ['Space'], cw: ['KeyW'], ccw: ['KeyQ'], r180: [], hold: ['KeyE'] };
export const P2_KEYS: KeyMap = { left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Enter', 'NumpadEnter'], cw: ['ArrowUp'], ccw: ['Slash', 'Numpad0'], r180: [], hold: ['Period', 'NumpadDecimal'] };

const KEY = 'jychess.blocks.keys.v1';
export function loadKeys(): KeyMap {
  return loadJSON<KeyMap>(KEY, DEFAULT_KEYS);
}
export function saveKeys(k: KeyMap) {
  saveJSON(KEY, k);
}

export interface Handling {
  das: number; // ms before auto-repeat
  arr: number; // ms between repeats (0 = instant)
}
const HKEY = 'jychess.blocks.handling.v1';
export const DEFAULT_HANDLING: Handling = { das: 167, arr: 33 };
export function loadHandling(): Handling {
  return loadJSON<Handling>(HKEY, DEFAULT_HANDLING);
}
export function saveHandling(h: Handling) {
  saveJSON(HKEY, h);
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift R', ControlLeft: 'Ctrl', Enter: 'Enter', Slash: '/', Period: '.' };
  return map[code] ?? code;
}
