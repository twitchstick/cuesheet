import { AlertTriangle, ArrowRight } from 'lucide-react';
import Avatar from './Avatar';
import { playbackLabel } from '../lib/format';
import type { Stream } from '../types';

interface Props {
  streams: Stream[];
  featuredId: string | null;
  sources: ('plex' | 'jellyfin')[];
  onViewAll: () => void;
}

export default function StreamsPanel({ streams, featuredId, sources, onViewAll }: Props) {
  const count = (fn: (s: Stream) => boolean) => streams.filter(fn).length;
  const tiles: [string, number][] = [
    ...sources.map((src): [string, number] => [src === 'plex' ? 'Plex' : 'Jellyfin', count((s) => s.source === src)]),
    ['Direct play', count((s) => !s.transcoding)],
    ['Transcoding', count((s) => s.transcoding)],
  ];
  const attention = streams.filter((s) => s.attention);
  const list = [...attention, ...streams.filter((s) => !s.attention && s.id !== featuredId)].slice(0, 4);

  return (
    <aside className="card flex flex-col p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-bold tracking-tight">Active streams</h2>
        <span className="text-xs text-fog-500">{streams.length} total</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map(([label, n]) => (
          <div key={label} className="tile">
            <p className="text-2xl font-bold leading-tight">{n}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-fog-500">{label}</p>
          </div>
        ))}
      </div>

      {attention.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">
              {attention.length} session{attention.length === 1 ? '' : 's'}
            </strong>{' '}
            may need attention
          </span>
        </div>
      )}

      <ul className="mt-3 flex flex-col divide-y divide-line">
        {list.length === 0 && <li className="py-3 text-sm text-fog-500">{streams.length ? 'Everything else is running smoothly.' : 'No active sessions.'}</li>}
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={s.user} className="h-8 w-8 text-xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {s.title}
                {s.type === 'episode' && <span className="ml-1 font-medium text-fog-300">{s.subtitle.split(' · ')[0]}</span>}
              </p>
              <p className="truncate text-xs text-fog-500">
                {s.you ? 'You' : s.location === 'remote' ? 'Remote' : s.location === 'local' ? 'Local' : (s.user ?? s.player)} · {playbackLabel(s)}
              </p>
            </div>
            {s.attention ? (
              <span className={`chip ${s.attention === 'Buffering' ? 'bg-live/15 text-live' : 'bg-amber-400/15 text-amber-300'}`}>{s.attention}</span>
            ) : s.state === 'paused' ? (
              <span className="chip bg-white/5 text-fog-500">Paused</span>
            ) : null}
          </li>
        ))}
      </ul>

      <button type="button" className="btn-ghost mt-auto w-full" onClick={onViewAll}>
        View all {streams.length} stream{streams.length === 1 ? '' : 's'}
        <ArrowRight className="h-4 w-4" />
      </button>
    </aside>
  );
}
