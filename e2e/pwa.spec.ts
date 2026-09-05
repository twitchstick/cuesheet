import { test, expect } from '@playwright/test';

// The one thing that actually matters here: a service worker must never
// turn this into a dashboard that quietly shows yesterday's "now playing."
// Everything below either proves the worker installs at all, or proves the
// specific thing that would make it dangerous -- serving /api/* from cache
// -- can't happen.

test('the manifest is linked and describes an installable, standalone app', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const manifest = await page.evaluate(async (manifestHref) => {
    const res = await fetch(manifestHref!);
    return res.json();
  }, href);
  expect(manifest.name).toBe('Cuesheet');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});

test('a service worker registers and takes control', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15_000 });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
  expect(scope).toContain('127.0.0.1:4173');
});

test('an API request is never served from the service worker\'s cache, even once one is installed', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15_000 });

  // Same live check /api/health always answers -- if the worker ever
  // intercepted this instead of passing it straight to the network, a
  // second call would risk coming back from a cache instead of the server.
  const first = await page.evaluate(() => fetch('/api/health').then((r) => r.json()));
  const second = await page.evaluate(() => fetch('/api/health').then((r) => r.json()));
  expect(first).toEqual({ ok: true });
  expect(second).toEqual({ ok: true });

  // The precache manifest baked into the worker itself must not name a
  // single /api/ URL -- the actual guarantee, not just an inference from
  // two requests happening to succeed.
  const precachedApiUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) urls.push(req.url);
    }
    return urls.filter((u) => u.includes('/api/'));
  });
  expect(precachedApiUrls).toEqual([]);
});
