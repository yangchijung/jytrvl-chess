// PROVISIONAL missions drawn by engineering so the prototype is playable; the product side (ChatGPT) will replace
// them (docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md). Every mission is checked by tests to be solvable and to
// need every role's information.
import type { Mission } from './engine';

export const MISSIONS: Mission[] = [
  {
    id: 'M1',
    name: { zh: '電池送回家', en: 'Batteries home' },
    time: 2,
    capacity: 2,
    storage: { battery: 2, panel: 1, cable: 1, water: 2 },
    needs: { battery: 2 },
    routes: { red: 'shortcut', yellow: 'open', blue: 'rocks' },
  },
  {
    id: 'M2',
    name: { zh: '先修好橋', en: 'Fix the bridge first' },
    time: 2,
    capacity: 2,
    storage: { panel: 1, battery: 1, cable: 1, plank: 1, water: 1 },
    needs: { panel: 1, battery: 1, cable: 1 },
    routes: { red: 'rocks', yellow: 'bridge', blue: 'long' },
  },
  {
    id: 'M3',
    name: { zh: '捷徑要小心', en: 'Careful on the shortcut' },
    time: 3,
    capacity: 2,
    storage: { battery: 2, panel: 2, cable: 1, water: 1 },
    needs: { battery: 2, panel: 2 },
    routes: { red: 'shortcut', yellow: 'long', blue: 'rocks' },
  },
  {
    id: 'M4',
    name: { zh: '大救援', en: 'The big rescue' },
    time: 2,
    capacity: 3,
    storage: { battery: 2, cable: 2, water: 2, plank: 1, panel: 1 },
    needs: { battery: 2, cable: 2, water: 1 },
    routes: { red: 'bridge', yellow: 'shortcut', blue: 'long' },
  },
];
