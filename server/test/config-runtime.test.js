/**
 * Everything about server/config.js that doesn't need a fresh process to
 * exercise -- validation, secret-clearing semantics, the effectiveSecret
 * origin check -- against a single boot with a fixture DATA_DIR. What
 * config.js only does once, at import time (reading settings.json, reading
 * env defaults), and how that behaves across a real restart, is instead
 * server/test/settings-persistence.test.js, which uses a real subprocess
 * per boot since that's the only way to actually re-trigger it.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SERVICE_ENV_VARS = [
  'PLEX_URL', 'PLEX_TOKEN', 'JELLYFIN_URL', 'JELLYFIN_API_KEY', 'JELLYFIN_USER_ID',
  'RADARR_URL', 'RADARR_API_KEY', 'SONARR_URL', 'SONARR_API_KEY',
  'SEERR_URL', 'SEERR_API_KEY', 'SEERR_USER_ID', 'SABNZBD_URL', 'SABNZBD_API_KEY',
];

let dataDir;
let cfg;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-config-runtime-'));
  process.env.DATA_DIR = dataDir;
  for (const v of SERVICE_ENV_VARS) delete process.env[v];
  cfg = await import('../config.js');
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe('a fresh boot with nothing configured', () => {
  test('nothing is enabled and every url/secret is blank', () => {
    assert.equal(cfg.anyServiceConfigured(), false);
    const s = cfg.getSettings();
    for (const service of cfg.SERVICES) {
      assert.equal(s[service].url, '');
      assert.equal(s[service][`${cfg.SECRET_FIELD[service]}Set`], false);
    }
  });
});

describe('saveSettings()', () => {
  test('validates and persists a new service, enabling it immediately', () => {
    const result = cfg.saveSettings({ radarr: { url: 'http://10.0.0.5:7878', apiKey: 'key123' } });
    assert.equal(result.radarr.url, 'http://10.0.0.5:7878');
    assert.equal(result.radarr.apiKeySet, true);
    assert.equal(cfg.config.radarr.enabled, true);

    // And it's actually on disk, not just in memory.
    const onDisk = JSON.parse(readFileSync(cfg.SETTINGS_FILE, 'utf8'));
    assert.equal(onDisk.radarr.url, 'http://10.0.0.5:7878');
    assert.equal(onDisk.radarr.apiKey, 'key123');
  });

  test('omitting a secret field on a later save keeps the one already stored', () => {
    cfg.saveSettings({ radarr: { url: 'http://10.0.0.5:7878' } }); // no apiKey key at all
    assert.equal(cfg.getSettings().radarr.apiKeySet, true);
    assert.equal(cfg.config.radarr.enabled, true);
  });

  test('an explicit empty string clears the stored secret, and disables the service', () => {
    cfg.saveSettings({ radarr: { apiKey: '' } });
    assert.equal(cfg.getSettings().radarr.apiKeySet, false);
    assert.equal(cfg.config.radarr.enabled, false); // url is set but the key isn't -- not enabled
  });

  test('a malformed URL is a SettingsError (400), not an unhandled crash', () => {
    assert.throws(
      () => cfg.saveSettings({ sonarr: { url: 'not a url', apiKey: 'x' } }),
      (err) => err instanceof cfg.SettingsError && err.status === 400,
    );
  });

  test('a link-local URL is refused the same way the connection tester refuses it', () => {
    assert.throws(
      () => cfg.saveSettings({ sonarr: { url: 'http://169.254.169.254', apiKey: 'x' } }),
      (err) => err instanceof cfg.SettingsError && /link-local/i.test(err.message),
    );
  });

  test('an in-range recentLimit is accepted and rounded', () => {
    assert.equal(cfg.saveSettings({ general: { recentLimit: 12.4 } }).general.recentLimit, 12);
  });

  // Unlike a malformed URL (silently the caller's problem to fix), an
  // out-of-range recentLimit here is *rejected*, not clamped -- clamping
  // only happens on the read side (clampRecentLimit(), inside rebuild()),
  // as a defense for a value that reached settings.json/the environment
  // some other way (a hand-edited file, a stale env var) and was never run
  // through this validation at all. Covered from a fresh boot in
  // settings-persistence.test.js.
  test('an out-of-range recentLimit is rejected outright, not silently clamped', () => {
    assert.throws(() => cfg.saveSettings({ general: { recentLimit: 999 } }), cfg.SettingsError);
    assert.throws(() => cfg.saveSettings({ general: { recentLimit: 1 } }), cfg.SettingsError);
    assert.throws(() => cfg.saveSettings({ general: { recentLimit: 'banana' } }), cfg.SettingsError);
  });
});

describe('saveLinks()', () => {
  test('persists a valid list and assigns each link an id', () => {
    const items = cfg.saveLinks([{ label: 'NAS', url: 'http://10.0.0.5:1234' }]);
    assert.equal(items.length, 1);
    assert.ok(items[0].id);
    assert.equal(cfg.config.links.length, 1);
  });

  test('rejects duplicate ids in the same batch', () => {
    assert.throws(
      () => cfg.saveLinks([{ id: 'dup', label: 'A', url: 'http://10.0.0.5:1' }, { id: 'dup', label: 'B', url: 'http://10.0.0.5:2' }]),
      cfg.SettingsError,
    );
  });

  test('rejects more than the documented maximum', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, url: `http://10.0.0.5:${1000 + i}` }));
    assert.throws(() => cfg.saveLinks(many), cfg.SettingsError);
  });
});

describe('effectiveSecret() -- the connection-test credential resolver', () => {
  before(() => {
    cfg.saveSettings({ jellyfin: { url: 'http://10.0.0.9:8096', apiKey: 'stored-jf-key' } });
  });

  test('a typed credential always wins, regardless of the target URL', () => {
    assert.equal(cfg.effectiveSecret('jellyfin', 'typed-key', 'http://anywhere:8096'), 'typed-key');
  });

  test('the stored credential is only handed back when the target is the same server it belongs to', () => {
    assert.equal(cfg.effectiveSecret('jellyfin', '', 'http://10.0.0.9:8096'), 'stored-jf-key');
  });

  test('a different host never gets the stored credential, even for the same service', () => {
    assert.equal(cfg.effectiveSecret('jellyfin', '', 'http://attacker.example:8096'), '');
  });
});

describe('the admin password (server/auth.js handles sessions; this is just the credential)', () => {
  test('nothing is configured yet -- verifyAdminPassword is always false, never throws', () => {
    assert.equal(cfg.config.auth.enabled, false);
    assert.equal(cfg.verifyAdminPassword('anything'), false);
    assert.equal(cfg.verifyAdminPassword(''), false);
    assert.equal(cfg.verifyAdminPassword(undefined), false);
  });

  test('setAdminPassword enables the gate and the exact password verifies', () => {
    cfg.setAdminPassword('correct-horse-battery');
    assert.equal(cfg.config.auth.enabled, true);
    assert.equal(cfg.config.auth.managedByEnv, false);
    assert.equal(cfg.verifyAdminPassword('correct-horse-battery'), true);
  });

  test('a wrong password does not verify', () => {
    assert.equal(cfg.verifyAdminPassword('wrong-guess'), false);
  });

  test('the password is never written to settings.json in plain text', () => {
    const onDisk = readFileSync(cfg.SETTINGS_FILE, 'utf8');
    assert.equal(onDisk.includes('correct-horse-battery'), false);
    assert.ok(onDisk.includes('passwordHash'));
  });

  test('setAdminPassword replaces the previous password entirely', () => {
    cfg.setAdminPassword('a-brand-new-password');
    assert.equal(cfg.verifyAdminPassword('correct-horse-battery'), false);
    assert.equal(cfg.verifyAdminPassword('a-brand-new-password'), true);
  });

  test('rejects a password shorter than the minimum', () => {
    assert.throws(() => cfg.setAdminPassword('short'), cfg.SettingsError);
    // The old one is still the one that verifies -- a rejected change doesn't half-apply.
    assert.equal(cfg.verifyAdminPassword('a-brand-new-password'), true);
  });

  test('clearAdminPassword turns the gate back off', () => {
    cfg.clearAdminPassword();
    assert.equal(cfg.config.auth.enabled, false);
    assert.equal(cfg.verifyAdminPassword('a-brand-new-password'), false);
  });
});
