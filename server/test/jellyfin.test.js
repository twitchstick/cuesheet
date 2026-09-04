import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as jellyfin from '../services/jellyfin.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'http://10.0.0.5:8096', apiKey: 'jfkey' };
afterEach(restoreFetch);

describe('sessions', () => {
  test('maps a transcoding episode session and picks the series poster', async () => {
    mockFetch(
      jsonRes([
        {
          Id: 'j1', UserName: 'Riley', Client: 'Jellyfin Mobile', RemoteEndPoint: '203.0.113.7',
          PlayState: { PositionTicks: 31 * 60 * 10_000_000, IsPaused: false, PlayMethod: 'Transcode' },
          TranscodingInfo: { Bitrate: 6_200_000, IsVideoDirect: false, IsAudioDirect: false, TranscodeReasons: ['VideoCodecNotSupported'] },
          NowPlayingItem: {
            Id: 'glass', Type: 'Episode', SeriesName: 'Glass House', Name: 'Chapter 1', ParentIndexNumber: 1, IndexNumber: 2,
            SeriesId: 'glass-series', RunTimeTicks: 98 * 60 * 10_000_000,
            MediaStreams: [{ Type: 'Video', Codec: 'hevc', Height: 1080 }],
            ImageTags: { Primary: 't' },
          },
        },
      ]),
    );
    const [s] = await jellyfin.sessions(cfg);
    assert.equal(s.title, 'Glass House');
    assert.equal(s.subtitle, 'S01E02 · Chapter 1');
    assert.equal(s.transcoding, true);
    assert.equal(s.location, 'remote');
    assert.match(s.poster, /s=jellyfin&p=glass-series/);
  });

  test('a local RFC1918 endpoint is local, a public IP is remote', async () => {
    mockFetch(
      jsonRes([
        { Id: 'a', RemoteEndPoint: '192.168.1.50', PlayState: {}, NowPlayingItem: { Id: 'm1', Type: 'Movie', Name: 'X', RunTimeTicks: 0 } },
      ]),
    );
    const [s] = await jellyfin.sessions(cfg);
    assert.equal(s.location, 'local');
  });

  test('sessions with no NowPlayingItem are filtered out', async () => {
    mockFetch(jsonRes([{ Id: 'idle', PlayState: {} }]));
    assert.deepEqual(await jellyfin.sessions(cfg), []);
  });

  test('IsPaused maps to the paused state', async () => {
    mockFetch(jsonRes([{ Id: 'p', PlayState: { IsPaused: true }, NowPlayingItem: { Id: 'm', Type: 'Movie', Name: 'X', RunTimeTicks: 0 } }]));
    const [s] = await jellyfin.sessions(cfg);
    assert.equal(s.state, 'paused');
  });
});

describe('recentlyAdded', () => {
  test('with no userId, sorts via the general Items endpoint', async () => {
    mockFetch(jsonRes({ Items: [{ Id: '1', Type: 'Movie', Name: 'Blue Current', ProductionYear: 2026, DateCreated: '2026-01-01T00:00:00Z' }] }));
    const [item] = await jellyfin.recentlyAdded(cfg, 10);
    assert.equal(item.type, 'movie');
    assert.equal(item.subtitle, '2026');
  });

  test('with a userId, uses the per-user Latest endpoint and a plain array response', async () => {
    mockFetch(jsonRes([{ Id: '1', Type: 'Series', Name: 'Arcadia', ChildCount: 2 }]));
    const [item] = await jellyfin.recentlyAdded({ ...cfg, userId: 'u1' }, 10);
    assert.equal(item.type, 'show');
    assert.equal(item.subtitle, '2 seasons');
  });

  test('an episode carries the series name and episode code', async () => {
    mockFetch(jsonRes({ Items: [{ Id: '1', Type: 'Episode', SeriesName: 'Arcadia', Name: 'Pilot', ParentIndexNumber: 1, IndexNumber: 1 }] }));
    const [item] = await jellyfin.recentlyAdded(cfg, 10);
    assert.equal(item.title, 'Arcadia');
    assert.equal(item.subtitle, 'S01E01 · Pilot');
  });
});

describe('details', () => {
  test('rejects an id with unexpected characters', async () => {
    await assert.rejects(() => jellyfin.details(cfg, '../../etc/passwd'), /Invalid Jellyfin item id/);
  });

  test('accepts a dashed GUID id', async () => {
    mockFetch(jsonRes({ Id: 'a1b2c3-d4', Type: 'Movie', Name: 'X', MediaStreams: [] }));
    await assert.doesNotReject(() => jellyfin.details(cfg, 'a1b2c3-d4'));
  });

  test('an item missing from the library is a clear error', async () => {
    mockFetch(jsonRes({}));
    await assert.rejects(() => jellyfin.details(cfg, 'abc'), /no longer in the library/);
  });

  test('maps video/audio facts and cast', async () => {
    mockFetch(
      jsonRes({
        Id: 'x', Type: 'Movie', Name: 'Blue Current', Container: 'mkv', CommunityRating: 7.87,
        MediaStreams: [{ Type: 'Video', Codec: 'hevc', Height: 2160 }, { Type: 'Audio', Codec: 'dts' }],
        People: [{ Name: 'S. Bergqvist', Type: 'Director' }, { Name: 'D. Amara', Type: 'Actor' }],
      }),
    );
    const d = await jellyfin.details(cfg, 'x');
    assert.deepEqual(d.facts.find(([k]) => k === 'Quality'), ['Quality', '4K']);
    assert.deepEqual(d.people[0], { name: 'S. Bergqvist', role: 'Director' });
    assert.equal(d.rating, 7.9);
  });
});

describe('imageRequest', () => {
  test('accepts an alphanumeric/dashed id', () => {
    assert.doesNotThrow(() => jellyfin.imageRequest(cfg, 'a1-b2'));
  });

  test('rejects anything else', () => {
    assert.throws(() => jellyfin.imageRequest(cfg, '../etc/passwd'), /Invalid Jellyfin item id/);
    assert.throws(() => jellyfin.imageRequest(cfg, 'a/b'), /Invalid Jellyfin item id/);
  });

  test('a backdrop request uses the wide dimension and skips the tag', () => {
    const { url } = jellyfin.imageRequest(cfg, 'abc', { kind: 'backdrop', tag: 'ignored' });
    assert.match(url, /Backdrop/);
    assert.doesNotMatch(url, /tag=/);
  });
});
