/**
 * Canned upstream responses shared by the integration test. Shapes match
 * what each real service actually sends back (trimmed to the fields
 * Cuesheet reads), so the fixtures double as small, readable examples of
 * each API on top of exercising the route.
 */

// A tiny (invalid, but content-type-correct) JPEG -- the image proxy only
// checks the response's declared content type, never decodes the bytes.
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

export const plexRoutes = {
  'GET /status/sessions': {
    body: {
      MediaContainer: {
        Metadata: [
          {
            sessionKey: '1',
            ratingKey: '501',
            type: 'movie',
            title: 'Nova',
            year: 2024,
            duration: 6_000_000,
            viewOffset: 1_500_000,
            User: { title: 'Riley' },
            Player: { product: 'Plex Web', title: 'Chrome', state: 'playing' },
            Media: [{ videoResolution: '4k', bitrate: 25000 }],
            // A long meta line (quality/bandwidth/location) plus the
            // transcode pill next to it -- realistic enough to actually
            // stress a narrow phone width, unlike a short "1080p · 8.0 Mbps".
            Session: { location: 'wan' },
            TranscodeSession: { videoDecision: 'transcode', audioDecision: 'copy', speed: 1.2 },
          },
        ],
      },
    },
  },
  'GET /library/recentlyAdded': {
    body: {
      MediaContainer: {
        Metadata: [
          {
            // A distinct title from the live session below ("Nova") --
            // both used to say "Nova", which made a title-text assertion
            // against either endpoint ambiguous about which one it saw.
            ratingKey: '502',
            type: 'movie',
            title: 'Solstice',
            year: 2024,
            addedAt: Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000),
            thumb: '/library/metadata/502/thumb/123',
          },
        ],
      },
    },
  },
};

export const jellyfinRoutes = {
  'GET /Sessions': { body: [] },
  'GET /Items': {
    body: {
      Items: [
        {
          Id: 'abc123',
          Type: 'Movie',
          Name: 'Lumen',
          ProductionYear: 2023,
          DateCreated: '2024-01-02T00:00:00Z',
        },
        // Same title+year as Plex's "Solstice" above, deliberately -- two
        // libraries pointed at the same content, the /api/recent dedup
        // test's whole reason to exist. Newer than Plex's own copy, so
        // this is the one that survives the merge.
        {
          Id: 'dup456',
          Type: 'Movie',
          Name: 'Solstice',
          ProductionYear: 2024,
          DateCreated: '2024-01-03T00:00:00Z',
        },
      ],
    },
  },
};

export const radarrRoutes = {
  // findByTmdbId(10) for the lifecycle test's matched movie request.
  'GET /api/v3/movie': { body: [{ id: 10, titleSlug: 'ember-and-ash-2023', monitored: true, hasFile: false }] },
  'GET /api/v3/movie/10': {
    body: {
      id: 10,
      title: 'Ember & Ash',
      originalTitle: 'Ember & Ash',
      year: 2023,
      overview: 'A slow-burn thriller.',
      runtime: 118,
      genres: ['Drama'],
      certification: 'PG-13',
      ratings: { tmdb: { value: 7.4 } },
      studio: 'Aurora Pictures',
      status: 'released',
      inCinemas: '2023-04-01',
      digitalRelease: '2023-05-01',
      monitored: true,
      hasFile: true,
      movieFile: { quality: { quality: { name: 'Bluray-1080p' } }, size: 5 * 1024 ** 3 },
    },
  },
  'GET /api/v3/queue': {
    body: {
      records: [
        // Claimed by the movie request above (movieId 10 == findByTmdbId's id).
        { movieId: 10, size: 1000, sizeleft: 400, timeleft: '01:00:00', movie: { title: 'Ember & Ash', year: 2023, titleSlug: 'ember-and-ash-2023' } },
        // No matching request -- becomes an orphan on /api/lifecycle.
        { movieId: 77, size: 2000, sizeleft: 2000, timeleft: '02:00:00', movie: { title: 'Redline', year: 2021, titleSlug: 'redline-2021' } },
      ],
    },
  },
  'GET /api/v3/health': { body: [] },
  'GET /api/v3/calendar': {
    body: [{ id: 900, title: 'Harbor Lights', year: 2024, hasFile: false, monitored: true, digitalRelease: '2024-01-03' }],
  },
  'GET /api/v3/mediacover/10/poster-250.jpg': { body: TINY_JPEG, headers: { 'Content-Type': 'image/jpeg' } },
  // A small real story, not one flat "grabbed" -- a low-quality release that
  // failed, then a re-grab that's the one actually in the queue fixture
  // above (still downloading, not imported yet -- consistent with it).
  // Radarr/Sonarr's own history isn't paginated per-title, so this is the
  // whole thing, oldest first.
  'GET /api/v3/history/movie': {
    body: [
      { id: 1, eventType: 'grabbed', date: '2024-01-01T10:00:00Z', sourceTitle: 'Ember.and.Ash.2023.720p.WEB-DL-OLDGRP', data: { indexer: 'NewsHost' } },
      { id: 2, eventType: 'downloadFailed', date: '2024-01-01T11:30:00Z', sourceTitle: 'Ember.and.Ash.2023.720p.WEB-DL-OLDGRP', data: { message: 'Sample' } },
      { id: 3, eventType: 'grabbed', date: '2024-01-01T12:00:00Z', sourceTitle: 'Ember.and.Ash.2023.1080p.BluRay-GROUP', data: { indexer: 'Indexer1' } },
    ],
  },
};

export const sonarrRoutes = {
  // findByTvdbId(99) for the lifecycle test's matched tv request.
  'GET /api/v3/series': { body: [{ id: 55, titleSlug: 'second-sun', monitored: true, statistics: { episodeFileCount: 0, percentOfEpisodes: 0 } }] },
  'GET /api/v3/queue': {
    body: {
      records: [
        // Claimed via seriesId 55, matching findByTvdbId's result above.
        {
          episodeId: 200,
          seriesId: 55,
          size: 800,
          sizeleft: 200,
          timeleft: '00:30:00',
          series: { title: 'Second Sun', titleSlug: 'second-sun' },
          episode: { seasonNumber: 1, episodeNumber: 4, title: 'Ashfall' },
        },
      ],
    },
  },
  'GET /api/v3/health': { body: [] },
  'GET /api/v3/calendar': {
    body: [
      {
        id: 901,
        seriesId: 55,
        seasonNumber: 1,
        episodeNumber: 5,
        title: 'Windfall',
        airDateUtc: '2024-01-04T20:00:00Z',
        hasFile: false,
        monitored: true,
        series: { title: 'Second Sun', network: 'Apollo TV' },
      },
    ],
  },
  'GET /api/v3/history/series': {
    body: [
      { id: 1, eventType: 'grabbed', date: '2024-01-02T08:00:00Z', sourceTitle: 'Second.Sun.S01E04.720p-GROUP' },
      { id: 2, eventType: 'downloadFailed', date: '2024-01-02T09:15:00Z', sourceTitle: 'Second.Sun.S01E04.720p-GROUP', data: { reason: 'No files found are eligible for import' } },
      { id: 3, eventType: 'grabbed', date: '2024-01-02T10:00:00Z', sourceTitle: 'Second.Sun.S01E04.1080p-GROUP2', data: { indexer: 'Indexer2' } },
    ],
  },
};

export const seerrRoutes = {
  'GET /api/v1/request': {
    body: {
      results: [
        {
          id: 1,
          type: 'movie',
          status: 2, // approved
          createdAt: '2024-01-01T00:00:00Z',
          media: { tmdbId: 10, status: 3 }, // processing
          requestedBy: { displayName: 'Riley' },
        },
        {
          id: 2,
          type: 'tv',
          status: 1, // pending
          createdAt: '2024-01-02T00:00:00Z',
          media: { tmdbId: 20, tvdbId: 99, status: 2 }, // pending
          seasons: [{ seasonNumber: 1 }],
          requestedBy: { displayName: 'Christopher' },
        },
      ],
    },
  },
  'GET /api/v1/movie/10': {
    body: { id: 10, title: 'Ember & Ash', releaseDate: '2023-05-01', overview: '', posterPath: '/ember.jpg', mediaInfo: { status: 3 }, seasons: [] },
  },
  'GET /api/v1/tv/20': {
    body: {
      id: 20,
      name: 'Second Sun',
      firstAirDate: '2022-01-01',
      overview: '',
      posterPath: '/second-sun.jpg',
      mediaInfo: { status: 2 },
      seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 8 }],
    },
  },
};

export const sabnzbdRoutes = {
  'GET /api': { body: { queue: { kbpersec: '500.00', paused: false, diskspace1: '100.00' } } },
};
