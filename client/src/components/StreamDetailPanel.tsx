import { useEffect, useState } from 'react';
import { api } from '../api';
import DetailPanel, { PanelSection, Readout } from './DetailPanel';
import Poster from './Poster';
import { bandwidth, playbackLabel, remainingCode, serviceTheme, sourceLabel, tally, timecode } from '../lib/format';
import type { MediaDetail, Stream, TrackTech } from '../types';

interface Props {
  stream: Stream;
  onClose: () => void;
}

/**
 * Everything about one session. The stream itself is passed in live, so the
 * timecodes keep ticking while the panel is open; only the synopsis is
 * fetched, and only when the session tells us which library item it is.
 */
export default function StreamDetailPanel({ stream, onClose }: Props) {
  const [overview, setOverview] = useState<MediaDetail | null>(null);
  const theme = serviceTheme[stream.source];
  const light = tally(stream);
  const pct = Math.min(100, Math.max(0, stream.progress * 100));
  const tech = stream.tech ?? null;

  useEffect(() => {
    if (!stream.itemId) return;
    let live = true;
    api
      .details(stream.itemId)
      .then((d) => live && setOverview(d))
      // The stats are the point here; a missing synopsis is not worth an error.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [stream.itemId]);

  return (
    <DetailPanel title={sourceLabel[stream.source]} onClose={onClose}>
      <div className="flex gap-4">
        <Poster src={stream.poster} alt={stream.title} kind={stream.type === 'episode' ? 'tv' : 'movie'} className="w-24 shrink-0 shadow-poster" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight tracking-tight">{stream.title}</h2>
          {stream.subtitle && <p className="mt-1 text-sm text-fog-300">{stream.subtitle}</p>}
          <span className="mt-3 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${light.cls} ${light.pulse ? 'animate-pulse' : ''}`} />
            <span className="label !text-fog-500">{light.label}</span>
          </span>
        </div>
      </div>

      <div className="mt-5">
        <div className="relative h-[5px] w-full bg-white/[0.07]">
          <div className={`absolute inset-y-0 left-0 ${theme?.bg ?? 'bg-accent-500'}`} style={{ width: `${pct}%` }} />
          <div className="absolute inset-y-[-2px] w-[2px] bg-fog-100" style={{ left: `calc(${pct}% - 1px)` }} />
        </div>
        <div className="mt-2 flex items-baseline justify-between font-mono text-xs tabular-nums">
          <span className="text-fog-300">{timecode(stream.offsetMs)}</span>
          <span className={theme?.text ?? 'text-fog-300'}>
            {stream.durationMs ? remainingCode(stream.durationMs, stream.offsetMs) : `${Math.round(pct)}%`}
          </span>
        </div>
      </div>

      <PanelSection title="Session">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Readout label="Watching" value={stream.user} />
          <Readout label="Playback" value={stream.transcoding ? 'Transcode' : playbackLabel(stream)} />
          <Readout label="Player" value={stream.player} />
          <Readout label="Device" value={stream.device} />
          <Readout label="Bandwidth" value={bandwidth(stream.bandwidthKbps)} />
          <Readout label="Connection" value={stream.location === 'remote' ? 'Remote' : stream.location === 'local' ? 'Local' : null} />
        </dl>
      </PanelSection>

      {tech ? (
        <PanelSection title="Signal path">
          <div className="space-y-3">
            <Track label="Video" track={tech.video} extra={[tech.video.resolution, tech.video.profile, tech.video.frameRate ? `${tech.video.frameRate} fps` : null]} />
            <Track label="Audio" track={tech.audio} extra={[tech.audio.channels, tech.audio.language]} />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <Readout
              label="Container"
              value={
                tech.containerTarget && tech.containerTarget !== tech.container ? (
                  <>
                    {tech.container ?? '—'}
                    <span className="mx-1.5 text-fog-700">→</span>
                    <span className="text-tally-hold">{tech.containerTarget}</span>
                  </>
                ) : (
                  tech.container
                )
              }
            />
            <Readout label="Source bitrate" value={bandwidth(tech.fileBitrateKbps)} />
            {tech.subtitle && <Readout label="Subtitles" value={tech.subtitle} className="col-span-2" />}
            {tech.hardware != null && stream.transcoding && <Readout label="Hardware" value={tech.hardware ? 'Yes' : 'No'} />}
            {stream.transcodeSpeed != null && <Readout label="Speed" value={`${stream.transcodeSpeed.toFixed(1)}×`} />}
          </dl>

          {tech.changes.length > 0 && (
            <div className="mt-4">
              <p className="label mb-2">Why it is transcoding</p>
              <ul className="space-y-1">
                {tech.changes.map((c) => (
                  <li key={c} className="font-mono text-xs text-fog-300">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PanelSection>
      ) : (
        <PanelSection title="Signal path">
          <p className="text-sm text-fog-700">This server did not report the technical details for this session.</p>
        </PanelSection>
      )}

      {overview?.overview && (
        <PanelSection title="Synopsis">
          <p className="text-sm leading-relaxed text-fog-300">{overview.overview}</p>
        </PanelSection>
      )}
    </DetailPanel>
  );
}

/** One line of the signal path: what the file holds, and what it becomes. */
function Track({ label, track, extra }: { label: string; track: TrackTech; extra: (string | null | undefined)[] }) {
  const detail = extra.filter(Boolean).join(' · ');
  const transcoding = track.decision === 'Transcode';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-sm">
          <span>{track.codec ?? '—'}</span>
          {track.target && track.target !== track.codec && (
            <>
              <span className="mx-1.5 text-fog-700">→</span>
              <span className="text-tally-hold">{track.target}</span>
            </>
          )}
        </p>
        {detail && <p className="mt-0.5 truncate font-mono text-[11px] text-fog-500">{detail}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="label">{label}</p>
        <p className={`mt-0.5 font-mono text-[11px] ${transcoding ? 'text-tally-hold' : 'text-fog-500'}`}>{track.decision ?? '—'}</p>
      </div>
    </div>
  );
}
