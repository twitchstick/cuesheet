import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { AuthStatus } from '../types';

/**
 * The optional admin password gate. `status` is null until the first check
 * resolves; App.tsx holds off rendering the dashboard (or deciding there's
 * no gate to begin with) until then -- a failed status check is treated as
 * "unknown," never as "must be open," since assuming open on an error would
 * be exactly backwards for something whose whole job is staying closed.
 */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.authStatus();
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check login status');
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /** Throws (an ApiError, e.g. "Incorrect password" or a 429) on failure -- the caller shows that inline. */
  const login = useCallback(
    async (password: string) => {
      await api.login(password);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { status, loading, error, login, logout, refresh };
}
