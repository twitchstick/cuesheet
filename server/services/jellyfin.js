import { fetchJson } from '../http.js';
import { episodeCode, imageUrl } from '../util.js';

const TICKS_PER_MS = 10_000;
const headers = (cfg) => ({
  Authorization: `MediaBrowser Token="${cfg.apiKey}", Client="Cuesheet", Device="Cuesheet", DeviceId="cuesheet", Version="0.1"`,
});

const VIDEO_TYPES = new Set(['Movie', 'Episode']);

export async function sessions(cfg) {
  const data = await fetchJson(`${cfg.url}/Sessions?ActiveWithinSeconds=600`, { headers: headers(cfg) });
  return (Array.isArray(data) ? data : [])
    .filter((s) => s.NowPlayingItem && VIDEO_TYPES.has(s.NowPlayingItem.Type))
    .map((s) => {
      const item = s.NowPlayingItem;
      const isEpisode = item.Type === 'Episode';
      const durationMs = (Number(item.RunTimeTicks) || 0) / TICKS_PER_MS;
      const offsetMs = (Number(s.PlayState?.PositionTicks) || 0) / TICKS_PER_MS;
      const method = s.PlayState?.PlayMethod;
      return {
        id: `jellyfin-${s.Id}`,
        source: 'jellyfin',
        type: isEpisode ? 'episode' : 'movie',
        title: isEpisode ? item.SeriesName : item.Name,
        subtitle: isEpisode
          ? `${episodeCode(item.ParentIndexNumber, item.IndexNumber)} · ${item.Name}`
          : item.ProductionYear
            ? String(item.ProductionYear)
            : '',
        user: s.UserName ?? 'Unknown',
        player: s.Client ?? 'Unknown player',
        device: s.DeviceName ?? '',
        state: s.PlayState?.IsPaused ? 'paused' : 'playing',
        progress: durationMs ? Math.min(1, offsetMs / durationMs) : 0,
        durationMs,
        offsetMs,
        transcoding: method === 'Transcode',
        transcodeSpeed: null,
        quality: resolutionLabel(item),
        location: locationFor(s.RemoteEndPoint),
        poster: posterFor(item),
        backdrop: imageUrl('jellyfin', isEpisode && item.SeriesId ? item.SeriesId : item.Id, { kind: 'backdrop' }),
        attention: null,
      };
    });
}

export async function recentlyAdded(cfg, limit) {
  const params = new URLSearchParams({
    Limit: String(limit),
    Fields: 'DateCreated,ProductionYear,ChildCount',
    IncludeItemTypes: 'Movie,Episode,Series,Season',
    EnableImages: 'true',
  });
  let items;
  if (cfg.userId) {
    const data = await fetchJson(`${cfg.url}/Users/${encodeURIComponent(cfg.userId)}/Items/Latest?${params}`, {
      headers: headers(cfg),
    });
    items = Array.isArray(data) ? data : [];
  } else {
    params.set('SortBy', 'DateCreated');
    params.set('SortOrder', 'Descending');
    params.set('Recursive', 'true');
    const data = await fetchJson(`${cfg.url}/Items?${params}`, { headers: headers(cfg) });
    items = data?.Items ?? [];
  }
  return items.map((item) => {
    const base = {
      id: `jellyfin-${item.Id}`,
      source: 'jellyfin',
      addedAt: item.DateCreated ? new Date(item.DateCreated).getTime() : 0,
      year: item.ProductionYear ?? null,
      poster: posterFor(item),
    };
    switch (item.Type) {
      case 'Episode':
        return {
          ...base,
          type: 'episode',
          title: item.SeriesName ?? item.Name,
          subtitle: `${episodeCode(item.ParentIndexNumber, item.IndexNumber)} · ${item.Name}`,
        };
      case 'Season':
        return { ...base, type: 'season', title: item.SeriesName ?? item.Name, subtitle: item.Name };
      case 'Series':
        return {
          ...base,
          type: 'show',
          title: item.Name,
          subtitle: item.ChildCount ? `${item.ChildCount} season${item.ChildCount === 1 ? '' : 's'}` : 'Series',
        };
      default:
        return { ...base, type: 'movie', title: item.Name, subtitle: item.ProductionYear ? String(item.ProductionYear) : 'Movie' };
    }
  });
}

/** Prefer the series poster for episodes so the row reads as "what show", not a still frame. */
function posterFor(item) {
  if (item.Type === 'Episode' && item.SeriesId) {
    return imageUrl('jellyfin', item.SeriesId, item.SeriesPrimaryImageTag ? { tag: item.SeriesPrimaryImageTag } : {});
  }
  if (item.Type === 'Season' && !item.ImageTags?.Primary && item.SeriesId) {
    return imageUrl('jellyfin', item.SeriesId);
  }
  const tag = item.ImageTags?.Primary;
  return imageUrl('jellyfin', item.Id, tag ? { tag } : {});
}

export function imageRequest(cfg, ref, { width = 300, tag, kind } = {}) {
  if (!/^[A-Za-z0-9-]+$/.test(ref)) throw new Error('Invalid Jellyfin item id');
  const backdrop = kind === 'backdrop';
  const params = new URLSearchParams({ maxWidth: String(backdrop ? 1280 : width), quality: '90' });
  if (tag && !backdrop) params.set('tag', tag);
  return { url: `${cfg.url}/Items/${ref}/Images/${backdrop ? 'Backdrop' : 'Primary'}?${params}`, headers: headers(cfg) };
}

function locationFor(endpoint) {
  if (!endpoint) return null;
  const ip = String(endpoint).replace(/^::ffff:/, '');
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|::1$|fc|fd|fe80)/i.test(ip)) return 'local';
  return 'remote';
}

function resolutionLabel(item) {
  const stream = item.MediaStreams?.find((s) => s.Type === 'Video');
  const h = stream?.Height ?? (item.Height || null);
  if (!h) return null;
  if (h >= 2000) return '4K';
  return `${h}p`;
}
