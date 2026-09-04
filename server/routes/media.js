/** Per-item detail metadata (behind a poster click) and the image proxy --
 * the two routes that resolve a `source-id` reference back to one service. */
import express from 'express';
import { config } from '../config.js';
import { cached } from '../cache.js';
import { fetchRaw, readCappedBody } from '../http.js';
import * as plex from '../services/plex.js';
import * as jellyfin from '../services/jellyfin.js';
import * as radarr from '../services/radarr.js';
import * as sonarr from '../services/sonarr.js';

const router = express.Router();

/**
 * Metadata for one item, behind a poster click. The id carries its own source
 * (`plex-1234`, `sonarr-88`), so this only has to check that the source is one
 * we know, is actually configured, and that the id is shaped the way that
 * service expects — the services re-check the id before it reaches a URL.
 */
const DETAIL_SOURCES = {
  plex: { service: plex, id: /^\d+$/ },
  // A Jellyfin id can be a dashed GUID, so it keeps everything after the source.
  jellyfin: { service: jellyfin, id: /^[A-Za-z0-9-]{1,64}$/, keepDashes: true },
  // A Radarr id carries the release field too: radarr-12-digitalRelease.
  radarr: { service: radarr, id: /^\d+$/ },
  sonarr: { service: sonarr, id: /^\d+$/ },
};

router.get('/details', async (req, res, next) => {
  try {
    const raw = typeof req.query.id === 'string' ? req.query.id : '';
    const split = raw.indexOf('-');
    const source = split > 0 ? raw.slice(0, split) : '';
    // hasOwn, not a bare lookup: `constructor` and `__proto__` would otherwise
    // resolve to something inherited and truthy.
    const entry = Object.hasOwn(DETAIL_SOURCES, source) ? DETAIL_SOURCES[source] : null;
    if (!entry) return res.status(400).json({ error: 'Unknown item' });
    const rest = raw.slice(split + 1);
    const id = entry.keepDashes ? rest : rest.split('-')[0];
    if (!entry.id.test(id)) return res.status(400).json({ error: 'Unknown item' });
    if (!config[source]?.enabled) return res.status(404).json({ error: `${source} is not connected` });

    const result = await cached(`details:${source}:${id}`, 10 * 60_000, () => entry.service.details(config[source], id));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Image proxy: the browser never needs upstream URLs or credentials.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const IMAGE_SOURCES = {
  plex: (ref, q) => plex.imageRequest(config.plex, ref, { width: q.w, height: q.h }),
  jellyfin: (ref, q) => jellyfin.imageRequest(config.jellyfin, ref, { width: q.w, tag: q.tag }),
  radarr: (ref) => radarr.imageRequest(config.radarr, ref),
  sonarr: (ref) => sonarr.imageRequest(config.sonarr, ref),
};

router.get('/image', async (req, res) => {
  const source = String(req.query.s ?? '');
  const ref = String(req.query.p ?? '');
  const build = IMAGE_SOURCES[source];
  if (!build || !ref || !config[source]?.enabled) return res.status(404).end();
  const clamp = (v, d, max) => Math.min(max, Math.max(50, Number(v) || d));
  let target;
  try {
    target = build(ref, { w: clamp(req.query.w, 300, 1200), h: clamp(req.query.h, 450, 1800), tag: req.query.tag });
  } catch {
    return res.status(400).end();
  }
  try {
    const upstream = await fetchRaw(target.url, { headers: { ...target.headers, Accept: 'image/*' } });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status === 404 ? 404 : 502).end();
    // Only ever hand back a bitmap. Echoing the upstream content type would let
    // anything served from a media server become active content on our origin.
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(type)) {
      console.warn(`[image:${source}] refused content type ${type || 'none'}`);
      return res.status(502).end();
    }
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(await readCappedBody(upstream));
  } catch (err) {
    console.warn(`[image:${source}] ${err.message}`);
    res.status(502).end();
  }
});

export default router;
