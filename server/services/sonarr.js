import { fetchJson } from '../http.js';
import { episodeCode, imageUrl, localDate, localTime } from '../util.js';

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

export function imageRequest(cfg, ref) {
  if (!/^\d+$/.test(ref)) throw new Error('Invalid Sonarr series id');
  return { url: `${cfg.url}/api/v3/mediacover/${ref}/poster-250.jpg`, headers: headers(cfg) };
}
