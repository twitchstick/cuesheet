import { fetchJson } from '../http.js';
import { historyEvent, imageUrl, queueMessage, queueProgress, queueStatus } from '../util.js';

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

/** Full metadata for one movie, for the detail panel. */
export async function details(cfg, id) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid Radarr movie id');
  const movie = await fetchJson(`${cfg.url}/api/v3/movie/${id}`, { headers: headers(cfg) });
  if (!movie?.id) throw new Error('That movie is no longer in Radarr');
  const file = movie.movieFile ?? null;
  const gb = (bytes) => (Number(bytes) > 0 ? `${(Number(bytes) / 1024 ** 3).toFixed(1)} GB` : null);

  return {
    source: 'radarr',
    type: 'movie',
    title: movie.title,
    subtitle: movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : '',
    year: movie.year ?? null,
    overview: movie.overview ?? '',
    runtimeMinutes: Number(movie.runtime) || null,
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    contentRating: movie.certification ?? null,
    rating: Number.isFinite(Number(movie.ratings?.tmdb?.value)) ? Math.round(Number(movie.ratings.tmdb.value) * 10) / 10 : null,
    ratingLabel: 'TMDB',
    studio: movie.studio ?? null,
    airedOn: movie.inCinemas ? String(movie.inCinemas).slice(0, 10) : null,
    people: [],
    facts: [
      ['In library', movie.hasFile ? 'Yes' : 'Not yet'],
      ['Monitored', movie.monitored ? 'Yes' : 'No'],
      movie.status ? ['Status', String(movie.status).replace(/^./, (c) => c.toUpperCase())] : null,
      movie.digitalRelease ? ['Digital', String(movie.digitalRelease).slice(0, 10)] : null,
      movie.physicalRelease ? ['Physical', String(movie.physicalRelease).slice(0, 10)] : null,
      file?.quality?.quality?.name ? ['Quality', file.quality.quality.name] : null,
      gb(file?.size) ? ['Size', gb(file.size)] : null,
    ].filter(Boolean),
    poster: imageUrl('radarr', movie.id),
  };
}

/** What Radarr is currently downloading or importing. */
export async function queue(cfg) {
  const params = new URLSearchParams({ page: '1', pageSize: '50', includeMovie: 'true', includeUnknownMovieItems: 'false' });
  const data = await fetchJson(`${cfg.url}/api/v3/queue?${params}`, { headers: headers(cfg) });
  const records = Array.isArray(data?.records) ? data.records : [];
  return records
    .filter((r) => r.movieId)
    .map((r) => ({
      id: `radarr-${r.movieId}`,
      source: 'radarr',
      type: 'movie',
      title: r.movie?.title ?? r.title ?? 'Unknown movie',
      subtitle: r.movie?.year ? String(r.movie.year) : '',
      sizeBytes: Number(r.size) || 0,
      sizeLeftBytes: Number(r.sizeleft) || 0,
      progress: queueProgress(r.size, r.sizeleft),
      timeleft: r.timeleft ?? null,
      status: queueStatus(r),
      statusDetail: queueMessage(r),
      downloadClient: r.downloadClient ?? null,
      poster: imageUrl('radarr', r.movieId),
    }));
}

export function imageRequest(cfg, ref) {
  if (!/^\d+$/.test(ref)) throw new Error('Invalid Radarr movie id');
  return { url: `${cfg.url}/api/v3/mediacover/${ref}/poster-250.jpg`, headers: headers(cfg) };
}

/**
 * Find the Radarr movie behind a TMDB id -- the bridge from a Seerr request
 * (which only knows TMDB) to Radarr's own internal id, which the queue and
 * everything else here is keyed on. Radarr's list endpoint takes tmdbId as
 * a query filter and returns at most one match.
 */
export async function findByTmdbId(cfg, tmdbId) {
  if (!Number.isInteger(tmdbId)) return null;
  const params = new URLSearchParams({ tmdbId: String(tmdbId) });
  const matches = await fetchJson(`${cfg.url}/api/v3/movie?${params}`, { headers: headers(cfg) });
  const movie = Array.isArray(matches) ? matches[0] : null;
  if (!movie?.id) return null;
  return { id: movie.id, monitored: Boolean(movie.monitored), hasFile: Boolean(movie.hasFile) };
}

/**
 * This movie's own grab/import/failure history, most recent first --
 * Radarr's per-title record, not the app-wide activity log. Used for the
 * signal trace's history strip, fetched on demand rather than on every poll.
 */
export async function history(cfg, movieId) {
  if (!Number.isInteger(movieId)) return [];
  const params = new URLSearchParams({ movieId: String(movieId) });
  const records = await fetchJson(`${cfg.url}/api/v3/history/movie?${params}`, { headers: headers(cfg) });
  return (Array.isArray(records) ? records : [])
    .map((r) => historyEvent(r, 'radarr'))
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);
}

/** Radarr's own self-check: dead indexers, an unreachable download client, low disk space. */
export async function health(cfg) {
  const checks = await fetchJson(`${cfg.url}/api/v3/health`, { headers: headers(cfg) });
  // "notice" (e.g. "update available") isn't a problem -- only surface what
  // Radarr itself calls a warning or an error.
  return (Array.isArray(checks) ? checks : [])
    .filter((c) => c.type === 'error' || c.type === 'warning')
    .map((c, i) => ({ id: `radarr-health-${i}`, source: 'radarr', severity: c.type, message: c.message, wikiUrl: c.wikiUrl || null }));
}
