/**
 * Admin sign-in. The password is stored as a scrypt hash in settings.json
 * (or supplied via ADMIN_PASSWORD). A successful login returns a token
 * signed with a per-install secret; changing the password rotates the
 * secret, which signs every existing session out.
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

export function issueToken(secret) {
  const payload = `admin.${Date.now().toString(36)}.${crypto.randomBytes(8).toString('base64url')}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyToken(secret, token) {
  if (!secret || typeof token !== 'string') return false;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  return payload.startsWith('admin.') && safeEqual(sig, sign(secret, payload));
}

/** Tiny brute-force brake: after 5 failed logins from one address, refuse for 30s. */
const failures = new Map();
export function loginAllowed(ip) {
  const f = failures.get(ip);
  if (!f) return true;
  if (f.count < 5) return true;
  if (Date.now() - f.last > 30_000) {
    failures.delete(ip);
    return true;
  }
  return false;
}
export function recordFailure(ip) {
  const f = failures.get(ip) ?? { count: 0, last: 0 };
  failures.set(ip, { count: f.count + 1, last: Date.now() });
}
export const clearFailures = (ip) => failures.delete(ip);
