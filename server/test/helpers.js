/** Shared fetch-mocking helpers for server-side tests. */

/**
 * A fetch Response stand-in with full control over headers vs. actual body
 * size. `body` carries a real, async-iterable ReadableStream (the same
 * shape readCappedBody() reads from a genuine fetch() response), optionally
 * split into `chunks` to simulate a slow-drip/streamed body -- a single
 * chunk (the whole thing at once) otherwise.
 */
export function fakeRes({ ok = true, status = 200, headers = {}, body = '', chunks, delayMs = 0 } = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const bytes = new TextEncoder().encode(body);
  const parts = chunks ? chunks.map((c) => (typeof c === 'string' ? new TextEncoder().encode(c) : c)) : [bytes];
  const stream = new ReadableStream({
    async start(controller) {
      for (const part of parts) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(part);
      }
      controller.close();
    },
  });
  return {
    ok,
    status,
    headers: { get: (k) => map.get(k.toLowerCase()) ?? null },
    body: stream,
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
