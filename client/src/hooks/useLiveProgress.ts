import { useEffect, useState } from 'react';
import { timeLeftMs } from '../lib/format';
import type { DownloadStatus, LifecycleItem } from '../types';

// Radarr/Sonarr's own timeleft estimate is only a live countdown while
// something is actually moving -- downloading/importing (downloadStatus's
// default) or 'importing' itself. Everything else that still parks at the
// 'downloading' trace stage (a paused, queued, stalled, warning, or failed
// row -- see lifecycle.js) is exactly the opposite of moving, and
// projecting the old rate forward through one of those would visibly creep
// a paused or failed download toward 99% until the next real poll corrects it.
const NOT_ACTUALLY_MOVING: ReadonlySet<DownloadStatus> = new Set(['paused', 'queued', 'stalled', 'warning', 'failed']);

/**
 * item.progress, projected forward in real time using Radarr/Sonarr's own
 * timeleft estimate as a constant rate -- so a downloading/importing trace
 * visibly creeps forward between polls instead of sitting frozen until the
 * next one lands. Ticks once a second; every fresh poll resets progress and
 * timeleft from the server, which quietly corrects any drift. Capped just
 * short of 100% -- only a real poll confirming completion gets to say "done."
 */
export function useLiveProgress(item: LifecycleItem, updatedAt: number | null): number | null {
  const live =
    (item.stage === 'downloading' || item.stage === 'importing') &&
    item.progress != null &&
    !(item.downloadStatus && NOT_ACTUALLY_MOVING.has(item.downloadStatus));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  if (!live || item.progress == null) return item.progress;
  if (!updatedAt) return item.progress;

  const remainMs = timeLeftMs(item.timeleft);
  const remainFrac = Math.max(0, 1 - item.progress);
  if (!remainMs || remainMs <= 0 || remainFrac <= 0) return item.progress;

  const rate = remainFrac / remainMs; // progress-fraction per ms, at the moment this snapshot arrived
  const elapsed = Math.max(0, now - updatedAt);
  return Math.min(item.progress + rate * elapsed, 0.99);
}
