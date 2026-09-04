/**
 * The saved (in-app-managed) password over real HTTP -- no ADMIN_PASSWORD
 * here, so config.auth.managedByEnv stays false throughout, unlike
 * auth.test.js. Exercises exactly the flow the Settings UI drives: setting
 * the first password, changing it, and clearing it, each through the real
 * PUT /api/auth/password route against a real running app.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dataDir;
let server;
let base;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-auth-change-integration-'));
  process.env.DATA_DIR = dataDir;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD_FILE;

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

const cookieValue = (setCookieHeader) => setCookieHeader?.split(';')[0];

async function get(p, cookie) {
  const res = await fetch(`${base}${p}`, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, body: await res.json() };
}
async function put(p, data, cookie) {
  const res = await fetch(`${base}${p}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json(), setCookie: res.headers.get('set-cookie') };
}

let sessionCookie; // carried between tests below, in the order they run -- mirrors one continuous admin session

test('the gate starts off -- dashboard routes are open, nothing to log into', async () => {
  const status = await get('/api/auth/status');
  assert.equal(status.body.enabled, false);
  assert.equal((await get('/api/streams')).status, 200);
});

test('setting the first password requires no current password, and logs the setter in', async () => {
  const result = await put('/api/auth/password', { newPassword: 'first-admin-password-1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, true);
  assert.ok(result.setCookie, 'expected a session to be issued immediately -- otherwise the person who just locked the app is locked out of it too');
  sessionCookie = cookieValue(result.setCookie);

  // The gate is genuinely on now, for anyone without that cookie.
  assert.equal((await get('/api/streams')).status, 401);
  // But the session that just set it works right away.
  assert.equal((await get('/api/streams', sessionCookie)).status, 200);
});

test('changing the password without the current one is refused', async () => {
  const result = await put('/api/auth/password', { newPassword: 'second-admin-password-1' }, sessionCookie);
  assert.equal(result.status, 401);
  assert.match(result.body.error, /current password/i);
});

test('changing the password with the correct current one succeeds and keeps this session logged in', async () => {
  const result = await put('/api/auth/password', { currentPassword: 'first-admin-password-1', newPassword: 'second-admin-password-1' }, sessionCookie);
  assert.equal(result.status, 200);
  assert.equal((await get('/api/streams', sessionCookie)).status, 200);
});

test('the old password no longer works, only the new one does', async () => {
  const oldPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'first-admin-password-1' }),
  });
  assert.equal(oldPassword.status, 401);

  const newPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'second-admin-password-1' }),
  });
  assert.equal(newPassword.status, 200);
});

test('a too-short replacement password is rejected, and the old one still works', async () => {
  const result = await put('/api/auth/password', { currentPassword: 'second-admin-password-1', newPassword: 'short' }, sessionCookie);
  assert.equal(result.status, 400);
  assert.equal((await get('/api/streams', sessionCookie)).status, 200); // this session is unaffected by the rejected change
});

test('clearing the password (an empty newPassword) turns the gate back off', async () => {
  const result = await put('/api/auth/password', { currentPassword: 'second-admin-password-1', newPassword: '' }, sessionCookie);
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, false);

  // Now open to everyone again, cookie or not.
  assert.equal((await get('/api/streams')).status, 200);
  assert.equal((await get('/api/auth/status')).body.enabled, false);
});
