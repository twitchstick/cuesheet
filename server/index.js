import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, enabledServices, anyServiceConfigured, publicConfig, getSettings, saveSettings, saveLinks, effectiveSecret, SECRET_FIELD, SERVICES } from './config.js';
import { probes } from './services/probe.js';
import { cached, invalidate } from './cache.js';
import { fetchRaw, readCappedBody, assertReachableUrl, UpstreamError } from './http.js';
import { addDays, isIsoDate, localDate } from './util.js';
import * as plex from './services/plex.js';
import * as jellyfin from './services/jellyfin.js';
import * as radarr from './services/radarr.js';
import * as sonarr from './services/sonarr.js';
import * as seerr from './services/seerr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('query parser', 'simple');
// Behind a reverse proxy, set TRUST_PROXY (e.g. "1") so per-address sign-in
// limits see the real client and not the proxy.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
app.use(express.json({ limit: '32kb' }));

// The page only ever loads its own bundle; posters come from us or from TMDB.
// A quick link's favicon is the one exception: it can point anywhere on the
// LAN, almost always over plain http, so its origin is added to img-src
// specifically -- not http: wholesale -- each time a link is saved.
const CSP_REST = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function buildCsp() {
  const httpOrigins = new Set();
  for (const link of config.links) {
    // A link's own address and its icon (favicon or a custom icon URL) can
    // be different hosts entirely -- both need to be allowed to load.
    for (const target of [link.url, link.iconUrl]) {
      if (!target) continue;
      try {
        const u = new URL(target);
        if (u.protocol === 'http:') httpOrigins.add(u.origin);
      } catch {
        // Already validated on save; ignore rather than break every page load.
      }
    }
  }
  const imgSrc = ["img-src 'self' data: https:", ...httpOrigins].join(' ');
  return `${imgSrc}; ${CSP_REST}`;
}

app.use((_req, res, next) => {
  res.set('Content-Security-Policy', buildCsp());
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  next();
});

const api = express.Router();
api.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Nothing here asks who you are, so a page the viewer happens to be visiting
// must not be able to reach in and change settings. Browsers always send an
// Origin on cross-site writes, and it stays the attacker's domain even when
// DNS rebinding makes the request look same-origin to the network.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
api.use((req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // curl, scripts, the container itself
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Bad origin' });
  }
  if (originHost !== req.get('host')) return res.status(403).json({ error: 'Cross-site requests are not allowed' });
  next();
});

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

api.get('/config', (_req, res) => res.json(publicConfig()));

// ---- Setup wizard / settings ----
api.get('/setup/status', (_req, res) => {
  res.json({ needsSetup: !anyServiceConfigured(), settingsFile: config.settingsFile });
});

api.get('/settings', (_req, res) => res.json(getSettings()));

api.put('/settings', (req, res, next) => {
  try {
    const settings = saveSettings(req.body);
    invalidate('');
    res.json({ settings, config: publicConfig() });
  } catch (err) {
    next(err);
  }
});

api.get('/links', (_req, res) => res.json({ items: config.links }));

api.put('/links', (req, res, next) => {
  try {
    const items = saveLinks(req.body?.items);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

api.post('/settings/test', async (req, res) => {
  const { service, url } = req.body ?? {};
  if (!SERVICES.includes(service)) return res.status(400).json({ ok: false, error: 'Unknown service' });
  const secretField = SECRET_FIELD[service];
  const target = String(url ?? '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'Enter the server URL first' });
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ ok: false, error: 'URL must start with http:// or https://' });
  try {
    assertReachableUrl(target);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  const secret = effectiveSecret(service, req.body?.[secretField], target);
  if (!secret) return res.status(400).json({ ok: false, error: `Enter the ${service === 'plex' ? 'token' : 'API key'} first` });
  try {
    const result = await probes[service]({ url: target, [secretField]: secret });
    res.json(result);
  } catch (err) {
    const status = err?.status;
    const hint = status === 401 || status === 403 ? ' — check the credential' : status === 404 ? ' — check the URL (is this the right app and port?)' : '';
    res.json({ ok: false, error: `${err.message ?? 'Connection failed'}${hint}` });
  }
});


api.get('/streams', async (_req, res, next) => {
  try {
    const tasks = [];
    if (config.plex.enabled) tasks.push(['plex', () => plex.sessions(config.plex)]);
    if (config.jellyfin.enabled) tasks.push(['jellyfin', () => jellyfin.sessions(config.jellyfin)]);
    res.json(await cached('streams', 5_000, () => gather(tasks)));
  } catch (err) {
    next(err);
  }
});

api.get('/recent', async (_req, res, next) => {
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

api.get('/details', async (req, res, next) => {
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

api.get('/calendar', async (req, res, next) => {
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

api.get('/queue', async (_req, res, next) => {
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
      return { items, errors };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

api.get('/requests', requireSeerr, async (_req, res, next) => {
  try {
    const items = await cached('requests', 30_000, () => seerr.recentRequests(config.seerr, 12));
    res.json({ items });
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

api.get('/image', async (req, res) => {
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

api.get('/health', (_req, res) => res.json({ ok: true }));

api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
api.use((err, _req, res, _next) => {
  const status = err instanceof UpstreamError ? 502 : err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Unexpected error' });
});

app.use('/api', api);

// Serve the built client (client/dist) with an SPA fallback.
const clientDir = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDir, { maxAge: '1h', index: false }));
// Final catch-all: hand every other GET the single-page app.
// A plain middleware (rather than a wildcard route) keeps "/" covered and
// behaves the same on Express 4 and 5.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).end();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientDir, 'index.html'), (err) => {
    if (err) res.status(503).type('text').send('Cuesheet client has not been built. Run `npm run build`.');
  });
});

app.listen(config.port, () => {
  const services = Object.entries(enabledServices())
    .filter(([, on]) => on)
    .map(([name]) => name);
  console.log(`${config.title} listening on http://0.0.0.0:${config.port} (tz ${config.timeZone})`);
  console.log(services.length ? `Connected services: ${services.join(', ')}` : 'No services configured yet — open the web UI to run the setup wizard.');
  console.log(`Settings file: ${config.settingsFile}`);
});
