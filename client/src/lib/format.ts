export function timeAgo(ts: number, now = Date.now()): string {
  if (!ts) return '';
  const diff = Math.max(0, now - ts);
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function remaining(durationMs: number, offsetMs: number): string {
  const left = Math.max(0, durationMs - offsetMs);
  const mins = Math.ceil(left / 60_000);
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m left`;
}

/** Parse "YYYY-MM-DD" as a local calendar date (avoids the UTC-midnight shift). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTime24to12(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

export const sourceLabel: Record<string, string> = {
  plex: 'Plex',
  jellyfin: 'Jellyfin',
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  seerr: 'Seerr',
};

export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function greeting(name: string, now = new Date()): string {
  const h = now.getHours();
  const word = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${word}, ${name}` : word;
}

/** Monday of the week containing the given date (ISO week start). */
export function mondayOf(iso: string): string {
  const d = parseIsoDate(iso);
  const back = (d.getDay() + 6) % 7;
  return addDays(iso, -back);
}

export function playbackLabel(stream: { transcoding: boolean; transcodeSpeed: number | null; state: string }): string {
  if (stream.state === 'buffering') return 'Buffering';
  if (!stream.transcoding) return 'Direct play';
  return stream.transcodeSpeed !== null ? `Transcode ${stream.transcodeSpeed.toFixed(1)}×` : 'Transcode';
}

/** kbps as a human number: 5.4 Mbps, 820 kbps. */
export function bandwidth(kbps: number | null | undefined): string | null {
  if (!kbps || kbps <= 0) return null;
  if (kbps < 1000) return `${Math.round(kbps)} kbps`;
  const mbps = kbps / 1000;
  return `${mbps >= 10 ? Math.round(mbps) : mbps.toFixed(1)} Mbps`;
}

export const totalBandwidth = (streams: { bandwidthKbps: number | null }[]): number =>
  streams.reduce((sum, s) => sum + (s.bandwidthKbps ?? 0), 0);

/** Each media server's own colour, for tinting the streams that come from it. */
export const serviceTheme: Record<string, { text: string; border: string; bg: string; dot: string }> = {
  plex: { text: 'text-plex', border: 'border-l-plex', bg: 'bg-plex', dot: 'bg-plex' },
  jellyfin: { text: 'text-jellyfin', border: 'border-l-jellyfin', bg: 'bg-jellyfin', dot: 'bg-jellyfin' },
};
