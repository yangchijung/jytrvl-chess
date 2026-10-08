import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Me } from './api';

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (returnTo?: string) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const login = (returnTo = location.pathname + location.search) => {
    location.href = `/api/auth/google/start?return=${encodeURIComponent(returnTo)}`;
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await refresh();
  };
  return <Ctx.Provider value={{ me, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
