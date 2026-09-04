/**
 * The whole-app gate over real HTTP, with ADMIN_PASSWORD set for this
 * process (so config.auth.managedByEnv is true throughout this file --
 * see auth-password-change.test.js for the saved/in-app-managed password
 * instead, which needs its own process since config.js only ever reads its
 * environment once, at import time).
 *
 * server/test/integration/api.test.js deliberately never sets
 * ADMIN_PASSWORD, so the dashboard-route tests there prove the gate stays
 * fully open by default; this file is the other half.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PASSWORD = 'integration-test-password-1';

let dataDir;
let server;
let base;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-auth-integration-'));
  process.env.DATA_DIR = dataDir;
  process.env.ADMIN_PASSWORD = PASSWORD;

  const { app } = await import('../../index.js');
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
});

// Just the name=value pair off a Set-Cookie header (dropping Path/HttpOnly/
// etc.), the way a browser resends it on the next request.
const cookieValue = (setCookieHeader) => setCookieHeader?.split(';')[0];

async function get(p, cookie) {
  const res = await fetch(`${base}${p}`, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, body: await res.json() };
}
async function send(method, p, data, cookie) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json(), setCookie: res.headers.get('set-cookie') };
}
const post = (p, data, cookie) => send('POST', p, data, cookie);
const put = (p, data, cookie) => send('PUT', p, data, cookie);

describe('every non-bootstrap route requires a session', () => {
  test('dashboard, settings and write routes are all refused without one', async () => {
    for (const p of ['/api/streams', '/api/recent', '/api/queue', '/api/requests', '/api/lifecycle', '/api/calendar', '/api/links', '/api/settings']) {
      const { status } = await get(p);
      assert.equal(status, 401, `expected 401 for ${p}`);
    }
  });

  test('the bootstrap routes stay open: config, setup/status, health, auth/status', async () => {
    for (const p of ['/api/config', '/api/setup/status', '/api/health', '/api/auth/status']) {
      const { status } = await get(p);
      assert.notEqual(status, 401, `expected ${p} to stay open`);
    }
  });

  test('an unknown route is refused the same as a real one -- a locked-out caller learns nothing about what exists', async () => {
    const { status } = await get('/api/does-not-exist');
    assert.equal(status, 401);
  });

  test('once logged in, an unknown route goes back to a plain 404', async () => {
    const login = await post('/api/auth/login', { password: PASSWORD });
    const cookie = cookieValue(login.setCookie);
    const { status, body } = await get('/api/does-not-exist', cookie);
    assert.equal(status, 404);
    assert.equal(body.error, 'Not found');
  });
});

describe('logging in', () => {
  test('/api/auth/status reports the gate is on and this client isn’t logged in yet', async () => {
    const { body } = await get('/api/auth/status');
    assert.equal(body.enabled, true);
    assert.equal(body.managedByEnv, true);
    assert.equal(body.authenticated, false);
  });

  test('a wrong password is refused and issues no session cookie', async () => {
    const { status, body, setCookie } = await post('/api/auth/login', { password: 'nope' });
    assert.equal(status, 401);
    assert.match(body.error, /incorrect/i);
    assert.equal(setCookie, null);
  });

  test('the correct password logs in, and the cookie it sets unlocks every route', async () => {
    const login = await post('/api/auth/login', { password: PASSWORD });
    assert.equal(login.status, 200);
    assert.ok(login.setCookie);
    const cookie = cookieValue(login.setCookie);

    assert.equal((await get('/api/auth/status', cookie)).body.authenticated, true);
    assert.equal((await get('/api/streams', cookie)).status, 200);
    assert.equal((await get('/api/settings', cookie)).status, 200);
  });

  test('the session cookie is HttpOnly and SameSite=Strict', async () => {
    const { setCookie } = await post('/api/auth/login', { password: PASSWORD });
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
  });
});

describe('logging out', () => {
  test('invalidates the session -- the same cookie stops working', async () => {
    const login = await post('/api/auth/login', { password: PASSWORD });
    const cookie = cookieValue(login.setCookie);
    assert.equal((await get('/api/streams', cookie)).status, 200);

    const out = await post('/api/auth/logout', {}, cookie);
    assert.equal(out.status, 200);
    assert.equal((await get('/api/streams', cookie)).status, 401);
  });

  test('logging out with no session at all is a harmless success, not an error', async () => {
    const { status, body } = await post('/api/auth/logout', {});
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });
});

describe('changing the password while ADMIN_PASSWORD is set', () => {
  test('is refused, since the env var would just override it anyway', async () => {
    const login = await post('/api/auth/login', { password: PASSWORD });
    const cookie = cookieValue(login.setCookie);
    const { status, body } = await put('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'whatever-new-1' }, cookie);
    assert.equal(status, 400);
    assert.match(body.error, /ADMIN_PASSWORD/);
  });
});

describe('brute-force throttling on /api/auth/login', () => {
  test('enough wrong passwords in a row eventually get rate-limited', async () => {
    let lastStatus;
    for (let i = 0; i < 15; i++) {
      lastStatus = (await post('/api/auth/login', { password: `still-wrong-${i}` })).status;
      if (lastStatus === 429) break;
    }
    assert.equal(lastStatus, 429);
  });
});
