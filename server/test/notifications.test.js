import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'cuesheet-notifications-'));
process.env.DATA_DIR = dataDir;

const store = await import('../notification-store.js');
const { runNotificationCheck } = await import('../notifications.js');

const baseConfig = () => ({
  radarr: { enabled: true },
  sonarr: { enabled: false },
  notifications: {
    enabled: true,
    pushoverAppToken: 'app-token',
    pushoverUserKey: 'user-key',
    failed: true,
    warning: true,
    stuck: true,
    recovered: true,
    health: false,
    stuckMinutes: 15,
    warningMinutes: 5,
    importMinutes: 10,
    outageMinutes: 5,
  },
});

const item = (patch = {}) => ({
  id: 'radarr-42',
  source: 'radarr',
  downloadId: 'job-42',
  title: 'Example Movie',
  subtitle: '2026',
  status: 'downloading',
  statusDetail: null,
  sizeBytes: 1_000,
  sizeLeftBytes: 500,
  ...patch,
});

beforeEach(() => store.resetForTest());
after(() => rmSync(dataDir, { recursive: true, force: true }));

describe('notification monitor', () => {
  test('opens one stuck incident after the threshold and closes it when progress resumes', async () => {
    let queue = [item()];
    const sent = [];
    const deps = {
      config: baseConfig(),
      adapters: { radarr: { queue: async () => queue } },
      sendPushover: async (message) => { sent.push(message); return { ok: true }; },
      snapshot: store.snapshot,
    };
    const start = Date.parse('2026-09-09T12:00:00Z');
    await runNotificationCheck(start, deps);
    assert.equal(store.snapshot().history.length, 0);

    await runNotificationCheck(start + 16 * 60_000, deps);
    await runNotificationCheck(start + 17 * 60_000, deps);
    assert.equal(store.snapshot().active.length, 1);
    assert.equal(store.snapshot().history.filter((event) => event.kind === 'stuck').length, 1, 'the same incident is not resent');

    queue = [item({ sizeLeftBytes: 400 })];
    await runNotificationCheck(start + 18 * 60_000, deps);
    assert.equal(store.snapshot().active.length, 0);
    assert.equal(store.snapshot().history[0].kind, 'recovered');
    assert.equal(sent.length, 2, 'one alert and one low-priority recovery are delivered');
  });

  test('paused and deliberately queued items never become stuck', async () => {
    let queue = [item({ status: 'paused' })];
    const deps = {
      config: baseConfig(),
      adapters: { radarr: { queue: async () => queue } },
      sendPushover: async () => ({ ok: true }),
      snapshot: store.snapshot,
    };
    const start = Date.parse('2026-09-09T12:00:00Z');
    await runNotificationCheck(start, deps);
    await runNotificationCheck(start + 24 * 60 * 60_000, deps);
    queue = [item({ status: 'queued' })];
    await runNotificationCheck(start + 48 * 60 * 60_000, deps);
    assert.equal(store.snapshot().history.length, 0);
  });

  test('a failed queue item alerts immediately', async () => {
    const sent = [];
    await runNotificationCheck(Date.now(), {
      config: baseConfig(),
      adapters: { radarr: { queue: async () => [item({ status: 'failed', statusDetail: 'Unpacking failed' })] } },
      sendPushover: async (message) => { sent.push(message); return { ok: true }; },
      snapshot: store.snapshot,
    });
    assert.equal(store.snapshot().active[0].kind, 'failed');
    assert.match(sent[0].message, /Unpacking failed/);
  });

  test('a temporary service outage does not falsely recover an active queue incident', async () => {
    let queueFails = false;
    const deps = {
      config: baseConfig(),
      adapters: { radarr: { queue: async () => {
        if (queueFails) throw new Error('Connection refused');
        return [item({ status: 'failed' })];
      } } },
      sendPushover: async () => ({ ok: true }),
      snapshot: store.snapshot,
    };

    await runNotificationCheck(Date.now(), deps);
    assert.equal(store.snapshot().active[0].kind, 'failed');

    queueFails = true;
    await runNotificationCheck(Date.now() + 60_000, deps);
    assert.equal(store.snapshot().active.length, 1);
    assert.equal(store.snapshot().history.filter((event) => event.kind === 'recovered').length, 0);
  });
});
