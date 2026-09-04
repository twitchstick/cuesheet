/** Shared fetch-mocking helpers for server-side tests. */

/** A fetch Response stand-in with full control over headers vs. actual body size. */
export function fakeRes({ ok = true, status = 200, headers = {}, body = '' } = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const bytes = new TextEncoder().encode(body);
  return {
    ok,
    status,
    headers: { get: (k) => map.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => body,
  };
}

/** A fakeRes carrying a JSON body, the common case for every service adapter. */
export const jsonRes = (data, opts = {}) => fakeRes({ ...opts, body: JSON.stringify(data) });

/**
 * Patches global fetch to hand back one response per call, in order, and
 * records every call for assertions. Callers restore the original in their
 * own afterEach with restoreFetch() -- keeping that explicit (rather than
 * hiding it in this helper) means a test file's intent is visible at the
 * call site instead of relying on hook ordering across files.
 */
const realFetch = globalThis.fetch;

export function mockFetch(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: ran out of queued responses');
    return typeof next === 'function' ? next(url, init) : next;
  };
  return calls;
}

export function restoreFetch() {
  globalThis.fetch = realFetch;
}
