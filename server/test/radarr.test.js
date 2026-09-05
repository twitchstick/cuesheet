import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as radarr from '../services/radarr.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'http://10.0.0.5:7878', apiKey: 'key' };
afterEach(restoreFetch);

describe('calendar', () => {
  test('expands one movie into one entry per release date that falls in the window', () => {
    mockFetch(
      jsonRes([
        { id: 1, title: 'Blue Current', year: 2026, monitored: true, hasFile: false, digitalRelease: '2026-03-05T00:00:00Z', physicalRelease: '2026-05-01T00:00:00Z' },
      ]),
    );
    return radarr.calendar(cfg, '2026-03-01', '2026-03-10').then((entries) => {
      assert.equal(entries.length, 1, 'physical release is outside the window and should be dropped');
      assert.equal(entries[0].event, 'Digital');
      assert.equal(entries[0].date, '2026-03-05');
      assert.equal(entries[0].id, 'radarr-1-digitalRelease');
    });
  });

  test('a movie with no release date in range contributes nothing', async () => {
    mockFetch(jsonRes([{ id: 2, title: 'No Date', year: 2026, digitalRelease: '2026-01-01T00:00:00Z' }]));
    const entries = await radarr.calendar(cfg, '2026-03-01', '2026-03-10');
    assert.deepEqual(entries, []);
  });

  test('a non-array response is treated as no results, not a crash', async () => {
    mockFetch(jsonRes({ not: 'an array' }));
    assert.deepEqual(await radarr.calendar(cfg, '2026-03-01', '2026-03-10'), []);
  });
});

describe('details', () => {
  test('rejects a non-numeric id before ever making a request', async () => {
    await assert.rejects(() => radarr.details(cfg, '1; DROP TABLE'), /Invalid Radarr movie id/);
  });

  test('maps the file-quality and size facts only when a file exists', async () => {
    mockFetch(
      jsonRes({
        id: 5,
        title: 'Blue Current',
        year: 2026,
        hasFile: true,
        monitored: true,
        movieFile: { quality: { quality: { name: 'Bluray-1080p' } }, size: 4.5 * 1024 ** 3 },
        ratings: { tmdb: { value: 7.87 } },
      }),
    );
    const d = await radarr.details(cfg, '5');
    assert.deepEqual(d.facts.find(([k]) => k === 'Quality'), ['Quality', 'Bluray-1080p']);
    assert.deepEqual(d.facts.find(([k]) => k === 'Size'), ['Size', '4.5 GB']);
    assert.equal(d.rating, 7.9);
  });

  test('a movie with no id in the response is treated as gone, not a blank card', async () => {
    mockFetch(jsonRes({}));
    await assert.rejects(() => radarr.details(cfg, '999'), /no longer in Radarr/);
  });
});

describe('queue', () => {
  test('maps a queue record and computes progress/status via the shared util', async () => {
    mockFetch(
      jsonRes({
        records: [
          {
            movieId: 1,
            movie: { title: 'Blue Current', year: 2026, titleSlug: 'blue-current-2026' },
            size: 4_200_000_000,
            sizeleft: 3_100_000_000,
            timeleft: '00:22:00',
            status: 'downloading',
            trackedDownloadStatus: 'ok',
            downloadClient: 'SABnzbd',
          },
        ],
      }),
    );
    const [row] = await radarr.queue(cfg);
    assert.equal(row.id, 'radarr-1');
    assert.equal(row.status, 'downloading');
    assert.ok(Math.abs(row.progress - 0.2619) < 0.001);
    // An orphan queue row's only source for its own deep link.
    assert.equal(row.movieId, 1);
    assert.equal(row.titleSlug, 'blue-current-2026');
  });

  test('drops a record with no movieId rather than showing an unidentifiable row', async () => {
    mockFetch(jsonRes({ records: [{ size: 100, sizeleft: 50 }] }));
    assert.deepEqual(await radarr.queue(cfg), []);
  });
});

describe('imageRequest', () => {
  test('accepts a numeric ref', () => {
    const { url } = radarr.imageRequest(cfg, '5');
    assert.equal(url, 'http://10.0.0.5:7878/api/v3/mediacover/5/poster-250.jpg');
  });

  test('rejects a non-numeric ref', () => {
    assert.throws(() => radarr.imageRequest(cfg, '5; rm -rf'), /Invalid Radarr movie id/);
  });
});

describe('findByTmdbId', () => {
  test('returns null for a non-integer id without making a request', async () => {
    const calls = mockFetch([]);
    assert.equal(await radarr.findByTmdbId(cfg, 'not-a-number'), null);
    assert.equal(calls.length, 0);
  });

  test('returns null when Radarr has no match', async () => {
    mockFetch(jsonRes([]));
    assert.equal(await radarr.findByTmdbId(cfg, 2001), null);
  });

  test('maps the matched movie to id/titleSlug/monitored/hasFile', async () => {
    mockFetch(jsonRes([{ id: 1, tmdbId: 2001, titleSlug: 'ember-and-ash-2023', monitored: true, hasFile: false }]));
    assert.deepEqual(await radarr.findByTmdbId(cfg, 2001), { id: 1, titleSlug: 'ember-and-ash-2023', monitored: true, hasFile: false });
  });

  test('titleSlug is null, not undefined, when Radarr somehow omits it', async () => {
    mockFetch(jsonRes([{ id: 1, tmdbId: 2001, monitored: true, hasFile: false }]));
    assert.equal((await radarr.findByTmdbId(cfg, 2001)).titleSlug, null);
  });
});

describe('history', () => {
  test('maps records, dropping unrecognized event types and sorting newest first', async () => {
    mockFetch(
      jsonRes([
        { id: 1, eventType: 'grabbed', date: '2026-01-01T00:00:00Z', sourceTitle: 'Old release' },
        { id: 2, eventType: 'downloadFolderImported', date: '2026-01-03T00:00:00Z' },
        { id: 3, eventType: 'movieFileRenamed', date: '2026-01-02T00:00:00Z' },
      ]),
    );
    const events = await radarr.history(cfg, 10);
    assert.deepEqual(events.map((e) => e.id), ['radarr-history-2', 'radarr-history-1']);
  });

  test('a non-integer movieId short-circuits to an empty list without a request', async () => {
    const calls = mockFetch([]);
    assert.deepEqual(await radarr.history(cfg, 'DROP TABLE'), []);
    assert.equal(calls.length, 0);
  });

  test('a non-array response is treated as no history, not a crash', async () => {
    mockFetch(jsonRes({ not: 'an array' }));
    assert.deepEqual(await radarr.history(cfg, 10), []);
  });
});

describe('health', () => {
  test('keeps warnings and errors, drops notices', async () => {
    mockFetch(
      jsonRes([
        { type: 'warning', message: 'Download client unavailable', wikiUrl: 'https://wiki.servarr.com/x' },
        { type: 'notice', message: 'Update available' },
        { type: 'error', message: 'Indexers down' },
      ]),
    );
    const issues = await radarr.health(cfg);
    assert.equal(issues.length, 2);
    assert.equal(issues.every((i) => i.source === 'radarr'), true);
    assert.deepEqual(issues.map((i) => i.severity), ['warning', 'error']);
  });
});
