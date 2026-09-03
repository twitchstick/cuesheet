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
        // The library item behind the session, so the detail panel can look it up.
        itemId: m.ratingKey ? `plex-${m.ratingKey}` : null,
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
        tech: techOf(m),
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

/** Full metadata for one library item, for the detail panel. */
export async function details(cfg, ratingKey) {
  if (!/^\d+$/.test(ratingKey)) throw new Error('Invalid Plex item id');
  const data = await fetchJson(`${cfg.url}/library/metadata/${ratingKey}`, { headers: headers(cfg) });
  const m = data?.MediaContainer?.Metadata?.[0];
  if (!m) throw new Error('That item is no longer in the library');
  const isEpisode = m.type === 'episode';
  const names = (list, key = 'tag') => (Array.isArray(list) ? list.map((x) => x[key]).filter(Boolean) : []);
  const media = m.Media?.[0] ?? {};

  return {
    source: 'plex',
    type: m.type,
    title: isEpisode ? m.grandparentTitle : m.title,
    subtitle: isEpisode ? `${episodeCode(m.parentIndex, m.index)} · ${m.title}` : m.tagline || '',
    year: m.year ?? m.parentYear ?? null,
    overview: m.summary ?? '',
    runtimeMinutes: Number(m.duration) ? Math.round(Number(m.duration) / 60000) : null,
    genres: names(m.Genre),
    contentRating: m.contentRating ?? null,
    rating: Number.isFinite(Number(m.rating)) ? Math.round(Number(m.rating) * 10) / 10 : null,
    ratingLabel: 'Critics',
    studio: m.studio ?? null,
    airedOn: m.originallyAvailableAt ?? null,
    people: [
      ...names(m.Director).map((name) => ({ name, role: 'Director' })),
      ...names(m.Role).slice(0, 6).map((name) => ({ name, role: 'Cast' })),
    ],
    facts: [
      media.videoResolution ? ['Quality', normaliseResolution(media.videoResolution) ?? String(media.videoResolution)] : null,
      media.container ? ['Container', String(media.container).toUpperCase()] : null,
      media.videoCodec ? ['Video', String(media.videoCodec).toUpperCase()] : null,
      media.audioCodec ? ['Audio', String(media.audioCodec).toUpperCase()] : null,
    ].filter(Boolean),
    poster: imageUrl('plex', isEpisode ? m.grandparentThumb || m.parentThumb || m.thumb : m.thumb),
  };
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

/** Map a Plex per-stream decision onto the words the UI uses. */
const DECISION = { directplay: 'Direct play', copy: 'Direct stream', transcode: 'Transcode' };

const channelLabel = (n) => {
  const c = Number(n);
  if (!Number.isFinite(c) || c <= 0) return null;
  return { 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' }[c] ?? `${c}ch`;
};

const upper = (v) => (v ? String(v).toUpperCase() : null);

/**
 * The technical side of a session: what the file is, and what the server is
 * doing to it. Everything here comes from the session payload we already
 * fetched, so opening a stream costs no extra call to Plex.
 */
function techOf(m) {
  const media = m.Media?.[0] ?? {};
  const part = media.Part?.[0] ?? {};
  const all = Array.isArray(part.Stream) ? part.Stream : [];
  const video = all.find((s) => Number(s.streamType) === 1) ?? {};
  const audio = all.find((s) => Number(s.streamType) === 2 && s.selected !== false) ?? {};
  const subtitle = all.find((s) => Number(s.streamType) === 3 && s.selected);
  const ts = m.TranscodeSession ?? null;

  const width = Number(video.width || media.width) || null;
  const height = Number(video.height || media.height) || null;
  const videoDecision = video.decision ?? (ts?.videoDecision || null);
  const audioDecision = audio.decision ?? (ts?.audioDecision || null);

  return {
    container: media.container ? String(media.container).toUpperCase() : null,
    fileBitrateKbps: Number(media.bitrate) || null,
    video: {
      codec: upper(video.codec || media.videoCodec),
      profile: video.profile ? String(video.profile) : null,
      resolution: width && height ? `${width}×${height}` : normaliseResolution(media.videoResolution),
      frameRate: video.frameRate ? String(video.frameRate) : null,
      bitrateKbps: Number(video.bitrate) || null,
      decision: DECISION[videoDecision] ?? null,
      target: ts?.videoDecision === 'transcode' ? upper(ts.videoCodec) : null,
    },
    audio: {
      codec: upper(audio.codec || media.audioCodec),
      channels: channelLabel(audio.channels ?? media.audioChannels),
      language: audio.language ?? null,
      decision: DECISION[audioDecision] ?? null,
      target: ts?.audioDecision === 'transcode' ? upper(ts.audioCodec) : null,
    },
    subtitle: subtitle
      ? [subtitle.language || subtitle.displayTitle || 'Subtitle', upper(subtitle.codec), subtitle.burn ? 'burned in' : null]
          .filter(Boolean)
          .join(' · ')
      : null,
    containerTarget: ts?.container && ts.container !== media.container ? upper(ts.container) : null,
    // Plex does not say why it is transcoding, and the video and audio rows
    // already show what it changed, so there is nothing honest to add here.
    changes: [],
    hardware: ts ? Boolean(ts.transcodeHwRequested) : null,
    throttled: ts ? Boolean(ts.throttled) : null,
  };
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
