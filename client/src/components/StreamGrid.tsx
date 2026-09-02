import { Loader2, Pause, Play } from 'lucide-react';
import Poster from './Poster';
import Section, { Empty } from './Section';
import { bandwidth, playbackLabel, remaining, serviceTheme, sourceLabel } from '../lib/format';
import type { Errors, Stream } from '../types';

interface Props {
  streams: Stream[] | null;
  errors: Errors | null;
  loading: boolean;
}

export default function StreamGrid({ streams, errors, loading }: Props) {
  const count = streams?.length ?? 0;
  return (
    <Section title="Now playing" subtitle={count ? `${count} active stream${count === 1 ? '' : 's'} across your servers` : 'Every active session, live'} errors={errors}>
      {loading && !streams ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[136px] animate-pulse" />
          ))}
        </div>
      ) : count === 0 ? (
        <Empty>Nothing is playing right now.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {streams!.map((s) => (
            <StreamCard key={s.id} stream={s} />
          ))}
        </div>
      )}
    </Section>
  );
}

function StreamCard({ stream }: { stream: Stream }) {
  const StateIcon = stream.state === 'paused' ? Pause : stream.state === 'buffering' ? Loader2 : Play;
  const pct = Math.round(stream.progress * 100);
  const theme = serviceTheme[stream.source];
  const rate = bandwidth(stream.bandwidthKbps);
  return (
    <article className={`card flex gap-4 border-l-2 p-3.5 ${theme?.border ?? 'border-l-transparent'}`}>
      <Poster src={stream.poster} alt={stream.title} kind={stream.type === 'episode' ? 'tv' : 'movie'} className="w-[72px] shrink-0 shadow-poster" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold leading-tight">{stream.title}</h3>
            <p className="truncate text-sm text-fog-300">{stream.subtitle}</p>
          </div>
          <StateIcon className={`mt-0.5 h-4 w-4 shrink-0 ${stream.state === 'paused' ? 'text-fog-500' : 'text-accent-400'} ${stream.state === 'buffering' ? 'animate-spin' : ''}`} fill={stream.state === 'playing' ? 'currentColor' : 'none'} />
        </div>
        <p className="mt-1 truncate text-xs text-fog-500">
          {stream.user ? `${stream.user} · ` : ''}
          {stream.player}
          {stream.device && stream.device !== stream.player ? ` (${stream.device})` : ''}
          {stream.location ? ` · ${stream.location === 'remote' ? 'Remote' : 'Local'}` : ''}
        </p>
        <div className="mt-auto pt-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-glow transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-fog-500">
            <span>
              {stream.durationMs ? remaining(stream.durationMs, stream.offsetMs) : `${pct}%`}
              {rate && <span className="ml-2 font-medium text-fog-300">{rate}</span>}
            </span>
            <span className="flex items-center gap-1.5">
              {stream.quality && <span className="chip bg-white/5 text-fog-300">{stream.quality}</span>}
              <span className={`chip ${stream.attention ? 'bg-amber-400/15 text-amber-300' : stream.transcoding ? 'bg-accent-500/15 text-accent-300' : 'bg-emerald-400/10 text-emerald-300'}`}>{stream.attention ?? playbackLabel(stream)}</span>
              <span className={`chip bg-white/5 ${theme?.text ?? 'text-fog-500'}`}>{sourceLabel[stream.source]}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
