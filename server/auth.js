/**
 * Sign-in. People sign in with Plex, with Jellyfin, or with the admin
 * password (stored as a scrypt hash in settings.json, or supplied via
 * ADMIN_PASSWORD). A successful sign-in returns an identity token signed
 * with a per-install secret; rotating that secret signs everyone out.
 *
 * The token carries who someone is, never what they may do — rank is
 * resolved from settings on every request, so promoting or demoting
 * someone takes effect immediately without a re-login.
 */
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyHash(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const newSecret = () => crypto.randomBytes(32).toString('base64url');

const sign = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/**
 * @param {object} identity { key, name, avatar, providerAdmin }
 */
/** How long a signed-in browser stays signed in. */
export const SESSION_DAYS = 60;

export function issueToken(secret, identity) {
  const now = Date.now();
  const payload = `v1.${b64({
    k: identity.key,
    n: identity.name ?? '',
    av: identity.avatar ?? '',
    pa: Boolean(identity.providerAdmin),
    t: now,
    exp: now + SESSION_DAYS * 86_400_000,
  })}`;
  return `${payload}.${sign(secret, payload)}`;
}

/** @returns {{key:string,name:string,avatar:string,providerAdmin:boolean}|null} */
export function readToken(secret, token) {
  if (!secret || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  if (!payload.startsWith('v1.')) return null;
  if (!safeEqual(token.slice(idx + 1), sign(secret, payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.slice(3), 'base64url').toString('utf8'));
    if (!data?.k || typeof data.k !== 'string') return null;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { key: data.k, name: String(data.n ?? ''), avatar: String(data.av ?? ''), providerAdmin: Boolean(data.pa) };
  } catch {
    return null;
  }
}

/** Tiny brute-force brake: after 5 failed sign-ins from one address, refuse for 30s. */
const failures = new Map();
const FAILURE_WINDOW_MS = 30_000;

/** Drop stale entries so a flood of addresses can't grow the map without bound. */
function prune() {
  const cutoff = Date.now() - FAILURE_WINDOW_MS;
  for (const [ip, f] of failures) if (f.last < cutoff) failures.delete(ip);
}

export function loginAllowed(ip) {
  const f = failures.get(ip);
  if (!f) return true;
  if (f.count < 5) return true;
  if (Date.now() - f.last > FAILURE_WINDOW_MS) {
    failures.delete(ip);
    return true;
  }
  return false;
}
export function recordFailure(ip) {
  prune();
  if (failures.size > 5_000) failures.clear();
  const f = failures.get(ip) ?? { count: 0, last: 0 };
  failures.set(ip, { count: f.count + 1, last: Date.now() });
}
export const clearFailures = (ip) => failures.delete(ip);
