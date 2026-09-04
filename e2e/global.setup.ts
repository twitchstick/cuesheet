import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

// Runs once before the real specs (see the "setup" project + `dependencies`
// in playwright.config.ts): logs into the fixture server's admin password
// and saves the resulting session cookie, so every other spec in this run
// starts already authenticated -- matching the whole-app gate being on for
// the whole e2e run. auth.spec.ts deliberately overrides storageState back
// to logged-out to test the gate and the login flow themselves.
setup('log in once for the whole run', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Password').fill('e2e-test-password-1');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Nova')).toBeVisible(); // proves it actually got past the gate, not just that the form submitted
  await page.context().storageState({ path: AUTH_FILE });
});
