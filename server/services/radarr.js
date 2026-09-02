import { fetchJson } from '../http.js';
import { imageUrl } from '../util.js';

const headers = (cfg) => ({ 'X-Api-Key': cfg.apiKey });

const RELEASES = [
  ['digitalRelease', 'Digital'],
  ['physicalRelease', 'Physical'],
  ['inCinemas', 'Cinema'],
];

/**
 * Radarr returns each movie once if any of its release dates fall in the
 * window. Expand that into one calendar entry per release date in range.
 */
export async function calendar(cfg, start, end) {
  const params = new URLSearchParams({ start, end, unmonitored: 'false' });
  const movies = await fetchJson(`${cfg.url}/api/v3/calendar?${params}`, { headers: headers(cfg) });
  const entries = [];
  for (const movie of Array.isArray(movies) ? movies : []) {
    for (const [field, label] of RELEASES) {
      const date = movie[field] ? String(movie[field]).slice(0, 10) : null;
      if (!date || date < start || date > end) continue;
      entries.push({
        id: `radarr-${movie.id}-${field}`,
        source: 'radarr',
        type: 'movie',
        date,
        time: null,
        title: movie.title,
        subtitle: movie.year ? String(movie.year) : 'Movie',
        event: label,
        hasFile: Boolean(movie.hasFile),
        monitored: Boolean(movie.monitored),
        poster: imageUrl('radarr', movie.id),
      });
    }
  }
  return entries;
}

export function imageRequest(cfg, ref) {
  if (!/^\d+$/.test(ref)) throw new Error('Invalid Radarr movie id');
  return { url: `${cfg.url}/api/v3/mediacover/${ref}/poster-250.jpg`, headers: headers(cfg) };
}
