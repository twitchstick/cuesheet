import Poster from './Poster';
import Section, { Empty } from './Section';
import { bandwidth, diskFree, downloadTally, fileSize, sourceLabel, timeLeftLabel } from '../lib/format';
import type { DownloadClientStats, DownloadItem, Errors } from '../types';

interface Props {
  items: DownloadItem[] | null;
  errors: Errors | null;
  loading: boolean;
  /** The download client's own aggregate readout -- speed, disk free. Optional companion to the rows below. */
  client?: DownloadClientStats | null;
  /** How many rows the compact view shows. Ignored in the full-page view. */
  limit?: number;
  full?: boolean;
  onSelect?: (item: DownloadItem) => void;
}

export default function DownloadQueue({ items, errors, loading, client, limit = 4, full = false, onSelect }: Props) {
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
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[72px] animate-pulse" />
          ))}
        </div>
      ) : count === 0 ? (
        <Empty>Nothing in the queue.</Empty>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <Row key={item.id} item={item} onSelect={onSelect} />
          ))}
        </div>
      )}
      {!full && count > limit && (
        <p className="mt-3 text-center text-xs text-fog-500">
          +{count - limit} more in the Downloads tab
        </p>
      )}
    </Section>
  );
}

/** The download client's own readout: what it's costing right now, and what's left on the volume it lands on. */
function ClientStrip({ client }: { client: DownloadClientStats }) {
  return (
    <div className="card mb-3 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3.5">
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
      {diskFree(client.diskFreeGb) && (
        <div className="text-right">
          <p className="label">Disk</p>
          <p className="mt-0.5 font-mono text-lg font-medium leading-none tabular-nums">{diskFree(client.diskFreeGb)}</p>
        </div>
      )}
    </div>
  );
}

function Row({ item, onSelect }: { item: DownloadItem; onSelect?: (item: DownloadItem) => void }) {
  const light = downloadTally(item);
  const pct = Math.min(100, Math.max(0, item.progress * 100));
  const left = timeLeftLabel(item.timeleft);
  const size = fileSize(item.sizeBytes);
  const meta = [size, item.downloadClient, item.source === 'radarr' ? 'Radarr' : 'Sonarr'].filter(Boolean).join(' · ');

  return (
    <article
      // min-w-0: lets the title/meta truncate instead of forcing the row wider than its column.
      className={`card flex min-w-0 gap-3.5 p-3 text-left ${onSelect ? 'cursor-pointer transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035]' : ''}`}
      onClick={onSelect ? () => onSelect(item) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item);
              }
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `${item.title} — details` : undefined}
    >
      <Poster src={item.poster} alt={item.title} kind={item.type === 'episode' ? 'tv' : 'movie'} className="w-11 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight tracking-tight">{item.title}</h3>
            {item.subtitle && <p className="truncate text-xs text-fog-500">{item.subtitle}</p>}
          </div>
          {/* min-w-0, not shrink-0: the status text is free-form, straight from
              Radarr/Sonarr's own error message, so it can run to a full sentence.
              Left it shrink-0 before and it ran past the card's edge; the title
              on the left already truncates the same way. Full text is still on
              the title attribute, for a hover. */}
          <span className="mt-0.5 flex min-w-0 max-w-[45%] items-center gap-1.5" title={light.label}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${light.cls} ${light.pulse ? 'animate-pulse' : ''}`} />
            <span className="label !text-fog-500 truncate">{light.label}</span>
          </span>
        </div>

        <div className="mt-2 relative h-[3px] w-full bg-white/[0.07]">
          <div className={`absolute inset-y-0 left-0 ${light.cls}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-fog-500">
          {[left, meta].filter(Boolean).join(' · ') || sourceLabel[item.source]}
        </p>
      </div>
    </article>
  );
}
