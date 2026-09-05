import { fetchJson } from '../http.js';
import { episodeCode, historyEvent, imageUrl, localDate, localTime, queueMessage, queueProgress, queueStatus } from '../util.js';

const headers = (cfg) => ({ 'X-Api-Key': cfg.apiKey });

export async function calendar(cfg, start, end, timeZone) {
  // Pad the window by a day on each side: Sonarr filters on UTC, we display local dates.
  const params = new URLSearchParams({
    start: `${start}T00:00:00Z`,
    end: `${end}T23:59:59Z`,
    includeSeries: 'true',
    unmonitored: 'false',
  });
  const episodes = await fetchJson(`${cfg.url}/api/v3/calendar?${params}`, { headers: headers(cfg) });
  const entries = [];
  for (const ep of Array.isArray(episodes) ? episodes : []) {
    const when = ep.airDateUtc ? new Date(ep.airDateUtc) : null;
    const date = when ? localDate(when, timeZone) : ep.airDate ?? null;
    if (!date || date < start || date > end) continue;
    const series = ep.series ?? {};
    entries.push({
      id: `sonarr-${ep.id}`,
      source: 'sonarr',
      type: 'episode',
      date,
      time: when ? localTime(when, timeZone) : null,
      sortKey: when ? when.getTime() : 0,
      title: series.title ?? 'Unknown series',
      subtitle: `${episodeCode(ep.seasonNumber, ep.episodeNumber)}${ep.title ? ` · ${ep.title}` : ''}`,
      event: ep.seasonNumber > 0 && ep.episodeNumber === 1 ? (ep.seasonNumber === 1 ? 'Premiere' : 'Season premiere') : null,
      network: series.network ?? null,
      hasFile: Boolean(ep.hasFile),
      monitored: Boolean(ep.monitored),
      poster: imageUrl('sonarr', ep.seriesId),
    });
  }
  return entries;
}

/** Full metadata for one episode (with its series), for the detail panel. */
export async function details(cfg, id) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid Sonarr episode id');
  const ep = await fetchJson(`${cfg.url}/api/v3/episode/${id}`, { headers: headers(cfg) });
  if (!ep?.id) throw new Error('That episode is no longer in Sonarr');
  const series = ep.series ?? (ep.seriesId ? await fetchJson(`${cfg.url}/api/v3/series/${ep.seriesId}`, { headers: headers(cfg) }) : {});

  return {
    source: 'sonarr',
    type: 'episode',
    title: series.title ?? 'Unknown series',
    subtitle: `${episodeCode(ep.seasonNumber, ep.episodeNumber)}${ep.title ? ` · ${ep.title}` : ''}`,
    year: series.year ?? null,
    // Prefer the episode's own synopsis; fall back to the series when it has none.
    overview: ep.overview || series.overview || '',
    runtimeMinutes: Number(series.runtime) || null,
    genres: Array.isArray(series.genres) ? series.genres : [],
    contentRating: series.certification ?? null,
    rating: Number.isFinite(Number(series.ratings?.value)) ? Math.round(Number(series.ratings.value) * 10) / 10 : null,
    ratingLabel: 'Series',
    studio: series.network ?? null,
    airedOn: ep.airDate ?? null,
    people: [],
    facts: [
      ['In library', ep.hasFile ? 'Yes' : 'Not yet'],
      ['Monitored', ep.monitored ? 'Yes' : 'No'],
      series.status ? ['Series', String(series.status).replace(/^./, (c) => c.toUpperCase())] : null,
      series.network ? ['Network', series.network] : null,
    ].filter(Boolean),
    poster: imageUrl('sonarr', ep.seriesId),
  };
}

/** What Sonarr is currently downloading or importing. */
export async function queue(cfg) {
  const params = new URLSearchParams({ page: '1', pageSize: '50', includeSeries: 'true', includeEpisode: 'true' });
  const data = await fetchJson(`${cfg.url}/api/v3/queue?${params}`, { headers: headers(cfg) });
  const records = Array.isArray(data?.records) ? data.records : [];
  return records
    .filter((r) => r.episodeId && r.seriesId)
    .map((r) => ({
      id: `sonarr-${r.episodeId}`,
      source: 'sonarr',
      type: 'episode',
      // Not part of the public DownloadItem shape -- kept only so the
      // lifecycle route can match a queue row back to its series.
      seriesId: r.seriesId ?? null,
      // Sonarr's web UI routes by this, not the numeric id above -- see
      // findByTvdbId's own comment.
      titleSlug: r.series?.titleSlug ?? null,
      // The release being grabbed for this episode, e.g. "WEBDL-1080p".
      quality: r.quality?.quality?.name ?? null,
      title: r.series?.title ?? 'Unknown series',
      subtitle: r.episode ? `${episodeCode(r.episode.seasonNumber, r.episode.episodeNumber)}${r.episode.title ? ` · ${r.episode.title}` : ''}` : '',
      sizeBytes: Number(r.size) || 0,
      sizeLeftBytes: Number(r.sizeleft) || 0,
      progress: queueProgress(r.size, r.sizeleft),
      timeleft: r.timeleft ?? null,
      status: queueStatus(r),
      statusDetail: queueMessage(r),
      downloadClient: r.downloadClient ?? null,
      poster: imageUrl('sonarr', r.seriesId),
    }));
}

export function imageRequest(cfg, ref) {
  if (!/^\d+$/.test(ref)) throw new Error('Invalid Sonarr series id');
  return { url: `${cfg.url}/api/v3/mediacover/${ref}/poster-250.jpg`, headers: headers(cfg) };
}

/**
 * Find the Sonarr series behind a TVDB id -- Sonarr's world is TVDB-keyed,
 * not TMDB, so a Seerr TV request needs this bridge before it can be
 * matched against Sonarr's own internal id (what the queue is keyed on).
 *
 * `titleSlug` is a second, separate identifier carried alongside `id`: the
 * REST API is keyed on the numeric id, but Sonarr's own web UI routes
 * series pages by titleSlug instead -- `{sonarrUrl}/series/{id}` looks
 * plausible but 404s since Sonarr never treats the numeric id as a valid
 * path there.
 */
export async function findByTvdbId(cfg, tvdbId) {
  if (!Number.isInteger(tvdbId)) return null;
  const params = new URLSearchParams({ tvdbId: String(tvdbId) });
  const matches = await fetchJson(`${cfg.url}/api/v3/series?${params}`, { headers: headers(cfg) });
  const series = Array.isArray(matches) ? matches[0] : null;
  if (!series?.id) return null;
  const stats = series.statistics ?? {};
  return {
    id: series.id,
    titleSlug: series.titleSlug ?? null,
    monitored: Boolean(series.monitored),
    // Whole-series completeness -- good enough for one waypoint on a card;
    // a per-episode breakdown isn't worth the extra request here.
    hasFile: Number(stats.episodeFileCount) > 0 && Number(stats.percentOfEpisodes) >= 100,
  };
}

/**
 * This series' own grab/import/failure history, most recent first --
 * whole-series like findByTvdbId's hasFile, not broken out per episode.
 * Used for the signal trace's history strip, fetched on demand rather than
 * on every poll.
 */
export async function history(cfg, seriesId) {
  if (!Number.isInteger(seriesId)) return [];
  // includeEpisode -- same param queue()/calendar() already send -- so each
  // record carries its own season/episode for the client's attempt grouping.
  const params = new URLSearchParams({ seriesId: String(seriesId), includeEpisode: 'true' });
  const records = await fetchJson(`${cfg.url}/api/v3/history/series?${params}`, { headers: headers(cfg) });
  return (Array.isArray(records) ? records : [])
    .map((r) => historyEvent(r, 'sonarr'))
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);
}

/** Sonarr's own self-check: dead indexers, an unreachable download client, low disk space. */
export async function health(cfg) {
  const checks = await fetchJson(`${cfg.url}/api/v3/health`, { headers: headers(cfg) });
  // "notice" (e.g. "update available") isn't a problem -- only surface what
  // Sonarr itself calls a warning or an error.
  return (Array.isArray(checks) ? checks : [])
    .filter((c) => c.type === 'error' || c.type === 'warning')
    .map((c, i) => ({ id: `sonarr-health-${i}`, source: 'sonarr', severity: c.type, message: c.message, wikiUrl: c.wikiUrl || null }));
}
