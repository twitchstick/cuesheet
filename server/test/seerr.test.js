import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as seerr from '../services/seerr.js';
import { invalidate } from '../cache.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'http://10.0.0.5:5055', apiKey: 'key' };
afterEach(() => {
  restoreFetch();
  // details() is cached for 6h by design -- without this, whichever test
  // runs first for a given tmdbId would silently answer every later one.
  invalidate('seerr:details');
});

describe('recentRequests', () => {
  test('maps request/media status enums to their names', async () => {
    mockFetch([
      jsonRes({ results: [{ id: 5, status: 2, type: 'movie', createdAt: '2026-03-01T00:00:00Z', media: { tmdbId: 1001, status: 5 }, requestedBy: { displayName: 'Maya' } }] }),
      jsonRes({ id: 1001, title: 'Blue Current', releaseDate: '2026-01-01', overview: '', posterPath: '/x.jpg', mediaInfo: { status: 5 } }),
    ]);
    const [r] = await seerr.recentRequests(cfg);
    assert.equal(r.requestStatus, 'approved');
    assert.equal(r.mediaStatus, 'available');
    assert.equal(r.title, 'Blue Current');
    assert.equal(r.requestedBy, 'Maya');
    assert.equal(r.createdAt, new Date('2026-03-01T00:00:00Z').getTime());
  });

  test('only extracts tvdbId for a tv request, never for a movie', async () => {
    mockFetch([jsonRes({ results: [{ id: 1, status: 1, type: 'movie', media: { tmdbId: 2002, tvdbId: 9999, status: 1 } }] })]);
    const [r] = await seerr.recentRequests(cfg);
    assert.equal(r.tvdbId, null, 'a movie request should never carry a tvdbId, even if the upstream sent one');
  });

  test('a tv request with a tvdbId carries it through', async () => {
    mockFetch([jsonRes({ results: [{ id: 2, status: 2, type: 'tv', media: { tmdbId: 2003, tvdbId: 9021, status: 3 } }] })]);
    const [r] = await seerr.recentRequests(cfg);
    assert.equal(r.tvdbId, 9021);
  });

  test('an unrecognized request status falls back to pending, not a crash', async () => {
    mockFetch([jsonRes({ results: [{ id: 3, status: 999, type: 'movie', media: { tmdbId: null, status: 1 } }] })]);
    const [r] = await seerr.recentRequests(cfg);
    assert.equal(r.requestStatus, 'pending');
  });

  test('a request whose details lookup fails still appears, with a placeholder title', async () => {
    mockFetch([
      jsonRes({ results: [{ id: 4, status: 1, type: 'movie', media: { tmdbId: 5555, status: 1 } }] }),
      jsonRes({ message: 'not found' }, { ok: false, status: 404 }),
    ]);
    const [r] = await seerr.recentRequests(cfg);
    assert.equal(r.title, 'TMDB #5555');
  });

  test('no results is an empty array, not null/undefined', async () => {
    mockFetch(jsonRes({ results: [] }));
    assert.deepEqual(await seerr.recentRequests(cfg), []);
  });
});

describe('details caching', () => {
  test('a second call for the same title does not hit the network again', async () => {
    const calls = mockFetch([jsonRes({ id: 6001, title: 'Cached Movie', mediaInfo: { status: 1 } })]);
    await seerr.details(cfg, 'movie', 6001);
    await seerr.details(cfg, 'movie', 6001);
    assert.equal(calls.length, 1);
  });
});

describe('createRequest', () => {
  test('a tv request with no explicit seasons requests "all"', async () => {
    const calls = mockFetch(jsonRes({ id: 99, status: 1 }));
    await seerr.createRequest(cfg, { mediaType: 'tv', tmdbId: 1002 });
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.seasons, 'all');
  });

  test('a movie request never carries a seasons field', async () => {
    const calls = mockFetch(jsonRes({ id: 99, status: 1 }));
    await seerr.createRequest(cfg, { mediaType: 'movie', tmdbId: 1001 });
    const body = JSON.parse(calls[0].init.body);
    assert.equal('seasons' in body, false);
  });
});
