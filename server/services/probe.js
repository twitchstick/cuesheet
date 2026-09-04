/**
 * Connection tests used by the setup wizard. Each returns
 * { ok: true, name, version, users? } or throws with a readable message.
 */
import { fetchJson } from '../http.js';

const clean = (v) => String(v ?? '').trim().replace(/\/+$/, '');

export async function plex({ url, token }) {
  const data = await fetchJson(`${clean(url)}/`, {
    headers: { 'X-Plex-Token': token, 'X-Plex-Client-Identifier': 'cuesheet', 'X-Plex-Product': 'Cuesheet' },
    timeoutMs: 8000,
  });
  const mc = data?.MediaContainer ?? {};
  return { ok: true, name: mc.friendlyName || 'Plex Media Server', version: mc.version ?? null };
}

export async function jellyfin({ url, apiKey }) {
  const headers = { Authorization: `MediaBrowser Token="${apiKey}", Client="Cuesheet", Device="Cuesheet", DeviceId="cuesheet", Version="0.1"` };
  const info = await fetchJson(`${clean(url)}/System/Info`, { headers, timeoutMs: 8000 });
  let users;
  try {
    const list = await fetchJson(`${clean(url)}/Users`, { headers, timeoutMs: 8000 });
    users = (Array.isArray(list) ? list : []).map((u) => ({ id: u.Id, name: u.Name })).filter((u) => u.id && u.name);
  } catch {
    users = [];
  }
  return { ok: true, name: info?.ServerName || 'Jellyfin', version: info?.Version ?? null, users };
}

async function arr({ url, apiKey }, fallbackName) {
  const status = await fetchJson(`${clean(url)}/api/v3/system/status`, { headers: { 'X-Api-Key': apiKey }, timeoutMs: 8000 });
  return { ok: true, name: status?.instanceName || status?.appName || fallbackName, version: status?.version ?? null };
}
export const radarr = (opts) => arr(opts, 'Radarr');
export const sonarr = (opts) => arr(opts, 'Sonarr');

export async function seerr({ url, apiKey }) {
  const headers = { 'X-Api-Key': apiKey };
  const main = await fetchJson(`${clean(url)}/api/v1/settings/main`, { headers, timeoutMs: 8000 });
  let version;
  try {
    version = (await fetchJson(`${clean(url)}/api/v1/status`, { timeoutMs: 5000 }))?.version ?? null;
  } catch {
    version = null;
  }
  let users;
  try {
    const list = await fetchJson(`${clean(url)}/api/v1/user?take=100&sort=displayname`, { headers, timeoutMs: 8000 });
    users = (list?.results ?? []).map((u) => ({ id: String(u.id), name: u.displayName || u.email || `User ${u.id}` }));
  } catch {
    users = [];
  }
  return { ok: true, name: main?.applicationTitle || 'Seerr', version, users };
}

export async function sabnzbd({ url, apiKey }) {
  const params = new URLSearchParams({ apikey: apiKey, output: 'json', mode: 'version' });
  const data = await fetchJson(`${clean(url)}/api?${params}`, { timeoutMs: 8000 });
  // A bad key comes back as 200 OK with an error body, not an HTTP error.
  if (data?.error) throw new Error(data.error);
  if (typeof data?.version !== 'string') throw new Error('Unexpected response from SABnzbd');
  return { ok: true, name: 'SABnzbd', version: data.version };
}

export const probes = { plex, jellyfin, radarr, sonarr, seerr, sabnzbd };
