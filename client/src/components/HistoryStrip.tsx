import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api, ApiError } from '../api';
import { eventTimestamp } from '../lib/format';
import { groupHistory, type AttemptOutcome, type HistoryRow } from '../lib/historyGrouping';
import type { HistoryEvent, LifecycleItem } from '../types';

const EVENT: Record<HistoryRow['type'], { label: string; dot: string }> = {
  requested: { label: 'Requested', dot: 'bg-fog-300' },
  grabbed: { label: 'Grabbed', dot: 'bg-accent-400' },
  imported: { label: 'Imported', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', dot: 'bg-tally-on' },
  deleted: { label: 'Removed', dot: 'bg-tally-idle' },
  ignored: { label: 'Skipped', dot: 'bg-tally-hold' },
};

// An attempt group's own header uses these instead of a per-event dot/label
// -- the group as a whole either landed, failed, or (its most recent grab,
// with nothing after it yet) is still running.
const OUTCOME: Record<AttemptOutcome, { label: string; dot: string }> = {
  imported: { label: 'Imported', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', dot: 'bg-tally-on' },
  pending: { label: 'In progress', dot: 'bg-accent-400' },
};

interface Props {
  item: Pick<LifecycleItem, 'id' | 'mediaType' | 'tmdbId' | 'tvdbId' | 'createdAt' | 'requestedBy' | 'stage'>;
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

  // A stage move (grabbed -> downloading, downloading -> available, a fresh
  // failure...) means Radarr/Sonarr's own history almost certainly grew a
  // new row -- without this, a card left open/mounted across a poll would
  // keep showing whatever it fetched the moment it was first opened,
  // forever, no matter how much actually happened afterward. Compared by
  // value against a ref, not made an effect dependency directly -- `item`
  // (and therefore `item.stage`) is a fresh string each poll regardless of
  // whether it actually changed, and this must only fire on a real move.
  const lastStage = useRef(item.stage);
  useEffect(() => {
    if (lastStage.current === item.stage) return;
    lastStage.current = item.stage;
    setEvents(null);
    setError(null);
  }, [item.stage]);

  // `item` is a new object every poll (the whole /api/lifecycle list is
  // rebuilt each refresh), so this re-runs often once `open` -- harmless,
  // since `events !== null`/`error` turn every re-run after the real one
  // into a no-op rather than a repeat fetch. The stage-change effect above,
  // and retry() below, are what actually clear those to let a new fetch
  // through.
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
  // DownloadQueue renders it -- this toggle (and retry, below) sit inside
  // that, so neither click must ever bubble up and open the panel instead.
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  const retry = (e: MouseEvent) => {
    e.stopPropagation();
    setError(null);
  };

  // This only renders for an item with a real request behind it (see
  // SignalTrace's tmdbId/tvdbId gate), so createdAt is always meaningful --
  // sorted in with whatever Radarr/Sonarr reports rather than assumed to be
  // the oldest, in case a clock's off somewhere upstream.
  const requested: HistoryRow = {
    id: `${item.id}-requested`,
    type: 'requested',
    at: item.createdAt,
    detail: item.requestedBy ? `by ${item.requestedBy}` : null,
  };
  const rows: HistoryRow[] | null = events === null ? null : [...events, requested].sort((a, b) => b.at - a.at);
  const entries = rows === null ? null : groupHistory(rows);

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
            <p className="flex items-center gap-2 text-xs text-fog-500">
              <span>{error}</span>
              <button type="button" onClick={retry} className="shrink-0 text-fog-300 underline underline-offset-2 hover:text-fog-100">
                Retry
              </button>
            </p>
          ) : entries === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {entries.map((entry) =>
                entry.kind === 'single' ? (
                  <EventRow key={entry.row.id} row={entry.row} />
                ) : (
                  <li key={entry.downloadId} className="flex items-start gap-2.5 text-xs">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${OUTCOME[entry.outcome].dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-fog-300">
                          Attempt {entry.attemptNumber}
                          {entry.episodeCode ? ` · ${entry.episodeCode}` : ''}
                        </span>
                        <span className="shrink-0 text-fog-500">{OUTCOME[entry.outcome].label}</span>
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-1.5 border-l border-line pl-3">
                        {entry.rows.map((row) => (
                          <EventRow key={row.id} row={row} />
                        ))}
                      </ul>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** One event's own row -- shared by a standalone entry and by every row
 * nested inside an attempt group. */
function EventRow({ row }: { row: HistoryRow }) {
  return (
    <li className="flex items-start gap-2.5 text-xs">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${EVENT[row.type].dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-fog-300">{EVENT[row.type].label}</span>
          <span className="shrink-0 text-fog-500">{eventTimestamp(row.at)}</span>
        </div>
        {(row.detail || row.release) && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-fog-500" title={row.detail || row.release || undefined}>
            {row.detail || row.release}
            {row.indexer ? ` · ${row.indexer}` : ''}
          </p>
        )}
      </div>
    </li>
  );
}
