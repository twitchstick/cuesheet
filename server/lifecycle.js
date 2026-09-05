/**
 * One title's journey from a Seerr request through to a library file, as a
 * single thread instead of four separate glances across four tools. Split
 * out from index.js so it's testable on its own: the Radarr/Sonarr lookups
 * are injected (deps.findByTmdbId/findByTvdbId) rather than reaching for
 * the real cache/config/service modules directly, so a test can supply a
 * plain async function instead of standing up a real cache and a real
 * Radarr.
 */

export const LIFECYCLE_STAGE = { requested: 0, monitored: 1, downloading: 2, importing: 3, available: 4 };

/** What Seerr's own status already tells us, before any Radarr/Sonarr refinement. */
export function baseLifecycleStage(mediaStatus) {
  if (mediaStatus === 'available') return 'available';
  if (mediaStatus === 'partial') return 'importing'; // some of it has already landed
  if (mediaStatus === 'processing') return 'monitored';
  return 'requested';
}

/**
 * @param r one Seerr request (MediaRequest shape: mediaType, tmdbId, tvdbId, mediaStatus, ...)
 * @param queueItems the merged Radarr+Sonarr queue rows for this poll
 * @param health `{ radarr: Issue[], sonarr: Issue[] }`, most severe first
 * @param deps `{ radarrEnabled, sonarrEnabled, findByTmdbId(tmdbId), findByTvdbId(tvdbId) }` --
 *   the two lookups are async functions returning `{ id, titleSlug, monitored, hasFile } | null`;
 *   index.js supplies cached, real ones, tests supply plain fakes.
 */
export async function lifecycleFor(r, queueItems, health, deps) {
  let stage = baseLifecycleStage(r.mediaStatus);
  let progress = null;
  let timeleft = null;
  let statusDetail = null;
  let stallReason = null;
  let downloadStatus = null;
  let subtitle = null;
  let queueId = null;
  // Radarr's movieId / Sonarr's seriesId, once resolved -- kept for a
  // future API-driven action (retry, blocklist) against that id. Stays
  // null for an already-`available` request (Seerr's own status is enough
  // there, so the lookup below never runs) and for anything unmatched.
  let externalId = null;
  // The *web UI's* own id for the same title -- Radarr/Sonarr route their
  // detail pages by this, not the numeric id above. Only this, not
  // externalId, belongs in a link to that app.
  let titleSlug = null;

  const base = { ...r, stage, progress, timeleft, statusDetail, stallReason, downloadStatus, subtitle, fromRequest: true, queueId, externalId, titleSlug };
  if (stage === 'available') return base;

  try {
    // Checked here, not just inside the injected lookup -- Seerr's tmdbId
    // can land straight in a cache key downstream, so an untrusted or
    // misbehaving Seerr handing back garbage/rotating values must never
    // reach that far, or every distinct value plants another cache entry
    // nothing ever sweeps.
    if (r.mediaType === 'movie' && Number.isInteger(r.tmdbId) && deps.radarrEnabled) {
      const found = await deps.findByTmdbId(r.tmdbId);
      if (found) {
        externalId = found.id;
        titleSlug = found.titleSlug;
        const row = queueItems.find((q) => q.id === `radarr-${found.id}`);
        if (row) {
          stage = row.status === 'importing' ? 'importing' : 'downloading';
          progress = row.progress;
          timeleft = row.timeleft;
          statusDetail = row.statusDetail;
          downloadStatus = row.status;
          subtitle = row.subtitle || null;
          queueId = row.id;
        } else if (found.hasFile) stage = 'available';
        else if (found.monitored && LIFECYCLE_STAGE[stage] < LIFECYCLE_STAGE.monitored) stage = 'monitored';
      }
    } else if (r.mediaType === 'tv' && Number.isInteger(r.tvdbId) && deps.sonarrEnabled) {
      const found = await deps.findByTvdbId(r.tvdbId);
      if (found) {
        externalId = found.id;
        titleSlug = found.titleSlug;
        const row = queueItems.find((q) => q.source === 'sonarr' && q.seriesId === found.id);
        if (row) {
          stage = row.status === 'importing' ? 'importing' : 'downloading';
          progress = row.progress;
          timeleft = row.timeleft;
          statusDetail = row.statusDetail;
          downloadStatus = row.status;
          subtitle = row.subtitle || null;
          queueId = row.id;
        } else if (found.hasFile) stage = 'available';
        else if (found.monitored && LIFECYCLE_STAGE[stage] < LIFECYCLE_STAGE.monitored) stage = 'monitored';
      }
    }
  } catch (err) {
    // The Radarr/Sonarr refinement is a bonus on top of Seerr's own status,
    // never a reason to drop the request off the trace entirely.
    console.warn(`[lifecycle] ${err.message}`);
  }

  // Stuck at "monitored" -- Radarr/Sonarr has it, but nothing is moving.
  // The best account Cuesheet has for that isn't a fact about this title
  // specifically (nothing here is), it's whichever problem that service is
  // currently reporting about itself -- a dead indexer, an unreachable
  // download client. Not proof, but the most useful guess available.
  if (stage === 'monitored') {
    const issue = health[r.mediaType === 'movie' ? 'radarr' : 'sonarr'][0];
    if (issue) stallReason = issue.message;
  }

  return { ...r, stage, progress, timeleft, statusDetail, stallReason, downloadStatus, subtitle, fromRequest: true, queueId, externalId, titleSlug };
}

/**
 * A queue row with no matching Seerr request -- added straight in Radarr/
 * Sonarr, outside the request flow entirely. Downloads shows these too (it
 * never used to need a request to appear), just without a "requested"
 * backstory Cuesheet doesn't actually have.
 */
export function orphanLifecycleItem(row) {
  return {
    // A string, not a digit-stripped number -- "radarr-123" and "sonarr-123"
    // would otherwise collapse onto the same id and collide as React keys.
    id: `queue-${row.id}`,
    mediaType: row.type === 'episode' ? 'tv' : 'movie',
    tmdbId: null,
    tvdbId: null,
    title: row.title,
    year: null,
    poster: row.poster,
    requestStatus: 'approved',
    mediaStatus: 'processing',
    seasons: [],
    requestedBy: '',
    avatar: null,
    createdAt: 0,
    stage: row.status === 'importing' ? 'importing' : 'downloading',
    progress: row.progress,
    timeleft: row.timeleft,
    statusDetail: row.statusDetail,
    stallReason: null,
    downloadStatus: row.status,
    subtitle: row.subtitle || null,
    fromRequest: false,
    queueId: row.id,
    // Both carried on the queue row itself -- an orphan has no Seerr
    // request to resolve either from otherwise.
    externalId: row.movieId ?? row.seriesId ?? null,
    titleSlug: row.titleSlug ?? null,
  };
}

/**
 * The full /api/lifecycle computation, given the raw ingredients already
 * fetched: every Seerr request, the merged queue, and sorted health issues
 * per service. Kept separate from the route handler so it's testable
 * end-to-end (orphans included) without an Express request/response.
 */
export async function buildLifecycle(requests, queueItems, health, deps) {
  const items = await Promise.all(requests.filter((r) => r.mediaStatus !== 'deleted').map((r) => lifecycleFor(r, queueItems, health, deps)));
  const claimed = new Set(items.map((i) => i.queueId).filter(Boolean));
  const orphans = queueItems.filter((q) => !claimed.has(q.id)).map(orphanLifecycleItem);
  return [...items, ...orphans];
}
