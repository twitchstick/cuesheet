import fs from 'node:fs';
import path from 'node:path';

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
    },
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
  plex: {},
  jellyfin: {},
  radarr: {},
  sonarr: {},
  seerr: {},
};

/** Saved settings win over environment variables, field by field. */
function merged() {
  const base = envDefaults();
  const out = { general: { ...base.general, ...(saved.general ?? {}) } };
  for (const s of SERVICES) out[s] = { ...base[s], ...(saved[s] ?? {}) };
  return out;
}

function rebuild() {
  const m = merged();
  config.title = String(m.general.title || 'Cuesheet');
  config.serverName = String(m.general.serverName ?? '');
  config.userName = String(m.general.userName ?? '');
  config.demo = Boolean(m.general.demo);
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

export const publicConfig = () => ({
  title: config.title,
  serverName: config.serverName,
  userName: config.userName,
  demo: config.demo,
  timeZone: config.timeZone,
  refreshSeconds: config.refreshSeconds,
  services: enabledServices(),
});

/** Settings as shown to the browser: secrets are never returned, only whether one is stored. */
export function getSettings() {
  const out = {
    general: { title: config.title, serverName: config.serverName, userName: config.userName, demo: config.demo },
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
