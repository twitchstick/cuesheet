import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, enabledServices, anyServiceConfigured, publicConfig, getSettings, saveSettings, effectiveSecret, isProtected, ensureAuthSecret, SECRET_FIELD, SERVICES } from './config.js';
import { verifyHash, safeEqual, issueToken, verifyToken, loginAllowed, recordFailure, clearFailures } from './auth.js';
import { probes } from './services/probe.js';
import { cached, invalidate } from './cache.js';
import { fetchRaw, UpstreamError } from './http.js';
import { addDays, isIsoDate, localDate } from './util.js';
import * as plex from './services/plex.js';
import * as jellyfin from './services/jellyfin.js';
import * as radarr from './services/radarr.js';
import * as sonarr from './services/sonarr.js';
import * as seerr from './services/seerr.js';
import * as demo from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const api = express.Router();
api.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
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

// ---- Admin sign-in ----
// With no password configured everyone is an admin (single household, nothing to hide).
const bearer = (req) => {
  const header = String(req.get('authorization') ?? '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};
const isAdmin = (req) => !isProtected() || verifyToken(config.authSecret, bearer(req));
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Admin sign-in required' }));

const checkPassword = (password) =>
  (config.adminPasswordHash && verifyHash(password, config.adminPasswordHash)) || (config.adminPassword && safeEqual(password, config.adminPassword));

api.get('/config', (req, res) => {
  res.json({ ...publicConfig(), admin: isAdmin(req) });
});

api.get('/auth/status', (req, res) => res.json({ protected: isProtected(), admin: isAdmin(req) }));

api.post('/auth/login', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!loginAllowed(ip)) return res.status(429).json({ error: 'Too many attempts — wait 30 seconds' });
  const password = String(req.body?.password ?? '');
  if (!isProtected()) return res.json({ token: null, admin: true });
  if (!password || !checkPassword(password)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }
  clearFailures(ip);
  res.json({ token: issueToken(ensureAuthSecret()), admin: true });
});

// ---- Setup wizard / settings ----
api.get('/setup/status', (req, res) => {
  res.json({ needsSetup: !anyServiceConfigured() && !config.demo, locked: isProtected() && !isAdmin(req), settingsFile: config.settingsFile });
});

api.get('/settings', requireAdmin, (_req, res) => res.json(getSettings()));

api.put('/settings', requireAdmin, (req, res, next) => {
  try {
    const settings = saveSettings(req.body);
    invalidate('');
    // Setting or changing the password rotates the secret; hand the caller a fresh token so they stay signed in.
    const token = isProtected() ? issueToken(ensureAuthSecret()) : null;
    res.json({ settings, config: { ...publicConfig(), admin: true }, token });
  } catch (err) {
    next(err);
  }
});

api.post('/settings/test', requireAdmin, async (req, res) => {
  const { service, url } = req.body ?? {};
  if (!SERVICES.includes(service)) return res.status(400).json({ ok: false, error: 'Unknown service' });
  const secretField = SECRET_FIELD[service];
  const secret = effectiveSecret(service, req.body?.[secretField]);
  const target = String(url ?? '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'Enter the server URL first' });
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ ok: false, error: 'URL must start with http:// or https://' });
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


/** Viewers see what is playing, not who: drop the user and device names. */
const redactStreams = (result) => ({
  ...result,
  items: result.items.map((s) => ({ ...s, user: null, device: '' })),
  redacted: true,
});

api.get('/streams', async (req, res, next) => {
  try {
    const tasks = [];
    if (config.demo) tasks.push(['demo', async () => demo.streams()]);
    if (config.plex.enabled) tasks.push(['plex', () => plex.sessions(config.plex)]);
    if (config.jellyfin.enabled) tasks.push(['jellyfin', () => jellyfin.sessions(config.jellyfin)]);
    const result = await cached('streams', 5_000, () => gather(tasks));
    res.json(config.hideViewers && !isAdmin(req) ? redactStreams(result) : result);
  } catch (err) {
    next(err);
  }
});

api.get('/recent', async (_req, res, next) => {
  try {
    const limit = config.recentLimit;
    const tasks = [];
    if (config.demo) tasks.push(['demo', async () => demo.recent()]);
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

api.get('/calendar', async (req, res, next) => {
  try {
    const today = localDate(new Date(), config.timeZone);
    const start = isIsoDate(req.query.start) ? req.query.start : today;
    const end = isIsoDate(req.query.end) ? req.query.end : addDays(start, 6);
    if (end < start || addDays(start, 31) < end) {
      return res.status(400).json({ error: 'Calendar range must be 1–31 days' });
    }
    const tasks = [];
    if (config.demo) tasks.push(['demo', async () => demo.calendar(start, end, config.timeZone)]);
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
  if (!config.seerr.enabled && !config.demo) return res.status(404).json({ error: 'Seerr is not configured' });
  next();
};
// In demo mode the request features are answered from fixtures.
const seerrApi = () => (config.demo && !config.seerr.enabled ? demoSeerr : seerr);
const demoSeerr = {
  recentRequests: async () => demo.recentRequests(),
  trending: async () => demo.trending(),
  search: async (_cfg, q) => demo.search(q),
  details: async (_cfg, type, id) => demo.details(type, id),
  createRequest: async (_cfg, body) => demo.createRequest(body),
};

api.get('/requests', requireSeerr, async (_req, res, next) => {
  try {
    const items = await cached('requests', 30_000, () => seerrApi().recentRequests(config.seerr, 12));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

api.get('/trending', requireSeerr, async (_req, res, next) => {
  try {
    const items = await cached('trending', 60 * 60_000, () => seerrApi().trending(config.seerr));
    res.json({ items: items.slice(0, 12) });
  } catch (err) {
    next(err);
  }
});

api.get('/search', requireSeerr, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ items: [] });
    const items = await cached(`search:${q.toLowerCase()}`, 60_000, () => seerrApi().search(config.seerr, q));
    res.json({ items: items.slice(0, 18) });
  } catch (err) {
    next(err);
  }
});

api.get('/media/:type/:tmdbId', requireSeerr, async (req, res, next) => {
  try {
    const { type, tmdbId } = req.params;
    if (!['movie', 'tv'].includes(type) || !/^\d+$/.test(tmdbId)) return res.status(400).json({ error: 'Bad media reference' });
    res.json(await seerrApi().details(config.seerr, type, Number(tmdbId)));
  } catch (err) {
    next(err);
  }
});

api.post('/request', requireSeerr, async (req, res, next) => {
  try {
    const { mediaType, tmdbId, seasons } = req.body ?? {};
    if (!['movie', 'tv'].includes(mediaType) || !Number.isInteger(tmdbId) || tmdbId <= 0) {
      return res.status(400).json({ error: 'mediaType must be movie|tv and tmdbId a positive integer' });
    }
    const cleanSeasons = Array.isArray(seasons) ? seasons.filter((n) => Number.isInteger(n) && n > 0) : undefined;
    const created = await seerrApi().createRequest(config.seerr, { mediaType, tmdbId, seasons: cleanSeasons });
    invalidate('requests');
    invalidate('search:');
    invalidate('trending');
    invalidate(`seerr:details:${mediaType}:${tmdbId}`);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Image proxy: the browser never needs upstream URLs or credentials.
const IMAGE_SOURCES = {
  plex: (ref, q) => plex.imageRequest(config.plex, ref, { width: q.w, height: q.h }),
  jellyfin: (ref, q) => jellyfin.imageRequest(config.jellyfin, ref, { width: q.w, tag: q.tag }),
  radarr: (ref) => radarr.imageRequest(config.radarr, ref),
  sonarr: (ref) => sonarr.imageRequest(config.sonarr, ref),
};

api.get('/image', async (req, res) => {
  const source = String(req.query.s ?? '');
  const ref = String(req.query.p ?? '');
  if (source === 'demo') {
    if (!config.demo || !/^[a-z0-9-]{1,32}$/.test(ref)) return res.status(404).end();
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(demo.image(ref, { title: String(req.query.t ?? '').slice(0, 40), subtitle: String(req.query.u ?? '').slice(0, 40), kind: req.query.kind === 'backdrop' ? 'backdrop' : 'poster' }));
  }
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
    res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.send(bytes);
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
app.get('*', (req, res) => {
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
  if (config.demo) console.log('Demo mode is ON — showing sample data (unset DEMO_MODE to use real services)');
  else console.log(services.length ? `Connected services: ${services.join(', ')}` : 'No services configured yet — open the web UI to run the setup wizard.');
  console.log(`Settings file: ${config.settingsFile}${config.adminPassword ? ' (settings locked with ADMIN_PASSWORD)' : ''}`);
});
