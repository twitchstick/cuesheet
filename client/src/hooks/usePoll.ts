import { useCallback, useEffect, useState } from 'react';

interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Poll a fetcher on an interval. Pauses while the tab is hidden and fires
 * immediately when it becomes visible again, so a wall-mounted screen stays
 * current without hammering the services when nobody is looking.
 *
 * `fetcher` itself is a dependency of the effect below, not just stashed in
 * a ref -- a caller whose fetcher closes over something that changes (the
 * calendar's week/month range, say) needs that change to fetch right away,
 * not wait out whatever's left of the previous interval. Every current
 * caller passes either a stable top-level function (api.streams and
 * friends) or one memoized with useCallback against its own real
 * dependencies, so this never fires more often than the fetcher itself
 * actually changes.
 */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number, enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const run = async () => {
      try {
        const result = await fetcher();
        if (cancelled) return;
        setData(result);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') await run();
        schedule();
      }, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        run();
        schedule();
      }
    };

    run();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetcher, intervalMs, enabled, tick]);

  return { data, error, loading, updatedAt, refresh };
}
