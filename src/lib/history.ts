// Games saved on this device (guests and signed-in users alike). Online games are stored server-side.
import type { LocalSave } from '../game/local';

const KEY = 'jychess.local-games.v1';
const MAX = 50;

export interface LocalGameEntry {
  id: string;
  save: LocalSave;
}

export function listLocalGames(): LocalGameEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as LocalGameEntry[]) : [];
    return Array.isArray(arr) ? arr.sort((a, b) => b.save.savedAt - a.save.savedAt) : [];
  } catch {
    return [];
  }
}

export function saveLocalGame(id: string, save: LocalSave) {
  try {
    const all = listLocalGames().filter((g) => g.id !== id);
    all.unshift({ id, save });
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)));
  } catch {
    /* quota or private mode — ignore */
  }
}

export function getLocalGame(id: string): LocalSave | null {
  return listLocalGames().find((g) => g.id === id)?.save ?? null;
}

export function deleteLocalGame(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listLocalGames().filter((g) => g.id !== id)));
  } catch {
    /* ignore */
  }
}

export function isLocalSave(x: unknown): x is LocalSave {
  const s = x as LocalSave;
  return !!s && s.v === 1 && !!s.options && !!s.state && ['chess', 'xiangqi', 'banqi'].includes(s.state.game);
}
