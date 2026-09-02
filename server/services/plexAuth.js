/**
 * "Sign in with Plex" using plex.tv's PIN flow, the same handshake
 * Overseerr uses. Cuesheet never sees anyone's Plex password: plex.tv
 * hands back a token, and we only accept it if that account actually has
 * access to the Plex server this dashboard is pointed at.
 */
import { fetchJson } from '../http.js';

const PLEX_TV = (process.env.PLEX_TV_URL || 'https://plex.tv').replace(/\/+$/, '');

const headers = (clientId, token) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-Plex-Product': 'Cuesheet',
  'X-Plex-Version': '1.0',
  'X-Plex-Client-Identifier': clientId,
  'X-Plex-Device': 'Cuesheet',
  'X-Plex-Platform': 'Web',
  ...(token ? { 'X-Plex-Token': token } : {}),
});

/** Ask plex.tv for a PIN. The browser sends the person to `authUrl` to approve it. */
export async function createPin(clientId) {
  const pin = await fetchJson(`${PLEX_TV}/api/v2/pins?strong=true`, { method: 'POST', headers: headers(clientId), timeoutMs: 10_000 });
  if (!pin?.id || !pin?.code) throw new Error('plex.tv did not return a sign-in code');
  const params = new URLSearchParams({
    clientID: clientId,
    code: pin.code,
    'context[device][product]': 'Cuesheet',
  });
  return { pinId: String(pin.id), code: pin.code, authUrl: `https://app.plex.tv/auth#?${params.toString()}` };
}

/** Poll a PIN. Returns null while the person hasn't finished signing in. */
export async function claimPin(clientId, pinId) {
  const pin = await fetchJson(`${PLEX_TV}/api/v2/pins/${encodeURIComponent(pinId)}`, { headers: headers(clientId), timeoutMs: 10_000 });
  return pin?.authToken ? String(pin.authToken) : null;
}

/** Who does this Plex token belong to? */
export async function account(clientId, token) {
  const user = await fetchJson(`${PLEX_TV}/api/v2/user`, { headers: headers(clientId, token), timeoutMs: 10_000 });
  if (!user?.id) throw new Error('Could not read the Plex account');
  return {
    id: String(user.id),
    name: user.username || user.title || user.friendlyName || user.email || 'Plex user',
    avatar: typeof user.thumb === 'string' && user.thumb.startsWith('https://') ? user.thumb : '',
  };
}

/**
 * Does this account reach our Plex server, and does it own it?
 * @returns {{access: boolean, owner: boolean}}
 */
export async function serverAccess(clientId, token, machineIdentifier) {
  const resources = await fetchJson(`${PLEX_TV}/api/v2/resources?includeHttps=1`, { headers: headers(clientId, token), timeoutMs: 10_000 });
  const match = (Array.isArray(resources) ? resources : []).find((r) => r?.clientIdentifier === machineIdentifier);
  return { access: Boolean(match), owner: Boolean(match?.owned) };
}

/** The server's own machine identifier, used to match against the account's resource list. */
export async function machineId(cfg) {
  const data = await fetchJson(`${cfg.url}/identity`, { headers: { Accept: 'application/json', 'X-Plex-Token': cfg.token }, timeoutMs: 8000 });
  const id = data?.MediaContainer?.machineIdentifier;
  if (!id) throw new Error('Could not read the Plex server identity');
  return String(id);
}
