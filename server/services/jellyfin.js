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
        // The library item behind the session, so the detail panel can look it up.
        itemId: item.Id ? `jellyfin-${item.Id}` : null,
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
        bandwidthKbps: bandwidthOf(s, item),
        quality: resolutionLabel(item),
        location: locationFor(s.RemoteEndPoint),
        poster: posterFor(item),
        backdrop: imageUrl('jellyfin', isEpisode && item.SeriesId ? item.SeriesId : item.Id, { kind: 'backdrop' }),
        attention: null,
        tech: techOf(s, item),
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

/** Full metadata for one library item, for the detail panel. */
export async function details(cfg, id) {
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error('Invalid Jellyfin item id');
  const base = cfg.userId ? `${cfg.url}/Users/${encodeURIComponent(cfg.userId)}/Items/${id}` : `${cfg.url}/Items/${id}`;
  const item = await fetchJson(base, { headers: headers(cfg) });
  if (!item?.Id) throw new Error('That item is no longer in the library');
  const isEpisode = item.Type === 'Episode';
  const streams = Array.isArray(item.MediaStreams) ? item.MediaStreams : [];
  const video = streams.find((v) => v.Type === 'Video') ?? {};
  const audio = streams.find((a) => a.Type === 'Audio') ?? {};
  const people = Array.isArray(item.People) ? item.People : [];

  return {
    source: 'jellyfin',
    type: isEpisode ? 'episode' : item.Type === 'Series' ? 'show' : item.Type === 'Season' ? 'season' : 'movie',
    title: isEpisode ? item.SeriesName ?? item.Name : item.Name,
    subtitle: isEpisode ? `${episodeCode(item.ParentIndexNumber, item.IndexNumber)} · ${item.Name}` : item.Taglines?.[0] ?? '',
    year: item.ProductionYear ?? null,
    overview: item.Overview ?? '',
    runtimeMinutes: Number(item.RunTimeTicks) ? Math.round(Number(item.RunTimeTicks) / TICKS_PER_MS / 60000) : null,
    genres: Array.isArray(item.Genres) ? item.Genres : [],
    contentRating: item.OfficialRating ?? null,
    rating: Number.isFinite(Number(item.CommunityRating)) ? Math.round(Number(item.CommunityRating) * 10) / 10 : null,
    ratingLabel: 'Community',
    studio: item.Studios?.[0]?.Name ?? item.SeriesStudio ?? null,
    airedOn: item.PremiereDate ? String(item.PremiereDate).slice(0, 10) : null,
    people: [
      ...people.filter((x) => x.Type === 'Director').map((x) => ({ name: x.Name, role: 'Director' })),
      ...people.filter((x) => x.Type === 'Actor').slice(0, 6).map((x) => ({ name: x.Name, role: 'Cast' })),
    ],
    facts: [
      video.Height ? ['Quality', video.Height >= 2000 ? '4K' : `${video.Height}p`] : null,
      item.Container ? ['Container', String(item.Container).toUpperCase()] : null,
      video.Codec ? ['Video', String(video.Codec).toUpperCase()] : null,
      audio.Codec ? ['Audio', String(audio.Codec).toUpperCase()] : null,
    ].filter(Boolean),
    poster: posterFor(item),
  };
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

const channelLabel = (n) => {
  const c = Number(n);
  if (!Number.isFinite(c) || c <= 0) return null;
  return { 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' }[c] ?? `${c}ch`;
};

const upper = (v) => (v ? String(v).toUpperCase() : null);

/** Turn Jellyfin's CamelCase transcode reasons into something readable. */
const readableReason = (r) => String(r).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/**
 * The technical side of a session. Built from the session payload we already
 * hold, so opening a stream costs no extra call to Jellyfin.
 */
function techOf(session, item) {
  const streams = Array.isArray(item.MediaStreams) ? item.MediaStreams : [];
  const video = streams.find((s) => s.Type === 'Video') ?? {};
  const audio = streams.find((s) => s.Type === 'Audio' && s.IsDefault) ?? streams.find((s) => s.Type === 'Audio') ?? {};
  const subtitle = streams.find((s) => s.Type === 'Subtitle' && s.IsDefault);
  const source = item.MediaSources?.[0] ?? {};
  const ti = session.TranscodingInfo ?? null;
  const method = session.PlayState?.PlayMethod ?? null;
  const label = method === 'Transcode' ? 'Transcode' : method === 'DirectStream' ? 'Direct stream' : method === 'DirectPlay' ? 'Direct play' : null;

  const bitrate = (bps) => (Number(bps) > 0 ? Math.round(Number(bps) / 1000) : null);

  return {
    container: upper(source.Container || item.Container),
    fileBitrateKbps: bitrate(source.Bitrate || item.Bitrate),
    video: {
      codec: upper(video.Codec),
      profile: video.Profile ? String(video.Profile) : null,
      resolution: video.Width && video.Height ? `${video.Width}×${video.Height}` : null,
      frameRate: video.RealFrameRate ? String(Math.round(Number(video.RealFrameRate) * 100) / 100) : null,
      bitrateKbps: bitrate(video.BitRate),
      // Jellyfin reports the method for the session as a whole, not per stream.
      decision: ti?.IsVideoDirect === true ? 'Direct stream' : ti ? 'Transcode' : label,
      target: ti && ti.IsVideoDirect !== true ? upper(ti.VideoCodec) : null,
    },
    audio: {
      codec: upper(audio.Codec),
      channels: channelLabel(audio.Channels),
      language: audio.Language ?? null,
      decision: ti?.IsAudioDirect === true ? 'Direct stream' : ti ? 'Transcode' : label,
      target: ti && ti.IsAudioDirect !== true ? upper(ti.AudioCodec) : null,
    },
    subtitle: subtitle ? [subtitle.Language || subtitle.DisplayTitle || 'Subtitle', upper(subtitle.Codec)].filter(Boolean).join(' · ') : null,
    containerTarget: ti?.Container ? upper(ti.Container) : null,
    // Unlike Plex, Jellyfin says why it is transcoding.
    changes: ti && Array.isArray(ti.TranscodeReasons) ? ti.TranscodeReasons.map(readableReason) : [],
    hardware: ti ? Boolean(ti.HardwareAccelerationType) : null,
    throttled: null,
  };
}

/** Jellyfin reports bits per second; the dashboard works in kbps. */
function bandwidthOf(session, item) {
  const bps =
    Number(session.TranscodingInfo?.Bitrate) ||
    Number(item.Bitrate) ||
    Number(item.MediaSources?.[0]?.Bitrate) ||
    (item.MediaStreams ?? []).reduce((sum, st) => sum + (Number(st.BitRate) || 0), 0);
  return Number.isFinite(bps) && bps > 0 ? Math.round(bps / 1000) : null;
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
