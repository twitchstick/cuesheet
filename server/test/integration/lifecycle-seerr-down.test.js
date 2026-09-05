/**
 * A dedicated process (like every other file here, `node --test` isolates
 * each file into its own process/module registry) so this gets a
 * completely cold cache -- proving the real bug, not one masked by
 * cache.js's own stale-on-error fallback rescuing a value some earlier
 * test already populated.
 *
 * Radarr/Sonarr are healthy; Seerr answers every request with a 500. Before
 * the fix, that took the *entire* /api/lifecycle computation down with it
 * (a bare, unguarded `await` on the Seerr fetch, ahead of the Radarr/Sonarr
 * queue read) -- Downloads would go blank even though nothing was actually
 * wrong with Radarr or Sonarr.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startUpstream } from './upstream.js';
import { radarrRoutes, sonarrRoutes } from './fixtures.js';

const brokenSeerrRoutes = {
  'GET /api/v1/request': { status: 503, body: { message: 'Seerr is restarting' } },
};

let dataDir;
let upstreams;
let server;
let base;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-lifecycle-seerr-down-'));
  upstreams = {
    radarr: await startUpstream(radarrRoutes),
    sonarr: await startUpstream(sonarrRoutes),
    seerr: await startUpstream(brokenSeerrRoutes),
  };

  process.env.DATA_DIR = dataDir;
  process.env.TZ = 'UTC';
  process.env.RADARR_URL = upstreams.radarr.url;
  process.env.RADARR_API_KEY = 'radarr-key';
  process.env.SONARR_URL = upstreams.sonarr.url;
  process.env.SONARR_API_KEY = 'sonarr-key';
  process.env.SEERR_URL = upstreams.seerr.url;
  process.env.SEERR_API_KEY = 'seerr-key';

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

describe('/api/lifecycle when Seerr is down but Radarr/Sonarr are not', () => {
  test('still returns 200 with the Radarr/Sonarr queue rows, not a 500', async () => {
    const { status, body } = await get('/api/lifecycle');
    assert.equal(status, 200);
    // None of these queue rows have a Seerr request to match (there are
    // none -- Seerr is down), so all three surface as orphans rather than
    // being dropped, exactly like Downloads needs.
    const titles = body.items.map((i) => i.title).sort();
    assert.deepEqual(titles, ['Ember & Ash', 'Redline', 'Second Sun']);
    assert.equal(body.items.every((i) => i.fromRequest === false), true);
  });

  test('reports the Seerr failure via errors.seerr instead of throwing', async () => {
    const { body } = await get('/api/lifecycle');
    assert.match(body.errors.seerr, /responded 503/);
  });
});
