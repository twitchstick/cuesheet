export type ServiceName = 'plex' | 'jellyfin' | 'radarr' | 'sonarr' | 'seerr';
export type View = 'overview' | 'streams' | 'recent' | 'calendar' | 'requests' | 'setup';

export interface AppConfig {
  title: string;
  serverName: string;
  userName: string;
  recentLimit: number;
  timeZone: string;
  refreshSeconds: number;
  services: Record<ServiceName, boolean>;
  /** Where to send people to make a request, empty when Seerr isn't set up. */
  seerrUrl: string;
}

export interface Stream {
  id: string;
  source: 'plex' | 'jellyfin';
  type: 'movie' | 'episode';
  title: string;
  subtitle: string;
  user: string | null;
  player: string;
  device: string;
  state: 'playing' | 'paused' | 'buffering' | string;
  progress: number;
  durationMs: number;
  offsetMs: number;
  transcoding: boolean;
  transcodeSpeed: number | null;
  quality: string | null;
  location: 'local' | 'remote' | null;
  /** What this stream costs the server right now, in kbps. */
  bandwidthKbps: number | null;
  poster: string | null;
  backdrop: string | null;
  attention: string | null;
}

export interface RecentItem {
  id: string;
  source: 'plex' | 'jellyfin';
  type: 'movie' | 'show' | 'season' | 'episode';
  title: string;
  subtitle: string;
  addedAt: number;
  year: number | null;
  poster: string | null;
}

export interface CalendarItem {
  id: string;
  source: 'radarr' | 'sonarr';
  type: 'movie' | 'episode';
  date: string;
  time: string | null;
  title: string;
  subtitle: string;
  event: string | null;
  network?: string | null;
  hasFile: boolean;
  monitored: boolean;
  poster: string | null;
}

export type MediaStatus = 'none' | 'pending' | 'processing' | 'partial' | 'available' | 'deleted';
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'failed';

export interface MediaResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  status: MediaStatus;
}

export interface MediaDetails extends MediaResult {
  seasons: { seasonNumber: number; name: string; episodeCount: number }[];
}

export interface MediaRequest {
  id: number;
  mediaType: 'movie' | 'tv';
  tmdbId: number | null;
  title: string;
  year: number | null;
  poster: string | null;
  requestStatus: RequestStatus;
  mediaStatus: MediaStatus;
  seasons: number[];
  requestedBy: string;
  avatar: string | null;
  createdAt: number;
}

export interface Errors {
  [service: string]: string;
}

export interface ServiceSettings {
  url: string;
  tokenSet?: boolean;
  apiKeySet?: boolean;
  userId?: string;
}

export interface Settings {
  general: {
    serverName: string;
    userName: string;
    recentLimit: number;
  };
  plex: ServiceSettings;
  jellyfin: ServiceSettings;
  radarr: ServiceSettings;
  sonarr: ServiceSettings;
  seerr: ServiceSettings;
}

export interface SetupStatus {
  needsSetup: boolean;
  settingsFile: string;
}

export interface TestResult {
  ok: boolean;
  name?: string;
  version?: string | null;
  users?: { id: string; name: string }[];
  error?: string;
}
