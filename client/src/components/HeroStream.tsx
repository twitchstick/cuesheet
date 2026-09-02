import { useState } from 'react';
import { Pause } from 'lucide-react';
import { elapsed, remaining, sourceLabel } from '../lib/format';
import type { Stream } from '../types';

interface Props {
  stream: Stream | null;
  loading: boolean;
}

export default function HeroStream({ stream, loading }: Props) {
  const [artFailed, setArtFailed] = useState(false);
  if (!stream) {
    return (
      <div className="card relative flex min-h-[320px] flex-col justify-end overflow-hidden p-7 xl:min-h-[420px]">
        <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_80%_20%,rgba(124,92,255,0.25),transparent_70%)]" />
        <div className="relative">
          <span className="chip bg-white/5 text-fog-500">{loading ? 'Checking' : 'Quiet'}</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">{loading ? 'Looking for streams…' : 'Nothing playing right now'}</h2>
          <p className="mt-1 text-sm text-fog-500">The featured stream shows up here as soon as someone presses play.</p>
        </div>
      </div>
    );
  }

  const pct = Math.round(stream.progress * 100);
  const paused = stream.state === 'paused';
  const quality = [stream.quality, stream.transcoding ? 'Transcode' : 'Direct play'].filter(Boolean).join(' ');
  const art = stream.backdrop && !artFailed ? stream.backdrop : null;

  return (
    <article className="card relative flex min-h-[320px] flex-col justify-end overflow-hidden xl:min-h-[420px]">
      <div className="absolute inset-0">
        {art ? (
          <img src={art} alt="" onError={() => setArtFailed(true)} className="h-full w-full object-cover opacity-90" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(700px_360px_at_80%_25%,rgba(34,211,238,0.28),transparent_65%),radial-gradient(500px_300px_at_20%_90%,rgba(124,92,255,0.25),transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/60 to-night-900/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-night-900/80 via-night-900/20 to-transparent" />
      </div>

      <div className="relative p-6 sm:p-7">
        <span className="inline-flex items-center gap-2 rounded-full bg-live px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-lg">
          <span className={`h-1.5 w-1.5 rounded-full bg-white ${paused ? '' : 'animate-pulse'}`} />
          {paused ? 'Paused on' : 'Live on'} {sourceLabel[stream.source]}
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{stream.title}</h2>
        {stream.type === 'episode' && <p className="mt-1.5 text-base text-fog-300">{stream.subtitle}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fog-300">
          <span className="font-medium text-fog-100">{stream.user}</span>
          <span>{stream.device || stream.player}</span>
          <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-fog-100">{quality}</span>
          {paused && <Pause className="h-4 w-4 text-fog-300" fill="currentColor" />}
        </div>
        <div className="mt-5 max-w-2xl">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-glow transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-fog-300">
            <span>{elapsed(stream.offsetMs)} elapsed</span>
            <span>{stream.durationMs ? remaining(stream.durationMs, stream.offsetMs) : `${pct}%`}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
