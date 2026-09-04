import { test, expect } from '@playwright/test';

// The global setup project logs every other spec in before it starts (see
// playwright.config.ts's `dependencies` + `storageState`) -- this file is
// the deliberate exception, testing the gate and the login/logout flow
// themselves, so it needs to start from nothing.
test.use({ storageState: { cookies: [], origins: [] } });

test('a locked instance shows the login screen, not the dashboard, and refuses a wrong password', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();
  await expect(page.getByText('Nova')).not.toBeVisible(); // nothing from the dashboard has leaked through

  await page.getByLabel('Password').fill('the-wrong-password');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText(/incorrect/i)).toBeVisible();
  await expect(page.getByText('Nova')).not.toBeVisible();
});

test('the correct password unlocks the dashboard, and logging out locks it again', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Password').fill('e2e-test-password-1');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Nova')).toBeVisible();

  await page.getByTitle('Log out').click();
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();
  await expect(page.getByText('Nova')).not.toBeVisible();
});

test('a gated API route is refused directly, not just hidden client-side', async ({ request }) => {
  // request context here still carries this test's own (logged-out) storageState.
  const res = await request.get('/api/streams');
  expect(res.status()).toBe(401);
});
