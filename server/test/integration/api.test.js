/**
 * End-to-end integration tests: a real Express app (the actual server/index.js,
 * unmodified) listening on a real loopback socket, talking to six real fake
 * upstream HTTP servers (server/test/integration/upstream.js + fixtures.js)
 * instead of mocked fetch calls. Where the *.test.js files next door prove
 * each function's own logic in isolation, this proves the wiring between
 * them: routing, config loading from the environment, caching, and the
 * Radarr/Sonarr <-> Seerr correlation in server/lifecycle.js, all through
 * one HTTP round trip per assertion, the same way a browser would see it.
 *
 * DATA_DIR and every SERVICE_URL must be set *before* server/config.js is
 * first imported (it does real work -- reading settings.json, building
 * `config` -- as an import-time side effect), so this file sets them in
 * `before()` and only then dynamically imports server/index.js.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startUpstream } from './upstream.js';
import { plexRoutes, jellyfinRoutes, radarrRoutes, sonarrRoutes, seerrRoutes, sabnzbdRoutes } from './fixtures.js';

let dataDir;
let upstreams;
let server;
let base;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-integration-'));
  upstreams = {
    plex: await startUpstream(plexRoutes),
    jellyfin: await startUpstream(jellyfinRoutes),
    radarr: await startUpstream(radarrRoutes),
    sonarr: await startUpstream(sonarrRoutes),
    seerr: await startUpstream(seerrRoutes),
    sabnzbd: await startUpstream(sabnzbdRoutes),
  };

  process.env.DATA_DIR = dataDir;
  process.env.TZ = 'UTC'; // so the calendar test's date math doesn't depend on the host's zone
  process.env.SERVER_NAME = 'Integration Apollo';
  process.env.PLEX_URL = upstreams.plex.url;
  process.env.PLEX_TOKEN = 'plex-tok';
  process.env.JELLYFIN_URL = upstreams.jellyfin.url;
  process.env.JELLYFIN_API_KEY = 'jf-key';
  process.env.RADARR_URL = upstreams.radarr.url;
  process.env.RADARR_API_KEY = 'radarr-key';
  process.env.SONARR_URL = upstreams.sonarr.url;
  process.env.SONARR_API_KEY = 'sonarr-key';
  process.env.SEERR_URL = upstreams.seerr.url;
  process.env.SEERR_API_KEY = 'seerr-key';
  process.env.SABNZBD_URL = upstreams.sabnzbd.url;
  process.env.SABNZBD_API_KEY = 'sab-key';

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
  return { status: res.status, headers: res.headers, body: await res.json() };
};

/** A raw PUT with an arbitrary Origin header -- Node's fetch won't let a
 * caller set Origin, so this goes through http.request directly, the same
 * as a browser sending a real cross-site request would. */
const putWithOrigin = (p, origin, data) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${base}${p}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...(origin ? { Origin: origin } : {}) } },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });

describe('basic wiring', () => {
  test('GET /api/health', async () => {
    const { status, body } = await get('/api/health');
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });
  });

  test('GET /api/config reflects env-configured services and server name', async () => {
    const { body } = await get('/api/config');
    assert.equal(body.title, 'Cuesheet');
    assert.equal(body.serverName, 'Integration Apollo');
    assert.deepEqual(body.services, { plex: true, jellyfin: true, radarr: true, sonarr: true, seerr: true, sabnzbd: true });
    assert.equal(body.seerrUrl, upstreams.seerr.url);
  });

  test('GET /api/setup/status says setup is already done once services are configured', async () => {
    const { body } = await get('/api/setup/status');
    assert.equal(body.needsSetup, false);
  });

  test('GET /api/settings never echoes a secret, only whether one is set', async () => {
    const { body } = await get('/api/settings');
    assert.equal(body.plex.url, upstreams.plex.url);
    assert.equal(body.plex.tokenSet, true);
    assert.equal(JSON.stringify(body).includes('plex-tok'), false);
  });

  test('security headers are set on every response', async () => {
    const { headers } = await get('/api/health');
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
  });

  test('an unknown API route is a plain 404, not the SPA fallback', async () => {
    const { status, body } = await get('/api/does-not-exist');
    assert.equal(status, 404);
    assert.equal(body.error, 'Not found');
  });
});

describe('cross-site write protection', () => {
  test('a PUT from a foreign Origin is rejected', async () => {
    const { status, body } = await putWithOrigin('/api/settings', 'http://evil.example', { general: { serverName: 'Hijacked' } });
    assert.equal(status, 403);
    assert.match(body.error, /cross-site/i);
    // And it must not have taken effect.
    const { body: settings } = await get('/api/settings');
    assert.notEqual(settings.general.serverName, 'Hijacked');
  });

  test('a PUT with no Origin header at all (curl, a script) is allowed through to validation', async () => {
    const { status } = await putWithOrigin('/api/settings', null, { general: { serverName: 'Integration Apollo' } });
    assert.notEqual(status, 403);
  });
});

describe('/api/streams and /api/recent (Plex + Jellyfin)', () => {
  test('a Plex session comes back through the real proxy route', async () => {
    const { body } = await get('/api/streams');
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].title, 'Nova');
    assert.equal(body.items[0].source, 'plex');
  });

  test('Plex and Jellyfin recently-added items are merged and sorted newest first', async () => {
    const { body } = await get('/api/recent');
    assert.deepEqual(body.items.map((i) => i.title), ['Lumen', 'Solstice']);
    assert.equal(body.items[0].source, 'jellyfin');
    assert.equal(body.items[1].source, 'plex');
  });
});

describe('/api/queue (Radarr + Sonarr + SABnzbd)', () => {
  test('merges both services’ queues and the download client stats', async () => {
    const { body } = await get('/api/queue');
    assert.equal(body.items.length, 3);
    const ids = body.items.map((i) => i.id).sort();
    assert.deepEqual(ids, ['radarr-10', 'radarr-77', 'sonarr-200']);
    assert.deepEqual(body.client, { speedKbps: 4000, paused: false, diskFreeGb: 100 });
  });
});

describe('/api/lifecycle (Seerr requests correlated with Radarr/Sonarr queues)', () => {
  test('a movie request is matched to its Radarr queue row', async () => {
    const { body } = await get('/api/lifecycle');
    const movie = body.items.find((i) => i.title === 'Ember & Ash');
    assert.ok(movie, 'expected the Ember & Ash request in the lifecycle');
    assert.equal(movie.stage, 'downloading');
    assert.equal(movie.queueId, 'radarr-10');
    assert.equal(movie.fromRequest, true);
  });

  test('a tv request is matched via tvdbId, not tmdbId, to its Sonarr queue row', async () => {
    const { body } = await get('/api/lifecycle');
    const tv = body.items.find((i) => i.title === 'Second Sun');
    assert.ok(tv, 'expected the Second Sun request in the lifecycle');
    assert.equal(tv.stage, 'downloading');
    assert.equal(tv.queueId, 'sonarr-200');
  });

  test('an unclaimed Radarr queue row surfaces as an orphan, not dropped', async () => {
    const { body } = await get('/api/lifecycle');
    const orphan = body.items.find((i) => i.title === 'Redline');
    assert.ok(orphan, 'expected the orphaned Redline queue row');
    assert.equal(orphan.fromRequest, false);
    assert.equal(orphan.id, 'queue-radarr-77');
  });
});

describe('/api/lifecycle/history (on-demand, behind a click)', () => {
  test('a movie resolves its Radarr history via tmdbId, newest first', async () => {
    const { body } = await get('/api/lifecycle/history?mediaType=movie&tmdbId=10');
    assert.equal(body.items.length, 3);
    assert.deepEqual(body.items.map((e) => e.type), ['grabbed', 'failed', 'grabbed'], 'the re-grab is the most recent event, so it comes first');
  });

  test('a series resolves its Sonarr history via tvdbId', async () => {
    const { body } = await get('/api/lifecycle/history?mediaType=tv&tvdbId=99');
    assert.equal(body.items.length, 3);
    assert.equal(body.items[0].release, 'Second.Sun.S01E04.1080p-GROUP2');
  });

  test('rejects a request with no usable mediaType', async () => {
    const { status } = await get('/api/lifecycle/history?tmdbId=10');
    assert.equal(status, 400);
  });

  test('rejects a movie request with no tmdbId', async () => {
    const { status } = await get('/api/lifecycle/history?mediaType=movie');
    assert.equal(status, 400);
  });
});

describe('/api/requests (Seerr only)', () => {
  test('lists recent requests with poster/title resolved from Seerr’s detail endpoint', async () => {
    const { body } = await get('/api/requests');
    assert.equal(body.items.length, 2);
    const titles = body.items.map((i) => i.title).sort();
    assert.deepEqual(titles, ['Ember & Ash', 'Second Sun']);
  });
});

describe('/api/calendar (Radarr + Sonarr, date-filtered and merged)', () => {
  test('returns both services’ entries in range, sorted by date', async () => {
    const { body } = await get('/api/calendar?start=2024-01-01&end=2024-01-07');
    assert.equal(body.start, '2024-01-01');
    assert.equal(body.end, '2024-01-07');
    assert.deepEqual(body.items.map((i) => i.title), ['Harbor Lights', 'Second Sun']);
    assert.equal(body.items[0].event, 'Digital');
    assert.equal(body.items[1].time, '20:00');
  });

  test('an out-of-range window is rejected before any upstream call', async () => {
    const { status, body } = await get('/api/calendar?start=2024-01-01&end=2024-05-01');
    assert.equal(status, 400);
    assert.match(body.error, /1.42 days/);
  });
});

describe('/api/details', () => {
  test('an unknown source is a clean 400, not a crash', async () => {
    const { status, body } = await get('/api/details?id=bogus-1');
    assert.equal(status, 400);
    assert.equal(body.error, 'Unknown item');
  });

  test('a real Radarr id resolves full movie details', async () => {
    const { status, body } = await get('/api/details?id=radarr-10');
    assert.equal(status, 200);
    assert.equal(body.title, 'Ember & Ash');
    assert.ok(body.facts.some(([label, value]) => label === 'In library' && value === 'Yes'));
  });
});

describe('/api/image (the poster proxy)', () => {
  test('proxies a Radarr poster without ever exposing the upstream URL or API key', async () => {
    const res = await fetch(`${base}/api/image?s=radarr&p=10`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.ok(bytes.length > 0);
  });

  test('an unconfigured/unknown image source is a 404, not a proxy to anywhere', async () => {
    const res = await fetch(`${base}/api/image?s=nope&p=1`);
    assert.equal(res.status, 404);
  });
});
