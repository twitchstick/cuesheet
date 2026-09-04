import Section, { Empty } from './Section';
import SignalTrace, { CompactSignalTrace, type ServiceLinks } from './SignalTrace';
import { bandwidth } from '../lib/format';
import type { DownloadClientStats, Errors, LifecycleItem } from '../types';

interface Props {
  items: LifecycleItem[] | null;
  errors: Errors | null;
  loading: boolean;
  /** The download client's own aggregate readout -- speed. Optional companion to the traces below. */
  client?: DownloadClientStats | null;
  /** How many rows the compact view shows. Ignored in the full-page view. */
  limit?: number;
  full?: boolean;
  onSelect?: (item: LifecycleItem) => void;
  updatedAt?: number | null;
  /** "Open in X" deep links -- the full view only; the compact row stays dense. */
  links?: ServiceLinks;
}

/** What's actually moving through Radarr/Sonarr right now, as the same signal trace Requests uses -- with the request's own context (who asked, when) folded in wherever a title has one. */
export default function DownloadQueue({ items, errors, loading, client, limit = 4, full = false, onSelect, updatedAt, links }: Props) {
  const count = items?.length ?? 0;
  const visible = full ? (items ?? []) : (items ?? []).slice(0, limit);

  return (
    <Section
      title="Download queue"
      subtitle={count ? `${count} item${count === 1 ? '' : 's'} moving through Radarr and Sonarr` : 'Nothing downloading right now'}
      errors={errors}
    >
      {client && <ClientStrip client={client} />}
      {loading && !items ? (
        <div className={full ? 'flex flex-col gap-3' : 'card divide-y divide-line p-0'}>
          {(full ? [0, 1, 2] : [0, 1, 2]).map((i) => (
            <div key={i} className={full ? 'card h-[150px] animate-pulse' : 'h-[70px] animate-pulse'} />
          ))}
        </div>
      ) : count === 0 ? (
        <Empty>Nothing in the queue.</Empty>
      ) : full ? (
        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <SignalTrace key={item.id} item={item} updatedAt={updatedAt} onSelect={onSelect} links={links} />
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-line p-0">
          {visible.map((item) => (
            <CompactSignalTrace key={item.id} item={item} updatedAt={updatedAt} onSelect={onSelect} />
          ))}
        </div>
      )}
      {!full && count > limit && <p className="mt-3 text-center text-xs text-fog-500">+{count - limit} more in the Downloads tab</p>}
    </Section>
  );
}

/** The download client's own readout: what it's costing right now. */
function ClientStrip({ client }: { client: DownloadClientStats }) {
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5">
      <dl className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <div>
          <dt className="label">Speed</dt>
          <dd className="mt-0.5 font-mono text-lg font-medium leading-none tabular-nums">{bandwidth(client.speedKbps) ?? '—'}</dd>
        </div>
        {client.paused && (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-tally-idle" />
            <span className="text-xs text-fog-500">Paused</span>
          </div>
        )}
      </dl>
    </div>
  );
}
