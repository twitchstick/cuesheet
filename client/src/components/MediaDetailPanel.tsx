import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import DetailPanel, { PanelSection, Readout } from './DetailPanel';
import Poster from './Poster';
import { sourceLabel } from '../lib/format';
import type { MediaDetail } from '../types';

interface Props {
  /** The item id, e.g. `plex-1234` or `sonarr-88`. */
  id: string;
  /** What we already know, so the panel has something to show while it loads. */
  fallback: { title: string; subtitle?: string; poster: string | null; type?: string };
  onClose: () => void;
}

const runtime = (mins: number | null) => {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

export default function MediaDetailPanel({ id, fallback, onClose }: Props) {
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setError(null);
    api
      .details(id)
      .then((d) => live && setDetail(d))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : 'Could not load the details'));
    return () => {
      live = false;
    };
  }, [id]);

  const title = detail?.title ?? fallback.title;
  const subtitle = detail?.subtitle || fallback.subtitle || '';
  const kind = (detail?.type ?? fallback.type) === 'movie' ? 'movie' : 'tv';

  return (
    <DetailPanel title={detail ? sourceLabel[detail.source] : 'Details'} onClose={onClose}>
      <div className="flex gap-4">
        <Poster src={detail?.poster ?? fallback.poster} alt={title} kind={kind} className="w-24 shrink-0 shadow-poster" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-fog-300">{subtitle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {detail?.year && <Chip>{detail.year}</Chip>}
            {detail?.contentRating && <Chip>{detail.contentRating}</Chip>}
            {runtime(detail?.runtimeMinutes ?? null) && <Chip>{runtime(detail!.runtimeMinutes)}</Chip>}
            {detail?.rating != null && (
              <Chip title={`${detail.ratingLabel} rating`}>
                ★ {detail.rating}
              </Chip>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-5 text-sm text-tally-hold">{error}</p>}
      {!detail && !error && <Loading />}

      {detail && (
        <>
          {detail.overview && (
            <PanelSection title="Synopsis">
              <p className="text-sm leading-relaxed text-fog-300">{detail.overview}</p>
            </PanelSection>
          )}

          {detail.genres.length > 0 && (
            <PanelSection title="Genres">
              <div className="flex flex-wrap gap-2">
                {detail.genres.map((g) => (
                  <Chip key={g}>{g}</Chip>
                ))}
              </div>
            </PanelSection>
          )}

          {detail.facts.length > 0 && (
            <PanelSection title="Details">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                {detail.facts.map(([label, value]) => (
                  <Readout key={label} label={label} value={value} />
                ))}
                {detail.studio && <Readout label="Studio" value={detail.studio} />}
                {detail.airedOn && <Readout label="Released" value={detail.airedOn} />}
              </dl>
            </PanelSection>
          )}

          {detail.people.length > 0 && (
            <PanelSection title="Cast &amp; crew">
              <ul className="space-y-1.5">
                {detail.people.map((p) => (
                  <li key={`${p.role}-${p.name}`} className="flex justify-between gap-4 text-sm">
                    <span className="truncate text-fog-100">{p.name}</span>
                    <span className="shrink-0 text-fog-500">{p.role}</span>
                  </li>
                ))}
              </ul>
            </PanelSection>
          )}
        </>
      )}
    </DetailPanel>
  );
}

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded-md border border-line px-2 py-0.5 text-xs text-fog-300">
      {children}
    </span>
  );
}

function Loading() {
  return (
    <div className="mt-6 space-y-3" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}
