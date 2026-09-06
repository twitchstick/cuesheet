/**
 * Its own isolated server + upstreams (its own real child process -- see
 * spawnServer.ts) -- these scenarios need a custom multi-episode,
 * multi-attempt history shape the shared fixture server's single "one
 * failed grab, one re-grab" story was never meant to carry, and building
 * it there would mean reshaping data several other specs already depend on.
 */
import { test, expect, type Locator } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startUpstream } from '../server/test/integration/upstream.js';
import { spawnServer } from './support/spawnServer.js';

const seerrRoutes = {
  'GET /api/v1/request': {
    body: {
      results: [
        { id: 1, type: 'movie', status: 2, createdAt: '2024-01-01T00:00:00Z', media: { tmdbId: 1, status: 3 }, requestedBy: { displayName: 'Alex' } },
        {
          id: 2,
          type: 'tv',
          status: 2,
          createdAt: '2024-01-01T00:00:00Z',
          media: { tmdbId: 2, tvdbId: 2, status: 3 },
          seasons: [{ seasonNumber: 1 }],
          requestedBy: { displayName: 'Sam' },
        },
      ],
    },
  },
  'GET /api/v1/movie/1': { body: { id: 1, title: 'Ghost Ridge', releaseDate: '2024-01-01', overview: '', posterPath: null, mediaInfo: { status: 3 }, seasons: [] } },
  'GET /api/v1/tv/2': {
    body: { id: 2, name: 'Harbor Watch', firstAirDate: '2024-01-01', overview: '', posterPath: null, mediaInfo: { status: 3 }, seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 10 }] },
  },
};

const radarrRoutes = {
  'GET /api/v3/movie': { body: [{ id: 1, titleSlug: 'ghost-ridge-2024', monitored: true, hasFile: false }] },
  'GET /api/v3/queue': {
    body: {
      records: [
        // downloadId matches history's "dl-current" below -- the one
        // attempt that's actually still active.
        { movieId: 1, size: 1000, sizeleft: 400, timeleft: '00:10:00', downloadId: 'dl-current', movie: { title: 'Ghost Ridge', year: 2024, titleSlug: 'ghost-ridge-2024' } },
      ],
    },
  },
  'GET /api/v3/health': { body: [] },
  // A grab from over a year ago that was never resolved one way or the
  // other, and isn't the queue's current job -- exactly the case that
  // must read "outcome unknown," not a misleadingly confident "in progress."
  'GET /api/v3/history/movie': {
    body: [
      { id: 1, eventType: 'grabbed', date: '2023-01-01T00:00:00Z', sourceTitle: 'Ghost.Ridge.2024.480p-ANCIENT', downloadId: 'dl-ancient' },
      { id: 2, eventType: 'grabbed', date: '2024-01-01T00:00:00Z', sourceTitle: 'Ghost.Ridge.2024.1080p-CURRENT', downloadId: 'dl-current' },
    ],
  },
};

const sonarrRoutes = {
  'GET /api/v3/series': { body: [{ id: 1, titleSlug: 'harbor-watch', monitored: true, statistics: { episodeFileCount: 0, percentOfEpisodes: 0 } }] },
  'GET /api/v3/queue': { body: { records: [] } },
  'GET /api/v3/health': { body: [] },
  // Three unrelated download jobs: two different single episodes that both
  // just landed normally (never a retry of each other), and one season-pack
  // job spanning two episodes where one imported and the other failed.
  'GET /api/v3/history/series': {
    body: [
      { id: 1, eventType: 'grabbed', date: '2024-02-01T00:00:00Z', sourceTitle: 'Harbor.Watch.S01E01-GROUP', downloadId: 'dl-e01', episode: { seasonNumber: 1, episodeNumber: 1 } },
      { id: 2, eventType: 'downloadFolderImported', date: '2024-02-01T01:00:00Z', sourceTitle: 'Harbor.Watch.S01E01-GROUP', downloadId: 'dl-e01', episode: { seasonNumber: 1, episodeNumber: 1 } },
      { id: 3, eventType: 'grabbed', date: '2024-02-02T00:00:00Z', sourceTitle: 'Harbor.Watch.S01E02-GROUP', downloadId: 'dl-e02', episode: { seasonNumber: 1, episodeNumber: 2 } },
      { id: 4, eventType: 'downloadFolderImported', date: '2024-02-02T01:00:00Z', sourceTitle: 'Harbor.Watch.S01E02-GROUP', downloadId: 'dl-e02', episode: { seasonNumber: 1, episodeNumber: 2 } },
      { id: 5, eventType: 'grabbed', date: '2024-02-03T00:00:00Z', sourceTitle: 'Harbor.Watch.S01.PACK-GROUP', downloadId: 'dl-pack', episode: { seasonNumber: 1, episodeNumber: 5 } },
      { id: 6, eventType: 'downloadFolderImported', date: '2024-02-03T01:00:00Z', sourceTitle: 'Harbor.Watch.S01.PACK-GROUP', downloadId: 'dl-pack', episode: { seasonNumber: 1, episodeNumber: 5 } },
      { id: 7, eventType: 'grabbed', date: '2024-02-03T00:00:00Z', sourceTitle: 'Harbor.Watch.S01.PACK-GROUP', downloadId: 'dl-pack', episode: { seasonNumber: 1, episodeNumber: 6 } },
      { id: 8, eventType: 'downloadFailed', date: '2024-02-03T02:00:00Z', sourceTitle: 'Harbor.Watch.S01.PACK-GROUP', downloadId: 'dl-pack', episode: { seasonNumber: 1, episodeNumber: 6 } },
    ],
  },
};

/** The group header's own label/outcome spans, isolated from the identical
 * classes every nested per-event row also uses -- the header's are always
 * first in document order. */
const headerLabel = (group: Locator) => group.locator('span.font-medium.text-fog-300').first();
const headerOutcome = (group: Locator) => group.locator('span.shrink-0.text-fog-500').first();

test('history groups attempts by episode, not blindly across a whole series -- and shows a mixed season-pack outcome', async ({ browser }) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-history-edge-'));
  const upstreams = {
    radarr: await startUpstream(radarrRoutes),
    sonarr: await startUpstream(sonarrRoutes),
    seerr: await startUpstream(seerrRoutes),
  };
  const password = 'history-edge-test-password';

  try {
    const { base, stop } = await spawnServer({
      DATA_DIR: dataDir,
      TZ: 'UTC',
      RADARR_URL: upstreams.radarr.url,
      RADARR_API_KEY: 'radarr-key',
      SONARR_URL: upstreams.sonarr.url,
      SONARR_API_KEY: 'sonarr-key',
      SEERR_URL: upstreams.seerr.url,
      SEERR_API_KEY: 'seerr-key',
      ADMIN_PASSWORD: password,
    });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(base);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Unlock' }).click();
      await page.goto(`${base}/#/requests`);

      // --- Movie: a stale, unresolved grab reads "outcome unknown," only
      // the job matching the live queue reads "in progress". ---
      const movieCard = page.locator('article', { hasText: 'Ghost Ridge' });
      await expect(movieCard).toBeVisible();
      await movieCard.getByRole('button', { name: /history/i }).click();

      const ancient = movieCard.locator('li', { hasText: 'Attempt 1' });
      await expect(headerOutcome(ancient)).toHaveText('Outcome unknown');

      const current = movieCard.locator('li', { hasText: 'Attempt 2' });
      await expect(headerOutcome(current)).toHaveText('In progress');

      // --- TV: two different single-episode downloads must not be
      // numbered as if one were a retry of the other. ---
      const tvCard = page.locator('article', { hasText: 'Harbor Watch' });
      await expect(tvCard).toBeVisible();
      await tvCard.getByRole('button', { name: /history/i }).click();

      const e01 = tvCard.locator('li', { hasText: 'S01E01' });
      await expect(headerLabel(e01)).toHaveText('S01E01');
      await expect(headerOutcome(e01)).toHaveText('Imported');

      const e02 = tvCard.locator('li', { hasText: 'S01E02' });
      await expect(headerLabel(e02)).toHaveText('S01E02');
      await expect(headerOutcome(e02)).toHaveText('Imported');

      // Neither carries an "Attempt" label -- they're unrelated downloads,
      // not two tries at the same thing.
      await expect(e01.getByText(/Attempt/)).toHaveCount(0);
      await expect(e02.getByText(/Attempt/)).toHaveCount(0);

      // --- A season-pack job covering two episodes: both show up (not
      // just the first), formatted as a contiguous range, and the outcome
      // reflects that one half imported while the other failed. ---
      const pack = tvCard.locator('li', { hasText: 'S01E05-06' });
      await expect(headerLabel(pack)).toHaveText('S01E05-06');
      await expect(headerOutcome(pack)).toHaveText('Partly imported');

      await context.close();
    } finally {
      await stop();
    }
  } finally {
    await Promise.all(Object.values(upstreams).map((u) => u.close()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
