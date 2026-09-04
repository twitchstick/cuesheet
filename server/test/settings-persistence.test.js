/**
 * "Restart" behavior for server/config.js: what a fresh boot actually sees
 * in settings.json and the environment, across real process boundaries --
 * the one thing that can't be tested by importing config.js once and
 * calling its functions (its settings-file read + env defaults only ever
 * run once, at import time, in one process). Each `boot()`/`save()` call
 * here is a genuinely separate `node` process against a shared fixture
 * DATA_DIR, the same as a container restart.
 *
 * server/test/config-runtime.test.js covers everything that doesn't need a
 * process boundary: validation, secret-clearing, effectiveSecret's origin
 * check, and so on, all against one boot.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOT_PROBE = path.join(__dirname, 'support/boot-probe.mjs');
const SAVE_PROBE = path.join(__dirname, 'support/save-probe.mjs');

// Every SERVICE_URL/API_KEY var config.js reads -- explicitly cleared on
// every boot() call below unless a test opts a specific one back in, so
// stray variables from the host running the tests can never leak in and
// make a "nothing configured" assertion pass for the wrong reason.
const SERVICE_ENV_VARS = [
  'PLEX_URL', 'PLEX_TOKEN', 'JELLYFIN_URL', 'JELLYFIN_API_KEY', 'JELLYFIN_USER_ID',
  'RADARR_URL', 'RADARR_API_KEY', 'SONARR_URL', 'SONARR_API_KEY',
  'SEERR_URL', 'SEERR_API_KEY', 'SEERR_USER_ID', 'SABNZBD_URL', 'SABNZBD_API_KEY',
];

function boot(dataDir, extraEnv = {}, passwordCandidate) {
  const env = { ...process.env, DATA_DIR: dataDir };
  for (const v of SERVICE_ENV_VARS) delete env[v];
  Object.assign(env, extraEnv);
  const args = passwordCandidate === undefined ? [BOOT_PROBE] : [BOOT_PROBE, passwordCandidate];
  const out = execFileSync(process.execPath, args, { env, encoding: 'utf8' });
  return JSON.parse(out);
}

function save(dataDir, patch, extraEnv = {}) {
  const env = { ...process.env, DATA_DIR: dataDir };
  for (const v of SERVICE_ENV_VARS) delete env[v];
  Object.assign(env, extraEnv);
  execFileSync(process.execPath, [SAVE_PROBE, JSON.stringify(patch)], { env, encoding: 'utf8' });
}

let dataDir;
before(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-'));
});
after(() => rmSync(dataDir, { recursive: true, force: true }));

describe('a completely fresh boot (no settings.json, no env)', () => {
  test('needs setup, and no service is enabled', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-fresh-'));
    try {
      const { anyServiceConfigured, settings } = boot(fresh);
      assert.equal(anyServiceConfigured, false);
      assert.equal(settings.radarr.url, '');
      assert.equal(settings.radarr.apiKeySet, false);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('booting from environment variables alone', () => {
  test('an env-configured service is enabled with no settings.json at all', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-env-'));
    try {
      const { config, anyServiceConfigured } = boot(fresh, { RADARR_URL: 'http://10.0.0.5:7878', RADARR_API_KEY: 'env-key' });
      assert.equal(anyServiceConfigured, true);
      assert.equal(config.radarr.enabled, true);
      assert.equal(config.radarr.url, 'http://10.0.0.5:7878');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('Docker/Compose secrets (${KEY}_FILE)', () => {
  test('reads a credential from a mounted secret file instead of a plain env var', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-secretfile-'));
    try {
      const secretPath = path.join(fresh, 'radarr_api_key');
      writeFileSync(secretPath, 'from-the-secret-file\n'); // a trailing newline, same as `docker secret` files have
      const { config } = boot(fresh, { RADARR_URL: 'http://10.0.0.5:7878', RADARR_API_KEY_FILE: secretPath });
      assert.equal(config.radarr.apiKey, 'from-the-secret-file'); // trimmed
      assert.equal(config.radarr.enabled, true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('the secret file wins when both it and the plain env var are set', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-secretfile-both-'));
    try {
      const secretPath = path.join(fresh, 'radarr_api_key');
      writeFileSync(secretPath, 'file-value');
      const { config } = boot(fresh, { RADARR_URL: 'http://10.0.0.5:7878', RADARR_API_KEY: 'plain-value', RADARR_API_KEY_FILE: secretPath });
      assert.equal(config.radarr.apiKey, 'file-value');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('a _FILE pointing at a missing file falls back to the plain env var, not a crash', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-secretfile-missing-'));
    try {
      const { config } = boot(fresh, {
        RADARR_URL: 'http://10.0.0.5:7878',
        RADARR_API_KEY: 'fallback-value',
        RADARR_API_KEY_FILE: path.join(fresh, 'does-not-exist'),
      });
      assert.equal(config.radarr.apiKey, 'fallback-value');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('a _FILE pointing at a missing file with no fallback var leaves the service unconfigured, not crashed', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-secretfile-missing-none-'));
    try {
      const { config, anyServiceConfigured } = boot(fresh, {
        RADARR_URL: 'http://10.0.0.5:7878',
        RADARR_API_KEY_FILE: path.join(fresh, 'does-not-exist'),
      });
      assert.equal(config.radarr.apiKey, '');
      assert.equal(config.radarr.enabled, false); // url alone isn't enough
      assert.equal(anyServiceConfigured, false);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('a hand-edited (never-validated) settings.json', () => {
  test('an out-of-range recentLimit is clamped at boot instead of crashing or being trusted as-is', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-clamp-'));
    try {
      writeFileSync(path.join(fresh, 'settings.json'), JSON.stringify({ version: 1, general: { recentLimit: 9999 } }));
      const { settings } = boot(fresh);
      assert.equal(settings.general.recentLimit, 40); // RECENT_LIMIT_RANGE's upper bound
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('a malformed settings.json', () => {
  test('boots clean instead of crashing -- falls back to env defaults', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-bad-'));
    try {
      writeFileSync(path.join(fresh, 'settings.json'), '{not valid json');
      const { anyServiceConfigured, settings } = boot(fresh);
      assert.equal(anyServiceConfigured, false);
      assert.equal(settings.radarr.url, '');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('settings saved through the wizard survive a restart', () => {
  test('a value saved via saveSettings() is still there on the next boot, with no env vars at all', () => {
    save(dataDir, { sonarr: { url: 'http://10.0.0.5:8989', apiKey: 'sonarr-secret' } });
    const { config, anyServiceConfigured } = boot(dataDir); // fresh process, nothing set via env
    assert.equal(anyServiceConfigured, true);
    assert.equal(config.sonarr.enabled, true);
    assert.equal(config.sonarr.url, 'http://10.0.0.5:8989');
  });

  test('a service that was only ever set via env, never saved, does not survive when the env var is gone', () => {
    // The first fresh-boot test above proved Radarr-via-env works while the
    // var is present; this is its other half -- that config isn't somehow
    // remembered once the var is taken away, only what was actually saved is.
    const { config } = boot(dataDir); // same dataDir as above -- sonarr was saved, radarr never was
    assert.equal(config.radarr.enabled, false);
    assert.equal(config.sonarr.enabled, true); // still there
  });

  test('a saved value wins over an env var for the same field, field by field', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-precedence-'));
    try {
      // First boot: env-configured only.
      let { config } = boot(fresh, { RADARR_URL: 'http://env-radarr:7878', RADARR_API_KEY: 'env-key' });
      assert.equal(config.radarr.url, 'http://env-radarr:7878');

      // The wizard saves a different URL for the same service.
      save(fresh, { radarr: { url: 'http://saved-radarr:7878' } }, { RADARR_URL: 'http://env-radarr:7878', RADARR_API_KEY: 'env-key' });

      // Reboot with the *same* env var still set -- the saved value must win.
      ({ config } = boot(fresh, { RADARR_URL: 'http://env-radarr:7878', RADARR_API_KEY: 'env-key' }));
      assert.equal(config.radarr.url, 'http://saved-radarr:7878');
      // The env-provided secret is untouched -- saveSettings() above never mentioned apiKey.
      assert.equal(config.radarr.apiKey, 'env-key');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('quick links persist across a restart', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-links-'));
    try {
      save(fresh, { links: [{ label: 'NAS', url: 'http://10.0.0.5:1234', icon: 'server' }] });
      const { config } = boot(fresh);
      assert.equal(config.links.length, 1);
      assert.equal(config.links[0].label, 'NAS');
      assert.ok(config.links[0].id, 'a link gets an id even when the caller did not supply one');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('a malformed link left in settings.json is dropped at boot, not the whole file', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-badlink-'));
    try {
      save(fresh, { links: [{ label: 'Good link', url: 'http://10.0.0.5:1234' }] });
      // Hand-corrupt just the links array, as if written by an older/buggier version.
      const file = path.join(fresh, 'settings.json');
      const data = JSON.parse(readFileSync(file, 'utf8'));
      data.links.push({ label: 'Missing its url' }); // malformed -- loadLink() should drop only this one
      writeFileSync(file, JSON.stringify(data));

      const { config } = boot(fresh);
      assert.equal(config.links.length, 1);
      assert.equal(config.links[0].label, 'Good link');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('the admin password across a restart', () => {
  test('a password saved through the app is still there on the next boot', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-password-'));
    try {
      save(fresh, { adminPassword: 'saved-across-restart-1' });
      const { config, verifies } = boot(fresh, {}, 'saved-across-restart-1');
      assert.equal(config.auth.enabled, true);
      assert.equal(config.auth.managedByEnv, false);
      assert.equal(verifies, true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('ADMIN_PASSWORD overrides a saved password -- the deliberate forgot-password recovery path', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-password-override-'));
    try {
      save(fresh, { adminPassword: 'the-old-saved-password' });
      const { config, verifies } = boot(fresh, { ADMIN_PASSWORD: 'reset-via-env' }, 'reset-via-env');
      assert.equal(config.auth.managedByEnv, true);
      assert.equal(verifies, true);
      // And the old saved one no longer works while the env var is set.
      const { verifies: oldStillWorks } = boot(fresh, { ADMIN_PASSWORD: 'reset-via-env' }, 'the-old-saved-password');
      assert.equal(oldStillWorks, false);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('ADMIN_PASSWORD also accepts the _FILE secrets convention', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-password-file-'));
    try {
      const secretPath = path.join(fresh, 'admin_password');
      writeFileSync(secretPath, 'from-a-docker-secret\n');
      const { config, verifies } = boot(fresh, { ADMIN_PASSWORD_FILE: secretPath }, 'from-a-docker-secret');
      assert.equal(config.auth.enabled, true);
      assert.equal(config.auth.managedByEnv, true);
      assert.equal(verifies, true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test('clearing the saved password (with no env var) turns the gate back off after a restart', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'cuesheet-boot-password-cleared-'));
    try {
      save(fresh, { adminPassword: 'will-be-cleared' });
      save(fresh, { adminPassword: '' });
      const { config } = boot(fresh);
      assert.equal(config.auth.enabled, false);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
