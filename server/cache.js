/**
 * Tiny in-memory TTL cache with stale-on-error: if the loader throws and we
 * have a previous value, keep serving that value for another short window
 * rather than blanking a dashboard because one service hiccupped. Callers
 * get back a plain value either way -- there's no flag distinguishing a
 * fresh hit from a stale one.
 *
 * Most keys here are small and reused ('streams', 'queue', ...), but a few
 * are parameterized by something a household accumulates over the life of
 * the process -- a calendar month browsed once, a movie clicked on and
 * never revisited. Those never get a second write to overwrite them, so
 * without a cap they'd just sit there past their own expiry until the
 * process restarts. MAX_ENTRIES exists for that: a safety cap, not a
 * working-set budget -- a single household's realistic key count over
 * weeks of uptime is nowhere close to it.
 */
const store = new Map();
export const MAX_ENTRIES = 500;

/** Keep the store under MAX_ENTRIES: expired entries first, then whatever's oldest. */
function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  // A `.pending` entry has a fetch in flight -- leave it alone. Evicting it
  // wouldn't break anything (the pending loader just re-adds it on
  // completion), but there's no reason to discard something in active use
  // over something nobody's touched in a while.
  for (const [key, entry] of store) {
    if (store.size <= MAX_ENTRIES) return;
    if (!entry.pending && entry.expires <= now) store.delete(key);
  }
  // Still over, with nothing actually expired to reclaim -- Map iterates in
  // insertion order, and every refresh re-sets its key, so the front of the
  // iteration is whatever's gone longest without being read or refreshed.
  for (const [key, entry] of store) {
    if (store.size <= MAX_ENTRIES) return;
    if (!entry.pending) store.delete(key);
  }
}

export async function cached(key, ttlMs, loader) {
  evictIfNeeded();
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expires > now) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = (async () => {
    // Unconditional, so this function body -- including the `pending` self-
    // reference below -- only ever runs after the `const pending =` below
    // has actually been assigned. Without it, a `loader` that throws
    // synchronously (rather than returning a rejected promise, which every
    // real loader in this codebase does) runs this entire block, `finally`
    // included, before that assignment completes, and referencing `pending`
    // there throws its own ReferenceError -- masking the loader's real
    // error behind a confusing crash instead of a clean stale/propagated one.
    await Promise.resolve();
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
