import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  config,
  enabledServices,
  anyServiceConfigured,
  publicConfig,
  getSettings,
  saveSettings,
  effectiveSecret,
  isProtected,
  signInProviders,
  ensureAuthSecret,
  ensurePlexClientId,
  resolveAdmin,
  recordPerson,
  listPeople,
  saveAccess,
  signEveryoneOut,
  LOCAL_ADMIN_KEY,
  SECRET_FIELD,
  SERVICES,
} from './config.js';
import { verifyHash, safeEqual, issueToken, readToken, loginAllowed, recordFailure, clearFailures } from './auth.js';
import * as plexAuth from './services/plexAuth.js';
import * as jellyfinAuth from './services/jellyfinAuth.js';
import { probes } from './services/probe.js';
import { cached, invalidate } from './cache.js';
import { fetchRaw, UpstreamError } from './http.js';
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
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

app.use((_req, res, next) => {
  res.set('Content-Security-Policy', CSP);
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

// ---- Sign-in ----
// Until a sign-in method exists, everyone is an admin (single household, nothing to hide).
const bearer = (req) => {
  const header = String(req.get('authorization') ?? '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};
const identityOf = (req) => readToken(config.authSecret, bearer(req));
const isAdmin = (req) => !isProtected() || resolveAdmin(identityOf(req));
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Admin sign-in required' }));

const checkPassword = (password) =>
  (config.adminPasswordHash && verifyHash(password, config.adminPasswordHash)) || (config.adminPassword && safeEqual(password, config.adminPassword));

/** Sign someone in: remember them, then hand back a token and who they are. */
function grant(identity, { remember = true } = {}) {
  if (remember) recordPerson(identity);
  const admin = resolveAdmin(identity);
  return {
    token: issueToken(ensureAuthSecret(), identity),
    admin,
    user: { key: identity.key, name: identity.name, avatar: identity.avatar ?? '', provider: identity.provider ?? 'local', admin },
  };
}

const describe = (req) => {
  const identity = identityOf(req);
  const admin = isAdmin(req);
  return {
    admin,
    user: identity ? { key: identity.key, name: identity.name, avatar: identity.avatar, provider: identity.key.split(':')[0], admin } : null,
  };
};

api.get('/config', (req, res) => {
  res.json({ ...publicConfig(), ...describe(req) });
});

api.get('/auth/status', (req, res) => {
  res.json({ protected: isProtected(), providers: signInProviders(), ...describe(req) });
});

api.post('/auth/login', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!loginAllowed(ip)) return res.status(429).json({ error: 'Too many attempts — wait 30 seconds' });
  const password = String(req.body?.password ?? '');
  if (!signInProviders().password) return res.status(404).json({ error: 'No admin password is set' });
  if (!password || !checkPassword(password)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Wrong password' });
  }
  clearFailures(ip);
  const name = config.userName?.trim() || 'Admin';
  res.json(grant({ key: LOCAL_ADMIN_KEY, provider: 'local', name, avatar: '', providerAdmin: true }, { remember: false }));
});

// Plex: plex.tv issues a PIN, the browser sends the person off to approve it,
// then we claim the token and check it reaches *this* Plex server.
//
// PIN ids are not secret, so each one is tied to a random secret handed only to
// the browser that started the flow. Without that, anyone who guessed an
// outstanding PIN could race in and claim someone else's session.
const pendingPins = new Map();
const PIN_TTL_MS = 10 * 60_000;

function rememberPin(pinId) {
  const now = Date.now();
  for (const [id, p] of pendingPins) if (now - p.created > PIN_TTL_MS) pendingPins.delete(id);
  if (pendingPins.size > 100) pendingPins.clear();
  const secret = crypto.randomBytes(24).toString('base64url');
  pendingPins.set(pinId, { secret, created: now });
  return secret;
}

function pinMatches(pinId, given) {
  const entry = pendingPins.get(pinId);
  if (!entry) return false;
  if (Date.now() - entry.created > PIN_TTL_MS) {
    pendingPins.delete(pinId);
    return false;
  }
  return typeof given === 'string' && safeEqual(given, entry.secret);
}

api.post('/auth/plex/start', async (_req, res, next) => {
  try {
    if (!signInProviders().plex) return res.status(404).json({ error: 'Plex sign-in is not enabled' });
    const pin = await plexAuth.createPin(ensurePlexClientId());
    res.json({ ...pin, pinSecret: rememberPin(pin.pinId) });
  } catch (err) {
    next(err);
  }
});

api.post('/auth/plex/finish', async (req, res, next) => {
  try {
    if (!signInProviders().plex) return res.status(404).json({ error: 'Plex sign-in is not enabled' });
    const pinId = String(req.body?.pinId ?? '');
    if (!/^[A-Za-z0-9-]{1,64}$/.test(pinId)) return res.status(400).json({ error: 'Bad sign-in reference' });
    if (!pinMatches(pinId, req.body?.pinSecret)) return res.status(400).json({ error: 'This sign-in has expired. Start again.' });
    const clientId = ensurePlexClientId();
    const plexToken = await plexAuth.claimPin(clientId, pinId);
    if (!plexToken) return res.json({ pending: true });

    const [who, serverId] = await Promise.all([plexAuth.account(clientId, plexToken), plexAuth.machineId(config.plex)]);
    const { access, owner } = await plexAuth.serverAccess(clientId, plexToken, serverId);
    pendingPins.delete(pinId); // single use
    if (!access) return res.status(403).json({ error: `${who.name} does not have access to this Plex server` });

    res.json(grant({ key: `plex:${who.id}`, provider: 'plex', name: who.name, avatar: who.avatar, providerAdmin: owner }));
  } catch (err) {
    next(err);
  }
});

api.post('/auth/jellyfin', async (req, res, next) => {
  const ip = req.ip ?? 'unknown';
  try {
    if (!signInProviders().jellyfin) return res.status(404).json({ error: 'Jellyfin sign-in is not enabled' });
    if (!loginAllowed(ip)) return res.status(429).json({ error: 'Too many attempts — wait 30 seconds' });
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username) return res.status(400).json({ error: 'Enter your Jellyfin username' });
    let who;
    try {
      who = await jellyfinAuth.authenticate(config.jellyfin, username, password);
    } catch (err) {
      recordFailure(ip);
      const status = err?.status;
      return res.status(401).json({ error: status === 401 ? 'Wrong username or password' : err.message ?? 'Jellyfin sign-in failed' });
    }
    clearFailures(ip);
    res.json(grant({ key: `jellyfin:${who.id}`, provider: 'jellyfin', name: who.name, avatar: who.avatar, providerAdmin: who.admin }));
  } catch (err) {
    next(err);
  }
});

// ---- People and ranks ----
api.get('/people', requireAdmin, (_req, res) => {
  res.json({ autoAdmin: config.autoAdmin, signIn: config.signIn, providers: signInProviders(), people: listPeople() });
});

api.put('/people', requireAdmin, (req, res, next) => {
  try {
    const { autoAdmin, admins, forget, signIn } = req.body ?? {};
    saveAccess({ autoAdmin, admins, forget, signIn });
    res.json({ autoAdmin: config.autoAdmin, signIn: config.signIn, providers: signInProviders(), people: listPeople() });
  } catch (err) {
    next(err);
  }
});

api.post('/people/sign-out-everyone', requireAdmin, (req, res) => {
  const identity = identityOf(req);
  signEveryoneOut();
  // Keep whoever asked signed in, so they don't lock themselves out.
  const token = identity ? issueToken(ensureAuthSecret(), identity) : null;
  res.json({ ok: true, token });
});

// ---- Setup wizard / settings ----
api.get('/setup/status', (req, res) => {
  const admin = isAdmin(req);
  res.json({ needsSetup: !anyServiceConfigured(), locked: isProtected() && !admin, settingsFile: admin ? config.settingsFile : '' });
});

api.get('/settings', requireAdmin, (_req, res) => res.json(getSettings()));

api.put('/settings', requireAdmin, (req, res, next) => {
  try {
    const settings = saveSettings(req.body);
    invalidate('');
    // Changing the password rotates the secret; hand the caller a fresh token so they stay signed in.
    const identity = identityOf(req) ?? { key: LOCAL_ADMIN_KEY, name: config.userName?.trim() || 'Admin', avatar: '', providerAdmin: true };
    const token = isProtected() ? issueToken(ensureAuthSecret(), identity) : null;
    const admin = resolveAdmin(identity);
    res.json({
      settings,
      config: { ...publicConfig(), admin, user: { key: identity.key, name: identity.name, avatar: identity.avatar ?? '', provider: identity.key.split(':')[0], admin } },
      token,
    });
  } catch (err) {
    next(err);
  }
});

api.post('/settings/test', requireAdmin, async (req, res) => {
  const { service, url } = req.body ?? {};
  if (!SERVICES.includes(service)) return res.status(400).json({ ok: false, error: 'Unknown service' });
  const secretField = SECRET_FIELD[service];
  const target = String(url ?? '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'Enter the server URL first' });
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ ok: false, error: 'URL must start with http:// or https://' });
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


/**
 * Viewers see what is playing, not who: drop the user and device names.
 * Their own stream is the exception — it is marked so the page can say "You".
 */
const isOwnStream = (stream, identity) => {
  if (!identity) return false;
  const [provider] = identity.key.split(':');
  return provider === stream.source && Boolean(stream.user) && stream.user.toLowerCase() === identity.name.toLowerCase();
};

const redactStreams = (result, identity) => ({
  ...result,
  items: result.items.map((s) => (isOwnStream(s, identity) ? { ...s, you: true } : { ...s, user: null, device: '', you: false })),
  redacted: true,
});

api.get('/streams', async (req, res, next) => {
  try {
    const tasks = [];
    if (config.plex.enabled) tasks.push(['plex', () => plex.sessions(config.plex)]);
    if (config.jellyfin.enabled) tasks.push(['jellyfin', () => jellyfin.sessions(config.jellyfin)]);
    const result = await cached('streams', 5_000, () => gather(tasks));
    res.json(config.hideViewers && !isAdmin(req) ? redactStreams(result, identityOf(req)) : result);
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

api.get('/calendar', async (req, res, next) => {
  try {
    const today = localDate(new Date(), config.timeZone);
    const start = isIsoDate(req.query.start) ? req.query.start : today;
    const end = isIsoDate(req.query.end) ? req.query.end : addDays(start, 6);
    if (end < start || addDays(start, 31) < end) {
      return res.status(400).json({ error: 'Calendar range must be 1–31 days' });
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

api.get('/requests', requireSeerr, async (_req, res, next) => {
  try {
    const items = await cached('requests', 30_000, () => seerr.recentRequests(config.seerr, 12));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

api.get('/trending', requireSeerr, async (_req, res, next) => {
  try {
    const items = await cached('trending', 60 * 60_000, () => seerr.trending(config.seerr));
    res.json({ items: items.slice(0, 12) });
  } catch (err) {
    next(err);
  }
});

api.get('/search', requireSeerr, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ items: [] });
    const items = await cached(`search:${q.toLowerCase()}`, 60_000, () => seerr.search(config.seerr, q));
    res.json({ items: items.slice(0, 18) });
  } catch (err) {
    next(err);
  }
});

api.get('/media/:type/:tmdbId', requireSeerr, async (req, res, next) => {
  try {
    const { type, tmdbId } = req.params;
    if (!['movie', 'tv'].includes(type) || !/^\d+$/.test(tmdbId)) return res.status(400).json({ error: 'Bad media reference' });
    res.json(await seerr.details(config.seerr, type, Number(tmdbId)));
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
    const created = await seerr.createRequest(config.seerr, { mediaType, tmdbId, seasons: cleanSeasons });
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
  console.log(`Settings file: ${config.settingsFile}${config.adminPassword ? ' (settings locked with ADMIN_PASSWORD)' : ''}`);
});
