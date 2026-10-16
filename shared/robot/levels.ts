// PROVISIONAL levels drawn by engineering so the prototype is playable; the product side (ChatGPT) will replace
// them with the final level set (docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md). Every level is checked by tests.
import type { Level } from './engine';

const ALL = ['forward', 'left', 'right', 'pick', 'drop'] as Level['blocks'];

export const LEVELS: Level[] = [
  { id: 'R01', w: 5, h: 3, start: { x: 0, y: 1, dir: 'E' }, walls: [], parcels: [{ color: 'blue', x: 2, y: 1 }], doors: [{ color: 'blue', x: 4, y: 1 }], blocks: ALL, maxBlocks: 8, hint: { zh: '往前走，拿包裹', en: 'Go forward, pick it up' } },
  { id: 'R02', w: 4, h: 4, start: { x: 0, y: 3, dir: 'N' }, walls: [], parcels: [{ color: 'red', x: 0, y: 1 }], doors: [{ color: 'red', x: 2, y: 1 }], blocks: ALL, maxBlocks: 10, hint: { zh: '記得轉彎', en: 'Remember to turn' } },
  { id: 'R03', w: 5, h: 4, start: { x: 0, y: 0, dir: 'E' }, walls: [[2, 0], [2, 1]], parcels: [{ color: 'yellow', x: 1, y: 2 }], doors: [{ color: 'yellow', x: 4, y: 0 }], blocks: ALL, maxBlocks: 14, hint: { zh: '繞過牆', en: 'Go around the wall' } },
  { id: 'R04', w: 5, h: 5, start: { x: 2, y: 4, dir: 'N' }, walls: [[1, 2], [3, 2]], parcels: [{ color: 'blue', x: 2, y: 2 }], doors: [{ color: 'blue', x: 0, y: 0 }, { color: 'red', x: 4, y: 0 }], blocks: ALL, maxBlocks: 14, hint: { zh: '找對顏色的門', en: 'Find the matching door' } },
  { id: 'R05', w: 5, h: 4, start: { x: 0, y: 3, dir: 'E' }, walls: [[2, 2]], parcels: [{ color: 'red', x: 1, y: 3 }, { color: 'blue', x: 3, y: 3 }], doors: [{ color: 'red', x: 1, y: 0 }, { color: 'blue', x: 3, y: 0 }], blocks: ALL, maxBlocks: 24, hint: { zh: '一次拿一個', en: 'One parcel at a time' } },
  { id: 'R06', w: 6, h: 5, start: { x: 0, y: 4, dir: 'N' }, walls: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3], [5, 1]], parcels: [{ color: 'yellow', x: 0, y: 0 }], doors: [{ color: 'yellow', x: 4, y: 4 }], blocks: ALL, maxBlocks: 24, hint: { zh: '彎彎的路', en: 'A winding road' } },
];
