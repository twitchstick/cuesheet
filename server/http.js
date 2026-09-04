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
  // 169.254.0.0/16 and its IPv6 equivalent fe80::/10, in any notation Node will parse.
  if (/^169\.254\./.test(host) || /^fe[89ab][0-9a-f]:/i.test(host) || host === '::ffff:169.254.169.254') {
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

async function request(url, { headers = {}, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, hops = 2 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      // Follow redirects ourselves, so a hop cannot land on an address the
      // guard above would have refused.
      redirect: 'manual',
    });
    const location = res.status >= 300 && res.status <= 399 ? res.headers.get('location') : null;
    if (!location) return res;
    if (hops <= 0) throw new UpstreamError(`${safeHost(url)} redirected too many times`, 502);
    const next = assertReachableUrl(new URL(location, url).toString());
    return await request(next, { headers, method, body, timeoutMs, hops: hops - 1 });
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

/** Read a response body, refusing anything implausibly large for a poster. */
export async function readCappedBody(res, limit = MAX_BODY_BYTES) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new UpstreamError('Upstream response is too large', 502);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > limit) throw new UpstreamError('Upstream response is too large', 502);
  return buf;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'upstream';
  }
}
