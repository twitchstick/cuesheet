/**
 * Jellyfin sign-in: the username and password go straight to your Jellyfin
 * server, which decides whether they're valid and whether that account is a
 * Jellyfin administrator. Cuesheet stores neither.
 */
import { fetchJson } from '../http.js';

export async function authenticate(cfg, username, password) {
  const data = await fetchJson(`${cfg.url}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'MediaBrowser Client="Cuesheet", Device="Cuesheet", DeviceId="cuesheet-signin", Version="1.0"',
    },
    body: { Username: username, Pw: password },
    timeoutMs: 10_000,
  });
  const user = data?.User;
  if (!user?.Id) throw new Error('Jellyfin did not return an account');
  return {
    id: String(user.Id),
    name: user.Name || 'Jellyfin user',
    avatar: '',
    admin: Boolean(user.Policy?.IsAdministrator),
  };
}
