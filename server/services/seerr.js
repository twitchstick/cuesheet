import { fetchJson } from '../http.js';
import { cached } from '../cache.js';
import { tmdbPoster } from '../util.js';

const headers = (cfg) => ({ 'X-Api-Key': cfg.apiKey, 'Content-Type': 'application/json' });

// Overseerr / Jellyseerr MediaStatus enum
const MEDIA_STATUS = { 1: 'none', 2: 'pending', 3: 'processing', 4: 'partial', 5: 'available', 6: 'deleted' };
// MediaRequestStatus enum
const REQUEST_STATUS = { 1: 'pending', 2: 'approved', 3: 'declined', 4: 'failed' };

const mapResult = (r) => ({
  tmdbId: r.id,
  mediaType: r.mediaType,
  title: r.title ?? r.name ?? 'Untitled',
  year: yearOf(r.releaseDate ?? r.firstAirDate),
  overview: r.overview ?? '',
  poster: tmdbPoster(r.posterPath),
  status: MEDIA_STATUS[r.mediaInfo?.status] ?? 'none',
});

export async function search(cfg, query, page = 1) {
  const params = new URLSearchParams({ query, page: String(page), language: 'en' });
  const data = await fetchJson(`${cfg.url}/api/v1/search?${params}`, { headers: headers(cfg) });
  return (data?.results ?? []).filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv').map(mapResult);
}

export async function trending(cfg) {
  const data = await fetchJson(`${cfg.url}/api/v1/discover/trending?page=1&language=en`, { headers: headers(cfg) });
  return (data?.results ?? []).filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv').map(mapResult);
}

export async function details(cfg, mediaType, tmdbId) {
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  return cached(`seerr:details:${kind}:${tmdbId}`, 6 * 60 * 60 * 1000, async () => {
    const d = await fetchJson(`${cfg.url}/api/v1/${kind}/${tmdbId}`, { headers: headers(cfg) });
    return {
      tmdbId: d.id,
      mediaType: kind,
      title: d.title ?? d.name ?? 'Untitled',
      year: yearOf(d.releaseDate ?? d.firstAirDate),
      overview: d.overview ?? '',
      poster: tmdbPoster(d.posterPath),
      status: MEDIA_STATUS[d.mediaInfo?.status] ?? 'none',
      seasons: (d.seasons ?? [])
        .filter((s) => s.seasonNumber > 0)
        .map((s) => ({ seasonNumber: s.seasonNumber, name: s.name, episodeCount: s.episodeCount ?? 0 })),
    };
  });
}

export async function recentRequests(cfg, take = 12) {
  const params = new URLSearchParams({ take: String(take), skip: '0', sort: 'added', filter: 'all' });
  const data = await fetchJson(`${cfg.url}/api/v1/request?${params}`, { headers: headers(cfg) });
  const results = data?.results ?? [];
  return Promise.all(
    results.map(async (req) => {
      const mediaType = req.type === 'tv' ? 'tv' : 'movie';
      const tmdbId = req.media?.tmdbId;
      // Only TV requests carry this -- it's the bridge to Sonarr, which is
      // TVDB-keyed rather than TMDB-keyed like everything else here.
      const tvdbId = mediaType === 'tv' ? req.media?.tvdbId ?? null : null;
      let info = null;
      if (tmdbId) {
        try {
          info = await details(cfg, mediaType, tmdbId);
        } catch {
          info = null;
        }
      }
      return {
        id: req.id,
        mediaType,
        tmdbId: tmdbId ?? null,
        tvdbId,
        title: info?.title ?? `TMDB #${tmdbId ?? '?'}`,
        year: info?.year ?? null,
        poster: info?.poster ?? null,
        requestStatus: REQUEST_STATUS[req.status] ?? 'pending',
        mediaStatus: MEDIA_STATUS[req.media?.status] ?? 'none',
        seasons: (req.seasons ?? []).map((s) => s.seasonNumber).filter((n) => n > 0),
        requestedBy: req.requestedBy?.displayName ?? req.requestedBy?.email ?? 'Someone',
        avatar: req.requestedBy?.avatar ?? null,
        createdAt: req.createdAt ? new Date(req.createdAt).getTime() : 0,
      };
    }),
  );
}

export async function createRequest(cfg, { mediaType, tmdbId, seasons }) {
  const body = { mediaType, mediaId: tmdbId };
  if (mediaType === 'tv') body.seasons = Array.isArray(seasons) && seasons.length ? seasons : 'all';
  if (cfg.userId) body.userId = Number(cfg.userId);
  const created = await fetchJson(`${cfg.url}/api/v1/request`, { method: 'POST', headers: headers(cfg), body });
  return {
    id: created?.id ?? null,
    requestStatus: REQUEST_STATUS[created?.status] ?? 'pending',
  };
}

function yearOf(date) {
  const y = date ? String(date).slice(0, 4) : '';
  return /^\d{4}$/.test(y) ? Number(y) : null;
}
