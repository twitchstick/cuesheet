const DEFAULT_TIMEOUT_MS = 10_000;

export class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

async function request(url, { headers = {}, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
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
      const text = await res.text();
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
  const text = await res.text();
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

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'upstream';
  }
}
