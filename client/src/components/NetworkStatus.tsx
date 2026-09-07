import { Activity, ArrowDown, ArrowUp, CircleAlert, Wifi, WifiOff } from 'lucide-react';
import type { NetworkLiveStats, NetworkStats } from '../types';

interface Props {
  data: NetworkStats | null;
  live: NetworkLiveStats | null;
  error: string | null;
  liveError: string | null;
  loading: boolean;
}

const rate = (kbps: number | null) => {
  if (kbps === null) return '—';
  if (kbps < 1000) return `${Math.round(kbps)} kbps`;
  const mbps = kbps / 1000;
  return `${mbps >= 10 ? Math.round(mbps) : mbps.toFixed(1)} Mbps`;
};

const bytes = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let amount = value;
  let unit = 0;
  while (amount >= 1000 && unit < units.length - 1) {
    amount /= 1000;
    unit += 1;
  }
  const digits = amount >= 100 || unit === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${units[unit]}`;
};

export default function NetworkStatus({ data, live, error, liveError, loading }: Props) {
  const online = data?.online;
  const liveActive = Boolean(live && !liveError);
  const download = liveActive ? live?.downloadKbps ?? null : data?.downloadKbps ?? null;
  const upload = liveActive ? live?.uploadKbps ?? null : data?.uploadKbps ?? null;
  return (
    <section className="animate-rise">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Network</h2>
          <p className="mt-0.5 text-sm text-fog-500">{data?.site.name ?? 'UniFi WAN'}</p>
        </div>
        {error ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-300" title={error}>
            <CircleAlert className="h-3.5 w-3.5" /> UniFi unreachable
          </span>
        ) : (
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${online === true ? 'bg-emerald-400/15 text-emerald-300' : online === false ? 'bg-rose-400/15 text-rose-300' : 'bg-night-700 text-fog-500'}`}>
            {online === false ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
            {online === true ? 'Internet online' : online === false ? 'Internet offline' : loading ? 'Checking internet' : 'Status unknown'}
          </span>
        )}
      </header>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line">
          <Metric icon={<ArrowDown className="h-4 w-4" />} label="Download" value={loading && !data && !live ? 'Checking…' : rate(download)} tone="text-glow" live={liveActive} />
          <Metric icon={<ArrowUp className="h-4 w-4" />} label="Upload" value={loading && !data && !live ? 'Checking…' : rate(upload)} tone="text-accent-300" live={liveActive} />
        </div>
        <div className="border-t border-line bg-night-900/35 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-fog-500" />
            <span className="label">Data transfer · last 7 days</span>
          </div>
          <div className="grid grid-cols-2 gap-4 font-mono text-sm tabular-nums">
            <p><span className="mr-2 text-glow">↓</span>{data ? bytes(data.transfer.downloadBytes) : '—'}</p>
            <p><span className="mr-2 text-accent-300">↑</span>{data ? bytes(data.transfer.uploadBytes) : '—'}</p>
          </div>
          {data && data.transfer.sampleCount < 150 && (
            <p className="mt-2 text-[11px] text-fog-500">Based on {data.transfer.sampleCount} available hourly samples.</p>
          )}
          {liveError && <p className="mt-2 text-[11px] text-amber-300">Live feed unavailable; showing the latest five-minute average.</p>}
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value, tone, live }: { icon: React.ReactNode; label: string; value: string; tone: string; live: boolean }) {
  return (
    <div className="px-4 py-5 sm:px-5">
      <div className={`mb-2 flex items-center gap-2 ${tone}`}>
        {icon}<span className="label">{label}</span>
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-fog-500">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
        {live ? 'Live · refreshes every 3 seconds' : 'Latest 5-minute average'}
      </p>
    </div>
  );
}
