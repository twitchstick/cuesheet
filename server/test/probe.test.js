import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { probes } from '../services/probe.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

afterEach(restoreFetch);

describe('plex probe', () => {
  test('reports the server name and version', async () => {
    mockFetch(jsonRes({ MediaContainer: { friendlyName: 'Apollo', version: '1.41.0' } }));
    const r = await probes.plex({ url: 'http://10.0.0.5:32400', token: 'tok' });
    assert.deepEqual(r, { ok: true, name: 'Apollo', version: '1.41.0' });
  });

  test('falls back to a generic name when the server does not give one', async () => {
    mockFetch(jsonRes({ MediaContainer: {} }));
    const r = await probes.plex({ url: 'http://10.0.0.5:32400', token: 'tok' });
    assert.equal(r.name, 'Plex Media Server');
  });
});

describe('jellyfin probe', () => {
  test('reports server info and the user list', async () => {
    mockFetch([
      jsonRes({ ServerName: 'Apollo Jellyfin', Version: '10.10' }),
      jsonRes([{ Id: 'u1', Name: 'Riley' }, { Id: '', Name: 'Bad' }]),
    ]);
    const r = await probes.jellyfin({ url: 'http://10.0.0.5:8096', apiKey: 'k' });
    assert.equal(r.name, 'Apollo Jellyfin');
    assert.deepEqual(r.users, [{ id: 'u1', name: 'Riley' }]);
  });

  test('still succeeds (with no users) when the Users call fails', async () => {
    mockFetch([jsonRes({ ServerName: 'Apollo Jellyfin', Version: '10.10' }), jsonRes({}, { ok: false, status: 500 })]);
    const r = await probes.jellyfin({ url: 'http://10.0.0.5:8096', apiKey: 'k' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.users, []);
  });
});

describe('radarr/sonarr probe', () => {
  test('radarr reports its instance name', async () => {
    mockFetch(jsonRes({ instanceName: 'Radarr', appName: 'Radarr', version: '5.0' }));
    const r = await probes.radarr({ url: 'http://10.0.0.5:7878', apiKey: 'k' });
    assert.equal(r.name, 'Radarr');
  });

  test('falls back to the given name when the response has neither', async () => {
    mockFetch(jsonRes({ version: '5.0' }));
    const r = await probes.sonarr({ url: 'http://10.0.0.5:8989', apiKey: 'k' });
    assert.equal(r.name, 'Sonarr');
  });
});

describe('seerr probe', () => {
  test('succeeds even when the unauthenticated /status call fails', async () => {
    mockFetch([
      jsonRes({ applicationTitle: 'Apollo Requests' }),
      jsonRes({}, { ok: false, status: 500 }),
      jsonRes({ results: [{ id: 1, displayName: 'Christopher' }] }),
    ]);
    const r = await probes.seerr({ url: 'http://10.0.0.5:5055', apiKey: 'k' });
    assert.equal(r.ok, true);
    assert.equal(r.version, null);
    assert.deepEqual(r.users, [{ id: '1', name: 'Christopher' }]);
  });

  test('a user with no display name falls back to their email', async () => {
    mockFetch([jsonRes({ applicationTitle: 'X' }), jsonRes({ version: '2.2.3' }), jsonRes({ results: [{ id: 2, email: 'a@b.com' }] })]);
    const r = await probes.seerr({ url: 'http://10.0.0.5:5055', apiKey: 'k' });
    assert.equal(r.users[0].name, 'a@b.com');
  });
});

describe('sabnzbd probe', () => {
  test('reports the version on success', async () => {
    mockFetch(jsonRes({ version: '4.3.1' }));
    const r = await probes.sabnzbd({ url: 'http://10.0.0.5:8080', apiKey: 'k' });
    assert.deepEqual(r, { ok: true, name: 'SABnzbd', version: '4.3.1' });
  });

  test('a bad key (200 OK with an error body) is rejected, not read as success', async () => {
    mockFetch(jsonRes({ status: false, error: 'API Key Incorrect' }));
    await assert.rejects(() => probes.sabnzbd({ url: 'http://10.0.0.5:8080', apiKey: 'wrong' }), /API Key Incorrect/);
  });

  test('an unexpected shape (no version string) is a clear error, not silent success', async () => {
    mockFetch(jsonRes({ ok: true }));
    await assert.rejects(() => probes.sabnzbd({ url: 'http://10.0.0.5:8080', apiKey: 'k' }), /Unexpected response/);
  });
});
