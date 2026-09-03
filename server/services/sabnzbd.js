import { fetchJson } from '../http.js';

// SABnzbd takes its key as a query parameter, not a header -- the one
// service here that works that way.
const params = (cfg, extra) => new URLSearchParams({ apikey: cfg.apiKey, output: 'json', ...extra });

/** Current throughput, paused state, and free space on the download volume. */
export async function stats(cfg) {
  const data = await fetchJson(`${cfg.url}/api?${params(cfg, { mode: 'queue' })}`);
  // A bad key, or SABnzbd being mid-restart, comes back as 200 OK with an
  // error body rather than an HTTP error -- don't read that as "idle."
  if (data?.error) throw new Error(data.error);
  const q = data?.queue ?? {};
  // kbpersec is kilobytes/sec; the rest of the app works in kilobits/sec.
  const kBps = Number(q.kbpersec);
  const diskFreeGb = Number(q.diskspace1);
  return {
    speedKbps: Number.isFinite(kBps) && kBps > 0 ? Math.round(kBps * 8) : null,
    paused: Boolean(q.paused),
    diskFreeGb: Number.isFinite(diskFreeGb) && diskFreeGb > 0 ? Math.round(diskFreeGb * 10) / 10 : null,
  };
}
