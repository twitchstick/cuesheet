import { test, expect } from '@playwright/test';

// Runs against both projects in playwright.config.ts (Desktop Chrome, Mobile
// Chrome) -- everything here holds at both widths. Viewport-specific layout
// assertions (which nav variant is visible, no horizontal overflow) live in
// responsive.spec.ts, branched by test.info().project.name.

test('loads the dashboard with data from every configured service', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Cuesheet');
  // A live Plex session from the fixture -- proves /api/streams round-tripped
  // through the real proxy route, not just that the shell rendered.
  await expect(page.getByText('Nova')).toBeVisible();
});

test('Downloads (#/queue) shows the full signal trace for every queue item, matched and orphaned alike', async ({ page }) => {
  await page.goto('/#/queue');
  await expect(page.getByText('Download queue')).toBeVisible();
  // Matched to their Seerr requests via Radarr/Sonarr...
  await expect(page.getByText('Ember & Ash')).toBeVisible();
  await expect(page.getByText('Second Sun')).toBeVisible();
  // ...and the orphaned Radarr queue row with no matching request.
  await expect(page.getByText('Redline')).toBeVisible();
});

test('Requests (#/requests) traces only the items that came from a Seerr request', async ({ page }) => {
  await page.goto('/#/requests');
  await expect(page.getByText('Ember & Ash')).toBeVisible();
  await expect(page.getByText('Second Sun')).toBeVisible();
  // The orphan belongs to Downloads, not here -- it never went through Seerr.
  await expect(page.getByText('Redline')).not.toBeVisible();
});

// Release Calendar isn't covered here: its default window is "this week,
// relative to whenever the test runs," which the fixed-date fixtures
// (server/test/integration/fixtures.js) can't line up with deterministically
// -- that route's own logic is already covered by the integration test
// (server/test/integration/api.test.js), with an explicit date range.
