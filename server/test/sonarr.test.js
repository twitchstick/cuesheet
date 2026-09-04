import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as sonarr from '../services/sonarr.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'http://10.0.0.5:8989', apiKey: 'key' };
afterEach(restoreFetch);

describe('calendar', () => {
  test('maps an episode, converting its air time into the given zone', async () => {
    mockFetch(
      jsonRes([
        { id: 11, seriesId: 21, title: 'Undertow', seasonNumber: 3, episodeNumber: 3, airDateUtc: '2026-03-05T18:30:00Z', hasFile: false, monitored: true, series: { title: 'Polaris', network: 'HBO' } },
      ]),
    );
    const [entry] = await sonarr.calendar(cfg, '2026-03-01', '2026-03-10', 'UTC');
    assert.equal(entry.id, 'sonarr-11');
    assert.equal(entry.title, 'Polaris');
    assert.equal(entry.subtitle, 'S03E03 · Undertow');
    assert.equal(entry.date, '2026-03-05');
    assert.equal(entry.time, '18:30');
    assert.equal(entry.network, 'HBO');
  });

  test('flags a season 1 episode 1 as a Premiere, and a later season\'s opener as a Season premiere', async () => {
    mockFetch(
      jsonRes([
        { id: 1, seriesId: 1, seasonNumber: 1, episodeNumber: 1, airDateUtc: '2026-03-02T00:00:00Z', series: { title: 'A' } },
        { id: 2, seriesId: 2, seasonNumber: 2, episodeNumber: 1, airDateUtc: '2026-03-03T00:00:00Z', series: { title: 'B' } },
        { id: 3, seriesId: 3, seasonNumber: 2, episodeNumber: 2, airDateUtc: '2026-03-04T00:00:00Z', series: { title: 'C' } },
      ]),
    );
    const entries = await sonarr.calendar(cfg, '2026-03-01', '2026-03-10', 'UTC');
    assert.deepEqual(entries.map((e) => e.event), ['Premiere', 'Season premiere', null]);
  });

  test('falls back to the plain airDate when there is no UTC timestamp', async () => {
    mockFetch(jsonRes([{ id: 1, seriesId: 1, seasonNumber: 1, episodeNumber: 1, airDate: '2026-03-05', series: { title: 'A' } }]));
    const [entry] = await sonarr.calendar(cfg, '2026-03-01', '2026-03-10', 'UTC');
    assert.equal(entry.date, '2026-03-05');
    assert.equal(entry.time, null);
  });

  test('an episode outside the window is dropped', async () => {
    mockFetch(jsonRes([{ id: 1, seriesId: 1, seasonNumber: 1, episodeNumber: 1, airDateUtc: '2026-01-01T00:00:00Z', series: { title: 'A' } }]));
    assert.deepEqual(await sonarr.calendar(cfg, '2026-03-01', '2026-03-10', 'UTC'), []);
  });
});

describe('details', () => {
  test('rejects a non-numeric id', async () => {
    await assert.rejects(() => sonarr.details(cfg, 'x'), /Invalid Sonarr episode id/);
  });

  test('prefers the episode\'s own overview, falls back to the series\'', async () => {
    mockFetch([
      jsonRes({ id: 9, seriesId: 21, seasonNumber: 3, episodeNumber: 2, title: 'Drift', overview: '', series: { title: 'Polaris', overview: 'A station at the top of the world.' } }),
    ]);
    const d = await sonarr.details(cfg, '9');
    assert.equal(d.overview, 'A station at the top of the world.');
    assert.equal(d.title, 'Polaris');
    assert.equal(d.subtitle, 'S03E02 · Drift');
  });

  test('fetches the series separately when the episode payload does not embed it', async () => {
    mockFetch([
      jsonRes({ id: 9, seriesId: 21, seasonNumber: 3, episodeNumber: 2, title: 'Drift', overview: 'Episode overview' }),
      jsonRes({ id: 21, title: 'Polaris', network: 'HBO' }),
    ]);
    const d = await sonarr.details(cfg, '9');
    assert.equal(d.title, 'Polaris');
    assert.equal(d.studio, 'HBO');
  });

  test('an episode missing from Sonarr is a clear error', async () => {
    mockFetch(jsonRes({}));
    await assert.rejects(() => sonarr.details(cfg, '9'), /no longer in Sonarr/);
  });
});

describe('queue', () => {
  test('maps a record and carries seriesId for the lifecycle route, without it leaking into the type', async () => {
    mockFetch(
      jsonRes({
        records: [
          { episodeId: 300, seriesId: 21, series: { title: 'Polaris' }, episode: { seasonNumber: 3, episodeNumber: 3, title: 'Undertow' }, size: 900_000_000, sizeleft: 120_000_000, status: 'downloading' },
        ],
      }),
    );
    const [row] = await sonarr.queue(cfg);
    assert.equal(row.id, 'sonarr-300');
    assert.equal(row.seriesId, 21);
    assert.equal(row.subtitle, 'S03E03 · Undertow');
  });

  test('drops a record missing either episodeId or seriesId', async () => {
    mockFetch(jsonRes({ records: [{ episodeId: 1 }, { seriesId: 1 }, {}] }));
    assert.deepEqual(await sonarr.queue(cfg), []);
  });
});

describe('findByTvdbId', () => {
  test('returns null for a non-integer id without a request', async () => {
    const calls = mockFetch([]);
    assert.equal(await sonarr.findByTvdbId(cfg, NaN), null);
    assert.equal(calls.length, 0);
  });

  test('a series with 100% of episodes on disk counts as hasFile', async () => {
    mockFetch(jsonRes([{ id: 21, monitored: true, statistics: { episodeFileCount: 10, percentOfEpisodes: 100 } }]));
    assert.deepEqual(await sonarr.findByTvdbId(cfg, 9021), { id: 21, monitored: true, hasFile: true });
  });

  test('a partially-downloaded series is not hasFile', async () => {
    mockFetch(jsonRes([{ id: 21, monitored: true, statistics: { episodeFileCount: 2, percentOfEpisodes: 20 } }]));
    assert.deepEqual(await sonarr.findByTvdbId(cfg, 9021), { id: 21, monitored: true, hasFile: false });
  });
});

describe('health', () => {
  test('keeps warnings and errors, drops notices', async () => {
    mockFetch(jsonRes([{ type: 'error', message: 'Indexers down' }, { type: 'notice', message: 'Update available' }]));
    const issues = await sonarr.health(cfg);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].source, 'sonarr');
    assert.equal(issues[0].severity, 'error');
  });
});
