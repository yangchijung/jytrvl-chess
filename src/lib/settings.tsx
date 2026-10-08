import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  theme: Theme;
  sound: boolean;
  animation: boolean;
  coords: boolean;
  hints: boolean;
}

const DEFAULTS: Settings = { theme: 'system', sound: true, animation: true, coords: true, hints: true };
const KEY = 'jychess.settings.v1';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — settings stay in memory */
  }
}

interface Ctx {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
}
const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadJSON(KEY, DEFAULTS));
  useEffect(() => {
    saveJSON(KEY, settings);
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.toggleAttribute('data-reduce-motion', !settings.animation);
  }, [settings]);
  return (
    <SettingsCtx.Provider value={{ settings, update: (p) => setSettings((s) => ({ ...s, ...p })) }}>{children}</SettingsCtx.Provider>
  );
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('SettingsProvider missing');
  return c;
}
