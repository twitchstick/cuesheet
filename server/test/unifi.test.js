import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { liveStats, liveTarget, networkStats, probe } from '../services/unifi.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

const cfg = { url: 'https://api.ui.com', apiKey: 'ui-key', siteId: 'site-2' };
afterEach(restoreFetch);

const sites = {
  data: [
    { siteId: 'site-1', meta: { desc: 'Office' }, statistics: { counts: { offlineGatewayDevice: 0 } } },
    { siteId: 'site-2', hostId: 'udm-pro', meta: { desc: 'Home', name: 'default' }, statistics: { percentages: { wanUptime: 100 } } },
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

describe('UniFi live statistics', () => {
  test('prefers a directly configured UDM Pro for live gateway discovery', async () => {
    const calls = mockFetch([
      jsonRes({ data: [{ id: 'local-default', internalReference: 'default', name: 'Default' }] }),
      jsonRes({ data: [{ id: 'gateway-1', name: 'UDM Pro', features: ['gateway'], state: 'ONLINE' }] }),
    ]);
    const target = await liveTarget({
      ...cfg,
      localUrl: 'https://192.168.1.1',
      localApiKey: 'local-key',
      allowSelfSigned: true,
    });
    assert.equal(target.local, true);
    assert.equal(target.name, 'UDM Pro');
    assert.match(target.url, /^https:\/\/192\.168\.1\.1\/proxy\/network\/integration\/v1\/sites\/local-default/);
    assert.equal(calls[0].init.headers['X-API-Key'], 'local-key');
    assert.ok(calls[0].init.dispatcher, 'self-signed requests use a scoped dispatcher');
  });

  test('recognizes an integrated UDM when its Network version omits the gateway feature flag', async () => {
    mockFetch([
      jsonRes({ data: [{ id: 'local-default', internalReference: 'default', name: 'Default' }] }),
      jsonRes({ data: [
        { id: 'ap-1', name: 'Hall AP', model: 'U7PRO', features: ['accessPoint'], state: 'ONLINE' },
        { id: 'gateway-1', name: 'UDM Roosevelt', model: 'UDMPRO', features: ['switching'], state: 'ONLINE' },
      ] }),
    ]);
    const target = await liveTarget({ ...cfg, localUrl: 'https://192.168.1.1', localApiKey: 'local-key', allowSelfSigned: true });
    assert.equal(target.name, 'UDM Roosevelt');
    assert.match(target.url, /devices\/gateway-1\/statistics\/latest$/);
  });

  test('accepts the object-shaped gateway feature returned by richer device payloads', async () => {
    mockFetch([
      jsonRes({ data: [{ id: 'local-default' }] }),
      jsonRes({ data: [{ id: 'gateway-1', name: 'Router', features: { gateway: {} }, state: 'ONLINE' }] }),
    ]);
    const target = await liveTarget({ ...cfg, localUrl: 'https://192.168.1.1', localApiKey: 'local-key' });
    assert.equal(target.name, 'Router');
  });

  test('discovers the selected console site and its gateway', async () => {
    mockFetch([
      jsonRes(sites),
      jsonRes({ data: [{ id: 'local-default', internalReference: 'default', name: 'Default' }] }),
      jsonRes({ data: [
        { id: 'ap-1', name: 'AP', features: ['accessPoint'], state: 'ONLINE' },
        { id: 'gateway-1', name: 'UDM Pro', features: ['gateway', 'switching'], state: 'ONLINE' },
      ] }),
    ]);
    const target = await liveTarget(cfg);
    assert.equal(target.name, 'UDM Pro');
    assert.match(target.url, /connector\/consoles\/udm-pro\/network\/integration\/v1\/sites\/local-default\/devices\/gateway-1\/statistics\/latest$/);
  });

  test('converts real-time uplink bits per second to the dashboard kbps unit', async () => {
    mockFetch(jsonRes({ uplink: { rxRateBps: 42_600_000, txRateBps: 5_250_000 }, lastHeartbeatAt: '2026-09-07T12:00:00Z' }));
    const result = await liveStats(cfg, { url: 'https://api.ui.com/live', name: 'UDM Pro' });
    assert.deepEqual(result, {
      gateway: 'UDM Pro',
      downloadKbps: 42_600,
      uploadKbps: 5_250,
      observedAt: '2026-09-07T12:00:00Z',
    });
  });

  test('uses the local key for a directly discovered gateway reading', async () => {
    const calls = mockFetch(jsonRes({ uplink: { rxRateBps: 1_000_000, txRateBps: 500_000 } }));
    await liveStats({ ...cfg, localApiKey: 'local-key', allowSelfSigned: true }, { url: 'https://192.168.1.1/live', name: 'UDM Pro', local: true });
    assert.equal(calls[0].init.headers['X-API-Key'], 'local-key');
    assert.ok(calls[0].init.dispatcher, 'self-signed requests use a scoped dispatcher');
  });
});
