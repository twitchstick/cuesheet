/**
 * Tiny in-memory TTL cache with stale-on-error: if the loader throws and we
 * have a previous value, keep serving it (flagged as stale) rather than
 * blanking a dashboard because one service hiccupped.
 */
const store = new Map();

export async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expires > now) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } catch (err) {
      if (entry) {
        // Keep the stale value around for another short window.
        store.set(key, { value: entry.value, expires: Date.now() + Math.min(ttlMs, 30_000) });
        return entry.value;
      }
      throw err;
    } finally {
      const current = store.get(key);
      if (current?.pending === pending) store.delete(key);
    }
  })();

  store.set(key, { ...(entry ?? { value: undefined, expires: 0 }), pending });
  return pending;
}

export function invalidate(prefix) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
