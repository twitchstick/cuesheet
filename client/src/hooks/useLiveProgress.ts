import { useEffect, useState } from 'react';
import { timeLeftMs } from '../lib/format';
import type { LifecycleItem } from '../types';

/**
 * item.progress, projected forward in real time using Radarr/Sonarr's own
 * timeleft estimate as a constant rate -- so a downloading/importing trace
 * visibly creeps forward between polls instead of sitting frozen until the
 * next one lands. Ticks once a second; every fresh poll resets progress and
 * timeleft from the server, which quietly corrects any drift. Capped just
 * short of 100% -- only a real poll confirming completion gets to say "done."
 */
export function useLiveProgress(item: LifecycleItem, updatedAt: number | null): number | null {
  const live = (item.stage === 'downloading' || item.stage === 'importing') && item.progress != null;
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
