import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword, newSecret } from './auth.js';

const env = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const num = (key, fallback) => {
  const n = Number(env(key, String(fallback)));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const bool = (v) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());
const stripSlash = (url) => String(url ?? '').trim().replace(/\/+$/, '');

export const SERVICES = ['plex', 'jellyfin', 'radarr', 'sonarr', 'seerr'];
/** Name of the credential field for each service. */
export const SECRET_FIELD = { plex: 'token', jellyfin: 'apiKey', radarr: 'apiKey', sonarr: 'apiKey', seerr: 'apiKey' };
const EXTRA_FIELDS = { jellyfin: ['userId'], seerr: ['userId'] };

export const DATA_DIR = path.resolve(env('DATA_DIR', 'data'));
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

/** Values taken from environment variables; used for any field not saved through the setup wizard. */
function envDefaults() {
  return {
    general: {
      title: env('APP_TITLE', 'Cuesheet'),
      serverName: env('SERVER_NAME', 'Apollo Media'),
      userName: env('USER_NAME'),
      demo: bool(env('DEMO_MODE')),
      adminPasswordHash: '',
      hideViewers: true,
    },
    auth: { secret: '', clientId: '' },
    access: { autoAdmin: true, admins: [], users: [], signIn: { plex: false, jellyfin: false } },
    plex: { url: env('PLEX_URL'), token: env('PLEX_TOKEN') },
    jellyfin: { url: env('JELLYFIN_URL'), apiKey: env('JELLYFIN_API_KEY'), userId: env('JELLYFIN_USER_ID') },
    radarr: { url: env('RADARR_URL'), apiKey: env('RADARR_API_KEY') },
    sonarr: { url: env('SONARR_URL'), apiKey: env('SONARR_API_KEY') },
    seerr: { url: env('SEERR_URL'), apiKey: env('SEERR_API_KEY'), userId: env('SEERR_USER_ID') },
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
  recentLimit: num('RECENT_LIMIT', 18),
  adminPassword: env('ADMIN_PASSWORD'),
  settingsFile: SETTINGS_FILE,
  // Filled in by rebuild():
  title: '',
  serverName: '',
  userName: '',
  demo: false,
  adminPasswordHash: '',
  hideViewers: true,
  authSecret: '',
  plexClientId: '',
  autoAdmin: true,
  admins: [],
  people: [],
  signIn: { plex: false, jellyfin: false },
  plex: {},
  jellyfin: {},
  radarr: {},
  sonarr: {},
  seerr: {},
};

/** Saved settings win over environment variables, field by field. */
function merged() {
  const base = envDefaults();
  const out = {
    general: { ...base.general, ...(saved.general ?? {}) },
    auth: { ...base.auth, ...(saved.auth ?? {}) },
    access: { ...base.access, ...(saved.access ?? {}) },
  };
  for (const s of SERVICES) out[s] = { ...base[s], ...(saved[s] ?? {}) };
  return out;
}

function rebuild() {
  const m = merged();
  config.title = String(m.general.title || 'Cuesheet');
  config.serverName = String(m.general.serverName ?? '');
  config.userName = String(m.general.userName ?? '');
  config.demo = Boolean(m.general.demo);
  config.adminPasswordHash = String(m.general.adminPasswordHash ?? '');
  config.hideViewers = m.general.hideViewers !== false;
  config.authSecret = String(m.auth.secret ?? '');
  config.plexClientId = String(m.auth.clientId ?? '');
  config.autoAdmin = m.access.autoAdmin !== false;
  config.admins = Array.isArray(m.access.admins) ? m.access.admins.map(String) : [];
  config.people = Array.isArray(m.access.users) ? m.access.users : [];
  const signIn = m.access.signIn ?? {};
  config.signIn = { plex: Boolean(signIn.plex), jellyfin: Boolean(signIn.jellyfin) };
  for (const s of SERVICES) {
    const fields = { url: stripSlash(m[s].url), [SECRET_FIELD[s]]: String(m[s][SECRET_FIELD[s]] ?? '').trim() };
    for (const f of EXTRA_FIELDS[s] ?? []) fields[f] = String(m[s][f] ?? '').trim();
    config[s] = { ...fields, enabled: Boolean(fields.url && fields[SECRET_FIELD[s]]) };
  }
}
rebuild();

export const enabledServices = () =>
  config.demo
    ? { plex: true, jellyfin: true, radarr: true, sonarr: true, seerr: true }
    : Object.fromEntries(SERVICES.map((s) => [s, config[s].enabled]));

export const anyServiceConfigured = () => SERVICES.some((s) => config[s].enabled);

/** Which sign-in methods are actually usable right now. */
export const signInProviders = () => ({
  plex: config.signIn.plex && config.plex.enabled,
  jellyfin: config.signIn.jellyfin && config.jellyfin.enabled,
  password: Boolean(config.adminPasswordHash || config.adminPassword),
});

/**
 * True once any sign-in method exists. Until then everyone is an admin,
 * which is the friendly default for a single household.
 */
export const isProtected = () => Object.values(signInProviders()).some(Boolean);

/** Make sure a signing secret exists; persisted so sessions survive restarts. */
export function ensureAuthSecret() {
  if (config.authSecret) return config.authSecret;
  patchSaved((next) => {
    next.auth = { ...(next.auth ?? {}), secret: newSecret() };
  });
  return config.authSecret;
}

/** A stable client identifier for the plex.tv handshake, generated once per install. */
export function ensurePlexClientId() {
  if (config.plexClientId) return config.plexClientId;
  patchSaved((next) => {
    next.auth = { ...(next.auth ?? {}), clientId: crypto.randomUUID() };
  });
  return config.plexClientId;
}

function patchSaved(mutate) {
  const next = structuredClone(saved);
  mutate(next);
  writeSettingsFile(next);
  saved = next;
  rebuild();
}

export const LOCAL_ADMIN_KEY = 'local:admin';

/**
 * What may this identity do? Resolved live from settings on every request,
 * so a change to the admins list takes effect without anyone signing in again.
 */
export function resolveAdmin(identity) {
  if (!identity) return false;
  if (identity.key === LOCAL_ADMIN_KEY) return true;
  if (config.admins.includes(identity.key)) return true;
  return config.autoAdmin && Boolean(identity.providerAdmin);
}

/** Remember someone who signed in, so they can be listed in Settings. */
export function recordPerson({ key, provider, name, avatar, providerAdmin }) {
  patchSaved((next) => {
    const users = Array.isArray(next.access?.users) ? [...next.access.users] : [];
    const at = users.findIndex((u) => u.key === key);
    const entry = { key, provider, name, avatar: avatar ?? '', providerAdmin: Boolean(providerAdmin), lastSeen: Date.now() };
    if (at >= 0) users[at] = { ...users[at], ...entry };
    else users.push(entry);
    next.access = { ...(next.access ?? {}), users };
  });
}

/** The people list as shown in Settings, with each person's resolved rank. */
export const listPeople = () =>
  config.people
    .map((u) => ({
      key: u.key,
      provider: u.provider,
      name: u.name,
      avatar: u.avatar ?? '',
      providerAdmin: Boolean(u.providerAdmin),
      listed: config.admins.includes(u.key),
      admin: resolveAdmin(u),
      lastSeen: u.lastSeen ?? 0,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen);

export function saveAccess({ autoAdmin, admins, forget, signIn }) {
  patchSaved((next) => {
    const access = { ...(next.access ?? {}) };
    if (typeof autoAdmin === 'boolean') access.autoAdmin = autoAdmin;
    if (signIn && typeof signIn === 'object') {
      access.signIn = {
        plex: typeof signIn.plex === 'boolean' ? signIn.plex : Boolean(access.signIn?.plex),
        jellyfin: typeof signIn.jellyfin === 'boolean' ? signIn.jellyfin : Boolean(access.signIn?.jellyfin),
      };
    }
    if (Array.isArray(admins)) access.admins = admins.filter((k) => typeof k === 'string').slice(0, 200);
    if (typeof forget === 'string') {
      access.users = (access.users ?? []).filter((u) => u.key !== forget);
      access.admins = (access.admins ?? []).filter((k) => k !== forget);
    }
    next.access = access;
  });
  return { autoAdmin: config.autoAdmin, signIn: config.signIn, people: listPeople() };
}

/** Rotate the signing secret: every signed-in browser is signed out. */
export function signEveryoneOut() {
  patchSaved((next) => {
    next.auth = { ...(next.auth ?? {}), secret: newSecret() };
  });
}

export const publicConfig = () => ({
  title: config.title,
  serverName: config.serverName,
  userName: config.userName,
  demo: config.demo,
  timeZone: config.timeZone,
  refreshSeconds: config.refreshSeconds,
  services: enabledServices(),
  protected: isProtected(),
  hideViewers: config.hideViewers,
});

/** Settings as shown to the browser: secrets are never returned, only whether one is stored. */
export function getSettings() {
  const out = {
    general: {
      title: config.title,
      serverName: config.serverName,
      userName: config.userName,
      demo: config.demo,
      adminPasswordSet: isProtected(),
      adminPasswordFromEnv: Boolean(config.adminPassword),
      hideViewers: config.hideViewers,
      autoAdmin: config.autoAdmin,
      signIn: config.signIn,
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
  return url;
}

const LABELS = { plex: 'Plex', jellyfin: 'Jellyfin', radarr: 'Radarr', sonarr: 'Sonarr', seerr: 'Seerr' };
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

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
    if (str(g.title) !== undefined) next.general.title = str(g.title, 60) || 'Cuesheet';
    if (str(g.serverName) !== undefined) next.general.serverName = str(g.serverName, 60);
    if (str(g.userName) !== undefined) next.general.userName = str(g.userName, 60);
    if (typeof g.demo === 'boolean') next.general.demo = g.demo;
    if (typeof g.hideViewers === 'boolean') next.general.hideViewers = g.hideViewers;
    if (typeof g.adminPassword === 'string' && g.adminPassword.trim()) {
      if (g.adminPassword.trim().length < 4) throw new SettingsError('Admin password must be at least 4 characters');
      next.general.adminPasswordHash = hashPassword(g.adminPassword.trim());
      next.auth = { ...(next.auth ?? {}), secret: newSecret() }; // sign everyone out
    }
    if (g.clearAdminPassword === true) {
      next.general.adminPasswordHash = '';
      next.auth = { ...(next.auth ?? {}), secret: newSecret() };
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

/** Resolve the effective secret for a probe: the one typed in the wizard, or the stored one. */
export function effectiveSecret(service, provided) {
  const typed = typeof provided === 'string' ? provided.trim() : '';
  return typed || config[service][SECRET_FIELD[service]] || '';
}
