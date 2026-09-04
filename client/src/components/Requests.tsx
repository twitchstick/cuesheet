import { ArrowUpRight, ChevronRight } from 'lucide-react';
import Section, { Empty } from './Section';
import SignalTrace, { CompactSignalTrace } from './SignalTrace';
import type { LifecycleItem } from '../types';

interface Props {
  requests: LifecycleItem[] | null;
  requestsError: string | null;
  seerrUrl: string;
  full?: boolean;
  /** Compact view only -- where the summary tile goes for the full trace. */
  onOpen?: () => void;
  updatedAt?: number | null;
}

/** Requests are made in Seerr; this traces each one from ask to available. */
export default function Requests({ requests, requestsError, seerrUrl, full = false, onOpen, updatedAt }: Props) {
  // /api/lifecycle also carries queue-only titles with no Seerr request behind
  // them (added straight in Radarr/Sonarr) -- those belong to Downloads, not here.
  const items = requests?.filter((r) => r.fromRequest) ?? requests;
  return (
    <Section
      title="Requests"
      subtitle="What the house has asked for, traced from ask to available"
      action={
        seerrUrl && (
          <a href={seerrUrl} target="_blank" rel="noreferrer noopener" className="btn-primary">
            Request media
            <ArrowUpRight className="h-4 w-4" />
          </a>
        )
      }
    >
      {requestsError ? (
        <Empty>Couldn’t reach Seerr: {requestsError}</Empty>
      ) : items === null ? (
        <div className={full ? 'flex flex-col gap-3' : ''}>
          {full ? [0, 1, 2].map((i) => <div key={i} className="card h-[150px] animate-pulse" />) : <div className="card h-[70px] animate-pulse" />}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          Nothing requested yet.{' '}
          {seerrUrl && (
            <a href={seerrUrl} target="_blank" rel="noreferrer noopener" className="ml-1 text-accent-300 underline underline-offset-2">
              Open Seerr
            </a>
          )}
        </Empty>
      ) : full ? (
        <div className="flex flex-col gap-3">
          {items.map((r) => (
            <SignalTrace key={r.id} item={r} updatedAt={updatedAt} />
          ))}
        </div>
      ) : (
        <RequestsSummary items={items} onOpen={onOpen} updatedAt={updatedAt} />
      )}
    </Section>
  );
}

/**
 * The front page gets the headline, not the whole story: how many are
 * waiting, moving, landed -- and if anything actually needs a look, that
 * one request's own compact trace, pulled up out of the count and shown
 * directly. Quiet otherwise. The whole tile opens the Requests tab, where
 * every trace lives in full.
 */
function RequestsSummary({ items, onOpen, updatedAt }: { items: LifecycleItem[]; onOpen?: () => void; updatedAt?: number | null }) {
  const waiting = items.filter((r) => r.stage === 'requested' || r.stage === 'monitored').length;
  const moving = items.filter((r) => r.stage === 'downloading' || r.stage === 'importing').length;
  const available = items.filter((r) => r.stage === 'available').length;
  const stalled = items.filter((r) => r.stallReason);

  const readouts: [string, number][] = [
    ['Waiting', waiting],
    ['Moving', moving],
    ['Available', available],
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full flex-col divide-y divide-line p-0 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035]"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <dl className="flex flex-wrap items-end gap-x-7 gap-y-3">
          {readouts
            .filter(([, n]) => n > 0)
            .map(([label, n]) => (
              <div key={label}>
                <dt className="label">{label}</dt>
                <dd className="mt-0.5 font-mono text-lg font-medium leading-none tabular-nums">{n}</dd>
              </div>
            ))}
          {stalled.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tally-hold" />
              <span className="text-xs text-tally-hold">
                {stalled.length} need{stalled.length === 1 ? 's' : ''} a look
              </span>
            </div>
          )}
        </dl>
        <ChevronRight className="h-4 w-4 shrink-0 text-fog-500" />
      </div>
      {stalled[0] && <CompactSignalTrace item={stalled[0]} updatedAt={updatedAt} />}
    </button>
  );
}
