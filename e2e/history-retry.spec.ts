/**
 * Runs against its own isolated server + upstreams (its own real child
 * process -- see spawnServer.ts for why a dynamic import() sharing this
 * worker's own process isn't enough), rather than the shared fixture
 * server every other e2e spec uses -- Radarr's history endpoint here needs
 * to fail exactly once and then recover, and doing that on the shared,
 * order-independent, two-worker fixture server would risk another test's
 * own history click landing on the "failed" call instead of this one's.
 */
import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startUpstream } from '../server/test/integration/upstream.js';
import { radarrRoutes, seerrRoutes } from '../server/test/integration/fixtures.js';
import { spawnServer } from './support/spawnServer.js';

test('a failed history fetch offers Retry, which recovers instead of staying broken forever', async ({ browser }) => {
  let historyCalls = 0;
  const flakyRadarrRoutes = {
    ...radarrRoutes,
    // Fails exactly once -- proves Retry actually re-fetches, not just
    // that a permanently-broken Radarr would somehow still show history.
    'GET /api/v3/history/movie': () => {
      historyCalls += 1;
      if (historyCalls === 1) return { status: 503, body: { message: 'Radarr is restarting' } };
      return radarrRoutes['GET /api/v3/history/movie'];
    },
  };

  const dataDir = mkdtempSync(path.join(tmpdir(), 'cuesheet-history-retry-'));
  const upstreams = {
    radarr: await startUpstream(flakyRadarrRoutes),
    seerr: await startUpstream(seerrRoutes),
  };
  const password = 'history-retry-test-password';

  try {
    const { base, stop } = await spawnServer({
      DATA_DIR: dataDir,
      TZ: 'UTC',
      RADARR_URL: upstreams.radarr.url,
      RADARR_API_KEY: 'radarr-key',
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

      const card = page.locator('article', { hasText: 'Ember & Ash' });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: /history/i }).click();

      const errorPara = card.locator('p', { hasText: 'responded 503' });
      await expect(errorPara).toBeVisible();

      const retryButton = card.getByRole('button', { name: 'Retry' });
      await retryButton.click();

      // Recovered: Radarr's real history (from fixtures.js) plus the
      // request's own start, exactly like a normal successful open.
      const list = card.locator('ul');
      await expect(list.getByText('Grabbed').first()).toBeVisible();
      await expect(list.getByText('by Riley')).toBeVisible();
      expect(historyCalls).toBe(2);

      await context.close();
    } finally {
      await stop();
    }
  } finally {
    await Promise.all(Object.values(upstreams).map((u) => u.close()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
