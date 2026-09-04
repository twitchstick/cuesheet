import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Some sandboxes pre-fetch Chromium to this fixed path, pinned to whatever
// revision happens to be cached there rather than whatever the installed
// @playwright/test expects -- pointing at it directly there sidesteps a
// version mismatch (and that sandbox's lack of network to fetch its own
// browser). Elsewhere -- a normal dev machine, a GitHub Actions runner
// after `npx playwright install --with-deps chromium` -- this path simply
// doesn't exist, so `executablePath` is left undefined and Playwright
// resolves its own browser exactly as it would by default.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The HTML report only matters when something failed and a person needs
  // to see why -- CI uploads it as an artifact (see checks.yml) rather than
  // opening it, which is why it's paired with `open: 'never'`.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  // The client must already be built (`npm run build`) -- this only starts
  // the server half, against the same fake upstreams the integration test
  // uses, so the dashboard has real requests/queue/streams to render.
  webServer: {
    command: 'node e2e/fixture-server.mjs',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
  ],
});
