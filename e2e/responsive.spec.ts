import { test, expect } from '@playwright/test';

// Sidebar (desktop) and MobileNav (phone) are two separate elements always
// present in the DOM, switched by a CSS breakpoint rather than conditional
// rendering -- so "the right one is visible" is a real thing to check, not
// implied by the content assertions in dashboard.spec.ts.
test('shows the matching nav for this viewport, not both', async ({ page }, testInfo) => {
  await page.goto('/');
  const isMobile = testInfo.project.name === 'Mobile Chrome';
  const sidebar = page.locator('aside');
  const mobileNav = page.locator('nav.scroll-row');

  if (isMobile) {
    await expect(sidebar).toBeHidden();
    await expect(mobileNav).toBeVisible();
  } else {
    await expect(sidebar).toBeVisible();
    await expect(mobileNav).toBeHidden();
  }
});

test('no horizontal overflow on the overview page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nova')).toBeVisible(); // wait for real content, not just the shell
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // 1px of rounding slack
});

test('no horizontal overflow on the full-page Downloads trace', async ({ page }) => {
  await page.goto('/#/queue');
  await expect(page.getByText('Ember & Ash')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

// A real narrow phone (360-390px, the low end of what's actually out there)
// rather than whichever device happens to be configured above -- a tighter
// bound to catch a layout that only overflows once text is long *and* the
// viewport is this tight.
test('no horizontal overflow on the overview page at a narrow phone width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByText('Nova')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the mobile nav strip keeps the active tab in view, no manual scroll back needed', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const nav = page.locator('nav.scroll-row');
  const overviewTab = nav.getByRole('button', { name: 'Overview' });
  const settingsTab = nav.getByRole('button', { name: 'Settings' });

  // Push the strip's scroll position away from the start, the way it'd end
  // up after scrolling to reach a tab further along -- then change the
  // route by setting the hash directly (a real in-page hashchange, not a
  // fresh page load, and not a click on the strip itself, which Playwright
  // would scroll into view on its own) so only the component's own effect
  // can be responsible for bringing the new tab into view.
  await nav.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(overviewTab).not.toBeInViewport();

  await page.evaluate(() => window.location.assign('#/queue'));
  await expect(nav.getByRole('button', { name: 'Downloads' })).toBeInViewport();

  await page.evaluate(() => window.location.assign('#/setup'));
  await expect(settingsTab).toBeInViewport();

  await page.evaluate(() => window.location.assign('#/'));
  await expect(overviewTab).toBeInViewport();
});
