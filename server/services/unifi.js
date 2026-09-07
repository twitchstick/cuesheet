import { fetchJson } from '../http.js';

const clean = (value) => String(value ?? '').trim().replace(/\/+$/, '');
const headers = (apiKey) => ({ 'X-API-Key': apiKey });
const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function siteList(payload) {
  if (!Array.isArray(payload?.data)) throw new Error('UniFi returned an unexpected sites response');
  return payload.data
    .map((site) => ({
      id: String(site?.siteId ?? ''),
      name: String(site?.meta?.desc || site?.meta?.name || 'UniFi site'),
      hostId: String(site?.hostId ?? ''),
      internalReference: String(site?.meta?.name ?? ''),
      statistics: site?.statistics ?? {},
    }))
    .filter((site) => site.id);
}

const connectorRoot = (url, hostId) => `${clean(url)}/v1/connector/consoles/${encodeURIComponent(hostId)}/network/integration`;

/** Discover the official real-time statistics endpoint for the chosen site's gateway. */
export async function liveTarget({ url, apiKey, siteId }) {
  const availableSites = await sites({ url, apiKey });
  if (!availableSites.length) throw new Error('No UniFi sites are available to this API key');
  const selected = availableSites.find((site) => site.id === siteId) ?? availableSites[0];
  if (!selected.hostId) throw new Error('UniFi did not report a console for this site');

  const root = connectorRoot(url, selected.hostId);
  const requestHeaders = headers(apiKey);
  const localSitesPayload = await fetchJson(`${root}/v1/sites?limit=200`, { headers: requestHeaders, timeoutMs: 10_000 });
  const localSites = Array.isArray(localSitesPayload?.data) ? localSitesPayload.data : [];
  const localSite = localSites.find((site) => site?.internalReference === selected.internalReference) ?? localSites[0];
  if (!localSite?.id) throw new Error('No local Network site is available for this UniFi console');

  const devicesPayload = await fetchJson(`${root}/v1/sites/${encodeURIComponent(localSite.id)}/devices?limit=200`, { headers: requestHeaders, timeoutMs: 10_000 });
  const devices = Array.isArray(devicesPayload?.data) ? devicesPayload.data : [];
  const gateways = devices.filter((device) => Array.isArray(device?.features) && device.features.includes('gateway'));
  const gateway = gateways.find((device) => device?.state === 'ONLINE') ?? gateways[0];
  if (!gateway?.id) throw new Error('No UniFi gateway was found at this site');

  return {
    url: `${root}/v1/sites/${encodeURIComponent(localSite.id)}/devices/${encodeURIComponent(gateway.id)}/statistics/latest`,
    name: String(gateway.name || gateway.model || 'UniFi gateway'),
  };
}

/** The Network API reports current gateway uplink rates in bits per second. */
export async function liveStats({ apiKey }, target) {
  const payload = await fetchJson(target.url, { headers: headers(apiKey), timeoutMs: 8_000 });
  return {
    gateway: target.name,
    downloadKbps: finite(payload?.uplink?.rxRateBps) === null ? null : finite(payload.uplink.rxRateBps) / 1000,
    uploadKbps: finite(payload?.uplink?.txRateBps) === null ? null : finite(payload.uplink.txRateBps) / 1000,
    observedAt: payload?.lastHeartbeatAt ?? new Date().toISOString(),
  };
}

export async function sites({ url, apiKey }) {
  const payload = await fetchJson(`${clean(url)}/v1/sites?pageSize=100`, { headers: headers(apiKey), timeoutMs: 10_000 });
  return siteList(payload);
}

function metricFor(payload, siteId) {
  const groups = Array.isArray(payload?.data) ? payload.data : [];
  return groups.find((group) => String(group?.siteId ?? '') === siteId) ?? null;
}

function periods(group) {
  return (Array.isArray(group?.periods) ? group.periods : [])
    .filter((period) => period?.data?.wan && period?.metricTime)
    .sort((a, b) => String(a.metricTime).localeCompare(String(b.metricTime)));
}

function siteOnline(site, latestWan) {
  const uptime = finite(latestWan?.uptime);
  if (uptime !== null) return uptime > 0;
  const counts = site.statistics?.counts ?? {};
  if (finite(counts.offlineGatewayDevice) !== null) return Number(counts.offlineGatewayDevice) === 0;
  const wanUptime = finite(site.statistics?.percentages?.wanUptime);
  return wanUptime === null ? null : wanUptime > 0;
}

/**
 * Read WAN health and rate samples from Ubiquiti's official Site Manager API.
 * The seven-day totals integrate each documented one-hour average rate:
 * kbps * 1,000 bits * 3,600 seconds / 8 = bytes transferred.
 */
export async function networkStats({ url, apiKey, siteId }) {
  const base = clean(url);
  const requestHeaders = headers(apiKey);
  const [sitePayload, recentPayload, weekPayload] = await Promise.all([
    fetchJson(`${base}/v1/sites?pageSize=100`, { headers: requestHeaders, timeoutMs: 10_000 }),
    fetchJson(`${base}/ea/isp-metrics/5m?duration=24h`, { headers: requestHeaders, timeoutMs: 10_000 }),
    fetchJson(`${base}/ea/isp-metrics/1h?duration=7d`, { headers: requestHeaders, timeoutMs: 10_000 }),
  ]);

  const availableSites = siteList(sitePayload);
  if (!availableSites.length) throw new Error('No UniFi sites are available to this API key');
  const selected = availableSites.find((site) => site.id === siteId) ?? availableSites[0];
  const recent = periods(metricFor(recentPayload, selected.id));
  const weekly = periods(metricFor(weekPayload, selected.id));
  const latest = recent.at(-1) ?? weekly.at(-1) ?? null;
  const latestWan = latest?.data?.wan ?? null;

  const hourlyBytes = (key) => weekly.reduce((sum, period) => sum + (finite(period.data.wan?.[key]) ?? 0) * 1000 * 3600 / 8, 0);
  return {
    site: { id: selected.id, name: selected.name },
    online: siteOnline(selected, latestWan),
    downloadKbps: finite(latestWan?.download_kbps),
    uploadKbps: finite(latestWan?.upload_kbps),
    metricTime: latest?.metricTime ?? null,
    transfer: {
      downloadBytes: Math.round(hourlyBytes('download_kbps')),
      uploadBytes: Math.round(hourlyBytes('upload_kbps')),
      sampleCount: weekly.length,
    },
  };
}

export async function probe(options) {
  const availableSites = await sites(options);
  if (!availableSites.length) throw new Error('No UniFi sites are available to this API key');
  return {
    ok: true,
    name: availableSites.length === 1 ? availableSites[0].name : 'UniFi Site Manager',
    version: null,
    sites: availableSites.map(({ id, name }) => ({ id, name })),
  };
}
