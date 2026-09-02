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

export function imageRequest(cfg, ref) {
  if (!/^\d+$/.test(ref)) throw new Error('Invalid Sonarr series id');
  return { url: `${cfg.url}/api/v3/mediacover/${ref}/poster-250.jpg`, headers: headers(cfg) };
}
