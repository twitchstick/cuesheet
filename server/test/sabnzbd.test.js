import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as sabnzbd from '../services/sabnzbd.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'http://10.0.0.5:8080', apiKey: 'sabkey' };
afterEach(restoreFetch);

describe('stats', () => {
  test('converts kilobytes/sec to kilobits/sec (the rest of the app works in kbps)', async () => {
    mockFetch(jsonRes({ queue: { kbpersec: '2150.40', paused: false, diskspace1: '182.30' } }));
    const s = await sabnzbd.stats(cfg);
    assert.equal(s.speedKbps, Math.round(2150.4 * 8));
    assert.equal(s.diskFreeGb, 182.3);
    assert.equal(s.paused, false);
  });

  test('a bad key comes back as 200 OK with an error body, not an HTTP error -- must not read as idle', async () => {
    mockFetch(jsonRes({ status: false, error: 'API Key Incorrect' }));
    await assert.rejects(() => sabnzbd.stats(cfg), /API Key Incorrect/);
  });

  test('zero speed is null, not 0 read as "meaningful"', async () => {
    mockFetch(jsonRes({ queue: { kbpersec: '0', paused: true, diskspace1: '0' } }));
    const s = await sabnzbd.stats(cfg);
    assert.equal(s.speedKbps, null);
    assert.equal(s.diskFreeGb, null);
    assert.equal(s.paused, true);
  });

  test('a missing queue object does not throw', async () => {
    mockFetch(jsonRes({}));
    const s = await sabnzbd.stats(cfg);
    assert.deepEqual(s, { speedKbps: null, paused: false, diskFreeGb: null });
  });
});
