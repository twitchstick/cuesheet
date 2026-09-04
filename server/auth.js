/**
 * Sessions for the optional admin password (server/config.js owns the
 * password itself; this owns proving a browser already gave the right one).
 * There are no accounts -- every session is anonymous, just "this browser
 * knows the password" -- so a session is nothing but a random token in an
 * in-memory Set-like Map, with no per-user identity to track.
 *
 * Deliberately no expiry: the answer to "how long should a login last" was
 * "until you log out," so a session lives until destroySession() removes it
 * (an explicit logout) or destroyAllOtherSessions()/a full restart clears
 * it (changing the password, or the process itself going away -- there is
 * no persistence across a restart, which is the intended fail-safe: losing
 * every session under an obscure edge case is a shrug, not a lockout).
 */
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'cuesheet_session';
// Browsers cap a cookie's own lifetime around 400 days regardless of what a
// server asks for (Chrome enforces this outright; others are heading the
// same way), so "until you log out" is really "until you log out, or this
// ~13 months pass without a new one being issued" -- the closest this can
// get to indefinite within that limit.
export const SESSION_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

/** Node/Express don't parse the `Cookie` header into req.cookies without the
 * cookie-parser middleware -- rather than pull in a dependency for a header
 * this simple, parse just the one cookie this app actually sets. */
export function sessionTokenFrom(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

const sessions = new Map(); // token -> { createdAt }

export function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

export function isValidSession(token) {
  return typeof token === 'string' && sessions.has(token);
}

export function destroySession(token) {
  if (typeof token === 'string') sessions.delete(token);
}

/** Everything except `keep` -- used when the password changes, so every
 * other device has to prove it knows the new one, but the session that just
 * changed it (already proven, moments ago) isn't punished for doing so. */
export function destroyAllOtherSessions(keep) {
  for (const token of sessions.keys()) if (token !== keep) sessions.delete(token);
}

/**
 * A small, deliberately simple brute-force throttle on the login endpoint:
 * MAX_ATTEMPTS failures from one address within WINDOW_MS locks that
 * address out for the rest of the window. Per-IP rather than per-account,
 * since there are no accounts; reset on the next successful login.
 */
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60_000;
const attempts = new Map(); // ip -> { count, windowStart }

export function isRateLimited(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.windowStart > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
  } else {
    a.count += 1;
  }
}

export function resetAttempts(ip) {
  attempts.delete(ip);
}
