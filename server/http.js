import { Agent } from 'undici';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/**
 * Cuesheet deliberately talks to private addresses — that is where a home
 * media server lives — so the usual "block RFC1918" rule would break it.
 * Link-local is different: nothing legitimate is served from 169.254.0.0/16,
 * and it is where every cloud provider parks its instance metadata. With no
 * sign-in on the dashboard, the connection test is reachable by anyone on the
 * network, so this is the one range worth refusing outright.
 */
const BLOCKED_HOSTS = new Set(['metadata.google.internal', 'metadata']);

export function assertReachableUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UpstreamError('That is not a valid URL', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UpstreamError('Only http:// and https:// addresses are allowed', 400);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.has(host)) throw new UpstreamError('That address is not allowed', 400);
  // 169.254.0.0/16 and its IPv6 equivalent fe80::/10, in any notation Node
  // will parse. Anchored on both ends -- a *hostname* that merely starts
  // with "169.254." (a real, if unlikely, DNS label) is not this address;
  // only the literal dotted-quad is. A colon can't appear in a DNS
  // hostname at all, so the IPv6 prefix match doesn't need the same care.
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) || /^fe[89ab][0-9a-f]:/i.test(host) || host === '::ffff:169.254.169.254') {
    throw new UpstreamError('Link-local addresses are not allowed', 400);
  }
  return url.toString();
}

export class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

let selfSignedDispatcher;

function dispatcherFor(allowSelfSigned) {
  if (!allowSelfSigned) return undefined;
  selfSignedDispatcher ??= new Agent({ connect: { rejectUnauthorized: false } });
  return selfSignedDispatcher;
}

async function request(url, { headers = {}, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, hops = 2, allowSelfSigned = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      dispatcher: dispatcherFor(allowSelfSigned),
      // Follow redirects ourselves, so a hop cannot land on an address the
      // guard above would have refused.
      redirect: 'manual',
    });
    const location = res.status >= 300 && res.status <= 399 ? res.headers.get('location') : null;
    if (!location) return res;
    if (hops <= 0) throw new UpstreamError(`${safeHost(url)} redirected too many times`, 502);
    const next = assertReachableUrl(new URL(location, url).toString());
    // A UDM's self-signed exception must never follow a redirect onto a
    // different host. Keep normal certificate verification everywhere else.
    const sameOrigin = new URL(next).origin === new URL(url).origin;
    return await request(next, { headers, method, body, timeoutMs, hops: hops - 1, allowSelfSigned: allowSelfSigned && sameOrigin });
  } catch (err) {
    // A refused address is a clear answer, not a network failure — say so plainly.
    if (err instanceof UpstreamError) throw err;
    const reason = err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err?.message ?? String(err);
    throw new UpstreamError(`Request to ${safeHost(url)} failed: ${reason}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}) {
  const res = await request(url, options);
  if (!res.ok) {
    let detail = '';
    try {
      // Capped like everything else here -- an error body is attacker-shaped
      // too, from a service this app was only ever asked to trust with data,
      // not with however much memory it feels like handing back.
      const text = (await readCappedBody(res)).toString('utf8');
      try {
        detail = JSON.parse(text)?.message ?? text;
      } catch {
        detail = text;
      }
    } catch {
      /* ignore */
    }
    detail = String(detail ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 200);
    if (detail === '{}' || detail === '[]' || detail === 'null') detail = '';
    throw new UpstreamError(`${safeHost(url)} responded ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
  }
  if (res.status === 204) return null;
  const text = (await readCappedBody(res)).toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError(`${safeHost(url)} returned a non-JSON response`, 502);
  }
}

/** Fetch a binary resource (used by the image proxy). Returns the raw Response. */
export function fetchRaw(url, options = {}) {
  return request(url, { ...options, timeoutMs: options.timeoutMs ?? 15_000 });
}

/**
 * Read a response body, refusing anything implausibly large for a poster.
 *
 * The Content-Length pre-check below is only a courtesy -- a chunked or
 * dishonest upstream has no obligation to send one at all, and
 * res.arrayBuffer() would happily buffer an unbounded body in full before
 * any size check ran. So the real enforcement streams the body in chunks
 * and aborts as soon as the running total crosses the limit, never holding
 * more than one oversized response in memory at a time. It also gives the
 * body-reading phase its own timeout: request()'s AbortController is torn
 * down the moment fetch() resolves with headers, so without this, a
 * connection that answers instantly but then drips its body forever would
 * hang here indefinitely.
 */
export async function readCappedBody(res, limit = MAX_BODY_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    res.body?.cancel().catch(() => {});
    throw new UpstreamError('Upstream response is too large', 502);
  }
  if (!res.body) return Buffer.alloc(0);
  // Own the reader: cancelling the stream itself while a reader holds its
  // lock rejects without stopping the pending read.
  const reader = res.body.getReader();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamError(`Upstream took too long sending its response body (over ${timeoutMs}ms)`, 502)), timeoutMs);
  });
  try {
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) return Buffer.concat(chunks, total);
      total += value.byteLength;
      if (total > limit) throw new UpstreamError('Upstream response is too large', 502);
      chunks.push(value);
    }
  } catch (err) {
    // Cancellation closes pending reads immediately. Do not wait for an
    // upstream's cancellation hook, which could itself never settle.
    reader.cancel(err).catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'upstream';
  }
}
