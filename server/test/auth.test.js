import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_COOKIE,
  sessionTokenFrom,
  createSession,
  isValidSession,
  destroySession,
  destroyAllOtherSessions,
  isRateLimited,
  recordFailedAttempt,
  resetAttempts,
} from '../auth.js';

describe('sessions', () => {
  test('a freshly created session is valid', () => {
    const token = createSession();
    assert.equal(isValidSession(token), true);
  });

  test('a made-up token is never valid', () => {
    assert.equal(isValidSession('not-a-real-token'), false);
    assert.equal(isValidSession(''), false);
    assert.equal(isValidSession(undefined), false);
    assert.equal(isValidSession(null), false);
  });

  test('two sessions get different, unguessable-looking tokens', () => {
    const a = createSession();
    const b = createSession();
    assert.notEqual(a, b);
    assert.ok(a.length >= 32); // base64url of 32 random bytes
  });

  test('destroySession invalidates just that one token', () => {
    const a = createSession();
    const b = createSession();
    destroySession(a);
    assert.equal(isValidSession(a), false);
    assert.equal(isValidSession(b), true);
  });

  test('destroySession on an already-gone or made-up token is a harmless no-op', () => {
    assert.doesNotThrow(() => destroySession('never-existed'));
    assert.doesNotThrow(() => destroySession(undefined));
  });

  test('destroyAllOtherSessions clears every session except the one given', () => {
    const keep = createSession();
    const a = createSession();
    const b = createSession();
    destroyAllOtherSessions(keep);
    assert.equal(isValidSession(keep), true);
    assert.equal(isValidSession(a), false);
    assert.equal(isValidSession(b), false);
  });
});

describe('sessionTokenFrom (Cookie header parsing)', () => {
  const req = (cookie) => ({ headers: { cookie } });

  test('reads the session cookie out of a single-cookie header', () => {
    assert.equal(sessionTokenFrom(req(`${SESSION_COOKIE}=abc123`)), 'abc123');
  });

  test('finds it among several cookies, in any position', () => {
    assert.equal(sessionTokenFrom(req(`theme=dark; ${SESSION_COOKIE}=abc123; other=x`)), 'abc123');
    assert.equal(sessionTokenFrom(req(`${SESSION_COOKIE}=abc123; theme=dark`)), 'abc123');
  });

  test('decodes a URL-encoded value', () => {
    assert.equal(sessionTokenFrom(req(`${SESSION_COOKIE}=a%2Fb%3Dc`)), 'a/b=c');
  });

  test('no Cookie header at all, or none matching, is null (not a throw)', () => {
    assert.equal(sessionTokenFrom(req(undefined)), null);
    assert.equal(sessionTokenFrom(req('other=x; another=y')), null);
    assert.equal(sessionTokenFrom({ headers: {} }), null);
  });
});

describe('login rate limiting', () => {
  test('is not rate-limited before any failures', () => {
    assert.equal(isRateLimited('10.0.0.100'), false);
  });

  test('locks out after enough failures from the same address', () => {
    const ip = '10.0.0.101';
    for (let i = 0; i < 9; i++) recordFailedAttempt(ip);
    assert.equal(isRateLimited(ip), false); // just under the threshold
    recordFailedAttempt(ip);
    assert.equal(isRateLimited(ip), true); // now at it
  });

  test('a different address is unaffected by another address’s failures', () => {
    const ip = '10.0.0.102';
    for (let i = 0; i < 20; i++) recordFailedAttempt(ip);
    assert.equal(isRateLimited('10.0.0.103'), false);
  });

  test('resetAttempts clears the lockout, e.g. after a successful login', () => {
    const ip = '10.0.0.104';
    for (let i = 0; i < 15; i++) recordFailedAttempt(ip);
    assert.equal(isRateLimited(ip), true);
    resetAttempts(ip);
    assert.equal(isRateLimited(ip), false);
  });
});
