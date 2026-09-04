import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertReachableUrl } from './http.js';

const env = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const num = (key, fallback) => {
  const n = Number(env(key, String(fallback)));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const stripSlash = (url) => String(url ?? '').trim().replace(/\/+$/, '');

/**
 * Like env(), but for credentials: also honors the Docker/Compose secrets
 * convention of `${KEY}_FILE` pointing at a file whose contents are the
 * real value (e.g. a secret mounted at /run/secrets/radarr_api_key), so a
 * credential never has to sit in a plain environment variable -- visible to
 * `docker inspect`, a process listing, or anything else with a view into
 * the container's environment. Takes precedence if both happen to be set.
 */
function envSecret(key, fallback = '') {
  const filePath = process.env[`${key}_FILE`];
  if (filePath) {
    if (process.env[key]) console.warn(`Both ${key} and ${key}_FILE are set -- using ${key}_FILE.`);
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      console.warn(`Could not read ${key}_FILE (${filePath}): ${err.message}`);
    }
  }
  return env(key, fallback);
}

/** The app's name is fixed — it is the product, not a preference. */
export const APP_TITLE = 'Cuesheet';
const DEFAULT_RECENT_LIMIT = 15;
const RECENT_LIMIT_RANGE = [3, 40];

const MIN_PASSWORD_LENGTH = 8;
const SCRYPT_KEYLEN = 64;

/** salt:hash, both hex -- scrypt with a fresh random salt each time a password is set. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Constant-time by construction: scrypt's output is always SCRYPT_KEYLEN
 * bytes regardless of the candidate's length, so there's no length-derived
 * timing signal for an attacker to read before timingSafeEqual ever runs. */
function verifyPasswordHash(candidate, stored) {
  const [saltHex, hashHex] = String(stored ?? '').split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(candidate, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const SERVICES = ['plex', 'jellyfin', 'radarr', 'sonarr', 'seerr', 'sabnzbd'];
/** Name of the credential field for each service. */
export const SECRET_FIELD = { plex: 'token', jellyfin: 'apiKey', radarr: 'apiKey', sonarr: 'apiKey', seerr: 'apiKey', sabnzbd: 'apiKey' };
const EXTRA_FIELDS = { jellyfin: ['userId'], seerr: ['userId'] };

export const DATA_DIR = path.resolve(env('DATA_DIR', 'data'));
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

/** Values taken from environment variables; used for any field not saved through the setup wizard. */
function envDefaults() {
  return {
    general: {
      serverName: env('SERVER_NAME', 'Apollo Media'),
      userName: env('USER_NAME'),
      recentLimit: num('RECENT_LIMIT', DEFAULT_RECENT_LIMIT),
    },
    plex: { url: env('PLEX_URL'), token: envSecret('PLEX_TOKEN') },
    jellyfin: { url: env('JELLYFIN_URL'), apiKey: envSecret('JELLYFIN_API_KEY'), userId: env('JELLYFIN_USER_ID') },
    radarr: { url: env('RADARR_URL'), apiKey: envSecret('RADARR_API_KEY') },
    sonarr: { url: env('SONARR_URL'), apiKey: envSecret('SONARR_API_KEY') },
    seerr: { url: env('SEERR_URL'), apiKey: envSecret('SEERR_API_KEY'), userId: env('SEERR_USER_ID') },
    sabnzbd: { url: env('SABNZBD_URL'), apiKey: envSecret('SABNZBD_API_KEY') },
  };
}

function readSettingsFile() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${SETTINGS_FILE}: ${err.message}`);
    return {};
  }
}

let saved = readSettingsFile();

export const config = {
  port: num('PORT', 3000),
  timeZone: env('TZ') || Intl.DateTimeFormat().resolvedOptions().timeZone,
  refreshSeconds: num('REFRESH_SECONDS', 15),
  settingsFile: SETTINGS_FILE,
  title: APP_TITLE,
  // Filled in by rebuild():
  serverName: '',
  userName: '',
  recentLimit: DEFAULT_RECENT_LIMIT,
  plex: {},
  jellyfin: {},
  radarr: {},
  sonarr: {},
  seerr: {},
  sabnzbd: {},
  links: [],
  auth: { enabled: false, managedByEnv: false },
};

// Private: whichever password hash is currently authoritative, and where it
// came from. Not on `config` itself -- nothing outside verifyAdminPassword()
// needs the hash, and config is otherwise handed around fairly freely.
let authSource = { hash: null, managedByEnv: false };

/** Saved settings win over environment variables, field by field. */
function merged() {
  const base = envDefaults();
  const out = { general: { ...base.general, ...(saved.general ?? {}) } };
  for (const s of SERVICES) out[s] = { ...base[s], ...(saved[s] ?? {}) };
  return out;
}

// Declared as a function so rebuild() can use it during module load.
function clampRecentLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RECENT_LIMIT;
  return Math.min(RECENT_LIMIT_RANGE[1], Math.max(RECENT_LIMIT_RANGE[0], Math.round(n)));
}

function rebuild() {
  const m = merged();
  config.serverName = String(m.general.serverName ?? '');
  config.userName = String(m.general.userName ?? '');
  config.recentLimit = clampRecentLimit(m.general.recentLimit);
  for (const s of SERVICES) {
    const fields = { url: stripSlash(m[s].url), [SECRET_FIELD[s]]: String(m[s][SECRET_FIELD[s]] ?? '').trim() };
    for (const f of EXTRA_FIELDS[s] ?? []) fields[f] = String(m[s][f] ?? '').trim();
    config[s] = { ...fields, enabled: Boolean(fields.url && fields[SECRET_FIELD[s]]) };
  }
  config.links = (Array.isArray(saved.links) ? saved.links : []).map(loadLink).filter(Boolean);

  // ADMIN_PASSWORD (or _FILE) always wins over a saved one -- the deliberate
  // exception to "saved settings win," and the recovery path for a forgotten
  // password: set the env var and restart. Hashed here (with a fresh salt
  // every rebuild) so verifyAdminPassword() always compares against a
  // fixed-length scrypt output regardless of source, rather than the env
  // password's own raw length being an observable timing signal.
  const envPassword = envSecret('ADMIN_PASSWORD') || null;
  const savedHash = typeof saved.security?.passwordHash === 'string' ? saved.security.passwordHash : null;
  authSource = envPassword ? { hash: hashPassword(envPassword), managedByEnv: true } : { hash: savedHash, managedByEnv: false };
  config.auth = { enabled: Boolean(authSource.hash), managedByEnv: authSource.managedByEnv };
}

/** True only if the given password matches whichever source is currently
 * authoritative. Always false (never throws) when no password is configured
 * at all -- callers must check config.auth.enabled separately if they need
 * to tell "wrong password" apart from "no gate to begin with." */
export function verifyAdminPassword(candidate) {
  if (typeof candidate !== 'string' || !candidate || !authSource.hash) return false;
  return verifyPasswordHash(candidate, authSource.hash);
}

/**
 * Set (or replace) the saved admin password. Callers are responsible for
 * having already verified the *current* password first (this only persists
 * the new one) and for refusing the request entirely when
 * config.auth.managedByEnv is true, since ADMIN_PASSWORD would just
 * override whatever gets saved here anyway.
 */
export function setAdminPassword(newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new SettingsError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (newPassword.length > 200) throw new SettingsError('Password is too long');
  const next = { ...saved, security: { ...(saved.security ?? {}), passwordHash: hashPassword(newPassword) } };
  writeSettingsFile(next);
  saved = next;
  rebuild();
}

/** Remove the saved password -- back to trusted-LAN mode, unless ADMIN_PASSWORD is still set. */
export function clearAdminPassword() {
  const security = { ...(saved.security ?? {}) };
  delete security.passwordHash;
  const next = { ...saved, security };
  writeSettingsFile(next);
  saved = next;
  rebuild();
}

/**
 * Load a link already sitting in settings.json. This is deliberately not
 * sanitizeLink() again: that full validation (URL shape, the SSRF guard)
 * is for the moment a link is saved, when the input is new and unproven.
 * Data already in the file was already validated the moment it was
 * written — re-running that same check on every single boot means a rule
 * change, or any edge case in the check itself, can silently delete a
 * link on the next restart, for a reason that never surfaces anywhere.
 * Loading only needs to rule out a genuinely broken entry, not re-litigate
 * a good one.
 */
function loadLink(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.label !== 'string' || typeof raw.url !== 'string') {
    console.warn(`Dropping a malformed link from settings.json: ${JSON.stringify(raw)}`);
    return null;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    label: raw.label.slice(0, 40),
    url: raw.url.slice(0, 300),
    icon: LINK_ICONS.includes(raw.icon) ? raw.icon : null,
    iconUrl: typeof raw.iconUrl === 'string' && raw.iconUrl ? raw.iconUrl.slice(0, 300) : null,
  };
}

export const enabledServices = () => Object.fromEntries(SERVICES.map((s) => [s, config[s].enabled]));

export const anyServiceConfigured = () => SERVICES.some((s) => config[s].enabled);

export const publicConfig = () => ({
  title: config.title,
  serverName: config.serverName,
  userName: config.userName,
  recentLimit: config.recentLimit,
  timeZone: config.timeZone,
  refreshSeconds: config.refreshSeconds,
  services: enabledServices(),
  // Where the browser should send people to make a request, or to look at
  // a title directly in the app that's actually handling it -- the signal
  // trace's own deep links, not proxied through Cuesheet like everything else.
  seerrUrl: config.seerr.enabled ? config.seerr.url : '',
  radarrUrl: config.radarr.enabled ? config.radarr.url : '',
  sonarrUrl: config.sonarr.enabled ? config.sonarr.url : '',
});

/** Settings as shown to the browser: secrets are never returned, only whether one is stored. */
export function getSettings() {
  const out = {
    general: {
      serverName: config.serverName,
      userName: config.userName,
      recentLimit: config.recentLimit,
    },
  };
  for (const s of SERVICES) {
    const secret = SECRET_FIELD[s];
    out[s] = { url: config[s].url, [`${secret}Set`]: Boolean(config[s][secret]) };
    for (const f of EXTRA_FIELDS[s] ?? []) out[s][f] = config[s][f];
  }
  return out;
}

export class SettingsError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function cleanUrl(value, label) {
  const url = stripSlash(value);
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SettingsError(`${label} URL is not a valid URL (include http:// or https://)`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new SettingsError(`${label} URL must start with http:// or https://`);
  try {
    assertReachableUrl(url);
  } catch (err) {
    throw new SettingsError(`${label}: ${err.message}`);
  }
  return url;
}

const LABELS = { plex: 'Plex', jellyfin: 'Jellyfin', radarr: 'Radarr', sonarr: 'Sonarr', seerr: 'Seerr' };
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/**
 * Quick links: arbitrary bookmarks to anything on the network, not just the
 * five services above. The browser navigates to these directly — Cuesheet's
 * server never fetches them — so validation only needs to rule out a
 * malformed or unsafe href (a stray javascript: URI, say), not check that
 * the address is reachable from the server.
 */
export const LINK_ICONS = ['link', 'server', 'shield', 'activity', 'hard-drive', 'box', 'download', 'terminal', 'globe'];
const MAX_LINKS = 24;

function sanitizeLink(raw) {
  if (!raw || typeof raw !== 'object') throw new SettingsError('Expected a link object');
  const label = str(raw.label, 40);
  if (!label) throw new SettingsError('Every link needs a name');
  const url = cleanUrl(str(raw.url, 300) ?? '', label);
  // A custom icon and a curated one are mutually exclusive; the custom
  // address wins if somehow both arrive, so stored data is never ambiguous.
  const iconUrlRaw = str(raw.iconUrl, 300);
  const iconUrl = iconUrlRaw ? cleanUrl(iconUrlRaw, `${label} icon`) : null;
  const icon = !iconUrl && LINK_ICONS.includes(raw.icon) ? raw.icon : null;
  const id = str(raw.id, 64) || crypto.randomUUID();
  return { id, label, url, icon, iconUrl };
}

/** Replace the whole link list and persist it. */
export function saveLinks(list) {
  if (!Array.isArray(list)) throw new SettingsError('Expected a list of links');
  if (list.length > MAX_LINKS) throw new SettingsError(`No more than ${MAX_LINKS} links`);
  const next = list.map(sanitizeLink);
  const seen = new Set();
  for (const link of next) {
    if (seen.has(link.id)) throw new SettingsError('Link ids must be unique');
    seen.add(link.id);
  }
  writeSettingsFile({ ...saved, links: next });
  saved = { ...saved, links: next };
  config.links = next;
  return next;
}

/**
 * Apply a settings patch from the wizard and persist it.
 * For secret fields: undefined/null keeps the stored value, '' clears it.
 */
export function saveSettings(patch) {
  if (!patch || typeof patch !== 'object') throw new SettingsError('Expected a settings object');
  const next = structuredClone(saved);

  if (patch.general && typeof patch.general === 'object') {
    next.general = { ...(next.general ?? {}) };
    const g = patch.general;
    if (str(g.serverName) !== undefined) next.general.serverName = str(g.serverName, 60);
    if (str(g.userName) !== undefined) next.general.userName = str(g.userName, 60);
    if (g.recentLimit !== undefined) {
      const n = Number(g.recentLimit);
      if (!Number.isFinite(n) || n < RECENT_LIMIT_RANGE[0] || n > RECENT_LIMIT_RANGE[1]) {
        throw new SettingsError(`Recently added count must be between ${RECENT_LIMIT_RANGE[0]} and ${RECENT_LIMIT_RANGE[1]}`);
      }
      next.general.recentLimit = Math.round(n);
    }
  }

  for (const s of SERVICES) {
    const p = patch[s];
    if (!p || typeof p !== 'object') continue;
    const cur = { ...(next[s] ?? {}) };
    if (p.url !== undefined) cur.url = cleanUrl(str(p.url, 300) ?? '', LABELS[s]);
    const secret = SECRET_FIELD[s];
    if (p[secret] !== undefined && p[secret] !== null) cur[secret] = str(p[secret], 500) ?? '';
    for (const f of EXTRA_FIELDS[s] ?? []) if (p[f] !== undefined) cur[f] = str(p[f], 100) ?? '';
    next[s] = cur;
  }

  writeSettingsFile(next);
  saved = next;
  rebuild();
  return getSettings();
}

function writeSettingsFile(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${SETTINGS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...data }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, SETTINGS_FILE);
  } catch (err) {
    const e = new Error(`Could not write ${SETTINGS_FILE}: ${err.message}. Check that the data directory is mounted and writable.`);
    e.status = 500;
    throw e;
  }
}

const origin = (url) => {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Resolve the credential for a connection test: the one typed into the wizard,
 * or the stored one — but the stored one only when the URL being tested is the
 * same server it belongs to. Without that check, anyone who can reach the
 * settings API could point a test at a host they control and have Cuesheet
 * hand over the saved key.
 */
export function effectiveSecret(service, provided, url) {
  const typed = typeof provided === 'string' ? provided.trim() : '';
  if (typed) return typed;
  const stored = config[service][SECRET_FIELD[service]] || '';
  if (!stored) return '';
  const target = origin(url);
  return target && target === origin(config[service].url) ? stored : '';
}

// Run only once every const above has been declared. A previous version
// called this immediately after its own definition, midway through the
// file -- twice now that has meant a helper it depends on (str, then
// LINK_ICONS) hadn't been initialized yet, since `const` stays in the
// temporal dead zone until its own line runs. That silently dropped every
// link on every single boot. Calling it last, once, closes off the whole
// class of bug rather than the one variable that happened to trip it.
rebuild();
