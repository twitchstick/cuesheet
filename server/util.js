export const pad2 = (n) => String(n ?? 0).padStart(2, '0');

export const episodeCode = (season, episode) => `S${pad2(season)}E${pad2(episode)}`;

/** Build a proxied image URL the browser can load without any upstream credentials. */
export function imageUrl(source, ref, extra = {}) {
  if (!ref) return null;
  const params = new URLSearchParams({ s: source, p: String(ref), ...extra });
  return `/api/image?${params.toString()}`;
}

export const tmdbPoster = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

/** Format a Date as YYYY-MM-DD in the given IANA time zone. */
export function localDate(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Format a Date as HH:mm (24h) in the given IANA time zone. */
export function localTime(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
