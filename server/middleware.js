import { config } from './config.js';
import { UpstreamError } from './http.js';
import { isValidSession, sessionTokenFrom } from './auth.js';

// The page only ever loads its own bundle; posters come from us or from TMDB.
// A quick link's favicon is the one exception: it can point anywhere on the
// LAN, almost always over plain http, so its origin is added to img-src
// specifically -- not http: wholesale -- each time a link is saved.
const CSP_REST = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function buildCsp() {
  const httpOrigins = new Set();
  for (const link of config.links) {
    // A link's own address and its icon (favicon or a custom icon URL) can
    // be different hosts entirely -- both need to be allowed to load.
    for (const target of [link.url, link.iconUrl]) {
      if (!target) continue;
      try {
        const u = new URL(target);
        if (u.protocol === 'http:') httpOrigins.add(u.origin);
      } catch {
        // Already validated on save; ignore rather than break every page load.
      }
    }
  }
  const imgSrc = ["img-src 'self' data: https:", ...httpOrigins].join(' ');
  return `${imgSrc}; ${CSP_REST}`;
}

/** CSP (rebuilt per request -- quick links can change) plus the usual security headers, on every response. */
export function securityHeaders(_req, res, next) {
  res.set('Content-Security-Policy', buildCsp());
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  next();
}

/** Every /api response is live data -- never cached by the browser or a proxy in between. */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/**
 * Trusted-LAN mode by default: no password configured, everything below is
 * a no-op and every request goes straight through, same as before this
 * existed. When a password *is* configured, everything except a small
 * allowlist (enough to render a login screen and log into it) needs a
 * valid session -- the real enforcement of the gate. The client's own
 * login screen is UX; this is what actually protects a route.
 */
const OPEN_WHEN_LOCKED = new Set(['/config', '/setup/status', '/health', '/auth/status', '/auth/login', '/auth/logout']);
export function requireAuth(req, res, next) {
  if (!config.auth.enabled || OPEN_WHEN_LOCKED.has(req.path)) return next();
  if (isValidSession(sessionTokenFrom(req))) return next();
  res.status(401).json({ error: 'Login required' });
}

// A page the viewer happens to be visiting must not be able to reach in and
// change settings, or -- once a password is set -- ride along on a session
// cookie it never should have had access to. Browsers always send an Origin
// on cross-site writes, and it stays the attacker's domain even when DNS
// rebinding makes the request look same-origin to the network. The
// session cookie's own SameSite=Strict (see routes/auth.js) is the primary
// defense once a session exists at all; this covers every write regardless
// of whether one does.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export function checkOrigin(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // curl, scripts, the container itself
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Bad origin' });
  }
  if (originHost !== req.get('host')) return res.status(403).json({ error: 'Cross-site requests are not allowed' });
  next();
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, _req, res, _next) {
  const status = err instanceof UpstreamError ? 502 : err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Unexpected error' });
}
