/**
 * Demo mode: realistic-looking sample data so the dashboard can be previewed
 * before any service is connected. Posters are generated SVG gradients.
 */
import { addDays, localDate } from './util.js';

const img = (key, title, sub, kind = 'poster') =>
  `/api/image?${new URLSearchParams({ s: 'demo', p: key, t: title, ...(sub ? { u: sub } : {}), ...(kind !== 'poster' ? { kind } : {}) })}`;

const MIN = 60_000;
const HOUR = 60 * MIN;

export function streams() {
  return [
    {
      id: 'demo-1', source: 'plex', type: 'movie', title: 'The Last Horizon', subtitle: '2026',
      user: 'Christopher', player: 'Plex for Apple TV', device: 'Living Room TV', state: 'playing',
      durationMs: 112 * MIN, offsetMs: 68 * MIN + 42_000, progress: (68 * MIN + 42_000) / (112 * MIN),
      transcoding: false, transcodeSpeed: null, quality: '4K', location: 'local', attention: null,
      poster: img('horizon', 'The Last Horizon', 'A film by A. Vale'), backdrop: img('horizon', '', '', 'backdrop'),
    },
    {
      id: 'demo-2', source: 'plex', type: 'episode', title: 'Arcadia', subtitle: 'S02E06 · The Long Way Round',
      user: 'Maya', player: 'Plex Web', device: 'Chrome', state: 'playing',
      durationMs: 54 * MIN, offsetMs: 12 * MIN, progress: 12 / 54,
      transcoding: true, transcodeSpeed: 0.8, quality: '1080p', location: 'remote', attention: 'Slow',
      poster: img('arcadia', 'Arcadia', 'The final season'), backdrop: img('arcadia', '', '', 'backdrop'),
    },
    {
      id: 'demo-3', source: 'jellyfin', type: 'movie', title: 'Glass House', subtitle: '2025',
      user: 'Riley', player: 'Jellyfin Mobile', device: 'Pixel 9', state: 'buffering',
      durationMs: 98 * MIN, offsetMs: 31 * MIN, progress: 31 / 98,
      transcoding: true, transcodeSpeed: null, quality: '1080p', location: 'remote', attention: 'Buffering',
      poster: img('glass', 'Glass House', 'Nothing stays hidden'), backdrop: img('glass', '', '', 'backdrop'),
    },
    {
      id: 'demo-4', source: 'jellyfin', type: 'episode', title: 'Redline', subtitle: 'S01E04 · Cold Start',
      user: 'Sam', player: 'Jellyfin Web', device: 'Firefox', state: 'paused',
      durationMs: 47 * MIN, offsetMs: 40 * MIN, progress: 40 / 47,
      transcoding: false, transcodeSpeed: null, quality: '1080p', location: 'local', attention: null,
      poster: img('redline', 'Redline', 'Original series'), backdrop: img('redline', '', '', 'backdrop'),
    },
  ];
}

export function recent(now = Date.now()) {
  const items = [
    ['blue', 'Blue Current', 'A film by A. Vale', 'movie', 2026, 'Movie', 2 * HOUR],
    ['arcadia', 'Arcadia', 'The final season', 'episode', 2026, 'S02E06 · The Long Way Round', 5 * HOUR],
    ['forest', 'The Quiet Forest', 'Nothing stays buried', 'movie', 2026, 'Movie', 9 * HOUR],
    ['redline', 'Redline', 'Original series', 'episode', 2025, 'S01E04 · Cold Start', 26 * HOUR],
    ['dust', 'Empire of Dust', 'The sands remember', 'movie', 2025, 'Movie', 2 * 24 * HOUR],
    ['polaris', 'Polaris', 'Beyond the dark', 'episode', 2024, 'S03E01 · Reentry', 3 * 24 * HOUR],
    ['glass', 'Glass House', 'Nothing stays hidden', 'movie', 2025, 'Movie', 4 * 24 * HOUR],
    ['harbor', 'Harbor Lights', 'Season 2', 'season', 2023, 'Season 2', 5 * 24 * HOUR],
    ['meridian', 'Meridian', 'A new series', 'show', 2026, '1 season', 6 * 24 * HOUR],
    ['tides', 'Tides of Iron', 'Hold the line', 'movie', 2024, 'Movie', 8 * 24 * HOUR],
    ['signal', 'Signal Lost', 'Season 4', 'season', 2022, 'Season 4', 9 * 24 * HOUR],
    ['orchard', 'The Orchard', 'S01E01', 'episode', 2026, 'S01E01 · Roots', 12 * 24 * HOUR],
  ];
  return items.map(([key, title, tag, type, year, subtitle, ago], i) => ({
    id: `demo-${key}`,
    source: i % 3 === 2 ? 'jellyfin' : 'plex',
    type,
    title,
    subtitle: type === 'movie' ? String(year) : subtitle,
    addedAt: now - ago,
    year,
    poster: img(key, title, tag),
  }));
}

export function calendar(start, end, timeZone) {
  const today = localDate(new Date(), timeZone);
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const day = (n) => addDays(monday, n);
  const all = [
    { id: 'demo-c1', source: 'radarr', type: 'movie', date: day(1), time: null, title: 'Blue Current', subtitle: '2026', event: 'Digital', hasFile: false, monitored: true, poster: img('blue', 'Blue Current', 'A film by A. Vale') },
    { id: 'demo-c2', source: 'sonarr', type: 'episode', date: day(2), time: '21:00', title: 'Arcadia', subtitle: 'S02E07 · Last Light', event: null, hasFile: false, monitored: true, poster: img('arcadia', 'Arcadia', 'The final season') },
    { id: 'demo-c3', source: 'radarr', type: 'movie', date: day(4), time: null, title: 'Glass House', subtitle: '2025', event: 'Digital', hasFile: false, monitored: true, poster: img('glass', 'Glass House', 'Nothing stays hidden') },
    { id: 'demo-c4', source: 'sonarr', type: 'episode', date: day(6), time: '20:00', title: 'Redline', subtitle: 'S01E05 · Slipstream', event: null, hasFile: false, monitored: true, poster: img('redline', 'Redline', 'Original series') },
    { id: 'demo-c5', source: 'sonarr', type: 'episode', date: day(0), time: '22:00', title: 'Polaris', subtitle: 'S03E02 · Drift', event: null, hasFile: true, monitored: true, poster: img('polaris', 'Polaris', 'Beyond the dark') },
    { id: 'demo-c6', source: 'radarr', type: 'movie', date: day(8), time: null, title: 'Empire of Dust', subtitle: '2025', event: 'Physical', hasFile: true, monitored: true, poster: img('dust', 'Empire of Dust', 'The sands remember') },
    { id: 'demo-c7', source: 'sonarr', type: 'episode', date: day(9), time: '21:00', title: 'Arcadia', subtitle: 'S02E08 · Finale', event: null, hasFile: false, monitored: true, poster: img('arcadia', 'Arcadia', 'The final season') },
    { id: 'demo-c8', source: 'radarr', type: 'movie', date: day(-3), time: null, title: 'Tides of Iron', subtitle: '2024', event: 'Cinema', hasFile: false, monitored: true, poster: img('tides', 'Tides of Iron', 'Hold the line') },
  ];
  return all.filter((e) => e.date >= start && e.date <= end);
}

const media = {
  1001: { tmdbId: 1001, mediaType: 'movie', title: 'The Last Horizon', year: 2026, overview: 'A deep-space rescue with no way home.', poster: img('horizon', 'The Last Horizon', 'A film by A. Vale'), status: 'available', seasons: [] },
  1002: { tmdbId: 1002, mediaType: 'tv', title: 'Arcadia', year: 2024, overview: 'A city that remembers everything.', poster: img('arcadia', 'Arcadia', 'The final season'), status: 'partial', seasons: [1, 2].map((n) => ({ seasonNumber: n, name: `Season ${n}`, episodeCount: 8 })) },
  1003: { tmdbId: 1003, mediaType: 'movie', title: 'Northern Static', year: 2026, overview: 'A radio operator hears a voice that should not exist.', poster: img('static', 'Northern Static', 'Listen closely'), status: 'none', seasons: [] },
  1004: { tmdbId: 1004, mediaType: 'tv', title: 'Meridian', year: 2026, overview: 'Two cartographers, one border.', poster: img('meridian', 'Meridian', 'A new series'), status: 'pending', seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 10 }] },
  1005: { tmdbId: 1005, mediaType: 'movie', title: 'Paper Moons', year: 2025, overview: 'A heist told backwards.', poster: img('paper', 'Paper Moons', 'Nothing is what it seems'), status: 'none', seasons: [] },
  1006: { tmdbId: 1006, mediaType: 'tv', title: 'Harbor Lights', year: 2023, overview: 'A fishing town, a missing boat.', poster: img('harbor', 'Harbor Lights', 'Season 2'), status: 'available', seasons: [1, 2].map((n) => ({ seasonNumber: n, name: `Season ${n}`, episodeCount: 6 })) },
  1007: { tmdbId: 1007, mediaType: 'movie', title: 'Second Sun', year: 2026, overview: 'When a new star rises, the old rules end.', poster: img('sun', 'Second Sun', 'Dawn comes twice'), status: 'processing', seasons: [] },
  1008: { tmdbId: 1008, mediaType: 'tv', title: 'The Orchard', year: 2026, overview: 'Roots run deeper than blood.', poster: img('orchard', 'The Orchard', 'S01E01'), status: 'none', seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 8 }] },
};

const requested = new Set();
const strip = ({ seasons, ...rest }) => rest;
const withState = (m) => (requested.has(m.tmdbId) && m.status === 'none' ? { ...m, status: 'pending' } : m);

export const trending = () => Object.values(media).map(withState).map(strip);
export const search = (q) => Object.values(media).filter((m) => m.title.toLowerCase().includes(q.toLowerCase())).map(withState).map(strip);
export const details = (type, id) => {
  const m = media[id];
  if (!m || m.mediaType !== type) throw Object.assign(new Error('Not found'), { status: 404 });
  return withState(m);
};

const demoRequests = [
  { id: 1, tmdbId: 1002, requestStatus: 'approved', mediaStatus: 'partial', seasons: [2], requestedBy: 'Maya', createdAt: -3 * HOUR },
  { id: 2, tmdbId: 1004, requestStatus: 'pending', mediaStatus: 'pending', seasons: [1], requestedBy: 'Riley', createdAt: -20 * HOUR },
  { id: 3, tmdbId: 1007, requestStatus: 'approved', mediaStatus: 'processing', seasons: [], requestedBy: 'Sam', createdAt: -2 * 24 * HOUR },
  { id: 4, tmdbId: 1006, requestStatus: 'approved', mediaStatus: 'available', seasons: [1, 2], requestedBy: 'Christopher', createdAt: -5 * 24 * HOUR },
];
let nextId = 100;

export function recentRequests(now = Date.now()) {
  return demoRequests.map((r) => {
    const m = media[r.tmdbId];
    return { ...r, mediaType: m.mediaType, title: m.title, year: m.year, poster: m.poster, avatar: null, createdAt: r.createdAt < 0 ? now + r.createdAt : r.createdAt };
  });
}

export function createRequest({ mediaType, tmdbId, seasons }) {
  const m = media[tmdbId];
  if (!m || m.mediaType !== mediaType) throw Object.assign(new Error('Unknown title'), { status: 404 });
  requested.add(tmdbId);
  demoRequests.unshift({ id: nextId++, tmdbId, requestStatus: 'pending', mediaStatus: 'pending', seasons: seasons ?? [], requestedBy: 'You', createdAt: Date.now() });
  return { id: nextId - 1, requestStatus: 'pending' };
}

/** Generated artwork: a gradient with a soft glowing orb, like a placeholder film poster. */
export function image(key, { title = '', subtitle = '', kind = 'poster' } = {}) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 60 + (h % 90)) % 360;
  const wide = kind === 'backdrop';
  const w = wide ? 1280 : 300;
  const ht = wide ? 720 : 450;
  const cx = wide ? 900 : 150 + ((h >> 3) % 60) - 30;
  const cy = wide ? 260 : 150 + ((h >> 5) % 60) - 30;
  const r = wide ? 190 : 24 + ((h >> 7) % 14);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const words = esc(title).toUpperCase().split(' ');
  const lines = [];
  for (const wd of words) {
    if (lines.length && (lines[lines.length - 1] + ' ' + wd).length <= 12) lines[lines.length - 1] += ' ' + wd;
    else lines.push(wd);
  }
  const text = `<text x="18" y="${ht - 62 - (lines.length - 1) * 24}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="22" font-weight="800" fill="#fff" letter-spacing="0.5">${lines.map((l, i) => `<tspan x="18" dy="${i ? 24 : 0}">${l}</tspan>`).join('')}</text>` +
      (subtitle ? `<text x="18" y="${ht - 34}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="11" fill="#fff" fill-opacity="0.75" letter-spacing="0.6">${esc(subtitle).toUpperCase()}</text>` : '');
  if (wide) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1020"/>
      <stop offset="1" stop-color="#151a33"/>
    </linearGradient>
    <radialGradient id="sphere" cx="0.42" cy="0.38" r="0.62">
      <stop offset="0" stop-color="#5ee7ff"/>
      <stop offset="0.45" stop-color="#7c5cff"/>
      <stop offset="1" stop-color="#2a1d66"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#7c5cff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#7c5cff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${ht}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="url(#halo)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sphere)"/>
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,52%)"/>
      <stop offset="0.55" stop-color="hsl(${hue2},55%,22%)"/>
      <stop offset="1" stop-color="#0a0c14"/>
    </linearGradient>
    <radialGradient id="orb" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="hsl(${(hue + 180) % 360},90%,85%)"/>
      <stop offset="0.6" stop-color="hsl(${(hue + 180) % 360},80%,70%)" stop-opacity="0.9"/>
      <stop offset="1" stop-color="hsl(${(hue + 180) % 360},80%,60%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${ht}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 2.2}" fill="url(#orb)" opacity="0.55"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${(hue + 180) % 360},90%,88%)"/>
  <rect width="${w}" height="${ht}" fill="url(#fade)"/>
  ${text}
</svg>`;
}
