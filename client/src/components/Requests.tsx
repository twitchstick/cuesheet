import { ArrowUpRight, Clock } from 'lucide-react';
import Poster from './Poster';
import Section, { Empty } from './Section';
import { timeAgo } from '../lib/format';
import type { MediaRequest, MediaStatus, RequestStatus } from '../types';

interface Props {
  requests: MediaRequest[] | null;
  requestsError: string | null;
  seerrUrl: string;
  full?: boolean;
}

const statusLabel: Record<MediaStatus, { text: string; cls: string } | null> = {
  none: null,
  pending: { text: 'Requested', cls: 'bg-amber-400/15 text-amber-300' },
  processing: { text: 'Processing', cls: 'bg-sky-400/15 text-sky-300' },
  partial: { text: 'Partial', cls: 'bg-sky-400/15 text-sky-300' },
  available: { text: 'In library', cls: 'bg-emerald-400/15 text-emerald-300' },
  deleted: null,
};

const requestStatusLabel: Record<RequestStatus, { text: string; cls: string }> = {
  pending: { text: 'Pending', cls: 'bg-amber-400/15 text-amber-300' },
  approved: { text: 'Approved', cls: 'bg-sky-400/15 text-sky-300' },
  declined: { text: 'Declined', cls: 'bg-rose-400/15 text-rose-300' },
  failed: { text: 'Failed', cls: 'bg-rose-400/15 text-rose-300' },
};

/** Requests are made in Seerr; this is the window onto what has been asked for. */
export default function Requests({ requests, requestsError, seerrUrl, full = false }: Props) {
  const shown = full ? requests : requests?.slice(0, 8);
  return (
    <Section
      title="Requests"
      subtitle="What the house has asked for lately"
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
      ) : requests === null ? (
        <div className={full ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4'}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-[76px] animate-pulse" />
          ))}
        </div>
      ) : shown!.length === 0 ? (
        <Empty>
          Nothing requested yet.{' '}
          {seerrUrl && (
            <a href={seerrUrl} target="_blank" rel="noreferrer noopener" className="ml-1 text-accent-300 underline underline-offset-2">
              Open Seerr
            </a>
          )}
        </Empty>
      ) : (
        <div className={full ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4'}>
          {shown!.map((r) => {
            const status =
              r.mediaStatus === 'available' || r.mediaStatus === 'partial' ? statusLabel[r.mediaStatus]! : requestStatusLabel[r.requestStatus];
            return (
              <article key={r.id} className="card flex items-center gap-3 p-3">
                <Poster src={r.poster} alt="" kind={r.mediaType} className="w-11 shrink-0 !rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {r.title}
                    {r.year && <span className="ml-1 font-medium text-fog-500">{r.year}</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-fog-500">
                    <Clock className="h-3 w-3 shrink-0" />
                    {r.requestedBy} · {timeAgo(r.createdAt)}
                    {r.mediaType === 'tv' && r.seasons.length > 0 && ` · ${r.seasons.length === 1 ? `Season ${r.seasons[0]}` : `${r.seasons.length} seasons`}`}
                  </p>
                </div>
                <span className={`chip shrink-0 ${status.cls}`}>{status.text}</span>
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}
