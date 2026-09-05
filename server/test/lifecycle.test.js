import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { baseLifecycleStage, lifecycleFor, orphanLifecycleItem, buildLifecycle } from '../lifecycle.js';

const noHealth = { radarr: [], sonarr: [] };
const noDeps = { radarrEnabled: false, sonarrEnabled: false, findByTmdbId: async () => null, findByTvdbId: async () => null };

const request = (overrides) => ({
  id: 1, mediaType: 'movie', tmdbId: 2001, tvdbId: null, title: 'Blue Current', year: 2026, poster: null,
  requestStatus: 'approved', mediaStatus: 'processing', seasons: [], requestedBy: 'Maya', avatar: null, createdAt: 1000,
  ...overrides,
});

describe('baseLifecycleStage', () => {
  test('maps every Seerr media status to its trace stage', () => {
    assert.equal(baseLifecycleStage('available'), 'available');
    assert.equal(baseLifecycleStage('partial'), 'importing');
    assert.equal(baseLifecycleStage('processing'), 'monitored');
    assert.equal(baseLifecycleStage('pending'), 'requested');
    assert.equal(baseLifecycleStage('none'), 'requested');
    assert.equal(baseLifecycleStage(undefined), 'requested');
  });
});

describe('lifecycleFor', () => {
  test('an available request never calls out to Radarr/Sonarr at all', async () => {
    let called = false;
    const deps = { radarrEnabled: true, sonarrEnabled: true, findByTmdbId: async () => { called = true; return null; }, findByTvdbId: async () => { called = true; return null; } };
    const item = await lifecycleFor(request({ mediaStatus: 'available' }), [], noHealth, deps);
    assert.equal(item.stage, 'available');
    assert.equal(called, false);
  });

  test('a garbage/non-integer tmdbId never reaches the injected lookup at all', async () => {
    let called = false;
    const deps = { radarrEnabled: true, sonarrEnabled: false, findByTmdbId: async () => { called = true; return null; }, findByTvdbId: async () => null };
    await lifecycleFor(request({ tmdbId: 'DROP TABLE requests;' }), [], noHealth, deps);
    assert.equal(called, false, 'an untrusted/malformed tmdbId must never reach the lookup (it becomes a cache key in production)');
  });

  test('radarr disabled: stays at the Seerr-reported stage, no lookup attempted', async () => {
    let called = false;
    const deps = { ...noDeps, findByTmdbId: async () => { called = true; return null; } };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.stage, 'monitored');
    assert.equal(called, false);
  });

  test('found in Radarr, monitored, no queue row, no file: stays at monitored', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.stage, 'monitored');
  });

  test('found in Radarr with a file already on disk (Seerr just has not synced yet): jumps to available', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: true }) };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.stage, 'available');
  });

  test('a live queue match takes priority over hasFile/monitored, and carries progress through', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const queueItems = [{ id: 'radarr-1', status: 'downloading', progress: 0.42, timeleft: '00:20:00', statusDetail: null, subtitle: null, quality: 'Bluray-1080p' }];
    const item = await lifecycleFor(request(), queueItems, noHealth, deps);
    assert.equal(item.stage, 'downloading');
    assert.equal(item.progress, 0.42);
    assert.equal(item.queueId, 'radarr-1');
    assert.equal(item.quality, 'Bluray-1080p');
  });

  test('an importing queue row maps to the importing stage specifically', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const queueItems = [{ id: 'radarr-1', status: 'importing', progress: 1, timeleft: '00:00:00', statusDetail: null, subtitle: null }];
    const item = await lifecycleFor(request(), queueItems, noHealth, deps);
    assert.equal(item.stage, 'importing');
  });

  test('a failed/stalled/paused queue row keeps its own status for the trace to color, not flattened into "downloading"', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    for (const status of ['failed', 'stalled', 'paused', 'warning', 'queued']) {
      const queueItems = [{ id: 'radarr-1', status, progress: 0.1, timeleft: null, statusDetail: 'why', subtitle: null }];
      const item = await lifecycleFor(request(), queueItems, noHealth, deps);
      assert.equal(item.downloadStatus, status, `expected downloadStatus to preserve "${status}"`);
      assert.equal(item.stage, 'downloading', `${status} still belongs to the downloading waypoint on the 5-stage trace`);
    }
  });

  test('tv routes through tvdbId, not tmdbId, and only when one is present', async () => {
    let tmdbCalled = false;
    const deps = { radarrEnabled: true, sonarrEnabled: true, findByTmdbId: async () => { tmdbCalled = true; return null; }, findByTvdbId: async (id) => (id === 9021 ? { id: 21, monitored: true, hasFile: false } : null) };
    const item = await lifecycleFor(request({ mediaType: 'tv', tmdbId: 2003, tvdbId: 9021 }), [], noHealth, deps);
    assert.equal(tmdbCalled, false, 'a tv request should never go through the movie lookup');
    assert.equal(item.stage, 'monitored');
  });

  test('a tv request with no tvdbId cannot be refined at all, and stays at the Seerr stage', async () => {
    const deps = { radarrEnabled: true, sonarrEnabled: true, findByTmdbId: async () => null, findByTvdbId: async () => ({ id: 21, monitored: true, hasFile: true }) };
    const item = await lifecycleFor(request({ mediaType: 'tv', tmdbId: 2003, tvdbId: null }), [], noHealth, deps);
    assert.equal(item.stage, 'monitored', 'no tvdbId means no lookup was even attempted');
  });

  test('a queue match is matched on seriesId for tv, not on the episode id', async () => {
    const deps = { ...noDeps, sonarrEnabled: true, findByTvdbId: async () => ({ id: 21, monitored: true, hasFile: false }) };
    const queueItems = [{ id: 'sonarr-300', source: 'sonarr', seriesId: 21, status: 'downloading', progress: 0.5, timeleft: '00:10:00', statusDetail: null, subtitle: 'S03E03' }];
    const item = await lifecycleFor(request({ mediaType: 'tv', tmdbId: 2003, tvdbId: 9021 }), queueItems, noHealth, deps);
    assert.equal(item.stage, 'downloading');
    assert.equal(item.subtitle, 'S03E03');
  });

  test('a lookup that throws degrades to the Seerr-reported stage rather than dropping the item', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => { throw new Error('Radarr unreachable'); } };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.stage, 'monitored');
    assert.equal(item.title, 'Blue Current', 'the item itself must still come through, just without the refinement');
  });

  test('a stall reason is attached only when stuck at monitored, using the matching service\'s top issue', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const health = { radarr: [{ message: 'Download client SABnzbd is unavailable' }], sonarr: [{ message: 'wrong service' }] };
    const item = await lifecycleFor(request(), [], health, deps);
    assert.equal(item.stallReason, 'Download client SABnzbd is unavailable');
  });

  test('no stall reason when nothing is actually stuck (already downloading)', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const health = { radarr: [{ message: 'irrelevant, should not attach' }], sonarr: [] };
    const queueItems = [{ id: 'radarr-1', status: 'downloading', progress: 0.5, timeleft: null, statusDetail: null, subtitle: null }];
    const item = await lifecycleFor(request(), queueItems, health, deps);
    assert.equal(item.stallReason, null);
  });

  test('no stall reason when the matching service has no active issue', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const item = await lifecycleFor(request(), [], { radarr: [], sonarr: [{ message: 'not radarr' }] }, deps);
    assert.equal(item.stallReason, null);
  });

  test('every request keeps its own original fields (title, requestedBy, createdAt) through the refinement', async () => {
    const item = await lifecycleFor(request({ requestedBy: 'Riley', createdAt: 12345 }), [], noHealth, noDeps);
    assert.equal(item.requestedBy, 'Riley');
    assert.equal(item.createdAt, 12345);
    assert.equal(item.fromRequest, true);
  });

  test('externalId is Radarr/Sonarr\'s own internal (REST API) id, once resolved', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 42, titleSlug: 'ember-and-ash-2023', monitored: true, hasFile: false }) };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.externalId, 42);
  });

  test('titleSlug is Radarr/Sonarr\'s own web-UI id, once resolved -- what the client\'s deep link actually needs, not externalId', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 42, titleSlug: 'ember-and-ash-2023', monitored: true, hasFile: false }) };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.titleSlug, 'ember-and-ash-2023');
  });

  test('externalId and titleSlug both stay null for an already-available request -- the lookup never runs, so there is nothing to resolve either from', async () => {
    const item = await lifecycleFor(request({ mediaStatus: 'available' }), [], noHealth, { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 42, titleSlug: 'x', monitored: true, hasFile: true }) });
    assert.equal(item.externalId, null);
    assert.equal(item.titleSlug, null);
  });

  test('externalId and titleSlug both stay null when Radarr/Sonarr has no match for this title at all', async () => {
    const item = await lifecycleFor(request(), [], noHealth, { ...noDeps, radarrEnabled: true, findByTmdbId: async () => null });
    assert.equal(item.externalId, null);
    assert.equal(item.titleSlug, null);
  });

  test('quality comes from the movie file already on disk when hasFile jumps straight to available, no queue row involved', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: true, quality: 'Bluray-1080p' }) };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.stage, 'available');
    assert.equal(item.quality, 'Bluray-1080p');
  });

  test('quality stays null when nothing has surfaced one yet (still just monitored)', async () => {
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const item = await lifecycleFor(request(), [], noHealth, deps);
    assert.equal(item.quality, null);
  });

  test('quality stays null for an already-available request -- the lookup never runs, so there is nothing to resolve it from', async () => {
    const item = await lifecycleFor(request({ mediaStatus: 'available' }), [], noHealth, noDeps);
    assert.equal(item.quality, null);
  });
});

describe('orphanLifecycleItem', () => {
  test('builds a trace-shaped item with no request backstory', () => {
    const row = { id: 'radarr-3', type: 'movie', title: 'Second Sun', poster: '/x', status: 'stalled', progress: 0.04, timeleft: '1.02:00:00', statusDetail: 'client down', subtitle: null };
    const item = orphanLifecycleItem(row);
    assert.equal(item.fromRequest, false);
    assert.equal(item.stage, 'downloading');
    assert.equal(item.downloadStatus, 'stalled');
    assert.equal(item.requestedBy, '');
    assert.equal(item.createdAt, 0);
    assert.equal(item.queueId, 'radarr-3');
  });

  test('an importing status maps to the importing stage', () => {
    assert.equal(orphanLifecycleItem({ id: 'radarr-2', status: 'importing' }).stage, 'importing');
  });

  test('externalId comes straight off the queue row -- movieId for Radarr, seriesId for Sonarr', () => {
    assert.equal(orphanLifecycleItem({ id: 'radarr-77', movieId: 77 }).externalId, 77);
    assert.equal(orphanLifecycleItem({ id: 'sonarr-200', seriesId: 55 }).externalId, 55);
    assert.equal(orphanLifecycleItem({ id: 'radarr-1' }).externalId, null, 'neither field present -- null, not undefined');
  });

  test('titleSlug also comes straight off the queue row -- an orphan\'s only source for either', () => {
    assert.equal(orphanLifecycleItem({ id: 'radarr-77', movieId: 77, titleSlug: 'redline-2021' }).titleSlug, 'redline-2021');
    assert.equal(orphanLifecycleItem({ id: 'radarr-1' }).titleSlug, null);
  });

  test('quality comes straight off the queue row too, null when the row has none', () => {
    assert.equal(orphanLifecycleItem({ id: 'radarr-77', movieId: 77, quality: 'WEBDL-720p' }).quality, 'WEBDL-720p');
    assert.equal(orphanLifecycleItem({ id: 'radarr-1' }).quality, null);
  });

  test('mediaType comes from the queue row\'s type, episode -> tv', () => {
    assert.equal(orphanLifecycleItem({ id: 'sonarr-1', type: 'episode' }).mediaType, 'tv');
    assert.equal(orphanLifecycleItem({ id: 'radarr-1', type: 'movie' }).mediaType, 'movie');
  });

  test('ids from different sources never collide, even with the same trailing number', () => {
    const a = orphanLifecycleItem({ id: 'radarr-123' });
    const b = orphanLifecycleItem({ id: 'sonarr-123' });
    assert.notEqual(a.id, b.id);
  });
});

describe('buildLifecycle (the whole /api/lifecycle computation)', () => {
  test('a queue item claimed by a matched request does not also appear as an orphan', async () => {
    const requests = [request({ id: 8 })];
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const queueItems = [{ id: 'radarr-1', status: 'downloading', progress: 0.3, timeleft: null, statusDetail: null, subtitle: null }];
    const items = await buildLifecycle(requests, queueItems, noHealth, deps);
    assert.equal(items.length, 1, 'the queue row belongs to the matched request, not a second orphan copy');
    assert.equal(items[0].fromRequest, true);
  });

  test('an unclaimed queue item appears once, as an orphan', async () => {
    const items = await buildLifecycle([], [{ id: 'radarr-9', status: 'downloading', progress: 0.1, timeleft: null, statusDetail: null, subtitle: null, title: 'Orphan' }], noHealth, noDeps);
    assert.equal(items.length, 1);
    assert.equal(items[0].fromRequest, false);
  });

  test('a deleted request is dropped entirely, not shown as "requested"', async () => {
    const items = await buildLifecycle([request({ mediaStatus: 'deleted' })], [], noHealth, noDeps);
    assert.deepEqual(items, []);
  });

  test('a request whose media never entered the queue and an unrelated orphan both survive, uncombined', async () => {
    const requests = [request({ id: 1, tmdbId: 2001 })];
    const deps = { ...noDeps, radarrEnabled: true, findByTmdbId: async () => ({ id: 1, monitored: true, hasFile: false }) };
    const queueItems = [{ id: 'radarr-2', status: 'downloading', progress: 0.5, timeleft: null, statusDetail: null, subtitle: null, title: 'Unrelated' }];
    const items = await buildLifecycle(requests, queueItems, noHealth, deps);
    assert.equal(items.length, 2);
    assert.equal(items.filter((i) => i.fromRequest).length, 1);
    assert.equal(items.filter((i) => !i.fromRequest).length, 1);
  });
});
