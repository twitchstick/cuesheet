/** The optional admin password: status, login, logout, and changing it. */
import express from 'express';
import { config, verifyAdminPassword, setAdminPassword, clearAdminPassword } from '../config.js';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  sessionTokenFrom,
  createSession,
  destroySession,
  destroyAllOtherSessions,
  isValidSession,
  isRateLimited,
  recordFailedAttempt,
  resetAttempts,
} from '../auth.js';

const router = express.Router();

/** Issue a fresh session and set its cookie -- shared by login and by
 * setting a first password (which has no prior session to keep alive). */
function logIn(res, req) {
  const token = createSession();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure, // true once TLS is terminated here or trusted via TRUST_PROXY + X-Forwarded-Proto
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

router.get('/auth/status', (req, res) => {
  res.json({ enabled: config.auth.enabled, managedByEnv: config.auth.managedByEnv, authenticated: isValidSession(sessionTokenFrom(req)) });
});

router.post('/auth/login', (req, res) => {
  if (!config.auth.enabled) return res.status(400).json({ error: 'No password is configured' });
  if (isRateLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

  const { password } = req.body ?? {};
  if (!verifyAdminPassword(password)) {
    recordFailedAttempt(req.ip);
    return res.status(401).json({ error: 'Incorrect password' });
  }
  resetAttempts(req.ip);
  logIn(res, req);
  res.json({ ok: true });
});

// No auth required to call this -- clearing an already-stale or nonexistent
// session is always safe, and there's no reason to demand a valid login
// just to let someone log out of one they no longer have.
router.post('/auth/logout', (req, res) => {
  destroySession(sessionTokenFrom(req));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.put('/auth/password', (req, res, next) => {
  try {
    if (config.auth.managedByEnv) {
      return res.status(400).json({
        error: 'The password is set by the ADMIN_PASSWORD environment variable and can’t be changed here. Remove it and restart to manage it from Settings instead.',
      });
    }
    const wasEnabled = config.auth.enabled;
    const hadSession = isValidSession(sessionTokenFrom(req));
    const { currentPassword, newPassword } = req.body ?? {};
    // A session already being open (a shared tablet someone walked up to,
    // say) isn't enough on its own to change or clear the password -- the
    // current one has to be proven again, the same as any "change password"
    // form. Not required the very first time, when there isn't one yet.
    if (wasEnabled && !verifyAdminPassword(currentPassword)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (newPassword === undefined) return res.status(400).json({ error: 'New password is required' });

    if (newPassword === '') {
      clearAdminPassword();
    } else {
      setAdminPassword(newPassword);
    }
    // Every other device now has to log in again with the new password (or
    // is simply logged out, if the password was just cleared); the session
    // making this change, if it already had one, already proved itself
    // moments ago and keeps going. Setting the very first password has no
    // prior session to keep alive -- without this, the person who just set
    // it would immediately be logged out by the gate they just turned on.
    destroyAllOtherSessions(sessionTokenFrom(req));
    if (!wasEnabled && !hadSession && config.auth.enabled) logIn(res, req);
    res.json({ enabled: config.auth.enabled });
  } catch (err) {
    next(err);
  }
});

export default router;
