export type ServiceName = 'plex' | 'jellyfin' | 'radarr' | 'sonarr' | 'seerr';
export type View = 'overview' | 'recent' | 'calendar' | 'queue' | 'requests' | 'setup';

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
  /** The library item behind this session, for the detail lookup. */
  itemId: string | null;
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
  /** What the file is and what the server is doing to it. */
  tech?: StreamTech | null;
}

export interface TrackTech {
  codec: string | null;
  profile?: string | null;
  resolution?: string | null;
  frameRate?: string | null;
  bitrateKbps?: number | null;
  channels?: string | null;
  language?: string | null;
  /** 'Direct play' | 'Direct stream' | 'Transcode' */
  decision: string | null;
  /** What it is being turned into, when transcoding. */
  target: string | null;
}

export interface StreamTech {
  container: string | null;
  fileBitrateKbps: number | null;
  video: TrackTech;
  audio: TrackTech;
  subtitle: string | null;
  /** The container it is being repackaged into, when that changes. */
  containerTarget: string | null;
  /** Why Jellyfin is transcoding. Plex does not report a reason, so it is empty. */
  changes: string[];
  hardware: boolean | null;
  throttled: boolean | null;
}

export interface MediaDetail {
  source: ServiceName;
  type: 'movie' | 'show' | 'season' | 'episode';
  title: string;
  subtitle: string;
  year: number | null;
  overview: string;
  runtimeMinutes: number | null;
  genres: string[];
  contentRating: string | null;
  rating: number | null;
  ratingLabel: string;
  studio: string | null;
  airedOn: string | null;
  people: { name: string; role: string }[];
  facts: [string, string][];
  poster: string | null;
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

export type DownloadStatus = 'downloading' | 'importing' | 'queued' | 'paused' | 'stalled' | 'warning' | 'failed';

export interface DownloadItem {
  id: string;
  source: 'radarr' | 'sonarr';
  type: 'movie' | 'episode';
  title: string;
  subtitle: string;
  sizeBytes: number;
  sizeLeftBytes: number;
  progress: number;
  /** Radarr/Sonarr's own countdown string, e.g. "00:45:00" or "1.02:00:00". */
  timeleft: string | null;
  status: DownloadStatus;
  statusDetail: string | null;
  downloadClient: string | null;
  poster: string | null;
}

export type LinkIcon = 'link' | 'server' | 'shield' | 'activity' | 'hard-drive' | 'box' | 'download' | 'terminal' | 'globe';

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon: LinkIcon | null;
  /** A direct address for the tile's icon -- your own selfh.st mirror, say -- overriding the favicon and the curated set. */
  iconUrl: string | null;
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
