import Poster from './Poster';
import Section, { Empty } from './Section';
import { bandwidth, playbackLabel, remainingCode, serviceTheme, sourceLabel, tally, timecode, totalBandwidth } from '../lib/format';
import type { Errors, Stream } from '../types';

interface Props {
  streams: Stream[] | null;
  errors: Errors | null;
  loading: boolean;
  onSelect?: (stream: Stream) => void;
}

export default function StreamGrid({ streams, errors, loading, onSelect }: Props) {
  const count = streams?.length ?? 0;
  return (
    <Section
      title="Now playing"
      subtitle={count ? `${count} active stream${count === 1 ? '' : 's'} across your servers` : 'Every active session, live'}
      errors={errors}
    >
      {loading && !streams ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[150px] animate-pulse" />
          ))}
        </div>
      ) : count === 0 ? (
        <Empty>Nothing is playing right now.</Empty>
      ) : (
        <>
          <Summary streams={streams!} onSelect={onSelect} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {streams!.map((s) => (
              <StreamCard key={s.id} stream={s} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

/** The running totals, read as instrument readouts rather than decorated tiles. */
function Summary({ streams, onSelect }: { streams: Stream[]; onSelect?: (stream: Stream) => void }) {
  const total = totalBandwidth(streams);
  const remote = totalBandwidth(streams.filter((s) => s.location === 'remote'));
  const local = totalBandwidth(streams.filter((s) => s.location !== 'remote'));
  const needsAttention = streams.filter((s): s is Stream & { attention: string } => Boolean(s.attention));

  const readouts: [string, string][] = [
    ['Plex', String(streams.filter((s) => s.source === 'plex').length)],
    ['Jellyfin', String(streams.filter((s) => s.source === 'jellyfin').length)],
    ['Transcoding', String(streams.filter((s) => s.transcoding).length)],
  ];

  return (
    <div className="card mb-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 py-3.5">
      <dl className="flex flex-wrap items-end gap-x-7 gap-y-3">
        {readouts
          .filter(([, n]) => n !== '0')
          .map(([label, n]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd className="mt-0.5 font-mono text-lg font-medium leading-none tabular-nums">{n}</dd>
            </div>
          ))}
        {needsAttention.length > 0 && (
          // Clicking opens the flagged session itself -- a count on its own
          // was a dead end (which one? why?) when that answer was one tap
          // away the whole time. Exactly one flagged session says so by name.
          <button
            type="button"
            onClick={onSelect ? () => onSelect(needsAttention[0]) : undefined}
            disabled={!onSelect}
            title={needsAttention.map((s) => `${s.title}: ${s.attention}`).join(' · ')}
            className="flex items-center gap-2 text-left disabled:cursor-default"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tally-hold" />
            <span className={`text-xs text-tally-hold ${onSelect ? 'underline decoration-tally-hold/40 decoration-dotted underline-offset-4 hover:decoration-tally-hold' : ''}`}>
              {needsAttention.length === 1
                ? `${needsAttention[0].title} is ${needsAttention[0].attention.toLowerCase()}`
                : `${needsAttention.length} need attention`}
            </span>
          </button>
        )}
      </dl>

      <div className="text-right">
        <p className="label">Total bandwidth</p>
        <p className="mt-0.5 font-mono text-lg font-medium leading-none tabular-nums">{bandwidth(total) ?? '—'}</p>
        {total > 0 && (
          <p className="mt-1 font-mono text-[11px] tabular-nums text-fog-500">
            {bandwidth(remote) ?? '0'} out · {bandwidth(local) ?? '0'} local
          </p>
        )}
      </div>
    </div>
  );
}

function StreamCard({ stream, onSelect }: { stream: Stream; onSelect?: (stream: Stream) => void }) {
  const theme = serviceTheme[stream.source];
  const light = tally(stream);
  const pct = Math.min(100, Math.max(0, stream.progress * 100));
  const meta = [stream.quality, bandwidth(stream.bandwidthKbps), playbackLabel(stream), stream.location === 'remote' ? 'Remote' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      // min-w-0: a grid item defaults to min-width:auto, which would let the
      // card grow past a narrow screen rather than letting its text truncate.
      className={`card flex min-w-0 gap-4 border-l-2 p-3.5 text-left ${theme?.border ?? 'border-l-transparent'} ${
        onSelect ? 'cursor-pointer transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035]' : ''
      }`}
      onClick={onSelect ? () => onSelect(stream) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(stream);
              }
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `${stream.title} — session details` : undefined}
    >
      <Poster src={stream.poster} alt={stream.title} kind={stream.type === 'episode' ? 'tv' : 'movie'} className="w-[68px] shrink-0 shadow-poster" />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold leading-tight tracking-tight">{stream.title}</h3>
            <p className="truncate text-sm text-fog-300">{stream.subtitle}</p>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-1.5" title={light.label}>
            <span className={`h-1.5 w-1.5 rounded-full ${light.cls} ${light.pulse ? 'animate-pulse' : ''}`} />
            <span className="label !text-fog-500">{light.label}</span>
          </span>
        </div>

        <p className="mt-1 truncate text-xs text-fog-500">
          {stream.user ? `${stream.user} · ` : ''}
          {stream.device || stream.player}
        </p>

        <div className="mt-auto pt-3">
          {/* The cue strip: square ends and a hard playhead — a playout bar, not a pill. */}
          <div className="relative h-[5px] w-full bg-white/[0.07]">
            <div className={`absolute inset-y-0 left-0 ${theme?.bg ?? 'bg-accent-500'}`} style={{ width: `${pct}%` }} />
            <div className="absolute inset-y-[-2px] w-[2px] bg-fog-100" style={{ left: `calc(${pct}% - 1px)` }} />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 font-mono text-xs tabular-nums">
            <span className="text-fog-300">{timecode(stream.offsetMs)}</span>
            <span className={theme?.text ?? 'text-fog-300'}>{stream.durationMs ? remainingCode(stream.durationMs, stream.offsetMs) : `${Math.round(pct)}%`}</span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.1em] text-fog-500" title={meta}>
            {meta}
          </p>
        </div>
      </div>
      <span className="sr-only">{sourceLabel[stream.source]}</span>
    </article>
  );
}
