import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api, ApiError } from '../api';
import { eventTimestamp } from '../lib/format';
import type { HistoryEvent, LifecycleItem } from '../types';

type RowType = HistoryEvent['type'] | 'requested';

const EVENT: Record<RowType, { label: string; dot: string }> = {
  requested: { label: 'Requested', dot: 'bg-fog-300' },
  grabbed: { label: 'Grabbed', dot: 'bg-accent-400' },
  imported: { label: 'Imported', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', dot: 'bg-tally-on' },
  deleted: { label: 'Removed', dot: 'bg-tally-idle' },
  ignored: { label: 'Skipped', dot: 'bg-tally-hold' },
};

/** A HistoryEvent from the server, or the one row that's already known
 * client-side and costs no request: the trace's own start. */
interface Row {
  id: string;
  type: RowType;
  at: number;
  detail?: string | null;
  release?: string | null;
  indexer?: string | null;
}

interface Props {
  item: Pick<LifecycleItem, 'id' | 'mediaType' | 'tmdbId' | 'tvdbId' | 'createdAt' | 'requestedBy'>;
  /** Open (and fetched) from the start, for a trace that's already flagged
   * as a problem -- exactly the case where "why" is worth showing without
   * making someone click for it. */
  defaultOpen?: boolean;
}

/**
 * How this title actually got here -- requested, maybe failed and
 * re-grabbed, imported -- Radarr/Sonarr's own per-title history plus the
 * request's own start, which Cuesheet already has and Radarr/Sonarr don't
 * know about at all. Collapsed by default and fetched only on open (unless
 * `defaultOpen`): most traces never get a second look, so this shouldn't
 * cost a request until someone actually asks, or the trace already needs one.
 */
export default function HistoryStrip({ item, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `item` is a new object every poll (the whole /api/lifecycle list is
  // rebuilt each refresh), so this re-runs often once `open` -- harmless,
  // since `events !== null`/`error` turn every re-run after the real one
  // into a no-op rather than a repeat fetch.
  useEffect(() => {
    if (!open || events !== null || error) return;
    let live = true;
    api
      .lifecycleHistory(item)
      .then((r) => live && setEvents(r.items))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : 'Could not load history'));
    return () => {
      live = false;
    };
  }, [open, item, events, error]);

  // The full trace card is itself clickable (opens the detail panel) when
  // DownloadQueue renders it -- this toggle sits inside that, so its click
  // must never bubble up and open the panel instead of just expanding.
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  // This only renders for an item with a real request behind it (see
  // SignalTrace's tmdbId/tvdbId gate), so createdAt is always meaningful --
  // sorted in with whatever Radarr/Sonarr reports rather than assumed to be
  // the oldest, in case a clock's off somewhere upstream.
  const requested: Row = {
    id: `${item.id}-requested`,
    type: 'requested',
    at: item.createdAt,
    detail: item.requestedBy ? `by ${item.requestedBy}` : null,
  };
  const rows: Row[] | null = events === null ? null : [...events, requested].sort((a, b) => b.at - a.at);

  return (
    <div className="mt-4 border-t border-line pt-3">
      {/* keydown also stopped, not just click -- a native button's own Enter/Space
          activation would otherwise still bubble to the card's role="button"
          keydown handler and open the detail panel instead. */}
      <button
        type="button"
        onClick={toggle}
        onKeyDown={(e) => e.stopPropagation()}
        className="label flex items-center gap-1 !text-fog-500 hover:!text-fog-300"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        History
      </button>
      {open && (
        <div className="mt-3">
          {error ? (
            <p className="text-xs text-fog-500">{error}</p>
          ) : rows === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5 text-xs">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${EVENT[r.type].dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-fog-300">{EVENT[r.type].label}</span>
                      <span className="shrink-0 text-fog-500">{eventTimestamp(r.at)}</span>
                    </div>
                    {(r.detail || r.release) && (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-fog-500" title={r.detail || r.release || undefined}>
                        {r.detail || r.release}
                        {r.indexer ? ` · ${r.indexer}` : ''}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
