/**
 * `?fresh=1`'s cache-bypass on /api/lifecycle/history, proven the same way
 * every other integration test here is: a real Express app against a real
 * (fake) upstream over an actual socket. Its own dedicated upstream/app
 * instance, not the shared fixtures.js/api.test.js one -- this needs
 * Radarr's history route to answer *differently* across calls, and mutating
 * the shared fixture that way would also change what every other test
 * (including the e2e suite's shared fixture server) sees from that same
 * canned route.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startUpstream } from './upstream.js';

let dataDir;
let upstreams;
let server;
let base;
let historyCalls = 0;

const radarrRoutes = {
  'GET /api/v3/movie': { body: [{ id: 1, titleSlug: 'the-title', monitored: true, hasFile: false }] },
  'GET /api/v3/history/movie': () => {
    historyCalls += 1;
    return { body: [{ id: historyCalls, eventType: 'grabbed', date: '2024-01-01T00:00:00Z', sourceTitle: `v${historyCalls}` }] };
  },
};

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-history-fresh-'));
  upstreams = { radarr: await startUpstream(radarrRoutes) };

  process.env.DATA_DIR = dataDir;
  process.env.TZ = 'UTC';
  process.env.RADARR_URL = upstreams.radarr.url;
  process.env.RADARR_API_KEY = 'radarr-key';

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
  await Promise.all(Object.values(upstreams).map((u) => u.close()));
  rmSync(dataDir, { recursive: true, force: true });
});

const get = async (p) => {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, body: await res.json() };
};

describe('/api/lifecycle/history?fresh=1', () => {
  test('an ordinary repeat request serves the cached snapshot, not a live refetch', async () => {
    const first = await get('/api/lifecycle/history?mediaType=movie&tmdbId=1');
    assert.equal(first.body.items[0].release, 'v1');
    assert.equal(historyCalls, 1);

    const second = await get('/api/lifecycle/history?mediaType=movie&tmdbId=1');
    assert.equal(second.body.items[0].release, 'v1', 'still the cached snapshot -- five minutes have not passed');
    assert.equal(historyCalls, 1, 'no second upstream call for an ordinary repeat request');
  });

  test('fresh=1 skips the cache and gets a live snapshot', async () => {
    const fresh = await get('/api/lifecycle/history?mediaType=movie&tmdbId=1&fresh=1');
    assert.equal(fresh.body.items[0].release, 'v2', 'a real second upstream call, not the stale v1 snapshot');
    assert.equal(historyCalls, 2);

    // And it re-caches the fresh result -- the next ordinary request doesn't
    // pay for yet another live call.
    const after = await get('/api/lifecycle/history?mediaType=movie&tmdbId=1');
    assert.equal(after.body.items[0].release, 'v2');
    assert.equal(historyCalls, 2);
  });
});
