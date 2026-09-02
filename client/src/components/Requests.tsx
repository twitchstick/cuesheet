import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import Poster from './Poster';
import Section, { Empty, SkeletonRow } from './Section';
import { api } from '../api';
import { timeAgo } from '../lib/format';
import type { MediaDetails, MediaRequest, MediaResult, MediaStatus, RequestStatus } from '../types';

interface Props {
  requests: MediaRequest[] | null;
  requestsError: string | null;
  trending: MediaResult[] | null;
  onRequested: () => void;
  notify: (message: string, tone?: 'ok' | 'error') => void;
  /** Bump this to focus the search box (used by the top bar buttons). */
  focusToken?: number;
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

export default function Requests({ requests, requestsError, trending, onRequested, notify, focusToken = 0, full = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState<MediaResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus();
  }, [focusToken]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const { items } = await api.search(q, controller.signal);
        setResults(items);
      } catch (err) {
        if (!controller.signal.aborted) {
          setResults([]);
          notify(err instanceof Error ? err.message : 'Search failed', 'error');
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [query, notify]);

  const submit = async (item: MediaResult, seasons?: number[]) => {
    const key = `${item.mediaType}-${item.tmdbId}`;
    setBusyId(key);
    try {
      await api.request({ mediaType: item.mediaType, tmdbId: item.tmdbId, seasons });
      notify(`Requested ${item.title}`);
      const mark = (list: MediaResult[] | null) =>
        list?.map((r) => (r.tmdbId === item.tmdbId && r.mediaType === item.mediaType ? { ...r, status: 'pending' as MediaStatus } : r)) ?? null;
      setResults(mark);
      setPicking(null);
      onRequested();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Request failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const onRequestClick = (item: MediaResult) => {
    if (item.mediaType === 'tv') setPicking(item);
    else submit(item);
  };

  const showingSearch = query.trim().length >= 2;
  const grid = showingSearch ? results : trending;
  const gridTitle = showingSearch ? (searching ? 'Searching…' : `Results for “${query.trim()}”`) : 'Trending this week';

  return (
    <Section title="Requests" subtitle="Ask for something new — it goes straight to Seerr">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog-500" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a movie or show to request…"
              className="w-full rounded-xl border border-line bg-night-800 py-2.5 pl-10 pr-10 text-sm placeholder:text-fog-700 focus:border-accent-500/60 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-fog-500">{gridTitle}</p>
          {grid === null ? (
            <SkeletonRow count={6} className="w-24" />
          ) : grid.length === 0 ? (
            <Empty>{showingSearch ? 'No matches. Try a different title.' : 'Nothing trending right now.'}</Empty>
          ) : (
            <div className={full ? 'grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7' : 'grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6'}>
              {(full ? grid : grid.slice(0, 6)).map((item) => (
                <ResultCard key={`${item.mediaType}-${item.tmdbId}`} item={item} busy={busyId === `${item.mediaType}-${item.tmdbId}`} onRequest={onRequestClick} />
              ))}
            </div>
          )}
        </div>

        <aside>
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-fog-500">Recent requests</p>
          {requestsError ? (
            <Empty>Couldn’t reach Seerr: {requestsError}</Empty>
          ) : requests === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card h-14 animate-pulse" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <Empty>No requests yet.</Empty>
          ) : (
            <ul className="card divide-y divide-line">
              {(full ? requests : requests.slice(0, 6)).map((r) => {
                const status =
                  r.mediaStatus === 'available' || r.mediaStatus === 'partial'
                    ? statusLabel[r.mediaStatus]!
                    : requestStatusLabel[r.requestStatus];
                return (
                  <li key={r.id} className="flex items-center gap-3 p-3">
                    <Poster src={r.poster} alt="" kind={r.mediaType} className="w-8 shrink-0 !rounded-md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {r.title}
                        {r.year && <span className="ml-1 text-fog-500">{r.year}</span>}
                      </p>
                      <p className="truncate text-[11px] text-fog-500">
                        {r.requestedBy} · {timeAgo(r.createdAt)}
                        {r.mediaType === 'tv' && r.seasons.length > 0 && ` · ${r.seasons.length === 1 ? `Season ${r.seasons[0]}` : `${r.seasons.length} seasons`}`}
                      </p>
                    </div>
                    <span className={`chip ${status.cls}`}>{status.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {picking && <SeasonPicker item={picking} busy={busyId === `tv-${picking.tmdbId}`} onClose={() => setPicking(null)} onSubmit={(seasons) => submit(picking, seasons)} />}
    </Section>
  );
}

function ResultCard({ item, busy, onRequest }: { item: MediaResult; busy: boolean; onRequest: (item: MediaResult) => void }) {
  const status = statusLabel[item.status];
  const requestable = item.status === 'none' || item.status === 'deleted';
  return (
    <figure className="group">
      <div className="relative">
        <Poster src={item.poster} alt={item.title} kind={item.mediaType} className="shadow-poster" />
        {status && <span className={`chip absolute left-1.5 top-1.5 backdrop-blur ${status.cls}`}>{status.text}</span>}
        {requestable && (
          <button
            type="button"
            onClick={() => onRequest(item)}
            disabled={busy}
            className="btn-primary absolute bottom-2 left-2 right-2 !py-1.5 text-xs opacity-0 shadow-lg transition-opacity focus:opacity-100 group-hover:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Request
          </button>
        )}
      </div>
      <figcaption className="mt-2">
        <p className="truncate text-sm font-medium leading-tight" title={item.title}>
          {item.title}
        </p>
        <p className="text-xs text-fog-500">
          {item.mediaType === 'tv' ? 'Series' : 'Movie'}
          {item.year ? ` · ${item.year}` : ''}
        </p>
      </figcaption>
    </figure>
  );
}

function SeasonPicker({ item, busy, onClose, onSubmit }: { item: MediaResult; busy: boolean; onClose: () => void; onSubmit: (seasons: number[]) => void }) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api
      .media('tv', item.tmdbId)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        setSelected(new Set(d.seasons.map((s) => s.seasonNumber)));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load seasons'));
    return () => {
      cancelled = true;
    };
  }, [item.tmdbId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allSelected = useMemo(() => details !== null && selected.size === details.seasons.length, [details, selected]);
  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <div className="card w-full max-w-md animate-rise p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <Poster src={item.poster} alt="" kind="tv" className="w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-tight">{item.title}</h3>
            <p className="text-xs text-fog-500">{item.year ? `${item.year} · ` : ''}Choose seasons to request</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-line">
          {error && <p className="p-3 text-sm text-rose-300">{error}</p>}
          {!details && !error && (
            <p className="flex items-center gap-2 p-3 text-sm text-fog-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading seasons…
            </p>
          )}
          {details && (
            <ul className="divide-y divide-line">
              <li>
                <label className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-white/5">
                  <span className="font-medium">All seasons</span>
                  <input
                    type="checkbox"
                    className="accent-accent-500"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(details.seasons.map((s) => s.seasonNumber)))}
                  />
                </label>
              </li>
              {details.seasons.map((s) => (
                <li key={s.seasonNumber}>
                  <label className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-white/5">
                    <span>
                      {s.name || `Season ${s.seasonNumber}`}
                      {s.episodeCount ? <span className="ml-2 text-xs text-fog-500">{s.episodeCount} ep</span> : null}
                    </span>
                    <input type="checkbox" className="accent-accent-500" checked={selected.has(s.seasonNumber)} onChange={() => toggle(s.seasonNumber)} />
                  </label>
                </li>
              ))}
              {details.seasons.length === 0 && <li className="px-3 py-2 text-sm text-fog-500">No seasons listed. The whole series will be requested.</li>}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || (!!details && details.seasons.length > 0 && selected.size === 0)}
            onClick={() => onSubmit(Array.from(selected).sort((a, b) => a - b))}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Request {details && details.seasons.length > 0 ? `${selected.size} season${selected.size === 1 ? '' : 's'}` : 'series'}
          </button>
        </div>
      </div>
    </div>
  );
}
