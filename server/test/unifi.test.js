import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { networkStats, probe } from '../services/unifi.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'https://api.ui.com', apiKey: 'ui-key', siteId: 'site-2' };
afterEach(restoreFetch);

const sites = {
  data: [
    { siteId: 'site-1', meta: { desc: 'Office' }, statistics: { counts: { offlineGatewayDevice: 0 } } },
    { siteId: 'site-2', meta: { desc: 'Home' }, statistics: { percentages: { wanUptime: 100 } } },
  ],
};

describe('UniFi probe', () => {
  test('returns the sites available to the API key', async () => {
    const calls = mockFetch(jsonRes(sites));
    const result = await probe(cfg);
    assert.deepEqual(result.sites, [{ id: 'site-1', name: 'Office' }, { id: 'site-2', name: 'Home' }]);
    assert.equal(calls[0].init.headers['X-API-Key'], 'ui-key');
  });

  test('rejects a valid response with no accessible sites', async () => {
    mockFetch(jsonRes({ data: [] }));
    await assert.rejects(() => probe(cfg), /No UniFi sites/);
  });
});

describe('UniFi network statistics', () => {
  test('selects the configured site and integrates hourly rates into transferred bytes', async () => {
    const recent = {
      data: [{ siteId: 'site-2', periods: [
        { metricTime: '2026-09-07T12:00:00Z', data: { wan: { download_kbps: 12000, upload_kbps: 2500, uptime: 100 } } },
      ] }],
    };
    const week = {
      data: [{ siteId: 'site-2', periods: [
        { metricTime: '2026-09-07T10:00:00Z', data: { wan: { download_kbps: 8000, upload_kbps: 1000 } } },
        { metricTime: '2026-09-07T11:00:00Z', data: { wan: { download_kbps: 4000, upload_kbps: 500 } } },
      ] }],
    };
    mockFetch([jsonRes(sites), jsonRes(recent), jsonRes(week)]);
    const result = await networkStats(cfg);
    assert.deepEqual(result.site, { id: 'site-2', name: 'Home' });
    assert.equal(result.online, true);
    assert.equal(result.downloadKbps, 12000);
    assert.equal(result.uploadKbps, 2500);
    assert.equal(result.transfer.downloadBytes, 5_400_000_000);
    assert.equal(result.transfer.uploadBytes, 675_000_000);
    assert.equal(result.transfer.sampleCount, 2);
  });

  test('reports offline from the latest sample and falls back to the first site', async () => {
    const recent = { data: [{ siteId: 'site-1', periods: [{ metricTime: '2026-09-07T12:00:00Z', data: { wan: { download_kbps: 0, upload_kbps: 0, uptime: 0 } } }] }] };
    const week = { data: [{ siteId: 'site-1', periods: [] }] };
    mockFetch([jsonRes(sites), jsonRes(recent), jsonRes(week)]);
    const result = await networkStats({ ...cfg, siteId: 'missing' });
    assert.equal(result.site.id, 'site-1');
    assert.equal(result.online, false);
    assert.equal(result.downloadKbps, 0);
  });
});
