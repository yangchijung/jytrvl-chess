// PROVISIONAL maps drawn by engineering so the prototype is playable; the product side (ChatGPT) will replace them
// (docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md). Coordinates: x 0..100, y 0..64. Every map is checked by tests.
import type { TrailMap, TrailNode } from './engine';

type N = [number, number, TrailNode['kind'], TrailNode['badge']?];
const nodes = (list: N[]): TrailNode[] => list.map(([x, y, kind, badge], id) => (badge ? { id, x, y, kind, badge } : { id, x, y, kind }));

export const MAPS: TrailMap[] = [
  {
    id: 'hills',
    name: { zh: '小山丘', en: 'Little Hills' },
    nodes: nodes([
      [8, 48, 'start'], [22, 48, 'plain'], [22, 20, 'badge', 'forest'], [36, 34, 'mud'], [36, 58, 'apple'], [50, 20, 'plain'], [50, 48, 'plain'],
      [64, 6, 'badge', 'mountain'], [64, 34, 'plain'], [64, 58, 'badge', 'lake'], [78, 20, 'apple'], [78, 48, 'plain'], [92, 34, 'camp'],
    ]),
    edges: [[0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [3, 5], [3, 6], [4, 6], [5, 7], [5, 8], [6, 8], [6, 9], [7, 10], [8, 10], [8, 11], [9, 11], [10, 12], [11, 12]],
  },
  {
    id: 'lake',
    name: { zh: '湖邊小路', en: 'Lakeside' },
    nodes: nodes([
      [8, 34, 'start'], [22, 20, 'plain'], [22, 48, 'plain'], [36, 6, 'badge', 'forest'], [36, 34, 'mud'], [36, 58, 'apple'], [50, 20, 'plain'],
      [50, 48, 'plain'], [64, 6, 'apple'], [64, 34, 'mud'], [64, 58, 'badge', 'lake'], [78, 20, 'badge', 'mountain'], [78, 48, 'plain'], [92, 34, 'camp'],
    ]),
    edges: [[0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7], [6, 8], [6, 9], [7, 9], [7, 10], [8, 11], [9, 11], [9, 12], [10, 12], [11, 13], [12, 13]],
  },
  {
    id: 'canyon',
    name: { zh: '大峽谷', en: 'Big Canyon' },
    nodes: nodes([
      [8, 58, 'start'], [8, 30, 'plain'], [22, 44, 'mud'], [22, 16, 'badge', 'forest'], [36, 58, 'apple'], [36, 30, 'plain'], [50, 44, 'plain'],
      [50, 16, 'mud'], [64, 58, 'badge', 'lake'], [64, 30, 'plain'], [64, 4, 'badge', 'mountain'], [78, 44, 'apple'], [78, 16, 'plain'], [92, 30, 'camp'],
    ]),
    edges: [[0, 1], [0, 2], [0, 4], [1, 3], [1, 2], [2, 5], [3, 5], [3, 7], [4, 6], [5, 6], [5, 7], [6, 8], [6, 9], [7, 10], [7, 9], [8, 11], [9, 11], [9, 12], [10, 12], [11, 13], [12, 13], [4, 8]],
  },
];
