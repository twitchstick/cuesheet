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
