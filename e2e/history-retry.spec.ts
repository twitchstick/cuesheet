/**
 * Runs against its own isolated server + upstreams (same isolation
 * philosophy as server/test/integration/lifecycle-seerr-down.test.js),
 * rather than the shared fixture server every other e2e spec uses --
 * Radarr's history endpoint here needs to fail exactly once and then
 * recover, and doing that on the shared, order-independent, two-worker
 * fixture server would risk another test's own history click landing on
 * the "failed" call instead of this one's.
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startUpstream } from '../server/test/integration/upstream.js';
import { radarrRoutes, seerrRoutes } from '../server/test/integration/fixtures.js';

// Only this spec touches process.env / imports server/index.js directly --
// every other one talks to the shared fixture server over HTTP -- but
// Playwright reuses worker processes across spec files, so these are
// restored regardless of outcome rather than left to leak into whatever
// runs next in this worker.
const ENV_KEYS = ['DATA_DIR', 'TZ', 'RADARR_URL', 'RADARR_API_KEY', 'SEERR_URL', 'SEERR_API_KEY', 'ADMIN_PASSWORD'] as const;

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
  let server: http.Server | undefined;
  const previousEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  try {
    process.env.DATA_DIR = dataDir;
    process.env.TZ = 'UTC';
    process.env.RADARR_URL = upstreams.radarr.url;
    process.env.RADARR_API_KEY = 'radarr-key';
    process.env.SEERR_URL = upstreams.seerr.url;
    process.env.SEERR_API_KEY = 'seerr-key';
    process.env.ADMIN_PASSWORD = password;

    // A fresh import would just hit Node's module cache and reuse the
    // already-running shared server's config/cache singletons -- appending
    // a cache-busting query string forces a real second evaluation of
    // server/index.js (and everything it imports) against the env vars
    // just set above.
    const { app } = await import(`${pathToFileURL(path.resolve('server/index.js')).href}?instance=history-retry`);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

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
    if (server) await new Promise((resolve) => server!.close(resolve));
    await Promise.all(Object.values(upstreams).map((u) => u.close()));
    rmSync(dataDir, { recursive: true, force: true });
    for (const k of ENV_KEYS) {
      if (previousEnv[k] === undefined) delete process.env[k];
      else process.env[k] = previousEnv[k];
    }
  }
});
