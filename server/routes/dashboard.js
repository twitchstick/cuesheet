/** The main dashboard reads: live sessions, recently added, the release
 * calendar, the download queue, Seerr requests, and the Signal Trace
 * lifecycle that correlates the two. */
import express from 'express';
import { config } from '../config.js';
import { cached } from '../cache.js';
import { addDays, isIsoDate, localDate } from '../util.js';
import * as plex from '../services/plex.js';
import * as jellyfin from '../services/jellyfin.js';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';
import * as seerr from '../services/seerr.js';
import * as sabnzbd from '../services/sabnzbd.js';
import { buildLifecycle } from '../lifecycle.js';

const router = express.Router();

/** Run one loader per enabled service and merge the results, reporting per-service errors. */
async function gather(tasks) {
  const settled = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  const items = [];
  const errors = {};
  settled.forEach((result, i) => {
    const name = tasks[i][0];
    if (result.status === 'fulfilled') items.push(...result.value);
    else {
      errors[name] = result.reason?.message ?? String(result.reason);
      console.warn(`[${name}] ${errors[name]}`);
    }
  });
  return { items, errors };
}

router.get('/streams', async (_req, res, next) => {
  try {
    const tasks = [];
    if (config.plex.enabled) tasks.push(['plex', () => plex.sessions(config.plex)]);
    if (config.jellyfin.enabled) tasks.push(['jellyfin', () => jellyfin.sessions(config.jellyfin)]);
    res.json(await cached('streams', 5_000, () => gather(tasks)));
  } catch (err) {
    next(err);
  }
});

router.get('/recent', async (_req, res, next) => {
  try {
    // Fetch more than the row shows so the movies/series filters still fill it.
    const limit = Math.min(config.recentLimit * 2, 40);
    const tasks = [];
    if (config.plex.enabled) tasks.push(['plex', () => plex.recentlyAdded(config.plex, limit)]);
    if (config.jellyfin.enabled) tasks.push(['jellyfin', () => jellyfin.recentlyAdded(config.jellyfin, limit)]);
    const result = await cached('recent', 2 * 60_000, async () => {
      const { items, errors } = await gather(tasks);
      items.sort((a, b) => b.addedAt - a.addedAt);
      return { items: items.slice(0, limit), errors };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const today = localDate(new Date(), config.timeZone);
    const start = isIsoDate(req.query.start) ? req.query.start : today;
    const end = isIsoDate(req.query.end) ? req.query.end : addDays(start, 6);
    // 42 days covers the widest month grid the calendar tab can draw
    // (six Monday-start weeks), which is the largest range the UI asks for.
    if (end < start || addDays(start, 41) < end) {
      return res.status(400).json({ error: 'Calendar range must be 1–42 days' });
    }
    const tasks = [];
    if (config.radarr.enabled) tasks.push(['radarr', () => radarr.calendar(config.radarr, start, end)]);
    if (config.sonarr.enabled) tasks.push(['sonarr', () => sonarr.calendar(config.sonarr, start, end, config.timeZone)]);
    const result = await cached(`calendar:${start}:${end}`, 10 * 60_000, async () => {
      const { items, errors } = await gather(tasks);
      items.sort((a, b) => a.date.localeCompare(b.date) || (a.sortKey ?? 0) - (b.sortKey ?? 0) || a.title.localeCompare(b.title));
      return { start, end, today, items, errors };
    });
    res.json({ ...result, today });
  } catch (err) {
    next(err);
  }
});

const requireSeerr = (_req, res, next) => {
  if (!config.seerr.enabled) return res.status(404).json({ error: 'Seerr is not configured' });
  next();
};

const QUEUE_STATUS_PRIORITY = { failed: 0, warning: 1, stalled: 2, downloading: 3, importing: 4, queued: 5, paused: 6 };

router.get('/queue', async (_req, res, next) => {
  try {
    const tasks = [];
    if (config.radarr.enabled) tasks.push(['radarr', () => radarr.queue(config.radarr)]);
    if (config.sonarr.enabled) tasks.push(['sonarr', () => sonarr.queue(config.sonarr)]);
    const result = await cached('queue', 12_000, async () => {
      const { items, errors } = await gather(tasks);
      // What needs a look floats to the top; within a status, soonest-done first.
      items.sort(
        (a, b) => (QUEUE_STATUS_PRIORITY[a.status] ?? 9) - (QUEUE_STATUS_PRIORITY[b.status] ?? 9) || a.sizeLeftBytes - b.sizeLeftBytes,
      );
      // The download client is an optional companion to the queue above --
      // its own aggregate speed/disk-free readout, not one more row source.
      let client = null;
      if (config.sabnzbd.enabled) {
        try {
          client = await sabnzbd.stats(config.sabnzbd);
        } catch (err) {
          errors.sabnzbd = err.message;
        }
      }
      return { items, errors, client };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/requests', requireSeerr, async (_req, res, next) => {
  try {
    const items = await cached('requests', 30_000, () => seerr.recentRequests(config.seerr, 12));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.get('/lifecycle', async (_req, res, next) => {
  try {
    const result = await cached('lifecycle', 30_000, async () => {
      const requests = config.seerr.enabled ? await cached('requests', 30_000, () => seerr.recentRequests(config.seerr, 12)) : [];
      const queueTasks = [];
      if (config.radarr.enabled) queueTasks.push(['radarr', () => radarr.queue(config.radarr)]);
      if (config.sonarr.enabled) queueTasks.push(['sonarr', () => sonarr.queue(config.sonarr)]);
      // A distinct cache key from /api/queue's -- that route caches a
      // differently-shaped { items, errors, client } under 'queue', and
      // sharing the key would hand it this route's narrower object instead.
      const { items: queueItems } = await cached('lifecycle-queue', 12_000, () => gather(queueTasks));

      const healthTasks = [];
      if (config.radarr.enabled) healthTasks.push(['radarr', () => radarr.health(config.radarr)]);
      if (config.sonarr.enabled) healthTasks.push(['sonarr', () => sonarr.health(config.sonarr)]);
      const { items: healthItems } = await cached('lifecycle-health', 60_000, () => gather(healthTasks));
      const bySeverity = { error: 0, warning: 1 };
      const sortedHealth = [...healthItems].sort((a, b) => bySeverity[a.severity] - bySeverity[b.severity]);
      const health = { radarr: sortedHealth.filter((h) => h.source === 'radarr'), sonarr: sortedHealth.filter((h) => h.source === 'sonarr') };

      const items = await buildLifecycle(requests, queueItems, health, {
        radarrEnabled: config.radarr.enabled,
        sonarrEnabled: config.sonarr.enabled,
        findByTmdbId: (tmdbId) => cached(`lifecycle:radarr:${tmdbId}`, 5 * 60_000, () => radarr.findByTmdbId(config.radarr, tmdbId)),
        findByTvdbId: (tvdbId) => cached(`lifecycle:sonarr:${tvdbId}`, 5 * 60_000, () => sonarr.findByTvdbId(config.sonarr, tvdbId)),
      });
      return { items };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
