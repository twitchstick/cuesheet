import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as plex from '../services/plex.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'http://10.0.0.5:32400', token: 'plextok' };
afterEach(restoreFetch);

describe('sessions', () => {
  test('maps a direct-play movie session', async () => {
    mockFetch(
      jsonRes({
        MediaContainer: {
          Metadata: [
            {
              sessionKey: '1', ratingKey: '101', type: 'movie', title: 'Blue Current', year: 2026, thumb: '/library/metadata/101/thumb/1',
              viewOffset: 30 * 60_000, duration: 118 * 60_000, User: { title: 'Christopher' },
              Player: { title: 'Living Room TV', product: 'Plex for Apple TV', state: 'playing' },
              Media: [{ videoResolution: '4k', bitrate: 38000 }],
              Session: { location: 'lan', bandwidth: 38000 },
            },
          ],
        },
      }),
    );
    const [s] = await plex.sessions(cfg);
    assert.equal(s.id, 'plex-1');
    assert.equal(s.title, 'Blue Current');
    assert.equal(s.type, 'movie');
    assert.equal(s.transcoding, false);
    assert.equal(s.location, 'local');
    assert.equal(s.quality, '4K');
    assert.ok(Math.abs(s.progress - 30 / 118) < 0.001);
  });

  test('an episode shows the series title with an episode-coded subtitle', async () => {
    mockFetch(
      jsonRes({
        MediaContainer: {
          Metadata: [
            {
              sessionKey: '2', ratingKey: '102', type: 'episode', title: 'The Long Way Round', grandparentTitle: 'Arcadia', parentIndex: 2, index: 6,
              viewOffset: 0, duration: 0, Player: { state: 'playing' },
              TranscodeSession: { videoDecision: 'transcode', audioDecision: 'copy', speed: 0.8, throttled: false },
              Session: { location: 'wan' },
            },
          ],
        },
      }),
    );
    const [s] = await plex.sessions(cfg);
    assert.equal(s.title, 'Arcadia');
    assert.equal(s.subtitle, 'S02E06 · The Long Way Round');
    assert.equal(s.transcoding, true);
    assert.equal(s.location, 'remote');
    assert.equal(s.attention, 'Slow');
  });

  test('non-video sessions (music, photos) are filtered out', async () => {
    mockFetch(jsonRes({ MediaContainer: { Metadata: [{ type: 'track', title: 'A Song' }] } }));
    assert.deepEqual(await plex.sessions(cfg), []);
  });

  test('an unrecognized player state does not crash the tally', async () => {
    mockFetch(jsonRes({ MediaContainer: { Metadata: [{ type: 'movie', title: 'X', duration: 100, viewOffset: 0 }] } }));
    const [s] = await plex.sessions(cfg);
    assert.equal(s.state, 'playing'); // the documented default when Player is absent
  });
});

describe('recentlyAdded', () => {
  const meta = (extra) => jsonRes({ MediaContainer: { Metadata: [{ ratingKey: '200', addedAt: 1700000000, ...extra }] } });

  test('a movie', async () => {
    mockFetch(meta({ type: 'movie', title: 'Blue Current', year: 2026 }));
    const [item] = await plex.recentlyAdded(cfg, 10);
    assert.equal(item.type, 'movie');
    assert.equal(item.subtitle, '2026');
    assert.equal(item.addedAt, 1700000000000);
  });

  test('an episode carries the series title and episode code', async () => {
    mockFetch(meta({ type: 'episode', title: 'Chapter 1', grandparentTitle: 'Arcadia', parentIndex: 2, index: 6 }));
    const [item] = await plex.recentlyAdded(cfg, 10);
    assert.equal(item.title, 'Arcadia');
    assert.equal(item.subtitle, 'S02E06 · Chapter 1');
  });

  test('a show pluralizes seasons correctly at 1 vs many', async () => {
    mockFetch(jsonRes({ MediaContainer: { Metadata: [
      { ratingKey: '1', type: 'show', title: 'A', childCount: 1, addedAt: 1 },
      { ratingKey: '2', type: 'show', title: 'B', childCount: 3, addedAt: 1 },
    ] } }));
    const items = await plex.recentlyAdded(cfg, 10);
    assert.equal(items[0].subtitle, '1 season');
    assert.equal(items[1].subtitle, '3 seasons');
  });

  test('respects the limit even when more come back', async () => {
    mockFetch(jsonRes({ MediaContainer: { Metadata: Array.from({ length: 6 }, (_, i) => ({ ratingKey: String(i), type: 'movie', title: `M${i}`, addedAt: 1 })) } }));
    const items = await plex.recentlyAdded(cfg, 3);
    assert.equal(items.length, 3);
  });
});

describe('details', () => {
  test('rejects a non-numeric ratingKey', async () => {
    await assert.rejects(() => plex.details(cfg, 'drop table'), /Invalid Plex item id/);
  });

  test('missing item is a clear error', async () => {
    mockFetch(jsonRes({ MediaContainer: {} }));
    await assert.rejects(() => plex.details(cfg, '101'), /no longer in the library/);
  });

  test('maps genres/cast/facts', async () => {
    mockFetch(
      jsonRes({
        MediaContainer: {
          Metadata: [{
            type: 'movie', title: 'Blue Current', year: 2026, summary: 'A diver.', duration: 118 * 60_000, rating: 7.87,
            Genre: [{ tag: 'Drama' }, { tag: 'Adventure' }],
            Director: [{ tag: 'A. Vale' }],
            Role: [{ tag: 'J. Okafor' }, { tag: 'M. Lindqvist' }],
            Media: [{ videoResolution: '4k', container: 'mkv', videoCodec: 'hevc' }],
          }],
        },
      }),
    );
    const d = await plex.details(cfg, '101');
    assert.deepEqual(d.genres, ['Drama', 'Adventure']);
    assert.deepEqual(d.people[0], { name: 'A. Vale', role: 'Director' });
    assert.equal(d.rating, 7.9);
    assert.deepEqual(d.facts.find(([k]) => k === 'Quality'), ['Quality', '4K']);
  });
});

describe('imageRequest -- the SSRF-fix regression guard', () => {
  test('accepts a real Plex thumb path', () => {
    const { url } = plex.imageRequest(cfg, '/library/metadata/101/thumb/1');
    assert.match(url, /^http:\/\/10\.0\.0\.5:32400\/photo\/:\/transcode\?/);
  });

  test('accepts a real Plex art path with no trailing revision', () => {
    assert.doesNotThrow(() => plex.imageRequest(cfg, '/library/metadata/101/art'));
  });

  test('rejects a protocol-relative path -- the exact bypass this check exists for', () => {
    assert.throws(() => plex.imageRequest(cfg, '//attacker.example/x'), /Invalid Plex image path/);
  });

  test('rejects an absolute URL', () => {
    assert.throws(() => plex.imageRequest(cfg, 'https://attacker.example/x'), /Invalid Plex image path/);
  });

  test('rejects an unrelated path that merely starts with /', () => {
    assert.throws(() => plex.imageRequest(cfg, '/some/other/path'), /Invalid Plex image path/);
  });
});
