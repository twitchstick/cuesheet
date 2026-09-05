export type ServiceName = 'plex' | 'jellyfin' | 'radarr' | 'sonarr' | 'seerr' | 'sabnzbd';
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
  /** Deep links for the signal trace -- straight to the title in the app
   * actually handling it. Empty when that service isn't set up. */
  radarrUrl: string;
  sonarrUrl: string;
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
  /** Every server this same title was recently added on -- usually just
   * `[source]`, more than one entry when Plex and Jellyfin both had it and
   * were merged into this one card rather than shown twice. */
  sources: ('plex' | 'jellyfin')[];
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
  /** A real request's own Seerr id (number) for MediaRequest; LifecycleItem also synthesizes a "queue-<id>" string id for a queue-only title with no request behind it. Never sent to any API -- display/key use only. */
  id: number | string;
  mediaType: 'movie' | 'tv';
  tmdbId: number | null;
  /** TV only -- the bridge to Sonarr, which is TVDB-keyed rather than TMDB-keyed. */
  tvdbId: number | null;
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

export interface DownloadClientStats {
  speedKbps: number | null;
  paused: boolean;
  diskFreeGb: number | null;
}

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

export type LifecycleStage = 'requested' | 'monitored' | 'downloading' | 'importing' | 'available';

/**
 * One title's position on its own signal trace -- everything MediaRequest
 * already carries, plus the live downloading/importing refinement matched
 * against the Radarr/Sonarr queue. progress/timeleft/statusDetail are only
 * meaningful while stage is 'downloading' or 'importing'.
 */
export interface LifecycleItem extends MediaRequest {
  stage: LifecycleStage;
  progress: number | null;
  timeleft: string | null;
  statusDetail: string | null;
  /** Best-effort account for why a "monitored" item isn't moving -- Radarr/Sonarr's own reported problem, not a fact about this title specifically. */
  stallReason: string | null;
  /** The queue's own raw status while this is actively downloading/importing -- lets the trace show failed/stalled/paused distinctly instead of a flat "downloading." */
  downloadStatus: DownloadStatus | null;
  /** Richer queue-sourced subtitle (an episode code, say) when this is actively in the queue. */
  subtitle: string | null;
  /** False for a title that's only in the download queue with no matching Seerr request -- Requests hides these, Downloads shows them. */
  fromRequest: boolean;
  /** The DownloadItem id ("radarr-123") this trace is currently matched to in the queue, if any -- what /api/details expects. */
  queueId: string | null;
  /** Radarr's movieId / Sonarr's seriesId, once resolved -- kept for a
   * future API-driven action against that id. Null until Radarr/Sonarr has
   * matched it (never resolved at all for an already-`available` request). */
  externalId: number | null;
  /** Radarr/Sonarr's own web-UI id for the same title -- their detail
   * pages route by this, not `externalId`. This is what a deep link needs. */
  titleSlug: string | null;
  /** The release's own quality, e.g. "Bluray-1080p" -- known while it's
   * actively downloading, or (movies only) once the file is already on
   * disk. Null otherwise, including for anything Seerr already reports as
   * available (that shortcut skips the Radarr/Sonarr lookup entirely). */
  quality: string | null;
}

/** One grab/import/failure off a title's own Radarr/Sonarr history -- the
 * story behind its current stage, not just the stage itself. */
export interface HistoryEvent {
  id: string;
  type: 'grabbed' | 'imported' | 'failed' | 'deleted' | 'ignored';
  at: number;
  /** The release Radarr/Sonarr grabbed, e.g. "Ember.and.Ash.2023.1080p.BluRay-GROUP". */
  release: string | null;
  indexer: string | null;
  detail: string | null;
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
  sabnzbd: ServiceSettings;
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

export interface AuthStatus {
  /** Is a password configured at all -- false means trusted-LAN mode, the default. */
  enabled: boolean;
  /** True when ADMIN_PASSWORD (or _FILE) is set -- the password can't be changed from Settings while this is true. */
  managedByEnv: boolean;
  /** Does *this* browser already have a valid session. */
  authenticated: boolean;
}
