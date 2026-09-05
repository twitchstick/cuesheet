import { pathToFileURL } from 'node:url';

export const pad2 = (n) => String(n ?? 0).padStart(2, '0');

/**
 * Was this module the one actually launched (`node server/index.js`), not
 * merely imported (by a test, or e2e/fixture-server.mjs)? Comparing raw
 * strings (`` `file://${argv1}` ``) breaks on Windows: import.meta.url
 * comes out as `file:///C:/...` (forward slashes, percent-encoded) while
 * argv[1] is a plain `C:\...` path, so they'd never match and the app
 * would never bind its port when actually launched. pathToFileURL()
 * normalizes both the same way Node's own loader does. Pulled out as its
 * own function so this cross-platform edge is unit-testable without
 * actually spawning a process on each OS.
 */
export function isMainModule(moduleUrl, argv1) {
  return argv1 != null && moduleUrl === pathToFileURL(argv1).href;
}

export const episodeCode = (season, episode) => `S${pad2(season)}E${pad2(episode)}`;

/** Build a proxied image URL the browser can load without any upstream credentials. */
export function imageUrl(source, ref, extra = {}) {
  if (!ref) return null;
  const params = new URLSearchParams({ s: source, p: String(ref), ...extra });
  return `/api/image?${params.toString()}`;
}

export const tmdbPoster = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

/** Format a Date as YYYY-MM-DD in the given IANA time zone. */
export function localDate(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Format a Date as HH:mm (24h) in the given IANA time zone. */
export function localTime(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Radarr and Sonarr share the same queue vocabulary (both are Servarr apps),
 * so the mapping from their fields to Cuesheet's status lives here once
 * rather than being duplicated in both services.
 */
export function queueProgress(size, sizeleft) {
  const total = Number(size);
  const left = Number(sizeleft);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const done = total - (Number.isFinite(left) ? left : 0);
  return Math.min(1, Math.max(0, done / total));
}

const FAILED_STATES = new Set(['failed', 'failedPending']);
const IMPORTING_STATES = new Set(['importing', 'importPending', 'importBlocked']);

export function queueStatus(record) {
  if (record.status === 'paused') return 'paused';
  if (record.trackedDownloadStatus === 'error' || record.status === 'failed' || FAILED_STATES.has(record.trackedDownloadState)) return 'failed';
  if (record.trackedDownloadState === 'downloadClientUnavailable') return 'stalled';
  if (record.trackedDownloadStatus === 'warning' || record.status === 'warning') return 'warning';
  if (IMPORTING_STATES.has(record.trackedDownloadState)) return 'importing';
  if (record.status === 'delay' || record.trackedDownloadState === 'delay') return 'queued';
  return 'downloading';
}

/** The first status message the app gave, if it gave one. */
export function queueMessage(record) {
  const messages = Array.isArray(record.statusMessages) ? record.statusMessages.flatMap((m) => m.messages ?? []) : [];
  return messages[0] ?? record.errorMessage ?? null;
}

// Radarr/Sonarr's own eventType strings, collapsed onto the handful the
// history strip actually narrates. Matched by substring rather than an
// exact enum: the two apps don't share identical spellings (Radarr's
// "movieFileDeleted" vs Sonarr's "episodeFileDeleted", say), and matching
// loosely is safer than hard-coding a list this couldn't be tested against
// a live instance for. "imported" is narrower than the rest -- it must
// start with "download", so a real download-completion import doesn't
// collide with "movieFolderImported"/"seriesFolderImported" (found files
// already on disk, nothing this trace's request drove) or a rename.
// Anything left unmatched is dropped rather than shown as an unlabeled event.
const HISTORY_TYPE = [
  [/^grab/i, 'grabbed'],
  [/fail/i, 'failed'],
  [/^download.*import/i, 'imported'],
  [/delet/i, 'deleted'],
  [/ignor/i, 'ignored'],
];

/**
 * One grabbed/imported/failed/deleted/ignored event off a Radarr/Sonarr
 * history record, or null for anything this doesn't narrate. `data.message`/
 * `data.reason` aren't precisely documented across Servarr versions, so
 * this reads them defensively rather than assuming one exact shape.
 */
export function historyEvent(record, source) {
  const type = HISTORY_TYPE.find(([re]) => re.test(String(record.eventType ?? '')))?.[1];
  if (!type) return null;
  const data = record.data ?? {};
  return {
    id: `${source}-history-${record.id}`,
    type,
    at: record.date ? new Date(record.date).getTime() : 0,
    release: record.sourceTitle || null,
    indexer: data.indexer || null,
    detail: data.message || data.reason || null,
  };
}
