import { AlertTriangle } from 'lucide-react';
import Poster from './Poster';
import { timeAgo, timeLeftLabel } from '../lib/format';
import { useLiveProgress } from '../hooks/useLiveProgress';
import type { DownloadStatus, LifecycleItem, LifecycleStage } from '../types';

const STAGES: { key: LifecycleStage; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'monitored', label: 'Monitored' },
  { key: 'downloading', label: 'Downloading' },
  { key: 'importing', label: 'Importing' },
  { key: 'available', label: 'Available' },
];

// Tailwind's palette as plain values -- these positions/colors are computed
// per item, so they're set via inline style rather than a static class name.
const COLOR_LINE = '#212636';
const COLOR_GLOW = '#22d3ee';
const COLOR_ACCENT_300 = '#b3a2ff';
const trackBackground = { backgroundImage: `linear-gradient(to right, ${COLOR_LINE} 0 6px, transparent 6px 12px)`, backgroundSize: '12px 2px' };
// Smooths each second's tick into visible motion instead of a jump -- the
// same rate the live-progress hook advances at.
const LIVE_TRANSITION = 'width 1000ms linear, left 1000ms linear';

const PROBLEM_STATUS = new Set<DownloadStatus>(['failed', 'stalled', 'warning']);
// A download's own status wins over the generic stage color/label whenever
// it says something the 5-stage arc alone can't -- stuck, paused, dead.
const STATUS_COLOR: Partial<Record<DownloadStatus, string>> = {
  failed: '#ff3b52',
  stalled: '#f5a524',
  warning: '#f5a524',
  paused: '#5d6478',
  queued: '#5d6478',
};
const STATUS_LABEL: Partial<Record<DownloadStatus, string>> = {
  failed: 'Failed',
  stalled: 'Stalled',
  warning: 'Warning',
  paused: 'Paused',
  queued: 'Queued',
};

const stageIndex = (item: LifecycleItem) => STAGES.findIndex((s) => s.key === item.stage);
const isSettled = (item: LifecycleItem) => item.stage === 'available';
/** Whether the head should read as "alive" -- pulsing, moving -- rather than stalled in place. */
const isMoving = (item: LifecycleItem) => !item.downloadStatus || item.downloadStatus === 'downloading' || item.downloadStatus === 'importing';

function statusColor(item: LifecycleItem): string {
  if (item.downloadStatus && STATUS_COLOR[item.downloadStatus]) return STATUS_COLOR[item.downloadStatus]!;
  return isSettled(item) ? COLOR_ACCENT_300 : COLOR_GLOW;
}

function statusLabel(item: LifecycleItem): string {
  if (item.downloadStatus && STATUS_LABEL[item.downloadStatus]) return STATUS_LABEL[item.downloadStatus]!;
  return STAGES[stageIndex(item)]?.label ?? item.stage;
}

/** Where the head sits along the trace, 0-100. Takes the live-interpolated progress, not the raw snapshot. */
function headPosition(item: LifecycleItem, liveProgress: number | null): number {
  const idx = stageIndex(item);
  if (idx <= 0) return 2; // just requested -- the signal has barely left
  if (isSettled(item)) return 100;
  if ((item.stage === 'downloading' || item.stage === 'importing') && liveProgress != null) {
    return idx * 25 + Math.max(0, Math.min(1, liveProgress)) * 25;
  }
  return idx * 25;
}

function stageSub(item: LifecycleItem, liveProgress: number | null): string {
  if (isSettled(item)) return item.createdAt ? `Landed ${timeAgo(item.createdAt)}` : 'Available';
  // A dead indexer or a rejected sample says more than a percentage would.
  if (item.downloadStatus && PROBLEM_STATUS.has(item.downloadStatus)) return item.statusDetail ?? statusLabel(item);
  if ((item.stage === 'downloading' || item.stage === 'importing') && liveProgress != null) {
    const pct = Math.round(liveProgress * 100);
    const left = timeLeftLabel(item.timeleft);
    return left ? `${pct}% · ${left}` : `${pct}%`;
  }
  // No request behind this one -- straight from Radarr/Sonarr, nothing to attribute it to.
  if (!item.createdAt) return item.subtitle ?? '';
  return `${item.requestedBy} · ${timeAgo(item.createdAt)}`;
}

interface TraceProps {
  item: LifecycleItem;
  updatedAt?: number | null;
  onSelect?: (item: LifecycleItem) => void;
}

/** The full card: one title's request-to-library thread, as a lit signal path. */
export default function SignalTrace({ item, updatedAt, onSelect }: TraceProps) {
  const idx = stageIndex(item);
  const settled = isSettled(item);
  const moving = isMoving(item);
  const liveProgress = useLiveProgress(item, updatedAt ?? null);
  const pos = headPosition(item, liveProgress);
  const color = statusColor(item);

  return (
    <article
      className={`card p-4 sm:p-5 ${onSelect ? 'cursor-pointer text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035]' : ''}`}
      onClick={onSelect ? () => onSelect(item) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item);
              }
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `${item.title} — details` : undefined}
    >
      <div className="mb-5 flex items-start gap-3.5">
        <Poster src={item.poster} alt={item.title} kind={item.mediaType} className="w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold tracking-tight sm:text-[19px]">{item.title}</h3>
          <p className="truncate text-[13px] text-fog-500 sm:text-sm">
            {item.subtitle || `${item.mediaType === 'tv' ? 'Series' : 'Movie'}${item.year ? ` · ${item.year}` : ''}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="font-mono text-xs font-semibold uppercase tracking-[0.06em] sm:text-sm"
            style={{ color, textShadow: `0 0 12px ${color}` }}
          >
            {statusLabel(item)}
          </div>
          <p className="mt-1 max-w-[10rem] truncate text-xs text-fog-500 sm:max-w-[14rem] sm:text-[13px]" title={stageSub(item, liveProgress)}>
            {stageSub(item, liveProgress)}
          </p>
        </div>
      </div>

      {item.stallReason && (
        // Not a fact about this title -- the best account Cuesheet has for
        // why "monitored" isn't moving is whichever problem Radarr/Sonarr is
        // reporting about itself right now. Same icon/tone Section uses for
        // "service unreachable," since this is the same kind of note.
        <p className="mb-4 flex items-start gap-1.5 text-xs text-amber-300/90">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{item.stallReason}</span>
        </p>
      )}

      <div className="relative mx-1 h-3">
        <div className="absolute left-0 right-0 top-[6px] h-[2px]" style={trackBackground} />
        <div
          className="absolute top-[6px] h-[2px] bg-gradient-to-r from-accent-500 to-accent-400"
          style={{ width: `${pos}%`, boxShadow: `0 0 10px 0 rgba(124,92,255,${settled ? 0.35 : 0.55})`, transition: LIVE_TRANSITION }}
        />
        {!settled && (
          <span
            className={`absolute top-px h-2.5 w-2.5 -translate-x-1/2 rounded-full ${moving ? 'animate-pulse' : ''}`}
            style={{ left: `${pos}%`, background: color, boxShadow: `0 0 0 3px ${color}2e, 0 0 14px 2px ${color}b3`, transition: LIVE_TRANSITION }}
          />
        )}
        {STAGES.map((s, i) => {
          const state = settled ? 'done' : i < idx ? 'done' : i === idx ? 'now' : 'future';
          return (
            <span
              key={s.key}
              className={`absolute top-[3px] h-2 w-2 -translate-x-1/2 rounded-full border-2 ${
                state === 'done' ? 'border-accent-400 bg-accent-500' : state === 'now' ? '' : 'border-night-600 bg-night-800'
              }`}
              style={{
                left: `${(i / (STAGES.length - 1)) * 100}%`,
                boxShadow: state === 'done' ? '0 0 7px 1px rgba(124,92,255,0.55)' : undefined,
                ...(state === 'now' ? { borderColor: color, background: '#090b12' } : undefined),
              }}
            />
          );
        })}
      </div>

      <div className="relative mx-1 mt-3 h-9">
        {STAGES.map((s, i) => {
          const state = settled ? 'done' : i < idx ? 'done' : i === idx ? 'now' : 'future';
          const align = i === 0 ? 'text-left' : i === STAGES.length - 1 ? 'text-right' : 'text-center';
          const translate = i === 0 ? 'translate-x-0' : i === STAGES.length - 1 ? '-translate-x-full' : '-translate-x-1/2';
          return (
            <div
              key={s.key}
              className={`absolute top-0 whitespace-nowrap ${align} ${translate}`}
              style={{ left: `${(i / (STAGES.length - 1)) * 100}%` }}
            >
              <span
                // The three middle waypoints crowd into overlapping text on a
                // phone-width trace; the endpoints always fit, and whichever
                // stage is current is already spelled out, glowing, in the
                // header above -- so only they need to survive down to 390px.
                className={`label !text-[13px] !tracking-[0.06em] ${i !== 0 && i !== STAGES.length - 1 ? 'hidden sm:block' : ''} ${
                  state === 'done' ? '!text-fog-300' : ''
                }`}
                style={state === 'now' ? { color, textShadow: '0 0 10px currentColor' } : undefined}
              >
                {s.label}
              </span>
              {i === 0 && item.createdAt > 0 && (
                <span className="mt-0.5 block text-xs text-fog-700">
                  {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

/** One dense row -- the same trace folded flat, for a list you're scanning rather than reading. */
export function CompactSignalTrace({ item, updatedAt, onSelect }: TraceProps) {
  const idx = stageIndex(item);
  const settled = isSettled(item);
  const moving = isMoving(item);
  const liveProgress = useLiveProgress(item, updatedAt ?? null);
  const pos = headPosition(item, liveProgress);
  const color = statusColor(item);
  const readout = settled ? 'Available' : liveProgress != null ? `${Math.round(liveProgress * 100)}%` : statusLabel(item);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${onSelect ? 'cursor-pointer text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035]' : ''}`}
      onClick={onSelect ? () => onSelect(item) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item);
              }
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `${item.title} — details` : undefined}
    >
      <Poster src={item.poster} alt={item.title} kind={item.mediaType} className="w-8 shrink-0 !rounded-md" />
      <div className="w-28 min-w-0 shrink-0 sm:w-36">
        <p className="truncate text-sm font-semibold leading-tight">{item.title}</p>
        <p className="truncate text-xs text-fog-500">{item.subtitle || (item.mediaType === 'tv' ? 'Series' : 'Movie')}</p>
      </div>
      <div className="relative h-2 min-w-[80px] flex-1">
        <div className="absolute left-0 right-0 top-[3px] h-[2px]" style={trackBackground} />
        <div
          className="absolute top-[3px] h-[2px] bg-gradient-to-r from-accent-500 to-accent-400"
          style={{ width: `${pos}%`, boxShadow: `0 0 8px 0 rgba(124,92,255,${settled ? 0.3 : 0.5})`, transition: LIVE_TRANSITION }}
        />
        {!settled && (
          <span
            className={`absolute -top-[2px] h-2.5 w-2.5 -translate-x-1/2 rounded-full ${moving ? 'animate-pulse' : ''}`}
            style={{ left: `${pos}%`, background: color, boxShadow: `0 0 0 3px ${color}2e, 0 0 12px 2px ${color}b3`, transition: LIVE_TRANSITION }}
          />
        )}
        {STAGES.map((s, i) => {
          const state = settled ? 'done' : i < idx ? 'done' : i === idx ? 'now' : 'future';
          return (
            <span
              key={s.key}
              className={`absolute -top-[1px] h-1.5 w-1.5 -translate-x-1/2 rounded-full border ${
                state === 'done' ? 'border-accent-400 bg-accent-500' : state === 'now' ? '' : 'border-night-600 bg-night-800'
              }`}
              style={{ left: `${(i / (STAGES.length - 1)) * 100}%`, ...(state === 'now' ? { borderColor: color, background: '#090b12' } : undefined) }}
            />
          );
        })}
      </div>
      {item.stallReason && (
        <span title={item.stallReason} className="shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-300/90" aria-label={`Why: ${item.stallReason}`} />
        </span>
      )}
      <span
        className="w-[92px] shrink-0 text-right font-mono text-xs font-semibold uppercase tracking-[0.06em]"
        style={{ color, textShadow: `0 0 10px ${color}` }}
      >
        {readout}
      </span>
    </div>
  );
}
