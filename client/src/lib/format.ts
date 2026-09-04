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
  sabnzbd: 'SABnzbd',
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

/** Broadcast timecode, HH:MM:SS — fixed width so a refresh never shifts the column. */
export function timecode(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

/** Time still to run, counted down the way a gallery clock shows it. */
export const remainingCode = (durationMs: number, offsetMs: number) => `−${timecode(Math.max(0, durationMs - offsetMs))}`;

/** Tally state: what a light on the desk would be showing for this stream. */
export function tally(stream: { state: string; attention: string | null }): { cls: string; label: string; pulse: boolean } {
  if (stream.attention) return { cls: 'bg-tally-hold', label: stream.attention, pulse: false };
  if (stream.state === 'paused') return { cls: 'bg-tally-idle', label: 'Paused', pulse: false };
  if (stream.state === 'buffering') return { cls: 'bg-tally-hold', label: 'Buffering', pulse: true };
  return { cls: 'bg-tally-on', label: 'On air', pulse: true };
}

/** Free space, given in GB, as a human size: 120 GB free, 1.2 TB free. */
export function diskFree(gb: number | null): string | null {
  if (gb == null || gb <= 0) return null;
  return gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB free` : `${Math.round(gb)} GB free`;
}

/** Bytes as a human size: 4.2 GB, 820 MB. */
export function fileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
}

/** Radarr/Sonarr send time left as "HH:MM:SS" or, past a day, "D.HH:MM:SS". */
export function timeLeftLabel(timeleft: string | null): string | null {
  if (!timeleft) return null;
  const m = timeleft.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)$/);
  if (!m) return null;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2]);
  const mins = Number(m[3]);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m left`;
  if (mins > 0) return `${mins}m left`;
  return 'almost done';
}

/** The same "HH:MM:SS" / "D.HH:MM:SS" Radarr/Sonarr send, as raw milliseconds -- for projecting a trace forward between polls rather than displaying it. */
export function timeLeftMs(timeleft: string | null): number | null {
  if (!timeleft) return null;
  const m = timeleft.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)$/);
  if (!m) return null;
  const [, d, h, mi, s] = m;
  return (((Number(d ?? 0) * 24 + Number(h)) * 60 + Number(mi)) * 60 + Number(s)) * 1000;
}

/**
 * A download's tally light. Failed reuses the same red as a stream's "on
 * air" — this is a broadcast tally, not a traffic light, so the colour
 * means "demands attention," not "stop." Downloading gets the brand accent
 * rather than a tally colour, since it is normal, ongoing activity.
 */
export function downloadTally(item: { status: string; statusDetail: string | null }): { cls: string; label: string; pulse: boolean } {
  switch (item.status) {
    case 'failed':
      return { cls: 'bg-tally-on', label: item.statusDetail ?? 'Failed', pulse: false };
    case 'warning':
      return { cls: 'bg-tally-hold', label: item.statusDetail ?? 'Warning', pulse: false };
    case 'stalled':
      return { cls: 'bg-tally-hold', label: 'Stalled', pulse: false };
    case 'paused':
      return { cls: 'bg-tally-idle', label: 'Paused', pulse: false };
    case 'queued':
      return { cls: 'bg-tally-idle', label: 'Queued', pulse: false };
    case 'importing':
      return { cls: 'bg-accent-500', label: 'Importing', pulse: true };
    default:
      return { cls: 'bg-accent-500', label: 'Downloading', pulse: true };
  }
}
