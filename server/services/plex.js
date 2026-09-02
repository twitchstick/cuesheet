import { fetchJson } from '../http.js';
import { episodeCode, imageUrl } from '../util.js';

const headers = (cfg) => ({
  'X-Plex-Token': cfg.token,
  'X-Plex-Client-Identifier': 'cuesheet',
  'X-Plex-Product': 'Cuesheet',
  'X-Plex-Version': '0.1',
});

const VIDEO_TYPES = new Set(['movie', 'episode']);

export async function sessions(cfg) {
  const data = await fetchJson(`${cfg.url}/status/sessions`, { headers: headers(cfg) });
  const items = data?.MediaContainer?.Metadata ?? [];
  return items
    .filter((m) => VIDEO_TYPES.has(m.type))
    .map((m) => {
      const isEpisode = m.type === 'episode';
      const duration = Number(m.duration) || 0;
      const offset = Number(m.viewOffset) || 0;
      const transcode = m.TranscodeSession;
      const transcoding = Boolean(transcode && (transcode.videoDecision === 'transcode' || transcode.audioDecision === 'transcode'));
      return {
        id: `plex-${m.sessionKey ?? m.ratingKey}`,
        source: 'plex',
        type: m.type,
        title: isEpisode ? m.grandparentTitle : m.title,
        subtitle: isEpisode ? `${episodeCode(m.parentIndex, m.index)} · ${m.title}` : m.year ? String(m.year) : '',
        user: m.User?.title ?? 'Unknown',
        player: m.Player?.product || m.Player?.title || 'Unknown player',
        device: m.Player?.title || m.Player?.platform || '',
        state: m.Player?.state ?? 'playing',
        progress: duration ? Math.min(1, offset / duration) : 0,
        durationMs: duration,
        offsetMs: offset,
        transcoding,
        transcodeSpeed: transcoding && Number.isFinite(Number(transcode?.speed)) ? Number(transcode.speed) : null,
        bandwidthKbps: bandwidthOf(m),
        quality: normaliseResolution(m.Media?.[0]?.videoResolution),
        location: m.Session?.location === 'wan' ? 'remote' : m.Session?.location === 'lan' ? 'local' : null,
        poster: imageUrl('plex', isEpisode ? m.grandparentThumb || m.parentThumb || m.thumb : m.thumb),
        backdrop: imageUrl('plex', m.art || m.grandparentArt || null, { w: '1280', h: '720' }),
        attention: attentionFor(m.Player?.state, transcoding, transcode),
      };
    });
}

export async function recentlyAdded(cfg, limit) {
  const url = `${cfg.url}/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=${limit * 2}`;
  const data = await fetchJson(url, { headers: headers(cfg) });
  const items = data?.MediaContainer?.Metadata ?? [];
  return items
    .filter((m) => ['movie', 'show', 'season', 'episode'].includes(m.type))
    .map((m) => {
      const base = {
        id: `plex-${m.ratingKey}`,
        source: 'plex',
        type: m.type,
        addedAt: (Number(m.addedAt) || 0) * 1000,
        year: m.year ?? m.parentYear ?? null,
      };
      switch (m.type) {
        case 'episode':
          return {
            ...base,
            title: m.grandparentTitle,
            subtitle: `${episodeCode(m.parentIndex, m.index)} · ${m.title}`,
            poster: imageUrl('plex', m.grandparentThumb || m.parentThumb || m.thumb),
          };
        case 'season':
          return {
            ...base,
            title: m.parentTitle,
            subtitle: m.title,
            poster: imageUrl('plex', m.thumb || m.parentThumb),
          };
        case 'show':
          return {
            ...base,
            title: m.title,
            subtitle: m.childCount ? `${m.childCount} season${m.childCount === 1 ? '' : 's'}` : 'Series',
            poster: imageUrl('plex', m.thumb),
          };
        default:
          return {
            ...base,
            title: m.title,
            subtitle: m.year ? String(m.year) : 'Movie',
            poster: imageUrl('plex', m.thumb),
          };
      }
    })
    .slice(0, limit);
}

/** Resolve a Plex thumb path into a sized transcode URL + headers for the proxy. */
export function imageRequest(cfg, ref, { width = 300, height = 450 } = {}) {
  if (!ref.startsWith('/')) throw new Error('Invalid Plex image path');
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    minSize: '1',
    upscale: '1',
    url: ref,
  });
  return { url: `${cfg.url}/photo/:/transcode?${params.toString()}`, headers: headers(cfg) };
}

/**
 * What this stream costs the server, in kbps. Plex reports its own estimate
 * per session; fall back to the file's bitrate when it doesn't.
 */
function bandwidthOf(m) {
  const session = Number(m.Session?.bandwidth);
  if (Number.isFinite(session) && session > 0) return Math.round(session);
  const bitrate = Number(m.Media?.[0]?.bitrate);
  return Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate) : null;
}

function attentionFor(state, transcoding, transcode) {
  if (state === 'buffering') return 'Buffering';
  if (transcoding && transcode?.throttled === false && Number(transcode?.speed) > 0 && Number(transcode.speed) < 1) return 'Slow';
  return null;
}

function normaliseResolution(res) {
  if (!res) return null;
  const s = String(res).toLowerCase();
  if (s === '4k' || s === '2160') return '4K';
  if (/^\d+$/.test(s)) return `${s}p`;
  return s.toUpperCase();
}
