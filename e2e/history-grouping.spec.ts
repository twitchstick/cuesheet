import { test, expect } from '@playwright/test';
import { groupHistory, type HistoryRow } from '../client/src/lib/historyGrouping';

const row = (id: string, type: HistoryRow['type'], at: number, episodeCode: string): HistoryRow =>
  ({ id, type, at, episodeCode, downloadId: 'pack' });
const previous: HistoryRow = { id: 'old', type: 'failed', at: 0, downloadId: 'old' };

test('a pack stays partly imported while another episode is unresolved', () => {
  const events = [previous, row('1', 'grabbed', 1, 'S01E01'), row('2', 'imported', 2, 'S01E01'), row('3', 'grabbed', 1, 'S01E02')];
  const result = groupHistory(events, 'pack').find((entry) => entry.kind === 'attempt' && entry.downloadId === 'pack');
  expect(result).toMatchObject({ outcome: 'mixed', episodeCodes: ['S01E01', 'S01E02'] });
  events.push(row('4', 'imported', 3, 'S01E02'));
  expect(groupHistory(events, null).find((entry) => entry.kind === 'attempt' && entry.downloadId === 'pack')).toMatchObject({ outcome: 'imported' });
});

test('a successful retry of an episode resolves its earlier failure', () => {
  const events = [previous, row('1', 'failed', 1, 'S01E01'), row('2', 'imported', 2, 'S01E01')];
  expect(groupHistory(events, null).find((entry) => entry.kind === 'attempt' && entry.downloadId === 'pack')).toMatchObject({ outcome: 'imported' });
});

test('a replacement job refreshes open history even when its status is unchanged', async ({ page }) => {
  let replacement = false;
  let freshCalls = 0;
  await page.route('**/api/lifecycle', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.items = data.items.map((item: { title: string; activeDownloadId: string }) =>
      item.title === 'Ember & Ash' ? { ...item, activeDownloadId: replacement ? 'replacement-job' : 'original-job' } : item);
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/lifecycle/history?*', async (route) => {
    const fresh = new URL(route.request().url()).searchParams.get('fresh') === '1';
    if (fresh) freshCalls++;
    await route.fulfill({ json: { items: [{ id: 'grab', type: 'grabbed', at: 1, release: fresh ? 'Replacement release' : 'Original release', downloadId: fresh ? 'replacement-job' : 'original-job' }] } });
  });
  await page.goto('/#/requests');
  const card = page.locator('article', { hasText: 'Ember & Ash' });
  await card.getByRole('button', { name: /history/i }).click();
  await expect(card.getByText('Original release')).toBeVisible();
  replacement = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(card.getByText('Replacement release')).toBeVisible();
  expect(freshCalls).toBeGreaterThan(0);
});
