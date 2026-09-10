import { fetchJson } from '../http.js';

const ENDPOINT = 'https://api.pushover.net/1/messages.json';

export async function sendPushover({ appToken, userKey, title, message, priority = 0, url = '', urlTitle = '' }) {
  if (!appToken || !userKey) throw new Error('Pushover app token and user key are required');
  const result = await fetchJson(ENDPOINT, {
    method: 'POST',
    timeoutMs: 10_000,
    form: {
      token: appToken,
      user: userKey,
      title: String(title).slice(0, 250),
      message: String(message).slice(0, 1024),
      priority: String(priority),
      ...(url ? { url: String(url).slice(0, 512), url_title: String(urlTitle || 'Open Cuesheet').slice(0, 100) } : {}),
    },
  });
  if (result?.status !== 1) throw new Error(Array.isArray(result?.errors) ? result.errors.join('; ') : 'Pushover rejected the notification');
  return { ok: true, request: result.request ?? null };
}
