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

test('switching the week fetches the new range immediately, not on the next 15-minute poll', async ({ page }, testInfo) => {
  // App.tsx hides the week calendar below md on the overview page entirely
  // (the full Calendar tab is its mobile equivalent) -- nothing to click here.
  test.skip(testInfo.project.name === 'Mobile Chrome', 'the week calendar is desktop-only on the overview page');
  const calendarRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/calendar')) calendarRequests.push(req.url());
  });
  await page.goto('/');
  await expect(page.getByText('Coming this week')).toBeVisible();
  await expect.poll(() => calendarRequests.length).toBeGreaterThan(0);
  const initialStart = new URL(calendarRequests[0]).searchParams.get('start');

  await page.getByLabel('Next week').click();
  // usePoll's own effect used to only re-run on its interval/enabled deps,
  // not the fetcher itself -- a new week range would sit unfetched for up
  // to 15 minutes even though the header above already moved on. Polling
  // for a prompt new request (well under that interval) is exactly what
  // that regression would fail.
  await expect.poll(() => calendarRequests.length, { timeout: 5000 }).toBeGreaterThan(1);

  const latestStart = new URL(calendarRequests[calendarRequests.length - 1]).searchParams.get('start');
  expect(latestStart).not.toBe(initialStart);
});

test('Recently requested (overview) opens Requests on click, not a per-item detail panel', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('section', { hasText: 'Recently requested' });
  await expect(section.getByText('Ember & Ash')).toBeVisible();

  await section.getByRole('button', { name: /Ember & Ash/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  // Landed on the Requests tab -- the full trace, not a media detail panel.
  await expect(page).toHaveURL(/#\/requests$/);
  await expect(page.getByText('What the house has asked for, traced from ask to available')).toBeVisible();
});

test('Recently added\'s title (overview) opens its own full page, not a detail panel', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('section', { hasText: 'Recently added' });
  await section.getByRole('button', { name: 'Recently added' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/#\/recent$/);
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

test('a trace card\'s History expands in place without opening the detail panel', async ({ page }) => {
  // Downloads (unlike Requests) renders the whole trace card as one
  // clickable button that opens the detail panel -- exactly where History's
  // own click has to stay contained, or it'd open the panel instead of
  // just expanding.
  await page.goto('/#/queue');
  const card = page.locator('article', { hasText: 'Ember & Ash' });
  await expect(card.getByText('Grabbed')).not.toBeVisible();

  await card.getByRole('button', { name: /history/i }).click();
  // Scoped to the history list, not the card as a whole -- the trace's own
  // stage arc already has its own "Requested" waypoint label above this.
  const history = card.locator('ul');
  // Radarr's own history (fetched on this click) plus the request's own
  // start, which Cuesheet already had -- both present, so the fetch and
  // the merge both actually happened, not just the toggle.
  await expect(history.getByText('Requested', { exact: true })).toBeVisible();
  await expect(history.getByText('by Riley')).toBeVisible();
  await expect(history.getByText('Grabbed').first()).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Clicking the card anywhere else still opens it normally.
  await card.getByText('Ember & Ash', { exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('History groups events sharing a downloadId into numbered attempts', async ({ page }) => {
  // fixtures.js gives Ember & Ash two distinct downloadIds: an old 720p
  // grab that failed, and the current 1080p grab (still downloading, no
  // failed/imported event yet) -- exactly the "attempt 1 failed, attempt 2
  // is still going" case this grouping exists for.
  await page.goto('/#/queue');
  const card = page.locator('article', { hasText: 'Ember & Ash' });
  await card.getByRole('button', { name: /history/i }).click();
  const history = card.locator('ul');

  // Attempt 1's own two events (the old release's grab and its failure) --
  // proves the grouping actually joined them by downloadId, not just that
  // an "Attempt 1" label exists somewhere.
  const attempt1 = history.locator('li', { hasText: 'Attempt 1' });
  await expect(attempt1.getByText('Ember.and.Ash.2023.720p.WEB-DL-OLDGRP')).toBeVisible();
  await expect(attempt1.getByText('Sample')).toBeVisible(); // the failure's own detail

  // Attempt 2 has nothing after its grab yet (still downloading in the
  // fixture) -- "In progress" is unambiguous here since no per-event label
  // ever says that, unlike "Failed"/"Grabbed" which attempt 1's own rows
  // already use.
  const attempt2 = history.locator('li', { hasText: 'Attempt 2' });
  await expect(attempt2.getByText('In progress')).toBeVisible();
  await expect(attempt2.getByText('Ember.and.Ash.2023.1080p.BluRay-GROUP')).toBeVisible();

  // The request's own start isn't part of either download's lifecycle --
  // it stays a standalone row outside both attempt groups.
  await expect(history.getByText('Requested', { exact: true })).toBeVisible();
  await expect(history.getByText('by Riley')).toBeVisible();
});

test('History shows the episode on each attempt group for a TV request', async ({ page }) => {
  await page.goto('/#/queue');
  const card = page.locator('article', { hasText: 'Second Sun' });
  await card.getByRole('button', { name: /history/i }).click();
  const history = card.locator('ul');

  await expect(history.getByText('Attempt 1 · S01E04')).toBeVisible();
  await expect(history.getByText('Attempt 2 · S01E04')).toBeVisible();
});

test('a trace card offers deep links straight to Seerr and Radarr, without opening the detail panel', async ({ page, context }) => {
  await page.goto('/#/queue');
  const card = page.locator('article', { hasText: 'Ember & Ash' });

  const seerrLink = card.getByRole('link', { name: /Open in Seerr/i });
  const radarrLink = card.getByRole('link', { name: /Open in Radarr/i });
  // Seerr's link is built from tmdbId (the request's own field); Radarr's
  // is built from titleSlug, its web UI's own id -- not the numeric
  // Radarr movie id (10, see fixtures.js), which 404s there.
  await expect(seerrLink).toHaveAttribute('href', /\/movie\/10$/);
  await expect(radarrLink).toHaveAttribute('href', /\/movie\/ember-and-ash-2023$/);

  const [popup] = await Promise.all([context.waitForEvent('page'), radarrLink.click()]);
  await popup.close();
  // The card is itself clickable on Downloads -- the link's click must not
  // also bubble up and open the detail panel.
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('a paused download\'s live progress does not keep advancing between polls', async ({ page }) => {
  // Redline (fixtures.js) sits at 50% with a 10s "time left" but a paused
  // status -- chosen so that, without useLiveProgress freezing anything
  // that isn't actually downloading/importing, the interpolated readout
  // would visibly jump (50% -> 60%+) within a couple of real seconds.
  await page.goto('/#/queue');
  const card = page.locator('article', { hasText: 'Redline' });
  const readout = card.locator('p', { hasText: '%' });
  await expect(readout).toBeVisible();

  const before = await readout.textContent();
  await page.waitForTimeout(2500);
  const after = await readout.textContent();
  expect(after).toBe(before);
});

// Release Calendar isn't covered here: its default window is "this week,
// relative to whenever the test runs," which the fixed-date fixtures
// (server/test/integration/fixtures.js) can't line up with deterministically
// -- that route's own logic is already covered by the integration test
// (server/test/integration/api.test.js), with an explicit date range.
